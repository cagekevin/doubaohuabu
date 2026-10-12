/**
 * 提示词组装（★ 纯函数，必测 —— §6.5 原则 7）
 *
 * 依据（**逐行回源抄录**）：
 *   - `io`  shared.js:35411-35413 —— 模型 id → 展示名（未知则原样，空则默认）
 *   - `tR`  shared.js:35414        —— 13 条「已生成痕迹」剥离模式
 *   - `nR`  shared.js:35415-35426  —— 是否已是「格式化过的」提示词
 *   - `Vk`  shared.js:35427-35435  —— 反复剥离直到稳定（上限 8 轮）
 *   - `rR`  shared.js:35436-35449  —— 视频参数后缀
 *   - `im`  shared.js:35451-35485  —— 通用组装（风格前缀 + 媒体类型）
 *   - `PL`  shared.js:40361-40410  —— 图片报文（含 5 条**幂等剥离**）
 *   - `TL`  shared.js:40318-40360  —— 视频报文
 *
 * ⚠️ **W7（幂等）**：正文里已含的「画一张：」「图片分辨率」「使用…模型」「生成 N 张图片」「画面比例」
 *    必须先**剥离**再组装，否则重复出现。
 * ⚠️ **W8（风格）**：风格 = **纯前缀拼接**（`${stylePrefix}${body}`），无分隔符。
 */

import {
  DEFAULT_VIDEO_DURATION,
  DEFAULT_VIDEO_MODEL,
  NODE_DEFAULT_RATIO_LABEL,
  VIDEO_MODEL_LABELS,
} from '@/constants/models';
// ★ SSOT 收口：`@[id|label]` 正则与 `参考图N` token **只有一份**（`refs.ts` 是 `@图N` 协议的归属模块）
import { createRefChipRe, formatReferenceLabel } from './refs';

/** 模型 id → 展示名（原 `io`；未知 id 原样返回，空则回落默认） */
export function normalizeModelLabel(model: unknown): string {
  const id = String(model ?? '');
  return VIDEO_MODEL_LABELS[id] ?? (id || VIDEO_MODEL_LABELS[DEFAULT_VIDEO_MODEL]!);
}

/**
 * 「已生成痕迹」剥离模式（原 `tR`，13 条，顺序敏感）
 * ⚠️ 顺序即语义：先剥「视频生成」前缀，再剥参数后缀
 */
export const GENERATED_ARTIFACT_PATTERNS: readonly RegExp[] = [
  /^[\s，,。]*视频生成\s*[：:，,-]?\s*/i,
  /[，,]\s*画面比例\s*[\d.]+\s*[:：/]\s*[\d.]+/g,
  /[，,]?\s*--模型[：:]\s*[A-Za-z0-9 ._-]+/gi,
  /^[\s，,。]*使用[^，。；]{0,24}模型[，,]?\s*生成一段\s*\d+\s*秒的(?:视频|短片|片段)[，,]?\s*比例为\s*[0-9:]+\s*[，,]?\s*内容为[：:]\s*/,
  /^[\s，,。]*使用[^，。；]{0,24}模型[，,]?\s*生成[，,]?\s*比例为\s*[0-9:]+\s*的\s*\d+\s*秒(?:视频|短片)[，,]?\s*内容为[：:]\s*/,
  /[，,]?\s*请直接开始生成[^。；\n]*/g,
  /[，,]?\s*无需确认参数[^。；\n]*/g,
  /[，,]?\s*不要反问[^。；\n]*/g,
  /[，,]?\s*本轮内容生成时请不要进行澄清[^。；\n]*/g,
  /[，,]?\s*时长[：:]\s*\d+\s*秒/g,
  /[，,]?\s*duration\s*=\s*\d+/gi,
  /\s*--比例[：:]\s*[0-9:]+/g,
  /\s*--时长[：:]\s*\d+/g,
];

/**
 * 反复剥离「已生成痕迹」直到稳定（原 `Vk`）
 *
 * ⚠️ 与源码一致：**最多 8 轮**（防某些模式互相触发导致死循环）
 */
