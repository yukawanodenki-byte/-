// 初期データ投入スクリプト（区分①〜⑦・48項目の標準チェックリストカタログ ＋ 初期ユーザー）
// ※もともと53項目だったが、2026年8月に「必須書類」欄と重複していた①区分の5項目を削除し48項目に。
// 実行: npm run seed
// - checklist_categories/itemsが空の場合のみカテゴリ・項目を新規投入（既存プロジェクトのデータは触らない）
// - text/note/descriptionは起動のたびに below の CATEGORIES 定義から同期される（syncCatalogText）
//   ので、この配列を編集してデプロイし直すだけで文言修正が反映できる。
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { pool } = require('./index');

const CATEGORIES = [
  {
    // 注意：ここに以前あった「入札公告・入札説明書の保管」「設計図面・仕様書の保管」
    // 「見積参考資料の保管」「契約書（原本・写し）の受領・保管」「工事費内訳書の提出」の5項目は、
    // 「必須書類」欄（required_documents）と内容が重複していたため削除した（2026年8月）。
    // それらの保存状況は必須書類欄側で管理する。既存DBからの削除はindex.jsの
    // migrateChecklistDedupV1が一度だけ行う。
    name: '① 契約関係書類',
    items: [
      { text: '建設業許可証の写しの提出', description: '自社が建設業許可を受けていることを証明する許可証の写し。工事の種類に対応した許可が必要です。' },
      { text: '契約保証（保証書等）の提出', description: '契約金額に応じて求められる契約保証（保証書・保証金等）。契約不履行に備えるための書類です。' },
    ],
  },
  {
    name: '② 技術者関係',
    items: [
      { text: '主任（監理）技術者選任通知書の提出', description: '工事現場に配置する主任技術者または監理技術者を発注機関に届け出る書類。誰が現場を技術面で統括するかを明示します。' },
      { text: '現場代理人選任通知書の提出', description: '契約に関する現場での代理権限を持つ現場代理人を届け出る書類。発注機関とのやり取りの窓口になります。' },
      { text: '技術者の資格者証・実務経験証明書の提出', description: '配置する技術者が必要な資格（施工管理技士等）を持っていることを証明する資格者証や実務経験証明書。' },
      { text: '専任／非専任の確認・他案件との重複配置がないことの確認', description: '同じ技術者を複数の現場に専任で重複配置していないかの確認。専任が必要な工事では特に注意が必要です。' },
      { text: '技術者経歴書の提出', description: '配置技術者のこれまでの工事経験をまとめた経歴書。同種工事の実績があるかを示します。' },
    ],
  },
  {
    name: '③ 着工前提出書類',
    items: [
      { text: '施工計画書の提出', description: '工事の進め方・安全対策・品質管理方法などをまとめた計画書。着工前に発注機関へ提出し承認を得ます。' },
      { text: '全体工程表の提出', description: '着工から完成までの作業の流れと日程を示す工程表。' },
      { text: '施工体制台帳の作成', note: '下請契約を締結した場合（金額基準なし）', description: '下請業者を含めた施工体制（会社名・技術者・作業内容など）を一覧化した台帳。下請契約がある場合に作成義務があります。' },
      { text: '施工体系図の作成・掲示', note: '下請契約を締結した場合（金額基準なし）', description: '元請・下請の関係を図で示したもの。現場に掲示することが義務付けられています。' },
      { text: '再下請負通知書の提出', note: '下請契約がある場合', description: '下請業者がさらに別の業者に発注（再下請）する場合に、その関係を発注者に通知する書類。' },
      { text: '建設業退職金共済（建退共）加入・履行証明の確認', description: '建設業の労働者の退職金制度である建退共に加入しているかの確認。公共工事では加入・履行の確認が求められます。' },
      { text: '建退共証紙受払簿の作成', description: '建退共の証紙（掛金相当）の購入・使用状況を記録する帳簿。' },
      { text: 'CORINS登録（新規）', note: '請負金額500万円以上が対象', description: '工事実績情報システム(CORINS)への工事概要の登録。請負金額500万円以上の工事が対象です。' },
      { text: '産業廃棄物処理計画・委託契約書の準備', description: '工事で発生する産業廃棄物の処理方法をまとめた計画と、処理業者との委託契約書。' },
      { text: '着手前写真の撮影', description: '工事着手前の現場状況を記録した写真。施工前後の比較や検査資料として使います。' },
      { text: '安全衛生管理体制の届出・誓約書の提出', description: '現場の安全衛生管理体制（責任者等）の届出や、法令遵守を誓約する書類。' },
    ],
  },
  {
    name: '④ 施工中提出書類',
    items: [
      { text: '工事打合せ簿の作成・提出', description: '発注機関との打合せ内容・指示事項を記録する書類。指示・回答のやり取りを証拠として残します。' },
      { text: '施工体制台帳の更新', note: '下請の変更等があった場合', description: '下請業者の追加・変更など施工体制に変化があった際に、施工体制台帳を最新の状態に更新します。' },
      { text: '使用材料承諾願の提出', description: '使用する材料・製品について発注機関の承諾を得るための書類。' },
      { text: '段階確認・立会願の提出', description: '工事の重要な工程（配筋・埋設等）で発注機関の立会・確認を依頼する書類。' },
      { text: '出来形管理資料の作成', description: '工事の出来上がり具合（寸法・数量等）を記録・管理する資料。' },
      { text: '品質管理資料の作成', description: '使用材料の試験結果や施工品質を証明する資料。' },
      { text: '施工状況写真の撮影・整理', description: '施工中の各工程を記録した写真の撮影と整理。' },
      { text: '産業廃棄物マニフェストの管理', note: '該当する場合', description: '産業廃棄物の排出から処分までを追跡する伝票（マニフェスト）の管理。' },
      { text: '建退共証紙の購入・貼付状況の確認', description: '建退共証紙を実際に購入し、対象労働者の手帳へ適切に貼付できているかの確認。' },
    ],
  },
  {
    name: '⑤ 中間検査関係',
    items: [
      { text: '中間技術検査申請書の提出', note: '該当する場合', description: '工期の中間時点で行われる技術検査を申請する書類。対象となる工事規模・内容の場合に提出します。' },
      { text: '中間検査資料の準備', description: '中間検査で提示を求められる出来形・品質管理資料などの準備。' },
      { text: '是正指示事項への対応', description: '検査等で指摘された是正事項に対応し、その結果を記録・報告します。' },
    ],
  },
  {
    name: '⑥ 完成関係書類',
    items: [
      { text: '工事完成通知書（届）の提出', description: '工事が完成したことを発注機関に届け出る書類。しゅん工検査の起点になります。' },
      { text: '完成図書（竣工図）の作成', description: '実際に施工した内容を反映した完成図面一式（竣工図）。' },
      { text: '工事写真台帳の整理', description: '着手前・施工中・完成後の写真を体系的にまとめた台帳。' },
      { text: 'しゅん工検査申請書の提出', description: '工事完成後に行われるしゅん工検査を申請する書類。' },
      { text: '完成検査への立会', description: 'しゅん工検査当日、現場で検査員の確認に立ち会うこと。' },
      { text: 'CORINS登録（完成時変更）', note: '請負金額500万円以上が対象', description: '完成時の実績（工期・金額等）をCORINSに反映させる変更登録。' },
      { text: '建退共貼付実績報告書の提出', description: '工事全体を通じて建退共証紙をどれだけ貼付したかを報告する書類。' },
      { text: '是正事項の完了報告', description: 'しゅん工検査等で指摘された是正事項が完了したことの報告。' },
    ],
  },
  {
    name: '⑦ 引渡・精算関係',
    items: [
      { text: '引渡書の提出・受領', description: '完成した工事目的物を発注機関に引き渡したことを示す書類。' },
      { text: '請求書の発行・提出', description: '契約金額（または出来高）に応じた請求書の発行・提出。' },
      { text: '完成検査調書の受領', description: 'しゅん工検査の結果をまとめた調書を発注機関から受領します。' },
      { text: '工事成績評定資料の確認', description: '工事の出来栄えに対する発注機関の評定（成績）内容の確認。今後の入札参加資格にも影響することがあります。' },
      { text: '瑕疵担保（契約不適合責任）関係書類の整理', description: '引渡後に不具合が見つかった場合の責任範囲・期間に関する書類の整理。' },
      { text: '各種提出書類の写しの保管（社内保存）', description: '発注機関へ提出した書類一式の写しを、社内で一定期間保管しておくこと。' },
      { text: '建退共関係書類一式の最終確認・保管', description: '証紙受払簿・貼付実績報告書など建退共関連書類一式の最終確認と保管。' },
      { text: '施工体制台帳一式の保管（法定保存期間の確認）', description: '施工体制台帳・体系図など一式を、法令で定められた保存期間に沿って保管すること。' },
      { text: '産業廃棄物マニフェストの最終確認・保管', description: 'マニフェストが最後まで（処分終了報告まで）適切に回収・保管されているかの最終確認。' },
      { text: '案件フォルダの整理・アーカイブ化', description: '案件に関する全書類・データを整理し、後から参照しやすい形でアーカイブすること。' },
    ],
  },
];

