require('dotenv').config();
const express = require('express');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const bcrypt = require('bcryptjs');
const path = require('path');
const { pool, initSchema } = require('./index');

const app = express();
app.set('view engine', 'ejs');
app.set('views', __dirname);
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
// リポジトリ構成がフラット（サブフォルダなし）のため、公開する静的ファイルだけを明示的に配信する
app.get('/public/app.js', (req, res) => res.sendFile(path.join(__dirname, 'app.js')));
app.get('/public/style.css', (req, res) => res.sendFile(path.join(__dirname, 'style.css')));

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

async function getUsersList() {
  const { rows } = await pool.query('SELECT id, username, display_name FROM users ORDER BY display_name');
  return rows;
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

// ---- 必須書類（6種類固定） ----
const REQUIRED_DOC_KEYS = ['koukoku', 'setsumei', 'shiyousho', 'mitsumori', 'keiyakusho', 'uchiwakesho'];
const REQUIRED_DOC_LABELS = {
  koukoku: '入札公告',
  setsumei: '入札説明書',
  shiyousho: '仕様書・設計図面',
  mitsumori: '見積参考資料',
  keiyakusho: '契約書',
  uchiwakesho: '工事費内訳書',
};
// 素人が見てもどんな書類かわかるよう、各書類の概要を平易な言葉で記載
const REQUIRED_DOC_DESCRIPTIONS = {
  koukoku: '発注機関が入札を公告したときの書類です。対象工事の内容や入札条件が書かれています。落札後の確認用に保管します。',
  setsumei: '入札の参加資格や、入札の手続き・提出書類などを説明した書類です。',
  shiyousho: '工事の仕様（使う材料・工法など）や設計図面をまとめた書類です。施工内容の根拠になります。',
  mitsumori: '見積を作成するときに参考にした資料（数量調書や参考図面など）です。',
  keiyakusho: '発注機関と締結した、この工事の請負契約書そのものです。',
  uchiwakesho: '契約金額の内訳（材料費・労務費・諸経費など）を示す書類です。',
};

// ステータス5段階：未着手／作成中／提出済み／修正中／対象外（提出不要）
const STATUS_VALUES = ['not_started', 'in_progress', 'submitted', 'revising', 'not_applicable'];
const STATUS_LABELS = {
  not_started: '未着手',
  in_progress: '作成中',
  submitted: '提出済み',
  revising: '修正中',
  not_applicable: '対象外',
};
function normalizeStatus(v) {
  return STATUS_VALUES.includes(v) ? v : 'not_started';
}

// ---- 提出期限アラート ----
// 「2週間前は緑色、1週間前から赤色」という要望に沿い、期限までの残日数で判定する。
// 残り14日以内になったら緑、残り7日未満（=1週間を切った、または期限超過）になったら赤。
// 15日以上先、期限日未設定、提出済み／対象外の項目にはアラートを出さない。
function computeDueAlert(dueDate, status) {
  if (!dueDate) return { level: 'none', daysRemaining: null };
  if (status === 'submitted' || status === 'not_applicable') return { level: 'none', daysRemaining: null };
  const due = new Date(dueDate);
  const now = new Date();
  const dueUTC = Date.UTC(due.getUTCFullYear(), due.getUTCMonth(), due.getUTCDate());
  const todayUTC = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const daysRemaining = Math.round((dueUTC - todayUTC) / 86400000);
  let level = 'none';
  if (daysRemaining < 7) level = 'red';
  else if (daysRemaining <= 14) level = 'green';
  return { level, daysRemaining };
}

// ---- 発注機関のグループ分け（過去実績の検索用） ----
// 発注機関によって書類の雛形が変わるため、「同系統の発注機関」で過去の提出実績を探せるようにする。
// 発注機関名だけでなく施設名（刑務所・矯正研修所など）からも推定できるよう、キーワードを幅広く登録している。
const AGENCY_GROUPS = [
  { key: '法務省', keywords: ['法務省', '刑務所', '拘置所', '少年院', '矯正', '検察庁', '法務局', '入国管理', '出入国在留管理'] },
  { key: '国土交通省', keywords: ['国土交通省', '地方整備局', '運輸局', '港湾', '空港', '気象庁', '国道事務所', '河川事務所'] },
  { key: '防衛省', keywords: ['防衛省', '自衛隊', '防衛局', '駐屯地', '基地'] },
  { key: '財務省', keywords: ['財務省', '税関', '国税庁', '税務署', '財務局'] },
  { key: '厚生労働省', keywords: ['厚生労働省', '労働局', '労働基準監督署', 'ハローワーク', '国立病院'] },
  { key: '文部科学省', keywords: ['文部科学省', '国立大学', '高等専門学校', '教育局'] },
  { key: '農林水産省', keywords: ['農林水産省', '森林管理', '農政局'] },
  { key: '経済産業省', keywords: ['経済産業省', '産業保安監督部', '特許庁'] },
  { key: '環境省', keywords: ['環境省', '地方環境事務所'] },
  { key: '総務省', keywords: ['総務省', '消防庁'] },
  { key: '内閣府', keywords: ['内閣府'] },
  { key: '警察庁', keywords: ['警察庁', '警視庁', '警察署'] },
  { key: '合同庁舎', keywords: ['合同庁舎'] },
];
function agencyGroup(text) {
  if (!text) return null;
  for (const g of AGENCY_GROUPS) {
    if (g.keywords.some((kw) => text.includes(kw))) return g.key;
  }
  return null;
}

// 同系統の発注機関に絞って、過去の案件で「提出済み」になった書類・チェックリスト項目を集める。
// item_id / doc_key ごとに、どの案件で・誰が・いつ提出したかの一覧を返す。
async function computePrecedents(currentProjectId, groupKey) {
  if (!groupKey) return { itemMap: {}, docMap: {} };
  const { rows: candidateProjects } = await pool.query('SELECT id, name, agency FROM projects WHERE id != $1', [currentProjectId]);
  const matching = candidateProjects.filter((p) => agencyGroup(`${p.agency || ''} ${p.name || ''}`) === groupKey);
  if (matching.length === 0) return { itemMap: {}, docMap: {} };
  const matchingIds = matching.map((p) => p.id);
  const projectById = {};
  matching.forEach((p) => { projectById[p.id] = p; });

  const { rows: itemRows } = await pool.query(
    `SELECT cs.project_id, cs.item_id, cs.updated_at, u.display_name
     FROM checklist_status cs LEFT JOIN users u ON u.id = cs.updated_by
     WHERE cs.status = 'submitted' AND cs.project_id = ANY($1::int[])`,
    [matchingIds]
  );
  const { rows: docRows } = await pool.query(
    `SELECT rd.project_id, rd.doc_key, rd.updated_at, u.display_name
     FROM required_documents rd LEFT JOIN users u ON u.id = rd.updated_by
     WHERE rd.status = 'submitted' AND rd.project_id = ANY($1::int[])`,
    [matchingIds]
  );

  const itemMap = {};
  for (const r of itemRows) {
    (itemMap[r.item_id] ||= []).push({
      projectId: r.project_id,
      projectName: (projectById[r.project_id] || {}).name || '(不明)',
      updatedByName: r.display_name || '不明',
      updatedAt: r.updated_at,
    });
  }
  const docMap = {};
  for (const r of docRows) {
    (docMap[r.doc_key] ||= []).push({
      projectId: r.project_id,
      projectName: (projectById[r.project_id] || {}).name || '(不明)',
      updatedByName: r.display_name || '不明',
      updatedAt: r.updated_at,
    });
  }
  return { itemMap, docMap };
}

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
  const { rows: users } = await pool.query('SELECT id, display_name FROM users');
  const userNameById = {};
  users.forEach((u) => { userNameById[u.id] = u.display_name; });

  const statusByProject = {};
  for (const s of statuses) {
    (statusByProject[s.project_id] ||= {})[s.item_id] = s;
  }
  const docsByProject = {};
  for (const d of docs) {
    (docsByProject[d.project_id] ||= {})[d.doc_key] = d;
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
    const itemStatusRows = statusByProject[p.id] || {};
    const totalItems = items.length;
    const doneItems = items.filter((it) => (itemStatusRows[it.id] || {}).status === 'submitted').length;
    const revisingItems = items.filter((it) => (itemStatusRows[it.id] || {}).status === 'revising').length;
    const inProgressItems = items.filter((it) => (itemStatusRows[it.id] || {}).status === 'in_progress').length;
    const naItems = items.filter((it) => (itemStatusRows[it.id] || {}).status === 'not_applicable').length;
    const applicableItems = totalItems - naItems;

    let currentCategory = categories[categories.length - 1];
    for (const cat of categories) {
      const catItems = items.filter((it) => it.category_id === cat.id);
      const allDone = catItems.every((it) => {
        const st = (itemStatusRows[it.id] || {}).status;
        return st === 'submitted' || st === 'not_applicable';
      });
      if (!allDone) {
        currentCategory = cat;
        break;
      }
    }

    const docStatusRows = docsByProject[p.id] || {};
    const docDoneCount = REQUIRED_DOC_KEYS.filter((k) => (docStatusRows[k] || {}).status === 'submitted').length;
    const docRevisingCount = REQUIRED_DOC_KEYS.filter((k) => (docStatusRows[k] || {}).status === 'revising').length;

    // 締切アラート（案件一覧からもすぐわかるように件数を集計）
    let dueRedCount = 0;
    let dueGreenCount = 0;
    for (const it of items) {
      const row = itemStatusRows[it.id];
      if (!row) continue;
      const alert = computeDueAlert(row.due_date, row.status);
      if (alert.level === 'red') dueRedCount++;
      else if (alert.level === 'green') dueGreenCount++;
    }
    for (const k of REQUIRED_DOC_KEYS) {
      const row = docStatusRows[k];
      if (!row) continue;
      const alert = computeDueAlert(row.due_date, row.status);
      if (alert.level === 'red') dueRedCount++;
      else if (alert.level === 'green') dueGreenCount++;
    }

    let overlapBadge = null;
    if (overlapProjectIds.has(p.id + ':red')) overlapBadge = 'red';
    else if (overlapProjectIds.has(p.id + ':blue')) overlapBadge = 'blue';

    return {
      project: p,
      progress: applicableItems ? Math.round((doneItems / applicableItems) * 100) : 100,
      doneItems,
      totalItems,
      revisingItems,
      inProgressItems,
      naItems,
      currentStage: currentCategory ? currentCategory.name : '-',
      docDoneCount,
      docRevisingCount,
      docTotalCount: REQUIRED_DOC_KEYS.length,
      technicians: techsByProject[p.id] || [],
      overlapBadge,
      assigneeName: p.assignee_user_id ? (userNameById[p.assignee_user_id] || '不明') : null,
      dueRedCount,
      dueGreenCount,
    };
  });

  return { summaries, categories, items };
}

