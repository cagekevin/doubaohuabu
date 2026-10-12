/**
 * 「CDP 媒体推送」控制器（原 `_Component43.jsx:130-345` 的 `onDolaMedia` 回调）
 *
 * ★ **做什么**：后端（挂了 CDP 调试器的 webview）把捕获到的**图 / 视频**推过来；本控制器
 *   把它归属到账号（`wcId → accountId`）→ 落到画布与「无水印分享」。
 *
 * ⚠️ **只落视频支**（`:229-336`）。**图像支未落**（`:185-228`）—— 它要 `ingestImageGenCdp`
 *   （源 `shared.js:27454`）＋ `addImageGenResult`，本仓两者皆无 ⇒ **不假装**：图像事件只记
 *   「已见」避免重复处理（将来落图像支时不必回改订阅）。
 * ⚠️ **原则 1**：只有 `state/**` 写 store（经 `state/videoLanding` 的唯一写点）。
 * ⚠️ **原则 2**：订阅在 `state/subscriptions.ts`（唯一注册点），本文件只提供 `handle`。
 * ⚠️ `S`（`wcId → accountId`）**不另建注册表** —— 事件到达时**按需解析**（扫账号 ＋
 *   `BackendPagePort.webContentsIdOf`）。源里 `S` 由组件的 `X(accountId, wcId)` 维护，而本仓
 *   那件事已由 `prepareForSend`/`webContentsIdOf` 覆盖 ⇒ 再建一份就是**第二份真相**
 *   （「能一种的别搞两种」）。
 * ⚠️ **触发方**：`state/accountOps` 在**发送成功后**调 `registerSent`（源 `sendPayload` 的
 *   `C.current.push`，`:2957-2970`）。
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
}

/** 「同一账号刚 satisfied 过」的**静默窗**（原 `K = 12000`，`:332`） */
const SATISFIED_GAP_MS = 12000;
/** 任务时效（原 `tt = 3000000`，`:299`） */
const JOB_MAX_AGE_MS = 3000000;
/** 每账号队列上限（原 `if (ye.length > 20) ye.shift()`，`:2971`） */
const QUEUE_MAX = 20;

export interface DolaMediaController {
  /** **发送成功后**登记一条待归属任务（原 `C.current.push`，`:2957-2970`） */
  registerSent(accountId: string, sourceNodeId: string): void;
  /** 收到一次推送（**订阅转发入口**，由 `state/subscriptions.ts` 调） */
  handle(event: DolaMediaEvent): void;
}

export function createDolaMedia(store: AppStore, ports: Ports): DolaMediaController {
  /** 已见视频 url（源 `P.current`） */
  const seenVideos = new Set<string>();
  /** 已见图像 url（源 `j.current`）—— 图像支未落，仅用于去重 */
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

  /** 视频支（原 `:229-336`） */
  const handleVideos = (items: readonly DolaMediaItem[]): void => {
    const fresh = items.filter((it) => it && it.type === 'video' && it.url && !seenVideos.has(it.url));
    if (fresh.length === 0) return;
    const now = ports.clock.now();

    for (const item of fresh) {
      seenVideos.add(item.url);
      const accountId = accountIdOfWc(item.wcId);
      let job: CdpJob | null = null;

      if (accountId) {
        const list = queues.get(accountId) ?? null;
        if (list) {
          // 清过期 → 空则删键 → 否则按「已 satisfied 且过了静默窗」出队 → 取队首
          while (list.length > 0 && now - (list[0]?.sentAt ?? 0) > JOB_MAX_AGE_MS) list.shift();
          if (list.length === 0) {
            queues.delete(accountId);
          } else {
            const head = list[0];
            if (head) {
              const lastAt = satisfiedAt.get(accountId) ?? 0;
              if (head.satisfied && now - lastAt > SATISFIED_GAP_MS) list.shift();
              job = list[0] ?? null;
            }
          }
        }
      }

      // 无账号信息 ⇒ 源的做法：全局找 **sentAt 最小** 的那条（`:260-275`）
      if (!job && !accountId) {
        let bestJob: CdpJob | null = null;
        let bestList: CdpJob[] | null = null;
        for (const list of queues.values()) {
          while (list.length > 0 && now - (list[0]?.sentAt ?? 0) > JOB_MAX_AGE_MS) list.shift();
          const head = list[0];
          if (head && (!bestJob || head.sentAt < bestJob.sentAt)) {
            bestJob = head;
            bestList = list;
          }
        }
        if (bestJob && bestList) job = bestList.shift() ?? null;
      }

      if (!job) continue;
      const target = job;
      target.satisfied = true;
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
          accountId: target.accountId,
          accountName: target.accountName,
          name: '视频',
          nodeId: target.nodeId,
        });
      } catch (e: unknown) {
        log.warn('[dolaMedia] 落库失败：', e);
      }
    }
  };

  return {
    registerSent(accountId, sourceNodeId) {
      if (!accountId || !sourceNodeId) return;
      const acc = st().accounts.find((a) => a.id === accountId);
      const list = queues.get(accountId) ?? [];
      list.push({
        nodeId: sourceNodeId,
        accountId,
        accountName: acc?.name || '豆包',
        sentAt: ports.clock.now(),
        satisfied: false,
      });
      queues.set(accountId, list);
      if (list.length > QUEUE_MAX) list.shift();
    },

    handle(event) {
      if (!event || !Array.isArray(event.items)) return;
      // ⚠️ 图像支**未落**（需 `ingestImageGenCdp` ＋ `addImageGenResult`）—— 只记已见
      for (const it of event.items) {
        if (it && it.type === 'image' && it.url) seenImages.add(it.url);
      }
      handleVideos(event.items);
    },
  };
}
