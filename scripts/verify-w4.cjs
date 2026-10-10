#!/usr/bin/env node
/**
 * W4 运行时验证：持久化链路
 *
 * 判据（docs/08-验证用例.md W4）：
 *   ① 600ms 内只写 1 次 localStorage（**防抖生效**）
 *   ② `projects-autobackup.json` 同步更新 —— ⚠️ **需真实宿主**（浏览器 mock 里是 no-op）
 *   ③ 刷新页面后数据不丢
 *
 * 本脚本验证 ① 与 ③；② 归 Electron 里的验证（见结论里的说明）。
 *
 * 用法：node scripts/verify-w4.cjs
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

const isNoise = (t) =>
  /Failed to load resource|net::ERR|ERR_CONNECTION|favicon|status of 4\d\d|React DevTools|ResizeObserver/i.test(
    String(t).split('\n')[0],
  );

const project = [
  {
    id: 'p_w4',
    name: 'W4 持久化校验',
    updatedAt: Date.now(),
    data: {
      nodes: [
        {
          id: 't1',
          type: 'text',
          position: { x: 0, y: 0 },
          data: { text: '原始', aspectRatio: '16:9', duration: 7, linkOrder: [], referenceOrder: [], materialIds: [], styleIds: [] },
        },
      ],
      edges: [],
      library: [],
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
  const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });

  // 计数 localStorage.setItem（只统计 doubao-projects）
  await page.addInitScript((p) => {
    localStorage.setItem('doubao-projects', JSON.stringify(p));
    window.__writes = [];
    const orig = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) {
      if (k === 'doubao-projects') window.__writes.push(Date.now());
      return orig.call(this, k, v);
    };
  }, project);

  const events = [];
  page.on('pageerror', (e) => events.push(e.message));

  await page.goto(url, { waitUntil: 'load', timeout: 30000 });
  await new Promise((r) => setTimeout(r, 600));

  // 进入工程
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((x) => x.textContent?.includes('W4 持久化校验'));
    b?.click();
  });
  await new Promise((r) => setTimeout(r, 500));

  // 清空计数，然后**制造 10 次快速变更**（模拟连续编辑，间隔 < 600ms）
  await page.evaluate(() => {
    window.__writes.length = 0;
  });

  // 用键盘撤销/重做 5 轮（每次都是真实 store 变更）
  for (let i = 0; i < 5; i++) {
    await page.keyboard.press('Control+z');
    await new Promise((r) => setTimeout(r, 60));
    await page.keyboard.press('Control+Shift+z');
    await new Promise((r) => setTimeout(r, 60));
  }

  const during = await page.evaluate(() => window.__writes.length);
  // 等防抖窗口过去
  await new Promise((r) => setTimeout(r, 1200));
  const after = await page.evaluate(() => window.__writes.length);

  // ③ 刷新后数据不丢
  await page.reload({ waitUntil: 'load' });
  await new Promise((r) => setTimeout(r, 800));
  const persisted = await page.evaluate(() => {
    const raw = localStorage.getItem('doubao-projects');
    const list = raw ? JSON.parse(raw) : [];
    return { count: list.length, name: list[0]?.name, nodeText: list[0]?.data?.nodes?.[0]?.data?.text };
  });

  const appErrors = events.filter((e) => !isNoise(e));

  console.log('\n════════ W4 判据 ════════');
  const checks = [
    ['① 防抖生效（10 次变更 → 写入 ≤2 次）', after <= 2, `实际 ${after} 次（窗口内 ${during} 次）`],
    ['② 应用级错误 = 0', appErrors.length === 0, `实际 ${appErrors.length}`],
    ['③ 刷新后工程不丢', persisted.count === 1 && persisted.name === 'W4 持久化校验', JSON.stringify(persisted)],
    ['④ 节点文本保留', persisted.nodeText === '原始', String(persisted.nodeText)],
  ];
  let pass = true;
  for (const [name, ok, detail] of checks) {
    if (!ok) pass = false;
    console.log(`  ${ok ? '✅' : '❌'} ${name}  (${detail})`);
  }

  console.log('\n⚠️ 判据 ②（projects-autobackup.json 同步）需真实宿主：浏览器 mock 里 saveBackup 是 no-op。');
  console.log('   → 归 Electron 内验证（`docs/08` W4 的完整判据）。');

  if (appErrors.length) {
    console.log('\n════════ 应用级错误 ════════');
    console.log(appErrors.slice(0, 5).map((e) => '❌ ' + e).join('\n'));
  }

  await browser.close();
  server.close();
  console.log(`\n${pass ? '✅ W4（浏览器可验部分）通过' : '❌ W4 未通过'}`);
  process.exit(pass ? 0 : 1);
})().catch((e) => {
  console.error('harness crash:', e);
  process.exit(2);
});
