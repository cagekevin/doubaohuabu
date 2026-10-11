/**
 * ApiPort 的 mock 实现（开发期）
 * 行为对齐 docs/05-配置契约层.md §五（provider 契约 + 密钥脱敏）
 *
 * ⚠️ 密钥明文**永不过桥**：mock 也遵守（只回 keyHint）
 * ⚠️ 假成功禁令：mock **只伪造「已受理」**（返回任务 id），**不伪造**已完成产物 / 已保存的配置。
 */

import type { ApiPort } from '@/core/ports/host.port';
import type { ApiProviderMeta, ApiSetup } from '@/stable/model/gen';
import { DEFAULT_API_CONCURRENCY } from '@/constants';
import { err, ok } from '@/core/model/result';

const PROVIDERS: readonly ApiProviderMeta[] = [
  { id: 'volcengine-ark', name: '火山方舟（即梦）', capabilities: ['video', 'image'], enabled: true, hasKey: false },
  { id: 'geeknow-relay', name: '中转聚合', capabilities: ['video', 'image'], enabled: true, hasKey: false },
  { id: 'vidu', name: 'Vidu', capabilities: ['video'], enabled: true, hasKey: false },
  { id: 'kling', name: '可灵', capabilities: ['video'], enabled: true, hasKey: false, hasSecret: false },
  { id: 'llm-openai-compat', name: 'LLM（OpenAI 兼容）', capabilities: ['llm'], enabled: true, hasKey: false },
];

/** mock 任务序号（原 `apj-<base36>-<seq>` 形态） */
let mockJobSeq = 0;
const nextJobId = (): string => {
  mockJobSeq += 1;
  return `apj-mock-${mockJobSeq}`;
};

const defaultSetup = (): ApiSetup => ({
  imageProviderId: null,
  videoProviderId: null,
  fallbackProviderId: null,
  concurrency: DEFAULT_API_CONCURRENCY,
});

export function createMockApi(): ApiPort {
  return {
    providersList: async () => ok(PROVIDERS.map((p) => ({ ...p }))),

    /** 配置原文由主进程持有（mock 没有）⇒ 如实给空表，**不假装**读到了 */
    configGet: async () => ok({ providers: PROVIDERS.map((p) => ({ ...p })), configs: {} }),

    configSet: async () => err('unknown', 'mock: 配置保存需接真实宿主'),

    configSetKey: async () => err('unknown', 'mock: 密钥保存需接真实宿主'),

    configSetSecret: async () => err('unknown', 'mock: 密钥保存需接真实宿主'),

    configTest: async () => err('unknown', 'mock: 未接后端，无法测试连通性'),

    /**
     * mock 的任务提交：**返回一个假任务 id**（开发期可跑通生成链路）。
     * ⚠️ 这是**刻意的 mock 行为** —— 真实宿主会真的排队并回调 `onJobEvent`；
     *    mock 没有引擎 ⇒ **不会有任何完成事件**（不伪造产物）。
     */
    jobSubmit: async () => ok({ jobId: nextJobId() }),

    /** 批量：与真实后端同形（逐位 `jobIds` / `errors`），同样只表示「已受理」 */
    jobBatch: async (_basePayload: unknown, matrix: unknown) => {
      const n = Array.isArray(matrix) ? matrix.length : 0;
      return ok({
        jobIds: Array.from({ length: n }, () => nextJobId() as string | null),
        errors: Array.from({ length: n }, () => null as string | null),
        total: n,
      });
    },

    jobCancel: async () => ok({ status: 'cancelled' }),

    jobList: async () => ok([]),

    setupGet: async () => ok({ setup: defaultSetup(), usage: {} }),

    /** 后端语义是「补丁 + 回灌」，mock 用内存镜像这一点（**不是**持久化） */
    setupSet: async (patch) => ok({ setup: { ...defaultSetup(), ...patch } }),

    onJobEvent: () => () => {
      /* mock：无事件源 */
    },
  };
}
