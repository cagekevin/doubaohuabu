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

import type { Account } from '@/stable/model/account';
import type { Project } from '@/stable/model/project';
import type { Ports } from '@/core/ports';
import type { AppStore } from '@/state';
import { resetStaleJobs } from '@/stable/migrations';
import { LS_ACCOUNTS, LS_PROJECTS, LS_STYLES } from '@/stable/contracts/keys';
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
  const set = store.useStore.setState;
  const notes: string[] = [];

  // ── 1. 读原始值（缺失即空数组 —— 「本来就没有」是正常态）──
  const projects = storage.read<Project[]>(LS_PROJECTS) ?? [];
  const accounts = storage.read<Account[]>(LS_ACCOUNTS) ?? [];

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

  // ── 4. 灌入 store（state 层是唯一写入点）──
  set({
    projects: reset.value,
    accounts,
    activeId: reset.value[0]?.id ?? null,
  });

  if (reset.value[0]) {
    const d = reset.value[0].data;
    set({ nodes: d.nodes, edges: d.edges, library: d.library, snap: d.snap });
  }

  return { notes, changed: reset.changed };
}

/** 风格预设的兜底（供 UI 使用；`doubao-styles` 缺失时用内置） */
export function loadStylePresets(ports: Ports): typeof DEFAULT_STYLE_PRESETS {
  const stored = ports.storage.read<typeof DEFAULT_STYLE_PRESETS>(LS_STYLES);
  return stored && stored.length > 0 ? stored : DEFAULT_STYLE_PRESETS;
}
