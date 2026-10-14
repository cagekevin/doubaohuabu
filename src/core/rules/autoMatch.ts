/**
 * 「自动匹配」—— 把**资源库素材名**与正文比对，命中后追加 `@[id|名]` 引用（原 `Jh`）
 *
 * 依据（**逐行回源抄录**）：`shared.js:24205-24394`
 *   | 件 | 源 | 行 | 语义 |
 *   | - | - | - | - |
 *   | `Xh` / `kr` | 常量 | 24205-24206 | 引用标签字面量 `参考图` 与其长度 |
 *   | `Oc` | `isBlank` | 24207-24209 | 空白判定（见下 ⚠️） |
 *   | `pk` | `STOP_CHARS` | 24210-24211 | **终止符**（句读 / 换行） |
 *   | `s$` | `scanBackward` | 24212-24236 | 从匹配点**往前**找 `参考图` |
 *   | `o$` | `scanForward` | 24237-24261 | 从匹配点**往后**找 `参考图` |
 *   | `hk` | `refSpan` | 24262-24279 | 合成引用应覆盖的 `[start, end)` |
 *   | `Jh` | `autoMatchText` | 24280-24394 | 主流程 |
 *
 * ⚠️ **源的 `Oc` 第 5 个分支是 `e === ''`（恒假）** —— 看着像 `'\n'` 被抽取时吃掉
 *    （同文件的 `pk` 里 `'\n'` 是以**真换行**形式保留的，而这里没有）⇒ 本实现**不把 `\n` 算空白**
 *    （与源**实际行为**一致），但**不落**那个恒假分支（死代码）。
 *
 * 归属：纯字符串处理（无 `window` / 时间 / 随机）⇒ `core`（原则 4）。
 * ⚠️ 消费者**两处**（判据 C1 的正例）：文本框 `auto-match-btn`（`CL.jsx:243-264`）与
 *    生成面板 `gp-automatch-btn`（`Z3_1.jsx:630-674`）—— 源就是同一个 `Jh`。
 */

/** 引用标签（原 `Xh`，`shared.js:24205`）—— 与 `refs.ts` 的 `参考图N` 同源 */
// ★ **2026-10-12 越权修正**：本文件原自造 `REF_LITERAL_RE = /@\[[^\]|]*\|[^\]]*\]/g`
//   （**宽松**形态：允许残缺芯片）—— 现委托 `refs.createRefLooseRe()`（源头已补齐形态）。
//   ⚠️ 宽松**不是笔误**：本文件的用途是"避开正文里**已有的**芯片字面量"，残缺的也算已有
//      （源 `Jh` 的 `o` 就是宽松版）；换严格版会漏掉残缺的、于是**重复插一条**。
import { createRefLooseRe, REFERENCE_LABEL } from './refs';

/**
 * 本文件要**往前/往后扫**的那个词 = `refs.ts` 的**同一个词**（唯一词源）。
 *
 * ⚠️ 它**必须**与 `formatReferenceLabel` 逐字相同 —— 否则"用户/我们写出去的 `参考图N`，
 *   自动匹配认不出来"（同一 token 两处各写一份 = 迟早漂）。故不再本文件自写字面量。
 */
const REF_LEN = REFERENCE_LABEL.length;

/**
 * 空白判定（原 `Oc`，`shared.js:24207-24209`）
 * ⚠️ 逐字只有这 4 个 + 一个**恒假**的 `=== ''`（见文件头）⇒ 这里不把 `\n` 算空白。
 */
const isBlank = (ch: string | undefined): boolean =>
  ch === ' ' || ch === '\t' || ch === '\xA0' || ch === '\f';

/** 终止符（原 `pk`，`shared.js:24210-24211`）—— 撞到它就不再跨过去找 `参考图` */
const STOP_CHARS = new Set([
  '，', '；', '。', '、', '！', '？', ',', ';', '.', '!', '?', ':', '：', '\n', '\r',
]);

