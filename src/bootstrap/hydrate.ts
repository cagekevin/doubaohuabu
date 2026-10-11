/**
 * 启动加载（**接线**，属 bootstrap 层）
 *
 * 依据：docs/03-人类版.md §0.10 + docs/11 §八
 *
 * 职责边界：
 *   - 读键 / 写键的**编排**在 bootstrap（唯一可 import 全部的地方）
 *   - 数据归一逻辑是纯函数（`stable/migrations`）
 *   - 结果写入 store 由 state 层负责（这里只调 action）
 *
 * ⚠️ **没有"启动迁移"**（2026-10-10 删）：原 5 条迁移经真实样本实测**全部空转**
 *    ⇒ 它们服务的是**不存在的用户**（旧版本数据），按铁律 2 已删。
 *    详见 `stable/migrations/index.ts` 的头注。
 *
 * ⚠️ 但**启动归位**保留：上次崩掉时残留的"在途任务"不会有结果 ⇒ 每次启动都要清
 *    （`resetStaleJobs`，不是"为旧版本"，是"为上次运行"）。
 *
 * ⚠️ 原则 6：过程中的错误**原样上报**，不吞
 */

import type { Project } from '@/stable/model/project';
import type { Ports } from '@/core/ports';
import { PERSIST, type AppStore } from '@/state';
import { resetStaleJobs } from '@/stable/migrations';
import {
  LS_ACCOUNTS,
  LS_LOVART_GALLERIES,
  LS_PRESETS,
  LS_PROJECTS,
  LS_SCAN_HISTORY,
  LS_STYLES,
} from '@/stable/contracts/keys';
import { DEFAULT_STYLE_PRESETS } from '@/constants/stylePresets';

export interface HydrateResult {
  /** 启动归位日志（供控制台/诊断） */
  notes: string[];
  /** 是否发生了归位（决定是否写回） */
  changed: boolean;
}

/** 读取 → 启动归位 → 写回 → 灌入 store */
export function hydrate(store: AppStore, ports: Ports): HydrateResult {
  const { storage } = ports;
  const notes: string[] = [];

  // ── 1. 读原始值（缺失即空数组 —— 「本来就没有」是正常态）──
  //    ⚠️ 一律走 `state/persistKeys` 的 `PERSIST`（**键的唯一落点**；用 `LS_*` 常量下标 ⇒ 类型精确）
  const projects = PERSIST[LS_PROJECTS].read(storage) ?? [];
  const accounts = PERSIST[LS_ACCOUNTS].read(storage) ?? [];
  // ★ Lovart 画廊（原 `ET` 26637：读不到 / 坏数据 ⇒ **`{}`** ⇒ 这里 `?? {}` 与它同义）
  const lovartGalleries = PERSIST[LS_LOVART_GALLERIES].read(storage) ?? {};
  // ★ 指纹体检历史（源 `fT` 26232：读不到 ⇒ 空数组）
  const scanHistory = PERSIST[LS_SCAN_HISTORY].read(storage) ?? [];
  // ★ 节点 / 提示词预设（源 `Tk` 26618：读不到 / 坏数据 ⇒ **空数组** —— 与 `?? []` 同义）
  //   ⚠️ 此前该键**读都不读** ⇒ 用户已有预设重启即不可见（`docs/15` §1 #5）
  const presets = PERSIST[LS_PRESETS].read(storage) ?? [];

  // ── 2. 启动归位：清在途任务状态（每次启动都要；不是迁移）──
  const reset = resetStaleJobs<Project>(projects);
  notes.push(...reset.notes);

  // ── 3. 写回（**只写真的改了的情况**；失败原样上报，不吞）──
  if (reset.changed) {
    try {
      storage.writeRaw(LS_PROJECTS, JSON.stringify(reset.value));
    } catch (e) {
      // ★ 原样透传（原则 6）
      notes.push(`[hydrate] 归位结果写回失败 → ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // ── 4. 灌入 store（**经 state 的具名 action** —— 本文件在 bootstrap，不得写 store）──
  //   ⚠️ 这里**没有** `setState` 可用：`AppStoreHook` 的对外类型已摘掉它
  //      ⇒ 直写是**编译错误**（原则 1 的**结构承载**，不是靠闸拦）。
  const first = reset.value[0];
  store.useStore.getState().loadHydrated({
    projects: reset.value,
    accounts,
    lovartGalleries,
    scanHistory,
    presets,
    activeId: first?.id ?? null,
    ...(first ? { canvas: first.data } : {}),
  });

  return { notes, changed: reset.changed };
}

/** 风格预设的兜底（供 UI 使用；`doubao-styles` 缺失时用内置） */
export function loadStylePresets(ports: Ports): typeof DEFAULT_STYLE_PRESETS {
  const stored = PERSIST[LS_STYLES].read(ports.storage);
  return stored && stored.length > 0 ? stored : DEFAULT_STYLE_PRESETS;
}
