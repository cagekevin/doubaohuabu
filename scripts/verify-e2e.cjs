#!/usr/bin/env node
/**
 * W15 端到端冒烟（真实用户路径）
 *
 * 判据（docs/08-验证用例.md W15）：
 *   新建项目 → 拖入 1 张图片 → 建文本节点 → 连线 → 触发文生图（mock 通道）→ 导出
 *   ① 全流程无 `ReferenceError`/`TypeError`
 *   ② 产物落盘
 *   ③ 刷新后状态还原
 *
 * 用法：node scripts/verify-e2e.cjs
 */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const PW = process.env.PW_PATH || 'G:/01画布项目/豆包画布/逆向专用/node_modules/playwright';
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

/** 噪声过滤：外部资源失败不算重写缺陷（W15 容忍度） */
const isNoise = (t) =>
  /Failed to load resource|net::ERR|ERR_CONNECTION|favicon|status of 4\d\d|React DevTools|ResizeObserver/i.test(
    String(t).split('\n')[0],
  );

/** 注入一个「已有 1 张素材 + 1 个文生图节点」的工程（模拟"用过一段时间"的状态） */
const SEED = [
  {
    id: 'p_e2e_1',
    name: 'E2E 冒烟工程',
    updatedAt: Date.now(),
    data: {
      nodes: [
        {
          id: 'ig_seed_1',
          type: 'imggen',
          position: { x: 120, y: 120 },
          data: {
            label: '文生图',
            text: '一只猫',
            aspectRatio: '1:1',
            channel: 'api',
            sendAccount: 'auto',
            imageCount: 1,
            igResolution: '2K',
            styleIds: [],
            linkOrder: [],
            results: [],
          },
        },
      ],
      edges: [],
      library: [
        {
          id: 'lib_seed_1',
          favorite: false,
          name: '种子素材.png',
          // 1×1 透明 PNG（内容固定 ⇒ 精确哈希固定）
          dataUrl:
            'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
        },
      ],
      snap: true,
      videoShares: [],
    },
  },
];