/** 可匹配的素材（原 `Jh` 的 `n`：`{id, name}` 且 `name.trim()` 非空） */
export interface AutoMatchMaterial {
  id?: string;
  name?: string;
}

/** `[start, end)` 区间 */
type Range = [number, number];

/**
 * 从 `t` **往前**找 `参考图`（原 `s$`，`24212-24236`）
 *
 * 先跳过空白；不足 `参考图` 长 ⇒ `-1`。然后**可连读**（`参考图1参考图2` 会一路往左吃），
 * 每次吃到一个就把指针再往前挪 `REF_LEN` 并跳空白；**撞终止符 ⇒ `-1`**（中间夹了句读就不算同一处引用）。
 *
 * @returns 最左那个 `参考图` 的**起始下标**；没有 ⇒ `-1`
 */
function scanBackward(text: string, t: number): number {
  let n = t - 1;
  while (n >= 0 && isBlank(text[n])) n--;
  if (n < REF_LEN - 1) return -1;
  let found = -1;
  while (n >= REF_LEN - 1) {
    if (text.slice(n - REF_LEN + 1, n + 1) === REFERENCE_LABEL) {
      found = n - REF_LEN + 1;
      n -= REF_LEN;
      while (n >= 0 && isBlank(text[n])) n--;
      continue;
    }
    if (STOP_CHARS.has(text[n] ?? '')) return -1;
    break;
  }
  return found;
}

/**
 * 从 `t` **往后**找 `参考图`（原 `o$`，`24237-24261`）
 *
 * 与 `scanBackward` 对称；`@returns` 最右那个 `参考图` 的**结束下标**（不含）；没有 ⇒ `-1`
 */
function scanForward(text: string, t: number): number {
  let n = t;
  while (n < text.length && isBlank(text[n])) n++;
  if (n > text.length - REF_LEN) return -1;
  let found = -1;
  while (n <= text.length - REF_LEN) {
    if (text.slice(n, n + REF_LEN) === REFERENCE_LABEL) {
      found = n + REF_LEN;
      n += REF_LEN;
      while (n < text.length && isBlank(text[n])) n++;
      continue;
    }
    if (STOP_CHARS.has(text[n] ?? '')) return -1;
    break;
  }
  return found;
}

/**
 * 素材名命中后，**引用应覆盖哪一段**（原 `hk`，`24262-24279`）
 *
 * 先试着往**左**扩（`参考图2 小红` 这种「标签在前」）⇒ 命中即 `{start: 左, end: 原 end}`；
 * 否则再往**右**扩（`小红 参考图2` 这种「标签在后」）⇒ `{start: 原 start, end: 右}`；
 * 两边都没有 ⇒ `null`（调用方改用「在名字后插入引用」那条路）。
 */
export function refSpan(text: string, start: number, end: number): { start: number; end: number } | null {
  const left = scanBackward(text, start);
  if (left !== -1) return { start: left, end };
  const right = scanForward(text, end);
  if (right !== -1) return { start, end: right };
  return null;
}

/** 正文里已有的 `@[id|名]` 字面量（原 `Jh` 的 `o`）—— 见文件头的委托说明 */

/** HTML 标签（原 `Jh` 的 `a()` 里的 `/<[^>]*>/g`）—— 这些区间**不许**被替换 */
const HTML_TAG_RE = /<[^>]*>/g;

/** 一条待应用的替换（原 `Jh` 的 `l` 元素） */
interface Edit {
  start: number;
  end: number;
  replacement: string;
}

