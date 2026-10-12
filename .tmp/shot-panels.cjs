#!/usr/bin/env node
/** 临时：验证收口后的浮层——图片编辑器（遮脸/裁剪）+ 分析提示词浮层。 */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const OUT = path.resolve(ROOT, process.argv[2] || '.shotsPanels');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.map': 'application/json', '.png': 'image/png', '.wasm': 'application/wasm' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const fp = path.join(DIST, p);
  if (!fp.startsWith(DIST) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) { res.writeHead(404); res.end('404'); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(fp)] || 'application/octet-stream' });
  fs.createReadStream(fp).pipe(res);
});

const IMG = 'data:image/svg+xml;base64,' + Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="680" height="900"><rect width="680" height="900" fill="#c9c2b8"/><circle cx="340" cy="300" r="150" fill="#8d8377"/><rect x="120" y="520" width="440" height="300" rx="30" fill="#6f665c"/></svg>`
).toString('base64');

const nodes = [
  { id: 'm_1', type: 'material', position: { x: 80, y: 80 }, width: 220, height: 380, data: { label: '大图', name: '大图', dataUrl: IMG, natW: 680, natH: 900, w: 220, h: 380 } },
];
const projects = [{ id: 'p1', name: '未命名项目', updatedAt: Date.now(), data: { nodes, edges: [], library: [{ id: 'lib_1', favorite: false, name: '大图', dataUrl: IMG, w: 220, h: 220 }], snap: true, videoShares: [] } }];

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  await new Promise((r) => server.listen(0, r));
  const url = `http://127.0.0.1:${server.address().port}/index.html`;
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1400, height: 860 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/XNNPACK|TensorFlow/.test(m.text())) errs.push('console: ' + m.text()); });
  page.on('dialog', (d) => void d.accept(''));
  await page.addInitScript((p) => {
    localStorage.setItem('doubao-projects', JSON.stringify(p));
    localStorage.setItem('doubao-accounts', JSON.stringify([]));
    localStorage.setItem('doubao-account-groups', JSON.stringify([]));
  }, projects);
  await page.goto(url, { waitUntil: 'load', timeout: 30000 });
  await page.waitForTimeout(900);
  await page.getByRole('button', { name: /未命名项目/ }).first().click();
  await page.waitForTimeout(1500);

  const shot = async (n) => { await page.screenshot({ path: path.join(OUT, n + '.png') }); console.log('shot:', n); };

  await page.locator('.react-flow__node-material').first().click({ position: { x: 110, y: 30 } });
  await page.waitForTimeout(400);
  const edit = page.getByRole('button', { name: /^编辑图片$/ }).first();
  console.log('编辑图片 count =', await edit.count());
  await edit.click();
  await page.waitForTimeout(1500);
  await shot('01-image-editor-mask');
  console.log('overlay count =', await page.locator('[class*="overlay"]').count());
  console.log('panelClose count =', await page.locator('[class*="panelClose"]').count());

  const cropTab = page.getByRole('button', { name: /^裁剪$/ }).first();
  if (await cropTab.count()) { await cropTab.click(); await page.waitForTimeout(500); await shot('02-image-editor-crop'); }

  await page.keyboard.press('Escape');
  await page.waitForTimeout(600);
  await shot('03-after-esc');
  console.log('Esc 后 overlay count =', await page.locator('[class*="overlay"]').count());

  // 分析提示词浮层
  await page.locator('.react-flow__node-material').first().click({ position: { x: 110, y: 30 } });
  await page.waitForTimeout(400);
  const an = page.getByRole('button', { name: /分析提示词/ }).first();
  console.log('分析提示词 count =', await an.count());
  if (await an.count()) { await an.click(); await page.waitForTimeout(2500); await shot('04-analyze-pop'); }

  console.log('errors:', errs.length ? [...new Set(errs)].slice(0, 6).join('\n') : '(none)');
  await browser.close();
  server.close();
})().catch((e) => { console.error(e); process.exit(2); });
