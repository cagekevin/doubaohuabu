/**
 * check-targets.mjs —— 扫描根 + 扩展名无关解析的**唯一事实来源**（豆包画布/app 版）
 *
 * 背景（为什么要抽出来）：扫描根若写死在各自脚本里，目录一调整就会有文件**逃出所有校验**
 * （表现为"扫描文件数悄悄变少"，且**不报错**）。集中成一处后，新增顶层目录只改本文件。
 *
 * 本项目扫描根 = `src`（`docs/11` §二 的七层都在其下）；`electron/**` 是宿主壳，
 * **不在渲染层校验范围**（见 `docs/11` §六·五 原则 7 与 `eslint.config.js` 的 ignores）。
 *
 * 另外：本文件是 ESM 侧拿「永久豁免清单 + 扩展名无关解析 + JSX 探测」的转出口，
 * 真实定义在 ts-exts.cjs（CJS，.cjs/.mjs 两边共用一份）。
 *
 * 界限：
 *  - 只列【应受契约校验】的源码目录；third-party / 生成物 / 测试夹具不在内。
 *  - 目录不存在时静默跳过，保持脚本可用。
 */
import { readdirSync, statSync, existsSync, readFileSync } from 'node:fs';
import { join, extname } from 'node:path';
import { createRequire } from 'node:module';

// 扩展名无关解析 + 永久豁免清单 + JSX 探测的唯一事实来源（CJS，供 .cjs/.mjs 共用）
const require = createRequire(import.meta.url);
const {
  SOURCE_EXTS,
  TS_EXEMPT_DIRS,
  TS_EXEMPT_FILES,
  isExempt,
  resolveSourceFile,
  hasJsx,
  hasJsxHintRaw,
  detectExt,
} = require('./ts-exts.cjs');

/** 受契约校验的源码目录（相对仓库根） */
export const SCAN_DIRS = ['src'];

/** 受校验的源码扩展名 */
export const SCAN_EXTS = SOURCE_EXTS;

/** 转出口：ESM 脚本（本项目消费方 = `mv-sync-refs.mjs`）从这里取，避免各写一份 */
export {
  SOURCE_EXTS,
  TS_EXEMPT_DIRS,
  TS_EXEMPT_FILES,
  isExempt,
  resolveSourceFile,
  hasJsx,
  hasJsxHintRaw,
  detectExt,
};

/**
 * 读取源码文件内容（扩展名无关）。
 *
 * 用途：诊断 / 一次性脚本需要按路径读源码做静态断言，写死后继扩展名会在改名那一刻 ENOENT，
 * 且这类脚本不在任何门禁里，坏了长期无人发现。统一走这里即可免疫后缀漂移。
 *
 * 本项目消费方：`mv-sync-refs.mjs`。
 *
 * @param {string} abs 绝对路径，可带也可不带扩展名（'.../persist' 或 '.../persist.ts'）
 * @returns {string} 文件内容
 */
export function readSourceFile(abs) {
  const hit = resolveSourceFile(abs);
  if (!hit) throw new Error(`[check-targets] 源码文件未找到（扩展名无关解析失败）: ${abs}`);
  return readFileSync(hit, 'utf8');
}

/** 递归收集 dir 下的源码文件绝对路径 */
export function collectSources(dir, acc = []) {
  if (!existsSync(dir)) return acc; // 目录不存在 → 静默跳过
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      collectSources(full, acc);
    } else if (SCAN_EXTS.includes(extname(name))) {
      acc.push(full);
    }
  }
  return acc;
}

/**
 * 默认扫描目标：SCAN_DIRS 下的全部源码文件。
 * @param {string} root 仓库根目录绝对路径
 * @returns {string[]} 文件绝对路径数组
 */
export function defaultTargets(root) {
  const out = [];
  for (const d of SCAN_DIRS) collectSources(join(root, d), out);
  return out;
}
