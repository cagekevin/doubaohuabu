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

import type { Account, AccountGroup, Fingerprint, PoolStrategy } from '@/stable/model/account';
import type { Project } from '@/stable/model/project';
import { createProject as makeProject } from '@/core/rules/project';
import {
  holdAccount as holdBusy,
  releaseAccount as releaseBusy,
  type BusyMap,
} from '@/core/rules/accountBusy';
import {
  addAccountToList,
  removeAccountFromList,
  type NewAccountInput,
} from '@/core/rules/accountRoster';
import {
  FINGERPRINT_VERSION,
  generateFingerprint,
  type ScreenSpec,
  type WebglSpec,
} from '@/core/rules/fingerprintGenerator';

/** 保存错误（★ 保留原始 message —— 原则 6） */
export interface SaveError {
  message: string;
  at: number;
}

/** slice 需要的注入依赖 */
export interface GlobalSliceDeps {
  now(): number;
  /**
   * 新增账号所需的**环境**（原则 4：`core` 只收值，不收宿主）
   *
   * ★ **为什么必须注入**：`addAccount` 要产出指纹，而指纹生成器的两个输入
   *   `os`（原 `Uc()`）与 win 分支的**真实窗口尺寸 / 真实 GPU**（原 `M$()` / `$$()`）
   *   都是**读宿主**的 ⇒ 只能在 bootstrap（adapter 层）读好再传进来。
   * ⚠️ **是 getter 而不是快照** —— 源版就是**调用时**才读 `Uc()`/`M$()`/`$$()`
   *   （窗口大小会变、GPU 上下文要现建）⇒ 改成快照会让"启动时的窗口尺寸"被冻结。
   * ⚠️ `accounts` 一写进 store，`bootstrap/container.ts` 的订阅就会自动安排落盘
   *   （`pick()` 里含 `s.accounts`）⇒ **本 slice 不需要显式调 persist**。
   */
  roster(): {
    os: Fingerprint['hostOS'];
    chromeMajor?: number;
    winScreens?: readonly ScreenSpec[];
    winWebgl?: readonly WebglSpec[];
  };
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
  /**
   * ★ **正在忙的账号**（W11：选号时跳过；全忙 ⇒ 排队）
   *
   * ★ **2026-10-10 修**：原字段是 `busyAccountIds: string[]`，配一个 `setBusyAccounts`
   *   —— 而 `docs/14` §8 实测它 **零调用** ⇒ `all-busy` 排队分支**永不触发**。
   *   现在换成**带 TTL 与占用者的** `BusyMap`（原 `Fi`/`tn` 的语义），
   *   并由下面的 `holdAccount` / `releaseAccount` 提供**写入方**。
   * ⚠️ 不持久化（20 个 `LsKey` 里没有它）—— 重启即视为全空闲，与源版一致。
   */
  accountBusy: BusyMap;

  // ── actions ──
  setProjects: (projects: Project[]) => void;
  setActiveId: (id: string | null) => void;
  setStarted: (v: boolean) => void;
  setSaveError: (e: SaveError | null) => void;
  setAccounts: (a: Account[]) => void;
  setGroups: (g: AccountGroup[]) => void;
  setProxyPool: (p: string[]) => void;
  setPoolStrategy: (s: PoolStrategy) => void;
  setAccountBusy: (map: BusyMap) => void;
  /**
   * 占用账号（原 `Fi` 34596）
   *
   * ⚠️ 这是 `setBusyAccounts` 那个**零调用缺口**的修法：写入方必须在**发送编排**里
   *    （选号之后、发送之前），故它由 `core/usecases/generate` 经注入调用、
   *    真正的 `set` 发生在这里（原则 1：只有 state 写 store）。
   *
   * @returns `false` = 已被占用（调用方报 `holdFailed`）—— 对应原 `Fi` 的 `return false`
   */
  holdAccount: (accountId: string, opts?: { itemId?: string | null; nodeId?: string | null }) => boolean;
  /** 释放（原 `tn` 34614）；`itemId` 不符 ⇒ 不动，返回 `false` */
  releaseAccount: (accountId: string, opts?: { itemId?: string | null }) => boolean;

