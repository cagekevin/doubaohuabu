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
import { err, ok, type Result } from '@/core/model/result';
import { busyIdsOf } from '@/core/rules/accountBusy';
// ★ 名字不再重复（结构约束 M1，`docs/11` §六·六）：跨进程报文 = `WirePayload`；
//   站点入参 = `SiteSendPayload`（品牌类型，只由 `toSitePayload` 产出）
import { buildVideoPayload, toSitePayload, type WirePayload } from '@/core/rules/payload';
import { parseRefChips, refsToReferenceLabels } from '@/core/rules/refs';
import {
  mergeLinkedTexts,
  resolveRefMaterial,
  type RefNodeLike,
} from '@/core/rules/prompt';
import { collectLinkedTexts } from '@/core/rules/graph';
import { stripHtml } from '@/lib/text';
import { resolveSendAccountForChain, type SendAccountChoice } from '@/core/usecases/sendToSite';
import { stylePrefixOf } from '@/core/rules/style';
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
 * 发送管道（`prepare` + `transport`）—— ★ **批量发送与发送队列共用同一套**
 *
 * ★★ **为什么必须抽出来**（判据 C1 三振出局）：`prepare`（原 `jS`）与 `transport`（原发送闭包）
 *   是**两个**消费者都要的东西 —— `runBatchSend`（原 `x3`）与队列泵（原 `TS`）。
 *   不抽就会有两份 `prepare`，其中一份迟早漏掉某次修正（例如上一步刚补的
 *   `@` 引用/关联文本/样式前缀三件事）。
 *
 * ★ **TD-03-18**（2026-10-11）：管道此前还有第三个成员 `clear()` —— 它只为清一张
 *   **走私账号的 Map**（`picked`，键 ＝ **报文对象引用**）。现 `prepare` 把「账号 ＋ 站点」
 *   直接放进产物、`transport` 从**入参**取 ⇒ **Map 与 `clear()` 一并删除**（无共享状态可清）。
 */
export interface SendPipeline {
  prepare: PrepareSendFn;
  transport: TransportFn;
}

