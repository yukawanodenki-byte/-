(function () {
  const indicator = document.getElementById('saveIndicator');
  function flashSaved() {
    if (!indicator) return;
    indicator.textContent = '保存しました';
    indicator.classList.add('saved');
    setTimeout(() => {
      indicator.textContent = '';
      indicator.classList.remove('saved');
    }, 1500);
  }
  function flashSaving() {
    if (!indicator) return;
    indicator.textContent = '保存中…';
    indicator.classList.remove('saved');
  }

  async function postJSON(url, body) {
    flashSaving();
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.ok) flashSaved();
    return res;
  }

  const STATUS_CLASSES = ['status-not_started', 'status-in_progress', 'status-submitted', 'status-revising', 'status-not_applicable', 'status-obtaining', 'status-saved'];
  function applyStatusClass(selectEl) {
    selectEl.classList.remove(...STATUS_CLASSES);
    selectEl.classList.add('status-' + selectEl.value);
  }

  document.querySelectorAll('.status-select').forEach((el) => applyStatusClass(el));

  // ---- 必須書類／チェックリスト項目 共通（field-row）----
  function endpointBase(row) {
    const kind = row.dataset.kind;
    const projectId = row.dataset.project;
    const ref = row.dataset.ref;
    return kind === 'doc'
      ? `/api/projects/${projectId}/documents/${encodeURIComponent(ref)}`
      : `/api/projects/${projectId}/items/${ref}`;
  }

  document.querySelectorAll('.field-row').forEach((row) => {
    const base = endpointBase(row);
    const statusSel = row.querySelector('.field-status');
    const dueInput = row.querySelector('.field-due');
    const linkInput = row.querySelector('.field-link');
    const openBtn = row.querySelector('.field-open-link');
    const noteWrap = row.querySelector('.field-note-wrap');
    const noteInput = row.querySelector('.field-note');
    const submittedAtInput = row.querySelector('.field-submitted-at');
    const submissionMethodInput = row.querySelector('.field-submission-method');

    function saveSubmission() {
      postJSON(`${base}/submission`, {
        submitted_at: submittedAtInput ? submittedAtInput.value : '',
        submission_method: submissionMethodInput ? submissionMethodInput.value : '',
      });
    }

    // 必須書類（doc）は「保存済み」、チェックリスト項目（item）は「提出済み」が完了扱いの値
    const terminalStatus = row.dataset.kind === 'doc' ? 'saved' : 'submitted';
    if (statusSel) {
      statusSel.addEventListener('change', () => {
        applyStatusClass(statusSel);
        if (noteWrap) noteWrap.style.display = statusSel.value === 'not_applicable' ? '' : 'none';
        postJSON(`${base}/status`, { status: statusSel.value });
        // 完了扱いの値に変えたのに実績日が空なら、今日の日付を自動で入れておく（入れ忘れ防止。手で修正も可能）
        if (statusSel.value === terminalStatus && submittedAtInput && !submittedAtInput.value) {
          submittedAtInput.value = new Date().toISOString().slice(0, 10);
          saveSubmission();
        }
      });
    }
    if (dueInput) {
      dueInput.addEventListener('change', () => {
        postJSON(`${base}/due`, { due_date: dueInput.value });
      });
    }
    if (submittedAtInput) submittedAtInput.addEventListener('change', saveSubmission);
    if (submissionMethodInput) submissionMethodInput.addEventListener('change', saveSubmission);
    // 保存先リンクの「開く」ボタン：http(s)://のURLはブラウザで直接開けるが、
    // \\server\... のような共有サーバーのパスは、ブラウザのセキュリティ制限により
    // web画面からのリンククリックでは開けない仕様になっている（file://やUNCパスへの
    // 遷移はChrome等が意図的にブロックしている。Chromeの公式な仕様）。そのため、URL以外は
    // 「開く」ではなく「パスをコピー」ボタンとして動作させ、エクスプローラーのアドレス欄等に
    // 貼り付けてもらう方式にする。
    function isWebUrl(v) {
      return /^https?:\/\//i.test(v);
    }
    function updateOpenBtn() {
      if (!openBtn || !linkInput) return;
      const val = linkInput.value.trim();
      if (!val) {
        openBtn.style.visibility = 'hidden';
        return;
      }
      openBtn.style.visibility = 'visible';
      if (isWebUrl(val)) {
        openBtn.textContent = '開く';
        openBtn.dataset.mode = 'url';
      } else {
        openBtn.textContent = '📋 パスをコピー';
        openBtn.dataset.mode = 'copy';
      }
    }
    updateOpenBtn();
    if (openBtn) {
      openBtn.addEventListener('click', () => {
        const val = linkInput ? linkInput.value.trim() : '';
        if (!val) return;
        if (openBtn.dataset.mode === 'url') {
          window.open(val, '_blank', 'noopener');
        } else if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(val).then(() => {
            const original = openBtn.textContent;
            openBtn.textContent = 'コピーしました';
            setTimeout(() => { openBtn.textContent = original; }, 1200);
          }).catch(() => {
            alert('コピーに失敗しました。お手数ですが欄の文字を選択してコピーしてください。\n\n保存先パス:\n' + val);
          });
        } else {
          alert('このブラウザは自動コピーに対応していません。お手数ですが欄の文字を選択してコピーしてください。\n\n保存先パス:\n' + val);
        }
      });
    }
    if (linkInput) {
      linkInput.addEventListener('change', () => {
        updateOpenBtn();
        postJSON(`${base}/link`, { link_url: linkInput.value });
      });
    }
    if (noteInput) {
      noteInput.addEventListener('change', () => {
        postJSON(`${base}/note`, { status_note: noteInput.value });
      });
    }

    // ---- 協力業者への依頼 ----
    const contractorName = row.querySelector('.contractor-name');
    const contractorDate = row.querySelector('.contractor-date');
    const contractorDetail = row.querySelector('.contractor-detail');
    function saveContractor() {
      postJSON(`${base}/contractor`, {
        contractor_name: contractorName ? contractorName.value : '',
        requested_at: contractorDate ? contractorDate.value : '',
        request_detail: contractorDetail ? contractorDetail.value : '',
      });
    }
    if (contractorName) contractorName.addEventListener('change', saveContractor);
    if (contractorDate) contractorDate.addEventListener('change', saveContractor);
    if (contractorDetail) contractorDetail.addEventListener('change', saveContractor);
  });

  // ---- 保存先リンク欄のドラッグ＆ドロップ ----
  // ブラウザの仕様上、ドロップされたファイル/フォルダの完全なパス（\\server\...等）は取得できないため、
  // ファイル名・フォルダ名だけを自動入力する（完全なパスは手入力での補完が必要）。
  document.querySelectorAll('.dropzone').forEach((el) => {
    el.addEventListener('dragover', (e) => {
      e.preventDefault();
      el.classList.add('drag-over');
    });
    el.addEventListener('dragleave', () => el.classList.remove('drag-over'));
    el.addEventListener('drop', (e) => {
      e.preventDefault();
      el.classList.remove('drag-over');
      let name = '';
      if (e.dataTransfer.items && e.dataTransfer.items.length) {
        const item = e.dataTransfer.items[0];
        const entry = item.webkitGetAsEntry && item.webkitGetAsEntry();
        if (entry) name = entry.name;
      }
      if (!name && e.dataTransfer.files && e.dataTransfer.files.length) {
        name = e.dataTransfer.files[0].name;
      }
      if (name) {
        el.value = el.value.trim() ? el.value : name;
        el.dispatchEvent(new Event('change'));
      }
    });
  });

  // ---- 画面配色（白基調／黒基調／青基調をメンバーごとに選択・保存） ----
  const themeSwitcher = document.querySelector('.theme-switcher');
  if (themeSwitcher) {
    function markActiveTheme(theme) {
      themeSwitcher.querySelectorAll('.theme-btn').forEach((btn) => {
        btn.classList.toggle('active', btn.dataset.themeChoice === theme);
      });
    }
    markActiveTheme(themeSwitcher.dataset.current || 'white');
    themeSwitcher.querySelectorAll('.theme-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const theme = btn.dataset.themeChoice;
        document.documentElement.setAttribute('data-theme', theme);
        markActiveTheme(theme);
        postJSON('/api/theme', { theme });
      });
    });
  }

  // ---- チェックリスト区分の「すべて開く／すべて閉じる」 ----
  const expandAllBtn = document.getElementById('expandAllCategories');
  const collapseAllBtn = document.getElementById('collapseAllCategories');
  if (expandAllBtn) {
    expandAllBtn.addEventListener('click', () => {
      document.querySelectorAll('.checklist-category').forEach((d) => { d.open = true; });
    });
  }
  if (collapseAllBtn) {
    collapseAllBtn.addEventListener('click', () => {
      document.querySelectorAll('.checklist-category').forEach((d) => { d.open = false; });
    });
  }

  // ---- 基本情報（自動保存：どの項目を変更しても保存ボタン無しですぐ保存される） ----
  const basicInfoForm = document.getElementById('basicInfoForm');
  if (basicInfoForm) {
    const projectId = basicInfoForm.dataset.project;
    function saveBasicInfo() {
      const body = {};
      basicInfoForm.querySelectorAll('.basic-info-field').forEach((el) => {
        body[el.name] = el.value;
      });
      postJSON(`/api/projects/${projectId}/info`, body);
    }
    basicInfoForm.querySelectorAll('.basic-info-field').forEach((el) => {
      el.addEventListener('change', saveBasicInfo);
    });
  }

  // ---- 体制・工程 ----
  document.querySelectorAll('.tech-col').forEach((col) => {
    const projectId = col.dataset.project;
    const role = col.dataset.role;
    const nameInput = col.querySelector('.tech-name');
    const startInput = col.querySelector('.tech-start');
    const endInput = col.querySelector('.tech-end');
    const exclusiveInputs = col.querySelectorAll('.tech-exclusive');

    function save() {
      const exclusive = col.querySelector('.tech-exclusive:checked')
        ? col.querySelector('.tech-exclusive:checked').value
        : 'true';
      postJSON(`/api/projects/${projectId}/technicians/${encodeURIComponent(role)}`, {
        person_name: nameInput.value,
        exclusive,
        start_date: startInput.value,
        end_date: endInput.value,
      });
    }

    nameInput.addEventListener('change', save);
    startInput.addEventListener('change', save);
    endInput.addEventListener('change', save);
    exclusiveInputs.forEach((r) => r.addEventListener('change', save));
  });

  // ---- メンバー管理：編集フォームの開閉 ----
  document.querySelectorAll('.user-edit-toggle').forEach((btn) => {
    btn.addEventListener('click', () => {
      const row = document.querySelector(`.user-edit-row[data-user-id="${btn.dataset.userId}"]`);
      if (!row) return;
      row.style.display = row.style.display === 'none' ? '' : 'none';
    });
  });
})();
