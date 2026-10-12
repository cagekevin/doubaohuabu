#!/usr/bin/env node
/** 临时：走一遍「＋ 添加账号 → 选平台 → 登录弹窗 → 完成登录」，逐步截图。 */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const OUT = path.resolve(ROOT, process.argv[2] || '.shotsLogin');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.map': 'application/json', '.png': 'image/png', '.wasm': 'application/wasm' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const fp = path.join(DIST, p);
  if (!fp.startsWith(DIST) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) { res.writeHead(404); res.end('404'); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(fp)] || 'application/octet-stream' });
  fs.createReadStream(fp).pipe(res);
});

const projects = [{ id: 'p1', name: '未命名项目', updatedAt: Date.now(), data: { nodes: [], edges: [], library: [], snap: true, videoShares: [] } }];

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  await new Promise((r) => server.listen(0, r));
  const url = `http://127.0.0.1:${server.address().port}/index.html`;
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1400, height: 860 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/XNNPACK|TensorFlow|webview|Unknown/.test(m.text())) errs.push('console: ' + m.text()); });
  page.on('dialog', (d) => void d.accept(''));
  await page.addInitScript((p) => {
    localStorage.setItem('doubao-projects', JSON.stringify(p));
    localStorage.setItem('doubao-accounts', JSON.stringify([]));
    localStorage.setItem('doubao-account-groups', JSON.stringify([]));
  }, projects);
  await page.goto(url, { waitUntil: 'load', timeout: 30000 });
  await page.waitForTimeout(900);
  await page.getByRole('button', { name: /未命名项目/ }).first().click();
  await page.waitForTimeout(1400);

  const shot = async (n) => { await page.screenshot({ path: path.join(OUT, n + '.png') }); console.log('shot:', n); };
  await shot('01-before');

  const add = page.getByRole('button', { name: /添加账号/ }).first();
  console.log('添加账号 count =', await add.count());
  await add.click();
  await page.waitForTimeout(700);
  await shot('02-pick-type');

  // 选「豆包」那张卡
  const card = page.getByRole('button', { name: /豆包/ }).first();
  console.log('platform card count =', await card.count());
  await card.click();
  await page.waitForTimeout(1500);
  await shot('03-login-modal');

  // 左栏此刻**不应**出现任何账号行
  const rows = page.locator('aside li');
  console.log('左栏账号行数（登录前）=', await rows.count());

  const done = page.getByRole('button', { name: /完成登录/ }).first();
  console.log('完成登录 count =', await done.count());
  await done.click();
  await page.waitForTimeout(700);
  await shot('04-after-login');
  await page.waitForTimeout(1400);
  await shot('05-after-close');
  console.log('左栏账号行数（登录后）=', await rows.count());

  // 再走两遍：tapnow（有验证链接行、**没有**「在浏览器打开」）与 其他（网址行）
  for (const [name, cardRe] of [['tapnow', /Tapnow/], ['other', /其他/]]) {
    await page.getByRole('button', { name: /添加账号/ }).first().click();
    await page.waitForTimeout(500);
    const c = page.getByRole('button', { name: cardRe }).first();
    if (!(await c.count())) { console.log('MISS card:', name); continue; }
    await c.click();
    await page.waitForTimeout(1200);
    await page.screenshot({ path: path.join(OUT, `06-${name}.png`) });
    console.log('shot: 06-' + name, 'openExternal btn =', await page.getByRole('button', { name: /在浏览器打开/ }).count());
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
  }

  console.log('errors:', errs.length ? [...new Set(errs)].slice(0, 6).join('\n') : '(none)');
  await browser.close();
  server.close();
})().catch((e) => { console.error(e); process.exit(2); });
