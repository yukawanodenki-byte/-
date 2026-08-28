require('dotenv').config();
const express = require('express');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const bcrypt = require('bcryptjs');
const path = require('path');
const { pool, initSchema } = require('./db');

const app = express();
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use('/public', express.static(path.join(__dirname, 'public')));

app.set('trust proxy', 1); // Render はリバースプロキシ配下で動く

app.use(
  session({
    store: new pgSession({ pool, tableName: 'session', createTableIfMissing: true }),
    secret: process.env.SESSION_SECRET || 'dev-secret-please-change',
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30日
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
    },
  })
);

// ---- auth helpers ----
function requireAuth(req, res, next) {
  if (!req.session.userId) return res.redirect('/login');
  next();
}

app.use(async (req, res, next) => {
  res.locals.currentUser = null;
  if (req.session.userId) {
    const { rows } = await pool.query('SELECT id, username, display_name FROM users WHERE id = $1', [req.session.userId]);
    res.locals.currentUser = rows[0] || null;
  }
  next();
});

async function logActivity(projectId, userId, action, detail) {
  await pool.query(
    'INSERT INTO activity_log (project_id, user_id, action, detail) VALUES ($1, $2, $3, $4)',
    [projectId, userId, action, detail || null]
  );
}

// ---- login / logout ----
app.get('/login', (req, res) => {
  if (req.session.userId) return res.redirect('/');
  res.render('login', { error: null });
});

app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  const { rows } = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
  const user = rows[0];
  if (!user) return res.render('login', { error: 'ユーザー名またはパスワードが違います' });
  const ok = await bcrypt.compare(password || '', user.password_hash);
  if (!ok) return res.render('login', { error: 'ユーザー名またはパスワードが違います' });
  req.session.userId = user.id;
  res.redirect('/');
});

app.post('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/login'));
});

// ---- users (teammates) ----
app.get('/users', requireAuth, async (req, res) => {
  const { rows: users } = await pool.query('SELECT id, username, display_name, created_at FROM users ORDER BY id');
  res.render('users', { users, error: null });
});

app.post('/users', requireAuth, async (req, res) => {
  const { username, display_name, password } = req.body;
  try {
    const hash = await bcrypt.hash(password || Math.random().toString(36).slice(2), 10);
    await pool.query(
      'INSERT INTO users (username, display_name, password_hash) VALUES ($1, $2, $3)',
      [username, display_name || username, hash]
    );
    res.redirect('/users');
  } catch (e) {
    const { rows: users } = await pool.query('SELECT id, username, display_name, created_at FROM users ORDER BY id');
    res.render('users', { users, error: 'ユーザー名が重複しているか、入力に誤りがあります。' });
  }
});

// ---- dashboard ----
async function computeProjectSummaries() {
  const { rows: projects } = await pool.query(
    'SELECT * FROM projects WHERE archived = false ORDER BY created_at DESC'
  );
  const { rows: categories } = await pool.query('SELECT * FROM checklist_categories ORDER BY sort_order');
  const { rows: items } = await pool.query('SELECT * FROM checklist_items ORDER BY category_id, sort_order');
  const { rows: statuses } = await pool.query('SELECT * FROM checklist_status');
  const { rows: docs } = await pool.query('SELECT * FROM required_documents');
  const { rows: techs } = await pool.query('SELECT * FROM project_technicians');

  const statusByProject = {};
  for (const s of statuses) {
    (statusByProject[s.project_id] ||= {})[s.item_id] = s.checked;
  }
  const docsByProject = {};
  for (const d of docs) {
    (docsByProject[d.project_id] ||= {})[d.doc_key] = d.obtained;
  }
  const techsByProject = {};
  for (const t of techs) {
    (techsByProject[t.project_id] ||= []).push(t);
  }

  // 重複配置の検出（同一氏名・期間重複）
  const overlapProjectIds = new Set();
  const validTechs = techs.filter(
    (t) => t.person_name && !['×', '-', 'ー', ''].includes(t.person_name.trim()) && t.start_date && t.end_date
  );
  for (let i = 0; i < validTechs.length; i++) {
    for (let j = i + 1; j < validTechs.length; j++) {
      const a = validTechs[i];
      const b = validTechs[j];
      if (a.project_id === b.project_id) continue;
      if (a.person_name.trim() !== b.person_name.trim()) continue;
      const overlap = a.start_date <= b.end_date && b.start_date <= a.end_date;
      if (overlap) {
        const severity = a.exclusive || b.exclusive ? 'red' : 'blue';
        overlapProjectIds.add(a.project_id + ':' + severity);
        overlapProjectIds.add(b.project_id + ':' + severity);
      }
    }
  }

  const summaries = projects.map((p) => {
    const checked = statusByProject[p.id] || {};
    const totalItems = items.length;
    const doneItems = items.filter((it) => checked[it.id]).length;

    let currentCategory = categories[categories.length - 1];
    for (const cat of categories) {
      const catItems = items.filter((it) => it.category_id === cat.id);
      const allDone = catItems.every((it) => checked[it.id]);
      if (!allDone) {
        currentCategory = cat;
        break;
      }
    }

    const docStatus = docsByProject[p.id] || {};
    const docDoneCount = REQUIRED_DOC_KEYS.filter((k) => docStatus[k]).length;

    let overlapBadge = null;
    if (overlapProjectIds.has(p.id + ':red')) overlapBadge = 'red';
    else if (overlapProjectIds.has(p.id + ':blue')) overlapBadge = 'blue';

    return {
      project: p,
      progress: totalItems ? Math.round((doneItems / totalItems) * 100) : 0,
      doneItems,
      totalItems,
      currentStage: currentCategory ? currentCategory.name : '-',
      docDoneCount,
      docTotalCount: REQUIRED_DOC_KEYS.length,
      technicians: techsByProject[p.id] || [],
      overlapBadge,
    };
  });

  return { summaries, categories, items };
}

