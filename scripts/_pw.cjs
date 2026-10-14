#!/usr/bin/env node
/**
 * Playwright 启动收口 —— 6 个 `verify-*.cjs` 共用（★ 启动策略只有这一份）。
 *
 * 【为什么走**本机 Chrome**】默认的 `chromium.launch()` 用的是 Playwright **自带**的版本化浏览器
 *   （`ms-playwright/chromium_headless_shell-<build>`）—— 每次 `playwright` 升版都会换 build 号，
 *   缓存里那份**立刻失效**，报 `Executable doesn't exist at …-1248/…`，逼人反复 `npx playwright install`。
 *   用 `channel: 'chrome'` 走**本机已装的 Google Chrome** ⇒ 不随 Playwright 版本漂。
 *
 * 【覆盖】`PW_CHANNEL`（默认 `chrome`）；显式置**空串** ⇒ 回退 Playwright 自带浏览器。
 *          `PW_PATH` 仍是 Playwright 模块名（默认 `playwright`）。
 *
 * ⚠️ 依赖 `dist/` 的脚本请先 `npx vite build`。
 */
const PW = process.env.PW_PATH || 'playwright';
const { chromium } = require(PW);

/** 启动一个无头浏览器（默认本机 Chrome，见头注） */
function launchBrowser(extra = {}) {
  const channel = process.env.PW_CHANNEL === undefined ? 'chrome' : process.env.PW_CHANNEL;
  return chromium.launch({ headless: true, ...(channel ? { channel } : {}), ...extra });
}

module.exports = { launchBrowser, chromium };
