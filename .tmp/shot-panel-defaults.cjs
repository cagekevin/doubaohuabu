#!/usr/bin/env node
/** 临时：建空节点 → 开生成面板，核面板各项是否显示「默认值」（比例 4:3 / 时长 5s / 模型 Mini）。 */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const OUT = path.resolve(ROOT, process.argv[2] || '.shotsDef');
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

  const pane = await page.locator('.react-flow__pane').boundingBox();
  const cx = pane.x + pane.width / 2;
  const cy = pane.y + pane.height / 2;

  const dump = async (tag) => {
    const info = await page.evaluate(() => {
      const out = {};
      const sel = [...document.querySelectorAll('select')];
      out.selects = sel.map((s) => ({ title: s.title, value: s.value, options: [...s.options].map((o) => o.value) }));
      const t = document.querySelector('[class*="panelHeadMid"], [class*="meta"]');
      out.meta = t ? t.textContent : '';
      return out;
    });
    console.log(tag, JSON.stringify(info, null, 1));
  };

  for (const [name, y] of [['文生视频', 0], ['文生图', 0]]) {
    await page.mouse.click(cx, cy, { button: 'right' });
    await page.waitForTimeout(600);
    const b = page.getByRole('button', { name: new RegExp(`^${name}$`) }).first();
    if (!(await b.count())) { console.log('MISS', name); continue; }
    await b.click();
    await page.waitForTimeout(900);
    // 点卡片打开生成面板
    const card = page.locator(`.react-flow__node-${name === '文生图' ? 'imggen' : 'genvideo'}`).first();
    await card.click({ position: { x: 40, y: 40 } });
    await page.waitForTimeout(1200);
    await dump(name);
    await page.screenshot({ path: path.join(OUT, `${name}.png`) });
    // 换下一种类型：重载页面回到干净状态（面板会挡住节点，不能原地再点）
    await page.reload({ waitUntil: 'load' });
    await page.waitForTimeout(900);
    await page.getByRole('button', { name: /未命名项目/ }).first().click();
    await page.waitForTimeout(1400);
  }
  console.log('errors:', errs.length ? [...new Set(errs)].slice(0, 5).join('\n') : '(none)');
  await browser.close();
  server.close();
})().catch((e) => { console.error(e); process.exit(2); });