export function createSendPipeline(store: AppStore, ports: Ports): SendPipeline {

  const prepare: PrepareSendFn = (nodeId, opts) => {
    const s = store.useStore.getState();
    const node = s.nodes.find((n) => n.id === nodeId);
    // 原 `jS` 41237-41243：节点不存在或不是 `text`/`genvideo`（`SendFailKind` 里没有 `not-text`
    //   ⇒ 按 `unknown` 报，原文照旧）
    if (!node || (node.type !== 'text' && node.type !== 'genvideo')) {
      return err('unknown', '节点不存在或不是文本框');
    }
    const data = node.data;

    // ① 选号 —— ★ **`TD-03-18`**：调用方（队列）**已经选好并占住**了 ⇒ **直接用**，不再选第二次。
    //   ⛔ 不要"队列占一次 + 这里再选一次"：占住的账号在忙表里 ⇒ 第二次选号会**跳过它另选一个**
    //   ⇒ **面板显示的账号 ≠ 实际发送的账号**（且占的那个白占）。现在只有**一套选号**。
    let choice: SendAccountChoice;
    const forced = opts?.forced ?? null;
    if (forced) {
      choice = {
        account: forced.account,
        site: forced.site,
        type: forced.site.kind,
        degraded: forced.degraded ?? false,
      };
    } else {
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
      choice = resolved.choice;
    }

    // ② `@` 引用（原 `Ru` 24064 + `jS` 41296-41353 的编号与 `fk` 解析）——
    //    ⚠️ **老工程的 `data.text` 里真的带 `@[id|name]` 标记**（源版 `kL` 把 chip 读成这个),
    //    所以这一步不是可选项；`parseRefChips` 同源（按首次出现编号、同 id 复用编号）
    const raw = typeof data.text === 'string' ? data.text : '';
    const parsed = parseRefChips(stripHtml(raw));
    const nodeMap: Record<string, RefNodeLike> = Object.fromEntries(
      s.nodes.map((n) => [
        n.id,
        { id: n.id, type: n.type, data: n.data },
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

    // ★ 发报**之前**清掉该节点的三样历史状态（原 `shared.js:41384-41392`：`clearNodeWaitTime`
    //   / `clearNodeNotice` / `clearNodeSwitch` 连着三下）—— 否则上一轮的倒计时 / 回复提示 /
    //   换号结果会**一直挂在节点上**不消失。⚠️ 源那三处是 `try{}catch{}` 吞；本仓这三个 action
    //   自身幂等（没东西可清就直接 return）⇒ 不必包 try。
    s.clearNodeWaitTime(nodeId);
    s.clearNodeNotice(nodeId);
    s.clearNodeSwitch(nodeId);

    // ④ 报文（原 `TL` = 本工程的 `buildVideoPayload`，与 `generate.ts` 的网页通道**同源**）
    const payload = buildVideoPayload({
      account: { id: choice.account.id, name: choice.account.name, partition: choice.account.partition },
      text: body,
      model: node.type === 'genvideo' ? node.data.model : (data.model as string | undefined),
      duration: node.type === 'genvideo' ? node.data.duration : (data.duration as number | undefined),
      ratio: node.type === 'genvideo' ? node.data.aspectRatio : (data.aspectRatio as string | undefined),
      images,
      sourceNodeId: node.id,
      // ★ 2026-10-11（TD-07-1）：前缀拼接改用**纯层** `core/rules/style.stylePrefixOf`，
      //   并传**当前风格表**（源 `nu(styleIds, G.styles)` 也是查 store 的表，不是内置表）
      stylePrefix: stylePrefixOf(
        (node.type === 'genvideo' ? node.data.styleIds : (data.styleIds as string[] | undefined)) ?? [],
        store.useStore.getState().styles,
      ),
      now: ports.clock.now(),
    });

    return ok({ account: choice.account, site: choice.site, operation: payload });
  };

  const transport: TransportFn = async ({ account, site, operation }, opts) => {
    // ★ **`TD-07-8` 接线（回源 `shared.js:40411-40475` 的 `Bu`）**：传输**必须发进度事件** ——
    //   否则队列侧 `sendQueue.ts` 的处理器（**逐字对源** `shared.js:41729`，只认 `success`/`error`）
    //   **永不触发**（此前 `void opts?.onProgress;` 把这个缺口盖住了，见 `TD-02-18`）。
    //   ⚠️ **如实说明**：源 `Bu` 另发 `start` / `retry` / `transport` —— 本实现**没有重试循环**
    //      （`Bu` 的 `maxRetries` 默认 1），故 `retry` **不可达**（不假装：这里只发 `start`/`success`/`error`）。
    opts?.onProgress?.({ type: 'start', attempt: 0, maxRetries: 0 });
    // ★ **必须过组装器**：`prepare` 产出的 operation 是**跨进程报文**（字段在 `content` 下），
    //   而 `site.send` 收的是**扁平形态**。此前这里直接 `as SendPayload` 传下去 ⇒ 适配器读到的
    //   `payload.text` / `payload.images` 恒为 `undefined`（`payload.images.length` 会**直接抛**）。
    //   组装器从 `core/rules/payload.toSitePayload` 取（与 `usecases/generate` 同一份，判据 C1）。
    const res = await site.send(
      account,
      toSitePayload(operation as WirePayload<Record<string, unknown>>),
    );
    if (!res.ok) {
      // 与源同：失败先发 `error`（带原文），再返回结果 —— 两条路都给到调用方
      opts?.onProgress?.({ type: 'error', note: res.message });
      return ok({ ok: false, reason: res.reason, note: res.message });
    }
    opts?.onProgress?.({ type: 'success' });
    // ★ **记住"最近一次成功发送用的账号"**（原 `lastSentAccountId`，源 `OL.jsx:360`
    //   "已自动发送/填入成功后 `setLastSentAccount(V.id)`"；另一处写方是换号重发，本仓无那条链）。
    //   ⚠️ 它的**唯一读方**是顶栏「豆包后台」入口的补齐逻辑 —— 见 `core/rules/accountPick.pickActiveAccountFallback`。
    store.useStore.getState().setLastSentAccount(account.id);
    return ok({ ok: true, sessionId: res.value.sessionId });
  };
  return { prepare, transport };
}

export function createBatchSendController(store: AppStore, ports: Ports): BatchSendController {
  // ★ 管道与发送队列**共用同一套**（见 `createSendPipeline` 的头注释）
  const { prepare, transport } = createSendPipeline(store, ports);


  return {
    canRun(nodeIds) {
      const s = store.useStore.getState();
      const hit = new Set(nodeIds);
      return s.nodes.filter((n) => hit.has(n.id) && SENDABLE_TYPES.includes(n.type)).length >= 2;
    },

    run(nodeIds, cb) {
      const s = store.useStore.getState();
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
