/**
 * ApiPort 的 mock 实现（开发期）
 * 行为对齐 docs/05-配置契约层.md §五（provider 契约 + 密钥脱敏）
 *
 * ⚠️ 密钥明文**永不过桥**：mock 也遵守（只回 keyHint）
 */

import type { ApiPort } from '@/core/ports/host.port';
import { err, ok } from '@/core/model/result';

const PROVIDERS = [
  { id: 'volcengine-ark', name: '火山方舟（即梦）', capabilities: ['video', 'image'], enabled: true, hasKey: false },
  { id: 'geeknow-relay', name: '中转聚合', capabilities: ['video', 'image'], enabled: true, hasKey: false },
  { id: 'vidu', name: 'Vidu', capabilities: ['video'], enabled: true, hasKey: false },
  { id: 'kling', name: '可灵', capabilities: ['video'], enabled: true, hasKey: false, hasSecret: false },
  { id: 'llm-openai-compat', name: 'LLM（OpenAI 兼容）', capabilities: ['llm'], enabled: true, hasKey: false },
] as const;

/** mock 任务序号 */
let mockJobSeq = 0;

export function createMockApi(): ApiPort {
  return {
    providersList: async () => ok(PROVIDERS.map((p) => ({ ...p }))),

    configGet: async () => ok({}),

    configSet: async () => ok(undefined),

    configSetKey: async () => err('unknown', 'mock: 密钥保存需接真实宿主（M4）'),

    configSetSecret: async () => err('unknown', 'mock: 密钥保存需接真实宿主（M4）'),

    configTest: async () => err('unknown', 'mock: 未接后端，无法测试连通性'),

    /**
     * mock 的任务提交：**返回一个假任务**（开发期可跑通生成链路）。
     * ⚠️ 这是**刻意的 mock 行为** —— 真实宿主会真的排队并回调 `onApiJobEvent`。
     *    mock 不伪造"已完成的产物"，只伪造"已受理"（避免假成功掩盖缺失）。
     */
    jobSubmit: async (payload: unknown) => {
      const p = payload as { kind?: string } | null;
      return ok({
        id: `job_mock_${(mockJobSeq += 1)}`,
        status: 'queued' as const,
        kind: p?.kind === 'video' ? ('video' as const) : ('image' as const),
      });
    },

    jobBatch: async () => ok([]),

    jobCancel: async () => ok(undefined),

    jobList: async () => ok([]),

    setupGet: async () =>
      ok({ imageProviderId: null, videoProviderId: null, fallbackProviderId: null, concurrency: 3 }),

    setupSet: async () => ok(undefined),

    onJobEvent: () => () => {
      /* mock：无事件源 */
    },
  };
}
