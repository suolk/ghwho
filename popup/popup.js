(() => {
  const api = globalThis.browser ?? globalThis.chrome;
  const store = globalThis.GHWho.storage;
  const i18n = globalThis.GHWho.i18n;
  const { t } = i18n;

  const GITHUB_ORIGINS = ['https://github.com/*'];
  const isFirefox = typeof api.runtime.getBrowserInfo === 'function';
  const params = new URLSearchParams(location.search);
  const isTab = params.has('tab');
  document.documentElement.classList.toggle('is-tab', isTab);

  const $ = (id) => document.getElementById(id);
  const ui = {
    permBanner: $('perm-banner'),
    permGrant: $('perm-grant'),
    flash: $('flash'),
    search: $('search'),
    addToggle: $('add-toggle'),
    addForm: $('add-form'),
    addUser: $('add-user'),
    addNote: $('add-note'),
    addCancel: $('add-cancel'),
    list: $('list'),
    empty: $('empty'),
    meterBar: $('meter-bar'),
    usageText: $('usage-text'),
    exportBtn: $('export'),
    importBtn: $('import'),
    importMode: $('import-mode'),
    importFile: $('import-file'),
    openTab: $('open-tab'),
    lang: $('lang'),
  };

  /** @type {Record<string, {note: string, updatedAt: number}>} */
  let notes = {};
  let editing = null; // 正在编辑的用户名

  /* ---------------------------------------------------------------- 工具 */

  function el(tag, props = {}, children = []) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (k === 'class') node.className = v;
      else if (k === 'text') node.textContent = v;
      else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
      else node.setAttribute(k, v);
    }
    node.append(...children);
    return node;
  }

  let flashTimer = 0;
  function flash(message, type = 'info', ms = 4000) {
    clearTimeout(flashTimer);
    ui.flash.textContent = message;
    ui.flash.className = `banner banner-${type}`;
    ui.flash.hidden = false;
    if (ms) flashTimer = setTimeout(() => (ui.flash.hidden = true), ms);
  }

  function formatTime(ts) {
    const d = new Date(ts);
    if (Number.isNaN(d.getTime())) return '';
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  /* 两次点击确认（扩展弹窗里不能可靠地使用 confirm()） */
  const confirmState = new WeakMap(); // btn -> { original, timer }

  function resetConfirm(btn) {
    const s = confirmState.get(btn);
    if (!s) return;
    clearTimeout(s.timer);
    confirmState.delete(btn);
    delete btn.dataset.ghwhoConfirm;
    btn.textContent = s.original;
  }

  function confirmClick(btn, label, action) {
    if (confirmState.has(btn)) {
      resetConfirm(btn);
      return action();
    }
    confirmState.set(btn, { original: btn.textContent, timer: setTimeout(() => resetConfirm(btn), 3000) });
    btn.dataset.ghwhoConfirm = '1';
    btn.textContent = label;
  }

  /* ---------------------------------------------------------------- 权限 */

  async function checkPermission() {
    let granted = true;
    try {
      granted = await api.permissions.contains({ origins: GITHUB_ORIGINS });
    } catch {
      /* 不支持时视为已授权 */
    }
    ui.permBanner.hidden = granted;
    return granted;
  }

  ui.permGrant.addEventListener('click', () => {
    // 必须在用户点击的同步调用栈里直接调用 request，不能先 await 其他东西
    api.permissions
      .request({ origins: GITHUB_ORIGINS })
      .then((granted) => {
        checkPermission();
        if (granted) flash(t('perm.granted'), 'success', 6000);
        else flash(t('perm.denied'), 'warn');
      })
      .catch((err) => flash(t('perm.failed', { msg: err?.message ?? err }), 'error'));
  });

  api.permissions?.onAdded?.addListener(checkPermission);
  api.permissions?.onRemoved?.addListener(checkPermission);

  /* ---------------------------------------------------------------- 列表 */

  function matches(user, entry, q) {
    return !q || user.includes(q) || entry.note.toLowerCase().includes(q);
  }

  function render() {
    const q = ui.search.value.trim().toLowerCase().replace(/^@/, '');
    const items = Object.entries(notes)
      .filter(([user, entry]) => matches(user, entry, q))
      .sort((a, b) => (b[1].updatedAt ?? 0) - (a[1].updatedAt ?? 0));

    ui.list.replaceChildren(...items.map(([user, entry]) => renderItem(user, entry)));

    const total = Object.keys(notes).length;
    ui.empty.hidden = items.length > 0;
    ui.empty.textContent = total === 0 ? t('list.empty') : t('list.noMatch', { q: ui.search.value.trim() });
  }

  function renderItem(user, entry) {
    const li = el('li', { class: 'item' });
    const head = el('div', { class: 'item-head' }, [
      el('a', { class: 'item-user', href: `https://github.com/${user}`, target: '_blank', rel: 'noopener noreferrer', text: `@${user}` }),
      el('span', { class: 'item-time', text: formatTime(entry.updatedAt) }),
    ]);

    if (editing === user) {
      const textarea = el('textarea', { class: 'input', rows: '3', maxlength: String(store.MAX_NOTE_LENGTH) });
      textarea.value = entry.note;
      const save = async () => {
        try {
          await store.set(user, textarea.value);
          editing = null;
          await reload();
        } catch (err) {
          flash(err.message, 'error', 8000);
        }
      };
      textarea.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) save();
        if (e.key === 'Escape') {
          e.preventDefault();
          editing = null;
          render();
        }
      });
      li.append(
        head,
        textarea,
        el('div', { class: 'row-actions' }, [
          el('button', { class: 'btn', type: 'button', text: t('common.cancel'), onclick: () => { editing = null; render(); } }),
          el('button', { class: 'btn btn-primary', type: 'button', text: t('common.save'), onclick: save }),
        ]),
      );
      queueMicrotask(() => {
        textarea.focus();
        textarea.setSelectionRange(textarea.value.length, textarea.value.length);
      });
      return li;
    }

    const delBtn = el('button', { class: 'link-btn danger', type: 'button', text: t('common.delete') });
    delBtn.addEventListener('click', async () => {
      try {
        await store.remove(user);
        await reload();
      } catch (err) {
        flash(err.message, 'error');
      }
    });

    li.append(
      head,
      el('p', { class: 'item-note', text: entry.note, title: t('list.dblclick'), ondblclick: () => startEdit(user) }),
      el('div', { class: 'item-actions' }, [
        el('button', { class: 'link-btn', type: 'button', text: t('common.edit'), onclick: () => startEdit(user) }),
        delBtn,
      ]),
    );
    return li;
  }

  function startEdit(user) {
    editing = user;
    render();
  }

  async function renderUsage() {
    try {
      const u = await store.usage();
      const ratio = Math.min(1, u.bytes / u.quota);
      ui.meterBar.style.width = `${(ratio * 100).toFixed(1)}%`;
      ui.meterBar.classList.toggle('warn', ratio >= 0.8 || u.count >= u.maxItems * 0.9);
      ui.usageText.textContent = t('usage.text', {
        count: u.count,
        used: store.formatKB(u.bytes),
        quota: store.formatKB(u.quota),
      });
      if (ratio >= 0.8) {
        ui.usageText.title = t('usage.warn');
        ui.usageText.classList.add('warn');
      } else {
        ui.usageText.title = '';
        ui.usageText.classList.remove('warn');
      }
    } catch {
      ui.usageText.textContent = '';
    }
  }

  async function reload() {
    try {
      notes = await store.getAll();
    } catch (err) {
      flash(t('list.loadFailed', { msg: err?.message ?? err }), 'error', 0);
      notes = {};
    }
    render();
    renderUsage();
  }

  /* ---------------------------------------------------------------- 新增 */

  function toggleAdd(show) {
    ui.addForm.hidden = !show;
    ui.addToggle.setAttribute('aria-expanded', String(show));
    if (show) {
      const q = store.normalizeUsername(ui.search.value);
      if (q && !ui.addUser.value) ui.addUser.value = q;
      (ui.addUser.value ? ui.addNote : ui.addUser).focus();
    } else {
      ui.addForm.reset();
    }
  }

  ui.addToggle.addEventListener('click', () => toggleAdd(ui.addForm.hidden));
  ui.addCancel.addEventListener('click', () => toggleAdd(false));
  ui.addForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const user = store.normalizeUsername(ui.addUser.value);
    if (!user) {
      flash(t('add.invalidUser'), 'error');
      ui.addUser.focus();
      return;
    }
    try {
      const existed = !!notes[user];
      await store.set(user, ui.addNote.value);
      toggleAdd(false);
      flash(t(existed ? 'add.updated' : 'add.added', { user }), 'success');
      await reload();
    } catch (err) {
      flash(err.message, 'error', 8000);
    }
  });
  ui.addNote.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) ui.addForm.requestSubmit();
  });

  /* ---------------------------------------------------------------- 搜索 */

  ui.search.addEventListener('input', () => {
    editing = null;
    render();
  });

  /* ---------------------------------------------------------------- 导入导出 */

  ui.exportBtn.addEventListener('click', async () => {
    try {
      const data = await store.exportData();
      const count = Object.keys(data.notes).length;
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const d = new Date();
      const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
      const a = el('a', { href: url, download: `ghwho-notes-${stamp}.json` });
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      flash(t('io.exported', { count }), 'success');
    } catch (err) {
      flash(t('io.exportFailed', { msg: err?.message ?? err }), 'error');
    }
  });

  function pickFile() {
    // Firefox 的弹窗在打开文件选择框时会被关闭，导致读不到文件，所以改到标签页里操作
    if (isFirefox && !isTab) {
      api.tabs.create({ url: api.runtime.getURL(`popup/popup.html?tab=1&mode=${ui.importMode.value}#import`) });
      window.close();
      return;
    }
    ui.importFile.value = '';
    ui.importFile.click();
  }

  ui.importMode.addEventListener('change', () => resetConfirm(ui.importBtn));

  ui.importBtn.addEventListener('click', () => {
    if (ui.importMode.value === 'replace') confirmClick(ui.importBtn, t('io.confirmReplace'), pickFile);
    else pickFile();
  });

  ui.importFile.addEventListener('change', async () => {
    const file = ui.importFile.files?.[0];
    if (!file) return;
    let data;
    try {
      data = JSON.parse(await file.text());
    } catch {
      flash(t('io.badJson'), 'error');
      return;
    }
    try {
      const mode = ui.importMode.value;
      const r = await store.importData(data, { mode });
      const parts = [t('io.written', { n: r.written })];
      if (r.unchanged) parts.push(t('io.unchanged', { n: r.unchanged }));
      if (r.removed) parts.push(t('io.removed', { n: r.removed }));
      if (r.skipped) parts.push(t('io.skipped', { n: r.skipped }));
      flash(t('io.imported', { parts: parts.join(t('common.listSep')) }), 'success', 8000);
      await reload();
    } catch (err) {
      flash(t('io.importFailed', { msg: err?.message ?? err }), 'error', 10000);
    }
  });

  ui.openTab.hidden = isTab;
  ui.openTab.addEventListener('click', () => {
    api.tabs.create({ url: api.runtime.getURL('popup/popup.html?tab=1') });
    window.close();
  });

  /* ---------------------------------------------------------------- 语言 */

  function applyLanguage() {
    resetConfirm(ui.importBtn);
    document.documentElement.lang = i18n.getLang();
    ui.lang.value = i18n.getPreference();
    i18n.translateDom();
    // 正在编辑时不重绘列表，避免丢掉未保存的输入
    if (!editing) render();
    renderUsage();
  }

  ui.lang.addEventListener('change', async () => {
    try {
      await i18n.setPreference(ui.lang.value);
    } catch (err) {
      flash(err?.message ?? String(err), 'error');
    }
    ui.lang.value = i18n.getPreference();
  });

  i18n.onChange(applyLanguage);

  /* ---------------------------------------------------------------- 启动 */

  store.onChanged(() => {
    if (!editing) reload();
  });

  (async () => {
    await i18n.init();
    applyLanguage();
    checkPermission();
    await reload();
    if (isTab && location.hash === '#import') {
      if (params.get('mode') === 'replace') ui.importMode.value = 'replace';
      flash(t('io.importHint'), 'info', 8000);
      ui.importBtn.focus();
    }
  })();
  if (!isTab) ui.search.focus();
})();
