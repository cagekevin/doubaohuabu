/**
 * Phase 3a · **发送前完整性校验**（图数 / 图序）—— **纯判据**
 *
 * 依据（**逐行回源抄录**，源 `_Component43.jsx` 的 `Be`）：
 *   - 图序比对 `uD` `shared.js:37458-37493`
 *   - 期望指纹构造 `uD` 内的 `t.map(...)`（`:37463-37467`）
 *   - 校验与结论 `:1139-1227`（`G` / `Me` / `Re` / `$` / `Ne` / `at`）
 *
 * ⚠️ **哈希复用**：源 `_0`（`shared.js:37449-37457`）是标准 FNV-1a 32 位（`>>> 0`）；
 *    本仓同一算法住 `lib/hash.hash32`（`TD-05-6` 收口，返回值多一层 base36 —— 该文件的
 *    头注已把这处加法留痕）。**不另写第二份 FNV**（判据 C1）。
 */

import { hash32 } from '@/lib/hash';
import { ATTACH_PRECHECK_TEXT } from '@/constants/text';

/** 图序判定的三态（源 `uD` 的 `'ok' | 'mismatch' | 'unknown'`） */
export type ImageOrder = 'ok' | 'mismatch' | 'unknown';

/**
 * 期望指纹的构造（原 `uD:37463-37465` 的 `'DATA$' + (l.dataUrl || '').replace(/^data:[^,]*,/,'').replace(/\s+/g,'').substring(0,600)`）
 *
 * ⚠️ 三个动作**顺序不能换**：先去 `data:` 前缀 → 再去空白 → 最后截 600
 */
export function expectedSigOf(dataUrl: unknown): string {
  const s = typeof dataUrl === 'string' ? dataUrl : '';
  return `DATA$${s.replace(/^data:[^,]*,/, '').replace(/\s+/g, '').substring(0, 600)}`;
}

/**
 * 图序比对（原 `uD`，`shared.js:37458-37493`）
 *
 * 逐字语义：
 *   ① 入参任一非数组 / 期望为空 ⇒ `'unknown'`
 *   ② 期望 = 逐张 `_0(expectedSigOf(dataUrl))`；建 `hash → 下标` 表（**后者覆盖前者**）
 *   ③ 页内指纹 `sigs` **再 hash 一次**后查表，命中就记下它在期望里的下标
 *   ④ **全部命中**才可能判序：下标序列**严格递增** ⇒ `'ok'`，否则 `'mismatch'`
 *   ⑤ 有未命中 ⇒ `'unknown'`（**不阻塞**，源注释：`⚠ 无法判定（不阻塞）`）
 *
 * @param sigs 页内探测到的指纹串（源 `cD` 的 `sigs`）
 * @param images 期望的参考图 `dataUrl` 列表（源去重后的 `K`）
 */
export function compareImageOrder(sigs: unknown, images: readonly unknown[]): ImageOrder {
  if (!Array.isArray(sigs) || images.length === 0) return 'unknown';

  const expected = images.map((d) => hash32(expectedSigOf(d)));
  const indexOfHash: Record<string, number> = {};
  expected.forEach((h, i) => {
    indexOfHash[h] = i;
  });

  const found: number[] = [];
  let matched = 0;
  for (const s of sigs as unknown[]) {
    const h = hash32(String(s));
    if (Object.prototype.hasOwnProperty.call(indexOfHash, h)) {
      found.push(indexOfHash[h] as number);
      matched += 1;
    }
  }

  if (matched !== expected.length) return 'unknown';
  for (let i = 1; i < found.length; i += 1) {
    if ((found[i] as number) <= (found[i - 1] as number)) return 'mismatch';
  }
  return 'ok';
}

export interface AttachPrecheckInput {
  /** 文本是否已填入（源 `xe`；含 `Ql` 复核后的最终值） */
  textOk: boolean;
  /** 期望张数（源 `G = K.length`，**去重后**） */
  expected: number;
  /** 过程计数（源 `we`，Phase 2 累计确认的新增） */
  processCount: number;
  /** 页内探测到的元素数（源 `ye`，`cD` 的 `count`；探不到 ⇒ 0） */
  liveCount: number;
  /** 页内指纹**去重后**条数（源 `be.length`） */
  sigCount: number;
  /** 图序（源 `$`，来自 `compareImageOrder`） */
  order: ImageOrder;
}

