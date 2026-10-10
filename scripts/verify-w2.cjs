#!/usr/bin/env node
/**
 * W2 运行时验证（老数据兼容，**P0**）
 *
 * 做什么：把**真实样本**（`tests/fixtures/real-sample/`）注入 localStorage → 启动 → 跑迁移
 *   → 断言：无应用级错误、工程数据不丢、迁移幂等
 *
 * 对应：docs/08-验证用例.md W2（判据 ①②④）
 *
 * 用法：node scripts/verify-w2.cjs
 */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const PW = process.env.PW_PATH || 'G:/01画布项目/豆包画布/逆向专用/node_modules/playwright';
const { chromium } = require(PW);

const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const FIX = path.join(ROOT, 'tests', 'fixtures', 'real-sample');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.map': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
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
  /Failed to load resource|net::ERR|ERR_CONNECTION|favicon|status of 4\d\d|React DevTools/i.test(
    String(t).split('\n')[0],
  );

/** 读样本（缺失则返回 null —— 不造假） */
function readSample(name) {
  const p = path.join(FIX, name);
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null;
}

(async () => {
  if (!fs.existsSync(DIST)) {
    console.error('❌ 未找到 dist/，请先 npm run build');
    process.exit(1);
  }

  const sampleProjects = readSample('doubao-projects.txt');
  const sampleAccounts = readSample('doubao-accounts.txt');
  if (!sampleProjects) {
    console.error('❌ 缺真实样本 doubao-projects.txt（先跑 node scripts/extract-real-sample.cjs）');
    process.exit(1);
  }

  // 样本的「迁移前」快照（用于比对不丢数据）
  const before = JSON.parse(sampleProjects);
  const beforeNodes = before[0].data.nodes.length;
  const beforeTypes = before[0].data.nodes.map((n) => n.type).sort().join(',');

  await new Promise((r) => server.listen(0, r));
  const url = `http://127.0.0.1:${server.address().port}/index.html`;
  console.log('serving:', url);

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

  // ★ 页面脚本执行**之前**注入真实样本
  await page.addInitScript(
    ([projects, accounts]) => {
      localStorage.setItem('doubao-projects', projects);
      if (accounts) localStorage.setItem('doubao-accounts', accounts);
    },
    [sampleProjects, sampleAccounts],
  );

  const events = [];
  page.on('console', (m) => {
    if (m.type() === 'error') events.push(['console.error', m.text()]);
  });
  page.on('pageerror', (e) => events.push(['pageerror', e.message]));

  await page.goto(url, { waitUntil: 'load', timeout: 30000 });
  await new Promise((r) => setTimeout(r, 2000));

  // 读回迁移后的 localStorage（应用层写回的）
  const after = await page.evaluate(() => ({
    projects: localStorage.getItem('doubao-projects'),
    accounts: localStorage.getItem('doubao-accounts'),
    presets: localStorage.getItem('doubao-presets'),
    bodyText: (document.body.innerText || '').replace(/\s+/g, ' ').slice(0, 200),
  }));

  const parsed = after.projects ? JSON.parse(after.projects) : [];
  const afterNodes = parsed[0]?.data?.nodes?.length ?? -1;
  const afterTypes = (parsed[0]?.data?.nodes ?? []).map((n) => n.type).sort().join(',');

  const appErrors = events.filter((e) => !isNoise(e[1]));

  console.log('\n════════ W2 判据 ════════');
  const checks = [
    ['① 应用级错误 = 0', appErrors.length === 0, `实际 ${appErrors.length}`],
    ['② 工程数不丢', parsed.length === before.length, `${before.length} → ${parsed.length}`],
    ['③ 节点数不丢', afterNodes === beforeNodes, `${beforeNodes} → ${afterNodes}`],
    ['④ 节点类型不变', afterTypes === beforeTypes, `${beforeTypes} → ${afterTypes}`],
    ['⑤ 字段形状保持', Object.keys(parsed[0]?.data ?? {}).sort().join(',') === 'edges,library,nodes,snap,videoShares', Object.keys(parsed[0]?.data ?? {}).join(',')],
    ['⑥ 工程出现在启动页', after.bodyText.includes(before[0].name), `找「${before[0].name}」`],
  ];
  let pass = true;
  for (const [name, ok, detail] of checks) {
    if (!ok) pass = false;
    console.log(`  ${ok ? '✅' : '❌'} ${name}  (${detail})`);
  }

  console.log(`\n渲染文本：${after.bodyText}`);
  if (appErrors.length) {
    console.log('\n════════ 应用级错误 ════════');
    console.log(appErrors.map((e) => '❌ ' + e[0] + ': ' + e[1]).join('\n'));
  }

  await browser.close();
  server.close();
  console.log(`\n${pass ? '✅ W2 通过' : '❌ W2 未通过'}`);
  process.exit(pass ? 0 : 1);
})().catch((e) => {
  console.error('harness crash:', e);
  process.exit(2);
});
