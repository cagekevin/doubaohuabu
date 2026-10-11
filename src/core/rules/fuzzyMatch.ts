/**
 * 「模糊匹配待确认项」—— ★ 纯规则（原 `a$` / `mk` / `u$` / `l$` / `c$`）
 *
 * 依据（**逐行回源抄录**，全在 `docs/豆包画布原版参考/expanded_components/shared.js`）：
 *   | 件 | 原 | 行 | 语义 |
 *   | - | - | - | - |
 *   | `ENTITIES` | `My` | 24615-24625 | 具名实体表（9 条） |
 *   | `decodeEntityAt` | `u$` | 24626-24660 | 解一个实体（具名 / 十进制 / 十六进制） |
 *   | `visibleMap` | `mk` | 24661-24713 | HTML+实体 → **可见文本** + `rawToVis` / `visToRaw` 双向下标表 |
 *   | `commonSubstring` | `a$` | 24395-24437 | **最长公共子串**（DP；名字截 200、正文截 4000） |
 *   | `fuzzyCandidates` | `l$` | 24446-24587 | 候选：**先按分词命中**，否则**最长公共子串**（带四个门槛） |
 *   | `groupCandidates` | `c$` | 24588-24614 | 按 `start` **同起点归组** ⇒ 导航的单位是「位置」而不是「素材」 |
 *
 * 用途（消费者：`ui/nodes/TextNode` 的「模糊匹配待确认」面板）：
 *   自动匹配（`autoMatchText`）只会吃掉**能确定**的引用；剩下的**部分重叠**（`大致匹配`）
 *   不能替用户做主 ⇒ 列成候选让人确认 / 忽略（原 `CL.jsx:819-890`）。
 *
 * ⚠️ 与源的两处**有意偏离**（都已注明在各函数上）：
 *   ① 分词集合里那个 `''` 元素（源 `24468`）**永不匹配** ⇒ 不落（同 `Oc` 恒假分支的先例）；
 *   ② 下标一律按**可见文本**算（`visStart/visEnd`），出口再经 `visToRaw` 映射回**原始下标**
 *      —— 源就是这么做的（`p()`），本实现照抄。
 */

import { refSpan, type AutoMatchMaterial } from './autoMatch';
import { createRefLooseRe } from './refs';

// ─────────────────────────── 实体解码（原 `My` / `u$`）───────────────────────────

/** 具名 / 数字实体表（原 `My`，`24615-24625`）—— **逐字**，含 3 个单引号的不同写法 */
const ENTITIES: Record<string, string> = {
  '&nbsp;': '\u00A0',
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&apos;': "'",
  '&#39;': "'",
  '&#x27;': "'",
  '&#160;': '\u00A0',
};

/**
 * 解一个实体（原 `u$`，`24626-24660`）
 *
 * 源：`text[at]` 不是 `&` ⇒ `null`；找不到 `;` 或**跨度 > 10** ⇒ `null`；
 * 命中表 ⇒ 该字符；`&#\d+;` / `#[xX][0-9a-fA-F]+;` ⇒ `fromCodePoint`（**码点须在 `(0, 1114112)`**）；
 * 其余 ⇒ `null`。
 */
