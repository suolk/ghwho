# ghwho

**简体中文** | [English](README.en.md)

给 GitHub 用户添加私人备注，显示在用户名旁。支持 Microsoft Edge 和 Firefox（Manifest V3）。

> 即将上线 Edge Add-ons 与 Firefox 附加组件商店，上线前可以按下方步骤从源码加载。

## 功能

- **到处都能看到备注**：用户个人主页（名字下方显示完整备注）、followers / following 列表、组织和团队成员页、issue / PR / 评论区的作者名、仓库贡献者列表、侧边栏参与者头像
- **点击即可编辑**：点标签弹出小窗口，添加、修改或删除备注（`Ctrl+Enter` 保存，`Esc` 取消）
- **不打扰**：没有备注的用户只在鼠标悬停时显示一个淡淡的 `+备注`；正文里的 @mention 和悬停卡片只显示已有备注
- **跟随主题**：自动适配 GitHub 的亮色 / 暗色主题
- **管理面板**：点击工具栏图标，可以搜索全部备注、编辑删除、手动新增、查看存储用量
- **备份与迁移**：JSON 导出 / 导入，可在 Edge 与 Firefox 之间迁移
- **隐私**：没有服务器、不发任何网络请求，备注只保存在你自己的浏览器里（开启浏览器同步时随你自己的浏览器账号同步）

## 安装

### 从商店安装

即将上线，敬请期待。

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

- 备注文本一律通过 `textContent` 插入页面，不使用 `innerHTML`，备注中写 HTML / 脚本只会原样显示为文字
- 没有后台脚本，不发起任何网络请求，不收集任何数据
- 只申请两项权限：`storage`（保存备注）和 `https://github.com/*`（在 GitHub 页面上显示备注）

---

## 开发

### 目录结构

```
manifest.json         扩展清单（MV3，含 Firefox 的 browser_specific_settings.gecko）
src/selectors.js      所有选择器与识别规则（GitHub 改版后主要改这里）
src/storage.js        存储封装：storage.sync、配额检查、导入导出
src/content.js        注入逻辑：识别用户链接、渲染标签、编辑弹窗、监听 DOM / Turbo
src/content.css       标签与弹窗样式（使用 GitHub 的 CSS 变量）
popup/                扩展面板 popup.html / popup.js / popup.css
icons/                16 / 32 / 48 / 128 图标
scripts/pack.mjs      打包脚本（无依赖），生成 Edge 与 Firefox 的 zip
```

代码中统一使用 `const api = globalThis.browser ?? globalThis.chrome;` 调用扩展 API，同一份代码同时运行在 Edge 和 Firefox 上。

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

需要 Node.js 18+：

```bash
node scripts/pack.mjs
```

生成 `dist/ghwho-edge-<version>.zip`（去掉了 `browser_specific_settings`）和 `dist/ghwho-firefox-<version>.zip`（原样清单）。

> 不要用 Windows PowerShell 5.1 的 `Compress-Archive` 打包：它生成的 zip 内部路径使用反斜杠，addons.mozilla.org 会拒绝。也可以用 Mozilla 官方工具 `npx web-ext build`。

发布新版本前记得修改 `manifest.json` 中的 `version`。

### 发布到 Edge Add-ons

1. 用 Microsoft 账号登录 [Partner Center](https://partner.microsoft.com/dashboard/microsoftedge/overview)，首次需要注册开发者账号（免费）
2. **Create new extension** → 上传 `dist/ghwho-edge-<version>.zip`
3. 填写商店信息：名称、描述、类别、截图（至少 1 张，1280×800 或 640×400）
4. 隐私：不收集个人数据；权限用途：`storage` 保存备注，`https://github.com/*` 在 GitHub 页面上显示备注
5. 提交审核；更新时在同一扩展下上传新版本 zip

### 发布到 addons.mozilla.org（AMO）

1. 扩展 ID 为 `ghwho@suolk.cc.cd`（`manifest.json` → `browser_specific_settings.gecko.id`）。首次上传后该 ID 即归属发布者的 AMO 账号，**之后不要再改**，否则会被当作另一个扩展，已安装的用户收不到更新
2. 建议先检查：`npx web-ext lint`
3. 登录 [AMO 开发者中心](https://addons.mozilla.org/developers/) → **Submit a New Add-on**，选择 **On this site**（公开上架）或 **On your own**（只签名，自行分发 `.xpi`）
4. 上传 `dist/ghwho-firefox-<version>.zip`；代码没有经过压缩或转换，无需另外提交源码
5. 填写描述、截图、分类、许可证（MIT）、隐私政策（不收集数据）；`data_collection_permissions` 已在清单中声明为 `none`
6. 通过自动审核后即签名上架；也可以用命令行：

```bash
npx web-ext sign --channel=listed --api-key=$AMO_JWT_ISSUER --api-secret=$AMO_JWT_SECRET
```

### 兼容性

- Edge / Chrome 109+
- Firefox 140+（`data_collection_permissions` 需要 140 及以上；AMO 要求新上架的扩展声明此字段）

## 许可证

[MIT](LICENSE) © 2026 suolk