// 案件一覧の上部に出す「締切が近い項目」パネル用データ（全案件横断）
async function computeUpcomingDeadlines() {
  const { rows: itemRows } = await pool.query(
    `SELECT cs.project_id, p.name AS project_name, ci.text AS label, cs.due_date, cs.status
     FROM checklist_status cs
     JOIN checklist_items ci ON ci.id = cs.item_id
     JOIN projects p ON p.id = cs.project_id
     WHERE cs.due_date IS NOT NULL AND p.archived = false
       AND cs.status NOT IN ('submitted', 'not_applicable')`
  );
  const { rows: docRows } = await pool.query(
    `SELECT rd.project_id, p.name AS project_name, rd.doc_key, rd.due_date, rd.status
     FROM required_documents rd
     JOIN projects p ON p.id = rd.project_id
     WHERE rd.due_date IS NOT NULL AND p.archived = false
       AND rd.status NOT IN ('submitted', 'not_applicable')`
  );
  const combined = [
    ...itemRows.map((r) => ({ projectId: r.project_id, projectName: r.project_name, label: r.label, dueDate: r.due_date, status: r.status })),
    ...docRows.map((r) => ({ projectId: r.project_id, projectName: r.project_name, label: REQUIRED_DOC_LABELS[r.doc_key], dueDate: r.due_date, status: r.status })),
  ];
  return combined
    .map((r) => ({ ...r, alert: computeDueAlert(r.dueDate, r.status) }))
    .filter((r) => r.alert.level !== 'none')
    .sort((a, b) => a.alert.daysRemaining - b.alert.daysRemaining);
}

