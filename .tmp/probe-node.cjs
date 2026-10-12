#!/usr/bin/env node
/** 临时：打印 imggen / genvideo 节点的 DOM 文本与关键元素矩形。 */
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
const IMG = 'data:image/svg+xml;base64,' + Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="680" height="1776"><rect width="680" height="1776" fill="#c9c2b8"/></svg>`).toString('base64');
const nodes = [
  { id: 'ig_1', type: 'imggen', position: { x: 100, y: 100 }, width: 380, height: 300, data: { label: '文生图', text: '', aspectRatio: '1:1', channel: 'doubao', sendAccount: 'auto', imageCount: 1, igResolution: '2K', styleIds: [], linkOrder: [], results: [] } },
  { id: 'gv_1', type: 'genvideo', position: { x: 600, y: 100 }, width: 380, height: 240, data: { label: '文生视频', text: '', aspectRatio: '16:9', duration: 5, sendAccount: 'auto', styleIds: [], linkOrder: [] } },
];
const projects = [{ id: 'p1', name: '未命名项目', updatedAt: Date.now(), data: { nodes, edges: [], library: [{ id: 'lib_1', favorite: false, name: '大图', dataUrl: IMG, w: 200, h: 200 }], snap: true, videoShares: [] } }];
(async () => {
  await new Promise((r) => server.listen(0, r));
  const url = `http://127.0.0.1:${server.address().port}/index.html`;
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1400, height: 860 } });
  page.on('dialog', (d) => void d.accept(''));
  await page.addInitScript((p) => {
    localStorage.setItem('doubao-projects', JSON.stringify(p));
    localStorage.setItem('doubao-accounts', JSON.stringify([]));
  }, projects);
  await page.goto(url, { waitUntil: 'load', timeout: 30000 });
  await page.waitForTimeout(800);
  await page.getByRole('button', { name: /未命名项目/ }).first().click();
  await page.waitForTimeout(1500);
  const info = await page.evaluate(() => {
    const out = {};
    for (const t of ['imggen', 'genvideo']) {
      const el = document.querySelector(`.react-flow__node-${t}`);
      if (!el) { out[t] = null; continue; }
      const r = el.getBoundingClientRect();
      const inner = el.querySelector('[data-testid]') ?? el.firstElementChild;
      const ir = inner?.getBoundingClientRect();
      const rows = [...el.querySelectorAll('*')]
        .filter((n) => n.children.length === 0 && (n.textContent || '').trim())
        .map((n) => {
          const rr = n.getBoundingClientRect();
          return `${(n.textContent || '').trim().slice(0, 30)} @ ${Math.round(rr.top - r.top)}..${Math.round(rr.bottom - r.top)}`;
        });
      out[t] = { node: [Math.round(r.width), Math.round(r.height)], inner: ir ? [Math.round(ir.width), Math.round(ir.height)] : null, rows };
    }
    return out;
  });
  console.log(JSON.stringify(info, null, 2));
  await browser.close();
  server.close();
})().catch((e) => { console.error(e); process.exit(2); });
