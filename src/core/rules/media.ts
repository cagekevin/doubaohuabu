/**
 * 站点视频 ↔ 画布节点**回填匹配**（★ 纯函数，必测）
 *
 * 依据（**逐行回源抄录**）：
 *   - `qk` shared.js:35734 —— 任务时效 `3000000`（已在 `constants` 的 `MAX_JOB_AGE_MS`）
 *   - `pR` shared.js:35735-35757 —— 站点时间戳解析（已抽到 `lib/time`）
 *   - `Kk` shared.js:35758-35766 —— 活任务过滤（有 nodeId + 存活 + 时效内）
 *   - `hR` shared.js:35767-35933 —— **DP 序列匹配**（167 行）
 *
 * ## `hR` 在做什么（读源码后的结论）
 * 把「站点上真实存在的视频记录」与「画布上发过的任务」**按时间对齐**，产出一张
 * `视频key → 节点id` 的指派表。时间戳是唯一线索，所以用**最小总时间差的序列对齐 DP**
 * （等价于"只允许保序匹配"的指派问题）：
 *   - `u = 视频数`、`d = 活任务数`
 *   - `u <= d`：把**每个视频**配到某个任务（DP 表 `u × d`）
 *   - `u > d`：**转置**（把每个任务配到某个视频，DP 表 `d × u`）
 *   - 两侧有一侧为空：全部置 `null`，并把**最后一个**视频给 `fallbackNodeId`
 *   - 未被匹配到的视频：全部 `null`，**最后一个**给 `fallbackNodeId`（原 `m`）
 *
 * ⚠️ **契约内行为与原版完全等价**（逐行核对过：DP 递推 / 回溯 / 扁平下标 / 两套镜像分支 / `Kk` 边界全对齐）。
 *    下面两条**不是**行为偏离，只是防御式兜底与语义说明 —— **不要**为"对齐原版"把它们改回去：
 *    ① `u <= d` 分支的 `E[z]` **恒 `>= 0`**（DP 不变量：`C[z][o]` 有限 ⟺ `o >= z`，且此处 `d >= u`
 *       ⇒ 回溯只能以 `P = 0` 结束）⇒ 原版 `a[E[z]].nodeId` 在此**不会**抛异常。
 *       本实现仍按 `null` 兜底，仅为防御**契约外**输入（`sendTime` 是非数字真值 ⇒ `cost` 变 `NaN`
 *       ⇒ 破坏"代价有限"前提，此时原版才会炸）。
 *    ② `vids` 排序**不改入参**：原版也是在 `map` 出的**新数组**上 `sort`/`reverse` ⇒ 两者行为相同。
 *    唯一**真实的**语义差异：`hR` 的 `now` 原带默认值 `Date.now()` ⇒ 本实现**要求显式传入**（原则 4）。
 *
 * ⚠️ 本模块**不接触** `window`/`Date`/随机（原则 4：时间戳解析在 `lib/time`，本模块只用注入的 `now`）。
 */

import { MAX_JOB_AGE_MS } from '@/constants';
import { parseSiteTimestamp } from '@/lib/time';

/** 站点侧一条视频记录（只取本规则需要的字段） */
export interface SiteVideoRecord {
  /** 站点侧唯一键（原 `v.key`）—— 指派的**左值** */
  key: string;
  /** 站点时间戳（秒或毫秒；字符串或数字；原 `w.created_at`） */
  created_at?: unknown;
}

/** 画布侧一条发送任务（只取本规则需要的字段） */
export interface SendJobRecord {
  /** 指派的**右值**（原 `a[i].nodeId`） */
  nodeId: string;
  /** 发送时刻（ms；原 `sendTime`） */
  sendTime?: number | null;
}

/** 匹配输入 */
export interface VideoMatchInput<TVid extends SiteVideoRecord> {
  vids?: readonly TVid[] | null;
  jobs?: readonly SendJobRecord[] | null;
  /** 兜底节点：给「没配上的最后一个视频」（原 `fallbackNodeId`） */
  fallbackNodeId?: string | null;
  /** 节点是否还活着（原 `isNodeAlive`）—— 不传则不过滤 */
  isNodeAlive?: ((nodeId: string) => boolean) | null;
  /** 当前时刻（ms）—— **必须注入**（原则 4） */
  now: number;
  maxJobAgeMs?: number;
}

