-- 公共工事 落札後提出書類チェックリスト DBスキーマ
-- 複数人が同じデータへ同時に読み書きできることを前提とした構成。

CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  username      TEXT UNIQUE NOT NULL,
  display_name  TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS projects (
  id               SERIAL PRIMARY KEY,
  name             TEXT NOT NULL,
  agency           TEXT,               -- 発注機関
  contract_amount  TEXT,               -- 契約金額（表示用テキスト。税込/税抜など書式が案件毎に違うためテキスト保持）
  period_text      TEXT,               -- 工期（表示用テキスト）
  stage_override   INT,                -- 手動で契約段階を上書きしたい場合(NULLなら自動計算)
  archived         BOOLEAN NOT NULL DEFAULT false,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by       INT REFERENCES users(id)
);

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
  obtained     BOOLEAN NOT NULL DEFAULT false,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by   INT REFERENCES users(id),
  UNIQUE(project_id, doc_key)
);

-- チェックリスト項目カタログ（区分①〜⑦、データ駆動＝画面から文言修正・追加削除できる）
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
  note         TEXT             -- 補足（例:「下請契約がある場合のみ」）
);

-- 案件ごとのチェック状況
CREATE TABLE IF NOT EXISTS checklist_status (
  project_id  INT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  item_id     INT NOT NULL REFERENCES checklist_items(id) ON DELETE CASCADE,
  checked     BOOLEAN NOT NULL DEFAULT false,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by  INT REFERENCES users(id),
  PRIMARY KEY (project_id, item_id)
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

CREATE INDEX IF NOT EXISTS idx_activity_log_project ON activity_log(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_technicians_dates ON project_technicians(start_date, end_date);
