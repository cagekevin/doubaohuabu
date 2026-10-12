/**
 * 分析控制器 —— 把 `core/usecases/analyzePrompt` 接到 store（★ 接线层）
 *
 * 依据（**逐行回源抄录**）：
 *   - 节点上的分析动作：`ZL.jsx:168-180` 的 `se()`（`A(true)` 展开面板 → `gS({nodeId, imageUrl})`）
 *   - 节点上的调整动作：`ZL.jsx:181-193` 的 `ke()`（`trim()` 非空且不忙 → `yS({nodeId, instruction})`，
 *     **成功才清空输入框**）
 *   - `fL.jsx:43/52` 是同款（文生视频节点）⇒ 判据 C1
 *
 * ⚠️ 原则 1：**只有 state 能写 store** —— usecase 只返回「要写的 patch + 要提示的话」，
 *    `patchNodeData` / `pushToast` 都发生在本文件。
 * ⚠️ `busyAccountIds` 已换成 `accountBusy`（带 TTL）⇒ 选号前用 `busyIdsOf` **实时推导**。
 */

import type { AppStore } from './store';
import { sendToSiteDeps } from './sendDeps';
import type { Ports } from '@/core/ports';
import type { AnalyzeDeps } from '@/core/usecases/analyzePrompt';
import { analyzeNodePrompt, reviseNodePrompt } from '@/core/usecases/analyzePrompt';
import { busyIdsOf } from '@/core/rules/accountBusy';
// ⚠️ 语气档的**唯一真源**在 `constants/text.ts` —— 本文件**不得**手写 `'info' | 'warn' | 'error'`
//    （比真源少 `'success'`，一改真源就编译不过 = 重复定义，已收口）
import type { ToastLevel } from '@/constants/text';

export interface AnalyzeController {
  /**
   * 分析某节点的图片（原 `ZL.jsx` 的 `se()`）
   * @param imageUrl **当前图片**（由节点组件给 —— 与源 `se()` 的 `d` 同源）
   */
  analyze(nodeId: string, imageUrl: string): Promise<boolean>;
  /** 按用户意见调整（原 `ZL.jsx` 的 `ke()`）；成功 ⇒ `true`（调用方据此清空输入框） */
  revise(nodeId: string, instruction: string): Promise<boolean>;
}

/** 从节点数据里取「原素材图」（原 `yS` 的 `s.data.dataUrl`） */
function originalImageUrlOf(data: Record<string, unknown>): string {
  const v = data.dataUrl;
  return typeof v === 'string' ? v : '';
}

export function createAnalyzeController(store: AppStore, ports: Ports): AnalyzeController {
  const deps: AnalyzeDeps = sendToSiteDeps(store, ports);

  /** 落一次结果（patch 写节点 + toast 提示）——源版是 `u({analyzePrompt})` + `showToast` */
  const applyOutcome = (
    nodeId: string,
    outcome: { patch: unknown; toast: { text: string; level: ToastLevel } | null },
  ): void => {
    const s = store.useStore.getState();
    // ⚠️ `patch === null` = **源版这一步根本不写数据**（`yS` 的五道前置闸）⇒ 只提示
    if (outcome.patch !== null && outcome.patch !== undefined) {
      s.patchNodeData(nodeId, { analyzePrompt: outcome.patch });
    }
    if (outcome.toast) s.pushToast(outcome.toast.text, undefined, outcome.toast.level);
  };

  return {
    async analyze(nodeId, imageUrl) {
      const s = store.useStore.getState();
      const res = await analyzeNodePrompt(deps, {
        nodeId,
        imageUrl,
        accounts: s.accounts,
        busy: busyIdsOf(s.accountBusy, ports.clock.now()),
        strategy: s.poolStrategy,
        now: ports.clock.now(),
      });
      if (!res.ok) {
        // 用例层不该失败（它把一切失败都收进 patch）；真失败 ⇒ **如实上报**（原则 6）
        s.pushBackendError('unknown', res.message);
        return false;
      }
      applyOutcome(nodeId, res.value);
      return true;
    },

    async revise(nodeId, instruction) {
      const s = store.useStore.getState();
      const node = s.nodes.find((n) => n.id === nodeId);
      // 原 `yS` 只对**生成类**节点工作（其它类型没有 `analyzePrompt`）
      if (!node || (node.type !== 'imggen' && node.type !== 'genvideo')) return false;

      const data = node.data;
      const res = await reviseNodePrompt(deps, {
        nodeId,
        // ★ 与源 `yS` 一致：原图取自 **`data.dataUrl`**（不是 `resultUrl`）
        imageUrl: originalImageUrlOf(data),
        instruction,
        previous: (data.analyzePrompt as Record<string, unknown> | undefined) ?? null,
        // ⚠️ `yS` 只用**原分析账号**（用例内部按 `previous.accountId` 找）⇒ 这里仍要传全量
        accounts: s.accounts,
        busy: busyIdsOf(s.accountBusy, ports.clock.now()),
        strategy: s.poolStrategy,
        now: ports.clock.now(),
      });
      if (!res.ok) {
        s.pushBackendError('unknown', res.message);
        return false;
      }
      applyOutcome(nodeId, res.value);
      return true;
    },
  };
}
