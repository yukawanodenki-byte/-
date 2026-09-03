<%- include('header', { title: project.name }) %>
<div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:8px;">
  <div>
    <h1><%= project.name %><% if (project.is_low_bid) { %><span class="lowbid-badge">🔻 低入札</span><% } %></h1>
    <div class="assignee">👤 作成担当者: <%= assigneeName || '未設定' %><% if (agencyGroupKey) { %> ／ 発注機関系統: <%= agencyGroupKey %><% } %></div>
  </div>
  <span class="save-indicator" id="saveIndicator"></span>
</div>
<p><a href="/">← 案件一覧に戻る</a></p>

<% if (message) { %>
  <div class="card" style="border-color:var(--accent);"><%= message %></div>
<% } %>

<div class="project-layout">
<div class="project-main-col">

<div class="card">
  <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
    <h2>基本情報</h2>
    <span class="basic-info-autosave-note">✎ 各項目は入力すると自動で保存されます（保存ボタンは不要です）</span>
  </div>
  <div id="basicInfoForm" data-project="<%= project.id %>">
    <label>案件名</label>
    <input type="text" name="name" class="basic-info-field" value="<%= project.name %>">
    <label>発注機関</label>
    <input type="text" name="agency" class="basic-info-field" value="<%= project.agency || '' %>">
    <label>契約金額</label>
    <input type="text" name="contract_amount" class="basic-info-field" value="<%= project.contract_amount || '' %>">
    <label>工期</label>
    <input type="text" name="period_text" class="basic-info-field" value="<%= project.period_text || '' %>">
    <label>作成担当者</label>
    <select name="assignee_user_id" class="basic-info-field">
      <option value="">未設定</option>
      <% users.forEach(function (u) { %>
        <option value="<%= u.id %>" <%= project.assignee_user_id === u.id ? 'selected' : '' %>><%= u.display_name %></option>
      <% }) %>
    </select>
    <label>共有フォルダのリンク（ドラッグ＆ドロップ可）</label>
    <input type="text" name="folder_url" class="basic-info-field dropzone" value="<%= project.folder_url || '' %>" placeholder="例: \\server\projects\〇〇工事 または https://... 、ファイル/フォルダをドラッグしても入力できます">
    <p class="helptext">全員が使っている共有サーバー上のこの案件のフォルダへのリンクです。保存すると案件一覧・このページ上部からすぐ開けます。書類ごとの保存先リンクは下の各行で個別に設定できます。
      ※ ドラッグ＆ドロップはブラウザの仕様上、ファイル名・フォルダ名のみ自動入力されます。完全な保存先（\\server\...等）は自動入力後に手で補ってください。</p>

    <h3 style="font-size:14px;margin:20px 0 4px;">年間工程表用（施工期間）</h3>
    <div class="form-grid form-grid-2">
      <div>
        <label>着工日</label>
        <input type="date" name="construction_start_date" class="basic-info-field" value="<%= project.construction_start_date ? project.construction_start_date.toISOString().slice(0,10) : '' %>">
      </div>
      <div>
        <label>完成期日（完工日）</label>
        <input type="date" name="construction_end_date" class="basic-info-field" value="<%= project.construction_end_date ? project.construction_end_date.toISOString().slice(0,10) : '' %>">
      </div>
    </div>
    <p class="helptext">この2つの日付が案件一覧の「工期」と「<a href="/timeline">年間工程表</a>」の施工期間バーに反映されます。<strong>未入力のままだと年間工程表に「期間未設定」の警告が出ます。</strong>間違えないよう、必ず工事着手届・完成届等の原本の日付で入力してください。</p>

    <h3 style="font-size:14px;margin:20px 0 4px;">発注機関の連絡先（基本情報）</h3>
    <div class="form-grid form-grid-2">
      <div>
        <label>契約担当者 氏名</label>
        <input type="text" name="contract_officer_name" class="basic-info-field" value="<%= project.contract_officer_name || '' %>" placeholder="発注機関側・契約担当の氏名">
      </div>
      <div>
        <label>契約担当者 電話番号</label>
        <input type="text" name="contract_officer_phone" class="basic-info-field" value="<%= project.contract_officer_phone || '' %>">
      </div>
      <div>
        <label>監督職員 氏名</label>
        <input type="text" name="supervisor_name" class="basic-info-field" value="<%= project.supervisor_name || '' %>" placeholder="現場を監督する発注機関側の担当者">
      </div>
      <div>
        <label>監督職員 電話番号</label>
        <input type="text" name="supervisor_phone" class="basic-info-field" value="<%= project.supervisor_phone || '' %>">
      </div>
    </div>
    <label>郵送物の送り先</label>
    <textarea name="mailing_address" class="basic-info-field" rows="2" placeholder="書類等を郵送する際の宛先住所・部署名"><%= project.mailing_address || '' %></textarea>
  </div>

  <div class="lowbid-toggle-wrap" data-autosave="project" data-project="<%= project.id %>" style="margin-top:16px;">
    <button type="button" class="btn secondary lowbid-toggle-btn">🔻 低入札案件として登録</button>
    <input type="hidden" class="lowbid-toggle-input" value="<%= project.is_low_bid ? 'true' : 'false' %>">
    <p class="helptext lowbid-toggle-help" style="display:none;">低入札価格調査で一般的に求められる書類（16項目）を、必須書類とは別の専用リストとしてこの案件に追加しています。実際に必要な書類は発注機関の指示に必ず従って確認してください。</p>
  </div>

  <div style="margin-top:16px;">
    <form method="post" action="/projects/<%= project.id %>/archive" style="display:inline"
      onsubmit="return confirm('この案件をアーカイブしますか？一覧から非表示になります。')">
      <button class="btn secondary" type="submit">アーカイブ</button>
    </form>
    <form method="post" action="/projects/<%= project.id %>/delete" style="display:inline"
      onsubmit="return confirm('本当に「<%= project.name %>」を完全に削除しますか？\n\nこの操作は元に戻せません（アーカイブと違い、案件のデータそのものが消えます）。削除前の状態は自動でバックアップされますが、復元するには「バックアップ」ページからデータベース全体を丸ごと過去の状態に戻す必要があり、他の案件への更新も一緒に巻き戻ってしまいます。\n\n本当によろしければOKを押してください。')">
      <button class="btn secondary" type="submit" style="color:var(--red);border-color:var(--red);">🗑 完全に削除</button>
    </form>
    <% if (project.folder_url) { %>
      <button type="button" class="btn secondary folder-open-link"
        data-value="<%= project.folder_url %>" data-open-label="📁 共有フォルダを開く">📁 共有フォルダを開く</button>
    <% } %>
  </div>
