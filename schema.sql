-- 公共工事 落札後提出書類チェックリスト DBスキーマ
-- 複数人が同じデータへ同時に読み書きできることを前提とした構成。
-- このファイルは起動のたびに実行される。CREATE TABLE IF NOT EXISTS / ADD COLUMN IF NOT EXISTS /
-- DROP CONSTRAINT IF EXISTS + ADD CONSTRAINT の組み合わせで、何度実行しても安全（冪等）なようにしてある。

CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  username      TEXT UNIQUE NOT NULL,
  display_name  TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- 画面配色（メンバーごとに白基調／黒基調／青基調を選べる。ログインアカウントに紐づくので端末が変わっても引き継がれる）
ALTER TABLE users ADD COLUMN IF NOT EXISTS theme TEXT NOT NULL DEFAULT 'white';
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_theme_check;
ALTER TABLE users ADD CONSTRAINT users_theme_check CHECK (theme IN ('white', 'dark', 'blue'));

CREATE TABLE IF NOT EXISTS projects (
  id                SERIAL PRIMARY KEY,
  name              TEXT NOT NULL,
  agency            TEXT,               -- 発注機関
  contract_amount   TEXT,               -- 契約金額（表示用テキスト。税込/税抜など書式が案件毎に違うためテキスト保持）
  period_text       TEXT,               -- 工期（表示用テキスト）
  folder_url        TEXT,               -- 共有サーバー上のこの案件のフォルダへのリンク
  assignee_user_id  INT REFERENCES users(id),  -- 案件の作成担当者
  stage_override    INT,                -- 手動で契約段階を上書きしたい場合(NULLなら自動計算)
  archived          BOOLEAN NOT NULL DEFAULT false,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by        INT REFERENCES users(id)
);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS folder_url TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS assignee_user_id INT REFERENCES users(id);
-- 年間工程表（契約期間ベース）用。準備期間はcontract_date（無ければconstruction_start_date）〜construction_start_dateとして計算する。
ALTER TABLE projects ADD COLUMN IF NOT EXISTS contract_date DATE;              -- 契約日
ALTER TABLE projects ADD COLUMN IF NOT EXISTS construction_start_date DATE;    -- 着工日
ALTER TABLE projects ADD COLUMN IF NOT EXISTS construction_end_date DATE;      -- 完成期日（完工日）
-- 発注機関側の連絡先（基本情報）
ALTER TABLE projects ADD COLUMN IF NOT EXISTS contract_officer_name TEXT;      -- 契約担当者の氏名
ALTER TABLE projects ADD COLUMN IF NOT EXISTS contract_officer_phone TEXT;     -- 契約担当者の電話番号
ALTER TABLE projects ADD COLUMN IF NOT EXISTS supervisor_name TEXT;           -- 監督職員の氏名
ALTER TABLE projects ADD COLUMN IF NOT EXISTS supervisor_phone TEXT;          -- 監督職員の電話番号
ALTER TABLE projects ADD COLUMN IF NOT EXISTS mailing_address TEXT;           -- 郵送物の送り先

-- 体制・工程（監理技術者／主任技術者／現場代理人）。1案件につき役割ごとに1行。
CREATE TABLE IF NOT EXISTS project_technicians (
  id           SERIAL PRIMARY KEY,
  project_id   INT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  role         TEXT NOT NULL CHECK (role IN ('監理技術者','主任技術者','現場代理人')),
  person_name  TEXT,
  exclusive    BOOLEAN NOT NULL DEFAULT true,  -- 専任(true) / 非専任(false)
  start_date   DATE,
  end_date     DATE,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by   INT REFERENCES users(id),
  UNIQUE(project_id, role)
);

-- 必須書類（6種類固定）: 入札公告・入札説明書・仕様書/設計図面・見積参考資料・契約書・工事費内訳書
CREATE TABLE IF NOT EXISTS required_documents (
  id           SERIAL PRIMARY KEY,
  project_id   INT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  doc_key      TEXT NOT NULL,   -- 'koukoku','setsumei','shiyousho','mitsumori','keiyakusho','uchiwakesho'
  obtained     BOOLEAN NOT NULL DEFAULT false,  -- 旧カラム（互換用に残置。新規コードはstatusを参照）
  status       TEXT NOT NULL DEFAULT 'not_started',
  link_url     TEXT,            -- 共有サーバー上のこの書類（フォルダ/ファイル）へのリンク
  due_date     DATE,            -- 提出期限
  status_note  TEXT,            -- status='not_applicable'の場合の根拠等のメモ
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by   INT REFERENCES users(id),
  UNIQUE(project_id, doc_key)
);
ALTER TABLE required_documents ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'not_started';
ALTER TABLE required_documents ADD COLUMN IF NOT EXISTS link_url TEXT;
ALTER TABLE required_documents ADD COLUMN IF NOT EXISTS due_date DATE;
ALTER TABLE required_documents ADD COLUMN IF NOT EXISTS status_note TEXT;
-- 協力業者（外注）へ作成を依頼した場合の記録
ALTER TABLE required_documents ADD COLUMN IF NOT EXISTS contractor_name TEXT;   -- 依頼先の協力業者名
ALTER TABLE required_documents ADD COLUMN IF NOT EXISTS requested_at DATE;      -- 依頼日
ALTER TABLE required_documents ADD COLUMN IF NOT EXISTS request_detail TEXT;    -- いつどんな依頼をしたか（自由記述）
-- 実際に提出できた日・提出方法（期限＝予定、提出日＝実績、として区別する）
ALTER TABLE required_documents ADD COLUMN IF NOT EXISTS submitted_at DATE;         -- 提出日（実績）
ALTER TABLE required_documents ADD COLUMN IF NOT EXISTS submission_method TEXT;    -- 提出方法（例: 郵送・持参・電子申請等）
ALTER TABLE required_documents DROP CONSTRAINT IF EXISTS required_documents_status_check;
ALTER TABLE required_documents ADD CONSTRAINT required_documents_status_check
  CHECK (status IN ('not_started','in_progress','submitted','revising','not_applicable'));