/**
 * 把资源库素材名与正文比对，命中后追加 `@[id|名]` 引用（原 `Jh`，`shared.js:24280-24394`）
 *
 * 匹配规则（**顺序即语义**）：
 *   1. 素材先按**名字长度降序**（长的先匹配，避免短名抢走长名的一段）
 *   2. 每个素材有两个候选词：**全名** 与 **只留字母数字的变体**（长度 ≥ 2 才加）
 *   3. 命中位置若落在**已有引用 / HTML 标签**区间内 ⇒ 跳过（用 `indexOf` 继续找下一个）
 *   4. 命中后优先**吸收相邻的 `参考图`**（左或右）作为替换范围；
 *      否则**只在名字之后插入**一条引用（每个素材**最多插一条**）
 *   5. 每个素材只要**命中过一次**就换下一个素材（`if (w) break`）
 *   6. 最后按 `start` **降序**应用替换（从后往前，避免下标漂移）
 *
 * @returns 新正文；**无变化时返回原字符串**（调用方据此判「无匹配」）
 */
export function autoMatchText(text: string, library: readonly AutoMatchMaterial[]): string {
  if (!text) return text;
  const materials = (library || []).filter((d) => d && d.id && d.name && d.name.trim());
  if (materials.length === 0) return text;

  const sorted = [...materials].sort((a, b) => (b.name ?? '').length - (a.name ?? '').length);
  /** 某下标是否落在**已占用**区间内（原 `s`） */
  const occupied = (ranges: readonly Range[], at: number): boolean =>
    ranges.some(([from, to]) => at >= from && at < to);

  /** 正文里已存在的引用字面量（原 `o`） */
  const seen = new Set<string>();
  for (const hit of text.matchAll(createRefLooseRe())) seen.add(hit[0]);

  /** 不可替换区间 = 已有引用 + HTML 标签（原 `a()`） */
  const collectRanges = (): Range[] => {
    const ranges: Range[] = [];
    for (const hit of text.matchAll(createRefLooseRe())) {
      ranges.push([hit.index, hit.index + hit[0].length]);
    }
    for (const hit of text.matchAll(HTML_TAG_RE)) {
      ranges.push([hit.index, hit.index + hit[0].length]);
    }
    return ranges;
  };

  const edits: Edit[] = [];
  let ranges = collectRanges();

  for (const material of sorted) {
    const name = (material.name ?? '').trim();
    // 名字里含 `]` / `|` 会破坏 `@[id|名]` 协议 ⇒ 不参与（原 `if (f.includes(']') || f.includes('|')) continue`）
    if (name.includes(']') || name.includes('|')) continue;
    const literal = `@[${material.id}|${name}]`;
    if (seen.has(literal)) continue;

    /** 候选词：全名 + 字母数字变体（长度 ≥ 2 才加） */
    const candidates = [name];
    const alnum = name.replace(/[^A-Za-z0-9]/g, '');
    if (alnum.length >= 2) candidates.push(alnum);

    let matched = false;
    for (const word of candidates) {
      let cursor = 0;
      let insertedAfter = false;
      for (;;) {
        let at = text.indexOf(word, cursor);
        // 跳过落在「已有引用 / HTML 标签」里的命中
        while (at !== -1) {
          const stop = at + word.length;
          if (!occupied(ranges, at) && !occupied(ranges, stop - 1)) break;
          at = text.indexOf(word, at + 1);
        }
        if (at === -1) break;

        const span = refSpan(text, at, at + word.length);
        if (span) {
          const replacement = seen.has(literal) ? '' : literal;
          edits.push({ start: span.start, end: span.end, replacement });
          ranges = ranges.concat([[span.start, span.end]]);
          if (replacement) seen.add(literal);
          matched = true;
        } else if (!insertedAfter && !seen.has(literal)) {
          const stop = at + word.length;
          edits.push({ start: stop, end: stop, replacement: literal });
          ranges = ranges.concat([[at, stop]]);
          seen.add(literal);
          insertedAfter = true;
          matched = true;
        }
        cursor = at + 1;
      }
      if (matched) break;
    }
  }

  if (edits.length === 0) return text;
  edits.sort((a, b) => b.start - a.start);
  let out = text;
  for (const edit of edits) {
    out = out.slice(0, edit.start) + edit.replacement + out.slice(edit.end);
  }
  return out;
}
