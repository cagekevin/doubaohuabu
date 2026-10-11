/**
 * 批量发送控制器（★ 接线层）—— 给 `runBatchSend`（原 `x3`）装上 `prepare` / `transport`
 *
 * ★ **它补的是 `sendQueue.ts` 留的那个洞**：`runBatchSend` 的 `prepare`（原 `jS` 41229，**345 行**）
 *   与 `transport`（原 `Bu` 40411）当时**都还没落** ⇒ 我落地时就写明了「现在没有装配方」。
 *   本文件用**已落地的件**把它装配起来：
 *
 *   | 注入项 | 本工程用什么 |
 *   |---|---|
 *   | `prepare`（选号 + 组装报文） | `resolveSendAccountForChain`（`sendToSite.ts`，含 doubao→dola 退级）+ `buildVideoPayload`（`rules/payload.ts`） |
 *   | `transport`（发出去） | `SitePort.send(account, payload)`（= 发送 + 等结果，**不是** fire-and-forget） |
 *   | `releaseAccount` | store 的 `releaseAccount`（原 `tn`） |
 *   | `isSending` | store 的 `nodeSendStates`（防重复发送守卫） |
 *
 * ★ **2026-10-10 补齐：`text` 节点路径已接上**。实测原 `jS` 对 `text` 与 `genvideo`
 *   **走的是同一条路径**（41354-41419 一行都不分叉，`mediaType: 'video'`）——
 *   文本节点就是「把正文当提示词发起一次视频生成」。所以差别不在分支，而在**正文怎么来**：
 *   `@` 引用解析（`Ru`/`fk`）+ 关联文本框合并（`d3`/`sR`/`Vk`/`Qc`）。这些件本工程**都已落地**
 *   （`rules/refs.ts` · `rules/prompt.ts` · `rules/graph.ts`）⇒ 这里只是把它们按源顺序接起来。
 *
 * ⚠️ **老工程的 `data.text` 里真的带 `@[id|name]` 标记**（源版 `kL.jsx` 把 chip **读成**
 *   这个字面量存进 `text`）⇒ 引用解析不是可选项，漏了就会把标记原文发给模型。
 *
 * ⚠️ 原则 1：本文件**不直接写 store** —— 写状态走注入的 `onNodeState`（由 `ui` 调
 *   `setNodeSendState`），占用释放走 store 的 action。
 */

import type { AppStore } from './store';
import type { Ports } from '@/core/ports';
import type { SendPayload } from '@/core/ports/site.port';
import { err, ok, type Result } from '@/core/model/result';
import { busyIdsOf } from '@/core/rules/accountBusy';
import { buildVideoPayload } from '@/core/rules/payload';
import { parseRefChips, refsToReferenceLabels } from '@/core/rules/refs';
import {
  mergeLinkedTexts,
  resolveRefMaterial,
  type RefNodeLike,
} from '@/core/rules/prompt';
import { collectLinkedTexts } from '@/core/rules/graph';
import { stripHtml } from '@/lib/text';
import { resolveSendAccountForChain, type SendAccountChoice } from '@/core/usecases/sendToSite';
import { stylePrefixOf } from './generate';
import {
  runBatchSend,
  type BatchCallbacks,
  type BatchSummary,
  type PrepareSendFn,
  type TransportFn,
} from '@/core/usecases/sendQueue';

export interface BatchSendController {
  /** 开始批量发送（原 `L3.jsx` 的 `y`） */
  run(nodeIds: readonly string[], cb: BatchCallbacks): Promise<Result<BatchSummary>>;
  /** 供面板判断"能不能发"（选中 ≥2 个可发送节点） */
  canRun(nodeIds: readonly string[]): boolean;
}

/** 可批量发送的节点类型（原 `$p` 41575：`text` / `genvideo`） */
const SENDABLE_TYPES: readonly string[] = ['text', 'genvideo'];

/**
 * 发送管道（`prepare` + `transport` + `clear`）—— ★ **批量发送与发送队列共用同一套**
 *
 * ★★ **为什么必须抽出来**（判据 C1 三振出局）：`prepare`（原 `jS`）与 `transport`（原发送闭包）
 *   是**两个**消费者都要的东西 —— `runBatchSend`（原 `x3`）与队列泵（原 `TS`）。
 *   不抽就会有两份 `prepare`，其中一份迟早漏掉某次修正（例如上一步刚补的
 *   `@` 引用/关联文本/样式前缀三件事）。
 *
 * ⚠️ **`picked` 是每份管道自己的闭包状态**（键是**报文对象本身**，见下方注释）——
 *   两次 `createSendPipeline` 各持一份，互不干扰。
 * ⚠️ `clear()` 供批量发送在开跑前重置（原 `batchSend.run` 里的 `picked.clear()`）；
 *   平时靠 `transport` 里**用完即删**自清理。
 */
export interface SendPipeline {
  prepare: PrepareSendFn;
  transport: TransportFn;
  clear: () => void;
}