</div>

<div class="card">
  <h2>体制・工程</h2>
  <div class="tech-grid">
    <% ['監理技術者','主任技術者','現場代理人'].forEach(role => {
      const t = techMap[role] || {};
    %>
      <div class="tech-col" data-role="<%= role %>" data-project="<%= project.id %>">
        <h4><%= role %></h4>
        <label>氏名</label>
        <input type="text" class="tech-name" value="<%= t.person_name || '' %>" placeholder="未配置なら × など">
        <div class="switch">
          <label style="margin:0;display:flex;align-items:center;gap:4px;">
            <input type="radio" name="exclusive-<%= role %>" class="tech-exclusive" value="true" <%= (t.exclusive === undefined || t.exclusive) ? 'checked' : '' %>> 専任
          </label>
          <label style="margin:0;display:flex;align-items:center;gap:4px;">
            <input type="radio" name="exclusive-<%= role %>" class="tech-exclusive" value="false" <%= (t.exclusive === false) ? 'checked' : '' %>> 非専任
          </label>
        </div>
        <div class="dates">
          <div>
            <label>開始日</label>
            <input type="date" class="tech-start" value="<%= t.start_date ? t.start_date.toISOString().slice(0,10) : '' %>">
          </div>
          <div>
            <label>終了日</label>
            <input type="date" class="tech-end" value="<%= t.end_date ? t.end_date.toISOString().slice(0,10) : '' %>">
          </div>
        </div>
      </div>
    <% }) %>
  </div>
  <p class="helptext">同一氏名の技術者が期間の重なる複数案件に配置されている場合、案件一覧にバッジで表示されます（専任同士＝赤、非専任同士＝青）。</p>
</div>

