#!/usr/bin/env node
/**
 * 运行时验证：静态服务 dist → 无头 Chromium 加载 → 抓错 → 看 #root 是否渲染
 * 对应 docs/08-验证用例.md 的「能渲染」判据（M0 验收）
 *
 * 用法：node scripts/verify-run.cjs
 */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

// playwright 已是本工程 devDependency ⇒ 用**裸模块名**解析（不再依赖工程外路径，见 verify-canvas 注释）
const { launchBrowser } = require('./_pw.cjs');

const DIST = path.resolve(__dirname, '..', 'dist');
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.map': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.wasm': 'application/wasm',
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

// 只看首行判噪声（堆栈里常含 127.0.0.1，不能按整段过滤）
const isNoise = (t) =>
  /Failed to load resource|net::ERR|ERR_CONNECTION|favicon|status of 4\d\d|status of 5\d\d|React DevTools/i.test(
    String(t).split('\n')[0],
  );

(async () => {
  if (!fs.existsSync(DIST)) {
    console.error('❌ 未找到 dist/，请先 npm run build');
    process.exit(1);
  }
  await new Promise((r) => server.listen(0, r));
  // ⚠️ 必须带 `?devMock=1`：mock 宿主的 E 族（`license.getStatus`）被门控（见 mock/index.ts 头注清单）
  const url = `http://127.0.0.1:${server.address().port}/index.html?devMock=1`;
  console.log('serving:', url);

  const browser = await launchBrowser();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const events = [];
  page.on('console', (m) => {
    if (m.type() === 'error') events.push(['console.error', m.text()]);
  });
  page.on('pageerror', (e) => events.push(['pageerror', e.message]));

  await page.goto(url, { waitUntil: 'load', timeout: 30000 });
  await new Promise((r) => setTimeout(r, 2500));

  const info = await page.evaluate(() => {
    const root = document.getElementById('root');
    return {
      title: document.title,
      rootChildren: root ? root.children.length : -1,
      bodyText: (document.body.innerText || '').replace(/\s+/g, ' ').slice(0, 300),
    };
  });

  // 点「＋ 新建项目」→ 应切到画布外壳
  const afterClick = await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((b) => b.textContent?.includes('新建项目'));
    btn?.click();
    return !!btn;
  });
  await new Promise((r) => setTimeout(r, 500));
  const shellText = await page.evaluate(() =>
    (document.body.innerText || '').replace(/\s+/g, ' ').slice(0, 200),
  );

  const appErrors = events.filter((e) => !isNoise(e[1]));
  console.log('\n════════ 渲染结果 ════════');
  console.log(JSON.stringify(info, null, 2));
  console.log(`\n点击「新建项目」：${afterClick ? '✅ 找到按钮' : '❌ 未找到按钮'}`);
  console.log(`切换后文本：${shellText}`);
  console.log(`\n════════ 应用级错误 (${appErrors.length}) ════════`);
  console.log(appErrors.length ? appErrors.map((e) => '❌ ' + e[0] + ': ' + e[1]).join('\n') : '(无)');

  await browser.close();
  server.close();
  process.exit(appErrors.length ? 1 : 0);
})().catch((e) => {
  console.error('harness crash:', e);
  process.exit(2);
});
