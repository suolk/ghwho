/* 本地演示使用内存数据；点击备注中的网址时，由浏览器打开新标签页。 */
(() => {
  const initial = {
    __ghwho_settings: { lang: 'zh-CN' },
    'sxp-simon': {
      note: '之前一起讨论过开源工具，后续可以关注他的项目。\n\n关注方向：AI Agent、浏览器扩展。\n项目链接：https://github.com/suolk/ghwho\n下次交流时问问 agent-notes 的进展。',
      updatedAt: 1791763200000,
    },
    lin: { note: '开源工具作者', updatedAt: 1791763200000 },
    'archive-user': {
      note: '项目交流记录：保留原始换行，方便回看讨论。\n'.repeat(100).slice(0, 2000 - '【备注末尾】\n项目链接：https://github.com/suolk/ghwho'.length) + '【备注末尾】\n项目链接：https://github.com/suolk/ghwho',
      updatedAt: 1791763200000,
    },
  };
  const data = structuredClone(initial);
  const listeners = new Set();
  const notify = (changes) => {
    for (const listener of listeners) listener(changes, 'sync');
  };
  globalThis.browser = {
    runtime: { id: 'ghwho-local-demo' },
    i18n: { getUILanguage: () => 'zh-CN' },
    storage: {
      sync: {
        async get(keys) {
          if (keys === null) return structuredClone(data);
          const names = typeof keys === 'string' ? [keys] : Array.isArray(keys) ? keys : Object.keys(keys);
          return Object.fromEntries(names.filter((key) => key in data).map((key) => [key, structuredClone(data[key])]));
        },
        async set(values) {
          const changes = {};
          for (const [key, value] of Object.entries(values)) {
            changes[key] = { oldValue: data[key], newValue: structuredClone(value) };
            data[key] = structuredClone(value);
          }
          notify(changes);
        },
        async remove(keys) {
          const changes = {};
          for (const key of typeof keys === 'string' ? [keys] : keys) {
            changes[key] = { oldValue: data[key] };
            delete data[key];
          }
          notify(changes);
        },
      },
      onChanged: {
        addListener: (listener) => listeners.add(listener),
        removeListener: (listener) => listeners.delete(listener),
      },
    },
  };
  document.getElementById('theme-toggle').addEventListener('click', (e) => {
    const dark = document.documentElement.dataset.theme !== 'dark';
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    e.currentTarget.textContent = dark ? '切换浅色' : '切换深色';
  });
  document.getElementById('lang-toggle').addEventListener('click', async (e) => {
    const english = globalThis.GHWho.i18n.getLang() !== 'en';
    await globalThis.GHWho.i18n.setPreference(english ? 'en' : 'zh-CN');
    e.currentTarget.textContent = english ? '中文预览' : 'English 预览';
  });
  document.getElementById('reset').addEventListener('click', () => location.reload());
  document.addEventListener('click', (e) => {
    const link = e.target.closest('a');
    if (link && !link.classList.contains('ghwho-preview-link')) e.preventDefault();
  }, true);
})();