export function decodeEntityAt(text: string, at: number): { ch: string; len: number } | null {
  if (text[at] !== '&') return null;
  const end = text.indexOf(';', at);
  // ⚠️ `n - t > 10` ⇒ 放弃（源把上限写成"离 `&` 不超过 10 个字符"）
  if (end === -1 || end - at > 10) return null;
  const token = text.slice(at, end + 1);
  if (Object.prototype.hasOwnProperty.call(ENTITIES, token)) {
    return { ch: ENTITIES[token] as string, len: token.length };
  }
  if (/^&#\d+;$/.test(token)) {
    /**
     * ★ **有意偏离源**（登记 `TD-03-16`）：源写的是 `r.slice(3, -1)` —— 那是**十六进制分支**
     * 该用的偏移（`&#x` 三字符前缀），被误用到了十进制分支（`&#` 只有两字符）⇒
     * `&#65;` 会解成 `String.fromCodePoint(5)` = **U+0005**（错字）。
     * 本仓按**协议本义**取 `slice(2, -1)`，与本仓既有的 `stripHtml`（原 `In`，同样解 `&#\d+;`）
     * **一致** —— 同一协议两处解出不同字符才是真问题。
     */
    const code = parseInt(token.slice(2, -1), 10);
    if (code > 0 && code < 1114112) return { ch: String.fromCodePoint(code), len: token.length };
  }
  if (/^&#[xX][0-9a-fA-F]+;$/.test(token)) {
    /**
     * ★ **有意偏离源**（同 `TD-03-16`）：源的正则是 `/^#[xX][0-9a-fA-F]+;$/` —— **少了 `&`**
     *   ⇒ 而 `token` 一定以 `&` 开头 ⇒ 这个分支**永不执行**（表外十六进制实体如 `&#x4E2D;` 永远解不出来）。
     *   本仓按协议本义补回 `&`。
     */
    const code = parseInt(token.slice(3, -1), 16);
    if (code > 0 && code < 1114112) return { ch: String.fromCodePoint(code), len: token.length };
  }
  return null;
}

// ─────────────────────────── 可见文本映射（原 `mk`）───────────────────────────

/** `visibleMap` 的返回（原 `mk` 的三个字段，逐字同名） */
export interface VisibleMap {
  /** 去掉 HTML 标签、解掉实体后的**可见文本** */
  visibleText: string;
  /**
   * 原始下标 → 可见下标。
   * ⚠️ 与源一致：**被吃掉的原始字符是 `-1`**（标签内部），末尾额外补一格 = 可见长度。
   */
  rawToVis: number[];
  /** 可见下标 → 原始下标（逐可见字符一格） */
  visToRaw: number[];
}

/**
 * HTML + 实体 → 可见文本 + 双向下标表（原 `mk`，`24661-24713`）
 *
 * 规则（**逐行对齐**）：
 *   · `<br ...>`（正则 `/^<br\s*\/?>$/i`）⇒ 产出一个 `\n`；**其它标签整段吃掉**（`rawToVis` 全部置 `-1`）
 *   · `<` 后面**没有** `>` ⇒ **当普通字符**收下（源 `indexOf('>') === -1` 那支）
 *   · `&...;` 能解 ⇒ 收一个字符（该段的 `rawToVis` 置 `-1`，但**首字符那格**指向新收的字符）
 *   · 其余字符原样收下
 *   · 收尾 `rawToVis[text.length] = 可见长度`（源 `24707`）
 */
export function visibleMap(text: string): VisibleMap {
  const rawToVis = new Array<number>(text.length + 1).fill(-1);
  const visToRaw: number[] = [];
  let visible = '';
  let at = 0;

  while (at < text.length) {
    rawToVis[at] = visible.length;
    if (text[at] === '<') {
      const close = text.indexOf('>', at);
      if (close === -1) {
        visible += text[at];
        visToRaw.push(at);
        at += 1;
        continue;
      }
      const tag = text.slice(at, close + 1);
      if (/^<br\s*\/?>$/i.test(tag)) {
        visible += '\n';
        visToRaw.push(at);
      }
      for (let i = at; i <= close; i += 1) rawToVis[i] = -1;
      at = close + 1;
    } else if (text[at] === '&') {
      const ent = decodeEntityAt(text, at);
      if (ent) {
        visible += ent.ch;
        visToRaw.push(at);
        for (let i = at; i < at + ent.len; i += 1) rawToVis[i] = -1;
        rawToVis[at] = visible.length - 1;
        at += ent.len;
      } else {
        visible += text[at];
        visToRaw.push(at);
        at += 1;
      }
    } else {
      visible += text[at];
      visToRaw.push(at);
      at += 1;
    }
  }
  rawToVis[text.length] = visible.length;
  return { visibleText: visible, rawToVis, visToRaw };
}

// ─────────────────────────── 最长公共子串（原 `a$`）───────────────────────────

/** `commonSubstring` 的返回（原 `a$`，逐字同名） */
export interface CommonSubstring {
  /** 公共子串本体（没有 ⇒ 空串） */
  str: string;
  /** 它在**第二参**里的首次下标（没有 ⇒ `-1`） */
  indexInB: number;
}

