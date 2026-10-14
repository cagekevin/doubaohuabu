#!/usr/bin/env node
/**
 * 删除链路运行时验证 —— 对应 `docs/过程.md` §2 的 ★ 缺口「删除节点链路断」
 *
 * 覆盖什么（这三条**只有端到端能验**，UI 层按原则 7 不写单测）：
 *   ① 删除生效（节点数减少）
 *   ② ★ **不留悬空边** —— 原实现 `onNodesChange` 只 `setGraph(nodes, edges)`，
 *      边数组**原样传回** ⇒ 指向已删节点的边**留着**（悬空）
 *   ③ ★ **删除可撤销** —— 原实现不 `commit` 快照 ⇒ Ctrl+Z 撤不回来
 *
 * 怎么做：造「2 个 text 节点 + 1 条边」的工程 → 注入 localStorage → 启动 → 进工程
 *   → 选中一个节点 → 按 `Backspace`（xyflow 默认 `deleteKeyCode`）→ 断言边一起消失
 *   → 按 `Ctrl+Z` → 断言节点与边都回来
 *
 * 用法：node scripts/verify-del.cjs
 * ⚠️ 依赖 `dist/`（先 `npx vite build`）与 playwright（`PW_PATH` 可覆盖默认路径）
 */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const { launchBrowser } = require('./_pw.cjs');

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

/** 两个 text 节点 + 一条边：删掉其中一个 ⇒ 那条边**必须**一起消失 */
const NODES = [
  {
    id: 'n-a',
    type: 'text',
    position: { x: 120, y: 120 },
    data: {
      text: 'A',
      aspectRatio: '16:9',
      duration: 7,
      linkOrder: [],
      referenceOrder: [],
      materialIds: [],
      styleIds: [],
    },
  },
  {
    id: 'n-b',
    type: 'text',
    position: { x: 520, y: 120 },
    data: {
      text: 'B',
      aspectRatio: '16:9',
      duration: 7,
      linkOrder: [],
      referenceOrder: [],
      materialIds: [],
      styleIds: [],
    },
  },
];

const EDGES = [
  {
    id: 'e-1',
    source: 'n-a',
    target: 'n-b',
    type: 'interactive',
    style: { stroke: 'var(--color-edge)', strokeWidth: 2 },
  },
];