<div class="card">
  <h2>必須書類</h2>
  <% REQUIRED_DOC_KEYS.forEach(key => {
    const row = docsMap[key] || { status: 'not_started' };
    const precedentList = (precedents.docMap || {})[key] || [];
  %>
    <%- include('field_row', {
      kind: 'doc', ref: key, projectId: project.id,
      label: REQUIRED_DOC_LABELS[key], note: null,
      description: REQUIRED_DOC_DESCRIPTIONS[key],
      statusRow: row, precedents: precedentList,
      STATUS_VALUES: STATUS_VALUES, STATUS_LABELS: STATUS_LABELS,
      DOC_STATUS_VALUES: DOC_STATUS_VALUES, DOC_STATUS_LABELS: DOC_STATUS_LABELS,
      extraLink: key === 'uchiwakesho' ? { href: '/templates', label: '📄 雛形をプレビュー' } : null,
    }) %>
  <% }) %>
  <p class="helptext">ステータスは「未着手／取得中／保存済み」の3段階です（発注機関からの受領・保管状況の確認が目的のため、チェックリストとは異なる段階になっています）。「期限」は取得予定日、「保存日」は実際に保存できた日です（ステータスを「保存済み」に変えると、保存日が未入力なら自動で今日の日付が入ります。違う日の場合は手で直してください）。リンク欄には共有サーバー上の保存先（フォルダ/ファイルのパスやURL）を入力してください。ファイルそのものはこの画面には保存されません。</p>
</div>

<% if (project.is_low_bid) {
  const lowBidDone = LOW_BID_DOC_KEYS.filter(k => ['submitted','not_applicable'].includes((docsMap[k]||{}).status)).length;
%>
<div class="card">
  <details class="checklist-category lowbid-details" open>
    <summary>低入札価格調査 関連書類<span class="lowbid-badge">🔻 低入札</span> <span class="cat-count">(<%= lowBidDone %>/<%= LOW_BID_DOC_KEYS.length %>)</span></summary>
    <p class="helptext">低入札価格調査で一般的に求められる書類の標準チェックリストです（国土交通省・日本下水道事業団等の公開様式を参考に作成）。<strong>実際に必要な書類・様式は発注機関・案件により異なるため、必ず当該案件の入札説明書・発注機関からの提出依頼と突き合わせて確認してください。</strong>ステータスは「未着手／作成中／提出済み／修正中／対象外」の5段階です（発注機関へ提出する書類を作成する欄のため、チェックリストと同じ段階になっています）。書式のテンプレートは<a href="/templates">書類テンプレート</a>ページからプレビュー・ダウンロードできます。</p>
    <% LOW_BID_DOC_KEYS.forEach(key => {
      const row = docsMap[key] || { status: 'not_started' };
      const precedentList = (precedents.docMap || {})[key] || [];
    %>
      <%- include('field_row', {
        kind: 'doc', statusScheme: 'create', ref: key, projectId: project.id,
        label: LOW_BID_DOC_LABELS[key], note: null,
        description: LOW_BID_DOC_DESCRIPTIONS[key],
        statusRow: row, precedents: precedentList,
        STATUS_VALUES: STATUS_VALUES, STATUS_LABELS: STATUS_LABELS,
        DOC_STATUS_VALUES: DOC_STATUS_VALUES, DOC_STATUS_LABELS: DOC_STATUS_LABELS,
        extraLink: null,
      }) %>
    <% }) %>
  </details>
</div>
<% } %>

<div class="card">
  <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
    <h2>チェックリスト</h2>
    <span>
      <button type="button" class="btn secondary" id="expandAllCategories">すべて開く</button>
      <button type="button" class="btn secondary" id="collapseAllCategories">すべて閉じる</button>
    </span>
  </div>
  <p class="helptext">区分（①②③④…）は初期状態では閉じています。見出しをクリックすると開閉できます。未完了の項目がある区分ほど上の数字が小さく表示されます。</p>
  <% itemsByCategory.forEach(group => {
    const catDone = group.items.filter(it => ['submitted','not_applicable'].includes((statusMap[it.id]||{}).status)).length;
  %>
    <details class="checklist-category">
      <summary><%= group.category.name %> <span class="cat-count">(<%= catDone %>/<%= group.items.length %>)</span></summary>
      <% group.items.forEach(item => {
        const row = statusMap[item.id] || { status: 'not_started' };
        const precedentList = (precedents.itemMap || {})[item.id] || [];
      %>
        <%- include('field_row', {
          kind: 'item', ref: item.id, projectId: project.id,
          label: item.text, note: item.note,
          description: item.description,
          statusRow: row, precedents: precedentList,
          STATUS_VALUES: STATUS_VALUES, STATUS_LABELS: STATUS_LABELS,
          DOC_STATUS_VALUES: DOC_STATUS_VALUES, DOC_STATUS_LABELS: DOC_STATUS_LABELS,
        }) %>
      <% }) %>
    </details>
  <% }) %>
