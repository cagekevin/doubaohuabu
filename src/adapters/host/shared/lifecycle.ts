/**
 * 窗口生命周期端口的**浏览器实现**（electron 与 mock **共用一份** —— 判据 C1）
 *
 * ⚠️ `adapters` 碰 `window` 是**允许的**（原则 4 后半「脏归 adapters」）—— 这正是它
 *    相对 `state/persist.ts` 直挂 `window` 的意义：宿主访问**收在适配器层**。
 *
 * ⚠️ 无 `window` 的环境（node 单测）⇒ 退化为「不订阅」，仍返回**可调用**的取消函数
 *    （调用方 `dispose()` 无需分支）。
 */
import type { LifecyclePort } from '@/core/ports/host.port';

export function createWindowLifecycle(): LifecyclePort {
  return {
    onBeforeUnload: (cb) => {
      if (typeof window === 'undefined') return () => {};
      window.addEventListener('beforeunload', cb);
      return () => window.removeEventListener('beforeunload', cb);
    },
  };
}