const project = [
  {
    id: 'p_del_1',
    name: '删除链路校验工程',
    updatedAt: Date.now(),
    data: { nodes: NODES, edges: EDGES, library: [], snap: true, videoShares: [] },
  },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  if (!fs.existsSync(DIST)) {
    console.error('❌ 未找到 dist/，请先 npx vite build');
    process.exit(1);
  }

  await new Promise((r) => server.listen(0, r));
  const url = `http://127.0.0.1:${server.address().port}/index.html`;
  console.log('serving:', url);

  const browser = await launchBrowser();
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });

  await page.addInitScript((p) => {
    localStorage.setItem('doubao-projects', JSON.stringify(p));
  }, project);

  const events = [];
  page.on('console', (m) => {
    if (m.type() === 'error') events.push(['console.error', m.text()]);
  });
  page.on('pageerror', (e) => events.push(['pageerror', e.message + '\n' + (e.stack || '')]));

  await page.goto(url, { waitUntil: 'load', timeout: 30000 });
  await sleep(900);

  const clicked = await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('删除链路校验工程'),
    );
    btn?.click();
    return !!btn;
  });
  await sleep(1600);

  const domCount = () =>
    page.evaluate(() => ({
      nodes: document.querySelectorAll('.react-flow__node').length,
      edges: document.querySelectorAll('.react-flow__edge').length,
    }));

  /**
   * ★ **真 oracle 是「落盘数据」，不是 DOM**
   *
   * 踩过的坑：ReactFlow **不渲染**指向已删节点的边 ⇒ 光数 `.react-flow__edge`，
   * 「store 里那条悬空边还在」这个**真 bug 会被漏掉**（实测：修复前的构建上 ④ 也「通过」了）。
   * 落盘走 600ms 防抖 ⇒ 每次断言前要多等一会儿。
   */
  const persisted = () =>
    page.evaluate(() => {
      const raw = localStorage.getItem('doubao-projects');
      if (!raw) return { nodes: -1, edges: -1 };
      const arr = JSON.parse(raw);
      const p = arr.find((x) => x.id === 'p_del_1') ?? arr[0];
      return { nodes: p?.data?.nodes?.length ?? -1, edges: p?.data?.edges?.length ?? -1 };
    });

  const before = await domCount();
  const beforeP = await persisted();

  /**
   * 选中 n-a —— ★ **必须用真实鼠标**，不能用 `dispatchEvent(new MouseEvent(...))`
   *
   * 踩过的坑①：合成 DOM 事件**绕过 React 的合成事件系统与 ReactFlow 的指针处理**
   * ⇒ 实测触发应用异常 `Cannot read properties of null (reading 'document')`
   *   （堆栈落在探针的 `evaluate` 里），并让后续断言不可信。
   *
   * 踩过的坑②：**必须点「节点头部」，不能点节点中心** —— 文本节点的正文是
   * `contentEditable`，点中心会把焦点交给编辑器 ⇒ `Backspace` 变成**删字符**，
   * ReactFlow 的 `deleteKeyCode` 收不到键（实测：`selected=1` 但
   * `activeElement.isContentEditable=true`）。这与源版一致（正文可编辑）；
   * 真实用户用键盘删节点时点的也是头部/框体，不是正在编辑的正文。
   */
  const nA = await page.locator('.react-flow__node[data-id="n-a"]').boundingBox();
  await page.mouse.click(nA.x + nA.width / 2, nA.y + 10);
  await sleep(400);

  /**
   * 诊断自检（**不改断言**，只让失败自己说话）：删除不生效时，先分清是
   *   ① 点选没生效（`selected` = 0）② 焦点被编辑器吃掉（`active` = contentEditable）
   *   还是 ③ 应用侧 `remove` 没处理。
   */
  const selInfo = await page.evaluate(() => ({
    selected: document.querySelectorAll('.react-flow__node.selected').length,
    active:
      (document.activeElement &&
        (document.activeElement.className || document.activeElement.tagName)) ||
      '(none)',
    editable: !!(document.activeElement && document.activeElement.isContentEditable),
  }));
  console.log('选中态自检：', JSON.stringify(selInfo));

  await page.keyboard.press('Backspace');
  await sleep(1200); // 落盘防抖 600ms + 余量
  const afterDelete = await domCount();
  const afterDeleteP = await persisted();

  await page.keyboard.press('Control+z');
  await sleep(1200);
  const afterUndo = await domCount();
  const afterUndoP = await persisted();

  const isNoise = (t) =>
    /Failed to load resource|net::ERR|ERR_CONNECTION|favicon|status of 4\d\d|React DevTools|ResizeObserver/i.test(
      String(t).split('\n')[0],
    );
  const appErrors = events.filter((e) => !isNoise(e[1]));

  console.log('\n════════ 删除链路判据 ════════');
  const checks = [
    ['① 进入工程', clicked, clicked ? '已点击' : '未找到按钮'],
    ['② 应用级错误 = 0', appErrors.length === 0, `实际 ${appErrors.length}`],
    [
      '③ 删除生效（DOM 节点数 -1）',
      afterDelete.nodes === before.nodes - 1,
      `${before.nodes} → ${afterDelete.nodes}`,
    ],
    [
      '④ ★ 不留悬空边（**落盘数据**里边一起删）',
      afterDeleteP.edges === 0,
      `落盘 边 ${beforeP.edges} → ${afterDeleteP.edges}`,
    ],
    [
      '⑤ ★ 删除可撤销（Ctrl+Z 复原）',
      afterUndoP.nodes === beforeP.nodes && afterUndoP.edges === beforeP.edges,
      `落盘 节点 ${afterUndoP.nodes}/边 ${afterUndoP.edges} ｜ DOM 节点 ${afterUndo.nodes}/边 ${afterUndo.edges}`,
    ],
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
  console.log(`\n${pass ? '✅ 删除链路通过' : '❌ 删除链路未通过'}`);
  process.exit(pass ? 0 : 1);
})();