/** 名字侧截断（原 `24404` 的 `slice(0, 200)`） */
const A_MAX = 200;
/** 正文侧截断（原 `24405` 的 `slice(0, 4000)`） */
const B_MAX = 4000;

/**
 * 最长公共子串（原 `a$`，`24395-24437`）
 *
 * 经典 DP（`l[p]` = 以 `a[p-1]` 结尾的公共后缀长），O(len(a) × len(b))：
 *   · `a` 截 **200**、`b` 截 **4000**（源的两个魔法数 —— 防大文本 O(n²) 爆掉）
 *   · 记录**最大长度 `o`** 与它当时的**结束位置 `a`** ⇒ 子串 = `a.slice(a - o, a)`
 *   · `indexInB` 用 `b.indexOf(str)`（**首次**出现）
 * ⚠️ 空参 ⇒ `{str:'', indexInB:-1}`（源第一句）。
 */
export function commonSubstring(a: string, b: string): CommonSubstring {
  if (!a || !b) return { str: '', indexInB: -1 };
  const first = a.slice(0, A_MAX);
  const second = b.slice(0, B_MAX);
  let best = 0;
  let bestEnd = 0;
  const row = new Array<number>(first.length + 1).fill(0);

  for (let i = 1; i <= second.length; i += 1) {
    let carry = 0;
    for (let j = 1; j <= first.length; j += 1) {
      const prev = row[j] as number;
      if (first[j - 1] === second[i - 1]) {
        row[j] = carry + 1;
        if ((row[j] as number) > best) {
          best = row[j] as number;
          bestEnd = j;
        }
      } else {
        row[j] = 0;
      }
      carry = prev;
    }
  }
  if (best === 0) return { str: '', indexInB: -1 };
  const str = first.slice(bestEnd - best, bestEnd);
  return { str, indexInB: second.indexOf(str) };
}

// ─────────────────────────── 候选（原 `l$`）───────────────────────────

/** 候选素材的最小形状（原 `l$` 只读这四项） */
export interface FuzzyLibraryItem extends AutoMatchMaterial {
  dataUrl?: string;
}

/** 一条候选（原 `l$` 推进 `h` 的那个对象 —— 字段名逐字） */
export interface FuzzyCandidate {
  id: string;
  name: string;
  dataUrl: string;
  /** 命中的那段**可见文本**（也是用户在界面里看到的那段） */
  keyword: string;
  /** 与 `keyword` 同值（源 `matchText: k`） */
  matchText: string;
  /** `true` = 走的是「最长公共子串」这条路（界面文案「大致匹配」） */
  fuzzy: boolean;
  /** 该段在**原始正文**里的起点 */
  start: number;
  /** 该段在**原始正文**里的终点（不含） */
  end: number;
  /** 命中段在**素材名**里的起点（给 `<mark>` 用） */
  nameStart: number;
  /** 命中段在**素材名**里的终点（不含） */
  nameEnd: number;
  /** 去重键（源 `` `${id}::${keyword.toLowerCase()}` ``）—— 「忽略」按它记账 */
  key: string;
}

/**
 * 正文里已有的引用字面量（原 `l$` 的 `r` / `d` 两处都用它）
 *
 * ⚠️ **2026-10-12 越权修正**：原在此**自造**一份（与 `autoMatch` 那份同一个形态、同一个源出处）
 *   —— 现委托 canonical `refs.createRefLooseRe()`（**宽松**：残缺芯片也算"已有"，见该工厂注释）。
 */
const refLiteralRe = createRefLooseRe;

/**
 * 分词用的**分隔符**集合（原 `24467-24468`）
 * ⚠️ 源那行里还有一个 `''` 元素 —— **单字符比较永不命中** ⇒ 不落（同 `Oc` 恒假分支的先例）。
 */
const SEPARATORS = new Set([' ', '\t', '\n', '\r', '\f', '\u00A0', ',', '，', '、', ';', '；', '。']);

/** 最短可用的词（原 `w.length >= 2`） */
const MIN_TOKEN = 2;

/** 候选上限（原 `h.slice(0, 30)`） */
const MAX_CANDIDATES = 30;

