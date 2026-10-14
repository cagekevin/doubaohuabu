/**
 * 「发送后检测」控制器（原 `it` / `postSendDetect`，`_Component43.jsx:1319-1737`）
 *
 * ★ **做什么**：发送成功后盯住该账号的 aispace 页 —— 轮询宿主 `detectVideos`（**只读、零注入**），
 *   把**新出现的视频**按时间**归属**到画布节点（`core/rules/media.matchVideosToNodes` = 源 `hR`），
 *   落进「无水印分享」（`addVideoShare`）＋ 画布（`addVideoNode`）。
 *
 * ⚠️ **不占租约**（与 `sendWatch` 的一处**有意差异**）：源 `it` 用的是**发送那个 webview**、不申请租约；
 *   检测最长 50 分钟，占租约会把账号**锁死** ⇒ 走 `BackendPagePort.webContentsIdOf`（不占租约）。
 * ⚠️ **原则 1**：只有本文件写 store（`addVideoShare` / `addVideoNode` / 计时器）。
 * ⚠️ **原则 6**：取数失败**如实记**（一律 `log.warn`，见各处；不静默、不编文案）。
 * ⚠️ **不开自动轮询**（`docs/过程.md` #4）：轮询只在**本函数调用期间**存在，返回即停。
 * ⚠️ **一处如实标注**（未落，不假装）：源 `Z` 里「同一 `vid` 已落过就跳过」由 `addVideoNode`
 *   内部去重承担（本仓同）。
 *
 * ★ **2026-10-13 补**（`BP-04`）：计时器启动接上**页内探测**（原 `ze(Y, Hd, 'detect-gen-submit')`，
 *   `:1565`）—— 此前恒走兜底档（等满 `DETECT_TIMER_FALLBACK_MS`）。现在：命中「已提交」回复 ⇒
 *   **立刻**起计时；探不到 / 站点无该能力 ⇒ 退回兜底档（`SitePort.probeGenSubmitted`）。
 */

import type { Ports } from '@/core/ports';
import type { AppStore } from './store';
import type { Account } from '@/stable/model/account';
import type { ImageQuestionContext, SitePort } from '@/core/ports/site.port';
import type { DetectedVideo } from '@/core/ports/host.port';
import { matchVideosToNodes, type SendJobRecord } from '@/core/rules/media';
import {
  classifyFirstRound,
  detectCutoff,
  pickFreshVideos,
  seedSeenKeys,
  shouldStartTimer,
} from '@/core/rules/genDetect';
import {
  DETECT_IDLE_END_MS,
  DETECT_MAX_MS,
  DETECT_POLL_MS,
  DETECT_TIMER_FALLBACK_MS,
} from '@/constants';
import { sleep } from '@/lib/async';
import { log } from '@/lib/log';
import { landVideo } from './videoLanding';

export interface PostSendDetectInput {
  /** 本次发送用的账号（源 `it` 的 `ee`） */
  accountId: string;
  /** 发送源节点（原 `Q`；缺 ⇒ 新视频按 `fallbackNodeId` 兜底归属） */
  sourceNodeId?: string | null;
  /**
   * 任务入队时刻（原 `k.current.push` 的 `sendTime`）
   * ⚠️ `conversationId` 支传的是**尝试的 `at`**（源 `ve.at || Date.now()`）；缺省 ⇒ 当前时刻。
   */
  sentAt?: number;
}

export interface PostSendDetectController {
  /**
   * **发送成功后调用**（原 `sendPayload` 里的 `k.current.push({nodeId, sendTime})` ＋ `it(...)`，
   *   `_Component43.jsx:2943-2955`）—— `autoVideoDetect` 关 ⇒ **什么都不做**。
   */
  notifySent(input: PostSendDetectInput): void;
  /** 停掉某账号的检测（源只有自终止；本仓给个显式停口） */
  stop(accountId: string): void;
}

