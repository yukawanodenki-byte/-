// バックアップ機能：案件・書類・チェックリスト・体制・やり取り履歴・各種マスタ・更新履歴を丸ごとJSONスナップショットとして
// backupsテーブルに保存する（Renderの無料プランはディスクが永続しないため、ローカルファイルではなく
// 同じPostgres内に保存する方式にしている）。
// 自動保存は「最後の自動バックアップから24時間以上経っていたら1件作る」という機会主義的な方式
// （ダッシュボード表示時・起動時にチェックする）。Renderの無料Webサービスはアクセスが無いとスリープする
// ため、真に正確な「24時間おき」のcronは保証できないが、日常的にアクセスがあれば実質1日1回作られる。
//
// 重要：ここで作るバックアップはあくまで「アプリの操作ミス・データ破損」からの保護であり、
// Postgres自体（データベースまるごと）が削除された場合の保護にはならない（バックアップも同じDB内にあるため）。
// 本当の意味でのデータ消失対策としては、/backup ページの「ダウンロード」でJSONファイルを
// 定期的に手元（PC）に保存しておくことを推奨する。

// 注意：復元時は外部キーの順序があるため、参照される側（agencies / engineers）を先に入れる必要がある。
// この配列の順序＝復元時の挿入順序なので、並べ替えるときはFKの向きに注意すること。
const BACKUP_TABLES = ['agencies', 'engineers', 'projects', 'required_documents', 'checklist_status', 'project_technicians', 'agency_contacts', 'activity_log', 'document_samples'];

async function snapshotData(pool) {
  const data = {};
  for (const table of BACKUP_TABLES) {
    const { rows } = await pool.query(`SELECT * FROM ${table}`);
    data[table] = rows;
  }
  data._meta = { createdAt: new Date().toISOString(), tables: BACKUP_TABLES };
  return data;
}

async function pruneBackups(pool) {
  // 自動バックアップは直近14件、復元直前・案件削除直前バックアップは直近5件のみ残す。手動バックアップは自動削除しない。
  await pool.query(`
    DELETE FROM backups WHERE id IN (
      SELECT id FROM (
        SELECT id, kind, row_number() OVER (PARTITION BY kind ORDER BY created_at DESC) AS rn
        FROM backups
      ) t
      WHERE (t.kind = 'auto' AND t.rn > 14)
         OR (t.kind = 'pre_restore' AND t.rn > 5)
         OR (t.kind = 'pre_delete' AND t.rn > 5)
    )
  `);
}

async function createBackup(pool, kind, userId) {
  const data = await snapshotData(pool);
  const { rows } = await pool.query(
    'INSERT INTO backups (kind, created_by, data) VALUES ($1,$2,$3) RETURNING id, created_at, kind',
    [kind, userId || null, JSON.stringify(data)]
  );
  await pruneBackups(pool);
  return rows[0];
}

async function maybeRunAutoBackup(pool) {
  const { rows } = await pool.query("SELECT created_at FROM backups WHERE kind = 'auto' ORDER BY created_at DESC LIMIT 1");
  const last = rows[0];
  const dayMs = 24 * 60 * 60 * 1000;
  if (last && Date.now() - new Date(last.created_at).getTime() < dayMs) return null;
  return createBackup(pool, 'auto', null);
}

async function listBackups(pool, limit = 60) {
  const { rows } = await pool.query(
    `SELECT b.id, b.created_at, b.kind, u.display_name AS created_by_name,
       jsonb_array_length(b.data->'projects') AS project_count
     FROM backups b LEFT JOIN users u ON u.id = b.created_by
     ORDER BY b.created_at DESC LIMIT $1`,
    [limit]
  );
  return rows;
}

async function getBackup(pool, id) {
  const { rows } = await pool.query('SELECT * FROM backups WHERE id = $1', [id]);
  return rows[0] || null;
}

async function insertRows(client, table, rows) {
  if (!rows || rows.length === 0) return;
  const columns = Object.keys(rows[0]);
  const colList = columns.map((c) => `"${c}"`).join(', ');
  const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');
  for (const row of rows) {
    const values = columns.map((c) => row[c]);
    await client.query(`INSERT INTO ${table} (${colList}) VALUES (${placeholders})`, values);
  }
}

async function resetSequenceIfNeeded(client, table) {
  const { rows } = await client.query(`SELECT MAX(id) AS max_id FROM ${table}`);
  const maxId = rows[0].max_id;
  if (maxId) {
    await client.query(`SELECT setval(pg_get_serial_sequence($1, 'id'), $2)`, [table, maxId]);
  } else {
    await client.query(`SELECT setval(pg_get_serial_sequence($1, 'id'), 1, false)`, [table]);
  }
}

// 指定したバックアップの内容で、案件・書類・チェックリスト・体制・履歴データを丸ごと置き換える。
// ユーザーアカウント（users）は対象外（誤って認証情報を巻き戻さないため）。
// 復元操作自体が失敗・誤操作だった場合に備え、実行前の状態を必ず「復元直前バックアップ」として退避する。
async function restoreBackup(pool, backupId, userId) {
  const backup = await getBackup(pool, backupId);
  if (!backup) throw new Error('指定されたバックアップが見つかりません');
  const data = backup.data;

  const safety = await createBackup(pool, 'pre_restore', userId);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // 削除は参照する側から先に（FK違反を避けるため、挿入とは逆順）
    await client.query('DELETE FROM activity_log');
    await client.query('DELETE FROM agency_contacts');
    await client.query('DELETE FROM project_technicians');
    await client.query('DELETE FROM required_documents');
    await client.query('DELETE FROM checklist_status');
    await client.query('DELETE FROM projects');
    await client.query('DELETE FROM engineers');
    await client.query('DELETE FROM agencies');
    await client.query('DELETE FROM document_samples');

    // 挿入は参照される側から先に（projects.agency_id → agencies、project_technicians.engineer_id → engineers）
    await insertRows(client, 'agencies', data.agencies);
    await insertRows(client, 'engineers', data.engineers);
    await insertRows(client, 'projects', data.projects);
    await insertRows(client, 'required_documents', data.required_documents);
    await insertRows(client, 'checklist_status', data.checklist_status);
    await insertRows(client, 'project_technicians', data.project_technicians);
    await insertRows(client, 'agency_contacts', data.agency_contacts);
    await insertRows(client, 'activity_log', data.activity_log);
    await insertRows(client, 'document_samples', data.document_samples);

    await resetSequenceIfNeeded(client, 'agencies');
    await resetSequenceIfNeeded(client, 'engineers');
    await resetSequenceIfNeeded(client, 'projects');
    await resetSequenceIfNeeded(client, 'required_documents');
    await resetSequenceIfNeeded(client, 'project_technicians');
    await resetSequenceIfNeeded(client, 'agency_contacts');
    await resetSequenceIfNeeded(client, 'activity_log');
    await resetSequenceIfNeeded(client, 'document_samples');

    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
  return { restored: backup, safetyBackupId: safety.id };
}

module.exports = {
  BACKUP_TABLES,
  createBackup,
  maybeRunAutoBackup,
  listBackups,
  getBackup,
  restoreBackup,
};