const REQUIRED_DOC_KEYS = ['koukoku', 'setsumei', 'shiyousho', 'mitsumori', 'keiyakusho', 'uchiwakesho'];
const REQUIRED_DOC_LABELS = {
  koukoku: '入札公告',
  setsumei: '入札説明書',
  shiyousho: '仕様書・設計図面',
  mitsumori: '見積参考資料',
  keiyakusho: '契約書',
  uchiwakesho: '工事費内訳書',
};

app.get('/', requireAuth, async (req, res) => {
  const { summaries } = await computeProjectSummaries();
  res.render('dashboard', { summaries });
});

app.get('/timeline', requireAuth, async (req, res) => {
  const { rows: projects } = await pool.query('SELECT * FROM projects WHERE archived = false ORDER BY id');
  const { rows: techs } = await pool.query(
    `SELECT t.*, p.name AS project_name FROM project_technicians t
     JOIN projects p ON p.id = t.project_id
     WHERE t.start_date IS NOT NULL AND t.end_date IS NOT NULL
     ORDER BY t.start_date`
  );
  res.render('timeline', { projects, techs });
});

// ---- project create / import ----
app.get('/projects/new', requireAuth, (req, res) => {
  res.render('project_new', { error: null });
});

app.post('/projects', requireAuth, async (req, res) => {
  const { name, agency, contract_amount, period_text } = req.body;
  if (!name || !name.trim()) return res.render('project_new', { error: '案件名は必須です。' });
  const { rows } = await pool.query(
    'INSERT INTO projects (name, agency, contract_amount, period_text, updated_by) VALUES ($1,$2,$3,$4,$5) RETURNING id',
    [name.trim(), agency || null, contract_amount || null, period_text || null, req.session.userId]
  );
  const projectId = rows[0].id;
  for (const key of REQUIRED_DOC_KEYS) {
    await pool.query('INSERT INTO required_documents (project_id, doc_key) VALUES ($1,$2)', [projectId, key]);
  }
  for (const role of ['監理技術者', '主任技術者', '現場代理人']) {
    await pool.query('INSERT INTO project_technicians (project_id, role) VALUES ($1,$2)', [projectId, role]);
  }
  await logActivity(projectId, req.session.userId, 'create', `案件「${name}」を作成`);
  res.redirect('/projects/' + projectId);
});

// 貼り付けインポート: 「案件名: 〇〇」形式の行テキストから複数案件を一括作成
app.get('/import', requireAuth, (req, res) => {
  res.render('import', { error: null, result: null });
});

app.post('/import', requireAuth, async (req, res) => {
  const text = req.body.text || '';
  const blocks = text.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  const created = [];
  for (const block of blocks) {
    const fields = {};
    for (const line of block.split('\n')) {
      const m = line.match(/^\s*([^:：]+)[:：]\s*(.+)$/);
      if (m) fields[m[1].trim()] = m[2].trim();
    }
    const name = fields['案件名'];
    if (!name) continue;
    const { rows } = await pool.query(
      'INSERT INTO projects (name, agency, contract_amount, period_text, updated_by) VALUES ($1,$2,$3,$4,$5) RETURNING id',
      [name, fields['発注機関'] || null, fields['契約金額'] || null, fields['工期'] || null, req.session.userId]
    );
    const projectId = rows[0].id;
    for (const key of REQUIRED_DOC_KEYS) {
      await pool.query('INSERT INTO required_documents (project_id, doc_key) VALUES ($1,$2)', [projectId, key]);
    }
    for (const role of ['監理技術者', '主任技術者', '現場代理人']) {
      await pool.query('INSERT INTO project_technicians (project_id, role) VALUES ($1,$2)', [projectId, role]);
    }
    await logActivity(projectId, req.session.userId, 'import', `貼り付けインポートで「${name}」を作成`);
    created.push(name);
  }
  res.render('import', { error: null, result: created });
});