export function createPostSendDetect(store: AppStore, ports: Ports): PostSendDetectController {
  /** 账号 → 取消函数（源 `x.current`：**一个账号只许一条**检测链） */
  const running = new Map<string, () => void>();
  /** 账号 → 待归属的发送任务（源 `k.current`）—— 归属匹配的**右值来源** */
  const jobs = new Map<string, SendJobRecord[]>();
  /**
   * 已见键（源 `b.current`）—— **懒种子**：从**已有** `videoShares` ＋ 视频节点的 `data.vid` 重建
   * （原 `_Component43.jsx:528-538` 的 useEffect）。
   */
  let seen: Set<string> | null = null;
  /**
   * 上面那副已见键是**为哪个工程**建的（原 `z.current`，`_Component43.jsx:526-527`）
   *
   * ⚠️ 工程切换（`activeId` 变）⇒ 源**清空 `b` 并重新播种**（`:526-541`）。不这么做，上一个工程
   *   已见到的视频键会被算作**本工程的基线** ⇒ 切回来后**已经存在的片会被漏**（不是"重复"，是"漏"）。
   */
  let seenProject: string | null = null;

  const st = () => store.useStore.getState();

  const ensureSeen = (): Set<string> => {
    const activeId = st().activeId;
    // ★ 与源同：只有 `z.current !== l` 才重建（同工程 ⇒ 沿用同一份集，让调用方继续 `add`）
    if (seen && seenProject === activeId) return seen;
    seen = seedSeenKeys(st().videoShares, st().nodes);
    seenProject = activeId;
    return seen;
  };

  /** 一条新视频落库（原 `Z`，`:1379-1444`）—— 写点收口在 `state/videoLanding`（判据 C1） */
  const landDetected = (
    v: DetectedVideo,
    accountId: string,
    accountName: string,
    nodeId: string | null,
  ): boolean => {
    if (!v.key || !v.ready || !v.url) return false;
    try {
      landVideo(store, {
        url: v.url,
        vid: v.key,
        width: v.width ?? null,
        height: v.height ?? null,
        duration: v.duration ?? null,
        poster: v.poster ?? null,
        accountId,
        accountName,
        name: v.name || '视频',
        nodeId,
      });
      ensureSeen().add(v.key);
      return true;
    } catch (e: unknown) {
      log.warn('[postSendDetect] 落库失败：', e);
      return false;
    }
  };

  /** 一批新视频 → 归属 → 落库（原 `nt` ＋ 调用处的 `for … Z(...)`） */
  const applyVideos = (
    videos: readonly DetectedVideo[],
    accountId: string,
    accountName: string,
    sourceNodeId: string | null,
  ): number => {
    if (videos.length === 0) return 0;
    const myJobs = jobs.get(accountId) ?? [];
    const match = matchVideosToNodes({
      vids: videos,
      jobs: myJobs,
      fallbackNodeId: sourceNodeId,
      isNodeAlive: (id) => st().nodes.some((n) => n.id === id),
      now: ports.clock.now(),
    });
    // 源 `nt`：没用掉的任务**累减**回 `k.current`（没剩 ⇒ 删键）
    if (match.leftoverJobs.length > 0) jobs.set(accountId, match.leftoverJobs);
    else jobs.delete(accountId);

    let count = 0;
    for (const v of videos) {
      const nodeId = match.assignment.get(v.key) ?? null;
      if (landDetected(v, accountId, accountName, nodeId)) count += 1;
    }
    return count;
  };

  /** 已启动过计时的节点（原 `G`，`:1552`）—— 防同一节点被重复启动 */
  const startedTimer = new Set<string>();

  /**
   * 计时器启动（原 `xe`，`:1553-1583`）
   *
   * ★ **两档**（探测优先、兜底收尾）：
   *   ① 页内探测到「已提交 / 正在生成」回复 ⇒ **立刻**起计时（起点 = 此刻）；
   *   ② 探测不到 / 站点没这个能力 ⇒ 等满 `DETECT_TIMER_FALLBACK_MS` 起（起点 = 入队时刻 + 兜底）。
   * ⚠️ **fire-and-forget**（源 `:1711-1713` 的 `xe(Q).catch(() => {})`）—— 探测慢不许拖住检测轮。
   * ⚠️ **探测失败不阻塞**（源 `try{}catch{}` 空吞）：退回兜底档，**绝不卡死**（原则 6：只留痕）。
   */
  const startPendingTimer = async (
    nodeId: string,
    ctx: ImageQuestionContext,
    site: SitePort | undefined,
  ): Promise<void> => {
    if (!nodeId || startedTimer.has(nodeId)) return;
    const pendingAt = st().nodePendingTimers[nodeId];
    if (pendingAt == null) return;

    // ① 页内探测（原 `ze(Y, Hd, 'detect-gen-submit')`，`:1565`）—— 缺能力 / 失败 ⇒ 当没命中
    let hit = false;
    if (site?.probeGenSubmitted) {
      const r = await site.probeGenSubmitted(ctx);
      if (r.ok) hit = r.value.hit;
      else log.warn('[postSendDetect] 「已提交」探测失败（退回兜底档）：', r.message);
    }

    const now = ports.clock.now();
    if (!shouldStartTimer(pendingAt, now, hit, DETECT_TIMER_FALLBACK_MS)) return;

    // 源 `:1573`：命中 ⇒ 起点 = 此刻；兜底 ⇒ 起点 = 入队时刻 + 兜底阈值
    st().setNodeTimer(nodeId, hit ? now : pendingAt + DETECT_TIMER_FALLBACK_MS);
    st().removeNodePendingTimer(nodeId);
    startedTimer.add(nodeId);
    if (!hit) {
      // 源 `:1577` 的 `console.warn`
      log.warn(
        `[postSendDetect] 节点=${nodeId} 兜底启动计时器（${DETECT_TIMER_FALLBACK_MS / 1000}s 内未探测到「已提交」回复）`,
      );
    }
  };

  const run = async (accountId: string, sourceNodeId: string | null, cancelled: () => boolean): Promise<void> => {
    const account: Account | undefined = st().accounts.find((a) => a.id === accountId);
    if (!account) return;
    const accountName = account.name || '豆包';
    const site = ports.sites[account.type];

    // ① `webContentsId`（**不占租约**）
    const idRes = ports.backendPage.webContentsIdOf(account);
    if (!idRes.ok) {
      log.warn('[postSendDetect] 取 webContentsId 失败：', idRes.message);
      return;
    }
    if (!site?.detectVideos) {
      log.warn('[postSendDetect] 站点无 detectVideos 能力：', account.type);
      return;
    }
    const ctx: ImageQuestionContext = { account, webContentsId: idRes.value };
    let seenSet = ensureSeen();

    // ② 循环参数（源 `:1544-1548`）
    const startedAt = ports.clock.now();
    let lastProgress = startedAt;
    let emitted = false;
    let firstRound = true;
    let baseline: ReadonlySet<string> = new Set<string>();
    let roundNew = 0;

    try {
      while (ports.clock.now() - startedAt < DETECT_MAX_MS) {
        if (cancelled()) break;

        // ★ 工程切换 ⇒ 基线集**重建**（原 `z.current !== l` 的 effect，`:526-541`）。
        //   只有真换了工程才换引用；否则沿用同一份集（本轮 `add` 进去的键不丢）。
        seenSet = ensureSeen();

        const fetched = await site.detectVideos(ctx, [...seenSet]);
        if (!fetched.ok) {
          log.warn('[postSendDetect] 取数失败：', fetched.message);
          await sleep(DETECT_POLL_MS);
          continue;
        }
        if (cancelled()) break;

        const videos = fetched.value.videos;
        const myJobs = jobs.get(accountId) ?? [];
        const cutoff = detectCutoff(
          myJobs.map((j) => j.sendTime ?? 0),
          ports.clock.now(),
        );

        if (firstRound) {
          // ③ **首轮建基线**（源 `:1610-1652`）—— 页面已有的旧片不入结果
          const { baselineKeys, fresh } = classifyFirstRound(videos, cutoff);
          baseline = baselineKeys;
          for (const k of baselineKeys) seenSet.add(k);
          roundNew = applyVideos(fresh, accountId, accountName, sourceNodeId);
          if (roundNew > 0) {
            emitted = true;
            lastProgress = ports.clock.now();
          }
          firstRound = false;
          await sleep(DETECT_POLL_MS);
          continue;
        }

        // ④ 常规轮（源 `:1655-1673`）
        const fresh = pickFreshVideos(videos, cutoff, seenSet, baseline);
        roundNew = applyVideos(fresh, accountId, accountName, sourceNodeId);
        if (roundNew > 0) {
          emitted = true;
          lastProgress = ports.clock.now();
        }
        // 原 `:1711-1713`：`if (Q) { xe(Q).catch(() => {}); }` —— **fire-and-forget**
        if (sourceNodeId) {
          void startPendingTimer(sourceNodeId, ctx, site).catch((e: unknown) => {
            log.warn('[postSendDetect] 计时器启动异常：', e);
          });
        }

        // ⑤ 空闲退出（源 `ge` 900000）
        if (emitted && ports.clock.now() - lastProgress > DETECT_IDLE_END_MS) {
          log.info(`[postSendDetect] 账号=${accountId} 15min 无新增，结束检测`);
          break;
        }
        await sleep(DETECT_POLL_MS);
      }
    } catch (e: unknown) {
      log.warn('[postSendDetect] 异常：', e);
    } finally {
      // ⑥ 把页面站回去（源 `finally` 里 `es(de, La)`）
      try {
        site.leaveDetectPage?.(ctx);
      } catch (e: unknown) {
        log.warn('[postSendDetect] 还原页面失败：', e);
      }
    }
  };

  return {
    notifySent(input) {
      const accountId = input.accountId;
      const sourceNodeId = input.sourceNodeId ?? null;
      if (!accountId) return;
      // 源 `:2943`：`autoVideoDetect` 关 ⇒ **不触发**
      if (!st().autoVideoDetect) return;
      // 源 `:2944-2952`：把这次发送登记成待归属任务
      if (sourceNodeId) {
        const list = jobs.get(accountId) ?? [];
        list.push({ nodeId: sourceNodeId, sendTime: input.sentAt ?? ports.clock.now() });
        jobs.set(accountId, list);
      } else if (!jobs.has(accountId)) {
        jobs.set(accountId, []);
      }
      // 源 `:1346`：同一账号已在跑 ⇒ 排队等待连线（不重入）
      if (running.has(accountId)) {
        log.info(`[postSendDetect] 账号${accountId} 已有检测在跑，本次发送排队等待归属`);
        return;
      }
      let cancelled = false;
      const cancel = (): void => {
        cancelled = true;
      };
      running.set(accountId, cancel);
      void run(accountId, sourceNodeId, () => cancelled).finally(() => {
        if (running.get(accountId) === cancel) running.delete(accountId);
      });
    },

    stop(accountId) {
      const cancel = running.get(accountId);
      if (!cancel) return;
      cancel();
      running.delete(accountId);
    },
  };
}
