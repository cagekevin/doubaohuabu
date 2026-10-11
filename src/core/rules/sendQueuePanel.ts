/**
 * 发送队列面板的**纯显示层**（★ 必测）—— 原 `tc`(42481) / `B0`(42493) / `Qd`(42586) / `Pp`(42568)
 *
 * ★★ **先纠正一个易误判**：`B0` **不是队列的调度泵**，而是**成片状态推导** ——
 *    它把「队列项 + 节点 + 后台进度」三者合成面板上那一行「成片：生成中 / 已完成 / 排队中…」。
 *    真正的调度在 `z3.jsx` 那一侧（本单元不涉及）。
 *
 * 依据（**逐行回源**）：
 *   | 件 | 源 | 语义 |
 *   |---|---|---|
 *   | `formatElapsed` | `tc` 42481 | `< 60s ⇒ '{n}s'`；否则 **`{m}m{ss}s`**（秒**补零**）；`0`/空 ⇒ `''` |
 *   | `deriveGenView` | `B0` 42493 | 四组九态，见下 |
 *   | `clampPanelPosition` | `Qd` 42586 | 把面板坐标夹进视口（`max(0, …)` 与 `视口-尺寸` 之间） |
 *
 * ⚠️ **时间必须注入**：源版 `B0`/`tc` 里**内联调 `Date.now()`**（原则 4 违规）⇒
 *   本实现把 `now` 作为入参，纯函数、可测。
 */

import { SEND_QUEUE_TEXT } from '@/constants/text';

/** 成片行的样式档（原 `B0` 的 `cls`） */
export type GenViewClass =
  | 'idle'
  | 'na'
  | 'unknown'
  | 'failed'
  | 'done'
  | 'queued'
  | 'generating';

/** 成片行（原 `B0` 的返回） */
export interface GenView {
  text: string;
  cls: GenViewClass;
  /** 已等待时长（`formatElapsed` 的产物），空串 = 不显示 */
  wait: string;
  /** 补充说明（`title` 用），空串 = 不显示 */
  note: string;
}

/** 队列项里本模块需要的字段（原 `sendQueue.items[]`） */
export interface QueueItemLike {
  status: string;
  /** 开始时刻（ms） */
  startedAt?: number;
  /** 结束时刻（ms） */
  finishedAt?: number;
  accountId?: string;
}

/** 后台进度（原 `B0` 第三参 `n`） */
export interface QueueProgressLike {
  kind?: string;
  text?: string;
}

/** 节点的 `genHistory.attempts[]` 元素 */
export interface GenAttemptLike {
  at?: number;
  status?: string;
  accountId?: string;
  note?: string;
}

/** 节点里本模块需要的字段 */
export interface QueueNodeLike {
  data?: {
    genHistory?: { attempts?: readonly GenAttemptLike[] } | null;
    resultAt?: number;
  } | null;
}

/** 尝试记录相对 `startedAt` 的**宽限**（原 42513 的 `- 1500`） */
const ATTEMPT_GRACE_MS = 1500;

/**
 * 已等待时长（原 `tc` 42481-42492）
 *
 * ⚠️ 与源逐字一致：**只看秒**（`Math.round((now-start)/1000)`）；
 *   `< 60` ⇒ `'{n}s'`；否则 `'{m}m{ss}s'`（`%60` **补零到 2 位**）。
 * ⚠️ `start` 为空 / `0` ⇒ `''`（源版 `if (!e) return ''`）—— **不是 `0s`**。
 * ⚠️ 负数不会出现（源版先 `Math.max(0, …)`）。
 */
export function formatElapsed(startedAt?: number | null, now?: number | null): string {
  if (!startedAt) return '';
  const at = typeof now === 'number' ? now : 0;
  const sec = Math.max(0, Math.round((at - startedAt) / 1000));
  if (sec < 60) return `${sec}s`;
  return `${Math.floor(sec / 60)}m${String(sec % 60).padStart(2, '0')}s`;
}

