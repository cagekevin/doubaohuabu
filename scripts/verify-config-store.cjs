#!/usr/bin/env node
/**
 * TD-13-5 验证：**API 配置损坏时「备份 + 报错」，不静默重置**
 *
 * 判据（三态必须区分）：
 *   | 情况 | 期望 |
 *   |---|---|
 *   | 文件不存在（首次运行） | 返回空配置（**正常，不抛**） |
 *   | **文件损坏** | **抛错** + **原文已备份** + **原文件未被覆盖** |
 *   | 读盘失败 | 抛错 |
 *
 * ⚠️ 这是**行为断言**（跑真实 `config-store.js`，非 mock）—— 把实现改坏它必红。
 *
 * 用法：node scripts/verify-config-store.cjs
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { createConfigStore } = require('../electron/api/config-store.js');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'cfg-store-'));
const results = [];
const step = (name, ok, detail) => results.push({ name, ok, detail });

/** ① 文件不存在（首次运行）→ 空配置，**不抛** */
{
  const dir = path.join(TMP, 'fresh');
  fs.mkdirSync(dir, { recursive: true });
  let threw = null;
  let setup = null;
  try {
    setup = createConfigStore(dir, null).getSetup();
  } catch (e) {
    threw = e;
  }
  step(
    '① 文件不存在 → 空配置且不抛（首次运行是正常态）',
    !threw && setup !== null && setup.concurrency >= 1,
    threw ? `不该抛：${threw.message}` : `concurrency=${setup && setup.concurrency}`,
  );
}

/** ② 文件损坏 → **抛错** + 备份 + 原文件未被覆盖 */
{
  const dir = path.join(TMP, 'corrupt');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'api-config.json');
  const BROKEN = '{"version":2,"providers":{"volcengine-ark":{' ; // 截断的 JSON
  fs.writeFileSync(file, BROKEN, 'utf-8');

  let threw = null;
  try {
    createConfigStore(dir, null).getSetup();
  } catch (e) {
    threw = e;
  }
  step('② 文件损坏 → 抛错（不静默重置）', !!threw, threw ? threw.message.slice(0, 70) : '没抛 —— 静默重置了！');

  // ②-b 原文必须**原样保留**（没被空配置覆盖）
  const after = fs.existsSync(file) ? fs.readFileSync(file, 'utf-8') : '';
  step('②-b 原文件未被覆盖（内容仍是损坏原文）', after === BROKEN, after === BROKEN ? '一致' : `被改成了：${after.slice(0, 60)}`);

  // ②-c 必须留下备份
  const baks = fs.readdirSync(dir).filter((n) => n.includes('.corrupt-'));
  step('②-c 原文已备份（.corrupt-* 文件存在）', baks.length === 1, baks.length ? baks[0] : '无备份文件');
  if (baks.length === 1) {
    const bakContent = fs.readFileSync(path.join(dir, baks[0]), 'utf-8');
    step('②-d 备份内容与损坏原文一致', bakContent === BROKEN, bakContent === BROKEN ? '一致' : '不一致');
  }
}

/** ③ 文件正常 → 能读到（防回归：正常路径不许被改坏） */
{
  const dir = path.join(TMP, 'ok');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'api-config.json'),
    JSON.stringify({ version: 2, providers: {}, setup: { concurrency: 7 } }),
    'utf-8',
  );
  let setup = null;
  let threw = null;
  try {
    setup = createConfigStore(dir, null).getSetup();
  } catch (e) {
    threw = e;
  }
  step('③ 正常文件 → 读到真实值（防回归）', !threw && setup && setup.concurrency === 7, threw ? threw.message : `concurrency=${setup && setup.concurrency}`);
}

/** ④ 外部修好文件后 → 下次调用能读到（不缓存失败） */
{
  const dir = path.join(TMP, 'repair');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'api-config.json');
  fs.writeFileSync(file, '{ broken', 'utf-8');
  const store = createConfigStore(dir, null);
  let firstThrew = false;
  try {
    store.getSetup();
  } catch {
    firstThrew = true;
  }
  // 外部修好
  fs.writeFileSync(file, JSON.stringify({ version: 2, providers: {}, setup: { concurrency: 9 } }), 'utf-8');
  let second = null;
  let secondThrew = null;
  try {
    second = store.getSetup();
  } catch (e) {
    secondThrew = e;
  }
  step(
    '④ 外部修好文件后 → 下次调用能读到（不缓存失败）',
    firstThrew && !secondThrew && second && second.concurrency === 9,
    `第一次抛=${firstThrew} · 第二次=${secondThrew ? secondThrew.message : (second && second.concurrency)}`,
  );
}

console.log('\n════════ TD-13-5 · 配置损坏处置 ════════');
for (const s of results) console.log(`  ${s.ok ? '✅' : '❌'} ${s.name}${s.detail ? `  (${s.detail})` : ''}`);
const pass = results.every((r) => r.ok);
console.log(`\n${pass ? '✅ 通过' : '❌ 未通过'}`);
try {
  fs.rmSync(TMP, { recursive: true, force: true });
} catch {
  /* 清理失败不影响结论 */
}
process.exit(pass ? 0 : 1);
