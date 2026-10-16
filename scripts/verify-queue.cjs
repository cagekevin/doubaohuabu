#!/usr/bin/env node
/**
 * 发送队列**任务卡**运行时验证 —— 对应设计稿 `index.html:461-517`（`C41` 那一格）
 *
 * 做什么：造一个工程（2 个可入队节点 + 1 个不可入队节点）→ 进项目 → **Shift 多选** →
 *   点「加入队列」→ 打开左抽屉 → 量任务卡的计算样式 + 截图（`.shots/queue-card.png`）。
 *
 * 为什么必须有它：任务卡这一屏此前**只能靠人眼看代码**（`scripts/verify-*.cjs` 里没有一条覆盖它），
 *   而设计层的四条重设计理由（卡片化 / 状态点在左槽 / 主次分层 / 图标钮靠右）全在**计算样式**上，
 *   是"读了代码也说不准"的那一类 ⇒ 用量出来的值判，截图留给人工比对。
 * ⚠️ 它还守着一条**行为判据**（`C42`）：左抽屉是**外壳元素**，**队列为空时把手也要在**
 *   —— 这里在入队**之前**先量一次（空队列态），别把这条挪到入队之后。
 *
 * 用法：`npx vite build && node scripts/verify-queue.cjs`
 *   ⚠️ 吃 `dist/`，改了 `src/` **必须先 build**。
 */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const { launchBrowser } = require('./_pw.cjs');

const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const SHOTS = path.join(ROOT, '.shots');

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

/** ★ 入队只收 `text` / `genvideo`（`BATCH_SENDABLE_TYPES`）—— 第三个节点是用来验"不该进的没进" */
const NODES = [
  {
    id: 'n-text',
    type: 'text',
    position: { x: 60, y: 60 },
    data: { label: '提示词卡', text: '生成一段', aspectRatio: '16:9', duration: 7, linkOrder: [], referenceOrder: [], materialIds: [], styleIds: [] },
  },
  {
    id: 'n-genvideo',
    type: 'genvideo',
    position: { x: 420, y: 60 },
    data: { label: '文生视频', text: '生成一段', aspectRatio: '16:9', duration: 5, sendAccount: 'auto', styleIds: [], linkOrder: [] },
  },
  {
    id: 'n-imggen',
    type: 'imggen',
    position: { x: 780, y: 60 },
    data: { label: '文生图', text: '画一只猫', aspectRatio: '1:1', channel: 'doubao', sendAccount: 'auto', imageCount: 1, igResolution: '2K', styleIds: [], linkOrder: [], results: [] },
  },
];

const project = [
  {
    id: 'p_verify_queue',
    name: '队列校验工程',
    updatedAt: Date.now(),
    data: { nodes: NODES, edges: [], library: [], snap: true, videoShares: [] },
  },
];

/** 面板里按**类名局部名**取（CSS Modules 的哈希形如 `_item_<hash>_<line>` ⇒ 局部名稳定可查） */
const METRICS = `(() => {
  const panel = document.querySelector('[data-testid="send-queue-panel"]');
  if (!panel) return { panel: false };
  const pick = (el) => {
    if (!el) return null;
    const cs = getComputedStyle(el);
    return {
      cls: [...el.classList],
      width: cs.width,
      height: cs.height,
      background: cs.backgroundColor,
      color: cs.color,
      fontSize: cs.fontSize,
      borderRadius: cs.borderRadius,
      borderBottomWidth: cs.borderBottomWidth,
      padding: cs.padding,
      animationName: cs.animationName,
      animationDuration: cs.animationDuration,
      overflow: cs.overflow,
      textOverflow: cs.textOverflow,
      whiteSpace: cs.whiteSpace,
      text: (el.textContent || '').trim().slice(0, 24),
    };
  };
  const q = (s) => panel.querySelector(s);
  /* 从 :root 与探针元素上取**真值**（不把 token 的数值抄进断言 —— 抄了就会随 token 漂） */
  const rootCs = getComputedStyle(document.documentElement);
  const probeVal = (prop, css) => {
    const s = document.createElement('span');
    s.style[prop] = css;
    panel.appendChild(s);
    const v = getComputedStyle(s)[prop];
    s.remove();
    return v;
  };
  const tokens = {
    size2xs: rootCs.getPropertyValue('--font-size-2xs').trim(),
    muted: probeVal('color', 'var(--color-text-muted)'),
    borderStrong: probeVal('backgroundColor', 'var(--color-border-strong)'),
    cardBg: probeVal('backgroundColor', 'var(--color-surface-sunken)'),
  };
  const items = panel.querySelectorAll('[class*="_item_"]');
  const first = items[0] || null;
  const svg = first ? first.querySelector('[class*="_iconBtn_"] svg') : null;
  const stylesheet = [...document.styleSheets]
    .flatMap((s) => { try { return [...s.cssRules]; } catch { return []; } })
    .map((r) => r.cssText).join('\\n');
  const runningCls = (stylesheet.match(/\\.(_st_running_[A-Za-z0-9_-]+)/) || [])[1] || null;
  let probe = null;
  if (runningCls) {
    const span = document.createElement('span');
    span.className = runningCls;
    panel.appendChild(span);
    probe = pick(span);
    span.remove();
  }
  return {
    panel: true,
    itemCount: items.length,
    item: pick(first),
    name: pick(first && first.querySelector('[class*="_name_"]')),
    dot: pick(q('[class*="_stateDot_"]')),
    meta: pick(q('[class*="_meta_"]')),
    group: pick(q('[class*="_group_"]')),
    iconBtn: pick(q('[class*="_iconBtn_"]')),
    icon: svg ? pick(svg) : null,
    note: pick(q('[class*="_note_"]')),
    runningProbe: probe,
    footBtn: pick(q('[class*="_foot_"] [class*="_btn_"]')),
    tokens,
    badge: (document.querySelector('[data-testid="send-queue-drawer"] [class*="_drawerBadge_"]') || {}).textContent || null,
  };
})()`;

