// 运行时验证：把还原出的源码构建产物跑起来，看是否真的渲染
// 用法: node verify-run.cjs
const http = require('http');
const fs = require('fs');
const path = require('path');

// 复用逆向专用里已装好的 playwright（浏览器二进制已在 ms-playwright 缓存）
const PW = process.env.PW_PATH || 'G:/01画布项目/豆包画布/逆向专用/node_modules/playwright';
const { chromium } = require(PW);

const DIST = path.resolve(__dirname, 'project', 'dist');
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.wasm': 'application/wasm',
  '.map': 'application/json',
};

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const fp = path.join(DIST, p);
  if (!fp.startsWith(DIST) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) {
    res.writeHead(404); res.end('404'); return;
  }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(fp)] || 'application/octet-stream' });
  fs.createReadStream(fp).pipe(res);
});

// 只看首行判断噪声——错误堆栈里常含 127.0.0.1/localhost，不能按整段文本过滤
const isNoise = (t) =>
  /Failed to load resource|net::ERR|ERR_CONNECTION|favicon|status of 4\d\d|status of 5\d\d|Download the React DevTools/i.test(
    String(t).split('\n')[0],
  );

(async () => {
  await new Promise((r) => server.listen(0, r));
  const port = server.address().port;
  const url = `http://127.0.0.1:${port}/index.html`;
  console.log('serving:', url);

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const events = [];
  page.on('console', (m) => { if (m.type() === 'error') events.push(['console.error', m.text()]); });
  page.on('pageerror', (e) => events.push(['pageerror', e.message + '\n' + (e.stack || '').split('\n').slice(0, 3).join('\n')]));
  page.on('requestfailed', (r) => events.push(['requestfailed', r.url() + ' :: ' + ((r.failure() || {}).errorText || '')]));

  await page.goto(url, { waitUntil: 'load', timeout: 30000 });
  await new Promise((r) => setTimeout(r, 8000));

  const info = await page.evaluate(() => {
    const root = document.getElementById('root');
    return {
      title: document.title,
      rootChildren: root ? root.children.length : -1,
      rootHtmlLen: root ? root.innerHTML.length : -1,
      hasCanvasLike: !!document.querySelector('canvas, .react-flow, [class*="canvas"]'),
      bodyTextPreview: (document.body.innerText || '').replace(/\s+/g, ' ').slice(0, 200),
    };
  });

  const appErrors = events.filter((e) => !isNoise(e[1]));
  const noise = events.filter((e) => isNoise(e[1]));

  console.log('\n════════ 渲染结果 ════════');
  console.log(JSON.stringify(info, null, 2));
  console.log('\n════════ 应用级错误 (' + appErrors.length + ') ════════');
  console.log(appErrors.length ? appErrors.map((e) => '❌ ' + e[0] + ': ' + e[1]).join('\n') : '(无)');
  console.log('\n════════ 噪声 (' + noise.length + ') ════════');
  console.log(noise.slice(0, 6).map((e) => '· ' + e[0] + ': ' + e[1].slice(0, 120)).join('\n') || '(无)');

  await browser.close();
  server.close();
  process.exit(appErrors.length ? 1 : 0);
})().catch((e) => { console.error('harness crash:', e); process.exit(2); });