async function seedIfEmpty() {
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
        for (const item of cat.items) {
          await client.query(
            'INSERT INTO checklist_items (category_id, sort_order, text, note, description) VALUES ($1, $2, $3, $4, $5)',
            [categoryId, itemOrder, item.text, item.note || null, item.description || null]
          );
          itemOrder += 1;
        }
        catOrder += 1;
      }
      console.log('チェックリストカタログ（区分①〜⑦・48項目）を投入しました。');
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
  }
}

// カテゴリ・項目が既に存在していても、text/note/descriptionを常にCATEGORIES定義の内容へ同期する。
// カテゴリのsort_order、項目のsort_order（カテゴリ内の並び順）で対応付ける。
// これにより、次回以降このファイルの文言だけ直してデプロイすれば、DBの中身を直接触らずに反映できる。
async function syncCatalogText() {
  const client = await pool.connect();
  try {
    let catOrder = 1;
    for (const cat of CATEGORIES) {
      const { rows: catRows } = await client.query(
        'UPDATE checklist_categories SET name = $1 WHERE sort_order = $2 RETURNING id',
        [cat.name, catOrder]
      );
      if (catRows.length > 0) {
        const categoryId = catRows[0].id;
        let itemOrder = 1;
        for (const item of cat.items) {
          await client.query(
            'UPDATE checklist_items SET text = $1, note = $2, description = $3 WHERE category_id = $4 AND sort_order = $5',
            [item.text, item.note || null, item.description || null, categoryId, itemOrder]
          );
          itemOrder += 1;
        }
      }
      catOrder += 1;
    }
  } finally {
    client.release();
  }
}

module.exports = { seedIfEmpty, syncCatalogText };

// `node seed.js` で直接実行された場合のみCLIとして動く（server.jsからrequireされた時は実行しない）
if (require.main === module) {
  seedIfEmpty()
    .then(() => syncCatalogText())
    .then(() => pool.end())
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
