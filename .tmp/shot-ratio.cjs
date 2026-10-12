#!/usr/bin/env node
/** 临时：走「空白右键 → 建节点」这条渠道，逐个类型量出节点框的宽高比。 */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const OUT = path.resolve(ROOT, process.argv[2] || '.shotsRatio');
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

  const canvas = page.locator('.react-flow__pane');
  const box = await canvas.boundingBox();
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;

  // 右键空白 → 创建面板
  await page.mouse.click(cx, cy, { button: 'right' });
  await page.waitForTimeout(600);
  const panelBtns = page.locator('[class*="createPanel"] button, [class*="panel"] button');
  const labels = await panelBtns.allInnerTexts().catch(() => []);
  console.log('创建面板按钮:', JSON.stringify(labels));
  await page.screenshot({ path: path.join(OUT, '00-create-panel.png') });

  const wanted = ['文字', '文生图', '文生视频'];
  for (let i = 0; i < wanted.length; i += 1) {
    const w = wanted[i];
    // 三次右键各离 420px（节点宽 380 ⇒ 互不重叠，右键仍落在空白上）
    await page.mouse.click(cx - 420 + i * 420, cy, { button: 'right' });
    await page.waitForTimeout(600);
    const btn = page.getByRole('button', { name: new RegExp(`^${w}$`) }).first();
    if (!(await btn.count())) { console.log('MISS:', w); continue; }
    await btn.click();
    await page.waitForTimeout(600);
    const info = await page.evaluate(() => {
      const els = [...document.querySelectorAll('.react-flow__node')];
      const last = els[els.length - 1];
      if (!last) return null;
      const r = last.getBoundingClientRect();
      const vp = document.querySelector('.react-flow__viewport');
      const t = vp ? getComputedStyle(vp).transform : '';
      const m = /matrix\(([^)]+)\)/.exec(t);
      const zoom = m ? Number(m[1].split(',')[0]) : 1;
      return { cls: last.className.replace('react-flow__node ', '').split(' ')[0], w: Math.round(r.width / zoom), h: Math.round(r.height / zoom) };
    });
    console.log(w, '=>', JSON.stringify(info), 'ratio =', info ? (info.w / info.h).toFixed(3) : '-');
  }
  await page.screenshot({ path: path.join(OUT, '01-created.png') });
  console.log('errors:', errs.length ? [...new Set(errs)].slice(0, 5).join('\n') : '(none)');
  await browser.close();
  server.close();
})().catch((e) => { console.error(e); process.exit(2); });
