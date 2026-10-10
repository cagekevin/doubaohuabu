/**
 * core/model 出口
 *
 * ⚠️ 归属修正（2026-10-10）：**数据形状**（`Project` / `Node` / `Account` / `ApiJob`…）
 *    已移到 `stable/model`（冻结契约），本目录只保留**行为**相关：
 *      - `result.ts`   —— `Result` 契约（原则 6 错误透传的载体）
 *      - `defaults.ts` —— 8 类节点默认值（数据，可演进）
 *
 *    原因：`stable/migrations` 需要数据形状，若形状在 `core` 则构成反向依赖
 *          （由 `dependency-cruiser` 的 `stable-no-upward` 抓出）。
 */

export * from './result';
export * from './defaults';

// 便捷转出：上层可从 `@/core/model` 统一取到数据形状（真源仍在 stable/model）
export type * from '@/stable/model';

// kind 联合的唯一真源在 constants（L0），此处转出便于上层统一从 core 取
export type { SendFailKind, BackendErrorKind, SendFailInfo, FailAction } from '@/constants/failure';
