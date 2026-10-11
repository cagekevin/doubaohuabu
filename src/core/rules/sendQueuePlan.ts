/**
 * 发送队列的**入队规划**（★ 纯函数，必测）—— 原 `$S`(41876) / `AS`(41868) / `MS`(41870) / `IS`(41869)
 *
 * ★★ **它的核心是「防重复发送」**：同一个节点**90 秒内**重复入队、且**正文指纹相同** ⇒ **跳过**
 *   （除非 `force`）。这是大批量场景下最容易被误触发的地方（用户连点两次、或同一批里重复选）。
 *
 * 依据（**逐行回源**）：
 *   | 件 | 源 | 语义 |
 *   |---|---|---|
 *   | `queueFingerprint` | `AS` 41868 | `stripHtml` → **删掉全部空白**（`/\s+/g → ''`，不是折成一个空格）→ **截 200** |
 *   | `nodeTextOf` | `MS` 41870 | `nodes.find(id)?.data?.text \|\| ''` |
 *   | 去重判据 | 41895 | `!force && 指纹非空 && 有缓存 && 指纹相同 && now - 缓存时刻 < **90000**` |
 *   | 新项形状 | 41903-41917 | 见 `buildQueueItem` |
 *   | `replace` 语义 | 41882-41886 | 只保留**已成功**的旧项（其余清掉） |
 *
 * ⚠️ **时间与缓存都注入**：源版内联 `Date.now()`、并用模块级 `Map IS` 存指纹（原则 4 违规）
 *   ⇒ 本实现把 `now` 与 `fingerprints`（`nodeId → {fp, at}`）作为入参，纯函数、可测。
 */

import { stripHtml } from '@/lib/text';

/** 防重复窗口（ms）—— 原 `N3` 41834 的 `90000` */
export const DEDUPE_WINDOW_MS = 90000;

/** 指纹截断长度（原 `AS` 的 `slice(0, 200)`） */
const FINGERPRINT_MAX = 200;

/** 队列项（原 `$S` 41903-41917 的字面形状） */
export interface QueueItem {
  id: string;
  nodeId: string;
  name: string;
  /** 未分配时为 `null`（原版就是 `null` 而不是空串） */
  accountId: string | null;
  accountName: string;
  status: string;
  attempt: number;
  startedAt: number | null;
  finishedAt: number | null;
  note: string;
  /** 入队顺序（`入队时刻 + 序号`）—— 用来稳定排序 */
  order: number;
  /** 最早可开始时刻（现在恒 `null`，源版留着给"稍后重试"用） */
  notBefore: number | null;
  /** 本次不许用的账号（原 `excludeAccountIds`） */
  excludeAccountIds: string[];
}

/** 节点里本模块需要的字段 */
export interface QueuePlanNodeLike {
  id: string;
  data?: { text?: unknown } | null;
}

/** 入队请求（原 `$S` 的第一参元素） */
export interface EnqueueInput {
  nodeId: string;
  name?: string;
}

/** 指纹缓存（原模块级 `Map IS`）—— `nodeId → {fp, at}` */
export type FingerprintCache = ReadonlyMap<string, { fp: string; at: number }>;

/**
 * 正文指纹（原 `AS` 41868）
 *
 * ⚠️ 与源逐字一致：`stripHtml` 之后 **`/\s+/g → ''`（删掉全部空白，不是折成一个空格）**
 *   —— 于是"改了个缩进/换行"**不算**改了内容（这正是防重复想要的），
 *   但"把两个词之间的空格删了"也**不算**（源版如此）。
 * ⚠️ 最后 **`slice(0, 200)`**（超长正文只看前 200 字符）。
 */
export function queueFingerprint(text: unknown): string {
  return stripHtml(String(text ?? ''))
    .replace(/\s+/g, '')
    .slice(0, FINGERPRINT_MAX);
}

