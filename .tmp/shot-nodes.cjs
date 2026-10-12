#!/usr/bin/env node
/** 临时：截「节点区」特写，对着参考图逐块比。用法：node .tmp/shot-nodes.cjs [outDir] */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const OUT = path.resolve(ROOT, process.argv[2] || '.shotsN');
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
  `<svg xmlns="http://www.w3.org/2000/svg" width="680" height="1776"><rect width="680" height="1776" fill="#c9c2b8"/><circle cx="340" cy="380" r="170" fill="#8d8377"/><rect x="140" y="700" width="400" height="520" rx="40" fill="#6f665c"/></svg>`
).toString('base64');

const nodes = [
  { id: 'm_1', type: 'material', position: { x: 40, y: 40 }, width: 180, height: 400, data: { label: '大图', name: '大图', dataUrl: IMG, natW: 680, natH: 1776, w: 180, h: 400 } },
  { id: 't_1', type: 'text', position: { x: 280, y: 40 }, width: 420, height: 300, data: { text: '逆光3S精华胶囊产品主图', aspectRatio: '16:9', duration: 7, linkOrder: [], referenceOrder: [], materialIds: [], styleIds: [] } },
  { id: 'gv_1', type: 'genvideo', position: { x: 40, y: 480 }, width: 380, height: 260, data: { label: '文生视频', text: '', aspectRatio: '16:9', duration: 5, sendAccount: 'auto', styleIds: [], linkOrder: [] } },
  { id: 'ig_1', type: 'imggen', position: { x: 480, y: 480 }, width: 380, height: 300, data: { label: '文生图', text: '', aspectRatio: '1:1', channel: 'doubao', sendAccount: 'auto', imageCount: 1, igResolution: '2K', styleIds: [], linkOrder: [], results: [] } },
  { id: 'a_1', type: 'account', position: { x: 900, y: 40 }, width: 420, height: 220, data: { accountId: '' } },
  { id: 'v_1', type: 'video', position: { x: 900, y: 300 }, width: 320, height: 240, data: { label: '视频', url: '' } },
  { id: 'd_1', type: 'download', position: { x: 900, y: 580 }, width: 280, height: 200, data: { folder: '' } },
  { id: 'grp_1', type: 'group', position: { x: 1240, y: 40 }, width: 240, height: 200, zIndex: -1001, data: { label: '组' } },
];
const edges = [
  { id: 'e_1', source: 'm_1', target: 't_1', type: 'interactive', style: { stroke: 'var(--color-edge)', strokeWidth: 2 } },
];
const library = [
  { id: 'lib_1', favorite: true, name: '逆光3S精华胶囊产品主图', dataUrl: IMG, w: 180, h: 180 },
  { id: 'lib_2', favorite: false, name: '大图', dataUrl: IMG, w: 180, h: 180 },
];
const projects = [{ id: 'p1', name: '未命名项目', updatedAt: Date.now(), data: { nodes, edges, library, snap: true, videoShares: [] } }];

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
  await page.waitForTimeout(1600);
  await page.locator('.react-flow__viewport').screenshot({ path: path.join(OUT, '01-nodes.png') });
  console.log('shot: 01-nodes');
  await page.locator('.react-flow__node-text').first().screenshot({ path: path.join(OUT, '02-text.png') });
  console.log('shot: 02-text');
  await page.locator('.react-flow__node-genvideo').first().screenshot({ path: path.join(OUT, '03-genvideo.png') });
  console.log('shot: 03-genvideo');
  await page.locator('.react-flow__node-imggen').first().screenshot({ path: path.join(OUT, '04-imggen.png') });
  console.log('shot: 04-imggen');
  await page.locator('.react-flow__node-material').first().screenshot({ path: path.join(OUT, '05-material.png') });
  console.log('shot: 05-material');
  for (const [name, sel] of [['06-account', 'account'], ['07-video', 'video'], ['08-download', 'download'], ['09-group', 'group']]) {
    const loc = page.locator(`.react-flow__node-${sel}`).first();
    if (!(await loc.count())) { console.log('MISS:', name); continue; }
    await loc.screenshot({ path: path.join(OUT, `${name}.png`), timeout: 5000 }).then(
      () => console.log('shot:', name),
      (e) => console.log('FAIL:', name, e.message.split('\n')[0]),
    );
  }
  await page.screenshot({ path: path.join(OUT, '10-all.png') });
  console.log('shot: 10-all');
  // 放大，便于看清节点细节
  for (let i = 0; i < 3; i += 1) {
    await page.getByRole('button', { name: 'Zoom In' }).first().click().catch(() => {});
    await page.waitForTimeout(300);
  }
  await page.screenshot({ path: path.join(OUT, '11-zoom.png') });
  console.log('shot: 11-zoom');
  console.log('errors:', errs.length ? [...new Set(errs)].join('\n') : '(none)');
  await browser.close();
  server.close();
})().catch((e) => { console.error(e); process.exit(2); });
