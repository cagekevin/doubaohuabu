/**
 * Global slice（① 全局共享：跨多个顶层子树 —— docs/11 §5.1）
 *
 * ⚠️ 原则 1：**只有 state 能写 store**
 * ⚠️ §5.3：若本 slice 超 300 行 / 25 字段 → 按共享范围再分（projects / accounts / settings）
 */

import type { Account, AccountGroup, PoolStrategy } from '@/stable/model/account';
import type { Project } from '@/stable/model/project';
import type { ApiSetup } from '@/stable/model/gen';
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

  // ── API 配置 ──
  apiSetup: ApiSetup;

  // ── actions ──
  setProjects: (projects: Project[]) => void;
  setActiveId: (id: string | null) => void;
  setStarted: (v: boolean) => void;
  setSaveError: (e: SaveError | null) => void;
  setAccounts: (a: Account[]) => void;
  setGroups: (g: AccountGroup[]) => void;
  setProxyPool: (p: string[]) => void;
  setPoolStrategy: (s: PoolStrategy) => void;
  setApiSetup: (s: ApiSetup) => void;
  setBusyAccounts: (ids: string[]) => void;

  /** ★ 新建项目（原「＋ 新建项目」）—— 返回新工程 id */
  createProject: () => string;
  /** 重命名当前项目 */
  renameProject: (id: string, name: string) => void;
  /** 删除项目 */
  deleteProject: (id: string) => void;
  /** 当前工程 */
  activeProject: () => Project | null;
}

export function createGlobalSlice(
  set: (partial: Partial<GlobalSlice>) => void,
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
    apiSetup: { imageProviderId: null, videoProviderId: null, fallbackProviderId: null, concurrency: 3 },

    setProjects: (projects) => set({ projects }),
    setActiveId: (activeId) => set({ activeId }),
    setStarted: (started) => set({ started }),
    setSaveError: (saveError) => set({ saveError }),
    setAccounts: (accounts) => set({ accounts }),
    setGroups: (groups) => set({ groups }),
    setProxyPool: (proxyPool) => set({ proxyPool }),
    setPoolStrategy: (poolStrategy) => set({ poolStrategy }),
    setApiSetup: (apiSetup) => set({ apiSetup }),
    setBusyAccounts: (busyAccountIds) => set({ busyAccountIds }),

    createProject: () => {
      const now = deps.now();
      const p = makeProject({ now, seq: ++seq });
      set({ projects: [...get().projects, p], activeId: p.id, started: true });
      return p.id;
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
