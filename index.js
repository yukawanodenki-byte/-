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
  await seedAgencyMasterV1();
}

// 発注機関マスタの初期投入（一度きり）。
// ①主要な国の機関と47都道府県をあらかじめ入れておく（入札でよく相手にする単位）。
// ②既に登録されている案件の発注機関名をマスタへ取り込み、その案件と紐付ける
//   （これまで手入力で貯めてきた発注機関を、登録し直さずにそのまま使えるようにするため）。
async function seedAgencyMasterV1() {
  const client = await pool.connect();
  try {
    const { rows } = await client.query(
      "SELECT 1 FROM schema_migrations WHERE version = 'seed_agency_master_v1'"
    );
    if (rows.length > 0) return;

    await client.query('BEGIN');

    const NATIONAL = [
      '法務省', '国土交通省', '防衛省', '財務省', '厚生労働省', '文部科学省', '農林水産省',
      '経済産業省', '環境省', '総務省', '内閣府', '警察庁', '国税庁', '林野庁', '海上保安庁',
      '裁判所', '検察庁', '日本郵便', '国立大学法人',
    ];
    const PREFECTURES = [
      '北海道', '青森県', '岩手県', '宮城県', '秋田県', '山形県', '福島県', '茨城県', '栃木県',
      '群馬県', '埼玉県', '千葉県', '東京都', '神奈川県', '新潟県', '富山県', '石川県', '福井県',
      '山梨県', '長野県', '岐阜県', '静岡県', '愛知県', '三重県', '滋賀県', '京都府', '大阪府',
      '兵庫県', '奈良県', '和歌山県', '鳥取県', '島根県', '岡山県', '広島県', '山口県', '徳島県',
      '香川県', '愛媛県', '高知県', '福岡県', '佐賀県', '長崎県', '熊本県', '大分県', '宮崎県',
      '鹿児島県', '沖縄県',
    ];

    for (const name of NATIONAL) {
      await client.query(
        `INSERT INTO agencies (name, kind, group_key) VALUES ($1,'national',$2)
         ON CONFLICT (name) DO NOTHING`,
        [name, name]
      );
    }
    for (const name of PREFECTURES) {
      await client.query(
        "INSERT INTO agencies (name, kind) VALUES ($1,'local') ON CONFLICT (name) DO NOTHING",
        [name]
      );
    }

    // 既存案件の発注機関名を取り込む（空欄・重複は除く）
    const { rows: usedAgencies } = await client.query(
      "SELECT DISTINCT btrim(agency) AS name FROM projects WHERE agency IS NOT NULL AND btrim(agency) <> ''"
    );
    for (const a of usedAgencies) {
      await client.query(
        "INSERT INTO agencies (name, kind) VALUES ($1,'national') ON CONFLICT (name) DO NOTHING",
        [a.name]
      );
    }
    // 取り込んだ機関を、同じ名前の案件へ紐付ける
    await client.query(
      `UPDATE projects p SET agency_id = a.id
       FROM agencies a WHERE p.agency_id IS NULL AND btrim(p.agency) = a.name`
    );

    await client.query(
      "INSERT INTO schema_migrations (version) VALUES ('seed_agency_master_v1') ON CONFLICT DO NOTHING"
    );
    await client.query('COMMIT');
    console.log(`発注機関マスタを初期投入しました（国の機関${NATIONAL.length}件・都道府県${PREFECTURES.length}件＋既存案件から${usedAgencies.length}件）。`);
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
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

module.exports = { pool, initSchema, seedAgencyMasterV1 };