/**
 * 成片状态行（原 `B0` 42493-42567）
 *
 * 四组（**顺序即语义**）：
 *   ① `status !== 'success'` ⇒ `生成未开始`（`waiting`/`sending`，`cls: 'idle'`）或 `—`（其余，`cls: 'na'`）
 *   ② 节点不存在 ⇒ `状态未知` + note `节点不存在`
 *   ③ 从 `genHistory.attempts` 里筛**本次发送之后**的尝试（`at >= startedAt - 1500`，且账号匹配）
 *      —— **最后一条**是 `failed` ⇒ `失败`（带 note）；是 `success` ⇒ `已完成`（等待时长算到 `resultAt`）
 *   ④ 否则看后台进度 `kind`：`unknown` / `offer`（排队中）/ `none`（未在生成）/ **其余一律「生成中」**
 *
 * @param now 当前时刻（**必须注入** —— 源版内联 `Date.now()`）
 */
export function deriveGenView(
  item: QueueItemLike,
  node: QueueNodeLike | null | undefined,
  progress: QueueProgressLike | null | undefined,
  now: number,
): GenView {
  const G = SEND_QUEUE_TEXT.gen;

  // ① 还没发出去
  if (item.status !== 'success') {
    const busy = item.status === 'waiting' || item.status === 'sending';
    return {
      text: busy ? G.notStarted : G.dash,
      cls: busy ? 'idle' : 'na',
      wait: '',
      note: '',
    };
  }

  // ② 节点没了
  if (!node) {
    return { text: G.unknown, cls: 'unknown', wait: '', note: G.nodeMissing };
  }

  const data = node.data ?? {};
  const since = item.finishedAt || item.startedAt || 0;
  const attempts = Array.isArray(data.genHistory?.attempts) ? (data.genHistory?.attempts as readonly GenAttemptLike[]) : [];
  const floor = (item.startedAt || 0) - ATTEMPT_GRACE_MS;
  const mine = attempts.filter(
    (a) =>
      !!a &&
      Number.isFinite(a.at) &&
      !((a.at as number) < floor) &&
      (!item.accountId || !a.accountId || a.accountId === item.accountId),
  );
  const last = mine.length ? mine[mine.length - 1] : null;

  if (last && last.status === 'failed') {
    return {
      text: G.failed,
      cls: 'failed',
      wait: since ? formatElapsed(since, now) : '',
      note: last.note || '',
    };
  }
  if (last && last.status === 'success') {
    // ⚠️ 源版用 `resultAt || Date.now()` —— 这里用注入的 `now` 兜底
    const done = data.resultAt || now;
    return { text: G.done, cls: 'done', wait: formatElapsed(since, done), note: '' };
  }

  const kind = progress?.kind;
  const wait = since ? formatElapsed(since, now) : '';
  const text = progress?.text ? String(progress.text) : '';

  if (kind === 'unknown') {
    return { text: G.unknown, cls: 'unknown', wait, note: text || G.unknownNote };
  }
  if (kind === 'offer') {
    return { text: G.queued, cls: 'queued', wait, note: text || G.queuedNote };
  }
  if (kind === 'none') {
    return { text: G.idle, cls: 'idle', wait, note: text || G.idleNote };
  }
  return { text: G.generating, cls: 'generating', wait, note: text };
}

/**
 * 把浮动面板的坐标夹进视口（原 `Qd` 42586-42593）
 *
 * ⚠️ 与源版的一处**必要差异**：源版直接从 `window.innerWidth/Height` 读（默认 `1280×800`），
 *   本实现把**视口尺寸作为入参**（原则 4：`core` 不收宿主）—— 调用方传
 *   `window.innerWidth/innerHeight` 即可，行为一致。
 * ⚠️ 与源一致：`x` 夹在 `[0, max(0, vw - w)]`（**面板比视口宽时夹到 0**，不是负值）。
 */
export function clampPanelPosition(
  x: number,
  y: number,
  width: number,
  height: number,
  viewport: { w: number; h: number },
): { x: number; y: number } {
  return {
    x: Math.min(Math.max(0, Math.round(x)), Math.max(0, viewport.w - width)),
    y: Math.min(Math.max(0, Math.round(y)), Math.max(0, viewport.h - height)),
  };
}
