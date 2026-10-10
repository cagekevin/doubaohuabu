/**
 * 启动归位 · 清在途任务状态（`resetStaleJobs`）
 *
 * 判据：**上次运行残留的在途状态必须被清掉**（重启后它们永远不会有结果）
 * ⚠️ 同时验「不该动的不动」—— 已完成的 `apiJob` / 其它节点类型 / 无关字段必须原样
 */

import { describe, expect, it } from 'vitest';
import { resetStaleJobs } from '../resetStaleJobs';

const proj = (nodes: unknown[]): { id: string; data: { nodes: unknown[] } } => ({
  id: 'p_1',
  data: { nodes },
});

describe('resetStaleJobs · 清在途任务状态', () => {
  it('★ 清掉 `_pendingAttempt` / `_pendingAttempts`', () => {
    const out = resetStaleJobs([
      proj([{ id: 'gv_1', type: 'genvideo', data: { label: '文生视频', _pendingAttempt: 2, _pendingAttempts: [] } }]),
    ]);
    expect(out.changed).toBe(true);
    const d = (out.value[0]!.data.nodes[0] as { data: Record<string, unknown> }).data;
    expect('_pendingAttempt' in d).toBe(false);
    expect('_pendingAttempts' in d).toBe(false);
    expect(d.label).toBe('文生视频'); // 无关字段保留
  });

  it('★ 清掉 queued / submitting / running 的 apiJob', () => {
    for (const status of ['queued', 'submitting', 'running']) {
      const out = resetStaleJobs([
        proj([{ id: 'gv_1', type: 'genvideo', data: { apiJob: { id: 'j1', status } } }]),
      ]);
      expect(out.changed, `status=${status} 应被清`).toBe(true);
      const d = (out.value[0]!.data.nodes[0] as { data: Record<string, unknown> }).data;
      expect('apiJob' in d).toBe(false);
    }
  });

  it('★ **不动**已完成的 apiJob（done / failed）', () => {
    for (const status of ['done', 'failed']) {
      const out = resetStaleJobs([proj([{ id: 'gv_1', type: 'genvideo', data: { apiJob: { id: 'j1', status } } }])]);
      expect(out.changed, `status=${status} 不该被清`).toBe(false);
      const d = (out.value[0]!.data.nodes[0] as { data: Record<string, unknown> }).data;
      expect(d.apiJob).toEqual({ id: 'j1', status });
    }
  });

  it('★ 只动 `genvideo` —— 其它节点类型即使带同名字段也不动', () => {
    const out = resetStaleJobs([
      proj([{ id: 'ig_1', type: 'imggen', data: { _pendingAttempt: 1, apiJob: { status: 'running' } } }]),
    ]);
    expect(out.changed).toBe(false);
  });

  it('★ 不可变：入参不被修改', () => {
    const node = { id: 'gv_1', type: 'genvideo', data: { apiJob: { status: 'queued' } } };
    const input = [proj([node])];
    const out = resetStaleJobs(input);
    expect(out.changed).toBe(true);
    // 原入参仍是原样
    expect((input[0]!.data.nodes[0] as { data: Record<string, unknown> }).data.apiJob).toEqual({ status: 'queued' });
    expect(node.data.apiJob).toEqual({ status: 'queued' });
  });

  it('★ 幂等：跑第二遍 changed=false', () => {
    const once = resetStaleJobs([proj([{ id: 'gv_1', type: 'genvideo', data: { apiJob: { status: 'running' } } }])]);
    const twice = resetStaleJobs(once.value);
    expect(once.changed).toBe(true);
    expect(twice.changed).toBe(false);
  });

  it('空工程 / 无 nodes 不炸', () => {
    expect(resetStaleJobs([]).changed).toBe(false);
    expect(resetStaleJobs([{ data: {} }]).changed).toBe(false);
    expect(resetStaleJobs([{ data: { nodes: [] } }]).changed).toBe(false);
  });

  it('有改动时给出日志（不静默）', () => {
    const out = resetStaleJobs([proj([{ id: 'gv_1', type: 'genvideo', data: { apiJob: { status: 'queued' } } }])]);
    expect(out.notes.length).toBe(1);
    expect(out.notes[0]).toContain('在途任务');
  });
});