export function stripGeneratedArtifacts(text: unknown): string {
  let t = String(text ?? '');
  if (!t) return '';
  let prev: string;
  let rounds = 0;
  do {
    prev = t;
    for (const re of GENERATED_ARTIFACT_PATTERNS) t = t.replace(re, '');
    t = t.replace(/^[\s，,。：:]+/, '').replace(/[\s，,。]+$/, '');
    rounds += 1;
  } while (t !== prev && rounds < 8);
  return t.trim();
}

/** 是否已是「格式化过的」提示词（原 `nR`）—— 命中则**不再包装**，避免套娃 */
export function isPreformatted(text: unknown): boolean {
  const t = String(text ?? '');
  return (
    /使用[^，。；]{0,24}模型[，,]?\s*生成一段\s*\d+\s*秒的/.test(t) ||
    /请直接开始生成/.test(t) ||
    /无需确认参数/.test(t) ||
    /--模型[：:]/.test(t) ||
    /画面比例\s*[\d.]+\s*[:：/]\s*[\d.]+/.test(t) ||
    /duration\s*=\s*\d+/.test(t)
  );
}

/**
 * 视频参数后缀（原 `rR`）
 * 图片通道返回空串（图片的参数在正文里）
 */
export function videoParamsSuffix(opts: {
  model?: unknown;
  duration?: unknown;
  ratio?: unknown;
  mediaType?: 'video' | 'image';
}): string {
  if (opts.mediaType === 'image') return '';
  const model = normalizeModelLabel(opts.model);
  // ⚠️ **2026-10-12 有意偏离源（只改"默认值"这一轴）**：源 `shared.js:35443-35444` 是
  //   `Number.isFinite(Number(t)) ? … : 5` 与 `n && n !== 'auto' ? String(n) : '16:9'`（**逐字**）。
  //   这两个兜底与「默认时长 / 默认比例」是**同一个槽位** ⇒ 吃 SSOT
  //   （否则"节点框是 4:3、提示词里却写 16:9"）。
  const duration = Number.isFinite(Number(opts.duration)) ? Number(opts.duration) : DEFAULT_VIDEO_DURATION;
  const ratio = opts.ratio && opts.ratio !== 'auto' ? String(opts.ratio) : NODE_DEFAULT_RATIO_LABEL;
  return `，画面比例 ${ratio}，duration=${duration}，--模型:${model}`;
}

/**
 * 通用组装（原 `im`）
 *
 * | mediaType | 行为 |
 * |---|---|
 * | `image` | **纯前缀拼接**：`${stylePrefix}${body}`（无分隔符） |
 * | `video`（已格式化） | 补前缀（若正文里还没有），**不套娃** |
 * | `video`（未格式化） | `视频生成 ${stylePrefix}${body}${参数后缀}` |
 */
export function composeBody(opts: {
  body?: unknown;
  model?: unknown;
  duration?: unknown;
  ratio?: unknown;
  stylePrefix?: unknown;
  mediaType?: 'video' | 'image';
}): string {
  const body = String(opts.body ?? '').trim();
  if (!body) return '';
  const prefix = String(opts.stylePrefix ?? '').trim();

  if (opts.mediaType === 'image') {
    return prefix ? `${prefix}${body}` : body;
  }

  if (isPreformatted(body)) {
    // 已是格式化结果：只在「正文里还没含该前缀」时补上
    return prefix && body.indexOf(prefix) === -1 ? `${prefix}${body}` : body;
  }

  const suffix = videoParamsSuffix({
    model: opts.model,
    duration: opts.duration,
    ratio: opts.ratio,
    mediaType: 'video',
  });
  return `视频生成 ${prefix || ''}${body}${suffix}`;
}

