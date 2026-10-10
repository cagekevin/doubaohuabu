/**
 * Global slice（① 全局共享：跨多个顶层子树 —— docs/11 §5.1）
 *
 * ⚠️ 原则 1：**只有 state 能写 store**
 * ⚠️ §5.3：若本 slice 超 300 行 / 25 字段 → 按共享范围再分（projects / accounts / settings）
 *
 * ★ **已拆（2026-10-10，判据 C2）**：`apiSetup` 已移入 `./settings.ts` ——
 *   本清单还要往本片加 `license`/`scanHistory`/`lovartGalleries`/`lastSentAccountId`/
 *   `accountConcurrency`/`presets` ⇒ 必然超 25 字段上限，故「API 配置族」先独立成片。
 */

import type { Account, AccountGroup, PoolStrategy } from '@/stable/model/account';
import type { Project } from '@/stable/model/project';
import { createProject as makeProject } from '@/core/rules/project';

/** 保存错误（★ 保留原始 message —— 原则 6） */
export interface SaveError {
  message: string;
  at: number;
}

/** slice 需要的注入依赖 */
export interface GlobalSliceDeps {
  now(): number;
}

export interface GlobalSlice {
  // ── 工程 ──
  projects: Project[];
  activeId: string | null;
  started: boolean;
  saveError: SaveError | null;

  // ── 账号 ──
  accounts: Account[];
  groups: AccountGroup[];
  proxyPool: string[];
  poolStrategy: PoolStrategy;
  /** ★ 正在忙的账号（W11：选号时跳过；全忙 ⇒ 排队） */
  busyAccountIds: string[];

  // ── actions ──
  setProjects: (projects: Project[]) => void;
  setActiveId: (id: string | null) => void;
  setStarted: (v: boolean) => void;
  setSaveError: (e: SaveError | null) => void;
  setAccounts: (a: Account[]) => void;
  setGroups: (g: AccountGroup[]) => void;
  setProxyPool: (p: string[]) => void;
  setPoolStrategy: (s: PoolStrategy) => void;
  setBusyAccounts: (ids: string[]) => void;

  /** ★ 新建项目（原「＋ 新建项目」）—— 返回新工程 id */
  createProject: () => string;
  /**
   * 打开工程（原 `openProject`）
   *
   * ★ 这是 `docs/14` §2 记的 ⭐⭐ **数据损坏 bug 的修复点**：只 `setActiveId` 而不换画布
   *    ⇒ `store.ts` 的镜像会把**旧画布**写进**新工程**。所以本 action **原子地**
   *    同时换 `activeId` 与 `nodes/edges/library/snap`。
   */
  openProject: (id: string) => void;
  /** 重命名当前项目 */
  renameProject: (id: string, name: string) => void;
  /** 删除项目 */
  deleteProject: (id: string) => void;
  /** 当前工程 */
  activeProject: () => Project | null;
}

/**
 * `set` 允许**跨 slice 写画布字段**
 *
 * ⚠️ 为什么不能只写 `Partial<GlobalSlice>`：`openProject` 必须把工程的画布数据一起换掉，
 *    否则切项目即串数据（见 `openProject` 注释）。
 * ⚠️ 形状直接复用 `Project['data']`（就是 `nodes/edges/library/snap`）—— 既精确，
 *    又避免 `global.ts` 反向 import `store.ts` 的类型（那会成环）。
 */
export function createGlobalSlice(
  set: (partial: Partial<GlobalSlice> & Partial<Project['data']>) => void,
  get: () => GlobalSlice,
  deps: GlobalSliceDeps,
): GlobalSlice {
  /** 同毫秒内的序号（原 `Pt` 的计数） */
  let seq = 0;

  return {
    projects: [],
    activeId: null,
    started: false,
    saveError: null,
    accounts: [],
    groups: [],
    proxyPool: [],
    poolStrategy: 'round-robin',
    busyAccountIds: [],

    setProjects: (projects) => set({ projects }),
    setActiveId: (activeId) => set({ activeId }),
    setStarted: (started) => set({ started }),
    setSaveError: (saveError) => set({ saveError }),
    setAccounts: (accounts) => set({ accounts }),
    setGroups: (groups) => set({ groups }),
    setProxyPool: (proxyPool) => set({ proxyPool }),
    setPoolStrategy: (poolStrategy) => set({ poolStrategy }),
    setBusyAccounts: (busyAccountIds) => set({ busyAccountIds }),

    createProject: () => {
      const now = deps.now();
      const p = makeProject({ now, seq: ++seq });
      set({
        projects: [...get().projects, p],
        activeId: p.id,
        started: true,
        // ★ 与 `openProject` 同一个道理：切到新工程也要**把它的画布数据灌回来**（新工程是空的）
        //   —— 否则镜像会把**上一个工程**的画布写进新工程（同一处 ⭐⭐ bug 的第二种触发路径）
        nodes: p.data.nodes,
        edges: p.data.edges,
        library: p.data.library,
        snap: p.data.snap,
      });
      return p.id;
    },

    openProject: (id) => {
      const target = get().projects.find((p) => p.id === id);
      // 找不到就什么都不做（不把 activeId 指到不存在的工程）
      if (!target) return;
      set({
        activeId: id,
        started: true,
        // ★ 关键：把**该工程**的画布数据灌回来（否则镜像会把旧画布写进新工程）
        nodes: target.data.nodes,
        edges: target.data.edges,
        library: target.data.library,
        snap: target.data.snap,
      });
    },

    renameProject: (id, name) => {
      const now = deps.now();
      set({
        projects: get().projects.map((p) => (p.id === id ? { ...p, name: name.trim() || p.name, updatedAt: now } : p)),
      });
    },

    deleteProject: (id) => {
      const rest = get().projects.filter((p) => p.id !== id);
      const wasActive = get().activeId === id;
      set({ projects: rest, ...(wasActive ? { activeId: rest[0]?.id ?? null } : {}) });
    },

    activeProject: () => get().projects.find((p) => p.id === get().activeId) ?? null,
  };
}
