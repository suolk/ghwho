/*
 * 选择器与规则配置。
 * GitHub 改版导致备注不显示或位置错乱时，通常只需要修改这个文件。
 */
(() => {
  const GHWho = (globalThis.GHWho ??= {});

  GHWho.SELECTORS = {
    /*
     * 用户链接，按优先级排列。命中这些选择器的链接直接认定为用户链接，
     * 用户名优先取自 data-hovercard-url（/users/<name>/hovercard），其次取 href。
     */
    userLinks: [
      'a[data-hovercard-type="user"]',
      'a[data-hovercard-url^="/users/"]',
    ],

    /*
     * URL 规则兜底：没有 hovercard 标记的链接，满足以下全部条件才认定为用户链接：
     *   1. href 形如 /<name> 或 https://github.com/<name>（无子路径、无查询串、无锚点）
     *   2. <name> 不在 reservedPaths 中
     *   3. 链接文字就是用户名（可带 @），或链接里只有头像
     * 这样可以覆盖新版 React 页面（如贡献者列表）里没有 hovercard 属性的链接，
     * 同时避免把 "Overview" 之类指向个人主页的标签页链接误判为用户名。
     */
    fallbackLinks: 'a[href^="/"], a[href^="https://github.com/"]',

    /* 头像图片（用于识别“只有头像”的链接） */
    avatar: 'img.avatar, img[class*="avatar" i], img[alt^="@"], svg[class*="avatar" i]',

    /* 这些区域内的链接完全不处理（全局导航、页脚、本扩展自身的 UI 等） */
    ignoreWithin: [
      '.AppHeader',
      '.js-header-wrapper',
      'header.Header',
      'header[class*="MarketingHeader"]',
      '[class*="MarketingHeader-module"]',
      'footer',
      '.footer',
      '.ghwho-badge',
      '.ghwho-popover',
      '[data-ghwho-ignore]',
    ],

    /*
     * 这些区域内只显示已有备注，不显示“+备注”按钮，避免正文里的 @mention、
     * 悬停卡片等位置太嘈杂。
     */
    noAddWithin: [
      '.markdown-body',
      '.comment-body',
      '.Popover',
      '[data-testid="markdown-body"]',
    ],

    /* 判断“头像链接旁是否已有同一用户的文字链接”时，最多向上查找的层数 */
    avatarSiblingDepth: 4,

    /* 用户个人主页 */
    profile: {
      /* 用户名区块，备注块插入到它之后 */
      container: '.vcard-names',
      /* 区块内用户名所在元素（文本即 login） */
      username: '.p-nickname',
    },

    /*
     * github.com/<name> 中不是用户名的保留路径（小写）。
     * GitHub 上新出现的顶级路径如果被误识别，加到这里即可。
     */
    reservedPaths: [
      'about', 'account', 'apps', 'blog', 'business', 'case-studies', 'codespaces',
      'collections', 'contact', 'copilot', 'customer-stories', 'dashboard',
      'discussions', 'education', 'enterprise', 'events', 'explore', 'features',
      'git-guides', 'github-copilot', 'home', 'issues', 'join', 'login', 'logout',
      'marketplace', 'mcp', 'mobile', 'models', 'new', 'nonprofit', 'notifications',
      'open-source', 'organizations', 'orgs', 'partners', 'premium-support',
      'pricing', 'pulls', 'readme', 'repositories', 'resources', 'search',
      'security', 'sessions', 'settings', 'signup', 'site', 'solutions', 'sponsors',
      'spark', 'stars', 'team', 'teams', 'topics', 'trending', 'trust-center',
      'users', 'watching', 'why-github', 'sitemap', 'status', 'password_reset',
    ],
  };
})();