/**
 * 图片张数夹取（原 `PL`：`Math.max(1, Math.min(4, s | 0 || 1))`）
 *
 * ★ **2026-10-11（`TD-08-4`）：它是这条判据的**唯一落点** —— 同一式子原版在
 *   `_Component45.jsx:146` / `:189` 也**内联**出现过（UI 侧读写各一次），本仓那两处
 *   此前**只做默认、没钳** ⇒ 已改为调本函数（`ui/panels/GenPanel.tsx` 的 `onChange`、
 *   `state/slices/apiLanding.ts` 回灌、`state/generate.ts` 发请求前）。
 * ⚠️ **不要另建同名函数**（本会话曾误建 `core/rules/imageGen.ts`，已删 —— 判据 C1）。
 * ⚠️ **不要在 React 渲染期调用它**：编译器无法排除该调用修改入参 ⇒ 会让宿主组件的
 *   `useMemo` 被判「依赖可能被改」而放弃优化（实测 `react-hooks/preserve-manual-memoization`）。
 *   放在事件回调里没有这个问题。
 */
export function clampImageCount(count: unknown): number {
  return Math.max(1, Math.min(4, (Number(count) | 0) || 1));
}

/** 分辨率白名单（原 `PL`：`/^(1K|2K|4K)$/`） */
export function normalizeResolution(resolution: unknown): string {
  const s = String(resolution ?? '').trim();
  return /^(1K|2K|4K)$/.test(s) ? s : '';
}

/**
 * 图片提示词（原 `PL` 的文本部分）
 *
 * **幂等剥离 5 条**（顺序即语义）：
 *   ① `^画一张[:：]\s*`                        （前缀）
 *   ② `[,，]\s*图片分辨率\s*(?:1K|2K|4K)\s*$`   （后缀）
 *   ③ `[,，]\s*使用\s*[^，,]{1,40}模型\s*$`     （后缀）
 *   ④ `[,，]\s*(?:只|仅)?\s*生成\s*\d+\s*张图片\s*$`（后缀）
 *   ⑤ `[,，]\s*画面比例\s*\d+\s*:\s*\d+\s*$`    （后缀）
 *
 * 组装：`画一张：${body}${，画面比例 X}，${生成 N 张图片|只生成 1 张图片}${，使用 M 模型}${，图片分辨率 R}`
 */
export function composeImagePrompt(opts: {
  /** ★ 必填（`TD-16-104` 收窄：调用方 `buildImagePayload` 的 `text` 本就是必填 `string`） */
  text: string;
  /** 风格前缀；**没配风格**是合法状态 ⇒ 可选（`undefined` 等价于空串） */
  stylePrefix?: string;
  ratio?: string;
  count?: number;
  model?: string;
  resolution?: string;
}): string {
  let body = opts.text.trim();
  body = body
    .replace(/^画一张[:：]\s*/, '')
    .replace(/[,，]\s*图片分辨率\s*(?:1K|2K|4K)\s*$/, '')
    .replace(/[,，]\s*使用\s*[^，,]{1,40}模型\s*$/, '')
    .replace(/[,，]\s*(?:只|仅)?\s*生成\s*\d+\s*张图片\s*$/, '')
    .replace(/[,，]\s*画面比例\s*\d+\s*:\s*\d+\s*$/, '')
    .trim();

  const withStyle = composeBody({ body, stylePrefix: opts.stylePrefix, mediaType: 'image' });
  const count = clampImageCount(opts.count);
  const countText = count > 1 ? `生成 ${count} 张图片` : '只生成 1 张图片';
  const ratio = opts.ratio && opts.ratio !== 'auto' ? opts.ratio : '';
  const model = (opts.model ?? '').trim();
  const resolution = normalizeResolution(opts.resolution);

  return (
    `画一张：${withStyle}` +
    (ratio ? `，画面比例 ${ratio}` : '') +
    `，${countText}` +
    (model ? `，使用 ${model} 模型` : '') +
    (resolution ? `，图片分辨率 ${resolution}` : '')
  );
}

/**
 * 视频提示词（原 `TL` 的文本部分）
 * 组装：`composeBody({mediaType:'video'})`（已格式化则不套娃）
 */