-- チェックリスト項目カタログ（区分①〜⑦、データ駆動＝コード側のCATEGORIES定義から起動時に同期される）
CREATE TABLE IF NOT EXISTS checklist_categories (
  id          SERIAL PRIMARY KEY,
  sort_order  INT NOT NULL,
  name        TEXT NOT NULL   -- 例: '① 契約関係書類'
);

CREATE TABLE IF NOT EXISTS checklist_items (
  id           SERIAL PRIMARY KEY,
  category_id  INT NOT NULL REFERENCES checklist_categories(id) ON DELETE CASCADE,
  sort_order   INT NOT NULL,
  text         TEXT NOT NULL,
  note         TEXT,            -- 補足（例:「下請契約がある場合のみ」）
  description  TEXT             -- どんな書類・作業かの平易な説明（素人向け）
);
ALTER TABLE checklist_items ADD COLUMN IF NOT EXISTS description TEXT;

-- 案件ごとのチェック状況
CREATE TABLE IF NOT EXISTS checklist_status (
  project_id   INT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  item_id      INT NOT NULL REFERENCES checklist_items(id) ON DELETE CASCADE,
  checked      BOOLEAN NOT NULL DEFAULT false,  -- 旧カラム（互換用に残置。新規コードはstatusを参照）
  status       TEXT NOT NULL DEFAULT 'not_started',
  link_url     TEXT,            -- 共有サーバー上のこの項目の保存先へのリンク
  due_date     DATE,            -- 提出期限
  status_note  TEXT,            -- status='not_applicable'の場合の根拠等のメモ
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by   INT REFERENCES users(id),
  PRIMARY KEY (project_id, item_id)
);
ALTER TABLE checklist_status ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'not_started';
ALTER TABLE checklist_status ADD COLUMN IF NOT EXISTS link_url TEXT;
ALTER TABLE checklist_status ADD COLUMN IF NOT EXISTS due_date DATE;
ALTER TABLE checklist_status ADD COLUMN IF NOT EXISTS status_note TEXT;
-- 協力業者（外注）へ作成を依頼した場合の記録
ALTER TABLE checklist_status ADD COLUMN IF NOT EXISTS contractor_name TEXT;
ALTER TABLE checklist_status ADD COLUMN IF NOT EXISTS requested_at DATE;
ALTER TABLE checklist_status ADD COLUMN IF NOT EXISTS request_detail TEXT;
-- 実際に提出できた日・提出方法（期限＝予定、提出日＝実績、として区別する）
ALTER TABLE checklist_status ADD COLUMN IF NOT EXISTS submitted_at DATE;
ALTER TABLE checklist_status ADD COLUMN IF NOT EXISTS submission_method TEXT;
ALTER TABLE checklist_status DROP CONSTRAINT IF EXISTS checklist_status_status_check;
ALTER TABLE checklist_status ADD CONSTRAINT checklist_status_status_check
  CHECK (status IN ('not_started','in_progress','submitted','revising','not_applicable'));

-- 一度きりのデータ移行を記録するテーブル（旧checked/obtainedのbool値→statusへの反映など）
CREATE TABLE IF NOT EXISTS schema_migrations (
  version     TEXT PRIMARY KEY,
  applied_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 操作履歴（誰が・いつ・何をしたか。複数人運用での可視化用）
CREATE TABLE IF NOT EXISTS activity_log (
  id          SERIAL PRIMARY KEY,
  project_id  INT REFERENCES projects(id) ON DELETE CASCADE,
  user_id     INT REFERENCES users(id),
  action      TEXT NOT NULL,
  detail      TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- バックアップ（案件・書類・チェックリスト・体制・履歴データの丸ごとスナップショット）
-- 「データ破損・保存状況の消失」対策。自動（毎日1回・直近分のみ保持）／手動／復元直前の3種類を保存する。
CREATE TABLE IF NOT EXISTS backups (
  id          SERIAL PRIMARY KEY,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  kind        TEXT NOT NULL DEFAULT 'auto', -- 'auto' | 'manual' | 'pre_restore'
  created_by  INT REFERENCES users(id),      -- 自動保存の場合はNULL
  data        JSONB NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_backups_created_at ON backups(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_activity_log_project ON activity_log(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_technicians_dates ON project_technicians(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_checklist_status_due ON checklist_status(due_date);
CREATE INDEX IF NOT EXISTS idx_required_documents_due ON required_documents(due_date);
CREATE INDEX IF NOT EXISTS idx_projects_construction_dates ON projects(construction_start_date, construction_end_date);