/**
 * 找**部分重叠**的候选（原 `l$`，`24446-24587`）
 *
 * 两条路（**顺序即语义**）：
 *   ① **分词命中**：把正文按分隔符切词（词长 ≥ 2、按小写去重），取「素材名（小写）**包含**的最长那个词」
 *      ⇒ `fuzzy = false`（界面「关键词命中」）
 *   ② 否则 **最长公共子串**（`commonSubstring(名小写, 正文小写)`），但**四道门槛**全过才算：
 *      `str` 非空 · `indexInB >= 0` · 首尾**都不落在已有引用里** · 长度 ≥ 2 且 ≥ `ceil(名长 × 0.5)`
 *      · 且该子串在名里也找得到（`nameStart >= 0`）⇒ `fuzzy = true`（界面「大致匹配」）
 *   最后按 `start` 升序、**截前 30 条**。
 *
 * ⚠️ 跳过条件（源 `24532`）：素材名含 `]` / `|`（会破坏 `@[id|名]` 协议）或该素材**已引用**。
 */
export function fuzzyCandidates(
  text: string,
  library: readonly FuzzyLibraryItem[] | null | undefined,
): FuzzyCandidate[] {
  if (!text) return [];
  const materials = (library ?? []).filter((m) => m && m.id && m.name && m.name.trim());
  if (!materials.length) return [];

  /** 正文里**已有**的引用字面量（原 `r`） */
  const existing = new Set<string>();
  for (const hit of text.matchAll(refLiteralRe())) existing.add(hit[0]);

  const { visibleText, visToRaw } = visibleMap(text);
  const lower = visibleText.toLowerCase();

  /** 分词：连续的「非分隔符」即一个词（原 `c`） */
  const tokens: Array<{ kwLower: string; visStart: number; visEnd: number }> = [];
  let cursor = 0;
  while (cursor < visibleText.length) {
    if (SEPARATORS.has(visibleText[cursor] as string)) {
      cursor += 1;
      continue;
    }
    let end = cursor;
    while (end < visibleText.length && !SEPARATORS.has(visibleText[end] as string)) end += 1;
    const kwLower = lower.slice(cursor, end);
    if (kwLower.length >= MIN_TOKEN && !tokens.some((t) => t.kwLower === kwLower)) {
      tokens.push({ kwLower, visStart: cursor, visEnd: end });
    }
    cursor = end;
  }

  /** **可见**坐标下、已有引用的区间（原 `d`）—— 用于「不许落在引用里」那两条门槛 */
  const refRanges: Array<[number, number]> = [];
  for (const hit of visibleText.matchAll(refLiteralRe())) {
    refRanges.push([hit.index, hit.index + hit[0].length]);
  }
  const inRef = (visAt: number): boolean => refRanges.some(([from, to]) => visAt >= from && visAt < to);

  /** 可见区间 → **原始**区间（原 `p`）—— 映射不上 ⇒ `null`（调用方跳过该候选） */
  const toRawRange = (visStart: number, visEnd: number): { start: number; end: number } | null => {
    if (visEnd <= visStart) return null;
    const from = visToRaw[visStart];
    const last = visToRaw[visEnd - 1];
    if (from === undefined || last === undefined) return null;
    let end: number | undefined;
    if (visEnd < visToRaw.length) {
      const next = visToRaw[visEnd];
      // 源 `24515-24520`：下一个可见字符的原始位置**紧挨着**（`x > y` 且来回映射一致）才用它
      if (next !== undefined && next > last) end = next;
    }
    if (end === undefined) end = last + 1;
    return { start: from, end };
  };

  const out: FuzzyCandidate[] = [];
  for (const material of materials) {
    const name = (material.name ?? '').trim();
    if (name.includes(']') || name.includes('|')) continue;
    if (existing.has(`@[${material.id}|${name}]`)) continue;
    const nameLower = name.toLowerCase();

    /** ① 分词命中：取名字里**包含的、最长的**那个词（原 `y`） */
    let token: { kwLower: string; visStart: number; visEnd: number } | null = null;
    for (const t of tokens) {
      if (nameLower.includes(t.kwLower) && (!token || t.kwLower.length > token.kwLower.length)) token = t;
    }

    let visStart: number;
    let visEnd: number;
    let nameStart: number;
    let nameEnd: number;
    let fuzzy: boolean;
    if (token) {
      visStart = token.visStart;
      visEnd = token.visEnd;
      nameStart = nameLower.indexOf(token.kwLower);
      nameEnd = nameStart + token.kwLower.length;
      fuzzy = false;
    } else {
      const hit = commonSubstring(nameLower, lower);
      visStart = hit.indexInB;
      visEnd = visStart + hit.str.length;
      nameStart = nameLower.indexOf(hit.str);
      nameEnd = nameStart + hit.str.length;
      // 源 `24560` 的六连门槛（**逐条**）
      if (
        !hit.str ||
        hit.indexInB < 0 ||
        inRef(hit.indexInB) ||
        inRef(hit.indexInB + hit.str.length - 1) ||
        hit.str.length < MIN_TOKEN ||
        hit.str.length < Math.ceil(name.length * 0.5) ||
        nameStart < 0
      ) {
        continue;
      }
      fuzzy = true;
    }

    const range = toRawRange(visStart, visEnd);
    if (!range) continue;
    const keyword = visibleText.slice(visStart, visEnd);
    out.push({
      id: material.id as string,
      name,
      dataUrl: material.dataUrl || '',
      keyword,
      matchText: keyword,
      fuzzy,
      start: range.start,
      end: range.end,
      nameStart,
      nameEnd,
      key: `${material.id}::${keyword.toLowerCase()}`,
    });
  }

  out.sort((a, b) => a.start - b.start);
  return out.slice(0, MAX_CANDIDATES);
}

