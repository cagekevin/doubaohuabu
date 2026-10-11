/**
 * 生成编排（**state 层：唯一把生成结果写进 store 的地方**）
 *
 * 依据：§6.5 原则 1 —— `core/usecases` 只返回 `Result`，**不写 store**；
 *       写入由本文件负责。
 *
 * ⚠️ 原则 6：失败时 `message` **原样**写入 `backendErrors`（不改写）
 * ⚠️ 本文件属于 `state`，**不得** import `adapters`（端口由 container 注入）
 */

import type { Ports } from '@/core/ports';
import type { AppStore } from './store';
import { generateImage, generateVideo, type GenDeps } from '@/core/usecases/generate';
import { pickAccount } from '@/core/rules/accountPool';
import { busyIdsOf } from '@/core/rules/accountBusy';
import { DEFAULT_IMAGE_RESOLUTION } from '@/constants/models';
import { DEFAULT_STYLE_PRESETS } from '@/constants/stylePresets';

export interface GenController {
  /** 对某个节点触发生成；返回是否成功（失败已写进 `backendErrors`） */
  runForNode(nodeId: string): Promise<boolean>;
}

export function createGenController(store: AppStore, ports: Ports): GenController {
  const deps: GenDeps = {
    sites: ports.sites,
    host: ports.host,
    clock: ports.clock,
    // 风格前缀：从工程内 styleIds 查预设（M7 先用内置表；M5 的 usecase 只依赖这个函数）
    stylePrefixOf: (ids) => stylePrefixOf(ids),
    // ★ 占用 / 释放（原 `Fi` / `tn`）—— **真正的 `set` 发生在 state**（原则 1）；
    //   注入给用例是因为「占用」必须在「用例内部选号之后、发送之前」发生。
    //   这是 `docs/14` §8「`setBusyAccounts` 零调用」的修法。
    holdAccount: (accountId, nodeId) =>
      store.useStore.getState().holdAccount(accountId, { itemId: null, nodeId }),
    releaseAccount: (accountId) => {
      store.useStore.getState().releaseAccount(accountId);
    },
  };

  return {
    async runForNode(nodeId) {
      const s = store.useStore.getState();
      const node = s.nodes.find((n) => n.id === nodeId);
      if (!node) {
        // ★ 经**唯一写入口** `pushBackendError`（带 kind 去重 + 统一 id）
        //   —— 原先是直改 `setState` 绕过它（TD-07-2）
        store.useStore.getState().pushBackendError('unknown', `节点不存在：${nodeId}`);
        return false;
      }
      if (node.type !== 'imggen' && node.type !== 'genvideo') {
        store.useStore.getState().pushBackendError('unknown', `节点类型 ${node.type} 不支持生成`);
        return false;
      }

      // ★ 选号（W11 的池调度）—— 全忙 ⇒ 排队提示；无可用 ⇒ 明确报错
      //   ⚠️ 忙账号**按 TTL 实时推导**（`busyIdsOf`），不把"过期"状态写进 store
      const picked = pickAccount(s.accounts, {
        strategy: s.poolStrategy,
        busy: busyIdsOf(s.accountBusy, ports.clock.now()),
      });
      if (!picked.account && picked.reason === 'no-account') {
        // 无可用账号时仍允许走 API 通道
        if (s.apiSetup.imageProviderId || s.apiSetup.videoProviderId) {
          // 继续（API 通道不需要账号）
        } else {
          store.useStore.getState().pushBackendError('unknown', '无可用账号');
          return false;
        }
      }

      const styleIds = node.data.styleIds ?? [];
      const ratio = node.data.aspectRatio;
      const text = node.data.text ?? '';
      const sourceNodeId = node.id;

      // 标记「生成中」（写入由 state 负责）
      store.useStore.getState().patchNodeData(nodeId, { generating: true });

      const res =
        node.type === 'imggen'
          ? await generateImage(deps, {
              accounts: s.accounts,
              poolStrategy: s.poolStrategy,
              accountId: node.data.sendAccount,
              styleIds,
              ratio,
              text,
              count: node.data.imageCount ?? 1,
              model: node.data.igModel,
              resolution: node.data.igResolution ?? DEFAULT_IMAGE_RESOLUTION,
              channel: node.data.channel === 'api' ? 'api' : 'doubao',
              sourceNodeId,
            })
          : await generateVideo(deps, {
              accounts: s.accounts,
              poolStrategy: s.poolStrategy,
              accountId: node.data.sendAccount,
              styleIds,
              ratio,
              text,
              model: node.data.model,
              duration: node.data.duration,
              channel: node.data.channel === 'api' ? 'api' : 'doubao',
              sourceNodeId,
            });

      const now = ports.clock.now();
      if (!res.ok) {
        // ★ 原样写进 backendErrors（原则 6）—— 同上，走唯一写入口
        store.useStore.getState().patchNodeData(nodeId, { generating: false });
        store.useStore.getState().pushBackendError('unknown', res.message);
        return false;
      }

      // 成功：把结果落到节点（`imggen` 写 results / `genvideo` 写 resultUrl）
      const first = res.value.results?.[0];
      if (node.type === 'imggen') {
        const prev = node.data.results ?? [];
        store.useStore.getState().patchNodeData(nodeId, {
          generating: false,
          ...(first ? { results: [...prev, first], resultUrl: first.ref } : {}),
        });
      } else {
        store.useStore.getState().patchNodeData(nodeId, {
          generating: false,
          ...(first ? { resultUrl: first.ref, resultAt: now } : {}),
        });
      }
      return true;
    },
  };
}

/**
 * 风格 id → 拼接前缀（真源在 `constants/stylePresets` 的 `DEFAULT_STYLE_PRESETS`）
 * ⚠️ **纯前缀拼接、按 `styleIds[]` 顺序依次拼**（W8）
 * ⚠️ 未知 id **跳过**（不抛、不造前缀）
 */
/** ★ 导出以便 `state/batchSend.ts` 复用（同一套风格前缀，避免第二份实现） */
export function stylePrefixOf(ids: readonly string[]): string {
  if (!ids || ids.length === 0) return '';
  const table = new Map(DEFAULT_STYLE_PRESETS.map((p) => [p.id, p.prefix]));
  return ids.map((id) => table.get(id) ?? '').join('');
}
