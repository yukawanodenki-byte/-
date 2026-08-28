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

  const STATUS_CLASSES = ['status-not_started', 'status-in_progress', 'status-submitted', 'status-revising', 'status-not_applicable'];
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

    if (statusSel) {
      statusSel.addEventListener('change', () => {
        applyStatusClass(statusSel);
        if (noteWrap) noteWrap.style.display = statusSel.value === 'not_applicable' ? '' : 'none';
        postJSON(`${base}/status`, { status: statusSel.value });
      });
    }
    if (dueInput) {
      dueInput.addEventListener('change', () => {
        postJSON(`${base}/due`, { due_date: dueInput.value });
      });
    }
    if (linkInput) {
      linkInput.addEventListener('change', () => {
        if (openBtn) {
          if (linkInput.value.trim()) {
            openBtn.href = linkInput.value.trim();
            openBtn.style.visibility = 'visible';
          } else {
            openBtn.style.visibility = 'hidden';
          }
        }
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
})();
