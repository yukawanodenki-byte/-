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

  // 「開く／パスをコピー」共通ロジック：http(s)://のURLはブラウザで直接開けるが、
  // \\server\... のような共有サーバーのパスは、ブラウザのセキュリティ制限により
  // web画面からのリンククリックでは開けない仕様になっている（file://やUNCパスへの
  // 遷移はChrome等が意図的にブロックしている。Chromeの公式な仕様）。そのため、URL以外は
  // 「開く」ではなく「パスをコピー」ボタンとして動作させ、エクスプローラーのアドレス欄等に
  // 貼り付けてもらう方式にする。保存先リンク欄（field-row）・共有フォルダのリンク（案件詳細・
  // 案件一覧カード）のどちらでも同じロジックを使う。
  function isWebUrl(v) {
    return /^(https?:|mailto:)/i.test(v);
  }
  function applySmartLinkMode(btn, val) {
    if (!val) {
      btn.style.visibility = 'hidden';
      return;
    }
    btn.style.visibility = 'visible';
    if (isWebUrl(val)) {
      btn.textContent = btn.dataset.openLabel || '開く';
      btn.dataset.mode = 'url';
    } else {
      btn.textContent = '📋 パスをコピー';
      btn.dataset.mode = 'copy';
    }
  }
  function handleSmartLinkClick(btn, val) {
    if (!val) return;
    if (btn.dataset.mode === 'url') {
      window.open(val, '_blank', 'noopener');
    } else if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(val).then(() => {
        const original = btn.textContent;
        btn.textContent = 'コピーしました';
        setTimeout(() => { btn.textContent = original; }, 1200);
      }).catch(() => {
        alert('コピーに失敗しました。お手数ですが欄の文字を選択してコピーしてください。\n\n保存先パス:\n' + val);
      });
    } else {
      alert('このブラウザは自動コピーに対応していません。お手数ですが欄の文字を選択してコピーしてください。\n\n保存先パス:\n' + val);
    }
  }

  // ---- 案件の「共有フォルダ」リンク（案件詳細ページ・案件一覧カード）----
  document.querySelectorAll('.folder-open-link').forEach((btn) => {
    const val = (btn.dataset.value || '').trim();
    applySmartLinkMode(btn, val);
    btn.addEventListener('click', (e) => {
      e.stopPropagation(); // 案件一覧カード（外側がリンク）の中にあるため、カード自体への遷移を止める
      handleSmartLinkClick(btn, val);
    });
  });

  // ---- やり取り履歴の各記録に付けたリンク（メールへのリンク等）----
  document.querySelectorAll('.contact-open-link').forEach((btn) => {
    const val = (btn.dataset.value || '').trim();
    applySmartLinkMode(btn, val);
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      handleSmartLinkClick(btn, val);
    });
  });

  // ---- 低入札トグルボタン（案件追加フォーム／案件詳細の基本情報）----
  // 案件詳細ページ（data-autosave="project"）ではクリック時にすぐサーバーへ反映する。
  // 案件追加フォームではhidden inputの値がそのままフォーム送信される。
  document.querySelectorAll('.lowbid-toggle-wrap').forEach((wrap) => {
    const btn = wrap.querySelector('.lowbid-toggle-btn');
    const input = wrap.querySelector('.lowbid-toggle-input');
    const help = wrap.querySelector('.lowbid-toggle-help');
    if (!btn || !input) return;
    function render() {
      const active = input.value === 'true';
      btn.classList.toggle('active', active);
      btn.textContent = active ? '✅ 低入札案件（解除する場合はクリック）' : '🔻 低入札案件として登録';
      if (help) help.style.display = active ? '' : 'none';
    }
    render();
    btn.addEventListener('click', () => {
      input.value = input.value === 'true' ? 'false' : 'true';
      render();
      if (wrap.dataset.autosave === 'project' && wrap.dataset.project) {
        postJSON(`/api/projects/${wrap.dataset.project}/low-bid`, { is_low_bid: input.value });
      }
    });
  });

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

    // 「保存の確認」目的の行（必須書類）は「保存済み」、「作成・提出」目的の行
    // （チェックリスト項目・低入札関連書類）は「提出済み」が完了扱いの値
    const terminalStatus = row.dataset.statusScheme === 'store' ? 'saved' : 'submitted';
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
    // 保存先リンクの「開く／パスをコピー」ボタン（ロジック本体は共通関数を利用）
    function updateOpenBtn() {
      if (!openBtn || !linkInput) return;
      applySmartLinkMode(openBtn, linkInput.value.trim());
    }
    updateOpenBtn();
    if (openBtn) {
      openBtn.addEventListener('click', () => {
        handleSmartLinkClick(openBtn, linkInput ? linkInput.value.trim() : '');
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
    const engineerSelect = col.querySelector('.tech-engineer');
    const startInput = col.querySelector('.tech-start');
    const endInput = col.querySelector('.tech-end');
    const exclusiveInputs = col.querySelectorAll('.tech-exclusive');

    function save() {
      const exclusive = col.querySelector('.tech-exclusive:checked')
        ? col.querySelector('.tech-exclusive:checked').value
        : 'true';
      postJSON(`/api/projects/${projectId}/technicians/${encodeURIComponent(role)}`, {
        person_name: nameInput.value,
        engineer_id: engineerSelect ? engineerSelect.value : '',
        exclusive,
        start_date: startInput.value,
        end_date: endInput.value,
      });
    }

    // 技術者マスタから選んだときは氏名欄をマスタの表記で埋めて読み取り専用にする
    // （選択を外せば従来どおり手入力できる）。
    if (engineerSelect) {
      engineerSelect.addEventListener('change', () => {
        if (engineerSelect.value) {
          const label = engineerSelect.options[engineerSelect.selectedIndex].textContent.trim();
          nameInput.value = label;
          nameInput.readOnly = true;
        } else {
          nameInput.readOnly = false;
        }
        save();
      });
    }
    nameInput.addEventListener('change', save);
    startInput.addEventListener('change', save);
    endInput.addEventListener('change', save);
    exclusiveInputs.forEach((r) => r.addEventListener('change', save));
  });

  // ---- 発注機関の類似ワード検索（案件の基本情報欄） ----
  // 入力するたびにサーバーへ問い合わせ、表記が多少違っても近い機関を候補に出す。
  // 候補を選ぶとマスタのIDが紐付き、「同系統発注機関での実績」の判定が正確になる。
  document.querySelectorAll('.agency-picker').forEach((picker) => {
    const input = picker.querySelector('.agency-input');
    const idInput = picker.querySelector('.agency-id-input');
    const suggest = picker.querySelector('.agency-suggest');
    const note = picker.querySelector('.agency-picker-note');
    const projectId = picker.dataset.project;
    let timer = null;
    let lastQuery = '';

    function hideSuggest() {
      suggest.hidden = true;
      suggest.innerHTML = '';
    }

    function renderSuggest(results, query) {
      suggest.innerHTML = '';
      const exact = results.some((r) => r.name === query);
      if (results.length === 0 && !query) return hideSuggest();

      results.forEach((r) => {
        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'agency-suggest-item';
        item.innerHTML = `<strong></strong> <span class="helptext"></span>`;
        item.querySelector('strong').textContent = r.name;
        item.querySelector('span').textContent = `${r.kindLabel}${r.group_key ? ' / ' + r.group_key : ''}`;
        item.addEventListener('click', () => {
          input.value = r.name;
          idInput.value = r.id;
          hideSuggest();
          if (note) note.textContent = '✓ 発注機関マスタに登録済みの機関と紐付きました。';
          input.dispatchEvent(new Event('change'));
        });
        suggest.appendChild(item);
      });

      // 候補に完全一致が無ければ、その場でマスタに登録できるボタンを出す
      if (query && !exact) {
        const add = document.createElement('button');
        add.type = 'button';
        add.className = 'agency-suggest-item agency-suggest-add';
        add.textContent = `＋「${query}」を発注機関マスタに登録`;
        add.addEventListener('click', async () => {
          const res = await postJSON(`/api/projects/${projectId}/agency-register`, { name: query });
          if (res.ok) {
            const data = await res.json();
            idInput.value = data.agencyId;
            hideSuggest();
            if (note) note.textContent = '✓ 発注機関マスタに登録し、この案件と紐付けました。';
          }
        });
        suggest.appendChild(add);
      }
      suggest.hidden = suggest.children.length === 0;
    }

    input.addEventListener('input', () => {
      idInput.value = ''; // 手で書き換えたら紐付けは一旦解除（選び直すか、完全一致なら保存時に再紐付けされる）
      const query = input.value.trim();
      clearTimeout(timer);
      if (!query) return hideSuggest();
      timer = setTimeout(async () => {
        if (query === lastQuery) return;
        lastQuery = query;
        try {
          const res = await fetch(`/api/agencies/search?q=${encodeURIComponent(query)}`);
          const data = await res.json();
          renderSuggest(data.results || [], query);
        } catch (e) {
          hideSuggest();
        }
      }, 250);
    });

    input.addEventListener('blur', () => setTimeout(hideSuggest, 200));
  });

  // ---- 一覧の行内編集フォームの開閉（技術者マスタ・発注機関マスタ） ----
  document.querySelectorAll('.row-edit-toggle').forEach((btn) => {
    btn.addEventListener('click', () => {
      const row = document.getElementById(btn.dataset.target);
      if (!row) return;
      row.style.display = row.style.display === 'none' ? '' : 'none';
    });
  });

  // ---- 受注実績を書式211号用にタブ区切りでコピー ----
  const copyWorksBtn = document.getElementById('copyWorksTable');
  if (copyWorksBtn) {
    copyWorksBtn.addEventListener('click', () => {
      const rows = Array.from(document.querySelectorAll('#worksTable tbody tr'));
      const lines = ['工事名\t発注者\t請負金額\t工期'];
      rows.forEach((tr) => {
        const c = tr.querySelectorAll('td');
        const name = c[1].querySelector('a') ? c[1].querySelector('a').textContent.trim() : c[1].textContent.trim();
        lines.push([name, c[2].textContent.trim(), c[4].textContent.trim(), c[5].textContent.trim().replace(/\s+/g, ' ')].join('\t'));
      });
      const text = lines.join('\n');
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(() => {
          const original = copyWorksBtn.textContent;
          copyWorksBtn.textContent = 'コピーしました';
          setTimeout(() => { copyWorksBtn.textContent = original; }, 1500);
        }).catch(() => alert('コピーに失敗しました。表を選択して手動でコピーしてください。'));
      } else {
        alert('このブラウザは自動コピーに対応していません。表を選択して手動でコピーしてください。');
      }
    });
  }

  // ---- メンバー管理：編集フォームの開閉 ----
  document.querySelectorAll('.user-edit-toggle').forEach((btn) => {
    btn.addEventListener('click', () => {
      const row = document.querySelector(`.user-edit-row[data-user-id="${btn.dataset.userId}"]`);
      if (!row) return;
      row.style.display = row.style.display === 'none' ? '' : 'none';
    });
  });
})();