</div>

</div>
<!-- /project-main-col -->

<div class="project-side-col">
<div class="card" id="contacts">
  <h2>発注機関とのやり取り履歴</h2>
  <p class="helptext">電話・メール等でのやり取りを時系列で記録しておく欄です。「こちらから」「相手から」を選んでおくと、川野電気がアクションしたか・その後返信があったかが一覧で見返せます。リンク欄にはメールへのリンク（Gmailのメッセージリンク等）やmailto:リンクも貼り付けられます。</p>

  <form method="post" action="/projects/<%= project.id %>/contacts" style="margin-bottom:16px;display:flex;flex-direction:column;gap:10px;">
    <div>
      <label>日付</label>
      <input type="date" name="contact_date" required value="<%= new Date().toISOString().slice(0,10) %>">
    </div>
    <div>
      <label>方法</label>
      <select name="method">
        <% CONTACT_METHOD_VALUES.forEach(v => { %>
          <option value="<%= v %>"><%= CONTACT_METHOD_LABELS[v] %></option>
        <% }) %>
      </select>
    </div>
    <div>
      <label>方向</label>
      <select name="direction">
        <% CONTACT_DIRECTION_VALUES.forEach(v => { %>
          <option value="<%= v %>"><%= CONTACT_DIRECTION_LABELS[v] %></option>
        <% }) %>
      </select>
    </div>
    <div>
      <label>相手（氏名・部署等）</label>
      <input type="text" name="counterpart" placeholder="例: 契約担当 〇〇様">
    </div>
    <div>
      <label>内容</label>
      <textarea name="summary" rows="2" required placeholder="やり取りの内容を記入してください"></textarea>
    </div>
    <div>
      <label>リンク（メールへのリンク等・任意）</label>
      <input type="text" name="link_url" placeholder="例: メールの共有リンク、mailto:... など">
    </div>
    <div>
      <button class="btn" type="submit">＋ 記録を追加</button>
    </div>
  </form>

  <% if (contacts.length === 0) { %>
    <p>まだ記録がありません。</p>
  <% } else { %>
    <div class="contact-timeline">
      <% contacts.forEach(c => { %>
        <div class="contact-entry contact-<%= c.direction %>">
          <div class="contact-entry-head">
            <span class="contact-date"><%= new Date(c.contact_date).toLocaleDateString('ja-JP') %></span>
            <span class="contact-method-badge"><%= CONTACT_METHOD_LABELS[c.method] || c.method %></span>
            <span class="contact-direction-badge"><%= CONTACT_DIRECTION_LABELS[c.direction] || c.direction %></span>
            <% if (c.counterpart) { %><span class="contact-counterpart"><%= c.counterpart %></span><% } %>
          </div>
          <p class="contact-summary"><%= c.summary %></p>
          <% if (c.link_url) { %>
            <button type="button" class="contact-open-link" data-value="<%= c.link_url %>" data-open-label="🔗 リンクを開く">🔗 リンクを開く</button>
          <% } %>
          <div class="contact-entry-foot">
            <span class="contact-meta">記録: <%= c.created_by_name || '（不明）' %> ・ <%= new Date(c.created_at).toLocaleString('ja-JP') %></span>
            <form method="post" action="/projects/<%= project.id %>/contacts/<%= c.id %>/delete" style="display:inline"
              onsubmit="return confirm('この記録を削除しますか？')">
              <button class="btn secondary" type="submit" style="padding:2px 8px;font-size:12px;">削除</button>
            </form>
          </div>
        </div>
      <% }) %>
    </div>
  <% } %>
</div>
</div>
<!-- /project-side-col -->

</div>
<!-- /project-layout -->

<%- include('footer') %>
