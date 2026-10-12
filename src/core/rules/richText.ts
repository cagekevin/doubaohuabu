/**
 * 富文本编辑器的**纯字符串半**（★ 纯函数，必测）—— 原 `bL`(40047) / `P0`(39988) / `qs`(39956) / `Jc`(39963) / `la`(39981) / `Xt`(22564)
 *
 * ★★ **它是"文本 ⇄ 编辑器 HTML"里的 `→` 方向**（把 `@[id|名]` 标记渲染成药丸）：
 *   反向（编辑器 DOM → 文本，原 `kL`）需要 DOM，住在 `lib/editorText.ts`。
 *
 * ★ **为什么这一层必须纯**：`bL` 的**快路径**（无 HTML 标签、无实体）就是**字符串处理** ——
 *   把它抽出来就能单测（"标记→药丸""换行→`<br/>`""转义"），而 DOM 那半只做搬运。
 *
 * ⚠️ **只移植快路径**：`bL` 还有一条"富文本路径"（正文里已经带 HTML 标签/实体时，
 *   用 `R0` 逐段归一）。本工程的契约是**纯文本** `data.text: string`
 *   （`docs/过程.md` 记的迁移已把老富文本洗过一遍）⇒ 富文本路径不移植；
 *   **但保留同样的判定条件**（`hasRichMarkup`）⇒ 真遇到老数据**不静默走错分支**，
 *   由 `textToEditorHtml` 显式降级为"整段转义"（见下）。
 */

/** 一段文本里是否已经有 HTML 标签或实体（原 `bL` 40051 的判定，**逐字**） */
// ⚠️ `@图N` 协议正则的**唯一真源**在 `refs.ts`（原 `Ks` 40795）—— 不复刻第二份
// ★ **2026-10-12 越权修正**：本文件原自造两个芯片正则（`split(/(@\[[^\]]+\])/g)` 与
//   `/^@\[([^\]|]+)\|([^\]]+)\]$/`）—— 现均委托 `refs.ts` 的具名工厂（源头已补齐形态）
import { createRefChipExactRe, createRefMarkRe, createRefSpanRe } from './refs';
// ⚠️ `img://` + `?w=` 的**协议真源**在 `stable/protocols/img.ts`（本文件不写第二份）
import { withThumb } from '@/stable/protocols/img';

