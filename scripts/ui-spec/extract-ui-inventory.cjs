#!/usr/bin/env node
/**
 * UI 功能清单抽取器（**功能导向**，不是样式导向）
 *
 * 对每个原版 jsx 抽：
 *   - 按钮/可点元素（类名 + 文案 + title 提示）
 *   - 交互处理器（onClick / onDoubleClick / onContextMenu / onPointerDown…）
 *   - 数据字段访问（`data.xxx`）—— 反推节点需要哪些字段
 *   - 状态分支（generating / error / waiting / done…）
 *   - 全部中文文案（UI 用词）
 *   - 全部 className
 *
 * 产出：`app/_ui-inventory.json`
 *
 * 用法：node scripts/ui-spec/extract-ui-inventory.cjs
 */
const fs = require('node:fs');
const path = require('node:path');

const SRC = 'G:\\01画布项目\\豆包画布\\逆向工程\\_pipeline_step\\project\\src\\expanded_components';
const OUT = path.resolve(__dirname, '..', '..', '_ui-inventory.json');

const uniq = (a) => [...new Set(a)].filter(Boolean);

function analyze(code) {
  // ① 按钮
  const buttons = [];
  for (const m of code.matchAll(/<button\b[\s\S]{0,600}?<\/button>|<button\b[^>]*\/>/g)) {
    const blk = m[0];
    const cls = (blk.match(/className=\{?[`"']?([^`"'}>]+)/) || [])[1] || '';
    const title = (blk.match(/title=\{?[`"]([^`"}]*)["`]/) || [])[1] || '';
    const text = (blk.match(/>([^<>{}]{1,24})</) || [])[1] || '';
    const label = (text || title || cls).trim();
    if (label) buttons.push({ cls: cls.trim().slice(0, 44), label: label.slice(0, 30), title: title.slice(0, 40) });
  }

  // ② 交互
  const handlers = uniq([...code.matchAll(/\bon([A-Z]\w+)\s*=/g)].map((m) => m[1]));

  // ③ data 字段
  const dataFields = uniq(
    [...code.matchAll(/\bdata\.([a-zA-Z_$][\w$]*)/g), ...code.matchAll(/\b(?:t|e)\.data\.([a-zA-Z_$][\w$]*)/g)].map(
      (m) => m[1],
    ),
  );

  // ④ 状态词
  const states = uniq(
    [...code.matchAll(/['"`](generating|waiting|done|error|failed|sending|queued|running|switching|success)['"`]/g)].map(
      (m) => m[1],
    ),
  );

  // ⑤ 中文文案
  const literals = uniq(
    [
      ...code.matchAll(/['"`]([\u4e00-\u9fa5][^'"`\n]{0,34})['"`]/g),
      ...code.matchAll(/>\s*([\u4e00-\u9fa5][^<>{}\n]{0,34}?)\s*</g),
    ].map((m) => m[1].trim()),
  );

  // ⑥ 类名
  const classes = uniq(
    [...code.matchAll(/className="([^"]+)"/g), ...code.matchAll(/className=\{`([^`]+)`\}/g)].map((m) =>
      m[1].replace(/\$\{[^}]*\}/g, '…'),
    ),
  )
    .map((s) => s.trim())
    .filter(Boolean);

  return { buttons, handlers, dataFields, states, literals, classes };
}

const files = fs.readdirSync(SRC).filter((f) => f.endsWith('.jsx'));
const report = {};
for (const f of files) {
  const code = fs.readFileSync(path.join(SRC, f), 'utf8');
  if (code.length < 400) continue;
  report[f] = { bytes: code.length, ...analyze(code) };
}

fs.writeFileSync(OUT, JSON.stringify(report, null, 2), 'utf8');

const rows = Object.entries(report).sort((a, b) => b[1].bytes - a[1].bytes);
console.log(`已写出 _ui-inventory.json —— ${rows.length} 个组件`);
console.log('文件'.padEnd(24) + '字节'.padStart(8) + '按钮'.padStart(6) + '交互'.padStart(6) + '字段'.padStart(6) + '文案'.padStart(6));
console.log('-'.repeat(62));
for (const [f, r] of rows.slice(0, 30)) {
  console.log(
    f.padEnd(24) +
      String(r.bytes).padStart(8) +
      String(r.buttons.length).padStart(6) +
      String(r.handlers.length).padStart(6) +
      String(r.dataFields.length).padStart(6) +
      String(r.literals.length).padStart(6),
  );
}
