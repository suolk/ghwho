# ghwho

**简体中文** | [English](README.en.md)

给 GitHub 用户添加私人备注，显示在用户名旁。支持 Microsoft Edge 和 Firefox（Manifest V3）。

> 已上架 [Microsoft Edge 加载项商店](https://microsoftedge.microsoft.com/addons/detail/ghwho-github-%E7%94%A8%E6%88%B7%E5%A4%87%E6%B3%A8/jepafcbloaophnopbognfebnepklfoea) 和 [Firefox 附加组件商店](https://addons.mozilla.org/addon/ghwho-github-%E7%94%A8%E6%88%B7%E5%A4%87%E6%B3%A8/)。

## 功能

- **到处都能看到备注**：用户个人主页（名字下方显示完整备注）、followers / following 列表、组织和团队成员页、issue / PR / 评论区的作者名、仓库贡献者列表、侧边栏参与者头像
- **点击即可编辑**：点标签弹出小窗口，添加、修改或删除备注（`Ctrl+Enter` 保存，`Esc` 取消）
- **悬停阅读**：在已有黄色备注标签上停留约 350 毫秒，再把鼠标移入预览卡片阅读；支持选择文字、滚动查看长备注，备注中的 HTTP / HTTPS 网址和 `www.` 网址可以点击，在新标签页打开
- **不打扰**：没有备注的用户只在鼠标悬停时显示一个淡淡的 `+备注`；正文里的 @mention 和悬停卡片只显示已有备注
- **跟随主题**：自动适配 GitHub 的亮色 / 暗色主题
- **管理面板**：点击工具栏图标，可以搜索全部备注、编辑删除、手动新增、查看存储用量
- **备份与迁移**：JSON 导出 / 导入，可在 Edge 与 Firefox 之间迁移
- **中英文界面**：默认跟随浏览器语言，也可以在扩展面板顶部切换为中文或 English；GitHub 页面上的标签和编辑弹窗会立即同步切换，无需刷新
- **反馈入口**：扩展面板底部可直接打开反馈页或商店评分页
- **隐私**：没有服务器、不发任何网络请求，备注只保存在你自己的浏览器里（开启浏览器同步时随你自己的浏览器账号同步）

## 安装

### 从商店安装

- **Microsoft Edge**：[在 Edge 加载项商店获取](https://microsoftedge.microsoft.com/addons/detail/ghwho-github-%E7%94%A8%E6%88%B7%E5%A4%87%E6%B3%A8/jepafcbloaophnopbognfebnepklfoea)
- **Firefox**：[在 Firefox 附加组件商店获取](https://addons.mozilla.org/addon/ghwho-github-%E7%94%A8%E6%88%B7%E5%A4%87%E6%B3%A8/)

### 从源码加载（开发 / 预览）

先下载本仓库：`git clone https://github.com/suolk/ghwho.git`，或在页面上点 **Code → Download ZIP** 并解压。

**Edge**

1. 打开 `edge://extensions`，打开 **开发人员模式**
2. 点击 **加载解压缩的扩展**，选择仓库根目录（包含 `manifest.json` 的文件夹）
3. 出现 `browser_specific_settings` 无法识别的提示可以忽略，这是 Firefox 专用字段

**Firefox**

1. 打开 `about:debugging#/runtime/this-firefox`
2. 点击 **临时载入附加组件…**，选择仓库根目录下的 `manifest.json`
3. 如果点击扩展图标后显示「尚未授权访问 github.com」，点 **授权** 并允许
4. 临时载入的附加组件在关闭 Firefox 后会被移除

加载后打开任意 GitHub 页面即可使用；修改代码后在扩展管理页点 **重新加载**，再刷新 GitHub 页面。

## 使用

- **添加备注**：鼠标悬停在用户名附近，点击出现的 `+备注`；或在个人主页名字下方点 **+ 添加备注**
- **编辑 / 删除**：点击黄色的备注标签
- **预览备注**：悬停黄色标签，或用 Tab 聚焦；鼠标可移入卡片，长备注可在卡片里滚动。离开标签和卡片约 250 毫秒后关闭，滚动外部页面或按 `Esc` 立即关闭。聚焦标签后再按 Tab 可进入卡片，继续访问其中的链接
- **管理全部备注**：点击浏览器工具栏中的扩展图标

### 在 Edge 和 Firefox 之间迁移

1. 在原浏览器的扩展面板点 **导出 JSON**，得到 `ghwho-notes-YYYYMMDD.json`
2. 在新浏览器的扩展面板选择 **合并导入**（同一用户保留较新的一条）或 **覆盖导入**（清空后导入），点 **导入 JSON** 选择该文件

> Firefox 的扩展面板在打开文件选择框时会被关闭，所以在 Firefox 中点「导入 JSON」会自动在新标签页打开管理页面，在那里选择文件即可。

<details>
<summary>导出文件格式</summary>

```json
{
  "format": "ghwho-notes",
  "version": 1,
  "exportedAt": "2026-10-08T12:00:00.000Z",
  "notes": {
    "torvalds": { "note": "Linux 作者", "updatedAt": 1791460000000 }
  }
}
```

导入也接受直接的 `{ "用户名": { "note", "updatedAt" } }`、`{ "用户名": "备注" }` 或 `[{ "username", "note" }]` 形式。

</details>

## 存储与配额

- 使用浏览器的 `storage.sync`，键为小写 GitHub 用户名，值为 `{ note, updatedAt }`
- 浏览器限制：总量约 **100KB**、单条约 **8KB**、最多 **512** 条；单条备注最多 2000 字符
- 保存和导入前会先检查写入后是否超限，超限时给出提示，不会只写入一半
- 扩展面板底部显示当前用量，接近上限时会变色提示

## 安全与隐私

- 备注使用文本节点插入页面，不使用 `innerHTML`；HTML / 脚本会原样显示为文字，HTTP / HTTPS 网址会生成可点击链接
- 没有后台脚本，不自动发起网络请求，不收集任何数据；点击备注中的网址时，由浏览器打开对应页面
- 只申请两项权限：`storage`（保存备注）和 `https://github.com/*`（在 GitHub 页面上显示备注）

## 反馈

- **反馈页**：[feedback.netcache24.site](https://feedback.netcache24.site/?app=ghwho)，内容私下发送给开发者，不需要能访问 GitHub。扩展面板底部的「反馈问题」会直接打开它，并自动填好扩展版本和浏览器
- **GitHub Issues**：也可以在 [GitHub](https://github.com/suolk/ghwho/issues/new/choose) 公开提交「问题反馈」或「功能建议」
- **喜欢的话**：欢迎在 [Edge 加载项商店](https://microsoftedge.microsoft.com/addons/detail/ghwho-github-%E7%94%A8%E6%88%B7%E5%A4%87%E6%B3%A8/jepafcbloaophnopbognfebnepklfoea) 或 [Firefox 附加组件商店](https://addons.mozilla.org/addon/ghwho-github-%E7%94%A8%E6%88%B7%E5%A4%87%E6%B3%A8/) 留下评分

---

## 开发

### 目录结构

```
manifest.json         扩展清单（MV3，含 Firefox 的 browser_specific_settings.gecko）
_locales/             扩展名称、描述的中英文（浏览器标准 i18n，用于商店和扩展管理页）
src/selectors.js      所有选择器与识别规则（GitHub 改版后主要改这里）
src/i18n.js           界面文案（中文 / English）与语言切换
src/storage.js        存储封装：storage.sync、配额检查、导入导出
src/content.js        注入逻辑：识别用户链接、渲染标签、悬停预览、编辑弹窗、监听 DOM / Turbo
src/content.css       标签、预览与弹窗样式（使用 GitHub 的 CSS 变量）
popup/                扩展面板 popup.html / popup.js / popup.css
icons/                16 / 32 / 48 / 128 图标
scripts/pack.mjs      打包脚本（无依赖），生成 Edge 与 Firefox 的 zip
scripts/test-preview.mjs  Edge 浏览器中的预览交互检查（无第三方依赖）
demo/                本地演示页面、亮暗主题截图与检查记录（不进入扩展安装包）
```

代码中统一使用 `const api = globalThis.browser ?? globalThis.chrome;` 调用扩展 API，同一份代码同时运行在 Edge 和 Firefox 上。

直接打开 [`demo/index.html`](demo/index.html) 可以试用预览、编辑和语言切换，示例数据只存在当前页面的内存里。检查交互可运行 `node scripts/test-preview.mjs`（Node.js 22+、Windows、已安装 Edge；其他安装路径用 `GHWHO_EDGE_PATH` 指定）。脚本把临时浏览器配置和缓存放在项目 `dist/` 下，结束后删除，并在 `demo/` 更新截图和检查记录。

默认检查只使用本地示例页面，没有外部请求。加上 `--github` 会打开公开的 GitHub 个人主页和 Issue 页面，在独立脚本环境中使用示例备注检查标签、预览和编辑，并保存实际页面截图。测试不读取现有的浏览器备注。Firefox、登录后的动态列表和 GitHub 原生 Hovercard 共存仍需手动验证。

### 界面语言

- 所有界面文案在 [`src/i18n.js`](src/i18n.js) 的 `MESSAGES` 中，`zh-CN` 和 `en` 两份词典的键必须一一对应；缺失的键回退到中文
- 语言偏好存在 `storage.sync` 的 `__ghwho_settings` 键中（`auto` / `zh-CN` / `en`）。这个键不是合法的 GitHub 用户名，不会被当作备注读取、导出，也不会在覆盖导入时被删除
- 扩展名称、描述和工具栏按钮提示用浏览器标准的 [`_locales`](_locales) 机制，按浏览器语言显示，不受面板里的切换影响

### GitHub 改版后的维护

所有选择器与规则集中在 [`src/selectors.js`](src/selectors.js)：

| 配置项 | 作用 |
| --- | --- |
| `userLinks` | 直接认定为用户链接的选择器（默认 `a[data-hovercard-type="user"]` 等） |
| `fallbackLinks` + `reservedPaths` | URL 规则兜底：`/<username>` 形式、链接文字就是用户名、且不在保留路径中 |
| `avatar` | 识别"只有头像"的链接 |
| `ignoreWithin` | 完全不处理的区域（全局导航、页脚等） |
| `noAddWithin` | 只显示已有备注、不显示 `+备注` 的区域 |
| `profile` | 个人主页用户名区块 |

调试技巧：处理过的链接会带有 `data-ghwho-user` 属性（值为识别出的用户名，非用户链接为空串），可在开发者工具中用 `document.querySelectorAll('[data-ghwho-user]')` 查看。

GitHub 是 Turbo 驱动的单页应用，脚本通过 `MutationObserver` 加 `turbo:load` / `turbo:render` / `turbo:frame-load` 事件重新扫描，并在 `turbo:before-cache` 时清理注入内容，避免缓存快照里出现重复标签。

### 打包

```bash
node scripts/pack.mjs
```

在 `dist/` 下生成 Edge 和 Firefox 两个 zip 包（需要 Node.js 18+）。

### 兼容性

- Edge / Chrome 109+
- Firefox 140+

## 许可证

[MIT](LICENSE) © 2026 suolk
