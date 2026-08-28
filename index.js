const { Pool } = require('pg');

const connectionString = process.env.DATABASE_URL;

const pool = new Pool({
  connectionString,
  // Render の Managed Postgres は SSL 必須。ローカル開発では未設定でOK。
  ssl: process.env.PGSSL === 'false' ? false : (connectionString && connectionString.includes('render.com'))
    ? { rejectUnauthorized: false }
    : (process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false),
});

async function initSchema() {
  const fs = require('fs');
  const path = require('path');
  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  await pool.query(sql);
  await migrateStatusFields();
}

// 旧checked/obtained（真偽値）をstatus（4段階）へ一度だけ反映する移行処理。
// schema_migrationsに記録済みなら何もしない（何度サーバーを再起動しても安全）。
async function migrateStatusFields() {
  const client = await pool.connect();
  try {
    const { rows } = await client.query(
      "SELECT 1 FROM schema_migrations WHERE version = 'status_fields_v1'"
    );
    if (rows.length > 0) return;

    await client.query('BEGIN');
    await client.query(
      "UPDATE required_documents SET status = 'submitted' WHERE obtained = true"
    );
    await client.query(
      "UPDATE checklist_status SET status = 'submitted' WHERE checked = true"
    );
    await client.query(
      "INSERT INTO schema_migrations (version) VALUES ('status_fields_v1') ON CONFLICT DO NOTHING"
    );
    await client.query('COMMIT');
    console.log('移行完了: 書類・チェックリストのステータスを旧データから反映しました（status_fields_v1）');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

module.exports = { pool, initSchema };
