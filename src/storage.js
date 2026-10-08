/*
 * 备注存储封装（content script 与 popup 共用，需在 i18n.js 之后加载）。
 *
 * 数据结构：storage.sync 中，键为小写 GitHub 用户名，值为 { note, updatedAt }。
 * storage.sync 的配额（Chrome/Edge/Firefox 基本一致）：
 *   总量约 100KB、单项 8KB、最多 512 项。
 */
(() => {
  const api = globalThis.browser ?? globalThis.chrome;
  const GHWho = (globalThis.GHWho ??= {});

  const QUOTA_BYTES = 102400;
  const QUOTA_BYTES_PER_ITEM = 8192;
  const MAX_ITEMS = 512;
  const MAX_NOTE_LENGTH = 2000;

  /* GitHub 用户名：字母数字与连字符，最长 39 位（兼容少数历史账号的连续/结尾连字符） */
  const USERNAME_RE = /^[a-z\d](?:[a-z\d-]{0,38})$/i;

  const encoder = new TextEncoder();
  /* 文案来自 i18n.js；未加载时原样返回键名 */
  const t = (key, params) => GHWho.i18n?.t(key, params) ?? key;

  class NoteError extends Error {
    constructor(message, code) {
      super(message);
      this.name = 'NoteError';
      this.code = code;
    }
  }

  function normalizeUsername(name) {
    if (typeof name !== 'string') return null;
    const n = name.trim().replace(/^@/, '').toLowerCase();
    return USERNAME_RE.test(n) ? n : null;
  }

  function isEntry(value) {
    return value !== null && typeof value === 'object' && typeof value.note === 'string';
  }

  /* 与浏览器的计算方式一致：键长 + JSON 序列化后的值长度（按 UTF-8 字节，偏保守） */
  function itemBytes(key, value) {
    return encoder.encode(key).length + encoder.encode(JSON.stringify(value)).length;
  }

  function totalBytes(all) {
    let sum = 0;
    for (const [k, v] of Object.entries(all)) sum += itemBytes(k, v);
    return sum;
  }

  function formatKB(bytes) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  async function rawAll() {
    return (await api.storage.sync.get(null)) ?? {};
  }

  /* 读取全部备注（过滤掉不属于本扩展格式的键） */
  async function getAll() {
    const raw = await rawAll();
    const notes = {};
    for (const [k, v] of Object.entries(raw)) {
      if (normalizeUsername(k) === k && isEntry(v)) notes[k] = v;
    }
    return notes;
  }

  async function get(username) {
    const key = normalizeUsername(username);
    if (!key) return null;
    const res = await api.storage.sync.get(key);
    return isEntry(res?.[key]) ? res[key] : null;
  }

  /*
   * 预检配额：next 为写入后的完整数据。超限时抛出带中文说明的 NoteError，
   * 避免把浏览器的英文报错直接丢给用户。
   */
  function assertQuota(next, changedKeys) {
    for (const key of changedKeys) {
      if (!(key in next)) continue;
      const size = itemBytes(key, next[key]);
      if (size > QUOTA_BYTES_PER_ITEM) {
        throw new NoteError(
          t('err.itemQuota', { user: key, size: formatKB(size), limit: formatKB(QUOTA_BYTES_PER_ITEM) }),
          'ITEM_QUOTA',
        );
      }
    }
    const count = Object.keys(next).length;
    if (count > MAX_ITEMS) {
      throw new NoteError(t('err.maxItems', { count, max: MAX_ITEMS }), 'MAX_ITEMS');
    }
    const bytes = totalBytes(next);
    if (bytes > QUOTA_BYTES) {
      throw new NoteError(t('err.quota', { bytes: formatKB(bytes), quota: formatKB(QUOTA_BYTES) }), 'QUOTA');
    }
  }

  /* 把浏览器抛出的配额错误转换成可读提示 */
  function translateError(err) {
    if (err instanceof NoteError) return err;
    const msg = String(err?.message ?? err);
    if (/QUOTA_BYTES|quota/i.test(msg)) {
      return new NoteError(t('err.quotaFull'), 'QUOTA');
    }
    if (/MAX_WRITE_OPERATIONS/i.test(msg)) {
      return new NoteError(t('err.rate'), 'RATE');
    }
    if (/Extension context invalidated/i.test(msg)) {
      return new NoteError(t('err.invalidated'), 'INVALIDATED');
    }
    return new NoteError(t('err.unknown', { msg }), 'UNKNOWN');
  }

  /* 设置备注；note 为空时等同于删除 */
  async function set(username, note) {
    const key = normalizeUsername(username);
    if (!key) throw new NoteError(t('err.invalidUser', { user: username }), 'INVALID_USER');
    const text = String(note ?? '').trim();
    if (!text) return remove(key);
    if (text.length > MAX_NOTE_LENGTH) {
      throw new NoteError(t('err.tooLong', { max: MAX_NOTE_LENGTH, len: text.length }), 'TOO_LONG');
    }
    const entry = { note: text, updatedAt: Date.now() };
    try {
      const all = await rawAll();
      assertQuota({ ...all, [key]: entry }, [key]);
      await api.storage.sync.set({ [key]: entry });
    } catch (err) {
      throw translateError(err);
    }
    return entry;
  }

  async function remove(username) {
    const key = normalizeUsername(username);
    if (!key) return;
    try {
      await api.storage.sync.remove(key);
    } catch (err) {
      throw translateError(err);
    }
  }

  /* 导出为带格式标记的 JSON 对象 */
  async function exportData() {
    return {
      format: 'ghwho-notes',
      version: 1,
      exportedAt: new Date().toISOString(),
      notes: await getAll(),
    };
  }

  /*
   * 解析导入数据，兼容三种形式：
   *   { format, version, notes: { user: { note, updatedAt } } }  —— 本扩展导出格式
   *   { user: { note, updatedAt } } 或 { user: "备注" }           —— 直接的键值对象
   *   [ { username, note, updatedAt } ]                           —— 数组
   */
  function parseImport(data) {
    let source = data;
    if (source && typeof source === 'object' && !Array.isArray(source) && source.notes) source = source.notes;

    const pairs = [];
    if (Array.isArray(source)) {
      for (const item of source) pairs.push([item?.username ?? item?.login, item]);
    } else if (source && typeof source === 'object') {
      pairs.push(...Object.entries(source));
    } else {
      throw new NoteError(t('err.badFormat'), 'BAD_FORMAT');
    }

    const result = {};
    let skipped = 0;
    for (const [name, value] of pairs) {
      const key = normalizeUsername(name);
      const note = typeof value === 'string' ? value : value?.note;
      if (!key || typeof note !== 'string' || !note.trim()) {
        skipped++;
        continue;
      }
      const ts = Number(typeof value === 'object' ? value.updatedAt : NaN);
      result[key] = {
        note: note.trim().slice(0, MAX_NOTE_LENGTH),
        updatedAt: Number.isFinite(ts) && ts > 0 ? ts : Date.now(),
      };
    }
    return { entries: result, skipped };
  }

  /*
   * 导入。mode:
   *   'merge'   —— 合并，同一用户保留 updatedAt 较新的一条（默认）
   *   'replace' —— 清空现有备注后导入
   */
  async function importData(data, { mode = 'merge' } = {}) {
    const { entries, skipped } = parseImport(data);
    try {
      const raw = await rawAll();
      const existing = {};
      for (const [k, v] of Object.entries(raw)) if (normalizeUsername(k) === k && isEntry(v)) existing[k] = v;

      const toWrite = {};
      let unchanged = 0;
      for (const [key, entry] of Object.entries(entries)) {
        const old = existing[key];
        if (mode === 'merge' && old && (old.updatedAt ?? 0) > entry.updatedAt) {
          unchanged++;
          continue;
        }
        if (old && old.note === entry.note && old.updatedAt === entry.updatedAt) {
          unchanged++;
          continue;
        }
        toWrite[key] = entry;
      }
      const toRemove = mode === 'replace' ? Object.keys(existing).filter((k) => !(k in entries)) : [];

      const next = { ...raw, ...toWrite };
      for (const k of toRemove) delete next[k];
      assertQuota(next, Object.keys(toWrite));

      if (toRemove.length) await api.storage.sync.remove(toRemove);
      if (Object.keys(toWrite).length) await api.storage.sync.set(toWrite);

      return {
        written: Object.keys(toWrite).length,
        removed: toRemove.length,
        unchanged,
        skipped,
      };
    } catch (err) {
      throw translateError(err);
    }
  }

  /* 当前用量 */
  async function usage() {
    const raw = await rawAll();
    const count = Object.entries(raw).filter(([k, v]) => normalizeUsername(k) === k && isEntry(v)).length;
    return {
      bytes: totalBytes(raw),
      quota: QUOTA_BYTES,
      count,
      maxItems: MAX_ITEMS,
    };
  }

  /* 监听备注变化：callback(changes)，changes 为 { username: entry | null } */
  function onChanged(callback) {
    const listener = (changes, area) => {
      if (area !== 'sync') return;
      const out = {};
      let any = false;
      for (const [k, { newValue }] of Object.entries(changes)) {
        if (normalizeUsername(k) !== k) continue;
        out[k] = isEntry(newValue) ? newValue : null;
        any = true;
      }
      if (any) callback(out);
    };
    api.storage.onChanged.addListener(listener);
    return () => api.storage.onChanged.removeListener(listener);
  }

  GHWho.storage = {
    QUOTA_BYTES,
    QUOTA_BYTES_PER_ITEM,
    MAX_ITEMS,
    MAX_NOTE_LENGTH,
    NoteError,
    normalizeUsername,
    formatKB,
    getAll,
    get,
    set,
    remove,
    exportData,
    importData,
    usage,
    onChanged,
  };
})();