/** 取节点的正文（原 `MS` 41870-41875） */
export function nodeTextOf(nodes: readonly QueuePlanNodeLike[], nodeId: string): string {
  const n = nodes.find((x) => x.id === nodeId);
  const t = n?.data?.text;
  return typeof t === 'string' ? t : '';
}

/**
 * 造一个队列项（原 41903-41917）
 *
 * ⚠️ 字段**逐个照抄**，特别是三处容易"顺手修正"的：**`accountId` 是 `null`**（不是 `''`）、
 *   **`notBefore` 是 `null`**、**`order = 入队时刻 + 该项在本次入队里的下标`**（不是纯时刻 ——
 *   同一毫秒入队的多项靠它保持稳定顺序）。
 */
export function buildQueueItem(input: {
  id: string;
  nodeId: string;
  name?: string;
  order: number;
  excludeAccountIds?: readonly string[];
}): QueueItem {
  return {
    id: input.id,
    nodeId: input.nodeId,
    name: input.name || '',
    accountId: null,
    accountName: '',
    status: 'waiting',
    attempt: 0,
    startedAt: null,
    finishedAt: null,
    note: '',
    order: input.order,
    notBefore: null,
    // ⚠️ 源版是 `Array.isArray(r) ? r.filter(Boolean) : []` —— 顺带滤掉空串
    excludeAccountIds: Array.isArray(input.excludeAccountIds)
      ? input.excludeAccountIds.filter(Boolean)
      : [],
  };
}

/** 一次入队规划的结果（原 `$S` 的返回） */
export interface EnqueuePlan {
  /** 规划后的**整个** `items` 数组 */
  items: QueueItem[];
  /** 本次新增（原 `added`） */
  added: QueueItem[];
  /** 被跳过的（原 `skipped`）—— `reason` 就是源版那句文案 */
  skipped: Array<{ nodeId: string; name: string; reason: string }>;
}

/**
 * 规划一次入队（原 `$S` 41876-41929）
 *
 * 顺序（**逐行对齐**）：
 *   ① `replace` ⇒ 先只保留**已成功**的旧项
 *   ② 逐条（**滤掉没有 `nodeId` 的**）：算指纹 → 查缓存 → **命中防重复 ⇒ 进 `skipped`**；
 *      否则造新项（`order = now + 下标`）
 *   ③ 新项**追加在尾部**（`[...旧, ...新]`）
 *
 * @param now 入队时刻（**必须注入**）
 * @param idFactory 造新项 id（原 `b3()`）
 */
export function planEnqueue(input: {
  nodes: readonly QueuePlanNodeLike[];
  current: readonly QueueItem[];
  incoming: readonly EnqueueInput[];
  fingerprints: FingerprintCache;
  now: number;
  idFactory: () => string;
  replace?: boolean;
  force?: boolean;
  excludeAccountIds?: readonly string[];
}): EnqueuePlan {
  const base = input.replace
    ? input.current.filter((c) => c.status === 'success')
    : [...input.current];

  const added: QueueItem[] = [];
  const skipped: EnqueuePlan['skipped'] = [];

  (input.incoming || [])
    .filter((c) => !!c && !!c.nodeId)
    .forEach((c, index) => {
      const fp = queueFingerprint(nodeTextOf(input.nodes, c.nodeId));
      const cached = input.fingerprints.get(c.nodeId);
      if (
        !input.force &&
        fp &&
        cached &&
        cached.fp === fp &&
        input.now - cached.at < DEDUPE_WINDOW_MS
      ) {
        skipped.push({
          nodeId: c.nodeId,
          name: c.name || '',
          reason: '与上次发送内容相同（90 秒内），已跳过防重复',
        });
        return;
      }
      added.push(
        buildQueueItem({
          id: input.idFactory(),
          nodeId: c.nodeId,
          ...(c.name === undefined ? {} : { name: c.name }),
          order: input.now + index,
          ...(input.excludeAccountIds ? { excludeAccountIds: input.excludeAccountIds } : {}),
        }),
      );
    });

  return { items: [...base, ...added], added, skipped };
}