export function hasRichMarkup(text: string): boolean {
  return /<[a-z][^>]*>/i.test(text) || /&(?:[a-zA-Z]+|#\d+|#x[0-9a-f]+);/i.test(text);
}

/**
 * HTML 转义（原 `qs` 39956）
 * ⚠️ 与源逐字一致：**只转 `&` `<` `>`**（**不转引号** —— 引号是 `Jc` 的事）
 */
export function escapeHtml(v: unknown): string {
  const s = typeof v === 'string' ? v : String(v ?? '');
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** 属性值转义（原 `Jc` 39963 = `qs` + 引号） */
export function escapeAttr(v: unknown): string {
  return escapeHtml(v).replace(/"/g, '&quot;');
}

/*
 * ★ **2026-10-11 删除 `thumbUrl`（原 `Xt`）** —— 它是 `stable/protocols/img.ts` 的 `withThumb`
 *   **第二份实现**（判据 C1），而且**写反了**：给远程 URL 挂 `?w=`、给 `img://` 原样返回。
 *   逐行回源确认 `Xt(e,t)` = `Kh(e) ? \`${e.split(/[?#]/)[0]}?w=${t}\` : e || ''`，而
 *   **`Kh` = 「已是 `img://` 引用」**（`qM = 'img://'`）⇒ 只有 `img://` 才挂 `?w=`。
 *   `withThumb`（协议真源）已按此修正并收下这份守卫 ⇒ 调用方直接用 `withThumb`。
 *   （同文件里那个基于误读的 `isRemoteImageUrl` 一并删除。）
 */

/** 药丸的内文（原 `la` 39981-39987）—— 有图 ⇒ 图 + `@名`；无图 ⇒ `@名 (无图片)` */
function chipInnerHtml(name: string, dataUrl: string): string {
  if (dataUrl) {
    return `<img src="${escapeAttr(withThumb(dataUrl, 120))}" class="chip-img"/><span class="chip-name">@${escapeHtml(name)}</span>`;
  }
  return `<span class="chip-name">@${escapeHtml(name)} <i>(无图片)</i></span>`;
}

/**
 * 一枚引用药丸的 HTML（原 `P0` 39988-39994）
 *
 * ⚠️ 三个细节逐字对齐源版：
 *   ① `name` 为空 / 字面量 `'undefined'` ⇒ **回落 `'素材'`**；
 *   ② `contenteditable="false"` —— 药丸是**不可编辑的原子**（光标不会落进去、退格整体删）；
 *   ③ 属性名是 **`data-id` / `data-name`**（`lib/editorText.ts` 的反向解析就靠它俩）。
 */
export function refChipHtml(input: { id: string; name?: string; dataUrl?: string }): string {
  const raw = input.name && String(input.name).trim();
  const name = raw && raw !== 'undefined' ? raw : '素材';
  const dataUrl = typeof input.dataUrl === 'string' ? input.dataUrl : '';
  return `<span class="ref-chip" contenteditable="false" data-id="${escapeAttr(input.id)}" data-name="${escapeAttr(name)}">${chipInnerHtml(name, dataUrl)}</span>`;
}

/**
 * 「素材缺失」的占位（原 `bL` 40064）
 * ⚠️ 源版把 id 写成字面量 **`x`**（`@[x|名]`，见 `kL.jsx:9`）—— 反向解析时它会变回 `x`，
 *    于是再次渲染时仍然"找不到素材" ⇒ **这是源的循环语义，照抄**。
 */
export function refMissingHtml(name: string): string {
  return `<span class="ref-missing" contenteditable="false" data-name="${escapeAttr(name)}">@${escapeHtml(name)} <i>(素材缺失)</i></span>`;
}

/** 一枚 `@[id|名]` 标记的解析结果 —— `id` 为字面量 `x` 表示"素材缺失占位" */
export interface TextRefMarker {
  id: string;
  name: string;
}

/** 拆出「标记 / 普通文本」交替的片段（原 `bL` 40052 的 `split(/(@\[[^\]]+\])/g)`） */
export function splitRefMarkers(text: string): Array<{ marker: TextRefMarker | null; raw: string }> {
  return String(text ?? '')
    .split(createRefSpanRe())
    .map((piece) => {
      const m = createRefChipExactRe().exec(piece);
      return m ? { marker: { id: m[1] as string, name: m[2] as string }, raw: piece } : { marker: null, raw: piece };
    });
}

/**
 * 纯文本 → 编辑器 HTML（原 `bL` 40047-40067 的**快路径**）
 *
 * @param text 存进 `data.text` 的原文（纯文本 + `@[id|名]` 标记）
 * @param materials `id → {name, dataUrl}` —— ★ 源版这里用的是**节点表**（`bL(e, t)` 的 `t` 是 `id → node`），
 *   不是资源库；本工程按同语义收一个最小形状（调用方自己决定从哪儿取）。
 */
export function textToEditorHtml(
  text: string,
  materials: Readonly<Record<string, { name?: string; dataUrl?: string }>> = {},
): string {
  const src = String(text ?? '');
  if (!src) return '';

  // ⚠️ 老数据里真带 HTML/实体（`docs/过程.md` 的迁移理论上已洗过）⇒ **不猜**：
  //    整段转义成纯文本（宁可"显示成标签原文"，也不要渲染不可信的 HTML —— 铁律②零注入）
  if (hasRichMarkup(src)) return escapeHtml(src).replace(/\n/g, '<br/>');

  return splitRefMarkers(src)
    .map(({ marker, raw }) => {
      if (!marker) return escapeHtml(raw).replace(/\n/g, '<br/>');
      const hit = materials[marker.id];
      if (hit) {
        /**
         * ★ **名字回落链**（原 `bL` 40057 逐字）：
         *   `节点.data.label || 节点.data.name || **标记里的原文**` 再 `trim()`，仍空才靠 `P0` 回落 `素材`。
         * ⚠️ 中间那一档**很容易漏** —— 漏掉就会在"节点没名字"时显示 `素材` 而不是标记里的名字
         *   （本文件的单测正是这么抓到的）。
         * ⚠️ 调用方给的 `hit.name` 已经做过 `label ?? name`（见 `TextNode` 的 `materials`）。
         */
        const name = String(hit.name ?? '').trim() || marker.name;
        return refChipHtml({ id: marker.id, name, dataUrl: hit.dataUrl });
      }
      return refMissingHtml(marker.name);
    })
    .join('');
}

// ─────────────────────────── `gp` 变体（生成面板的提示词编辑器）───────────────────────────

/**
 * 生成面板的 chip 类名（原 `K3` shared.js:42656）
 *
 * ★ **它与文本节点的 chip 不是同一套协议**（判据 C1 的第 2 处，但**形态确实不同**）：
 *   | | 文本节点（`P0`） | 生成面板（`X3`） |
 *   |---|---|---|
 *   | 类名 | `ref-chip` | `ref-chip **gp-ref-chip**` |
 *   | 载体 | `data-id` + `data-name` | **`data-n`（编号）** |
 *   | 反向 | `@[id\|名]` | **`@图N`** |
 *   ⇒ 存进两个字段的**文本格式不同**（文本框是 `@[id|名]`、提示词是 `@图N`），
 *     这正是 `refs.ts` 同时有 `createRefChipRe` 与 `createRefMarkRe` 的原因。
 */
export const GP_REF_CHIP_CLASS = 'gp-ref-chip';

/**
 * gp 药丸的 HTML（原 `X3` shared.js:42662-42668）
 *
 * ⚠️ 与文本节点药丸的三处差异（**照抄**）：
 *   ① 多一个类名 `gp-ref-chip`；
 *   ② 载体是 **`data-n`**（编号），不是 `data-id`/`data-name`；
 *   ③ 名字兜底是 **`图${n}`**（文本节点那边是 `素材`）。
 * ⚠️ 编号非法（非有限数 / ≤ 0）⇒ **回落 1**。
 */
export function gpRefChipHtml(n: number, label?: string, dataUrl?: string): string {
  const raw = Number(n);
  const num = Number.isFinite(raw) && raw > 0 ? raw : 1;
  const trimmed = label && String(label).trim() && String(label) !== 'undefined' ? String(label) : null;
  const name = trimmed ?? `图${Number.isFinite(raw) ? raw : 1}`;
  const url = typeof dataUrl === 'string' ? dataUrl : '';
  return `<span class="ref-chip ${GP_REF_CHIP_CLASS}" contenteditable="false" data-n="${num}">${chipInnerHtml(name, url)}</span>`;
}

/**
 * 提示词文本 → 编辑器 HTML（原 `DS` 42669-42685 + `G0` 42686）
 *
 * ⚠️ 与 `textToEditorHtml` 的关键差异：这里的标记是 **`@图N`**（编号），
 *   所以取值靠 **`lookup(n)` 按编号查**，而不是按 id 查。
 */
export function textToGpEditorHtml(
  text: string,
  lookup: (n: number) => { label?: string; dataUrl?: string } = () => ({}),
): string {
  const src = String(text ?? '');
  let out = '';
  let cursor = 0;
  // ⚠️ `matchAll` + **新正则**（源版是模块级 `/g` + 手动 `lastIndex = 0`，见 `createRefMarkRe` 的注释）
  for (const m of src.matchAll(createRefMarkRe())) {
    out += escapeHtml(src.slice(cursor, m.index)).replace(/\n/g, '<br/>');
    const n = Number(m[1]);
    const hit = lookup(n) || {};
    out += gpRefChipHtml(n, hit.label, hit.dataUrl);
    cursor = (m.index ?? 0) + m[0].length;
  }
  out += escapeHtml(src.slice(cursor)).replace(/\n/g, '<br/>');
  return out;
}