/** 匹配结果 */
export interface VideoMatchResult {
  /** `视频key → 节点id`（`null` = 未匹配） */
  assignment: Map<string, string | null>;
  /** 没被任何视频用掉的任务（原 `leftoverJobs`） */
  leftoverJobs: SendJobRecord[];
}

/**
 * 活任务过滤（原 `Kk` 35758）
 * 三个条件依次：有 `nodeId` → `isNodeAlive` → `now - sendTime <= maxJobAgeMs`
 */
export function filterLiveJobs(
  jobs: readonly SendJobRecord[] | null | undefined,
  isNodeAlive: ((nodeId: string) => boolean) | null | undefined,
  now: number,
  maxJobAgeMs: number = MAX_JOB_AGE_MS,
): SendJobRecord[] {
  return (jobs || [])
    .filter((j) => !!j && !!j.nodeId)
    .filter((j) => !isNodeAlive || isNodeAlive(j.nodeId))
    .filter((j) => now - (j.sendTime || 0) <= maxJobAgeMs);
}

/**
 * 站点视频 ↔ 画布节点回填匹配（原 `hR` 35767）
 *
 * ⚠️ DP 用**扁平 `Float64Array`/`Uint8Array`** 而非二维数组：
 *    `tsconfig` 开了 `noUncheckedIndexedAccess`，二维数组下标会退化成 `| undefined`，
 *    逼出满屏 `!` 或 `as`；扁平类型化数组配 `?? INF` 兜底**零断言**且更快。
 */
