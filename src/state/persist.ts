/**
 * 持久化调度（**何时存**）
 *
 * 依据：docs/11 §6.5 审计错位 6 的修正
 *   - 本文件：订阅 + **防抖 600ms** + `beforeunload` flush + 把错误写进 store
 *   - `core/usecases/persistProject`：**怎么存**（序列化 + 外置 + 写键）
 *
 * ⚠️ 原则 1：本文件在 `state/` 层，**是唯一**把持久化错误写进 store 的地方
 * ⚠️ 原则 6：错误 `message` **原样**写入（不改写成"保存失败，请重试"）
 */

import type { ClockPort } from '@/core/ports/clock.port';
import type { Cancel } from '@/core/ports/clock.port';
import type { Project } from '@/stable/model/project';
import type { Account, AccountGroup, PoolStrategy } from '@/stable/model/account';
import type { LovartGalleries } from '@/core/rules/lovartGallery';
import type { ScanHistoryEntry } from '@/core/rules/scanHistory';
import { persistProject, type PersistDeps } from '@/core/usecases/persistProject';
import { persistAccounts } from '@/core/usecases/persistAccounts';
import { persistLsKey } from '@/core/usecases/persistLsKey';
import { LS_LOVART_GALLERIES, LS_SCAN_HISTORY } from '@/stable/contracts/keys';
import { PERSIST_DEBOUNCE_MS } from '@/constants';

/** 本控制器负责落盘的全部数据（工程 + 账号族） */
export interface PersistSnapshot {
  projects: Project[];
  activeId: string | null;
  /** ★ 账号族 —— 原实现**只读不写**（`docs/14` §2 ⭐：账号增删改刷新即丢） */
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
}

export interface PersistControllerDeps {
  clock: ClockPort;
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
  schedule(reason?: string): void;
  /** 立即落盘（`beforeunload` / 切项目时用） */
  flush(reason?: string): void;
  /** 是否有待写入 */
  pending(): boolean;
  /** 卸载：取消防抖 + 移除 beforeunload */
  dispose(): void;
}

export function createPersistController(deps: PersistControllerDeps): PersistController {
  let timer: Cancel | null = null;
  let reason = 'persist';

  const doWrite = (r: string): void => {
    timer = null;
    const s = deps.readState();

    // ① 工程（原实现只做这一步）
    const res = persistProject({ projects: s.projects, activeId: s.activeId, reason: r }, deps.persist);
    if (!res.ok) {
      // ★ 原样透传（原则 6）
      deps.onError(res.message);
      return;
    }

    // ② ★ 账号族（`docs/14` §2 ⭐ 缺口：原实现只读不写 ⇒ 账号增删改刷新即丢）
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

    // ③ ★ Lovart 画廊（与上面两族同法：失败即返回、错误原样透传）
    //    ⚠️ 用**通用件** `persistLsKey`（判据 C1：单键落盘的第二处 ⇒ 抽出来，不复制一份）
    const gal = persistLsKey(LS_LOVART_GALLERIES, s.lovartGalleries, { storage: deps.persist.storage });
    if (!gal.ok) {
      deps.onError(gal.message);
      return;
    }

    // ④ ★ 指纹体检历史（同上）
    const scan = persistLsKey(LS_SCAN_HISTORY, s.scanHistory, { storage: deps.persist.storage });
    if (!scan.ok) {
      deps.onError(scan.message);
      return;
    }

    deps.onOk?.();
  };

  const schedule = (r = 'persist'): void => {
    reason = r;
    if (timer) timer(); // 重置防抖窗口
    timer = deps.clock.setTimeout(() => doWrite(reason), PERSIST_DEBOUNCE_MS);
  };

  const flush = (r?: string): void => {
    if (timer) {
      timer();
      timer = null;
    }
    doWrite(r ?? reason);
  };

  const onBeforeUnload = (): void => {
    if (timer) flush('beforeunload');
  };

  if (typeof window !== 'undefined') {
    window.addEventListener('beforeunload', onBeforeUnload);
  }

  return {
    schedule,
    flush,
    pending: () => timer !== null,
    dispose: () => {
      if (timer) timer();
      timer = null;
      if (typeof window !== 'undefined') window.removeEventListener('beforeunload', onBeforeUnload);
    },
  };
}
