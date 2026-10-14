# ghwho

[简体中文](README.md) | **English**

Add private notes to GitHub users, right next to their names. Works on Microsoft Edge and Firefox (Manifest V3).

> Available on [Microsoft Edge Add-ons](https://microsoftedge.microsoft.com/addons/detail/ghwho-github-%E7%94%A8%E6%88%B7%E5%A4%87%E6%B3%A8/jepafcbloaophnopbognfebnepklfoea) and [Firefox Add-ons](https://addons.mozilla.org/addon/ghwho-github-%E7%94%A8%E6%88%B7%E5%A4%87%E6%B3%A8/).

## Features

- **Notes everywhere**: user profiles (full note under the name), followers / following lists, organization and team member pages, issue / PR / comment authors, repository contributor lists, sidebar participant avatars
- **Click to edit**: click a note tag to add, edit or delete it in a small popover (`Ctrl+Enter` to save, `Esc` to cancel)
- **Hover to read**: stay on an existing yellow note tag for about 350 ms, then move into the preview to read, select text and scroll through long notes. HTTP / HTTPS and `www.` URLs in notes are clickable and open in a new tab
- **Unobtrusive**: users without a note only show a faint `+ Note` button on hover; @mentions in comment text and hovercards only show existing notes
- **Theme-aware**: follows GitHub's light / dark theme
- **Manager panel**: click the toolbar icon to search all notes, edit or delete them, add one manually, and see storage usage
- **Backup & migration**: JSON export / import, also for moving between Edge and Firefox
- **Chinese / English UI**: follows your browser language by default, and can be switched to 中文 or English at the top of the panel; tags and the editor on open GitHub pages switch instantly without a refresh
- **Feedback links**: the panel footer opens the feedback form or the store rating page
- **Private**: no server and no network requests. Notes stay in your own browser and sync through your own browser account if browser sync is on

## Install

### From the stores

- **Microsoft Edge**: [Get it from Microsoft Edge Add-ons](https://microsoftedge.microsoft.com/addons/detail/ghwho-github-%E7%94%A8%E6%88%B7%E5%A4%87%E6%B3%A8/jepafcbloaophnopbognfebnepklfoea)
- **Firefox**: [Get it from Firefox Add-ons](https://addons.mozilla.org/addon/ghwho-github-%E7%94%A8%E6%88%B7%E5%A4%87%E6%B3%A8/)

### Load from source (development / preview)

Clone the repository with `git clone https://github.com/suolk/ghwho.git`, or use **Code → Download ZIP** and unzip it.

**Edge**

1. Open `edge://extensions` and turn on **Developer mode**
2. Click **Load unpacked** and select the repository root (the folder containing `manifest.json`)
3. A warning that `browser_specific_settings` is unrecognized can be ignored; it is a Firefox-only key

**Firefox**

1. Open `about:debugging#/runtime/this-firefox`
2. Click **Load Temporary Add-on…** and select `manifest.json` in the repository root
3. If the toolbar panel says it has no access to github.com, click **Grant** and allow it
4. Temporary add-ons are removed when Firefox closes

Then open any GitHub page. After changing the code, click **Reload** on the extensions page and refresh the GitHub tab.

## Usage

- **Add a note**: hover near a username and click `+ Note`, or click **+ Add note** under the name on a profile page
- **Edit / delete**: click the yellow note tag
- **Preview a note**: hover a yellow tag or focus it with Tab. Move into the card to read and scroll. Leaving both the tag and the card closes it after about 250 ms; scrolling the surrounding page or pressing `Esc` closes it immediately. Press Tab again from the tag to enter the card and reach its links
- **Manage all notes**: click the extension icon in the toolbar

### Moving between Edge and Firefox

1. In the old browser's panel, click **Export JSON** to get `ghwho-notes-YYYYMMDD.json`
2. In the new browser's panel, choose **Merge** (keep the newer note per user) or **Replace** (clear everything first), then click **Import JSON** and pick the file

> Firefox closes the toolbar panel when a file picker opens, so on Firefox the import button opens the manager in a new tab, where you pick the file.

<details>
<summary>Export format</summary>

```json
{
  "format": "ghwho-notes",
  "version": 1,
  "exportedAt": "2026-10-08T12:00:00.000Z",
  "notes": {
    "torvalds": { "note": "Creator of Linux", "updatedAt": 1791460000000 }
  }
}
```

Import also accepts a plain `{ "username": { "note", "updatedAt" } }` object, `{ "username": "note" }`, or `[{ "username", "note" }]`.

</details>

## Storage & quotas

- Uses the browser's `storage.sync`. Keys are lowercase GitHub usernames; values are `{ note, updatedAt }`
- Browser limits: about **100KB** total, about **8KB** per item, at most **512** items; each note is limited to 2000 characters
- Saving and importing check the quota first and show a message instead of writing partially
- The panel footer shows current usage and turns amber near the limit

## Security & privacy

- Notes are inserted as text nodes, never through `innerHTML`. HTML and scripts remain plain text; HTTP / HTTPS URLs become clickable links
- No background script, automatic network requests or data collection. Clicking a note URL opens the destination in your browser
- Only two permissions: `storage` (save notes) and `https://github.com/*` (show notes on GitHub)

## Feedback

- **Feedback form**: [feedback.netcache24.site](https://feedback.netcache24.site/?app=ghwho). It is sent privately to the developer, and no GitHub access is needed. "Report an issue" at the bottom of the panel opens it with the extension version and browser filled in
- **GitHub Issues**: you can also post a bug report or feature request publicly on [GitHub](https://github.com/suolk/ghwho/issues/new/choose)
- **Like it?** A rating on [Microsoft Edge Add-ons](https://microsoftedge.microsoft.com/addons/detail/ghwho-github-%E7%94%A8%E6%88%B7%E5%A4%87%E6%B3%A8/jepafcbloaophnopbognfebnepklfoea) or [Firefox Add-ons](https://addons.mozilla.org/addon/ghwho-github-%E7%94%A8%E6%88%B7%E5%A4%87%E6%B3%A8/) helps a lot

---

## Development

### Layout

```
manifest.json         Extension manifest (MV3, with Firefox browser_specific_settings.gecko)
_locales/             Localized extension name and description (standard browser i18n, used by stores and the extensions page)
src/selectors.js      All selectors and matching rules (the main file to update when GitHub changes)
src/i18n.js           UI strings (Chinese / English) and language switching
src/storage.js        Storage wrapper: storage.sync, quota checks, import / export
src/content.js        Injection: user link detection, tags, hover previews, editor popover, DOM / Turbo observers
src/content.css       Tag, preview and popover styles (GitHub CSS variables)
popup/                Toolbar panel: popup.html / popup.js / popup.css
icons/                16 / 32 / 48 / 128 icons
scripts/pack.mjs      Dependency-free packer that builds the Edge and Firefox zips
scripts/test-preview.mjs  Preview interaction checks in Edge (no third-party dependencies)
demo/                Local demo, theme screenshots and check results (excluded from extension packages)
```

All extension API calls go through `const api = globalThis.browser ?? globalThis.chrome;`, so the same code runs on Edge and Firefox.

Open [`demo/index.html`](demo/index.html) directly to try previews, editing and language switching. Sample notes live only in page memory. Run `node scripts/test-preview.mjs` for browser checks (Node.js 22+, Windows and an existing Edge installation; set `GHWHO_EDGE_PATH` for another install path). Temporary browser profiles and caches stay under this project's `dist/` and are removed when the script finishes. Screenshots and check results are saved in `demo/`.

The default checks use only the local demo, with no external requests. Add `--github` to open public GitHub profile and Issue pages, check tags, previews and editing in an isolated script environment with sample notes, and save live-page screenshots. The tests do not read existing browser notes. Firefox, the signed-in activity feed and native Hovercard coexistence still need manual testing.

### UI language

- All UI strings live in `MESSAGES` in [`src/i18n.js`](src/i18n.js). The `zh-CN` and `en` dictionaries must have the same keys; a missing key falls back to Chinese
- The language preference is stored under the `__ghwho_settings` key in `storage.sync` (`auto` / `zh-CN` / `en`). It is not a valid GitHub username, so it is never read as a note, exported, or removed by a replace import
- The extension name, description and toolbar tooltip use the standard [`_locales`](_locales) mechanism and follow the browser language, independent of the panel switch

### Maintaining selectors

Everything lives in [`src/selectors.js`](src/selectors.js):

| Key | Purpose |
| --- | --- |
| `userLinks` | Selectors treated as user links directly (default `a[data-hovercard-type="user"]`, …) |
| `fallbackLinks` + `reservedPaths` | URL fallback: `/<username>` links whose text is the username and whose path is not reserved |
| `avatar` | Detects avatar-only links |
| `ignoreWithin` | Areas never processed (global header, footer, …) |
| `noAddWithin` | Areas that show existing notes but no `+ Note` button |
| `profile` | The username block on profile pages |

Debugging tip: processed links get a `data-ghwho-user` attribute (the detected username, or an empty string for non-user links). Inspect them with `document.querySelectorAll('[data-ghwho-user]')`.

GitHub is a Turbo-driven single-page app. The script rescans on `MutationObserver` changes and on `turbo:load` / `turbo:render` / `turbo:frame-load`, and removes its injected nodes on `turbo:before-cache` so cached snapshots don't get duplicate tags.

### Packaging

```bash
node scripts/pack.mjs
```

Builds the Edge and Firefox zips in `dist/` (requires Node.js 18+).

### Compatibility

- Edge / Chrome 109+
- Firefox 140+

## License

[MIT](LICENSE) © 2026 suolk
