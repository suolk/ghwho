/*
 * 界面文案与中英文切换（content script 与 popup 共用，需先于 storage.js 加载）。
 *
 * 语言偏好存在 storage.sync 的 SETTINGS_KEY 中：'auto'（跟随浏览器）| 'zh-CN' | 'en'。
 * 该键不是合法的 GitHub 用户名，不会被当作备注读取、导出或在覆盖导入时删除。
 * 新增文案时在两种语言里都加上同名键即可；缺失时回退到中文。
 */
(() => {
  const api = globalThis.browser ?? globalThis.chrome;
  const GHWho = (globalThis.GHWho ??= {});

  const SETTINGS_KEY = '__ghwho_settings';
  const LANGS = ['zh-CN', 'en'];
  const FALLBACK = 'zh-CN';

  const MESSAGES = {
    'zh-CN': {
      'app.title': 'GitHub 用户备注',
      'lang.title': '界面语言',
      'lang.auto': '自动',

      'common.save': '保存',
      'common.cancel': '取消',
      'common.delete': '删除',
      'common.edit': '编辑',
      'common.listSep': '，',

      'badge.addInline': '+备注',
      'badge.addProfile': '+ 添加备注',
      'badge.noteTitle': '@{user} 的备注：\n{note}\n\n点击编辑',
      'badge.noteAria': '@{user} 的备注：{note}。点击编辑',
      'badge.addTitle': '为 @{user} 添加备注',

      'editor.placeholder': '写点什么……（Ctrl+Enter 保存，Esc 取消）',
      'editor.textareaAria': '@{user} 的备注',
      'editor.dialogAria': '编辑 @{user} 的备注',
      'editor.updated': '更新于 {time}',
      'editor.new': '新备注',

      'err.invalidUser': '无效的 GitHub 用户名：{user}',
      'err.tooLong': '备注最多 {max} 个字符（当前 {len}）。',
      'err.itemQuota': '@{user} 的备注过长（{size}），单条上限约 {limit}。',
      'err.maxItems': '备注数量将达到 {count} 条，超过同步存储上限 {max} 条。请先删除一些备注。',
      'err.quota': '同步存储空间不足：写入后将占用 {bytes}，上限 {quota}。请先删除或精简一些备注。',
      'err.quotaFull': '同步存储空间已满（约 100KB），请删除一些备注后重试。',
      'err.rate': '保存过于频繁，浏览器限制了同步存储的写入次数，请稍后再试。',
      'err.invalidated': '扩展已更新或重新加载，请刷新页面后再试。',
      'err.unknown': '保存失败：{msg}',
      'err.badFormat': '无法识别的 JSON 格式。',

      'popup.openTab': '在标签页中打开',
      'perm.title': '尚未授权访问 github.com',
      'perm.desc': '扩展需要该权限才能在 GitHub 页面上显示备注。',
      'perm.grant': '授权',
      'perm.granted': '授权成功！请刷新已打开的 GitHub 页面。',
      'perm.denied': '未授权，备注将无法在 GitHub 页面上显示。',
      'perm.failed': '授权失败：{msg}',

      'search.placeholder': '搜索用户名或备注…',
      'add.toggle': '+ 新增',
      'add.userPlaceholder': 'GitHub 用户名',
      'add.notePlaceholder': '备注内容',
      'add.invalidUser': '请输入有效的 GitHub 用户名（字母、数字、连字符，最长 39 位）。',
      'add.added': '已添加 @{user} 的备注。',
      'add.updated': '已更新 @{user} 的备注。',

      'list.empty': '还没有备注。在 GitHub 页面上悬停用户名，点击“+备注”即可添加。',
      'list.noMatch': '没有匹配“{q}”的备注。',
      'list.dblclick': '双击编辑',
      'list.loadFailed': '读取备注失败：{msg}',

      'usage.text': '{count} 条 · {used} / {quota}',
      'usage.warn': '同步存储空间即将用尽，建议导出备份并精简备注。',

      'io.export': '导出 JSON',
      'io.import': '导入 JSON',
      'io.mode': '导入方式',
      'io.merge': '合并导入',
      'io.replace': '覆盖导入',
      'io.confirmReplace': '确认覆盖？',
      'io.exported': '已导出 {count} 条备注。',
      'io.exportFailed': '导出失败：{msg}',
      'io.badJson': '文件不是有效的 JSON。',
      'io.written': '写入 {n} 条',
      'io.unchanged': '未变化/保留较新 {n} 条',
      'io.removed': '删除 {n} 条',
      'io.skipped': '跳过无效 {n} 条',
      'io.imported': '导入完成：{parts}。',
      'io.importFailed': '导入失败：{msg}',
      'io.importHint': '请点击“导入 JSON”选择备份文件。',
    },

    en: {
      'app.title': 'GitHub User Notes',
      'lang.title': 'Language',
      'lang.auto': 'Auto',

      'common.save': 'Save',
      'common.cancel': 'Cancel',
      'common.delete': 'Delete',
      'common.edit': 'Edit',
      'common.listSep': ', ',

      'badge.addInline': '+ Note',
      'badge.addProfile': '+ Add note',
      'badge.noteTitle': 'Note on @{user}:\n{note}\n\nClick to edit',
      'badge.noteAria': 'Note on @{user}: {note}. Click to edit',
      'badge.addTitle': 'Add a note for @{user}',

      'editor.placeholder': 'Write something… (Ctrl+Enter to save, Esc to cancel)',
      'editor.textareaAria': 'Note on @{user}',
      'editor.dialogAria': 'Edit note on @{user}',
      'editor.updated': 'Updated {time}',
      'editor.new': 'New note',

      'err.invalidUser': 'Invalid GitHub username: {user}',
      'err.tooLong': 'Notes can be at most {max} characters (currently {len}).',
      'err.itemQuota': 'The note on @{user} is too long ({size}); each note can be about {limit} at most.',
      'err.maxItems': 'This would make {count} notes, more than the sync storage limit of {max}. Delete some notes first.',
      'err.quota': 'Not enough sync storage: this would use {bytes} of {quota}. Delete or shorten some notes first.',
      'err.quotaFull': 'Sync storage is full (about 100KB). Delete some notes and try again.',
      'err.rate': 'Saving too often: the browser limits sync storage writes. Try again in a moment.',
      'err.invalidated': 'The extension was updated or reloaded. Refresh the page and try again.',
      'err.unknown': 'Save failed: {msg}',
      'err.badFormat': 'Unrecognized JSON format.',

      'popup.openTab': 'Open in a tab',
      'perm.title': 'No access to github.com yet',
      'perm.desc': 'The extension needs this permission to show notes on GitHub pages.',
      'perm.grant': 'Grant',
      'perm.granted': 'Access granted! Refresh any open GitHub tabs.',
      'perm.denied': 'Not granted. Notes won’t appear on GitHub pages.',
      'perm.failed': 'Permission request failed: {msg}',

      'search.placeholder': 'Search usernames or notes…',
      'add.toggle': '+ Add',
      'add.userPlaceholder': 'GitHub username',
      'add.notePlaceholder': 'Note',
      'add.invalidUser': 'Enter a valid GitHub username (letters, digits and hyphens, up to 39 characters).',
      'add.added': 'Added a note for @{user}.',
      'add.updated': 'Updated the note on @{user}.',

      'list.empty': 'No notes yet. Hover a username on GitHub and click “+ Note” to add one.',
      'list.noMatch': 'No notes match “{q}”.',
      'list.dblclick': 'Double-click to edit',
      'list.loadFailed': 'Failed to load notes: {msg}',

      'usage.text': '{count} notes · {used} / {quota}',
      'usage.warn': 'Sync storage is almost full. Export a backup and trim some notes.',

      'io.export': 'Export JSON',
      'io.import': 'Import JSON',
      'io.mode': 'Import mode',
      'io.merge': 'Merge',
      'io.replace': 'Replace',
      'io.confirmReplace': 'Confirm replace?',
      'io.exported': 'Exported {count} notes.',
      'io.exportFailed': 'Export failed: {msg}',
      'io.badJson': 'The file is not valid JSON.',
      'io.written': '{n} written',
      'io.unchanged': '{n} unchanged or kept newer',
      'io.removed': '{n} removed',
      'io.skipped': '{n} invalid skipped',
      'io.imported': 'Import finished: {parts}.',
      'io.importFailed': 'Import failed: {msg}',
      'io.importHint': 'Click “Import JSON” to choose a backup file.',
    },
  };

  function detect() {
    let ui = '';
    try {
      ui = api?.i18n?.getUILanguage?.() ?? '';
    } catch {
      /* ignore */
    }
    ui = (ui || globalThis.navigator?.language || 'en').toLowerCase();
    return ui.startsWith('zh') ? 'zh-CN' : 'en';
  }

  const resolve = (pref) => (LANGS.includes(pref) ? pref : detect());
  const normalizePref = (pref) => (LANGS.includes(pref) ? pref : 'auto');

  let preference = 'auto';
  let lang = detect();
  const listeners = new Set();

  function apply(pref) {
    preference = normalizePref(pref);
    const next = resolve(preference);
    if (next === lang) return;
    lang = next;
    for (const cb of listeners) cb(lang);
  }

  /* 取文案，{name} 占位符用 params 替换 */
  function t(key, params) {
    const s = MESSAGES[lang]?.[key] ?? MESSAGES[FALLBACK][key] ?? key;
    return params ? s.replace(/\{(\w+)\}/g, (m, k) => (k in params ? String(params[k]) : m)) : s;
  }

  let initPromise = null;
  /* 读取已保存的语言偏好，并监听其他页面的修改 */
  function init() {
    initPromise ??= (async () => {
      try {
        const res = await api.storage.sync.get(SETTINGS_KEY);
        apply(res?.[SETTINGS_KEY]?.lang);
      } catch {
        /* 读不到就跟随浏览器 */
      }
      api.storage.onChanged.addListener((changes, area) => {
        if (area === 'sync' && changes[SETTINGS_KEY]) apply(changes[SETTINGS_KEY].newValue?.lang);
      });
    })();
    return initPromise;
  }

  async function setPreference(pref) {
    const value = normalizePref(pref);
    await api.storage.sync.set({ [SETTINGS_KEY]: { lang: value } });
    apply(value);
  }

  /*
   * 翻译静态 HTML：
   *   data-i18n="key"               → textContent
   *   data-i18n-placeholder="key"   → placeholder
   *   data-i18n-title="key"         → title
   *   data-i18n-aria-label="key"    → aria-label
   */
  function translateDom(root = document) {
    for (const el of root.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
    for (const el of root.querySelectorAll('[data-i18n-placeholder]')) el.placeholder = t(el.dataset.i18nPlaceholder);
    for (const el of root.querySelectorAll('[data-i18n-title]')) el.title = t(el.dataset.i18nTitle);
    for (const el of root.querySelectorAll('[data-i18n-aria-label]')) el.setAttribute('aria-label', t(el.dataset.i18nAriaLabel));
  }

  GHWho.i18n = {
    SETTINGS_KEY,
    LANGS,
    t,
    init,
    setPreference,
    getPreference: () => preference,
    getLang: () => lang,
    onChange: (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    translateDom,
  };
})();