export function matchVideosToNodes<TVid extends SiteVideoRecord>(
  input: VideoMatchInput<TVid>,
): VideoMatchResult {
  const fallback = input.fallbackNodeId ?? null;
  const maxAge = input.maxJobAgeMs ?? MAX_JOB_AGE_MS;

  // ① 活任务，按 sendTime 升序
  const jobs = filterLiveJobs(input.jobs, input.isNodeAlive, input.now, maxAge).sort(
    (a, b) => (a.sendTime || 0) - (b.sendTime || 0),
  );

  // ② 视频记录：附原序号与解析出的时间戳
  const vids = (input.vids || []).map((v, i) => ({ v, i, ts: parseSiteTimestamp(v?.created_at) }));

  // ③ ★ 全有时间戳 ⇒ 按时间升序（同刻按原序）；**否则整体反转**（源码如此，不是"跳过排序"）
  if (vids.every((w) => isFinite(w.ts))) {
    vids.sort((a, b) => a.ts - b.ts || a.i - b.i);
  } else {
    vids.reverse();
  }

  const u = vids.length;
  const d = jobs.length;
  const assignment = new Map<string, string | null>();
  /** 「不可达」哨兵（原 `p = Number.MAX_SAFE_INTEGER`） */
  const INF = Number.MAX_SAFE_INTEGER;

  /** 代价（原 `h`）：视频无可用时间戳 → 0（等于不参与比较） */
  const cost = (w: { ts: number }, j: SendJobRecord): number =>
    isFinite(w.ts) ? Math.abs(w.ts - (j.sendTime || 0)) : 0;

  /** 把一批「未匹配」的视频索引：全部 `null`，**最后一个**给 `fallback`（原 `m`） */
  const markLeftover = (idxs: readonly number[]): void => {
    for (const i of idxs) {
      const item = vids[i];
      if (item) assignment.set(item.v.key, null);
    }
    const lastIdx = idxs[idxs.length - 1];
    if (idxs.length > 0 && fallback && lastIdx !== undefined) {
      const item = vids[lastIdx];
      if (item) assignment.set(item.v.key, fallback);
    }
  };

  // ④ 任一侧为空：全部 null + 最后一个给 fallback；**所有**任务都算剩余
  if (u === 0 || d === 0) {
    for (const item of vids) assignment.set(item.v.key, null);
    if (u > 0 && fallback) {
      const last = vids[u - 1];
      if (last) assignment.set(last.v.key, fallback);
    }
    return { assignment, leftoverJobs: jobs.slice() };
  }

  if (u <= d) {
    // ⑤ 视频少 ⇒ 把**每个视频**配到某个任务（保序），最小化总时间差
    const stride = d + 1;
    const c = new Float64Array((u + 1) * stride).fill(INF);
    const took = new Uint8Array((u + 1) * stride);
    for (let z = 0; z <= d; z += 1) c[z] = 0; // C[0][*] = 0

    for (let z = 1; z <= u; z += 1) {
      for (let o = 1; o <= d; o += 1) {
        const skip = c[z * stride + (o - 1)] ?? INF; // 不把第 z 个视频配给第 o 个任务
        const diag = c[(z - 1) * stride + (o - 1)] ?? INF;
        const vidItem = vids[z - 1];
        const jobItem = jobs[o - 1];
        const take = diag === INF || !vidItem || !jobItem ? INF : diag + cost(vidItem, jobItem);
        if (take <= skip) {
          c[z * stride + o] = take;
          took[z * stride + o] = 1;
        } else {
          c[z * stride + o] = skip;
          took[z * stride + o] = 0;
        }
      }
    }

    // 回溯出每个视频配到的任务下标（-1 = 未匹配）
    const e = new Int32Array(u).fill(-1);
    let p = u;
    let j = d;
    while (p > 0 && j > 0) {
      if ((took[p * stride + j] ?? 0) === 1) {
        e[p - 1] = j - 1;
        p -= 1;
      }
      j -= 1;
    }

    const usedJobs = new Set<number>();
    for (const idx of e) if (idx >= 0) usedJobs.add(idx);

    for (const [z, item] of vids.entries()) {
      const jobIdx = e[z] ?? -1;
      const job = jobIdx >= 0 ? jobs[jobIdx] : undefined;
      // ⚠️ 防御式兜底：`E[z]` 在本分支恒 >= 0（见文件头 ①）⇒ `null` 分支仅防御契约外输入
      assignment.set(item.v.key, job ? job.nodeId : null);
    }

    return { assignment, leftoverJobs: jobs.filter((_, idx) => !usedJobs.has(idx)) };
  }

  // ⑥ 任务少 ⇒ **转置**：把每个任务配到某个视频
  const stride2 = u + 1;
  const c2 = new Float64Array((d + 1) * stride2).fill(INF);
  const took2 = new Uint8Array((d + 1) * stride2);
  for (let z = 0; z <= u; z += 1) c2[z] = 0; // w[0][*] = 0

  for (let z = 1; z <= d; z += 1) {
    for (let o = 1; o <= u; o += 1) {
      const skip = c2[z * stride2 + (o - 1)] ?? INF;
      const diag = c2[(z - 1) * stride2 + (o - 1)] ?? INF;
      const jobItem = jobs[z - 1];
      const vidItem = vids[o - 1];
      const take = diag === INF || !jobItem || !vidItem ? INF : diag + cost(vidItem, jobItem);
      if (take <= skip) {
        c2[z * stride2 + o] = take;
        took2[z * stride2 + o] = 1;
      } else {
        c2[z * stride2 + o] = skip;
        took2[z * stride2 + o] = 0;
      }
    }
  }

  // 回溯：y[任务下标] = 视频下标
  const y = new Int32Array(d).fill(-1);
  let b = d;
  let x = u;
  while (b > 0 && x > 0) {
    if ((took2[b * stride2 + x] ?? 0) === 1) {
      y[b - 1] = x - 1;
      b -= 1;
    }
    x -= 1;
  }

  // 反转成「视频下标 → 任务下标」
  const k = new Int32Array(u).fill(-1);
  for (let i = 0; i < d; i += 1) {
    const vidIdx = y[i] ?? -1;
    if (vidIdx >= 0) k[vidIdx] = i;
  }

  for (const [i, item] of vids.entries()) {
    const jobIdx = k[i] ?? -1;
    const job = jobIdx >= 0 ? jobs[jobIdx] : undefined;
    assignment.set(item.v.key, job ? job.nodeId : null);
  }

  const unmatched: number[] = [];
  for (let i = 0; i < u; i += 1) if ((k[i] ?? -1) < 0) unmatched.push(i);
  markLeftover(unmatched);

  // ⚠️ 转置分支**恒定返回空** `leftoverJobs`（源码如此：任务数少于视频数时全部被用上）
  return { assignment, leftoverJobs: [] };
}
