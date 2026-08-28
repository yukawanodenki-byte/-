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

  function applyStatusClass(selectEl) {
    selectEl.classList.remove('status-not_started', 'status-in_progress', 'status-submitted', 'status-revising');
    selectEl.classList.add('status-' + selectEl.value);
  }

  document.querySelectorAll('.status-select').forEach((el) => applyStatusClass(el));

  document.querySelectorAll('.item-status').forEach((el) => {
    el.addEventListener('change', () => {
      applyStatusClass(el);
      const projectId = el.dataset.project;
      const itemId = el.dataset.item;
      postJSON(`/api/projects/${projectId}/items/${itemId}/status`, { status: el.value });
    });
  });

  document.querySelectorAll('.doc-status').forEach((el) => {
    el.addEventListener('change', () => {
      applyStatusClass(el);
      const projectId = el.dataset.project;
      const key = el.dataset.key;
      postJSON(`/api/projects/${projectId}/documents/${key}/status`, { status: el.value });
    });
  });

  document.querySelectorAll('.doc-link').forEach((el) => {
    el.addEventListener('change', () => {
      const projectId = el.dataset.project;
      const key = el.dataset.key;
      const openBtn = el.parentElement.querySelector('.doc-open-link');
      if (openBtn) {
        if (el.value.trim()) {
          openBtn.href = el.value.trim();
          openBtn.style.visibility = 'visible';
        } else {
          openBtn.style.visibility = 'hidden';
        }
      }
      postJSON(`/api/projects/${projectId}/documents/${key}/link`, { link_url: el.value });
    });
  });

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
