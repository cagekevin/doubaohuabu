/**
 * 发送后**视频**检测（原 `it` / `postSendDetect`）的**纯判定** —— 基线 / 新片 / 计时启动
 *
 * 依据（**逐行回源抄录**）：`_Component43.jsx:1319-1737`
 *   - `_e()`（`:1558`）—— 基线时间下限：`Math.min(now, …有值的 sendTime) - 60000`
 *   - **首轮建基线**（`:1610-1652`，`dt` 那一支）
 *   - **常规轮挑新片**（`:1655-1673`，`Ne` 那一支）
 *   - **计时器兜底**（`:1536-1553` 的 `xe`）：`Ge = 90000`
 *
 * ⚠️ 本模块**不碰** `window`/`Date`/随机（原则 4）：时间戳解析在 `lib/time`，`now` 由调用方注入。
 * ⚠️ 视频形状用**结构化最小接口**（不 import 端口类型 —— `core/rules` 不依赖 `core/ports`）。
 */

import { DETECT_BASELINE_WINDOW_MS } from '@/constants';
import { parseSiteTimestamp } from '@/lib/time';
import { popOrThrow } from '@/lib/array';

/** 本规则需要的视频字段（结构化匹配 `DetectedVideo` —— 见 `core/ports/host.port`） */
export interface DetectVideoLike {
  /** 站点侧唯一键（匹配左值） */
  key: string;
  /** 站点时间戳（秒 / 毫秒 / 字符串；原 `created_at`） */
  created_at?: unknown;
  /** 是否已取到可播放直链 */
  ready: boolean;
  url: string | null;
}

/**
 * 基线时间下限（原 `_e()`，`_Component43.jsx:1558`）
 *
 * `Math.min(now, …(> 0 的 sendTime)) - 60000`
 * ⚠️ 一个正 `sendTime` 都没有时退化成 `now - 60000`（源里 `[ve]` 兜底）。
 */
export function detectCutoff(sentTimes: readonly number[], now: number): number {
  const positive = sentTimes.filter((t) => t > 0);
  const min = Math.min(now, ...(positive.length > 0 ? positive : [now]));
  return min - DETECT_BASELINE_WINDOW_MS;
}

/** 可下载（原 `fe.ready && fe.url`） */
function isReady(v: DetectVideoLike): boolean {
  return !!v.ready && !!v.url;
}

/** 在本轮时间窗内（原 `isFinite(Te) && Te > at`） */
function inWindow(v: DetectVideoLike, cutoff: number): boolean {
  const ts = parseSiteTimestamp(v.created_at);
  return isFinite(ts) && ts > cutoff;
}

/** 首轮建基线的结果（原 `dt` 那一支的产物） */
export interface FirstRoundBaseline<V extends DetectVideoLike> {
  /** 旧片（基线）键 —— 调用方把它们并进 `seen` */
  baselineKeys: Set<string>;
  /**
   * 本轮即检测到的**新片**（要落库；保序）
   * ⚠️ 判据逐字对源：`key ∧ 窗内 ∧ !基线 ∧ ready ∧ url`
   */
  fresh: V[];
}

/**
 * 首轮建基线（原 `:1610-1652`）
 *
 * 先按 `created_at` 是否落在窗内把视频分成「新片 / 基线旧片」，再取
 * 「窗内 ∧ 不在基线 ∧ 可下载」者为首轮新片（保序 = 页面顺序）。
 */
export function classifyFirstRound<V extends DetectVideoLike>(
  videos: readonly V[],
  cutoff: number,
): FirstRoundBaseline<V> {
  const baselineKeys = new Set<string>();
  const freshKeys = new Set<string>();
  for (const v of videos) {
    if (!v.key || !isReady(v)) continue;
    if (inWindow(v, cutoff)) freshKeys.add(v.key);
    else baselineKeys.add(v.key);
  }
  const fresh = videos.filter(
    (v) => !!v.key && freshKeys.has(v.key) && !baselineKeys.has(v.key) && isReady(v),
  );
  return { baselineKeys, fresh };
}

/**
 * 常规轮挑新片（原 `:1655-1673` 的 `Ne`）
 *
 * ⚠️ **有副作用**（逐字对源）：被判为**旧片**（窗内判否 ∧ 基线里有）的键会**加入 `seen`**
 *   —— 源就是这么写的（`b.current.add($e.key)`）。调用方传**同一个 `seen`**进来。
 * @returns 本轮要落库的新片（保序）
 */
