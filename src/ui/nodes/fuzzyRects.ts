/**
 * 「模糊匹配」正文高亮的**几何量算**（原 `d$` / `f$` / `p$` + `CL.jsx:296-319` 的缩放归一）
 *
 * 依据（**逐行回源**，`shared.js`）：
 *   | 件 | 原 | 行 | 语义 |
 *   | - | - | - | - |
 *   | `rangesForRawOffsets` | `d$` | 24714-24802 | **原始正文下标** `[start,end)` → 编辑器里的 `Range[]` |
 *   | `rectsForRanges` | `f$` | 24803-24829 | `Range[]` → **相对编辑器左上角**的矩形 |
 *   | `rectsForText` | `p$` | 24830-24873 | 找不到偏移量时的**回退**：按**文本**找矩形 |
 *   | `zoomScaleOf` | `CL.jsx:298-299` | — | `rect.width / offsetWidth` = 画布缩放（ReactFlow `transform: scale`） |
 *
 * ★ **两条坐标空间怎么对齐的**（`d$` 的关键，别改）：编辑器里药丸渲染成 `@图N`（比 `@[id|名]` 短），
 *   所以量算时**不数 DOM 的字符**，而是——碰到药丸就回原始正文取出那段 `@[…]` 的**原始长度**来累加。
 *   这样 DOM 累加位置与**原始正文下标**落在同一个空间里，`mk` 的 `rawToVis` 才有意义。
 *
 * ⚠️ **为什么住 `ui/` 而不是 `lib/`**：它要 `mk`（`core/rules/fuzzyMatch`），而 `lib` 是最底层
 *   （`.dependency-cruiser.cjs`：`lib / constants / styles 不得依赖任何上层`）⇒ 只能住 `ui`。
 * ⚠️ 不可单测（要真 DOM / 真布局）—— 与 `lib/readDroppedFile.ts`、`lib/videoPoster.ts` 同法，
 *   故**不进单测**：纯逻辑那一半（`mk` / `l$`）已经被 `fuzzyMatch.test.ts` 钉住了。
 */

import { visibleMap } from '@/core/rules/fuzzyMatch';

/** 相对**编辑器左上角**的一个矩形（原 `f$` 的返回元素） */
export interface FuzzyRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** 药丸的两个类名（原 `d$`/`p$` 的 `ref-chip` / `ref-missing`，与 `richText.ts` 同源） */
const CHIP_CLASSES = ['ref-chip', 'ref-missing'];

/** DOM 走位时记下的一段（原 `d$` 的 `s` 元素） */
type Segment = { kind: 'text'; node: Text; start: number; len: number } | { kind: 'br' } | { kind: 'chip' };

/**
 * 原始正文里紧贴某下标的 `@[...]` 字面量（原 `d$:24749` 的 `t.slice(m).match(/^@\[[^\]]*\]/)`）
 *
 * ⚠️ **2026-10-12 越权修正**：原在此**自造**该正则 —— 现委托 canonical
 *   `core/rules/refs.createRefSpanFromStartRe()`（源头已补齐这一形态：
 *   **从串首锚定、允许空内容、无 `$` 锚** —— 因为用法是在 `rawText.slice(raw)` 的尾巴上取紧贴的那枚）。
 */
import { createRefSpanFromStartRe } from '@/core/rules/refs';

/**
 * 建**段落表**（原 `d$` 的第一个 `while`/递归，`24726-24761`）
 *
 * 累加位置 `o` **不数 DOM 字符**：文本节点按自身长度、`<br>` 记 1、**药丸按原始 `@[…]` 的长度**
 * （见文件头 ★）。
 */
function collectSegments(root: HTMLElement, rawText: string, visToRaw: readonly number[]): Segment[] {
  const segments: Segment[] = [];
  let at = 0;

  const walk = (node: Element | Document): void => {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === 3) {
        const text = child as Text;
        const len = text.textContent?.length ?? 0;
        if (len > 0) {
          segments.push({ kind: 'text', node: text, start: at, len });
          at += len;
        }
        continue;
      }
      if (child.nodeType !== 1) continue;
      const el = child as HTMLElement;
      if (el.tagName.toLowerCase() === 'br') {
        segments.push({ kind: 'br' });
        at += 1;
        continue;
      }
      if (CHIP_CLASSES.some((c) => el.classList.contains(c))) {
        const raw = visToRaw[at];
        const literal =
          raw !== undefined && raw >= 0
            ? rawText.slice(raw).match(createRefSpanFromStartRe())
            : null;
        const len = literal ? literal[0].length : 0;
        segments.push({ kind: 'chip' });
        at += len;
        continue;
      }
      walk(el);
    }
  };

  walk(root);
  return segments;
}

/** 原始下标 → `{ 文本节点, 节点内偏移 }`（原 `d$` 的 `l`，`24767-24777`） */
function locate(segments: readonly Segment[], rawAt: number): { node: Text; offset: number } | null {
  for (const seg of segments) {
    if (seg.kind === 'text' && rawAt >= seg.start && rawAt <= seg.start + seg.len) {
      return { node: seg.node, offset: rawAt - seg.start };
    }
  }
  return null;
}

/**
 * `[start, end)`（**原始正文下标**）→ 编辑器里的 `Range[]`（原 `d$`，`24714-24802`）
 *
 * ⚠️ 与源一致：每个下标先过 `rawToVis`（`-1` = 落在 HTML 标签里 ⇒ **跳过该区间**）；
 *    `start`/`end` 映射到同一段文本节点才有 Range（跨段就落空 —— 由调用方走 `rectsForText` 回退）。
 */