(async () => {
  if (!fs.existsSync(DIST)) {
    console.error('❌ 未找到 dist/，请先 npx vite build');
    process.exit(1);
  }

  await new Promise((r) => server.listen(0, r));
  // ⚠️ 必须带 `?devMock=1`（mock 宿主的授权门控），否则停在激活屏进不了工程
  const url = `http://127.0.0.1:${server.address().port}/index.html?devMock=1`;
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
  page.on('pageerror', (e) => events.push(['pageerror', e.message]));

  await page.goto(url, { waitUntil: 'load', timeout: 30000 });
  await new Promise((r) => setTimeout(r, 800));

  const clicked = await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((b) => b.textContent?.includes('队列校验工程'));
    btn?.click();
    return !!btn;
  });
  await new Promise((r) => setTimeout(r, 1500));

  // ── ① 多选（`multiSelectionKeyCode={['Shift','Meta']}`）——
  //    点**节点头部**（文本节点正文是 contentEditable，点中心会把焦点交给编辑器 ⇒ 选不中）
  const selectedIds = () =>
    page.evaluate(() =>
      [...document.querySelectorAll('.react-flow__node.selected')].map((el) => el.getAttribute('data-id')),
    );

  /**
   * ★ **入队之前**（队列还是空的）：左抽屉必须**已经在了** ——
   *   设计层把 `.mk-drawer-handle` 当**外壳元素**（`mockup.css:91` 的壳元素组）＋
   *   「默认收成一条竖钮（贴画布左缘），点开即本面板」⇒ 它不随队列有无出现/消失。
   *   ⚠️ 与源 `z3.jsx:186-187`（`if (!m.length) return null`）的**有意偏离**（用户裁定）。
   */
  const preQueue = await page.evaluate(() => {
    const d = document.querySelector('[data-testid="send-queue-drawer"]');
    return {
      drawer: !!d,
      handle: !!(d && d.querySelector('button')),
      badge: !!(d && d.querySelector('[class*="_drawerBadge_"]')),
    };
  });
  // 空队列态**也留一张图**（用户看到的就是这一屏：左侧那条竖钮在不在）
  fs.mkdirSync(SHOTS, { recursive: true });
  const handleShot = path.join(SHOTS, 'queue-handle-empty.png');
  await page.screenshot({ path: handleShot, clip: { x: 0, y: 0, width: 220, height: 900 } });
  /**
   * ★ **Shift + 框选**（不是逐点 Shift+click）：
   *   `selectionOnDrag={false}` + `selectionKeyCode` 默认 `Shift` ⇒ 按住 Shift 在**空白处**拖出选择框，
   *   `selectionMode=Partial` ⇒ 部分相交即选中。
   * ⚠️ 逐点 Shift+click 在本机**不累加**（实测：点第一个文本节点连"选中"都没发生 —— 它的头部
   *    被拖拽逻辑吃掉），故改用框选。
   */
  {
    const boxes = [];
    for (const id of ['n-text', 'n-genvideo', 'n-imggen']) {
      const b = await page.locator(`.react-flow__node[data-id="${id}"]`).boundingBox();
      if (b) boxes.push(b);
    }
    const x1 = Math.min(...boxes.map((b) => b.x)) - 30;
    const y1 = Math.min(...boxes.map((b) => b.y)) - 30;
    const x2 = Math.max(...boxes.map((b) => b.x + b.width)) + 30;
    const y2 = Math.max(...boxes.map((b) => b.y + b.height)) + 30;
    await page.keyboard.down('Shift');
    await page.mouse.move(x1, y1);
    await page.mouse.down();
    await page.mouse.move(x2, y2, { steps: 12 });
    await page.mouse.up();
    await page.keyboard.up('Shift');
    await new Promise((r) => setTimeout(r, 400));
    console.log(`调试：框选 (${x1},${y1}) → (${x2},${y2}) 后选中 = ${JSON.stringify(await selectedIds())}`);
  }

  /**
   * ★ **选择工具条**（它只在 `nonGroupCount >= 2` 时渲染，见 `SelectionToolbar.tsx:52`）——
   *   这里顺手验它，是因为 `useOutsideClose` 收口时动过本组件（把它的"点外关闭"换成共享 hook）。
   *   ⚠️ 不能用 `verify-canvas.cjs` 那套 **Shift+逐点加选**：本机实测**不累加**（只选到最后一个），
   *   于是工具条**永远不出现**、那条判据恒红（既有的脚本手法问题，与本改动无关）⇒ 用框选。
   */
  const preToolbar = await page.evaluate(() => {
    const el = document.querySelector('[data-testid="selection-toolbar"]');
    return el ? { left: el.style.left, top: el.style.top, transform: el.style.transform } : null;
  });

  // ── ② 触发条 → 「加入队列」
  const trigger = await page.evaluate(() => {
    const el = document.querySelector('[data-testid="batch-send-panel"]');
    if (!el) return null;
    return [...el.querySelectorAll('button')].map((b) => (b.textContent || '').trim());
  });
  const enqueued = await page.evaluate(() => {
    const el = document.querySelector('[data-testid="batch-send-panel"]');
    const btn = el && [...el.querySelectorAll('button')].find((b) => b.textContent?.includes('加入队列'));
    btn?.click();
    return !!btn;
  });
  await new Promise((r) => setTimeout(r, 600));

  // ── ③ 打开抽屉（默认**收起**：设计稿原话「默认收成一条竖钮」）
  const handle = await page.evaluate(() => {
    const el = document.querySelector('[data-testid="send-queue-drawer"] button');
    el?.click();
    return !!el;
  });
  await new Promise((r) => setTimeout(r, 700));

  const m = await page.evaluate(METRICS);

  // ── ④ 「减少动态效果」下同一个类名的动画必须停
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await new Promise((r) => setTimeout(r, 150));
  const reduced = await page.evaluate((runningCls) => {
    if (!runningCls) return null;
    const panel = document.querySelector('[data-testid="send-queue-panel"]');
    const span = document.createElement('span');
    span.className = runningCls;
    panel.appendChild(span);
    const cs = getComputedStyle(span);
    const out = { animationName: cs.animationName, animationDuration: cs.animationDuration };
    span.remove();
    return out;
  }, m.runningProbe ? m.runningProbe.cls.find((c) => c.startsWith('_st_running_')) : null);
  await page.emulateMedia({ reducedMotion: null });

  // ── ⑤ 截图（面板区域），留给人工比对设计稿
  fs.mkdirSync(SHOTS, { recursive: true });
  const shotPath = path.join(SHOTS, 'queue-card.png');
  const panelLoc = page.locator('[data-testid="send-queue-panel"]');
  const box = (await panelLoc.count()) ? await panelLoc.boundingBox() : null;
  if (box) {
    await page.screenshot({ path: shotPath, clip: box });
  } else {
    // 面板没出现也留一张全屏图：驱动路径断了时，图比日志好定位
    await page.screenshot({ path: shotPath });
  }
  console.log('调试：触发条按钮 =', JSON.stringify(trigger));
  console.log('调试：入队按钮点了 =', enqueued, '｜抽屉把手点了 =', handle, '｜面板存在 =', m.panel);

  const appErrors = events.filter((e) => !isNoise(e[1]));
  const px = (v) => (v ? Number.parseFloat(v) : NaN);

  console.log('\n════════ C41 任务卡判据 ════════');
  const checks = [
    ['① 应用级错误 = 0', appErrors.length === 0, `实际 ${appErrors.length}`],
    ['② 进入工程', clicked, clicked ? '已点击' : '未找到按钮'],
    ['③ 触发条出现（≥2 个可发送节点被选中）', !!trigger, JSON.stringify(trigger)],
    ['④ 点「加入队列」入队', enqueued, enqueued ? '已点击' : '未找到按钮'],
    ['⑤ 抽屉把手可开', handle, handle ? '已点击' : '未找到把手'],
    ['⑥ 任务卡数 = 2（`imggen` 不入队）', m.itemCount === 2, `实际 ${m.itemCount}`],
    ['⑦ ★ 卡片化：`surface-sunken` 底 + 圆角 8 + **无分隔下边框**', !!m.item && m.item.background === m.tokens.cardBg && px(m.item.borderRadius) === 8 && px(m.item.borderBottomWidth) === 0, JSON.stringify(m.item && { bg: m.item.background, radius: m.item.borderRadius, borderBottom: m.item.borderBottomWidth, padding: m.item.padding })],
    ['⑧ ★ 状态点：8×8 圆点（`waiting` ⇒ `border-strong` 灰）', !!m.dot && px(m.dot.width) === 8 && px(m.dot.height) === 8 && px(m.dot.borderRadius) >= 4 && m.dot.background === m.tokens.borderStrong, JSON.stringify(m.dot && { size: `${m.dot.width}×${m.dot.height}`, radius: m.dot.borderRadius, bg: m.dot.background, want: m.tokens.borderStrong, cls: m.dot.cls })],
    ['⑨ ★ 主次分层：次行 = 真源 `2xs` 档 + `muted` 色', !!m.meta && m.meta.fontSize === m.tokens.size2xs && m.meta.color === m.tokens.muted, JSON.stringify({ got: m.meta && `${m.meta.fontSize} / ${m.meta.color}`, token: `${m.tokens.size2xs} / ${m.tokens.muted}` })],
    ['⑩ ★ 分组标题 = 「进行中」', !!m.group && m.group.text === '进行中', JSON.stringify(m.group && { text: m.group.text, size: m.group.fontSize })],
    ['⑪ ★ 图标钮 22×22 + 图标 14（真源两档，无第三档）', !!m.iconBtn && px(m.iconBtn.width) === 22 && !!m.icon && px(m.icon.width) === 14, JSON.stringify({ btn: m.iconBtn && `${m.iconBtn.width}×${m.iconBtn.height}`, icon: m.icon && `${m.icon.width}×${m.icon.height}` })],
    ['⑫ ★ 状态点呼吸：`st_running` 有动画（1000ms）', !!m.runningProbe && m.runningProbe.animationName !== 'none' && px(m.runningProbe.animationDuration) === 1, JSON.stringify(m.runningProbe && { name: m.runningProbe.animationName, dur: m.runningProbe.animationDuration })],
    ['⑬ ★ `prefers-reduced-motion` 下动画停', !!reduced && reduced.animationName === 'none', JSON.stringify(reduced)],
    ['⑭ ★ 底栏按钮再矮一档（24 高 · `2xs` 字）', !!m.footBtn && px(m.footBtn.height) === 24 && m.footBtn.fontSize === m.tokens.size2xs, JSON.stringify(m.footBtn && { h: m.footBtn.height, size: m.footBtn.fontSize, want: m.tokens.size2xs, text: m.footBtn.text })],
    ['⑮ ★ **空队列时**左抽屉把手常驻（角标此时不显示）', preQueue.drawer && preQueue.handle && !preQueue.badge, JSON.stringify(preQueue)],
    ['⑯ ★ 任务卡的名字真被**单行截断**（本地那三条声明生效）', !!m.name && m.name.textOverflow === 'ellipsis' && m.name.overflow === 'hidden' && m.name.whiteSpace === 'nowrap', JSON.stringify(m.name && { overflow: m.name.overflow, textOverflow: m.name.textOverflow, whiteSpace: m.name.whiteSpace })],
    ['⑰ ★ 框选 3 个后**选择工具条**出现（`useOutsideClose` 收口未伤它）', !!preToolbar && /px$/.test(preToolbar.left) && /px$/.test(preToolbar.top), JSON.stringify(preToolbar)],
  ];
  let pass = true;
  for (const [name, ok, detail] of checks) {
    if (!ok) pass = false;
    console.log(`  ${ok ? '✅' : '❌'} ${name}  (${detail})`);
  }
  console.log(`\n  抽屉角标：${m.badge} ｜ 说明行：${m.note ? m.note.text || '(空)' : '(无)'}`);
  console.log(`  截图：${path.relative(ROOT, shotPath)}（人工比对设计稿 index.html:461-517）`);

  if (appErrors.length) {
    console.log('\n════════ 应用级错误 ════════');
    console.log(appErrors.slice(0, 8).map((e) => '❌ ' + e[0] + ': ' + e[1]).join('\n'));
  }

  await browser.close();
  server.close();
  console.log(`\n${pass ? '✅ 队列任务卡通过' : '❌ 队列任务卡未通过'}`);
  process.exit(pass ? 0 : 1);
})().catch((e) => {
  console.error('harness crash:', e);
  process.exit(2);
});
