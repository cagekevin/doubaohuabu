#!/usr/bin/env node
/**
 * 临时：把界面按「参考图」的各个状态截出来，供人工比对。
 * 用法：node scripts/shot.cjs [输出目录]
 * ⚠️ 用完即删。
 */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const OUT = path.resolve(ROOT, process.argv[2] || '.shots');

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
  { id: 'm_1', type: 'material', position: { x: 60, y: 60 }, width: 180, height: 420, data: { label: '大图', name: '大图', dataUrl: IMG, natW: 680, natH: 1776, w: 180, h: 420 } },
  { id: 't_1', type: 'text', position: { x: 340, y: 60 }, width: 420, height: 300, data: { text: '', aspectRatio: '16:9', duration: 7, linkOrder: [], referenceOrder: [], materialIds: [], styleIds: [] } },
  { id: 'gv_1', type: 'genvideo', position: { x: 140, y: 480 }, width: 380, height: 240, data: { label: '文生视频', text: '', aspectRatio: '16:9', duration: 5, sendAccount: 'auto', styleIds: [], linkOrder: [] } },
];

const edges = [
  { id: 'e_1', source: 'm_1', target: 't_1', type: 'interactive', style: { stroke: 'var(--color-edge)', strokeWidth: 2 } },
  { id: 'e_2', source: 't_1', target: 'gv_1', type: 'interactive', style: { stroke: 'var(--color-edge)', strokeWidth: 2 } },
];

const library = [
  { id: 'lib_1', favorite: true, name: '逆光3S精华胶囊产品主图', dataUrl: IMG, w: 180, h: 180 },
  { id: 'lib_2', favorite: false, name: '大图', dataUrl: IMG, w: 180, h: 180 },
];

const accounts = [
  { id: 'acc_1', name: '豆包01', type: 'doubao', status: '已登录', partition: 'persist:doubao', addedAt: 1, groupId: null, autoStart: false, fpSalt: 0 },
  { id: 'acc_2', name: 'lovart01', type: 'lovart', status: '已登录', partition: 'persist:lovart', addedAt: 2, groupId: null, autoStart: false, fpSalt: 0 },
];

const projects = [{
  id: 'p_shot_1', name: '未命名项目', updatedAt: Date.now(),
  data: { nodes, edges, library, snap: true, videoShares: [] },
}];

(async () => {
  if (!fs.existsSync(DIST)) { console.error('no dist'); process.exit(1); }
  fs.mkdirSync(OUT, { recursive: true });
  await new Promise((r) => server.listen(0, r));
  const url = `http://127.0.0.1:${server.address().port}/index.html`;
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1360, height: 800 } });
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

  const shot = async (name) => {
    await page.screenshot({ path: path.join(OUT, name + '.png') });
    console.log('shot:', name);
  };
  const esc = async () => { await page.keyboard.press('Escape').catch(() => {}); await page.waitForTimeout(350); };
  const clickText = async (re, opts = {}) => {
    const b = page.getByRole('button', { name: re }).first();
    if (!(await b.count())) { console.log('MISS:', re); return false; }
    await b.click(opts).catch((e) => console.log('FAIL:', re, e.message.split('\n')[0]));
    return true;
  };

  // ① 文生视频选中 → 生成面板
  await page.locator('.react-flow__node-genvideo').first().click({ position: { x: 190, y: 40 } });
  await page.waitForTimeout(800);
  await shot('02-gen-panel');
  await esc();

  // ② 素材节点「编辑图片」→ 图片编辑器
  await page.locator('.react-flow__node-material').first().click({ position: { x: 90, y: 30 } });
  await page.waitForTimeout(400);
  if (await clickText(/^编辑图片$/)) {
    await page.waitForTimeout(1400);
    await shot('03-image-editor-facemask');
    // 切「裁剪」页签
    await clickText(/^裁剪$/);
    await page.waitForTimeout(500);
    await shot('04-image-editor-crop');
    await esc();
  }

  // ③ 资源库「＋ 添加」之外：右键菜单
  await page.locator('[class*="LibraryPanel-module"] , aside').first().click({ button: 'right' }).catch(() => {});
  await page.waitForTimeout(300);

  // ④ 左栏工具 → 导出账号
  if (await clickText(/^导出$/)) { await page.waitForTimeout(700); await shot('05-export-accounts'); await esc(); }
  // ⑤ 出口代理池
  if (await clickText(/出口代理/)) { await page.waitForTimeout(700); await shot('06-proxy-pool'); await esc(); }
  // ⑥ 指纹体检
  if (await clickText(/指纹体检/)) { await page.waitForTimeout(700); await shot('07-fingerprint'); await esc(); }
  // ⑦ 分组
  if (await clickText(/^分组$/)) { await page.waitForTimeout(700); await shot('08-groups'); await esc(); }
  // ⑧ 添加账号 → 选择平台
  if (await clickText(/添加账号/)) { await page.waitForTimeout(600); await shot('09-pick-type'); await esc(); }
  // ⑨ 豆包后台
  if (await clickText(/豆包后台/)) { await page.waitForTimeout(1200); await shot('10-backend'); }

  console.log('\nerrors:', errs.length ? [...new Set(errs)].slice(0, 8).join('\n') : '(none)');
  console.log('out ->', OUT);
  await browser.close();
  server.close();
})().catch((e) => { console.error(e); process.exit(2); });
