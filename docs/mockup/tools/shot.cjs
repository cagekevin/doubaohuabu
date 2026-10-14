#!/usr/bin/env node
/**
 * 设计稿截图（**手动工具**，不是闸）
 *
 * 用法：`node docs/mockup/tools/shot.cjs [输出目录]`
 *
 * ⚠️ 用**本机 Chrome**（`executablePath`），不下载 playwright 自带的 chromium
 *    —— 后者版本常与 `playwright` 包不匹配（`Executable doesn't exist`）。
 */
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
/** 输出目录：相对**本 mockup 目录**解析（允许从项目根传 `docs/mockup/.shots`，去掉前缀免得拼两层）*/
const OUT = path.resolve(ROOT, (process.argv[2] || '.shots').replace(/^docs\/mockup\//, ''));
/**
 * 浏览器优先级：① playwright 自带的 Chrome for Testing（版本必匹配，首选）；
 * ② 系统 Chrome（兜底 —— 个别机器上 headless 启动会卡死，卡住就换 ①）。
 */
const CHROME_FOR_TESTING = path.join(
  process.env.HOME || '',
  'Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
);
const SYSTEM_CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const EXEC = [CHROME_FOR_TESTING, SYSTEM_CHROME].find((p) => fs.existsSync(p));

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: EXEC, headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });

  await page.goto('file://' + path.join(ROOT, 'index.html'), { waitUntil: 'load' });
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(OUT, 'home.png') });

  // 暗色
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(OUT, 'home-dark.png') });

  console.log('errors:', errs.length ? [...new Set(errs)].slice(0, 8).join('\n') : '(none)');
  console.log('out ->', OUT);
  await browser.close();
})().catch((e) => { console.error(e); process.exit(2); });