export function composeVideoPrompt(opts: {
  /** ★ 必填（`TD-16-104` 收窄，与 `composeImagePrompt` 同判据） */
  text: string;
  model?: string;
  duration?: number;
  ratio?: string;
  /** 风格前缀；没配风格是合法状态 ⇒ 可选（同 `composeImagePrompt`） */
  stylePrefix?: string;
}): string {
  return composeBody({
    body: opts.text,
    model: opts.model,
    duration: opts.duration,
    ratio: opts.ratio,
    stylePrefix: opts.stylePrefix,
    mediaType: 'video',
  });
}

/**
 * 引用替换（原 `Qc`）—— `@[id|label]` → `参考图N`
 *
 * ⚠️ 正则与 token 都复用 `refs.ts`（原 `U0` / `参考图N`）—— 协议只有一份定义（SSOT）。
 *    `refs.ts` 的头部有**协议全景表**（5 个操作各在哪），改协议请先看那里。
 *
 * @param text 含 `@[nodeId|显示名]` 的文本
 * @param refMap `nodeId → 序号`（1 起）
 */
export function resolveReferences(text: string, refMap: Record<string, number> | null | undefined): string {
  if (!text) return '';
  return text.replace(createRefChipRe(), (whole, id: string, label: string) => {
    const n = refMap && Object.prototype.hasOwnProperty.call(refMap, id) ? refMap[id] : null;
    if (n != null) return formatReferenceLabel(n);
    return label || whole;
  });
}

/** 风格前缀拼接（原 `im` 的 image 分支）—— 纯前缀，**无分隔符**（W8） */
export function applyStylePrefix(body: string, stylePrefix: string): string {
  const prefix = String(stylePrefix ?? '').trim();
  return prefix ? `${prefix}${body}` : body;
}

/**
 * 把一条 `@` 引用解析成**素材**（原 `fk` 24135-24203）
 *
 * 六级回落（**顺序即语义**，逐行对齐源）：
 *   ① 资源库里 `id` 命中且有 `dataUrl`
 *   ② 节点 `material` 自带 `dataUrl`
 *   ③ 节点 `material` 自带 `libId` ⇒ 回资源库按 `libId` 找
 *   ④ 节点 `material` 的 `dataUrl` ⇒ 回资源库**按 dataUrl 反查**
 *   ⑤ 节点 `video` ⇒ 用 `poster` 当图、`url` 当视频（`mediaType: 'video'`）
 *   ⑥ 节点 `imggen` 自带 `dataUrl`
 *   **都没命中 ⇒ `{id, label: id, dataUrl: ''}`**（不抛、不返回 null —— 调用方按
 *   `dataUrl` 是否为空决定要不要把它当参考图）
 *
 * ⚠️ 源版这个函数**被 3 处复用**（`jS` / `$L` / 素材拖拽），故归 `rules` 共享。
 */
export interface ResolvedRefMaterial {
  id: string;
  label: string;
  dataUrl: string;
  mediaType?: 'video';
  videoUrl?: string;
}

/** 资源库条目的最小形状（本函数只读这四项） */
export interface RefLibraryItem {
  id: string;
  name?: string;
  dataUrl?: string;
}

/** 节点的最小形状（本函数只读 `type` / `data`） */
export interface RefNodeLike {
  id: string;
  type: string;
  data?: Record<string, unknown> | null;
}

