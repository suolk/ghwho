#!/usr/bin/env node
/* 无第三方依赖的 Edge 页面检查。临时配置、缓存和日志只写入项目的 dist 目录。 */
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile, mkdir, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TEMP = join(ROOT, 'dist', `.preview-check-${process.pid}`);
const EDGE = process.env.GHWHO_EDGE_PATH ?? 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const delay = (ms) => new Promise((done) => setTimeout(done, ms));
const errors = [];
const requests = [];
const results = [];
let linkVisits = 0;
let browser;
let socket;
let command;

if (!existsSync(EDGE)) throw new Error('找不到 Edge，请通过 GHWHO_EDGE_PATH 指定已有的浏览器路径。');
await mkdir(TEMP, { recursive: true });

const server = createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (pathname === '/preview-link-check') {
      linkVisits++;
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.end('<!doctype html><title>ghwho link opened</title><p>Link navigation passed.</p>');
      return;
    }
    const path = resolve(ROOT, `.${pathname}`);
    if (!path.startsWith(`${ROOT}${sep}`)) { res.writeHead(403).end(); return; }
    const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png' };
    res.setHeader('Content-Type', mime[extname(path)] ?? 'application/octet-stream');
    res.end(await readFile(path));
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((done) => server.listen(0, '127.0.0.1', done));
const origin = `http://127.0.0.1:${server.address().port}`;

function connect(url) {
  return new Promise((done, reject) => {
    socket = new WebSocket(url);
    let nextId = 0;
    const pending = new Map();
    socket.addEventListener('error', reject, { once: true });
    socket.addEventListener('message', (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id) {
        const entry = pending.get(msg.id);
        if (!entry) return;
        clearTimeout(entry.timer);
        pending.delete(msg.id);
        if (msg.error) entry.reject(new Error(JSON.stringify(msg.error)));
        else entry.done(msg.result);
      } else if (msg.method === 'Runtime.exceptionThrown') {
        errors.push(msg.params.exceptionDetails);
      } else if (msg.method === 'Network.requestWillBeSent') {
        requests.push(msg.params.request.url);
      }
    });
    socket.addEventListener('open', () => {
      command = (method, params = {}) => new Promise((doneCommand, rejectCommand) => {
        const id = ++nextId;
        const timer = setTimeout(() => { pending.delete(id); rejectCommand(new Error(`CDP 超时：${method}`)); }, 10000);
        pending.set(id, { done: doneCommand, reject: rejectCommand, timer });
        socket.send(JSON.stringify({ id, method, params }));
      });
      done();
    }, { once: true });
  });
}

