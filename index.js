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
  await migrateChecklistDedupV1();
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

// チェックリスト①区分のうち「必須書類」欄と内容が重複していた5項目（入札公告・入札説明書の保管／
// 設計図面・仕様書の保管／見積参考資料の保管／契約書の受領・保管／工事費内訳書の提出）を削除し、
// 重複しない残り2項目（建設業許可証の写し・契約保証）をsort_order 1・2に詰める一度きりの移行処理。
// schema_migrationsに記録済みなら何もしない（何度サーバーを再起動しても安全）。
async function migrateChecklistDedupV1() {
  const client = await pool.connect();
  try {
    const { rows } = await client.query(
      "SELECT 1 FROM schema_migrations WHERE version = 'checklist_dedupe_required_docs_v1'"
    );
    if (rows.length > 0) return;

    await client.query('BEGIN');
    // 万一の誤りに備え、削除前の全データ状態を手動バックアップとして残しておく
    const { createBackup } = require('./backup');
    await createBackup(client, 'manual', null);

    const DUP_TEXTS = [
      '入札公告・入札説明書の保管',
      '設計図面・仕様書の保管',
      '見積参考資料の保管',
      '契約書（原本・写し）の受領・保管',
      '工事費内訳書の提出',
    ];
    await client.query(
      `DELETE FROM checklist_items
       WHERE category_id = (SELECT id FROM checklist_categories WHERE sort_order = 1)
         AND text = ANY($1::text[])`,
      [DUP_TEXTS]
    );
    await client.query(
      `UPDATE checklist_items SET sort_order = 1
       WHERE category_id = (SELECT id FROM checklist_categories WHERE sort_order = 1)
         AND text = '建設業許可証の写しの提出'`
    );
    await client.query(
      `UPDATE checklist_items SET sort_order = 2
       WHERE category_id = (SELECT id FROM checklist_categories WHERE sort_order = 1)
         AND text = '契約保証（保証書等）の提出'`
    );
    await client.query(`UPDATE checklist_categories SET name = '① 契約関係書類' WHERE sort_order = 1`);

    await client.query(
      "INSERT INTO schema_migrations (version) VALUES ('checklist_dedupe_required_docs_v1') ON CONFLICT DO NOTHING"
    );
    await client.query('COMMIT');
    console.log('移行完了: 必須書類と重複していたチェックリスト①区分の5項目を削除しました（checklist_dedupe_required_docs_v1）');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

module.exports = { pool, initSchema };
