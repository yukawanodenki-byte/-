// 初期データ投入スクリプト（区分①〜⑦・53項目の標準チェックリストカタログ ＋ 初期ユーザー）
// 実行: npm run seed
// 既に投入済みの場合は何もしない（冪等）。
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { pool } = require('../db');

const CATEGORIES = [
  {
    name: '① 入札〜契約関係書類',
    items: [
      '入札公告・入札説明書の保管',
      '設計図面・仕様書の保管',
      '見積参考資料の保管',
      '契約書（原本・写し）の受領・保管',
      '工事費内訳書の提出',
      '建設業許可証の写しの提出',
      '契約保証（保証書等）の提出',
    ],
  },
  {
    name: '② 技術者関係',
    items: [
      '主任（監理）技術者選任通知書の提出',
      '現場代理人選任通知書の提出',
      '技術者の資格者証・実務経験証明書の提出',
      '専任／非専任の確認・他案件との重複配置がないことの確認',
      '技術者経歴書の提出',
    ],
  },
  {
    name: '③ 着工前提出書類',
    items: [
      '施工計画書の提出',
      '全体工程表の提出',
      { text: '施工体制台帳の作成', note: '下請契約を締結した場合（金額基準なし）' },
      { text: '施工体系図の作成・掲示', note: '下請契約を締結した場合（金額基準なし）' },
      { text: '再下請負通知書の提出', note: '下請契約がある場合' },
      '建設業退職金共済（建退共）加入・履行証明の確認',
      '建退共証紙受払簿の作成',
      { text: 'CORINS登録（新規）', note: '請負金額500万円以上が対象' },
      '産業廃棄物処理計画・委託契約書の準備',
      '着手前写真の撮影',
      '安全衛生管理体制の届出・誓約書の提出',
    ],
  },
  {
    name: '④ 施工中提出書類',
    items: [
      '工事打合せ簿の作成・提出',
      { text: '施工体制台帳の更新', note: '下請の変更等があった場合' },
      '使用材料承諾願の提出',
      '段階確認・立会願の提出',
      '出来形管理資料の作成',
      '品質管理資料の作成',
      '施工状況写真の撮影・整理',
      { text: '産業廃棄物マニフェストの管理', note: '該当する場合' },
      '建退共証紙の購入・貼付状況の確認',
    ],
  },
  {
    name: '⑤ 中間検査関係',
    items: [
      { text: '中間技術検査申請書の提出', note: '該当する場合' },
      '中間検査資料の準備',
      '是正指示事項への対応',
    ],
  },
  {
    name: '⑥ 完成関係書類',
    items: [
      '工事完成通知書（届）の提出',
      '完成図書（竣工図）の作成',
      '工事写真台帳の整理',
      'しゅん工検査申請書の提出',
      '完成検査への立会',
      { text: 'CORINS登録（完成時変更）', note: '請負金額500万円以上が対象' },
      '建退共貼付実績報告書の提出',
      '是正事項の完了報告',
    ],
  },
  {
    name: '⑦ 引渡・精算関係',
    items: [
      '引渡書の提出・受領',
      '請求書の発行・提出',
      '完成検査調書の受領',
      '工事成績評定資料の確認',
      '瑕疵担保（契約不適合責任）関係書類の整理',
      '各種提出書類の写しの保管（社内保存）',
      '建退共関係書類一式の最終確認・保管',
      '施工体制台帳一式の保管（法定保存期間の確認）',
      '産業廃棄物マニフェストの最終確認・保管',
      '案件フォルダの整理・アーカイブ化',
    ],
  },
];

async function main() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: existing } = await client.query('SELECT COUNT(*)::int AS n FROM checklist_categories');
    if (existing[0].n === 0) {
      let catOrder = 1;
      for (const cat of CATEGORIES) {
        const { rows } = await client.query(
          'INSERT INTO checklist_categories (sort_order, name) VALUES ($1, $2) RETURNING id',
          [catOrder, cat.name]
        );
        const categoryId = rows[0].id;
        let itemOrder = 1;
        for (const raw of cat.items) {
          const text = typeof raw === 'string' ? raw : raw.text;
          const note = typeof raw === 'string' ? null : raw.note;
          await client.query(
            'INSERT INTO checklist_items (category_id, sort_order, text, note) VALUES ($1, $2, $3, $4)',
            [categoryId, itemOrder, text, note]
          );
          itemOrder += 1;
        }
        catOrder += 1;
      }
      console.log('チェックリストカタログ（区分①〜⑦・53項目）を投入しました。');
    } else {
      console.log('チェックリストカタログは投入済みのためスキップしました。');
    }

    const { rows: userRows } = await client.query('SELECT COUNT(*)::int AS n FROM users');
    if (userRows[0].n === 0) {
      const initialUsername = process.env.SEED_ADMIN_USERNAME || 'ueda';
      const initialPassword = process.env.SEED_ADMIN_PASSWORD || 'change-me-please';
      const hash = await bcrypt.hash(initialPassword, 10);
      await client.query(
        'INSERT INTO users (username, display_name, password_hash) VALUES ($1, $2, $3)',
        [initialUsername, process.env.SEED_ADMIN_DISPLAY_NAME || '上西', hash]
      );
      console.log(`初期ユーザーを作成しました: username=${initialUsername} / password=${initialPassword}`);
      console.log('※ ログイン後、必ずパスワードを変更してください。');
    } else {
      console.log('ユーザーは既に存在するためスキップしました。');
    }

    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
