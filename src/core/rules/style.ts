/**
 * 风格预设（`doubao-styles`）—— ★ 纯规则
 *
 * 依据（**逐条回源抄录**）：
 *   - `nu`      `shared.js:41147-41175` —— `styleIds` → **拼接前缀**（`{prefix, names}`，本仓只用 `prefix`）
 *   - `q0`      `shared.js:42740-42747` —— 无封面时的**兜底渐变**（按名字哈希出两个 HSL 色）
 *   - `Pt`      `shared.js:26668-26670` —— id 工厂 `` `${prefix}_${Date.now().toString(36)}_${seq}` ``
 *   - store actions `setStyles` / `resetStyles` / `addStyle` / `updateStyle` / `removeStyle`
 *     `shared.js:30471-30540` —— 本文件收它们的**纯半**
 *   - `US.jsx:96-113` —— 编辑页「保存」（`j`）：**名称兜底** + 前缀的**尾标点归一**
 *
 * ⚠️ **为什么住 `core/rules` 而不是 `state`**：`stylePrefixOf` 此前住在 `state/generate.ts`
 *    （`TD-07-1`：「业务逻辑住 state」）—— 它是**纯字符串拼接**，与宿主/状态无关。
 *
 * ⚠️ 本模块不接触 `window` / `Date` / 随机（原则 4）—— id 与时间**由调用方注入**。
 */

import { DEFAULT_STYLE_PRESETS, type StylePreset } from '@/constants/stylePresets';
import { makeId } from './project';

/** 未命名风格的兜底（原 `US.jsx:97` 的 `|| '未命名风格'`） */
export const UNNAMED_STYLE = '未命名风格';

/** 封面兜底渐变的默认字（原 `q0` 的 `e || '风'`） */
const COVER_FALLBACK_CHAR = '风';

/** 风格 id（原 `Pt('sty')`：`sty_<时间36>_<序号>`） */
export function makeStyleId(now: number, seq: number): string {
  // ★ **2026-10-12 越权收口**：原在此自拼 `sty_…`（且 seq 段是**十进制**，源是 base36）
  //   ⇒ 改委托唯一工厂 `makeId('style', …)`（规范只在 `core/rules/project.ts` 一份）
  return makeId('style', now, seq);
}

/** 名称归一（原 `US.jsx:97`：`(p.name || '').trim() || '未命名风格'`） */
export function normalizeStyleName(name: unknown): string {
  const trimmed = String(name ?? '').trim();
  return trimmed || UNNAMED_STYLE;
}

/**
 * 前缀归一（原 `US.jsx:98` 的 `j`）
 *
 * 源：`` `${(p.prefix || '').trim().replace(/[，,]\s*$/, '')}，` ``
 *
 * ⚠️ 只去掉**一个**尾部标点（正则**没有 `+`**）—— 与 `nu` 的逐条清洗（有 `+`）**不是同一条规则**，
 *    两者各自逐字对齐，**不要合并**。
 */
export function normalizeStylePrefix(prefix: unknown): string {
  return `${String(prefix ?? '').trim().replace(/[，,]\s*$/, '')}，`;
}

/**
 * `styleIds` → **拼接前缀**（原 `nu` 的 `prefix` 半，`shared.js:41147-41175`）
 *
 * 源（逐条）：
 *   ```js
 *   o.push(String(l.prefix).trim().replace(/[，,]+$/, ''));   // 逐条：去**全部**尾标点
 *   return { prefix: `${o.join('，')}，`, names: s };           // join 后再补一个 `，`
 *   ```
 *
 * ⚠️ 与源逐字：**未命中的 id 跳过**（`l` 为空 / `prefix` 为空 ⇒ 不进 `parts`）；空表 ⇒ `''`。
 * ⚠️ 源的 `names` 无人消费 ⇒ **不落**（判据 B5）。
 */
