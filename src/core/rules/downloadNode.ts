/**
 * 下载节点（**纯函数**，★ 必测）—— 原 `WL.jsx`（150 行）的逻辑半
 *
 * ★ **下载节点的语义**：把**连到它的视频节点**的 `url` 批量落盘到用户选的目录，
 *   逐个记状态（`downloading` / `ok{size,path}` / `err{error}`）。源版空态原文：
 *   「从视频节点连线至此处以批量下载」。
 *
 * 依据（**逐行回源**）：
 *   | 件 | 源 | 语义 |
 *   |---|---|---|
 *   | `formatBytes` | `Kd` 40779 | `0/空 ⇒ ''`；`<1024 ⇒ '{n} B'`（**无小数**）；`<1MiB ⇒ KB`；否则 `MB`（均 `toFixed(1)`） |
 *   | `downloadFileName` | `WL.jsx:55` | `label \|\| vid \|\| 'video'` → **非法字符换 `_`** → **截 60 字符** → `.mp4` |
 *   | `collectDownloadTargets` | `WL.jsx:18-29` | **直接入边**里源节点为 `video` **且有 `url`** 的 |
 *   | `totalDownloadedBytes` | `WL.jsx:98-102` | 状态表里 `status === 'ok'` 的 `size` 之和 |
 */

/** 视频节点的最小形状（下载节点只看这几个字段） */
export interface DownloadSourceNode {
  id: string;
  type: string;
  data?: Record<string, unknown> | null;
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '');

/**
 * 字节数 → 人类可读（原 `Kd` 40779-40791）
 *
 * ⚠️ 与源逐字一致的三处：
 *   ① **`0` / 空 / `NaN` ⇒ 空串**（`if (e)` 的假值判定）—— 不是 `'0 B'`；
 *   ② `< 1024` 时是 **`'{n} B'`**（**整数、无小数**），而 KB/MB 是 `toFixed(1)`；
 *   ③ **没有 GB 档** —— 再大也只显示 MB。
 */
export function formatBytes(bytes: unknown): string {
  const n = typeof bytes === 'number' ? bytes : Number(bytes);
  if (!n) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1048576) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1048576).toFixed(1)} MB`;
}

/**
 * 落盘文件名（原 `WL.jsx:55`）
 *
 * ⚠️ 与源逐字一致：
 *   ① 优先 `label`，其次 `vid`，都没有才用字面量 `'video'`；
 *   ② 非法字符（**保留** `a-z A-Z 0-9 _ 中文 -`）逐个换成 `_`；
 *   ③ **先替换再截断**到 60 个字符（先截断会让非法字符漏进文件名）；
 *   ④ 后缀**固定 `.mp4`**（源版不看真实容器格式）。
 */
export function downloadFileName(data: { label?: unknown; vid?: unknown } | null | undefined): string {
  const raw = str(data?.label) || str(data?.vid) || 'video';
  const safe = raw.replace(/[^a-zA-Z0-9_\u4e00-\u9fa5-]/g, '_').slice(0, 60);
  return `${safe}.mp4`;
}

/**
 * 待下载列表（原 `WL.jsx:18-29`）
 *
 * ⚠️ 与源逐字一致：
 *   ① **只看直接入边**（`edge.target === nodeId`）—— 不递归上游；
 *   ② 源节点必须是 **`video`** 且 `data.url` 非空（`img`/`material` 一律不是下载目标）；
 *   ③ **不去重** —— 若同一源节点连了两条边，它会**出现两次**（源版就是 `map` 后 `filter`）。
 *      `docs/16` 记的图规则不允许重复边，故正常数据下不会发生；这里**照抄不擅自加去重**
 *      （加了就等于替源版改行为）。
 */
export function collectDownloadTargets(
  nodes: readonly DownloadSourceNode[],
  edges: readonly { source: string; target: string }[],
  nodeId: string,
): DownloadSourceNode[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  return edges
    .filter((e) => e.target === nodeId)
    .map((e) => byId.get(e.source))
    .filter((n): n is DownloadSourceNode => !!n && n.type === 'video' && !!str(n.data?.url));
}

/** 单条的下载状态（原 `WL.jsx` 的 `d` 状态表的值） */
export type DownloadItemState =
  | 'downloading'
  | { status: 'ok'; size?: number; path?: string }
  | { status: 'err'; error: string };

/** 状态表：`nodeId → 状态`（原 `WL.jsx` 的 `d`） */
export type DownloadStatusMap = Record<string, DownloadItemState>;

/**
 * 已下载总字节（原 `WL.jsx:98-102`）
 * ⚠️ 只累加 `status === 'ok'` 的 `size`（`undefined` 记 `0`）；`downloading`/`err` 不算。
 */
export function totalDownloadedBytes(status: DownloadStatusMap): number {
  return Object.values(status).reduce(
    (sum, s) => (typeof s === 'object' && s.status === 'ok' ? sum + (s.size || 0) : sum),
    0,
  );
}

/** 已成功下载的条数（源版没单独算，但 UI 的"已下载 {大小}"需要配套的数字感） */
export function countDownloaded(status: DownloadStatusMap): number {
  return Object.values(status).filter((s) => typeof s === 'object' && s.status === 'ok').length;
}