export interface AttachPrecheckResult {
  /** 总通过（源 `Ne = xe && Re && $ !== 'mismatch'`） */
  pass: boolean;
  /** 文本项 */
  text: boolean;
  /** 期望张数（源 `precheck.imagesExpected`） */
  imagesExpected: number;
  /** 认定已附上的张数（源 `Me`） */
  imagesAttached: number;
  /** 图数是否够（源 `Re`） */
  imagesOk: boolean;
  order: ImageOrder;
  /** 失败明细（源 `at.join('；')`）—— 全通过时为空串 */
  issues: string;
}

/**
 * Phase 3a 判定（原 `:1169-1227`）
 *
 * 源逐字的两条分支（**顺序即语义**）：
 *   · 图序 `'ok'` ⇒ `Me = max(过程计数, 页内元素数, 指纹数, 期望)`、`Re = true`（**顺序对就直接判够**）
 *   · 否则 ⇒ `Me = max(过程计数, 页内元素数)`、`Re = Me >= 期望`
 * ⚠️ 无图（`expected === 0`）⇒ `Re` **恒 true**（源 `let Re = G === 0`）
 */
export function attachPrecheck(input: AttachPrecheckInput): AttachPrecheckResult {
  const { expected: g } = input;
  let imagesAttached = 0;
  let imagesOk = g === 0;

  if (g > 0) {
    if (input.order === 'ok') {
      imagesAttached = Math.max(input.processCount, input.liveCount, input.sigCount, g);
      imagesOk = true;
    } else {
      imagesAttached = Math.max(input.processCount, input.liveCount);
      imagesOk = imagesAttached >= g;
    }
  }

  const pass = input.textOk && imagesOk && input.order !== 'mismatch';

  const issues: string[] = [];
  if (!input.textOk) issues.push(ATTACH_PRECHECK_TEXT.textMissing);
  if (g > 0 && !imagesOk) {
    issues.push(ATTACH_PRECHECK_TEXT.imagesMissing(imagesAttached, g));
  }
  if (input.order === 'mismatch') issues.push(ATTACH_PRECHECK_TEXT.orderMismatch);

  return {
    pass,
    text: input.textOk,
    imagesExpected: g,
    imagesAttached,
    imagesOk,
    order: input.order,
    issues: issues.join('；'),
  };
}

/**
 * 诊断串（原 `:1228` 的 `W`）—— 只在**有图**时给出（源 `G > 0 ? … : ''`）
 *
 * ⚠️ 源的 `ie` 是 `cD` 的**整份回执**（探不到 ⇒ `null`）⇒ 这里的可选入参同义。
 */
export function attachPrecheckDiag(
  expected: number,
  probe: {
    inputTag?: unknown;
    inputArea?: unknown;
    edCount?: unknown;
  } | null,
  liveCount: number,
  processCount: number,
  sigCount: number,
): string {
  if (expected <= 0) return '';
  const tag = typeof probe?.inputTag === 'string' && probe.inputTag ? probe.inputTag : '未找到';
  return `锚定输入框=${tag}(area=${probe?.inputArea ?? '?'} 候选编辑器=${probe?.edCount ?? '?'}) liveDomCount=${liveCount} 过程计数=${processCount} 指纹=${sigCount}`;
}

/** 拼接 `precheckIssue`（原 `:1304` 的三目链：有明细 + 有诊断 ⇒ `明细｜诊断: 诊断`） */
export function attachPrecheckIssue(issues: string, diag: string): string | null {
  if (issues && diag) return `${issues}｜${ATTACH_PRECHECK_TEXT.diagPrefix}${diag}`;
  if (issues) return issues;
  if (diag) return `${ATTACH_PRECHECK_TEXT.diagPrefix}${diag}`;
  return null;
}
