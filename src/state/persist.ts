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
import { persistProject, type PersistDeps } from '@/core/usecases/persistProject';
import { PERSIST_DEBOUNCE_MS } from '@/constants';

export interface PersistControllerDeps {
  clock: ClockPort;
  /** 落盘依赖（由 container 组装；含 storage + migrationCtx + 备份/快照） */
  persist: PersistDeps;
  /** 取当前要存的数据（**读取**由 state 提供，本模块不 import store） */
  readState: () => { projects: Project[]; activeId: string | null };
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
    const { projects, activeId } = deps.readState();
    const res = persistProject({ projects, activeId, reason: r }, deps.persist);
    if (res.ok) {
      deps.onOk?.();
    } else {
      // ★ 原样透传（原则 6）
      deps.onError(res.message);
    }
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