// ---- project detail ----
app.get('/projects/:id', requireAuth, async (req, res) => {
  const projectId = Number(req.params.id);
  const { rows: projRows } = await pool.query('SELECT * FROM projects WHERE id = $1', [projectId]);
  const project = projRows[0];
  if (!project) return res.status(404).send('案件が見つかりません');

  const { rows: categories } = await pool.query('SELECT * FROM checklist_categories ORDER BY sort_order');
  const { rows: items } = await pool.query('SELECT * FROM checklist_items ORDER BY category_id, sort_order');
  const { rows: statuses } = await pool.query('SELECT * FROM checklist_status WHERE project_id = $1', [projectId]);
  const { rows: docs } = await pool.query('SELECT * FROM required_documents WHERE project_id = $1', [projectId]);
  const { rows: techs } = await pool.query('SELECT * FROM project_technicians WHERE project_id = $1', [projectId]);
  const { rows: activity } = await pool.query(
    `SELECT a.*, u.display_name FROM activity_log a LEFT JOIN users u ON u.id = a.user_id
     WHERE a.project_id = $1 ORDER BY a.created_at DESC LIMIT 20`,
    [projectId]
  );

  const checkedMap = {};
  for (const s of statuses) checkedMap[s.item_id] = s.checked;
  const docsMap = {};
  for (const d of docs) docsMap[d.doc_key] = d.obtained;
  const techMap = {};
  for (const t of techs) techMap[t.role] = t;

  const itemsByCategory = categories.map((cat) => ({
    category: cat,
    items: items.filter((it) => it.category_id === cat.id),
  }));

  res.render('project', {
    project,
    itemsByCategory,
    checkedMap,
    docsMap,
    techMap,
    activity,
    REQUIRED_DOC_KEYS,
    REQUIRED_DOC_LABELS,
  });
});

app.post('/projects/:id/info', requireAuth, async (req, res) => {
  const projectId = Number(req.params.id);
  const { name, agency, contract_amount, period_text } = req.body;
  await pool.query(
    'UPDATE projects SET name=$1, agency=$2, contract_amount=$3, period_text=$4, updated_at=now(), updated_by=$5 WHERE id=$6',
    [name, agency, contract_amount, period_text, req.session.userId, projectId]
  );
  await logActivity(projectId, req.session.userId, 'update_info', '基本情報を更新');
  res.redirect('/projects/' + projectId);
});

app.post('/projects/:id/archive', requireAuth, async (req, res) => {
  const projectId = Number(req.params.id);
  await pool.query('UPDATE projects SET archived = true WHERE id = $1', [projectId]);
  await logActivity(projectId, req.session.userId, 'archive', '案件をアーカイブ');
  res.redirect('/');
});

// ---- ajax: checklist item toggle ----
app.post('/api/projects/:id/items/:itemId/toggle', requireAuth, async (req, res) => {
  const projectId = Number(req.params.id);
  const itemId = Number(req.params.itemId);
  const { checked } = req.body;
  await pool.query(
    `INSERT INTO checklist_status (project_id, item_id, checked, updated_by, updated_at)
     VALUES ($1,$2,$3,$4, now())
     ON CONFLICT (project_id, item_id) DO UPDATE SET checked = $3, updated_by = $4, updated_at = now()`,
    [projectId, itemId, !!checked, req.session.userId]
  );
  res.json({ ok: true });
});

// ---- ajax: required document toggle ----
app.post('/api/projects/:id/documents/:docKey/toggle', requireAuth, async (req, res) => {
  const projectId = Number(req.params.id);
  const docKey = req.params.docKey;
  const { obtained } = req.body;
  await pool.query(
    `INSERT INTO required_documents (project_id, doc_key, obtained, updated_by, updated_at)
     VALUES ($1,$2,$3,$4, now())
     ON CONFLICT (project_id, doc_key) DO UPDATE SET obtained = $3, updated_by = $4, updated_at = now()`,
    [projectId, docKey, !!obtained, req.session.userId]
  );
  res.json({ ok: true });
});

// ---- ajax: technician update ----
app.post('/api/projects/:id/technicians/:role', requireAuth, async (req, res) => {
  const projectId = Number(req.params.id);
  const role = decodeURIComponent(req.params.role);
  const { person_name, exclusive, start_date, end_date } = req.body;
  await pool.query(
    `INSERT INTO project_technicians (project_id, role, person_name, exclusive, start_date, end_date, updated_by, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7, now())
     ON CONFLICT (project_id, role) DO UPDATE SET
       person_name=$3, exclusive=$4, start_date=$5, end_date=$6, updated_by=$7, updated_at=now()`,
    [projectId, role, person_name || null, exclusive === 'true' || exclusive === true, start_date || null, end_date || null, req.session.userId]
  );
  await logActivity(projectId, req.session.userId, 'update_technician', `${role}を更新（${person_name || '未設定'}）`);
  res.json({ ok: true });
});

const PORT = process.env.PORT || 3000;

async function start() {
  await initSchema();
  app.listen(PORT, () => console.log(`koji-checklist listening on :${PORT}`));
}

start().catch((e) => {
  console.error('起動に失敗しました', e);
  process.exit(1);
});
