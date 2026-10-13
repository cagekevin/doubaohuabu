/**
 * 「CDP 媒体推送」控制器（原 `_Component43.jsx:130-345` 的 `onDolaMedia` 回调）
 *
 * ★ **做什么**：后端（挂了 CDP 调试器的 webview）把捕获到的**图 / 视频**推过来；本控制器
 *   把它归属到账号（`wcId → accountId`）→ 落到画布与「无水印分享」。
 *
 * ⚠️ **视频支**（`:229-336`）＝ `landVideo`（`state/videoLanding`）。
 * ⚠️ **图像支**（`:185-228`，★ BP-03）＝ `ingestImageGenCdp`（下载 `imageFetchDataUrl` →
 *   `addImageGenResult` 查 `imageGenKeyParams` 回填 `params`）。**任务键**由 `registerSent`
 *   的 `key` 参数带进来（**不用源 `imggen:${m}` 前缀 hack** —— 本仓 `CdpJob` 直接存真节点 id）。
 * ⚠️ **原则 1**：只有 `state/**` 写 store（经 `videoLanding` / `apiLanding` 的具名 action）。
 * ⚠️ **原则 2**：订阅在 `state/subscriptions.ts`（唯一注册点），本文件只提供 `handle`。
 * ⚠️ `S`（`wcId → accountId`）**不另建注册表** —— 事件到达时**按需解析**（扫账号 ＋
 *   `BackendPagePort.webContentsIdOf`）。源里 `S` 由组件的 `X(accountId, wcId)` 维护，而本仓
 *   那件事已由 `prepareForSend`/`webContentsIdOf` 覆盖 ⇒ 再建一份就是**第二份真相**。
 * ⚠️ **触发方**：`state/accountOps`（账号节点）＋ `state/generate`（genvideo/imggen 生成）
 *   在**发送成功后**调 `registerSent`（源 `sendPayload` 的 `C.current.push`，`:2957-2970`）。
 */

import type { Ports } from '@/core/ports';
import type { AppStore } from './store';
import type { DolaMediaItem, DolaMediaEvent } from '@/core/ports/host.port';
import { log } from '@/lib/log';
import { landVideo } from './videoLanding';

/** 待归属的一条 CDP 任务（源 `C.current` 的元素） */
interface CdpJob {
  nodeId: string;
  accountId: string;
  accountName: string;
  sentAt: number;
  satisfied: boolean;
  /** ★ 图像任务的生成键（CDP 回流时查 `imageGenKeyParams` 回填 `params`）；视频任务为 `undefined` */
  key?: string;
}

/** 「同一账号刚 satisfied 过」的**静默窗**（原 `K = 12000`，`:332`） */
const SATISFIED_GAP_MS = 12000;
/** 任务时效（原 `tt = 3000000`，`:299`） */
const JOB_MAX_AGE_MS = 3000000;
/** 每账号队列上限（原 `if (ye.length > 20) ye.shift()`，`:2971`） */
const QUEUE_MAX = 20;

export interface DolaMediaController {
  /** **发送成功后**登记一条待归属任务（原 `C.current.push`，`:2957-2970`）；图像任务带 `key` */
  registerSent(accountId: string, sourceNodeId: string, key?: string): void;
  /** 收到一次推送（**订阅转发入口**，由 `state/subscriptions.ts` 调） */
  handle(event: DolaMediaEvent): void;
}