app.get('/', requireAuth, async (req, res) => {
  const { summaries } = await computeProjectSummaries();
  const upcomingDeadlines = await computeUpcomingDeadlines();
  res.render('dashboard', { summaries, upcomingDeadlines, STATUS_LABELS });
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
app.get('/projects/new', requireAuth, async (req, res) => {
  const users = await getUsersList();
  res.render('project_new', { error: null, users });
});

app.post('/projects', requireAuth, async (req, res) => {
  const { name, agency, contract_amount, period_text, assignee_user_id } = req.body;
  if (!name || !name.trim()) {
    const users = await getUsersList();
    return res.render('project_new', { error: '案件名は必須です。', users });
  }
  const { rows } = await pool.query(
    'INSERT INTO projects (name, agency, contract_amount, period_text, assignee_user_id, updated_by) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id',
    [name.trim(), agency || null, contract_amount || null, period_text || null, assignee_user_id ? Number(assignee_user_id) : null, req.session.userId]
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
  const users = await getUsersList();
  const created = [];
  for (const block of blocks) {
    const fields = {};
    for (const line of block.split('\n')) {
      const m = line.match(/^\s*([^:：]+)[:：]\s*(.+)$/);
      if (m) fields[m[1].trim()] = m[2].trim();
    }
    const name = fields['案件名'];
    if (!name) continue;
    const assignee = fields['担当者'] ? users.find((u) => u.display_name === fields['担当者']) : null;
    const { rows } = await pool.query(
      'INSERT INTO projects (name, agency, contract_amount, period_text, assignee_user_id, updated_by) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id',
      [name, fields['発注機関'] || null, fields['契約金額'] || null, fields['工期'] || null, assignee ? assignee.id : null, req.session.userId]
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
  const { rows: statuses } = await pool.query(
    `SELECT cs.*, u.display_name AS updated_by_name FROM checklist_status cs
     LEFT JOIN users u ON u.id = cs.updated_by WHERE cs.project_id = $1`,
    [projectId]
  );
  const { rows: docs } = await pool.query(
    `SELECT rd.*, u.display_name AS updated_by_name FROM required_documents rd
     LEFT JOIN users u ON u.id = rd.updated_by WHERE rd.project_id = $1`,
    [projectId]
  );
  const { rows: techs } = await pool.query('SELECT * FROM project_technicians WHERE project_id = $1', [projectId]);
  const { rows: activity } = await pool.query(
    `SELECT a.*, u.display_name FROM activity_log a LEFT JOIN users u ON u.id = a.user_id
     WHERE a.project_id = $1 ORDER BY a.created_at DESC LIMIT 20`,
    [projectId]
  );
  const users = await getUsersList();

  const statusMap = {};
  for (const s of statuses) {
    const alert = computeDueAlert(s.due_date, s.status);
    statusMap[s.item_id] = { ...s, alertLevel: alert.level, daysRemaining: alert.daysRemaining };
  }
  const docsMap = {};
  for (const d of docs) {
    const alert = computeDueAlert(d.due_date, d.status);
    docsMap[d.doc_key] = { ...d, alertLevel: alert.level, daysRemaining: alert.daysRemaining };
  }
  const techMap = {};
  for (const t of techs) techMap[t.role] = t;

  const itemsByCategory = categories.map((cat) => ({
    category: cat,
    items: items.filter((it) => it.category_id === cat.id),
  }));

  const groupKey = agencyGroup(`${project.agency || ''} ${project.name || ''}`);
  const precedents = await computePrecedents(projectId, groupKey);
  const assigneeName = project.assignee_user_id
    ? (users.find((u) => u.id === project.assignee_user_id) || {}).display_name || null
    : null;

  res.render('project', {
    project,
    itemsByCategory,
    statusMap,
    docsMap,
    techMap,
    activity,
    users,
    assigneeName,
    precedents,
    agencyGroupKey: groupKey,
    REQUIRED_DOC_KEYS,
    REQUIRED_DOC_LABELS,
    REQUIRED_DOC_DESCRIPTIONS,
    STATUS_VALUES,
    STATUS_LABELS,
  });
});

app.post('/projects/:id/info', requireAuth, async (req, res) => {
  const projectId = Number(req.params.id);
  const { name, agency, contract_amount, period_text, folder_url, assignee_user_id } = req.body;
  await pool.query(
    `UPDATE projects SET name=$1, agency=$2, contract_amount=$3, period_text=$4, folder_url=$5,
       assignee_user_id=$6, updated_at=now(), updated_by=$7 WHERE id=$8`,
    [name, agency, contract_amount, period_text, folder_url || null, assignee_user_id ? Number(assignee_user_id) : null, req.session.userId, projectId]
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

// ---- ajax: checklist item ----
app.post('/api/projects/:id/items/:itemId/status', requireAuth, async (req, res) => {
  const projectId = Number(req.params.id);
  const itemId = Number(req.params.itemId);
  const status = normalizeStatus(req.body.status);
  const checked = status === 'submitted'; // 旧カラムも一応揃えておく（互換用）
  await pool.query(
    `INSERT INTO checklist_status (project_id, item_id, status, checked, updated_by, updated_at)
     VALUES ($1,$2,$3,$4,$5, now())
     ON CONFLICT (project_id, item_id) DO UPDATE SET status = $3, checked = $4, updated_by = $5, updated_at = now()`,
    [projectId, itemId, status, checked, req.session.userId]
  );
  res.json({ ok: true });
});

app.post('/api/projects/:id/items/:itemId/link', requireAuth, async (req, res) => {
  const projectId = Number(req.params.id);
  const itemId = Number(req.params.itemId);
  const linkUrl = (req.body.link_url || '').trim() || null;
  await pool.query(
    `INSERT INTO checklist_status (project_id, item_id, link_url, updated_by, updated_at)
     VALUES ($1,$2,$3,$4, now())
     ON CONFLICT (project_id, item_id) DO UPDATE SET link_url = $3, updated_by = $4, updated_at = now()`,
    [projectId, itemId, linkUrl, req.session.userId]
  );
  res.json({ ok: true });
});

app.post('/api/projects/:id/items/:itemId/due', requireAuth, async (req, res) => {
  const projectId = Number(req.params.id);
  const itemId = Number(req.params.itemId);
  const dueDate = (req.body.due_date || '').trim() || null;
  await pool.query(
    `INSERT INTO checklist_status (project_id, item_id, due_date, updated_by, updated_at)
     VALUES ($1,$2,$3,$4, now())
     ON CONFLICT (project_id, item_id) DO UPDATE SET due_date = $3, updated_by = $4, updated_at = now()`,
    [projectId, itemId, dueDate, req.session.userId]
  );
  res.json({ ok: true });
});

app.post('/api/projects/:id/items/:itemId/note', requireAuth, async (req, res) => {
  const projectId = Number(req.params.id);
  const itemId = Number(req.params.itemId);
  const statusNote = (req.body.status_note || '').trim() || null;
  await pool.query(
    `INSERT INTO checklist_status (project_id, item_id, status_note, updated_by, updated_at)
     VALUES ($1,$2,$3,$4, now())
     ON CONFLICT (project_id, item_id) DO UPDATE SET status_note = $3, updated_by = $4, updated_at = now()`,
    [projectId, itemId, statusNote, req.session.userId]
  );
  res.json({ ok: true });
});

// ---- ajax: required document ----
app.post('/api/projects/:id/documents/:docKey/status', requireAuth, async (req, res) => {
  const projectId = Number(req.params.id);
  const docKey = req.params.docKey;
  const status = normalizeStatus(req.body.status);
  const obtained = status === 'submitted'; // 旧カラムも一応揃えておく（互換用）
  await pool.query(
    `INSERT INTO required_documents (project_id, doc_key, status, obtained, updated_by, updated_at)
     VALUES ($1,$2,$3,$4,$5, now())
     ON CONFLICT (project_id, doc_key) DO UPDATE SET status = $3, obtained = $4, updated_by = $5, updated_at = now()`,
    [projectId, docKey, status, obtained, req.session.userId]
  );
  res.json({ ok: true });
});

app.post('/api/projects/:id/documents/:docKey/link', requireAuth, async (req, res) => {
  const projectId = Number(req.params.id);
  const docKey = req.params.docKey;
  const linkUrl = (req.body.link_url || '').trim() || null;
  await pool.query(
    `INSERT INTO required_documents (project_id, doc_key, link_url, updated_by, updated_at)
     VALUES ($1,$2,$3,$4, now())
     ON CONFLICT (project_id, doc_key) DO UPDATE SET link_url = $3, updated_by = $4, updated_at = now()`,
    [projectId, docKey, linkUrl, req.session.userId]
  );
  res.json({ ok: true });
});

app.post('/api/projects/:id/documents/:docKey/due', requireAuth, async (req, res) => {
  const projectId = Number(req.params.id);
  const docKey = req.params.docKey;
  const dueDate = (req.body.due_date || '').trim() || null;
  await pool.query(
    `INSERT INTO required_documents (project_id, doc_key, due_date, updated_by, updated_at)
     VALUES ($1,$2,$3,$4, now())
     ON CONFLICT (project_id, doc_key) DO UPDATE SET due_date = $3, updated_by = $4, updated_at = now()`,
    [projectId, docKey, dueDate, req.session.userId]
  );
  res.json({ ok: true });
});

app.post('/api/projects/:id/documents/:docKey/note', requireAuth, async (req, res) => {
  const projectId = Number(req.params.id);
  const docKey = req.params.docKey;
  const statusNote = (req.body.status_note || '').trim() || null;
  await pool.query(
    `INSERT INTO required_documents (project_id, doc_key, status_note, updated_by, updated_at)
     VALUES ($1,$2,$3,$4, now())
     ON CONFLICT (project_id, doc_key) DO UPDATE SET status_note = $3, updated_by = $4, updated_at = now()`,
    [projectId, docKey, statusNote, req.session.userId]
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
  const { seedIfEmpty, syncCatalogText } = require('./seed');
  await seedIfEmpty(); // チェックリストカタログ・初期ユーザーが空なら投入（既に投入済みなら何もしない）
  await syncCatalogText(); // コード側のCATEGORIES定義（文言・説明文）を毎回DBへ同期
  app.listen(PORT, () => console.log(`koji-checklist listening on :${PORT}`));
}

start().catch((e) => {
  console.error('起動に失敗しました', e);
  process.exit(1);
});