export function stylePrefixOf(
  ids: readonly string[] | null | undefined,
  styles: readonly StylePreset[] | null | undefined,
): string {
  const list = Array.isArray(ids) ? ids.filter(Boolean) : [];
  if (!list.length) return '';
  const byId = new Map((styles ?? []).map((s) => [s.id, s]));
  const parts: string[] = [];
  for (const id of list) {
    const hit = byId.get(id);
    if (hit && hit.prefix) parts.push(String(hit.prefix).trim().replace(/[，,]+$/, ''));
  }
  return parts.length ? `${parts.join('，')}，` : '';
}

/**
 * 无封面时的**兜底渐变**（原 `q0`，`shared.js:42740-42747`）
 *
 * `n = Σ (n * 31 + charCode) % 360`（对名字做**确定性**哈希 ⇒ 同名恒同色），
 * 再返回 `linear-gradient(135deg, hsl(n 72% 84%), hsl((n+42)%360 66% 68%))`。
 * ⚠️ 空名 ⇒ 用字面量 `风`（源 `e || '风'`）。
 */
export function styleCoverGradient(name: unknown): string {
  const text = String(name ?? '') || COVER_FALLBACK_CHAR;
  let hue = 0;
  for (let i = 0; i < text.length; i += 1) hue = (hue * 31 + text.charCodeAt(i)) % 360;
  return `linear-gradient(135deg, hsl(${hue} 72% 84%), hsl(${(hue + 42) % 360} 66% 68%))`;
}

/** 内置风格集的**浅拷贝**（原 `resetStyles` 的 `vp.map(r => ({...r}))`） */
export function defaultStyles(): StylePreset[] {
  return DEFAULT_STYLE_PRESETS.map((s) => ({ ...s }));
}

/** `addStyle` 的入参（原 `addStyle(n)`） */
export interface NewStyleInput {
  id?: string;
  name?: string;
  prefix?: string;
  cover?: string | null;
}

/**
 * `addStyle` 的**纯半**（原 `shared.js:30490-30509`）
 *
 * 源：
 *   ```js
 *   if (!n || !n.name) return null;
 *   const r = n.id || Pt('sty');
 *   if ((t().styles || []).some(o => o.id === r)) return r;     // ⚠️ 已存在 ⇒ **不写盘**，只回 id
 *   const s = [...(t().styles || []), { ...n, id: r }];
 *   ```
 *
 * @returns `null` = 不合法（空 / 无 `name`）⇒ 调用方**什么都不做**；否则 `{ id, styles, added }`
 *   （`added === false` ⇒ id 已存在，**调用方不得 set** —— 与源一致）
 */
export function planAddStyle(
  styles: readonly StylePreset[] | null | undefined,
  input: NewStyleInput | null | undefined,
  idFactory: () => string,
): { id: string; styles: StylePreset[]; added: boolean } | null {
  if (!input || !input.name) return null;
  const list = styles ?? [];
  const id = input.id || idFactory();
  if (list.some((s) => s.id === id)) return { id, styles: [...list], added: false };
  return { id, styles: [...list, { ...input, id } as StylePreset], added: true };
}

/**
 * `updateStyle` 的纯半（原 `shared.js:30510-30528`）
 * ⚠️ 源：`!id || !patch` ⇒ **直接 return**（什么都不做）；否则 `map` 合并（`patch` 覆盖）
 */
export function planUpdateStyle(
  styles: readonly StylePreset[] | null | undefined,
  id: string | null | undefined,
  patch: Partial<StylePreset> | null | undefined,
): StylePreset[] | null {
  if (!id || !patch) return null;
  return (styles ?? []).map((s) => (s.id === id ? { ...s, ...patch } : s));
}

/** `removeStyle` 的纯半（原 `shared.js:30529-30540`）—— `!id` ⇒ `null`（什么都不做） */
export function planRemoveStyle(
  styles: readonly StylePreset[] | null | undefined,
  id: string | null | undefined,
): StylePreset[] | null {
  if (!id) return null;
  return (styles ?? []).filter((s) => s.id !== id);
}