export function createDolaMedia(store: AppStore, ports: Ports): DolaMediaController {
  /** 已见视频 url（源 `P.current`） */
  const seenVideos = new Set<string>();
  /** 已见图像 url（源 `j.current`） */
  const seenImages = new Set<string>();
  /** 账号 → 待归属队列（源 `C.current`） */
  const queues = new Map<string, CdpJob[]>();
  /** 账号 → 最近一次 satisfied 时刻（源 `E.current`） */
  const satisfiedAt = new Map<string, number>();

  const st = () => store.useStore.getState();

  /** `wcId → accountId`（源 `S.current.get(wcId)`）—— **按需解析**，不另建注册表 */
  const accountIdOfWc = (wcId: number | undefined): string | null => {
    if (wcId == null) return null;
    for (const a of st().accounts) {
      const r = ports.backendPage.webContentsIdOf(a);
      if (r.ok && r.value === wcId) return a.id;
    }
    return null;
  };

  /**
   * 从队列取一条匹配任务（原视频支 `:242-275` + 图像支 `nt` `:154-184` 的队列逻辑收口）。
   *
   * `wantImage` 区分图像（`key` 非空）/ 视频（`key` 空）任务 —— 因为本仓两者**混在同一队列**。
   * ⚠️ 有账号 ⇒ 清过期 → 队首 satisfied 且过静默窗出队 → **find** 匹配项出队；
   *    无账号 ⇒ 全局找 `sentAt` 最小的匹配项（源 `:260-275`）。
   */
  const dequeueJob = (accountId: string | null, now: number, wantImage: boolean): CdpJob | null => {
    const match = (j: CdpJob): boolean => (wantImage ? j.key != null : j.key == null);
    const prune = (list: CdpJob[]): void => {
      while (list.length > 0 && now - (list[0]?.sentAt ?? 0) > JOB_MAX_AGE_MS) list.shift();
    };

    if (accountId) {
      const list = queues.get(accountId);
      if (!list) return null;
      prune(list);
      if (list.length === 0) {
        queues.delete(accountId);
        return null;
      }
      const head = list[0];
      if (head) {
        const lastAt = satisfiedAt.get(accountId) ?? 0;
        if (head.satisfied && now - lastAt > SATISFIED_GAP_MS) list.shift();
      }
      const idx = list.findIndex(match);
      if (idx < 0) return null;
      const [job] = list.splice(idx, 1);
      return job ?? null;
    }

    // 无账号信息 ⇒ 全局找 sentAt 最小的匹配项
    let bestJob: CdpJob | null = null;
    let bestList: CdpJob[] | null = null;
    let bestIdx = -1;
    for (const list of queues.values()) {
      prune(list);
      const idx = list.findIndex(match);
      if (idx < 0) continue;
      const j = list[idx];
      if (j && (!bestJob || j.sentAt < bestJob.sentAt)) {
        bestJob = j;
        bestList = list;
        bestIdx = idx;
      }
    }
    if (bestJob && bestList && bestIdx >= 0) {
      bestList.splice(bestIdx, 1);
      return bestJob;
    }
    return null;
  };

  /** 视频支（原 `:229-336`） */
  const handleVideos = (items: readonly DolaMediaItem[]): void => {
    const fresh = items.filter((it) => it && it.type === 'video' && it.url && !seenVideos.has(it.url));
    if (fresh.length === 0) return;
    const now = ports.clock.now();

    for (const item of fresh) {
      seenVideos.add(item.url);
      const accountId = accountIdOfWc(item.wcId);
      const job = dequeueJob(accountId, now, false);
      if (!job) continue;
      job.satisfied = true;
      if (accountId) satisfiedAt.set(accountId, now);

      try {
        landVideo(store, {
          url: item.url,
          // ⚠️ 源在视频支里 `vid` 用的**就是 url**（`addVideoNode({ vid: Y.url })`，`:305/311`）
          vid: item.url,
          width: null,
          height: null,
          duration: null,
          poster: null,
          accountId: job.accountId,
          accountName: job.accountName,
          name: '视频',
          nodeId: job.nodeId,
        });
      } catch (e: unknown) {
        log.warn('[dolaMedia] 落库失败：', e);
      }
    }
  };

  /** 图像支（原 `:185-228`）—— CDP 推送图像 → 下载 → 落点（查 `imageGenKeyParams` 回填） */
  const ingestImageGenCdp = async (job: CdpJob, url: string): Promise<void> => {
    // ① 下载（原 `ingestImageGenCdp` 的 `imageFetchDataUrl`，`:27468-27474`；失败静默 —— 源 `try{}catch{}` 吞）
    const fetched = await ports.host.media.imageFetchDataUrl(url);
    if (!fetched.ok || !fetched.value) return;

    // ② 落点（原 `addImageGenResult`，`:27492-27498`）
    const account = st().accounts.find((a) => a.id === job.accountId);
    const source = account?.type === 'dola' ? 'dola' : 'doubao';
    const outcome = st().addImageGenResult({
      key: job.key ?? '',
      dataUrl: fetched.value,
      source,
      accountName: job.accountName,
      nodeId: job.nodeId,
    });

    // ③ 收满 ⇒ 释放账号占用（原 `:27440-27444`）
    if (outcome.satisfied) {
      try {
        st().releaseAccount(job.accountId);
      } catch (e: unknown) {
        log.warn('[dolaMedia] 释放账号失败：', e);
      }
    }
  };

  /** 图像支调度（原 `:185-231`） */
  const handleImages = (items: readonly DolaMediaItem[]): void => {
    const fresh = items.filter((it) => it && it.type === 'image' && it.url && !seenImages.has(it.url));
    if (fresh.length === 0) return;
    const now = ports.clock.now();

    for (const item of fresh) {
      seenImages.add(item.url);
      const accountId = accountIdOfWc(item.wcId);
      const job = dequeueJob(accountId, now, true);
      if (!job) continue;
      job.satisfied = true;
      if (accountId) satisfiedAt.set(accountId, now);

      // ⚠️ `void` 调 —— 下载 + 落点是异步收尾，不该拖住「推送处理」主链
      void ingestImageGenCdp(job, item.url).catch((e: unknown) => {
        log.warn('[dolaMedia] 图像回流失败：', e);
      });
    }
  };

  return {
    registerSent(accountId, sourceNodeId, key) {
      if (!accountId || !sourceNodeId) return;
      const acc = st().accounts.find((a) => a.id === accountId);
      const list = queues.get(accountId) ?? [];
      list.push({
        nodeId: sourceNodeId,
        accountId,
        accountName: acc?.name || '豆包',
        sentAt: ports.clock.now(),
        satisfied: false,
        ...(key ? { key } : {}),
      });
      queues.set(accountId, list);
      if (list.length > QUEUE_MAX) list.shift();
    },

    handle(event) {
      if (!event || !Array.isArray(event.items)) return;
      handleImages(event.items);
      handleVideos(event.items);
    },
  };
}