  /**
   * ★ **新增账号**（原 `addAccount` 30159-30217）
   *
   * ⚠️ 这是链上第 4 环那个断点的修法：此前本工程**只有 `setAccounts`（批量覆盖）**、
   *    `ui/` 里**没有任何账号界面** ⇒ 选号池永远为空 ⇒ `generate` 必然报
   *    「未配置已登录的豆包 / Dola 账号」。
   *
   * 纯逻辑在 `core/rules/accountRoster.ts`（**已测**）：本 action 只做
   * 「按注入环境生成 → 追加 → 重编号 → `set`」。
   *
   * ⚠️ **会话清理不在本 action**：源 `removeAccount` 里那步是 fire-and-forget（见 `state/accountOps.ts`）。
   * @returns 新账号 id
   */
  addAccount: (input: NewAccountInput) => string;
  /**
   * ★ **移除账号**（原 `removeAccount` 30218-30247 的**列表半**）
   *
   * 源版顺序：先 fire-and-forget 清会话（`clearAccountSession`，`try{}catch{}` 吞），
   * **再**过滤 + `vo()` 重编号 + 落盘。会话那半在 `state/accountOps.ts`（需要 await 宿主），
   * 本 action 只负责列表（**同步、必定成功**）—— 这样"删号"永远不会被宿主失败卡住。
   *
   * ⚠️ 源版还会清 `lovartGalleries[id]`；本工程**该字段尚未落地**（见本文件头部待办），故略。
   */
  removeAccount: (accountId: string) => void;

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
    accountBusy: {},

    setProjects: (projects) => set({ projects }),
    setActiveId: (activeId) => set({ activeId }),
    setStarted: (started) => set({ started }),
    setSaveError: (saveError) => set({ saveError }),
    setAccounts: (accounts) => set({ accounts }),
    setGroups: (groups) => set({ groups }),
    setProxyPool: (proxyPool) => set({ proxyPool }),
    setPoolStrategy: (poolStrategy) => set({ poolStrategy }),
    setAccountBusy: (accountBusy) => set({ accountBusy }),

    holdAccount: (accountId, opts = {}) => {
      const next = holdBusy(get().accountBusy, accountId, {
        itemId: opts.itemId ?? null,
        nodeId: opts.nodeId ?? null,
        now: deps.now(),
      });
      if (!next) return false;
      set({ accountBusy: next });
      return true;
    },

    addAccount: (input) => {
      const s = get();
      // ⚠️ **调用时**才读环境（源版 `Uc()`/`M$()`/`$$()` 就是现读）—— 见 deps.roster 的注释
      const env = deps.roster();
      const accounts = addAccountToList(s.accounts, input, {
        now: deps.now(),
        os: env.os,
        fingerprintVersion: FINGERPRINT_VERSION,
        // 指纹生成器（原 `zc`）—— 环境（真实窗口 / 真实 GPU）由 bootstrap 注入
        generateFingerprint: (seed, os) =>
          generateFingerprint(seed, {
            os,
            ...(env.chromeMajor === undefined ? {} : { chromeMajor: env.chromeMajor }),
            ...(env.winScreens ? { winScreens: env.winScreens } : {}),
            ...(env.winWebgl ? { winWebgl: env.winWebgl } : {}),
          }),
        proxyPool: s.proxyPool,
      });
      set({ accounts });
      // ⚠️ `addAccountToList` 是「追加 + 重编号」，重编号**不重排** ⇒ 新账号恒在末尾
      return accounts[accounts.length - 1]?.id ?? '';
    },

    removeAccount: (accountId) => {
      // ⚠️ 与源一致：`removeAccountFromList` 内部会 `vo()` 重编号（把空洞补齐）
      set({ accounts: removeAccountFromList(get().accounts, accountId) });
    },

    releaseAccount: (accountId, opts = {}) => {
      const { map, released } = releaseBusy(get().accountBusy, accountId, {
        itemId: opts.itemId ?? null,
      });
      if (released) set({ accountBusy: map });
      return released;
    },

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
