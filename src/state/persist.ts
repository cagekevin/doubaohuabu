/**
 * 持久化调度（**何时存**）
 *
 * 依据：docs/11 §6.5 审计错位 6 的修正
 *   - 本文件：订阅 + **防抖 600ms** + `beforeunload` flush（★ 经 `LifecyclePort`，**不直挂 `window`**）+ 把错误写进 store
 *   - `core/usecases/persistProject`：**怎么存**（序列化 + 外置 + 写键）
 *
 * ⚠️ 原则 1：本文件在 `state/` 层，**是唯一**把持久化错误写进 store 的地方
 * ⚠️ 原则 6：错误 `message` **原样**写入（不改写成"保存失败，请重试"）
 */

import type { ClockPort } from '@/core/ports/clock.port';
import type { Cancel } from '@/core/ports/clock.port';
import type { LifecyclePort } from '@/core/ports/host.port';
import type { Preset, Project } from '@/stable/model/project';
import type { Account, AccountGroup, PoolStrategy } from '@/stable/model/account';
import type { LovartGalleries } from '@/core/rules/lovartGallery';
import type { ScanHistoryEntry } from '@/core/rules/scanHistory';
import { persistProject, type PersistDeps } from '@/core/usecases/persistProject';
import { persistAccounts } from '@/core/usecases/persistAccounts';
import { persistLsKey } from '@/core/usecases/persistLsKey';
import {
  LS_ACCOUNTS,
  LS_FACE_MASK_OPTS,
  LS_LOVART_GALLERIES,
  LS_PRESETS,
  LS_PROJECTS,
  LS_SCAN_HISTORY,
  LS_STYLES,
  type LsKey,
} from '@/stable/contracts/keys';
import { PERSIST_DEBOUNCE_MS } from '@/constants';
import type { FaceMaskOpts } from '@/core/rules/facemask';
import type { StylePreset } from '@/constants/stylePresets';

/** 本控制器负责落盘的全部数据（工程 + 账号族） */
export interface PersistSnapshot {
  projects: Project[];
  activeId: string | null;
  /** ★ 账号族 —— 原实现**只读不写**（`docs/过程.md` §2 ⭐：账号增删改刷新即丢） */
  accounts: Account[];
  groups: AccountGroup[];
  proxyPool: string[];
  poolStrategy: PoolStrategy;
  /**
   * ★ Lovart 画廊（原 `Pk` 26629）—— 与账号族同理：**有 store 切片、有 `pick()`，
   *   但没有写盘分支就只在内存**（重启即丢）。2026-10-11 接上。
   */
  lovartGalleries: LovartGalleries;
  /** ★ 指纹体检历史（原 `jk` 26223）—— 同画廊：有切片与 `pick()` 就得有写盘分支 */
  scanHistory: ScanHistoryEntry[];
  /**
   * ★ **节点 / 提示词预设**（原 `wo` 26611 写 `doubao-presets`）—— 同画廊 / 体检历史：
   *   `presets` 进了 store 就得有写盘分支，否则「导入工程并入的预设」重启即丢。
   */
  presets: Preset[];
  /**
   * ★ **风格预设**（原 `Ea` 写 `doubao-styles`）—— 同画廊 / 预设：
   *   有切片与 `pick()` 就得有写盘分支，否则改风格 / 恢复默认重启即丢。
   */
  styles: StylePreset[];
  /** ★ **遮脸参数**（原 `L$` 写 `doubao-face-mask-opts`）—— 同上 */
  faceMaskOpts: FaceMaskOpts;
}

export interface PersistControllerDeps {
  clock: ClockPort;
  /** 窗口生命周期（原 `window.beforeunload`）—— 由 `adapters/host` 实现，本层不直挂 `window` */
  lifecycle: LifecyclePort;
  /** 落盘依赖（由 container 组装；含 storage + migrationCtx + 备份/快照） */
  persist: PersistDeps;
  /** 取当前要存的数据（**读取**由 state 提供，本模块不 import store） */
  readState: () => PersistSnapshot;
  /** 保存失败回调（state 层写入 `saveError`） */
  onError: (message: string) => void;
  /** 保存成功回调（清 `saveError`） */
  onOk?: () => void;
}

export interface PersistController {
  /** 安排一次落盘（防抖 600ms；同窗口内多次调用只写一次） */
  schedule(): void;
  /** 立即落盘（`beforeunload` / 切项目时用） */
  flush(): void;
  /** 是否有待写入 */
  pending(): boolean;
  /**
   * ★ **设置"因数据损坏而跳过写回"的键**（TD-06-1）
   *
   * ⚠️ 由 `container.hydrate()` 在读完盘后调用：这些键**读不出来**（数据损坏），
   *    照常写回就会把**可恢复的坏数据覆盖掉**（真丢数据）⇒ 宁可这次不写。
   */
  setSkipKeys(keys: readonly LsKey[]): void;
  /** 卸载：取消防抖 + 移除 beforeunload */
  dispose(): void;
}