export function rangesForRawOffsets(
  root: HTMLElement,
  rawText: string,
  ranges: ReadonlyArray<readonly [number, number]>,
): Range[] {
  if (!root || !rawText || ranges.length === 0) return [];
  // ⚠️ **不包 `try/catch`**（`TD-16-105`）：`visibleMap` 是**纯字符串函数**
  //   （`core/rules/fuzzyMatch.ts` 全文 **0 处 `throw`**），入参又由 `rawText: string`
  //   ＋ 上方空值守卫保证 ⇒ 那个 catch **恒不触发**（死分支 = 假护栏）。
  //   源 `d$` 包它是因为**源是 JS 无类型**（防 `mk` 收到非 string）—— 那个"用户"在本仓不存在
  //   （铁律 2：不为不存在的用户写代码）。
  const map = visibleMap(rawText);
  const segments = collectSegments(root, rawText, map.visToRaw);
  const out: Range[] = [];
  for (const [start, end] of ranges) {
    const from = map.rawToVis[start] !== undefined && map.rawToVis[start] !== -1 ? (map.rawToVis[start] as number) : -1;
    const to = map.rawToVis[end] !== undefined && map.rawToVis[end] !== -1 ? (map.rawToVis[end] as number) : -1;
    if (from < 0 || to < 0 || from > to) continue;
    const a = locate(segments, from);
    const b = locate(segments, to);
    if (!a || !b) continue;
    try {
      const range = document.createRange();
      range.setStart(a.node, a.offset);
      range.setEnd(b.node, b.offset);
      out.push(range);
    } catch {
      continue;
    }
  }
  return out;
}

/** `Range[]` → **相对编辑器左上角**的矩形（原 `f$`，`24803-24829`） */
export function rectsForRanges(
  root: HTMLElement,
  rawText: string,
  ranges: ReadonlyArray<readonly [number, number]>,
): FuzzyRect[] {
  const found = rangesForRawOffsets(root, rawText, ranges);
  if (!found.length) return [];
  const base = root.getBoundingClientRect();
  const out: FuzzyRect[] = [];
  for (const range of found) {
    let rects: DOMRectList;
    try {
      rects = range.getClientRects();
    } catch {
      // catch-ok: 逐字对源（源 `f$` 24812-24816 同形）—— 游离 / 已脱离文档的 Range 会让
      //   `getClientRects` 抛；跳过这一个 range，失败**天然可见**（不高亮）。
      continue;
    }
    for (const r of Array.from(rects)) {
      if (r.width !== 0 || r.height !== 0) {
        out.push({ left: r.left - base.left, top: r.top - base.top, width: r.width, height: r.height });
      }
    }
  }
  return out;
}

/**
 * 按**文本**找矩形（原 `p$`，`24830-24873`）—— 偏移量那条路落空时的回退
 *
 * ⚠️ 与源一致的两点：① **跳过药丸内部**的命中（祖先链上碰到 `ref-chip`/`ref-missing` 就不算）；
 *    ② 同一个文本节点里**所有**出现都收（`indexOf` 循环）。
 */
export function rectsForText(root: HTMLElement, needle: string): FuzzyRect[] {
  if (!root || !needle) return [];
  const base = root.getBoundingClientRect();
  const out: FuzzyRect[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    const text = (node as Text).textContent ?? '';
    let at = text.indexOf(needle);
    while (at !== -1) {
      let el: HTMLElement | null = (node as Text).parentElement;
      let insideChip = false;
      while (el && el !== root) {
        if (CHIP_CLASSES.some((c) => el?.classList.contains(c))) {
          insideChip = true;
          break;
        }
        el = el.parentElement;
      }
      if (!insideChip) {
        try {
          const range = document.createRange();
          range.setStart(node, at);
          range.setEnd(node, at + needle.length);
          for (const r of Array.from(range.getClientRects())) {
            if (r.width !== 0 || r.height !== 0) {
              out.push({ left: r.left - base.left, top: r.top - base.top, width: r.width, height: r.height });
            }
          }
        } catch {
          // catch-ok: 只为量高亮 —— 命中文本横跨多个 DOM 节点时 `setEnd` 会抛，
          //   源 `24867` 也是空 `catch {}` 跳过这一处；失败**天然可见**（那一处不高亮）。
        }
      }
      at = text.indexOf(needle, at + needle.length);
    }
    node = walker.nextNode();
  }
  return out;
}

/**
 * 画布缩放因子（原 `CL.jsx:298-299` 的 `Se`）
 *
 * `rect.width / offsetWidth` —— ReactFlow 用 `transform: scale(z)` 缩放整张画布，
 * `getClientRects()` 拿到的是**屏幕**尺寸 ⇒ 要除回**未缩放**的 CSS px 才能当 `left/top` 用。
 * ⚠️ `offsetWidth` 为 0（未布局）⇒ 回 `1`（源同）。
 */
export function zoomScaleOf(el: HTMLElement): number {
  const rect = el.getBoundingClientRect();
  if (el.offsetWidth <= 0) return 1;
  const scale = rect.width / el.offsetWidth;
  return scale > 0 ? scale : 1;
}

/**
 * 当前这处匹配的矩形（原 `CL.jsx:300-303` 的两条路）
 *
 * 先按**原始下标**量（`rectsForRanges`），落空且拿到 `matchText` ⇒ 回退按**文本**找（`rectsForText`）。
 */
export function rectsForMatch(
  root: HTMLElement,
  rawText: string,
  match: { start: number; end: number; matchText?: string },
): FuzzyRect[] {
  const direct = rectsForRanges(root, rawText, [[match.start, match.end]]);
  if (direct.length > 0 || !match.matchText) return direct;
  return rectsForText(root, match.matchText);
}
