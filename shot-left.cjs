#!/usr/bin/env node
/** 临时：只截左栏（画布视图 vs 豆包后台视图），看它在两种状态下的差异。 */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const OUT = path.join(ROOT, '.left');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.map': 'application/json', '.png': 'image/png', '.wasm': 'application/wasm' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const fp = path.join(DIST, p);
  if (!fp.startsWith(DIST) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) { res.writeHead(404); res.end('404'); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(fp)] || 'application/octet-stream' });
  fs.createReadStream(fp).pipe(res);
});

const IMG = 'data:image/svg+xml;base64,' + Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="200" height="200" fill="#c9c2b8"/></svg>`).toString('base64');
const accounts = [
  { id: 'acc_1', name: '豆包01', type: 'doubao', status: '已登录', partition: 'persist:doubao', addedAt: 1, groupId: null, autoStart: false, fpSalt: 0 },
  { id: 'acc_2', name: 'lovart01', type: 'lovart', status: '已登录', partition: 'persist:lovart', addedAt: 2, groupId: null, autoStart: false, fpSalt: 0 },
];
const projects = [{ id: 'p1', name: '未命名项目', updatedAt: Date.now(), data: { nodes: [], edges: [], library: [{ id: 'lib_1', favorite: false, name: '大图', dataUrl: IMG, w: 200, h: 200 }], snap: true, videoShares: [] } }];

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  await new Promise((r) => server.listen(0, r));
  const url = `http://127.0.0.1:${server.address().port}/index.html`;
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1360, height: 800 } });
  page.on('dialog', (d) => void d.accept(''));
  await page.addInitScript((p) => {
    localStorage.setItem('doubao-projects', JSON.stringify(p.projects));
    localStorage.setItem('doubao-accounts', JSON.stringify(p.accounts));
    localStorage.setItem('doubao-account-groups', JSON.stringify([]));
  }, { projects, accounts });
  await page.goto(url, { waitUntil: 'load', timeout: 30000 });
  await page.waitForTimeout(900);
  await page.getByRole('button', { name: /未命名项目/ }).first().click();
  await page.waitForTimeout(1500);

  const box = async () => page.locator('aside').first().boundingBox();
  console.log('left aside rect (canvas view):', await box());
  await page.locator('aside').first().screenshot({ path: path.join(OUT, '01-left-canvas.png') });

  // 豆包后台
  await page.getByRole('button', { name: /豆包后台/ }).first().click();
  await page.waitForTimeout(1200);
  console.log('left aside rect (backend view):', await box());
  await page.locator('aside').first().screenshot({ path: path.join(OUT, '02-left-backend.png') });

  // 折叠 / 展开左栏
  const toggle = page.getByRole('button', { name: /收起账号栏|展开账号栏/ }).first();
  console.log('toggle count:', await toggle.count());
  await toggle.click();
  await page.waitForTimeout(400);
  console.log('after collapse:', await box());
  await page.screenshot({ path: path.join(OUT, '03-left-collapsed.png') });
  await toggle.click();
  await page.waitForTimeout(400);
  console.log('after expand:', await box());

  // 折叠 / 展开右栏
  const rtoggle = page.getByRole('button', { name: /收起资源栏|展开资源栏/ }).first();
  console.log('right toggle count:', await rtoggle.count());
  await rtoggle.click();
  await page.waitForTimeout(400);
  console.log('right after collapse:', await page.locator('aside').last().boundingBox());
  await page.screenshot({ path: path.join(OUT, '04-right-collapsed.png') });

  await browser.close();
  server.close();
})().catch((e) => { console.error(e); process.exit(2); });