export function createPersistController(deps: PersistControllerDeps): PersistController {
  let timer: Cancel | null = null;
  /**
   * ★ **因数据损坏而跳过写回的键**（TD-06-1）—— 默认**空集**；由 `container.hydrate()` 填。
   * ⚠️ 空集 ⇒ 行为与从前**完全一致**（零炸：只有真的读到损坏时才有差异）。
   */
  let skipKeys = new Set<LsKey>();

  const doWrite = (): void => {
    timer = null;
    const s = deps.readState();
    const skip = skipKeys;

    // ① 工程（原实现只做这一步）
    if (!skip.has(LS_PROJECTS)) {
      const res = persistProject({ projects: s.projects, activeId: s.activeId }, deps.persist);
      if (!res.ok) {
        // ★ 原样透传（原则 6）
        deps.onError(res.message);
        return;
      }
    }

    // ② ★ 账号族（`docs/过程.md` §2 ⭐ 缺口：原实现只读不写 ⇒ 账号增删改刷新即丢）
    if (!skip.has(LS_ACCOUNTS)) {
      const acc = persistAccounts(
        {
          accounts: s.accounts,
          groups: s.groups,
          proxyPool: s.proxyPool,
          poolStrategy: s.poolStrategy,
        },
        { storage: deps.persist.storage },
      );
      if (!acc.ok) {
        // ★ 同样原样透传（原则 6）
        deps.onError(acc.message);
        return;
      }
    }

    // ③ ★ Lovart 画廊（与上面两族同法：失败即返回、错误原样透传）
    //    ⚠️ 用**通用件** `persistLsKey`（判据 C1：单键落盘的第二处 ⇒ 抽出来，不复制一份）
    if (!skip.has(LS_LOVART_GALLERIES)) {
      const gal = persistLsKey(LS_LOVART_GALLERIES, s.lovartGalleries, { storage: deps.persist.storage });
      if (!gal.ok) {
        deps.onError(gal.message);
        return;
      }
    }

    // ④ ★ 指纹体检历史（同上）
    if (!skip.has(LS_SCAN_HISTORY)) {
      const scan = persistLsKey(LS_SCAN_HISTORY, s.scanHistory, { storage: deps.persist.storage });
      if (!scan.ok) {
        deps.onError(scan.message);
        return;
      }
    }

    // ⑤ ★ 节点 / 提示词预设（同上；原 `wo` 26611）
    if (!skip.has(LS_PRESETS)) {
      const pre = persistLsKey(LS_PRESETS, s.presets, { storage: deps.persist.storage });
      if (!pre.ok) {
        deps.onError(pre.message);
        return;
      }
    }

    // ⑥ ★ 风格预设（同上；原 `Ea` 在每个 style action 里显式写 `doubao-styles`）
    if (!skip.has(LS_STYLES)) {
      const sty = persistLsKey(LS_STYLES, s.styles, { storage: deps.persist.storage });
      if (!sty.ok) {
        deps.onError(sty.message);
        return;
      }
    }

    // ⑦ ★ 遮脸参数（同上；原 `setFaceMaskOpts` 里显式写 `doubao-face-mask-opts`）
    if (!skip.has(LS_FACE_MASK_OPTS)) {
      // ⚠️ 摊平成字面量再落盘：`persistLsKey` 收 `Record<string, unknown>`，而 `FaceMaskOpts`
      //    是 interface（**无索引签名**）⇒ 直接传不过类型检查
      const fm = persistLsKey(LS_FACE_MASK_OPTS, { ...s.faceMaskOpts }, { storage: deps.persist.storage });
      if (!fm.ok) {
        deps.onError(fm.message);
        return;
      }
    }

    deps.onOk?.();
  };

  const schedule = (): void => {
    if (timer) timer(); // 重置防抖窗口
    timer = deps.clock.setTimeout(() => doWrite(), PERSIST_DEBOUNCE_MS);
  };

  const flush = (): void => {
    if (timer) {
      timer();
      timer = null;
    }
    doWrite();
  };

  const onBeforeUnload = (): void => {
    if (timer) flush();
  };

  // ★ 走**生命周期端口**（原 `window.addEventListener('beforeunload', …)`）——
  //   `state` 层不直挂 `window`：宿主访问收在 `adapters/host/shared/lifecycle`（原则 4 后半）
  const offBeforeUnload = deps.lifecycle.onBeforeUnload(onBeforeUnload);

  return {
    schedule,
    flush,
    pending: () => timer !== null,
    // ★ 损坏键（TD-06-1）：由 `container.hydrate()` 填 —— 之后这些键**不再写回**
    setSkipKeys: (keys) => {
      skipKeys = new Set(keys);
    },
    dispose: () => {
      if (timer) timer();
      timer = null;
      offBeforeUnload();
    },
  };
}
