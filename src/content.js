/*
 * 在 github.com 页面上注入用户备注标签。
 * 依赖 selectors.js（GHWho.SELECTORS）、i18n.js（GHWho.i18n）与 storage.js（GHWho.storage），需在 manifest 中先于本文件加载。
 */
(() => {
  const api = globalThis.browser ?? globalThis.chrome;
  const GHWho = globalThis.GHWho;
  if (!GHWho?.storage || !GHWho?.SELECTORS || !GHWho?.i18n || GHWho.contentStarted) return;
  GHWho.contentStarted = true;

  const S = GHWho.SELECTORS;
  const store = GHWho.storage;
  const i18n = GHWho.i18n;
  const { t } = i18n;
  const { normalizeUsername } = store;

  const LINK_QUERY = [...S.userLinks, S.fallbackLinks].join(', ');
  const HOVERCARD_QUERY = S.userLinks.join(', ');
  const IGNORE_QUERY = S.ignoreWithin.join(', ');
  const NO_ADD_QUERY = S.noAddWithin.join(', ');
  const RESERVED = new Set(S.reservedPaths);
  const MARK_ATTR = 'data-ghwho-user'; // 已处理节点的标记，值为识别出的用户名（非用户链接为空串）

  /** @type {Record<string, {note: string, updatedAt: number}>} */
  let notes = {};
  /** link / 主页容器 -> { sig, user, badge } */
  const state = new WeakMap();

  /* ---------------------------------------------------------------- 用户名识别 */

  function usernameFromHref(href, { strict }) {
    if (!href) return null;
    let url;
    try {
      url = new URL(href, location.origin);
    } catch {
      return null;
    }
    if (url.origin !== 'https://github.com') return null;
    if (strict && (url.search || url.hash)) return null;
    const m = url.pathname.match(/^\/([^/]+)\/?$/);
    if (!m) return null;
    let name;
    try {
      name = decodeURIComponent(m[1]);
    } catch {
      return null;
    }
    const user = normalizeUsername(name);
    return user && !RESERVED.has(user) ? user : null;
  }

  function linkText(a) {
    return a.textContent.replace(/\s+/g, ' ').trim();
  }

  function isAvatarOnly(a) {
    return !linkText(a) && !!a.querySelector(S.avatar);
  }

  /* 返回链接对应的小写用户名；不是用户链接则返回 null */
  function usernameOf(a) {
    const type = a.getAttribute('data-hovercard-type');
    if (type && type !== 'user') return null;

    if (a.matches(HOVERCARD_QUERY)) {
      const hc = a.getAttribute('data-hovercard-url');
      const m = hc && hc.match(/^\/users\/([^/?#]+)\/hovercard/);
      if (m) {
        try {
          const user = normalizeUsername(decodeURIComponent(m[1]));
          if (user) return user;
        } catch {
          /* 落到 href 解析 */
        }
      }
      return usernameFromHref(a.getAttribute('href'), { strict: false });
    }

    // URL 规则兜底
    const user = usernameFromHref(a.getAttribute('href'), { strict: true });
    if (!user) return null;
    const text = linkText(a).replace(/^@/, '').toLowerCase();
    if (text === user || (!text && a.querySelector(S.avatar))) return user;
    return null;
  }

  /* 头像链接附近是否已有同一用户的文字链接（有则头像旁不再重复显示） */
  function hasTextLinkNearby(a, user) {
    let el = a.parentElement;
    for (let i = 0; i < S.avatarSiblingDepth && el && el !== document.body; i++, el = el.parentElement) {
      for (const other of el.querySelectorAll(LINK_QUERY)) {
        if (other !== a && linkText(other) && usernameOf(other) === user) return true;
      }
    }
    return false;
  }

  /* ---------------------------------------------------------------- 标签渲染 */

  function createBadge(user, mode) {
    const badge = document.createElement('button');
    badge.type = 'button';
    badge.className = `ghwho-badge ghwho-mode-${mode}`;
    badge.dataset.ghwhoFor = user;
    badge.dataset.ghwhoMode = mode;
    badge.addEventListener('click', onBadgeClick);
    // 防止 GitHub 的委托事件（如整行可点击）误响应
    badge.addEventListener('mousedown', (e) => e.stopPropagation());
    renderBadge(badge);
    return badge;
  }

  function renderBadge(badge) {
    const user = badge.dataset.ghwhoFor;
    const mode = badge.dataset.ghwhoMode;
    const entry = notes[user];
    const canAdd = mode === 'inline' || mode === 'profile';

    badge.classList.toggle('ghwho-has-note', !!entry);
    badge.classList.toggle('ghwho-add', !entry);
    badge.hidden = !entry && !canAdd;
    badge.replaceChildren();

    if (entry) {
      const icon = document.createElement('span');
      icon.className = 'ghwho-icon';
      icon.setAttribute('aria-hidden', 'true');
      icon.textContent = '✎';
      badge.append(icon);
      if (mode !== 'avatar') {
        const text = document.createElement('span');
        text.className = 'ghwho-text';
        // 行内只显示单行（CSS 截断），主页显示完整多行
        text.textContent = mode === 'profile' ? entry.note : entry.note.replace(/\s+/g, ' ');
        badge.append(text);
      }
      badge.title = t('badge.noteTitle', { user, note: entry.note });
      badge.setAttribute('aria-label', t('badge.noteAria', { user, note: entry.note }));
    } else {
      badge.textContent = t(mode === 'profile' ? 'badge.addProfile' : 'badge.addInline');
      badge.title = t('badge.addTitle', { user });
      badge.setAttribute('aria-label', badge.title);
    }
  }

  function refreshUser(user) {
    for (const badge of document.querySelectorAll(`.ghwho-badge[data-ghwho-for="${CSS.escape(user)}"]`)) {
      renderBadge(badge);
    }
  }

  function onBadgeClick(e) {
    e.preventDefault();
    e.stopPropagation();
    const badge = e.currentTarget;
    openEditor(badge.dataset.ghwhoFor, badge);
  }

  /* ---------------------------------------------------------------- 注入 */

  /* 移除 Turbo 缓存快照等克隆出来、但不受本脚本管理的旧标签 */
  function removeStaleBadge(anchor) {
    const next = anchor.nextElementSibling;
    if (next?.classList.contains('ghwho-badge') || next?.classList.contains('ghwho-profile')) next.remove();
  }

  function processLink(a) {
    const sig = `${a.getAttribute('href') ?? ''}|${a.getAttribute('data-hovercard-url') ?? ''}`;
    const prev = state.get(a);
    if (prev && prev.sig === sig && (!prev.badge || prev.badge.isConnected)) return;

    prev?.badge?.remove();
    if (!prev) removeStaleBadge(a);

    let user = null;
    let mode = null;
    if (!a.closest(IGNORE_QUERY)) {
      user = usernameOf(a);
      if (user) {
        if (isAvatarOnly(a)) {
          mode = hasTextLinkNearby(a, user) ? null : 'avatar';
        } else {
          mode = a.closest(NO_ADD_QUERY) ? 'passive' : 'inline';
        }
      }
    }

    a.setAttribute(MARK_ATTR, mode ? user : '');
    let badge = null;
    if (mode) {
      badge = createBadge(user, mode);
      a.after(badge);
    }
    state.set(a, { sig, user, badge });
  }

  function processProfile(container) {
    const nick = container.querySelector(S.profile.username);
    // 用户名后面可能跟着代词（如 "· he/him"），只取第一个词
    const user = nick ? normalizeUsername(nick.textContent.trim().split(/\s/)[0]) : null;
    const prev = state.get(container);
    if (prev && prev.user === user && prev.badge?.isConnected) return;

    prev?.badge?.remove();
    if (!prev) removeStaleBadge(container);
    container.setAttribute(MARK_ATTR, user ?? '');
    if (!user) {
      state.set(container, { user, badge: null });
      return;
    }
    const wrap = document.createElement('div');
    wrap.className = 'ghwho-profile';
    wrap.append(createBadge(user, 'profile'));
    container.after(wrap);
    state.set(container, { user, badge: wrap });
  }

  function scan(root) {
    if (!root || (root.nodeType !== 1 && root.nodeType !== 9)) return;
    if (root.nodeType === 1 && root.closest('.ghwho-badge, .ghwho-popover, .ghwho-profile')) return;

    for (const container of document.querySelectorAll(S.profile.container)) processProfile(container);

    if (root.nodeType === 1 && root.matches('a') && root.matches(LINK_QUERY)) processLink(root);
    for (const a of root.querySelectorAll(LINK_QUERY)) processLink(a);
  }

  /* 清理全部注入内容（Turbo 缓存页面前调用，避免快照里残留标签） */
  function cleanup() {
    closeEditor();
    for (const el of document.querySelectorAll('.ghwho-badge, .ghwho-profile')) el.remove();
    for (const el of document.querySelectorAll(`[${MARK_ATTR}]`)) {
      el.removeAttribute(MARK_ATTR);
      state.delete(el);
    }
  }

  /* ---------------------------------------------------------------- DOM 监听 */

  const pending = new Set();
  let flushTimer = 0;

  function queue(node) {
    pending.add(node);
    if (!flushTimer) flushTimer = setTimeout(flush, 100);
  }

  function flush() {
    flushTimer = 0;
    const roots = [...pending];
    pending.clear();
    if (!isAlive()) return;
    if (roots.includes(document) || roots.includes(document.documentElement) || roots.includes(document.body)) {
      scan(document);
      return;
    }
    for (const r of roots) if (r.isConnected) scan(r);
  }

  function isOwnNode(n) {
    return n.nodeType === 1 && (
      n.classList.contains('ghwho-badge') ||
      n.classList.contains('ghwho-profile') ||
      n.classList.contains('ghwho-popover')
    );
  }

  const observer = new MutationObserver((records) => {
    for (const rec of records) {
      let relevant = false;
      for (const n of rec.addedNodes) {
        if (n.nodeType === 1 && !isOwnNode(n)) {
          relevant = true;
          break;
        }
      }
      // 页面重渲染时删掉了我们的标签，需要补回
      if (!relevant) {
        for (const n of rec.removedNodes) {
          if (n.nodeType === 1 && (n.classList.contains('ghwho-badge') || n.classList.contains('ghwho-profile'))) {
            relevant = true;
            break;
          }
        }
      }
      if (relevant) queue(rec.target);
    }
  });

  /* 扩展被重新加载/卸载后旧脚本仍可能残留在页面中，此时停止工作 */
  function isAlive() {
    try {
      if (api?.runtime?.id) return true;
    } catch {
      /* ignore */
    }
    observer.disconnect();
    return false;
  }

  /* ---------------------------------------------------------------- 编辑弹窗 */

  let editor = null; // { root, user, anchor }

  function closeEditor({ restoreFocus = false } = {}) {
    if (!editor) return;
    const { root, anchor } = editor;
    editor = null;
    root.remove();
    document.removeEventListener('mousedown', onOutsideMouseDown, true);
    window.removeEventListener('resize', positionEditor);
    if (restoreFocus && anchor?.isConnected) anchor.focus({ preventScroll: true });
  }

  function onOutsideMouseDown(e) {
    if (editor && !editor.root.contains(e.target) && !editor.anchor.contains(e.target)) closeEditor();
  }

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

  function formatTime(ts) {
    try {
      return new Date(ts).toLocaleString(i18n.getLang());
    } catch {
      return '';
    }
  }

  function positionEditor() {
    if (!editor) return;
    const { root, anchor } = editor;
    if (!anchor.isConnected) return closeEditor();
    const r = anchor.getBoundingClientRect();
    const w = root.offsetWidth;
    const h = root.offsetHeight;
    const vw = document.documentElement.clientWidth;
    const vh = window.innerHeight;
    let left = Math.min(Math.max(8, r.left), vw - w - 8);
    let top = r.bottom + 6;
    if (top + h > vh - 8 && r.top - h - 6 > 8) top = r.top - h - 6;
    root.style.left = `${Math.max(8, left) + window.scrollX}px`;
    root.style.top = `${top + window.scrollY}px`;
  }

  function openEditor(user, anchor) {
    if (editor?.user === user && editor.anchor === anchor) return closeEditor();
    closeEditor();

    const entry = notes[user];
    const textarea = el('textarea', {
      class: 'ghwho-textarea',
      rows: '4',
      maxlength: String(store.MAX_NOTE_LENGTH),
      placeholder: t('editor.placeholder'),
      'aria-label': t('editor.textareaAria', { user }),
    });
    textarea.value = entry?.note ?? '';

    const msg = el('div', { class: 'ghwho-msg', role: 'alert' });
    const counter = el('span', { class: 'ghwho-counter' });
    const updateCounter = () => {
      counter.textContent = `${textarea.value.length}/${store.MAX_NOTE_LENGTH}`;
    };
    updateCounter();

    const saveBtn = el('button', { type: 'button', class: 'ghwho-btn ghwho-btn-primary', text: t('common.save') });
    const cancelBtn = el('button', { type: 'button', class: 'ghwho-btn', text: t('common.cancel') });
    const deleteBtn = el('button', { type: 'button', class: 'ghwho-btn ghwho-btn-danger', text: t('common.delete') });
    deleteBtn.hidden = !entry;

    const setBusy = (busy) => {
      for (const b of [saveBtn, cancelBtn, deleteBtn]) b.disabled = busy;
    };

    const run = async (fn) => {
      msg.textContent = '';
      setBusy(true);
      try {
        await fn();
        closeEditor({ restoreFocus: true });
      } catch (err) {
        msg.textContent = err?.message ?? String(err);
        setBusy(false);
      }
    };

    const save = () =>
      run(async () => {
        const saved = await store.set(user, textarea.value);
        applyChange(user, saved ?? null);
      });
    const del = () =>
      run(async () => {
        await store.remove(user);
        applyChange(user, null);
      });

    saveBtn.addEventListener('click', save);
    cancelBtn.addEventListener('click', () => closeEditor({ restoreFocus: true }));
    deleteBtn.addEventListener('click', del);

    textarea.addEventListener('input', updateCounter);
    const root = el(
      'div',
      { class: 'ghwho-popover', role: 'dialog', 'aria-label': t('editor.dialogAria', { user }), 'data-ghwho-ignore': '' },
      [
        el('div', { class: 'ghwho-pop-header' }, [
          el('a', { class: 'ghwho-pop-user', href: `/${user}`, text: `@${user}` }),
          el('span', { class: 'ghwho-pop-meta', text: entry ? t('editor.updated', { time: formatTime(entry.updatedAt) }) : t('editor.new') }),
        ]),
        textarea,
        msg,
        el('div', { class: 'ghwho-pop-actions' }, [deleteBtn, counter, el('span', { class: 'ghwho-spacer' }), cancelBtn, saveBtn]),
      ],
    );

    // 阻止 GitHub 全局快捷键与点击委托
    root.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Escape') {
        e.preventDefault();
        closeEditor({ restoreFocus: true });
      } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        save();
      }
    });
    for (const type of ['keyup', 'keypress', 'click']) root.addEventListener(type, (e) => e.stopPropagation());

    document.body.append(root);
    editor = { root, user, anchor };
    positionEditor();
    document.addEventListener('mousedown', onOutsideMouseDown, true);
    window.addEventListener('resize', positionEditor);
    textarea.focus();
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
  }

  /* ---------------------------------------------------------------- 数据同步 */

  function applyChange(user, entry) {
    if (entry) notes[user] = entry;
    else delete notes[user];
    refreshUser(user);
  }

  store.onChanged((changes) => {
    for (const [user, entry] of Object.entries(changes)) applyChange(user, entry);
  });

  /* 切换界面语言：重绘所有标签；编辑弹窗直接关闭，避免半中半英 */
  i18n.onChange(() => {
    closeEditor();
    for (const badge of document.querySelectorAll('.ghwho-badge')) renderBadge(badge);
  });

  /* ---------------------------------------------------------------- 启动 */

  async function start() {
    await i18n.init();
    try {
      notes = await store.getAll();
    } catch (err) {
      console.warn('[ghwho] 读取备注失败', err);
    }
    scan(document);
    observer.observe(document.documentElement, { childList: true, subtree: true });

    // Turbo 驱动的页面切换
    document.addEventListener('turbo:load', () => queue(document));
    document.addEventListener('turbo:render', () => queue(document));
    document.addEventListener('turbo:frame-load', (e) => queue(e.target));
    document.addEventListener('turbo:before-cache', cleanup);
    document.addEventListener('turbo:before-render', () => closeEditor());
    // 旧版 pjax 与浏览器前进/后退
    document.addEventListener('pjax:end', () => queue(document));
    window.addEventListener('popstate', () => queue(document));
  }

  start();
})();