async function evaluate(expression) {
  const result = await command('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
  return result.result.value;
}

async function check(name, fn) {
  await fn();
  results.push(name);
  console.log(`通过：${name}`);
}

const featured = '#featured-user + .ghwho-badge';
const short = '.demo-feed [data-ghwho-for="lin"]';
const long = '[data-ghwho-for="archive-user"]';
const previewCount = () => evaluate('document.querySelectorAll(".ghwho-preview").length');
const event = (selector, type) => evaluate(`document.querySelector(${JSON.stringify(selector)}).dispatchEvent(new MouseEvent(${JSON.stringify(type)}))`);
const hover = async (selector) => { await event(selector, 'mouseenter'); await delay(390); };
const close = () => evaluate('window.dispatchEvent(new Event("blur"))');
const sync = (values) => evaluate(`browser.storage.sync.set(${JSON.stringify(values)})`);

async function moveTo(selector) {
  const point = await evaluate(`(() => { const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
  await command('Input.dispatchMouseEvent', { type: 'mouseMoved', ...point });
}

async function press(key, code, windowsVirtualKeyCode, modifiers = 0) {
  const text = key === 'Enter' ? '\r' : key === ' ' ? ' ' : undefined;
  await command('Input.dispatchKeyEvent', { type: text ? 'keyDown' : 'rawKeyDown', key, code, windowsVirtualKeyCode, text, modifiers });
  await command('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode, modifiers });
}

async function bounds() {
  return evaluate(`(() => {
    const r = document.querySelector('.ghwho-preview').getBoundingClientRect();
    return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height, vw: document.documentElement.clientWidth, vh: innerHeight };
  })()`);
}

function withinViewport(r) {
  assert.ok(r.left >= 7 && r.top >= 7 && r.right <= r.vw - 7 && r.bottom <= r.vh - 7, JSON.stringify(r));
}

try {
  browser = spawn(EDGE, [
    '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${join(TEMP, 'profile')}`,
    `--disk-cache-dir=${join(TEMP, 'cache')}`, `--crash-dumps-dir=${join(TEMP, 'crashes')}`,
    '--no-first-run', '--no-default-browser-check', '--disable-background-networking',
    '--disable-component-update', '--disable-sync', '--disable-breakpad', '--disable-crash-reporter',
    '--disable-extensions', 'about:blank',
  ], { windowsHide: true, env: { ...process.env, TEMP, TMP: TEMP }, stdio: 'ignore' });
  let port;
  for (let i = 0; i < 100; i++) {
    if (browser.exitCode !== null) throw new Error(`Edge 提前退出：${browser.exitCode}`);
    try { port = Number((await readFile(join(TEMP, 'profile', 'DevToolsActivePort'), 'utf8')).split('\n')[0]); break; } catch { await delay(100); }
  }
  if (!port) throw new Error('Edge 调试端口未启动。');
  const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  await connect(pages.find((page) => page.type === 'page').webSocketDebuggerUrl);
  await command('Runtime.enable');
  await command('Network.enable');
  await command('Page.enable');
  await command('Emulation.setDeviceMetricsOverride', { width: 1280, height: 1040, deviceScaleFactor: 1, mobile: false });
  await command('Page.navigate', { url: `${origin}/demo/index.html` });
  for (let i = 0; i < 100 && !(await evaluate('!!document.querySelector(".ghwho-badge")')); i++) await delay(50);

  await check('原有注入场景和原生提示', async () => {
    assert.ok((await evaluate('document.querySelectorAll(".ghwho-badge").length')) >= 7);
    assert.equal(await evaluate(`document.querySelector('${featured}').hasAttribute('title')`), false);
    assert.ok(await evaluate(`document.querySelector('${featured}').getAttribute('aria-label').includes('之前一起讨论')`));
    assert.ok(await evaluate('document.querySelector("[data-ghwho-for=newcomer]").title.includes("添加备注")'));
    assert.ok(await evaluate('!!document.querySelector(".ghwho-profile .ghwho-has-note")'));
    assert.ok(await evaluate('!!document.querySelector(".markdown-body .ghwho-mode-passive")'));
  });

  await check('真实鼠标悬停延时和多行文本', async () => {
    await moveTo(featured);
    await delay(160);
    assert.equal(await previewCount(), 0);
    await delay(240);
    assert.equal(await previewCount(), 1);
    assert.equal(await evaluate('document.querySelector(".ghwho-preview-body").textContent'), (await evaluate('browser.storage.sync.get("sxp-simon")'))['sxp-simon'].note);
    assert.equal(await evaluate('getComputedStyle(document.querySelector(".ghwho-preview-body")).whiteSpace'), 'pre-wrap');
    assert.equal(await evaluate('getComputedStyle(document.querySelector(".ghwho-preview")).pointerEvents'), 'auto');
    assert.equal(await evaluate('document.querySelector(".ghwho-preview").hasAttribute("aria-hidden")'), false);
    assert.equal(await evaluate('document.querySelector(".ghwho-preview").getAttribute("role")'), 'region');
  });

  await check('亮暗主题截图和页面布局稳定', async () => {
    const before = await evaluate('document.querySelector("#featured-event").getBoundingClientRect().height');
    withinViewport(await bounds());
    const light = await command('Page.captureScreenshot', { format: 'png' });
    await writeFile(join(ROOT, 'demo', 'preview-light.png'), Buffer.from(light.data, 'base64'));
    const lightColor = await evaluate('getComputedStyle(document.querySelector(".ghwho-preview")).backgroundColor');
    await evaluate('document.documentElement.dataset.theme = "dark"');
    await delay(180);
    assert.notEqual(await evaluate('getComputedStyle(document.querySelector(".ghwho-preview")).backgroundColor'), lightColor);
    const dark = await command('Page.captureScreenshot', { format: 'png' });
    await writeFile(join(ROOT, 'demo', 'preview-dark.png'), Buffer.from(dark.data, 'base64'));
    await evaluate('document.documentElement.dataset.theme = "light"');
    await close();
    await command('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 2, y: 2 });
    assert.equal(await evaluate('document.querySelector("#featured-event").getBoundingClientRect().height'), before);
  });

  await check('真实鼠标跨过空隙移入卡片，可停留和选择备注文字', async () => {
    await moveTo(featured);
    await delay(390);
    const gap = await evaluate(`(() => {
      const tag = document.querySelector('${featured}').getBoundingClientRect();
      const card = document.querySelector('.ghwho-preview').getBoundingClientRect();
      return { x: tag.left + 15, y: (tag.bottom + card.top) / 2 };
    })()`);
    await command('Input.dispatchMouseEvent', { type: 'mouseMoved', ...gap });
    await delay(110);
    assert.equal(await previewCount(), 1);
    await moveTo('.ghwho-preview-body');
    await delay(400);
    assert.equal(await previewCount(), 1);
    const area = await evaluate(`(() => { const r = document.querySelector('.ghwho-preview-body').getBoundingClientRect(); return { x: r.left + 5, y: r.top + 10, endX: r.left + 220, endY: r.top + 10 }; })()`);
    await command('Input.dispatchMouseEvent', { type: 'mouseMoved', x: area.x, y: area.y });
    await command('Input.dispatchMouseEvent', { type: 'mousePressed', x: area.x, y: area.y, button: 'left', clickCount: 1 });
    await command('Input.dispatchMouseEvent', { type: 'mouseMoved', x: area.endX, y: area.endY, button: 'left', buttons: 1 });
    await command('Input.dispatchMouseEvent', { type: 'mouseReleased', x: area.endX, y: area.endY, button: 'left', clickCount: 1 });
    await delay(60);
    assert.ok(await evaluate('getSelection().toString().length > 0'));
    assert.equal(await previewCount(), 1);
    assert.equal(await evaluate('document.querySelectorAll(".ghwho-popover").length'), 0);
    await evaluate('getSelection().removeAllRanges()');
    await command('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 2, y: 2 });
    await delay(100);
    assert.equal(await previewCount(), 1);
    await delay(220);
    assert.equal(await previewCount(), 0);
  });

  await check('备注网址可真实点击，在新标签页打开目标页面', async () => {
    const previous = (await evaluate('browser.storage.sync.get("sxp-simon")'))['sxp-simon'];
    const destination = `${origin}/preview-link-check?from=note&value=1`;
    await sync({ 'sxp-simon': { note: `项目链接：${destination}`, updatedAt: Date.now() } });
    await moveTo(featured);
    await delay(390);
    await moveTo('.ghwho-preview-link');
    await delay(300);
    assert.equal(await previewCount(), 1);
    const point = await evaluate(`(() => { const r = document.querySelector('.ghwho-preview-link').getClientRects()[0]; return { x: r.left + 20, y: r.top + r.height / 2 }; })()`);
    await command('Input.dispatchMouseEvent', { type: 'mouseMoved', ...point });
    await command('Input.dispatchMouseEvent', { type: 'mousePressed', ...point, button: 'left', clickCount: 1 });
    await command('Input.dispatchMouseEvent', { type: 'mouseReleased', ...point, button: 'left', clickCount: 1 });
    let target;
    for (let i = 0; i < 60; i++) {
      const tabs = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      target = tabs.find((tab) => tab.url === destination);
      if (target && linkVisits) break;
      await delay(50);
    }
    assert.ok(target, '点击网址后没有打开目标标签页');
    assert.ok(linkVisits > 0, '目标页面没有收到导航请求');
    assert.equal(await evaluate('document.querySelectorAll(".ghwho-popover").length'), 0);
    await command('Target.closeTarget', { targetId: target.id });
    await close();
    await command('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 2, y: 2 });
    await sync({ 'sxp-simon': previous });
  });

  await check('快速划过、离开、切换用户、未备注用户', async () => {
    await event(featured, 'mouseenter');
    await delay(100);
    await event(featured, 'mouseleave');
    await delay(350);
    assert.equal(await previewCount(), 0);
    await hover(featured);
    await event(short, 'mouseenter');
    assert.equal(await previewCount(), 0);
    await delay(390);
    assert.equal(await previewCount(), 1);
    assert.equal(await evaluate('document.querySelector(".ghwho-preview-user").textContent'), '@lin');
    await event(short, 'mouseleave');
    await delay(300);
    assert.equal(await previewCount(), 0);
    await hover('[data-ghwho-for="newcomer"]');
    assert.equal(await previewCount(), 0);
  });

  await check('点击编辑、编辑期间禁用预览、取消后恢复焦点', async () => {
    await hover(featured);
    await evaluate(`document.querySelector('${featured}').click()`);
    assert.equal(await previewCount(), 0);
    assert.ok(await evaluate('!!document.querySelector(".ghwho-popover textarea")'));
    await hover(short);
    assert.equal(await previewCount(), 0);
    await press('Escape', 'Escape', 27);
    assert.equal(await evaluate('document.querySelectorAll(".ghwho-popover").length'), 0);
    assert.equal(await previewCount(), 0);
    assert.equal(await evaluate(`document.activeElement === document.querySelector('${featured}')`), true);
    await delay(390);
    assert.equal(await previewCount(), 0);
  });

  await check('键盘焦点、Esc、Enter 和 Space', async () => {
    for (const [key, code, number] of [['Enter', 'Enter', 13], [' ', 'Space', 32]]) {
      await evaluate(`document.querySelector('${featured}').blur(); document.querySelector('${featured}').focus()`);
      assert.equal(await previewCount(), 1);
      await press('Escape', 'Escape', 27);
      assert.equal(await previewCount(), 0);
      await press(key, code, number);
      assert.ok(await evaluate('!!document.querySelector(".ghwho-popover")'), `按键 ${JSON.stringify(key)}；焦点 ${await evaluate('document.activeElement.outerHTML')}`);
      await press('Escape', 'Escape', 27);
      assert.equal(await previewCount(), 0);
    }
  });

  await check('键盘可进入卡片和网址，Esc 或 Shift+Tab 返回标签', async () => {
    await evaluate(`document.querySelector('${featured}').blur(); document.querySelector('${featured}').focus()`);
    await press('Tab', 'Tab', 9);
    assert.equal(await evaluate('document.activeElement.classList.contains("ghwho-preview-body")'), true);
    await delay(320);
    assert.equal(await previewCount(), 1);
    await press('Tab', 'Tab', 9);
    assert.equal(await evaluate('document.activeElement.classList.contains("ghwho-preview-link")'), true);
    await press('Escape', 'Escape', 27);
    assert.equal(await previewCount(), 0);
    assert.equal(await evaluate(`document.activeElement === document.querySelector('${featured}')`), true);
    await delay(390);
    assert.equal(await previewCount(), 0);
    await evaluate(`document.querySelector('${featured}').blur(); document.querySelector('${featured}').focus()`);
    await press('Tab', 'Tab', 9);
    await press('Tab', 'Tab', 9, 8);
    assert.equal(await previewCount(), 0);
    assert.equal(await evaluate(`document.activeElement === document.querySelector('${featured}')`), true);
  });

  await check('保存、删除和同一用户的多处标签', async () => {
    await evaluate(`document.querySelector('${featured}').click(); document.querySelector('.ghwho-textarea').value = ${JSON.stringify('更新后的备注\n保留换行')}; document.querySelector('.ghwho-btn-primary').click()`);
    await delay(60);
    assert.equal(await evaluate('document.querySelectorAll(".ghwho-popover").length'), 0);
    assert.equal(await previewCount(), 0);
    assert.equal(await evaluate('Array.from(document.querySelectorAll("[data-ghwho-for=sxp-simon] .ghwho-text")).every(n => n.textContent === "更新后的备注 保留换行")'), true);
    await hover(featured);
    assert.equal(await evaluate('document.querySelector(".ghwho-preview-body").textContent'), '更新后的备注\n保留换行');
    await evaluate(`document.querySelector('${featured}').click(); document.querySelector('.ghwho-btn-danger').click()`);
    await delay(60);
    assert.equal(await previewCount(), 0);
    assert.equal(await evaluate(`document.querySelector('${featured}').classList.contains('ghwho-add')`), true);
    assert.equal(await evaluate('document.querySelector(".demo-comment [data-ghwho-for=sxp-simon]").classList.contains("ghwho-add")'), true);
    await sync({ 'sxp-simon': { note: '同步后的备注', updatedAt: Date.now() } });
  });

  await check('同步变更立即关闭旧数据和待显示计时器', async () => {
    await hover(featured);
    await sync({ 'sxp-simon': { note: '来自另一台设备', updatedAt: Date.now() } });
    assert.equal(await previewCount(), 0);
    await hover(featured);
    assert.equal(await evaluate('document.querySelector(".ghwho-preview-body").textContent'), '来自另一台设备');
    await close();
    await event(featured, 'mouseenter');
    await evaluate('browser.storage.sync.remove("sxp-simon")');
    await delay(390);
    assert.equal(await previewCount(), 0);
    await sync({ 'sxp-simon': { note: '节点清理检查', updatedAt: Date.now() } });
  });

  await check('语言切换关闭旧卡片，新卡片显示英文', async () => {
    await hover(long);
    await evaluate('GHWho.i18n.setPreference("en")');
    assert.equal(await previewCount(), 0);
    await hover(long);
    assert.equal(await evaluate('document.querySelector(".ghwho-preview-meta").textContent'), 'Private note');
    assert.equal(await evaluate('document.querySelector(".ghwho-preview-hint").textContent'), 'Scroll to read the full note');
    await evaluate('GHWho.i18n.setPreference("zh-CN")');
  });

  await check('长备注可在卡片内用真实滚轮读到末尾，页面不滚动', async () => {
    await hover(long);
    withinViewport(await bounds());
    assert.equal(await evaluate('document.querySelector(".ghwho-preview-body").textContent.length'), 2000);
    assert.equal(await evaluate('document.querySelector(".ghwho-preview-hint").hidden'), false);
    assert.equal(await evaluate('document.querySelectorAll(".ghwho-preview button").length'), 0);
    assert.equal(await evaluate('document.querySelectorAll(".ghwho-preview-link").length'), 1);
    await moveTo('.ghwho-preview-body');
    const point = await evaluate(`(() => { const r = document.querySelector('.ghwho-preview-body').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
    const pageY = await evaluate('scrollY');
    await command('Input.dispatchMouseEvent', { type: 'mouseWheel', ...point, deltaX: 0, deltaY: 280 });
    await delay(200);
    assert.ok(await evaluate('document.querySelector(".ghwho-preview-body").scrollTop > 0'));
    assert.equal(await previewCount(), 1);
    assert.equal(await evaluate('scrollY'), pageY);
    await command('Input.dispatchMouseEvent', { type: 'mouseWheel', ...point, deltaX: 0, deltaY: 5000 });
    await delay(350);
    assert.equal(await evaluate('document.querySelector(".ghwho-preview-body").scrollTop + document.querySelector(".ghwho-preview-body").clientHeight >= document.querySelector(".ghwho-preview-body").scrollHeight - 2'), true);
    assert.equal(await previewCount(), 1);
    assert.equal(await evaluate('scrollY'), pageY);
    assert.equal(await evaluate('document.querySelector(".ghwho-preview-body").textContent.includes("【备注末尾】")'), true);
    await evaluate('document.querySelector(".ghwho-preview-body").focus({ preventScroll: true })');
    await press('Home', 'Home', 36);
    await delay(200);
    assert.equal(await evaluate('document.querySelector(".ghwho-preview-body").scrollTop'), 0);
    await press('End', 'End', 35);
    await delay(200);
    assert.equal(await evaluate('document.querySelector(".ghwho-preview-body").scrollTop + document.querySelector(".ghwho-preview-body").clientHeight >= document.querySelector(".ghwho-preview-body").scrollHeight - 2'), true);
    assert.equal(await evaluate('scrollY'), pageY);
    const screenshot = await command('Page.captureScreenshot', { format: 'png' });
    await writeFile(join(ROOT, 'demo', 'preview-scroll.png'), Buffer.from(screenshot.data, 'base64'));
    await close();
    await command('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 2, y: 2 });
  });

  await check('纯文本插入和长 URL 自动换行', async () => {
    const note = '<img src=x onerror=alert(1)>\nhttps://example.com/' + 'a'.repeat(400);
    await sync({ lin: { note, updatedAt: Date.now() } });
    await hover(short);
    assert.equal(await evaluate('document.querySelector(".ghwho-preview-body").textContent'), note);
    assert.equal(await evaluate('document.querySelectorAll(".ghwho-preview-body img").length'), 0);
    assert.equal(await evaluate('document.querySelectorAll(".ghwho-preview-link").length'), 1);
    assert.equal(await evaluate('document.querySelector(".ghwho-preview-body").scrollWidth <= document.querySelector(".ghwho-preview-body").clientWidth + 1'), true);
    await close();
  });

  await check('网址识别保留原文、句末标点和配对括号，脚本文字不执行', async () => {
    const note = '<img src=x onerror=alert(1)>\n资料：https://example.com/a_(b)?q=1&x=2。\n(https://example.com/path), www.example.org/docs.\njavascript:alert(1) data:text/html,<svg onload=alert(1)>\nhttp://example.net/page';
    await sync({ lin: { note, updatedAt: Date.now() } });
    await hover(short);
    assert.equal(await evaluate('document.querySelector(".ghwho-preview-body").textContent'), note);
    assert.deepEqual(await evaluate('Array.from(document.querySelectorAll(".ghwho-preview-link"), a => a.href)'), ['https://example.com/a_(b)?q=1&x=2', 'https://example.com/path', 'https://www.example.org/docs', 'http://example.net/page']);
    assert.equal(await evaluate('Array.from(document.querySelectorAll(".ghwho-preview-link")).every(a => a.target === "_blank" && a.rel.includes("noopener") && a.rel.includes("noreferrer"))'), true);
    assert.equal(await evaluate('document.querySelectorAll(".ghwho-preview-body img, .ghwho-preview-body svg, .ghwho-preview-body script").length'), 0);
    await close();
  });

  await check('头像图标也能预览，GitHub 链接不触发预览', async () => {
    await evaluate(`(() => { const row = document.createElement('div'); row.id = 'avatar-fixture'; row.style.cssText = 'position:fixed;left:20px;top:80px'; row.innerHTML = '<a href="https://github.com/lin"><img class="avatar" alt="@lin" width="32" height="32"></a>'; document.body.append(row); })()`);
    await delay(160);
    assert.equal(await evaluate('document.querySelector("#avatar-fixture .ghwho-badge").dataset.ghwhoMode'), 'avatar');
    await hover('#avatar-fixture .ghwho-badge');
    assert.equal(await previewCount(), 1);
    await close();
    await hover('#featured-user');
    assert.equal(await previewCount(), 0);
    await evaluate('document.getElementById("avatar-fixture").remove()');
  });

  await check('右侧、底部、窄视口和缩放尺寸定位', async () => {
    await evaluate(`(() => { const row = document.createElement('div'); row.id = 'edge-fixture'; row.style.cssText = 'position:fixed;right:8px;bottom:8px'; row.innerHTML = '<a href="https://github.com/lin">lin</a>'; document.body.append(row); })()`);
    await delay(160);
    for (const [width, height, scale] of [[1280, 1040, 1], [320, 360, 1], [640, 480, 2]]) {
      await command('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: scale, mobile: false });
      await delay(40);
      await hover('#edge-fixture .ghwho-badge');
      withinViewport(await bounds());
      assert.equal(await evaluate('document.querySelector(".ghwho-preview").getBoundingClientRect().bottom < document.querySelector("#edge-fixture .ghwho-badge").getBoundingClientRect().top'), true);
      await close();
    }
    await command('Emulation.setDeviceMetricsOverride', { width: 1280, height: 1040, deviceScaleFactor: 1, mobile: false });
    await evaluate('document.getElementById("edge-fixture").remove()');
  });

  await check('页面和嵌套容器滚动关闭预览及待显示计时器', async () => {
    await hover(featured);
    await evaluate('window.dispatchEvent(new Event("scroll"))');
    assert.equal(await previewCount(), 0);
    await event(featured, 'mouseenter');
    await evaluate('document.querySelector(".demo-feed").dispatchEvent(new Event("scroll"))');
    await delay(390);
    assert.equal(await previewCount(), 0);
  });

  await check('节点移除和用户名重识别', async () => {
    await hover(featured);
    await evaluate('document.getElementById("featured-user").setAttribute("href", "https://github.com/lin")');
    await delay(160);
    assert.equal(await previewCount(), 0);
    assert.equal(await evaluate(`document.querySelector('${featured}').dataset.ghwhoFor`), 'lin');
    await event(featured, 'mouseenter');
    await evaluate(`document.querySelector('${featured}').remove()`);
    await delay(390);
    assert.equal(await previewCount(), 0);
    assert.ok(await evaluate(`!!document.querySelector('${featured}')`));
    await evaluate('document.getElementById("featured-user").setAttribute("href", "https://github.com/SXP-Simon")');
    await delay(160);
  });

  await check('用户名链接改为其他链接时不保留旧标签', async () => {
    await hover(featured);
    await evaluate('document.getElementById("featured-user").removeAttribute("data-hovercard-type"); document.getElementById("featured-user").href = "https://example.com/"');
    await delay(160);
    assert.equal(await previewCount(), 0);
    assert.equal(await evaluate(`!!document.querySelector('${featured}')`), false);
    await evaluate('document.getElementById("featured-user").setAttribute("data-hovercard-type", "user"); document.getElementById("featured-user").href = "https://github.com/SXP-Simon"');
    await delay(160);
  });

  await check('用户链接单独删除时，标签和预览一起移除', async () => {
    await evaluate(`(() => { const row = document.createElement('div'); row.id = 'remove-fixture'; row.style.cssText = 'position:fixed;left:20px;top:80px'; row.innerHTML = '<a href="https://github.com/lin">lin</a>'; document.body.append(row); })()`);
    await delay(160);
    await hover('#remove-fixture .ghwho-badge');
    assert.equal(await previewCount(), 1);
    await evaluate('document.querySelector("#remove-fixture a").remove()');
    await delay(160);
    assert.equal(await previewCount(), 0);
    assert.equal(await evaluate('document.querySelectorAll("#remove-fixture .ghwho-badge").length'), 0);
    await evaluate('document.getElementById("remove-fixture").remove()');
  });

  await check('个人主页文本更新后重新识别用户名', async () => {
    await sync({ lin: { note: '开源工具作者', updatedAt: Date.now() } });
    await hover('.ghwho-profile .ghwho-badge');
    await evaluate('document.querySelector(".p-nickname").firstChild.data = "sxp-simon"');
    await delay(160);
    assert.equal(await previewCount(), 0);
    assert.equal(await evaluate('document.querySelector(".ghwho-profile .ghwho-badge").dataset.ghwhoFor'), 'sxp-simon');
    await evaluate('document.querySelector(".p-nickname").textContent = "lin"');
    await delay(160);
    assert.equal(await evaluate('document.querySelector(".ghwho-profile .ghwho-badge").dataset.ghwhoFor'), 'lin');
  });

  await check('Turbo 导航、缓存清理和浏览器前进后退', async () => {
    for (const type of ['turbo:before-render', 'turbo:before-cache', 'popstate']) {
      await event(featured, 'mouseenter');
      await evaluate(`${type === 'popstate' ? 'window' : 'document'}.dispatchEvent(new Event(${JSON.stringify(type)}))`);
      await delay(390);
      assert.equal(await previewCount(), 0);
      await evaluate('document.dispatchEvent(new Event("turbo:load"))');
      await delay(160);
      assert.equal(await evaluate('document.querySelectorAll("#featured-user + .ghwho-badge").length'), 1);
    }
  });

  await check('连续切换只保留一个预览，无页面异常或外部请求', async () => {
    for (let i = 0; i < 20; i++) {
      await event(i % 2 ? short : featured, 'mouseenter');
      await event(i % 2 ? short : featured, 'mouseleave');
    }
    await delay(390);
    assert.equal(await previewCount(), 0);
    assert.deepEqual(errors, []);
    assert.deepEqual(requests.filter((url) => !url.startsWith(origin)), []);
  });

  await check('演示 HTML 可以直接从本地文件打开', async () => {
    await command('Page.navigate', { url: pathToFileURL(join(ROOT, 'demo', 'index.html')).href });
    for (let i = 0; i < 100 && !(await evaluate('!!document.querySelector(".ghwho-badge")')); i++) await delay(50);
    await hover(featured);
    assert.equal(await previewCount(), 1);
    assert.ok(await evaluate('document.querySelector(".ghwho-preview-body").textContent.includes("之前一起讨论")'));
    await evaluate(`document.querySelector('${featured}').click()`);
    assert.equal(await evaluate('document.querySelector(".ghwho-pop-user").dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }))'), false);
    await press('Escape', 'Escape', 27);
    assert.equal(await evaluate('location.protocol'), 'file:');
  });
  const externalRequests = requests.filter((url) => !url.startsWith(origin) && !url.startsWith(pathToFileURL(ROOT + sep).href));
  assert.deepEqual(errors, []);
  assert.deepEqual(externalRequests, []);
  const publicGitHub = [];
  if (process.argv.includes('--github')) {
    const sources = await Promise.all(['selectors.js', 'i18n.js', 'storage.js', 'content.js'].map((file) => readFile(join(ROOT, 'src', file), 'utf8')));
    const css = await readFile(join(ROOT, 'src', 'content.css'), 'utf8');
    await command('DOM.enable');
    await command('CSS.enable');
    for (const [url, profile] of [['https://github.com/torvalds', true], ['https://github.com/microsoft/vscode/issues/1', false]]) {
      console.log(`检查公开页面：${url}`);
      await command('Page.navigate', { url });
      for (let i = 0; i < 250; i++) {
        if (await evaluate('location.hostname === "github.com" && document.readyState === "complete"')) break;
        await delay(80);
      }
      assert.equal(await evaluate('location.hostname'), 'github.com');
      const { frameTree } = await command('Page.getFrameTree');
      const { executionContextId } = await command('Page.createIsolatedWorld', { frameId: frameTree.frame.id, worldName: 'ghwho-public-check' });
      const isolated = async (expression) => {
        const value = await command('Runtime.evaluate', { expression, contextId: executionContextId, awaitPromise: true, returnByValue: true });
        if (value.exceptionDetails) throw new Error(value.exceptionDetails.exception?.description ?? value.exceptionDetails.text);
        return value.result.value;
      };
      // 使用独立的示例存储；不读取或写入用户已有的扩展数据。
      await isolated(`(() => {
        const data = { __ghwho_settings: { lang: 'zh-CN' } };
        const listeners = new Set();
        globalThis.browser = {
          runtime: { id: 'ghwho-public-check' }, i18n: { getUILanguage: () => 'zh-CN' },
          storage: {
            sync: {
              get: async (keys) => keys === null ? structuredClone(data) : { [keys]: data[keys] },
              set: async (values) => {
                const changes = {};
                for (const [key, value] of Object.entries(values)) { changes[key] = { newValue: value }; data[key] = value; }
                for (const listener of listeners) listener(changes, 'sync');
              },
              remove: async (key) => { delete data[key]; for (const listener of listeners) listener({ [key]: {} }, 'sync'); },
            },
            onChanged: { addListener: (fn) => listeners.add(fn), removeListener: (fn) => listeners.delete(fn) },
          },
        };
      })()`);
      const { styleSheetId } = await command('CSS.createStyleSheet', { frameId: frameTree.frame.id });
      await command('CSS.setStyleSheetText', { styleSheetId, text: css });
      for (const source of sources) await isolated(source);
      for (let i = 0; i < 100 && !(await isolated('!!document.querySelector(".ghwho-badge")')); i++) await delay(50);
      const user = await isolated(`document.querySelector(${JSON.stringify(profile ? '.ghwho-profile .ghwho-badge' : '[data-ghwho-for="chrisdias"]')})?.dataset.ghwhoFor`);
      assert.ok(user, `GitHub 页面未找到标签：${await evaluate('document.title')}`);
      const note = '这是公开 GitHub 页面上的示例备注。\n鼠标可移入卡片停留阅读。\n项目链接：https://github.com/suolk/ghwho';
      await isolated(`browser.storage.sync.set(${JSON.stringify({ [user]: { note, updatedAt: Date.now() } })})`);
      const selector = profile ? '.ghwho-profile .ghwho-badge' : `[data-ghwho-for="${user}"]`;
      await isolated(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({ block: 'center' })`);
      await delay(150);
      await moveTo(selector);
      await delay(400);
      assert.equal(await previewCount(), 1);
      assert.equal(await evaluate('document.querySelector(".ghwho-preview-body").textContent'), note);
      await moveTo('.ghwho-preview-body');
      await delay(350);
      assert.equal(await previewCount(), 1);
      assert.equal(await evaluate('document.querySelector(".ghwho-preview-link").href'), 'https://github.com/suolk/ghwho');
      withinViewport(await bounds());
      const image = await command('Page.captureScreenshot', { format: 'png' });
      await writeFile(join(ROOT, 'demo', profile ? 'github-profile.png' : 'github-issue.png'), Buffer.from(image.data, 'base64'));
      await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
      assert.equal(await previewCount(), 0);
      assert.ok(await evaluate('!!document.querySelector(".ghwho-popover")'));
      await press('Escape', 'Escape', 27);
      publicGitHub.push({ url, user, preview: 'passed', hoverWithinCard: 'passed', noteLinks: 'passed', editor: 'passed' });
      console.log(`通过：公开 GitHub ${profile ? '个人主页' : 'Issue'} 标签、移入卡片、网址和编辑`);
    }
  }
  await writeFile(join(ROOT, 'demo', 'validation.json'), JSON.stringify({ browser: await command('Browser.getVersion'), checks: results, exceptions: 0, externalRequests, publicGitHub }, null, 2) + '\n');
  console.log(`${results.length} 项检查通过。截图与检查记录已写入 demo/。`);
} finally {
  socket?.close();
  if (browser?.pid && browser.exitCode === null) {
    try { execFileSync('taskkill', ['/PID', String(browser.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }); } catch { browser.kill(); }
  }
  await new Promise((done) => server.close(done));
  // 删除范围必须是本脚本在项目 dist 内创建的目录。
  if (!resolve(TEMP).startsWith(`${join(ROOT, 'dist')}${sep}.preview-check-`)) throw new Error('临时目录不在预期范围。');
  await rm(TEMP, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
}
