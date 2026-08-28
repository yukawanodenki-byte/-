# 公共工事 提出書類チェックリスト（複数人管理版）

落札後の書類提出チェックリスト（区分①〜⑦・53項目）を、複数人が同時にログインして
直接データを読み書きできる形でRender上に構築したWebアプリです。

これまでのClaude Artifact版（オーナー以外は書き込み不可）の制約を解消するため、
Node.js + Express + PostgreSQL の通常のWebアプリとして作成しています。

## 構成

- Web Service（Node.js / Express / EJS）
- PostgreSQL（Render Managed Postgres）
- 認証：メンバーごとの個別アカウント（ユーザー名＋パスワード）。全員同じ権限で編集可。
  誰が・いつ・何を更新したかは案件ごとの「更新履歴」に記録されます。

## 主な機能

- 案件一覧（進捗バー・現在の契約段階・必須書類の取得状況・技術者重複バッジ）
- チェックリスト（区分①〜⑦・53項目、チェックのたびに自動保存）
- 必須書類6種類（入札公告・入札説明書・仕様書/設計図面・見積参考資料・契約書・工事費内訳書）の取得管理
- 体制・工程（監理技術者・主任技術者・現場代理人の氏名／専任・非専任／開始日・終了日）
- 工程表（技術者配置のタイムライン表示。同一技術者の重複配置を赤／青で警告）
- 貼り付けインポート（「案件名: 〇〇」形式のテキストから複数案件を一括登録）
- メンバー管理（チームメンバーのアカウント追加）

## ローカルで試す

```bash
cp .env.example .env
npm install
npm run seed   # チェックリストカタログ＋初期アカウントを投入
npm start
```

`http://localhost:3000` を開き、`.env` の `SEED_ADMIN_USERNAME` / `SEED_ADMIN_PASSWORD`
（初期値: ueda / change-me-please）でログインします。ログイン後は「メンバー管理」から
チームメンバーのアカウントを追加してください。

## Renderへのデプロイ

このリポジトリには `render.yaml`（Blueprint）が含まれているため、GitHubにpushした上で
Render側で「New +」→「Blueprint」からこのリポジトリを選択すれば、
Web Service と PostgreSQL データベースがまとめて作成されます。

1. このコードをGitHubリポジトリにpushする
2. Renderダッシュボード → New + → Blueprint → 対象リポジトリを選択
3. `SEED_ADMIN_USERNAME` / `SEED_ADMIN_PASSWORD` / `SEED_ADMIN_DISPLAY_NAME` の環境変数を設定
   （render.yaml上は `sync: false` にしているため、Render側の環境変数タブで手入力してください）
4. デプロイ完了後、Renderの「Shell」タブ（またはワンオフジョブ）で `npm run seed` を1回だけ実行
   → チェックリストカタログと初期アカウントが投入されます
5. 発行されたURLにアクセスし、初期アカウントでログイン → パスワード変更 →
   「メンバー管理」からチームメンバーを追加

### 既存の kawano-njss-modoki との関係

このアプリは意図的に**別サービス**として構築しています。
kawano-njss-modoki（入札検索・前工程）とは役割・データモデルが異なるため、
別サービスにすることで既存アプリへの影響なく独立して運用・デプロイできます。
同じRenderアカウント内であれば、複数のWeb Service／Databaseを問題なく同時に持てます。

## チェックリスト項目について

区分①〜⑦・53項目は、施工体制台帳・建退共・CORINS登録などに関する一般的な標準項目として
作成した参考セットです（Claude Artifact版に保存されていた実データはネットワーク制約により
本セッションからは読み取れなかったため、原文そのままではありません）。
`db/seed.js` の `CATEGORIES` 配列を編集して `npm run seed` を再実行すれば、
文言の修正・追加・削除がいつでも反映できます（既存データが入っている場合は
`checklist_categories` / `checklist_items` テーブルを直接編集してください）。
