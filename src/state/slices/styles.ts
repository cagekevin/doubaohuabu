/**
 * Styles slice —— **风格预设**（`doubao-styles`）
 *
 * ★ **为什么独立成片（判据 C2）**：`global` 片已 480+ 行、10 个状态字段，而本族
 *   （`styles` + 5 个 action）**自成共享范围** —— 消费者是 `ui/panels/GenPanel` ·
 *   `ui/panels/StyleLibraryModal` · `state/generate` · `state/batchSend`，与工程/账号无关。
 *
 * ⚠️ 原则 1：**只有 state 能写 store**；本片只做「把纯规划落到 store」。
 * ⚠️ 纯逻辑全在 **已测** 的 `core/rules/style.ts`（原 `nu` / `q0` / `Pt` / store 30471-30540）。
 * ⚠️ 落盘走 `bootstrap/container.ts` 的自动订阅（`pick()` 含 `styles`）⇒ 本片**不显式 persist**
 *   （源版是显式 `Ea(...)`，但本仓的落盘触发点是订阅，见 `container.ts` 注释）。
 */

import type { StylePreset } from '@/constants/stylePresets';
import {
  defaultStyles,
  makeStyleId,
  planAddStyle,
  planRemoveStyle,
  planUpdateStyle,
  type NewStyleInput,
} from '@/core/rules/style';

export interface StylesSlice {
  /** 风格表（源 `styles: kT()` —— 缺省由 `hydrate` 灌内置表） */
  styles: StylePreset[];

  /** 恢复内置表（原 `resetStyles`）—— 注意是**浅拷贝**（不共享内置表对象） */
  resetStyles: () => void;
  /**
   * 新增（原 `addStyle`）
   * @returns 新 id；`null` = 不合法（空 / 无 `name`，**什么都不做**）。
   * ⚠️ id 已存在 ⇒ **不写盘**，只把该 id 回给你（与源一致）。
   */
  addStyle: (input: NewStyleInput) => string | null;
  /** 改一条（原 `updateStyle`）—— `patch` 覆盖式合并 */
  updateStyle: (id: string, patch: Partial<StylePreset>) => void;
  /** 删一条（原 `removeStyle`） */
  removeStyle: (id: string) => void;
}

export interface StylesSliceDeps {
  now(): number;
}

export function createStylesSlice(deps: StylesSliceDeps) {
  return (
    set: (partial: Partial<StylesSlice>) => void,
    get: () => StylesSlice,
  ): StylesSlice => {
    /** 同毫秒内的序号（原 `Pt` 的模块级 `Gl`）—— 放**闭包**里，避免跨 store / 跨测试泄漏 */
    let seq = 0;

    return {
      styles: [],

      resetStyles: () => set({ styles: defaultStyles() }),

      addStyle: (input) => {
        const plan = planAddStyle(get().styles, input, () => makeStyleId(deps.now(), ++seq));
        // 原：`if (!n || !n.name) return null;` —— 不合法 ⇒ 什么都不做
        if (!plan) return null;
        // 原：id 已存在 ⇒ **只 `return r`，不 `e({styles})`、不落盘**
        if (!plan.added) return plan.id;
        set({ styles: plan.styles });
        return plan.id;
      },

      updateStyle: (id, patch) => {
        const next = planUpdateStyle(get().styles, id, patch);
        if (!next) return;
        set({ styles: next });
      },

      removeStyle: (id) => {
        const next = planRemoveStyle(get().styles, id);
        if (!next) return;
        set({ styles: next });
      },
    };
  };
}
