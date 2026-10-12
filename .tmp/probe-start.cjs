#!/usr/bin/env node
/** 临时：只看启动页有没有渲染出来 + 页面错误。 */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
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
  await new Promise((r) => server.listen(0, r));
  const url = `http://127.0.0.1:${server.address().port}/index.html`;
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1400, height: 860 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  await page.addInitScript((p) => {
    localStorage.setItem('doubao-projects', JSON.stringify(p));
    localStorage.setItem('doubao-accounts', JSON.stringify([]));
  }, projects);
  await page.goto(url, { waitUntil: 'load', timeout: 30000 });
  await page.waitForTimeout(2000);
  const info = await page.evaluate(() => ({
    text: (document.body.innerText || '').slice(0, 400),
    buttons: [...document.querySelectorAll('button')].slice(0, 25).map((b) => (b.innerText || '').trim().slice(0, 24)),
  }));
  console.log(JSON.stringify(info, null, 1));
  console.log('errors:', errs.length ? [...new Set(errs)].slice(0, 8).join('\n') : '(none)');
  await page.screenshot({ path: path.join(ROOT, '.shotsDef', 'probe.png') });
  await browser.close();
  server.close();
})().catch((e) => { console.error(e); process.exit(2); });