export function pickFreshVideos<V extends DetectVideoLike>(
  videos: readonly V[],
  cutoff: number,
  seen: Set<string>,
  baselineKeys: ReadonlySet<string>,
): V[] {
  const fresh: V[] = [];
  for (const v of videos) {
    if (!v.key || seen.has(v.key) || !isReady(v)) continue;
    // 原判据：`isFinite(at) && at > ye || !K.has(key)`
    if (inWindow(v, cutoff) || !baselineKeys.has(v.key)) {
      fresh.push(v);
    } else {
      seen.add(v.key);
    }
  }
  return fresh;
}

/**
 * 「`nodeId` **有没有视频后代**」（原 `O0`，`shared.js:40704-40732`）
 *
 * ⚠️ 逐行对源：邻接按**出边**（`DL` 的 `source → [target]`）；BFS 收「可达集」——
 *   **起点自身不计入**（源只把 `c`（target）塞进集合）⇒ 「自己是视频节点」**不算**「有视频后代」。
 * ⚠️ 一个 video 节点都没有 ⇒ 直接 `false`（源 `r.size === 0` 早退）。
 *
 * 用途（`OL.jsx:361-363`）：账号节点**发送成功后**，若它**没有**视频后代 ⇒
 *   `setNodePendingTimer(nodeId, now)` 登记「待启动计时」，等 `postSendDetect` 捡到片再转正式计时。
 */
export function hasVideoDescendant(
  nodes: readonly { id: string; type?: string }[],
  edges: readonly { source: string; target: string }[],
  nodeId: string,
): boolean {
  const adjacency = new Map<string, string[]>();
  for (const e of edges) {
    const list = adjacency.get(e.source);
    if (list) list.push(e.target);
    else adjacency.set(e.source, [e.target]);
  }
  const videoIds = new Set(nodes.filter((n) => n.type === 'video').map((n) => n.id));
  if (videoIds.size === 0) return false;

  const reached = new Set<string>();
  const queue: string[] = [nodeId];
  while (queue.length > 0) {
    const cur = popOrThrow(queue);
    for (const next of adjacency.get(cur) ?? []) {
      if (!reached.has(next)) {
        reached.add(next);
        queue.push(next);
      }
    }
  }
  for (const vid of videoIds) if (reached.has(vid)) return true;
  return false;
}

/**
 * 是否该**启动节点计时器**（原 `xe`，`:1536-1553`）
 *
 * 源：探测到「已提交」回复**或**等满 `Ge`(90s) 即启动（后者是兜底）。
 * @param pendingAt 入队的时刻（源 `nodePendingTimers[nodeId]`）
 * @param now 当前时刻（注入）
 * @param probedHit 是否探测到「已提交」回复
 * @param fallbackMs 兜底阈值（默认 `DETECT_TIMER_FALLBACK_MS`）
 */
export function shouldStartTimer(
  pendingAt: number,
  now: number,
  probedHit: boolean,
  fallbackMs: number,
): boolean {
  return probedHit || now - pendingAt >= fallbackMs;
}

/**
 * **已见键的种子**（原 `_Component43.jsx:526-541` 的 useEffect 体）
 *
 * 源逐字：`videoShares[].vid` ∪ `video 节点[].data.vid` —— 「工程切换 / 首次检测」时用它重建
 *   `b.current`，免得把**已经存在**的片当成"新片"。
 * ⚠️ 只收**真值**（源是 `if (Q.vid)` / `if (Q.data.vid)` ⇒ 空串 / `null` / `undefined` 都不入集）。
 * ⚠️ 只认 **`type === 'video'`** 的节点（源对 `nodes` 逐个判 `Q.type === 'video'`）。
 */
export function seedSeenKeys(
  videoShares: readonly { vid?: string | null }[],
  nodes: readonly { type?: string; data?: Record<string, unknown> }[],
): Set<string> {
  const acc = new Set<string>();
  for (const vs of videoShares) if (vs.vid) acc.add(vs.vid);
  for (const n of nodes) {
    if (n.type !== 'video') continue;
    const v = n.data?.vid;
    if (v) acc.add(String(v));
  }
  return acc;
}
