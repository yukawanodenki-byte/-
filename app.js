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

  document.querySelectorAll('.item-toggle').forEach((el) => {
    el.addEventListener('change', () => {
      const projectId = el.dataset.project;
      const itemId = el.dataset.item;
      postJSON(`/api/projects/${projectId}/items/${itemId}/toggle`, { checked: el.checked });
    });
  });

  document.querySelectorAll('.doc-toggle').forEach((el) => {
    el.addEventListener('change', () => {
      const projectId = el.dataset.project;
      const key = el.dataset.key;
      postJSON(`/api/projects/${projectId}/documents/${key}/toggle`, { obtained: el.checked });
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
