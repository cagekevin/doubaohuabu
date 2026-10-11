/**
 * FaceMask slice —— **遮脸**（人脸检测结果的搬运 + 参数 + 参数面板开合）
 *
 * ★ **为什么独立成片（判据 C2）**：消费面是 `ui/nodes/FaceMarksLayer`（角标层）·
 *   `ui/panels/FaceMaskPanel`（参数面板）· `ui/canvas/CanvasHost`（挂载点）—— 与工程 / 账号无关。
 *
 * ★ 纯逻辑全在**已测**的 `core/rules/facemask.ts`（参数规范化）+ `core/rules/faceDetect.ts`（几何）。
 * ⚠️ 检测本身在 `adapters/media/faceDetect.ts`（要 WASM + DOM）—— 由 `ui` 调、结果写这里。
 *
 * ⚠️ 与源的两处如实差异（登记 `TD-03-19`）：
 *   ① 源用模块级 `Map` 按 `src` **跨节点**缓存检测结果（`Xc`）；本仓改为**按节点**记忆
 *      （`faceMarks[nodeId].key === 当前 key` 即不再检测）—— 缓存属「谁持有状态」（原则 1）。
 *   ② 源的检测是可取消的（`qD` 返回带 `cancelled` 的句柄）；本仓的 `detectFaces` 没有取消句柄
 *      ⇒ 用**忽略过期结果**代替真取消。
 */

import { FACE_MASK_DEFAULTS } from '@/constants/facemask';
import type { FaceBox, FaceMaskOpts } from '@/core/rules/facemask';
import { normalizeFaceMaskOpts } from '@/core/rules/facemask';

/** 一个节点的人脸检测状态（原 `faceMarks[id]`） */
export interface FaceMark {
  /** `idle` 未开始 · `loading` 检测中 · `done` 有脸 · `empty` 无脸 · `error` 出错 */
  status: 'idle' | 'loading' | 'done' | 'empty' | 'error';
  /** 检测所用的**图片来源**（原 `key`）—— 变了就要重测 */
  key: string;
  /** 归一化脸框（纯层 `FaceBox`） */
  faces: FaceBox[];
  /** 失败原文（原则 6：不改写） */
  error?: string | null;
  /** 正在遮第几张脸（`null` = 没在遮） */
  masking: number | null;
}

/** 参数面板的位置（原 `faceMaskPanel`） */
export interface FaceMaskPanelState {
  nodeId: string;
  /** 视口坐标（`clientX`/`clientY`） */
  x: number;
  y: number;
}

export interface FaceMaskSlice {
  /** 按节点存的人脸检测结果（**不持久化** —— 源亦不落盘） */
  faceMarks: Record<string, FaceMark>;
  /** 合并写一条（原 `setFaceMark`：**与已有值合并**，不是覆盖） */
  setFaceMark: (nodeId: string, patch: Partial<FaceMark>) => void;
  /** 删一条（原 `clearFaceMark`：没有就不动） */
  clearFaceMark: (nodeId: string) => void;
  /** 标记「正在遮第几张脸」（原 `setFaceMasking`） */
  setFaceMasking: (nodeId: string, index: number | null) => void;

  /** 遮脸参数（持久化到 `doubao-face-mask-opts`） */
  faceMaskOpts: FaceMaskOpts;
  /**
   * 合并改参数（原 `setFaceMaskOpts`）—— **每次都过一遍 `normalizeFaceMaskOpts`**（clamp）
   * ⚠️ 源在这里直接写 `localStorage`（`L$`）；本仓按既有约定走 `pick()` 自动落盘（见 `container.ts`）。
   * @returns 规范化后的新参数（源也返回）
   */
  setFaceMaskOpts: (patch: Partial<FaceMaskOpts>) => FaceMaskOpts;

  /** 参数面板是否开着（原 `faceMaskPanel`） */
  faceMaskPanel: FaceMaskPanelState | null;
  /** 开参数面板（原 `openFaceMaskPanel`）—— ⚠️ `nodeId` 为空 ⇒ 什么都不做 */
  openFaceMaskPanel: (nodeId: string, x: number, y: number) => void;
  /** 关（原 `closeFaceMaskPanel`）—— 已经关着就不动 */
  closeFaceMaskPanel: () => void;
}

/** 参数缺省值（原 `D$()` 读不到时的兜底）—— 与 `constants/facemask.ts` 同源 */
const DEFAULT_OPTS: FaceMaskOpts = normalizeFaceMaskOpts(FACE_MASK_DEFAULTS);

export function createFaceMaskSlice() {
  return (
    set: (partial: Partial<FaceMaskSlice>) => void,
    get: () => FaceMaskSlice,
  ): FaceMaskSlice => ({
    faceMarks: {},
    setFaceMark: (nodeId, patch) => {
      // 原：`if (!n) return;` + 与已有值**合并**
      if (!nodeId) return;
      const prev = get().faceMarks[nodeId] ?? {};
      set({ faceMarks: { ...get().faceMarks, [nodeId]: { ...prev, ...patch } as FaceMark } });
    },
    clearFaceMark: (nodeId) => {
      if (!nodeId || !(nodeId in get().faceMarks)) return;
      const next = { ...get().faceMarks };
      delete next[nodeId];
      set({ faceMarks: next });
    },
    setFaceMasking: (nodeId, index) => {
      if (!nodeId) return;
      const prev = get().faceMarks[nodeId] ?? {};
      set({ faceMarks: { ...get().faceMarks, [nodeId]: { ...prev, masking: index } as FaceMark } });
    },

    faceMaskOpts: DEFAULT_OPTS,
    setFaceMaskOpts: (patch) => {
      // 原：`em({...t().faceMaskOpts, ...(n || {})})` —— 合并后**整体规范化**
      const next = normalizeFaceMaskOpts({ ...get().faceMaskOpts, ...(patch || {}) });
      set({ faceMaskOpts: next });
      return next;
    },

    faceMaskPanel: null,
    openFaceMaskPanel: (nodeId, x, y) => {
      if (!nodeId) return;
      set({ faceMaskPanel: { nodeId, x, y } });
    },
    closeFaceMaskPanel: () => {
      if (!get().faceMaskPanel) return;
      set({ faceMaskPanel: null });
    },
  });
}

/** 参数面板里那个「效果」按钮需要的形状（`FACE_MASK_EFFECT_LABEL` 的键） */
