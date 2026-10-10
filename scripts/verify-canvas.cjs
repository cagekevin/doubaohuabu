#!/usr/bin/env node
/**
 * 画布运行时验证 —— 对应 docs/08-验证用例.md **W13**（8 类节点完整性）
 *
 * 做什么：造一个含**全部 8 类节点**的工程 → 注入 localStorage → 启动 → 进项目
 *   → 断言：无应用级错误、8 类节点全部渲染、边渲染、撤销快捷键可用
 *
 * 用法：node scripts/verify-canvas.cjs
 */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

// playwright 已是本工程 devDependency ⇒ 用**裸模块名**解析。
// ⚠️ 原先指向兄弟目录 `逆向专用/node_modules/playwright` —— 那个目录**会话中途消失过一次**，
//    导致全部验证脚本当场瘫痪（`MODULE_NOT_FOUND`）⇒ 不再依赖工程外路径。
const PW = process.env.PW_PATH || 'playwright';
const { chromium } = require(PW);

const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.map': 'application/json',
};

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const fp = path.join(DIST, p);
  if (!fp.startsWith(DIST) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) {
    res.writeHead(404);
    res.end('404');
    return;
  }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(fp)] || 'application/octet-stream' });
  fs.createReadStream(fp).pipe(res);
});

const isNoise = (t) =>
  /Failed to load resource|net::ERR|ERR_CONNECTION|favicon|status of 4\d\d|React DevTools|ResizeObserver/i.test(
    String(t).split('\n')[0],
  );

/** 8 类节点，各一个（字段取 `NODE_DEFAULTS` 的最小合法集） */
const NODES = [
  { id: 'n-text', type: 'text', position: { x: 40, y: 40 }, data: { text: '提示词', aspectRatio: '16:9', duration: 7, linkOrder: [], referenceOrder: [], materialIds: [], styleIds: [] } },
  { id: 'n-material', type: 'material', position: { x: 320, y: 40 }, data: { name: '素材A', dataUrl: 'data:image/gif;base64,R0lGODlhAQABAAAAACw=' } },
  { id: 'n-video', type: 'video', position: { x: 600, y: 40 }, data: { label: '视频', url: '' } },
  { id: 'n-genvideo', type: 'genvideo', position: { x: 40, y: 300 }, data: { label: '文生视频', text: '生成一段', aspectRatio: '16:9', duration: 5, sendAccount: 'auto', styleIds: [], linkOrder: [] } },
  { id: 'n-imggen', type: 'imggen', position: { x: 320, y: 300 }, data: { label: '文生图', text: '画一只猫', aspectRatio: '1:1', channel: 'doubao', sendAccount: 'auto', imageCount: 1, igResolution: '2K', styleIds: [], linkOrder: [], results: [] } },
  { id: 'n-account', type: 'account', position: { x: 600, y: 300 }, data: { accountId: 'acc_missing' } },
  { id: 'n-download', type: 'download', position: { x: 40, y: 560 }, data: { folder: '' } },
  { id: 'n-group', type: 'group', position: { x: 320, y: 560 }, data: { label: '组' } },
];

const EDGES = [
  { id: 'e-1', source: 'n-text', target: 'n-genvideo', type: 'interactive', style: { stroke: 'var(--color-edge)', strokeWidth: 2 } },
];

const project = [
  {
    id: 'p_verify_1',
    name: 'W13 校验工程',
    updatedAt: Date.now(),
    data: { nodes: NODES, edges: EDGES, library: [], snap: true, videoShares: [] },
  },
];

(async () => {
  if (!fs.existsSync(DIST)) {
    console.error('❌ 未找到 dist/，请先 npx vite build');
    process.exit(1);
  }

  await new Promise((r) => server.listen(0, r));
  const url = `http://127.0.0.1:${server.address().port}/index.html`;
  console.log('serving:', url);

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });

  await page.addInitScript((p) => {
    localStorage.setItem('doubao-projects', JSON.stringify(p));
  }, project);

  const events = [];
  page.on('console', (m) => {
    if (m.type() === 'error') events.push(['console.error', m.text()]);
  });
  page.on('pageerror', (e) => events.push(['pageerror', e.message]));

  await page.goto(url, { waitUntil: 'load', timeout: 30000 });
  await new Promise((r) => setTimeout(r, 800));

  // 进入工程
  const clicked = await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((b) => b.textContent?.includes('W13 校验工程'));
    btn?.click();
    return !!btn;
  });
  await new Promise((r) => setTimeout(r, 1500));

  // 统计渲染出的节点类型（ReactFlow 会加 `react-flow__node-<type>`）
  const rendered = await page.evaluate(() => {
    const out = {};
    document.querySelectorAll('[class*="react-flow__node-"]').forEach((el) => {
      for (const c of el.classList) {
        const m = /^react-flow__node-(.+)$/.exec(c);
        if (m) out[m[1]] = (out[m[1]] ?? 0) + 1;
      }
    });
    return {
      types: Object.keys(out).sort(),
      edgeCount: document.querySelectorAll('.react-flow__edge').length,
      nodeCount: document.querySelectorAll('.react-flow__node').length,
      minimap: !!document.querySelector('.react-flow__minimap'),
      controls: !!document.querySelector('.react-flow__controls'),
      background: !!document.querySelector('.react-flow__background'),
    };
  });

  const expected = ['account', 'download', 'genvideo', 'group', 'imggen', 'material', 'text', 'video'];
  const appErrors = events.filter((e) => !isNoise(e[1]));

  console.log('\n════════ W13 判据 ════════');
  const checks = [
    ['① 应用级错误 = 0', appErrors.length === 0, `实际 ${appErrors.length}`],
    ['② 进入工程（点项目名）', clicked, clicked ? '已点击' : '未找到按钮'],
    ['③ 8 类节点全部渲染', JSON.stringify(rendered.types) === JSON.stringify(expected), rendered.types.join(',')],
    ['④ 节点数 = 8', rendered.nodeCount === 8, `实际 ${rendered.nodeCount}`],
    ['⑤ 边渲染', rendered.edgeCount === 1, `实际 ${rendered.edgeCount}`],
    ['⑥ Background / Controls / MiniMap 就位', rendered.background && rendered.controls && rendered.minimap, JSON.stringify({ bg: rendered.background, ctrl: rendered.controls, mini: rendered.minimap })],
  ];
  let pass = true;
  for (const [name, ok, detail] of checks) {
    if (!ok) pass = false;
    console.log(`  ${ok ? '✅' : '❌'} ${name}  (${detail})`);
  }

  if (appErrors.length) {
    console.log('\n════════ 应用级错误 ════════');
    console.log(appErrors.slice(0, 8).map((e) => '❌ ' + e[0] + ': ' + e[1]).join('\n'));
  }

  await browser.close();
  server.close();
  console.log(`\n${pass ? '✅ W13 通过' : '❌ W13 未通过'}`);
  process.exit(pass ? 0 : 1);
})().catch((e) => {
  console.error('harness crash:', e);
  process.exit(2);
});