(async () => {
  if (!fs.existsSync(DIST)) {
    console.error('❌ 未找到 dist/，请先 npx vite build');
    process.exit(1);
  }

  await new Promise((r) => server.listen(0, r));
  const url = `http://127.0.0.1:${server.address().port}/index.html`;

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 }, acceptDownloads: true });
  const page = await ctx.newPage();

  // ⚠️ 只种一次：`addInitScript` 在**每次导航**都会跑（含 reload），
  //    无条件写会把刷新后的数据重置回种子 ⇒ 假失败（实测踩过）
  await page.addInitScript((seed) => {
    if (!localStorage.getItem('doubao-projects')) {
      localStorage.setItem('doubao-projects', JSON.stringify(seed));
    }
  }, SEED);

  /** ★ 只收集 ReferenceError / TypeError（W15 的硬判据） */
  const crashes = [];
  const otherErrors = [];
  page.on('pageerror', (e) => {
    const msg = `${e.name}: ${e.message}`;
    // 噪声（外部资源失败等）不算重写缺陷 —— W15 的容忍度
    if (isNoise(msg)) return;
    if (/ReferenceError|TypeError/.test(msg)) crashes.push(msg);
    else otherErrors.push(msg);
  });

  await page.goto(url, { waitUntil: 'load', timeout: 30000 });
  await new Promise((r) => setTimeout(r, 800));

  const steps = [];
  const step = (name, ok, detail) => steps.push({ name, ok, detail });

  // ── ① 进入工程 ──
  const entered = await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((x) => x.textContent?.includes('E2E 冒烟工程'));
    b?.click();
    return !!b;
  });
  await page.waitForTimeout(1200);
  step('① 进入工程', entered);

  const countNodes = () => page.evaluate(() => document.querySelectorAll('.react-flow__node').length);

  const n0 = await countNodes();
  step('② 种子工程渲染（1 个 imggen 节点）', n0 === 1, `实际 ${n0}`);

  // ── ③ 拖入素材 → 建素材节点 ──
  const dropped = await page.evaluate(() => {
    const pane = document.querySelector('.react-flow__pane');
    if (!pane) return false;
    const dt = new DataTransfer();
    dt.setData('application/x-doubao-mat', 'lib_seed_1');
    const r = pane.getBoundingClientRect();
    const opt = { bubbles: true, cancelable: true, clientX: r.left + 400, clientY: r.top + 300, dataTransfer: dt };
    pane.dispatchEvent(new DragEvent('dragover', opt));
    pane.dispatchEvent(new DragEvent('drop', opt));
    return true;
  });
  await page.waitForTimeout(500);
  const n1 = await countNodes();
  step('③ 拖入素材 → 素材节点 +1', dropped && n1 === n0 + 1, `${n0} → ${n1}`);

  // ── ④ 双击空白 → 建文本节点（用**真实鼠标事件**，比合成事件更接近用户）──
  const paneBox = await page.evaluate(() => {
    const r = document.querySelector('.react-flow__pane')?.getBoundingClientRect();
    return r ? { x: r.left, y: r.top, w: r.width, h: r.height } : null;
  });
  let dbl = false;
  let dblAt = '';
  if (paneBox) {
    // ⚠️ 必须避开：① 已有节点 ② **浮层**（MiniMap / Controls / 生成面板）
    //    —— 实测踩过：双击落在 MiniMap 上，节点不会创建（假失败）
    const boxes = await page.evaluate(() => {
      const sel = '.react-flow__node, .react-flow__minimap, .react-flow__controls, [data-testid="gen-panel"]';
      return [...document.querySelectorAll(sel)].map((el) => {
        const r = el.getBoundingClientRect();
        return { x: r.left, y: r.top, w: r.width, h: r.height };
      });
    });
    const hits = (c) => boxes.some((o) => c.x >= o.x - 24 && c.x <= o.x + o.w + 24 && c.y >= o.y - 24 && c.y <= o.y + o.h + 24);

    // 在画布区域**网格扫描**找一个真正空白的点
    let free = null;
    for (let gy = 0.2; gy <= 0.8 && !free; gy += 0.15) {
      for (let gx = 0.15; gx <= 0.85 && !free; gx += 0.15) {
        const c = { x: paneBox.x + paneBox.w * gx, y: paneBox.y + paneBox.h * gy };
        if (!hits(c)) free = c;
      }
    }
    if (free) {
      await page.mouse.dblclick(free.x, free.y);
      dbl = true;
      dblAt = `${Math.round(free.x)},${Math.round(free.y)}`;
    }
  }
  await page.waitForTimeout(500);
  const n2 = await countNodes();
  step('④ 双击空白 → 文本节点 +1', dbl && n2 === n1 + 1, `${n1} → ${n2}${dblAt ? ` @${dblAt}` : '（未找到空白点）'}`);

  // ── ⑤ 选中 imggen 节点 → 生成面板出现 ──
  await page.evaluate(() => {
    const el = document.querySelector('.react-flow__node-imggen');
    const r = el?.getBoundingClientRect();
    if (r) {
      el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, clientX: r.left + 5, clientY: r.top + 5 }));
    }
  });
  await page.waitForTimeout(400);
  const panelShown = await page.evaluate(() => !!document.querySelector('[data-testid="gen-panel"]'));
  step('⑤ 选中 imggen → 生成面板出现', panelShown);

  // ── ⑥ 触发生成（mock API 通道）──
  let genClicked = false;
  if (panelShown) {
    genClicked = await page.evaluate(() => {
      const btn = [...document.querySelectorAll('[data-testid="gen-panel"] button')].find((b) =>
        /生成/.test(b.textContent || ''),
      );
      btn?.click();
      return !!btn;
    });
    await page.waitForTimeout(900);
  }
  step('⑥ 触发生成（mock 通道）', genClicked);

  // ── ⑦ 导出（应触发下载）──
  const dl = page.waitForEvent('download', { timeout: 5000 }).catch(() => null);
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((x) => x.textContent?.includes('导出'));
    b?.click();
  });
  const download = await dl;
  step('⑦ 导出触发下载', !!download, download ? await download.suggestedFilename() : '未触发');

  // ── ⑧ 刷新后状态还原 ──
  const beforeReload = await page.evaluate(() => {
    const raw = localStorage.getItem('doubao-projects');
    const list = raw ? JSON.parse(raw) : [];
    return list[0]?.data?.nodes?.length ?? -1;
  });
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(900);
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((x) => x.textContent?.includes('E2E 冒烟工程'));
    b?.click();
  });
  await page.waitForTimeout(1000);
  const afterReload = await countNodes();
  // 判据 = 「刷新后与刷新前一致」（**不**耦合其它步骤的节点数 —— 那会让失败相互掩盖）
  step('⑧ 刷新后状态还原', afterReload === beforeReload && afterReload > 0, `落盘 ${beforeReload} / 渲染 ${afterReload}`);

  // ── 输出 ──
  console.log('\n════════ W15 端到端判据 ════════');
  for (const s of steps) console.log(`  ${s.ok ? '✅' : '❌'} ${s.name}${s.detail ? `  (${s.detail})` : ''}`);

  const crashOk = crashes.length === 0;
  console.log(`  ${crashOk ? '✅' : '❌'} ⑨ 无 ReferenceError / TypeError  (实际 ${crashes.length})`);

  const pass = steps.every((s) => s.ok) && crashOk;

  if (crashes.length) {
    console.log('\n════════ 崩溃（ReferenceError / TypeError）════════');
    console.log(crashes.slice(0, 6).map((c) => '  ❌ ' + c).join('\n'));
  }
  if (otherErrors.length) {
    console.log('\n════════ 其它 pageerror（非 W15 硬判据）════════');
    console.log(otherErrors.slice(0, 6).map((c) => '  ⚠️ ' + c).join('\n'));
  }

  await browser.close();
  server.close();
  console.log(`\n${pass ? '✅ W15 通过' : '❌ W15 未通过'}`);
  process.exit(pass ? 0 : 1);
})().catch((e) => {
  console.error('harness crash:', e);
  process.exit(2);
});