// ─────────────────────────── 按位置归组（原 `c$`）───────────────────────────

/** 一个「疑似匹配**位置**」（原 `c$` 的元素）—— 导航（上/下）的单位就是它 */
export interface FuzzyMatch {
  start: number;
  end: number;
  matchText: string;
  fuzzy: boolean;
  /** 同一位置上的**多个**候选素材（界面里那一列卡片） */
  materials: FuzzyCandidate[];
}

/**
 * 同起点的候选**合并成一个位置**（原 `c$`，`24588-24614`）
 *
 * 源：先按 `start`、再按 `end` 排序；**`start` 相同** ⇒ 并进上一组（`end` 取更大者）；
 * 否则新开一组（`matchText` / `fuzzy` 取该组**首条**的）。
 * ⚠️ 空输入 ⇒ 空数组（源第一句）。
 */
export function groupCandidates(candidates: readonly FuzzyCandidate[] | null | undefined): FuzzyMatch[] {
  if (!candidates || !candidates.length) return [];
  const sorted = [...candidates].sort((a, b) => a.start - b.start || a.end - b.end);
  const groups: FuzzyMatch[] = [];
  for (const item of sorted) {
    const last = groups[groups.length - 1];
    if (last && last.start === item.start) {
      last.materials.push(item);
      if (item.end > last.end) last.end = item.end;
    } else {
      groups.push({
        start: item.start,
        end: item.end,
        matchText: item.keyword || item.matchText || '',
        fuzzy: !!item.fuzzy,
        materials: [item],
      });
    }
  }
  return groups;
}

/**
 * 把正文里 `[start, end)` 换成一条引用（原 `i$`，`24438-24445`）
 *
 * 源：`const s = hk(e, n, r); return s ? e.slice(0, s.start) + t + e.slice(s.end) : e.slice(0, r) + t + e.slice(r)`
 * —— 即**优先吸收相邻的 `参考图`**（`hk` = 本仓 `autoMatch.refSpan`），否则就地在 `start` 处插入。
 * ⚠️ 与 `autoMatchText` 用的**同一个** `refSpan`（判据 C1：源也是 `hk`）。
 */
export function replaceRangeWithRef(
  text: string,
  literal: string,
  start: number,
  end: number,
): string {
  const span = refSpan(text, start, end);
  if (span) return text.slice(0, span.start) + literal + text.slice(span.end);
  return text.slice(0, start) + literal + text.slice(start);
}