export function resolveRefMaterial(
  refId: string,
  library: readonly RefLibraryItem[],
  nodes: Readonly<Record<string, RefNodeLike>> | readonly RefNodeLike[],
): ResolvedRefMaterial {
  const lib = library || [];
  const map: Readonly<Record<string, RefNodeLike>> = Array.isArray(nodes)
    ? Object.fromEntries(nodes.map((n) => [n.id, n]))
    : (nodes as Readonly<Record<string, RefNodeLike>>);

  // ①
  const libHit = lib.find((l) => l.id === refId);
  if (libHit && libHit.dataUrl) {
    return { id: refId, label: libHit.name || refId, dataUrl: libHit.dataUrl };
  }

  const node = map[refId];
  const d = (node?.data ?? {}) as Record<string, unknown>;
  const text = (v: unknown): string => (typeof v === 'string' ? v : '');

  // ②
  if (node?.type === 'material' && text(d.dataUrl)) {
    return { id: refId, label: text(d.label) || text(d.name) || refId, dataUrl: text(d.dataUrl) };
  }
  // ③
  if (node?.type === 'material' && text(d.libId)) {
    const hit = lib.find((l) => l.id === text(d.libId));
    if (hit && hit.dataUrl) {
      return {
        id: refId,
        label: hit.name || text(d.label) || text(d.name) || refId,
        dataUrl: hit.dataUrl,
      };
    }
  }
  // ④
  if (node?.type === 'material' && text(d.dataUrl)) {
    const hit = lib.find((l) => l.dataUrl && l.dataUrl === text(d.dataUrl));
    if (hit) {
      // ⚠️ `hit.dataUrl` 在接口里是可选的（谓词不会把类型收窄到 find 的返回值）⇒ 用 `text()` 归一
      return { id: refId, label: hit.name || text(d.label) || text(d.name) || refId, dataUrl: text(hit.dataUrl) };
    }
  }
  // ⑤
  if (node?.type === 'video') {
    return {
      id: refId,
      label: text(d.label) || text(d.name) || '视频',
      dataUrl: text(d.poster),
      mediaType: 'video',
      ...(text(d.url) ? { videoUrl: text(d.url) } : {}),
    };
  }
  // ⑥
  if (node?.type === 'imggen' && text(d.dataUrl)) {
    return { id: refId, label: text(d.label) || text(d.name) || '文生图', dataUrl: text(d.dataUrl) };
  }
  return { id: refId, label: refId, dataUrl: '' };
}

/**
 * 把**关联文本框**的正文并进主正文（原 `sR` 35486-35521）
 *
 * 规则（逐字对齐源）：
 *   ① 每条关联文本：正文里若出现 `@<它的名字>` **或** `@[…|<它的名字>]` ⇒
 *      **就地替换成它的正文**（内联）
 *   ② 没出现 ⇒ 收进"追加组"
 *   ③ 追加组非空时：主正文非空 ⇒ `主正文\n\n追加组`（空行分隔）；主正文为空 ⇒ 只留追加组
 *
 * ⚠️ 与源一致：名字里的正则元字符要转义（原 `u0`）。
 * ⚠️ **源版这里有个隐患**：`l` 与 `c` 都是 `/g` 正则，先 `test` 再 `replace` ——
 *    `/g` 的 `lastIndex` 会被 `test` 推进。`String.replace` 会重置 `lastIndex`，
 *    故**实际行为正确**；本实现改用**每次新建正则**，避免依赖那个巧合。
 */
export function mergeLinkedTexts(
  body: string,
  linked: readonly { text: string; label: string }[],
): string {
  // ⚠️ `body` / `linked` / `item.text` 均为**必填**（`TD-16-104`：删掉 4 处恒不触发的兜底）——
  //   生产调用方是 `state/batchSend` 的 `collectLinkedTexts`（返回 `LinkedText`：三字段全必填）。
  //   空串仍是合法值，故下面的 `if (!text)` / `if (!label)` 保留（它们判的是**空**，不是**缺失**）。
  let out = body;
  const append: string[] = [];

  const escapeRe = (v: string): string => v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  for (const item of linked) {
    const text = item.text.trim();
    if (!text) continue;
    const label = item.label.trim();
    if (!label) {
      append.push(text);
      continue;
    }
    const esc = escapeRe(label);
    const shortRe = new RegExp(`@${esc}`, 'g');
    const fullRe = new RegExp(`@\\[[^\\]|]+\\|${esc}\\]`, 'g');
    if (shortRe.test(out) || fullRe.test(out)) {
      out = out.replace(new RegExp(`@${esc}`, 'g'), text).replace(new RegExp(`@\\[[^\\]|]+\\|${esc}\\]`, 'g'), text);
    } else {
      append.push(text);
    }
  }

  if (append.length) {
    out = out.trim() ? `${out.trim()}\n\n${append.join('\n\n')}` : append.join('\n\n');
  }
  return out.trim();
}