export function createSendPipeline(store: AppStore, ports: Ports): SendPipeline {

  /**
   * `prepare` 选中的账号与站点 —— `transport` 只收 `operation`（拿不到账号）
   * ⇒ 必须在这里记住（源版 `jS` 把 account 直接塞进闭包）。
   *
   * ⚠️ **键是报文对象本身（引用相等）**，不是 nodeId —— 用 nodeId 当键的话，
   *    `transport` 拿到的只是 `operation`，反查会**取到第一个节点的账号**（多节点批量下必错）。
   *    源版 `jS` 是「一个节点一次闭包」所以没这个问题；注入式 API 必须靠引用对上。
   */
  const picked = new Map<unknown, SendAccountChoice>();

  const prepare: PrepareSendFn = (nodeId) => {
    const s = store.useStore.getState();
    const node = s.nodes.find((n) => n.id === nodeId);
    // 原 `jS` 41237-41243：节点不存在或不是 `text`/`genvideo`（`SendFailKind` 里没有 `not-text`
    //   ⇒ 按 `unknown` 报，原文照旧）
    if (!node || (node.type !== 'text' && node.type !== 'genvideo')) {
      return err('unknown', '节点不存在或不是文本框');
    }
    const data = node.data as unknown as Record<string, unknown>;

    // ① 选号（原 `jS` 41247-41292 的 `sendAccount` 五分支；`auto:*` 与 doubao→dola 退级由该函数覆盖）
    const resolved = resolveSendAccountForChain({
      accounts: s.accounts,
      sites: ports.sites,
      sendAccount: node.type === 'genvideo' ? node.data.sendAccount : (data.sendAccount as string | undefined),
      busy: busyIdsOf(s.accountBusy, ports.clock.now()),
      strategy: s.poolStrategy,
    });
    // ⚠️ `resolveSendAccountForChain` 的 `all-busy` 不是 `SendFailKind` 的合法值 ⇒
    //    落到 `busy`（两者对调用方是同一件事：账号暂时不可用）
    if (!resolved.ok) return err(resolved.reason === 'no-account' ? 'no-account' : 'busy', resolved.note);
    const choice = resolved.choice;

    // ② `@` 引用（原 `Ru` 24064 + `jS` 41296-41353 的编号与 `fk` 解析）——
    //    ⚠️ **老工程的 `data.text` 里真的带 `@[id|name]` 标记**（源版 `kL` 把 chip 读成这个),
    //    所以这一步不是可选项；`parseRefChips` 同源（按首次出现编号、同 id 复用编号）
    const raw = typeof data.text === 'string' ? data.text : '';
    const parsed = parseRefChips(stripHtml(raw));
    const nodeMap: Record<string, RefNodeLike> = Object.fromEntries(
      s.nodes.map((n) => [
        n.id,
        { id: n.id, type: n.type, data: n.data as unknown as Record<string, unknown> },
      ]),
    );
    const images = parsed.refs
      .map((r) => resolveRefMaterial(r.id, s.library, nodeMap))
      // 原 `jS` 41347：**只有解析出 `dataUrl` 的**才进参考图
      .filter((m) => m.dataUrl)
      .map((m) => ({ label: m.label || '素材', dataUrl: m.dataUrl }));

    // ③ 正文（原 `jS` 41354-41367：`Qc` → `Vk` → `d3` → `sR`；空 ⇒ **先释放占用再报错**）
    const labelled = refsToReferenceLabels(parsed.text, parsed.refs);
    const linked = collectLinkedTexts(nodeId, s.nodes, s.edges);
    const body = mergeLinkedTexts(labelled.body, linked).trim();
    if (!body) {
      // 原 `jS` 41358-41367：`r.releaseAccountBusy(a.id)` 之后返回 `empty-text`
      store.useStore.getState().releaseAccount(choice.account.id);
      return err('empty-text', '文本框内容为空，无法发送');
    }

    // ④ 报文（原 `TL` = 本工程的 `buildVideoPayload`，与 `generate.ts` 的网页通道**同源**）
    const payload = buildVideoPayload({
      account: { id: choice.account.id, name: choice.account.name, partition: choice.account.partition },
      text: body,
      model: node.type === 'genvideo' ? node.data.model : (data.model as string | undefined),
      duration: node.type === 'genvideo' ? node.data.duration : (data.duration as number | undefined),
      ratio: node.type === 'genvideo' ? node.data.aspectRatio : (data.aspectRatio as string | undefined),
      images,
      sourceNodeId: node.id,
      stylePrefix: stylePrefixOf(
        (node.type === 'genvideo' ? node.data.styleIds : (data.styleIds as string[] | undefined)) ?? [],
      ),
      now: ports.clock.now(),
    });

    // ⚠️ 用**报文对象本身**当键（见 `picked` 的注释）
    picked.set(payload, choice);
    return ok({ account: choice.account, operation: payload });
  };

  const transport: TransportFn = async (operation, opts) => {
    // 从**报文对象**反查账号（引用相等；`prepare` 刚写进去）
    const choice = picked.get(operation);
    if (!choice) return err('unknown', '发送上下文丢失（未找到账号）');
    picked.delete(operation); // 用完即清（避免长批量下攒住所有报文）

    void opts?.onProgress;
    const res = await choice.site.send(choice.account, operation as SendPayload);
    if (!res.ok) return ok({ ok: false, reason: res.reason, note: res.message });
    return ok({ ok: true, sessionId: res.value.sessionId });
  };
  return {
    prepare,
    transport,
    clear: () => picked.clear(),
  };
}

export function createBatchSendController(store: AppStore, ports: Ports): BatchSendController {
  // ★ 管道与发送队列**共用同一套**（见 `createSendPipeline` 的头注释）
  const { prepare, transport, clear } = createSendPipeline(store, ports);


  return {
    canRun(nodeIds) {
      const s = store.useStore.getState();
      const hit = new Set(nodeIds);
      return s.nodes.filter((n) => hit.has(n.id) && SENDABLE_TYPES.includes(n.type)).length >= 2;
    },

    run(nodeIds, cb) {
      const s = store.useStore.getState();
      clear();
      return runBatchSend(
        {
          nodeIds,
          nodes: s.nodes,
          // 防重复发送守卫（原 `x3` 41676-41690）
          isSending: (id) => s.nodeSendStates[id]?.status === 'sending',
          prepare,
          transport,
          // 释放占用（原 `releaseAccountBusy`）
          releaseAccount: (id) => {
            store.useStore.getState().releaseAccount(id);
          },
        },
        cb,
      );
    },
  };
}
