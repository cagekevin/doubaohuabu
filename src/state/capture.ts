/**
 * 截图控制器（★ 装配层）—— 原 `$T`(32328) + `Rk`(32351-32371)
 *
 * ★★ **它把三段接起来**：**① 注册表取元素**（`lib/captureRegistry`，原 `Lu`）→
 *   **② 纯层算矩形**（`toCaptureRect`，原 `$T` 32333-32343）→ **③ 宿主截图**（`MediaPort.captureRect`）
 *   → **④ 落成素材节点**（`addScreenshotMaterial`，原 `Rk` 的尾三行）。
 *
 * 依据（**逐行回源**）：
 *   | 步 | 源 | 语义 |
 *   |---|---|---|
 *   | 取元素 | `Lu.get` 32329 | 没有/太小 ⇒ **放弃**（不抛） |
 *   | 矩形 | 32337-32343 | `× dpr`（`dpr` 由 `bootstrap` 注入 —— `state` 不读运行环境） |
 *   | 截图 | 32344-32349 | `captureRect` 失败或没返回 ⇒ 放弃 |
 *   | 时间 | 32364 | `el.currentTime \|\| 0` —— ★ **从 DOM 元素上读播放位置** |
 *   | 标签 | 32365 | `` `${label \|\| vid \|\| '视频'}_截图_${MM-SS}` `` |
 *   | 落点 | `addScreenshotMaterial` | 见 action 注释 |
 *
 * ⚠️ 原则 1：不写 store —— 通过 `store.useStore.getState().addScreenshotMaterial(...)` 走 action。
 * ⚠️ 源版 `Rk` 在失败时返回 `null`（**静默**）⇒ 本实现返回 `{ok, reason}`，
 *   由调用方决定要不要提示（**不静默**：截图失败用户必须知道，否则会反复点）。
 */

import { COMMON_TEXT } from '@/constants/text';
import { asRecord } from '@/lib/object';
import { captureElementOf } from '@/lib/captureRegistry';
import { formatClipTime, toCaptureRect } from '@/core/rules/capture';
import type { AppStore } from './store';
import type { Ports } from '@/core/ports';

export interface CaptureResult {
  ok: boolean;
  /** 失败原因（原文，供提示） */
  reason?: string;
}

export interface CaptureController {
  /** 把某个节点的元素截成图并落成一个素材节点（原 `Rk`） */
  captureNode(nodeId: string): Promise<CaptureResult>;
}

export interface CaptureControllerDeps {
  /**
   * 设备像素比（原 `window.devicePixelRatio || 1` 的 `window` 那一半）
   * ⚠️ 由 `bootstrap` 注入 —— `state` 层不直接读运行环境（与 `core` 的规矩一致）。
   */
  dpr: () => number;
}

export function createCaptureController(
  store: AppStore,
  ports: Ports,
  deps: CaptureControllerDeps,
): CaptureController {
  return {
    captureNode: async (nodeId) => {
      const el = captureElementOf(nodeId);
      const rect = toCaptureRect(el?.getBoundingClientRect() ?? null, deps.dpr());
      if (!rect) {
        // 源版此处静默返回 `null`；给出来原因（元素没渲染 / 被折叠时用户能看懂）
        return { ok: false, reason: '该节点还没有可截的界面（未渲染或尺寸过小）' };
      }

      let dataUrl: string | null = null;
      try {
        const r = await ports.host.media.captureRect(rect);
        if (!r.ok) return { ok: false, reason: r.message };
        dataUrl = r.value;
      } catch (e) {
        return { ok: false, reason: e instanceof Error ? e.message : String(e) };
      }
      if (!dataUrl) return { ok: false, reason: '宿主没有返回图片' };

      const s = store.useStore.getState();
      const node = s.nodes.find((n) => n.id === nodeId);
      // 句子真源 = `COMMON_TEXT.nodeGone`（`TD-11-8`：同句原先三处各写一遍）
      if (!node) return { ok: false, reason: COMMON_TEXT.nodeGone };
      // ⚠️ 只读两个字段（`label` / `vid`），**且要兼容 `video` 与 `genvideo` 两类节点**
      //   （后者无 `vid`）⇒ 不按判别联合收窄，走 `asRecord`（对**脏值也不自称形状**）
      const d = asRecord(node.data);

      // ★ 播放位置**从元素上读**（原 32364：`s && s.currentTime || 0`）
      const media = el as HTMLVideoElement | null;
      const time = typeof media?.currentTime === 'number' && media.currentTime > 0 ? media.currentTime : 0;
      const name = String(d.label || d.vid || '视频');
      const label = `${name}_截图_${formatClipTime(time)}`;

      const id = s.addScreenshotMaterial({
        sourceVideoId: nodeId,
        dataUrl,
        label,
        sourceTime: time,
      });
      if (!id) return { ok: false, reason: '建素材节点失败（源视频节点不存在）' };
      return { ok: true };
    },
  };
}
