#!/usr/bin/env node
/** 临时：进项目 → 点「豆包后台」→ 截图（画布视图 + 后台视图）。 */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const OUT = path.resolve(ROOT, process.argv[2] || '.shotsBackend');
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
  { id: 'acc_1', name: '豆包01', type: 'doubao', status: '已登录', partition: 'persist:doubao1', addedAt: 1, groupId: null, autoStart: false, fpSalt: 0 },
  { id: 'acc_2', name: '豆包02', type: 'doubao', status: '已登录', partition: 'persist:doubao2', addedAt: 2, groupId: null, autoStart: false, fpSalt: 0 },
  { id: 'acc_3', name: 'lovart01', type: 'lovart', status: '已登录', partition: 'persist:lovart1', addedAt: 3, groupId: null, autoStart: false, fpSalt: 0 },
];
const projects = [{ id: 'p1', name: '未命名项目', updatedAt: Date.now(), data: { nodes: [], edges: [], library: [{ id: 'lib_1', favorite: false, name: '大图', dataUrl: IMG, w: 200, h: 200 }], snap: true, videoShares: [] } }];

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
    localStorage.setItem('doubao-projects', JSON.stringify(p.projects));
    localStorage.setItem('doubao-accounts', JSON.stringify(p.accounts));
    localStorage.setItem('doubao-account-groups', JSON.stringify([]));
  }, { projects, accounts });
  await page.goto(url, { waitUntil: 'load', timeout: 30000 });
  await page.waitForTimeout(900);
  await page.getByRole('button', { name: /未命名项目/ }).first().click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(OUT, '01-canvas.png') });
  console.log('shot: 01-canvas');

  const btn = page.getByRole('button', { name: /豆包后台/ }).first();
  console.log('豆包后台 button count =', await btn.count());
  await btn.click();
  await page.waitForTimeout(1600);
  await page.screenshot({ path: path.join(OUT, '02-backend.png') });
  console.log('shot: 02-backend');

  // 后台视图里的按钮逐个点一遍（点完截图）
  const names = [/刷新/, /浏览器打开/, /无水印/, /返回画布/, /收起|展开/];
  for (let i = 0; i < names.length; i += 1) {
    const b = page.getByRole('button', { name: names[i] }).first();
    if (!(await b.count())) { console.log('MISS:', names[i]); continue; }
    await b.click().catch((e) => console.log('FAIL:', names[i], e.message.split('\n')[0]));
    await page.waitForTimeout(900);
    await page.screenshot({ path: path.join(OUT, `03-backend-${i}.png`) });
    console.log('shot: 03-backend-' + i);
    // 返回画布的按钮点了就退出视图，后面跳过
    if (String(names[i]).includes('返回')) break;
  }
  await page.screenshot({ path: path.join(OUT, '04-end.png') });
  console.log('errors:', errs.length ? [...new Set(errs)].join('\n') : '(none)');
  await browser.close();
  server.close();
})().catch((e) => { console.error(e); process.exit(2); });
