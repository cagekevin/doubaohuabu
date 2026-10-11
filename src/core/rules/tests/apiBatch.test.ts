/**
 * `planVideoBatchLanding` 单测（原 `Z3_1.jsx:928-940`）
 *
 * 断言红线：实现一变必红 —— 覆盖「全成功 / 部分失败 / 全失败」三种 `jobIds` 形状。
 */

import { describe, expect, it } from 'vitest';
import { planVideoBatchLanding } from '../apiBatch';

const provider = { id: 'kl', name: '可灵' };

describe('planVideoBatchLanding', () => {
  it('三比例全成功 ⇒ count=3、jobId 取第一个', () => {
    const r = planVideoBatchLanding({ jobIds: ['j1', 'j2', 'j3'], errors: [null, null, null], total: 3 }, provider);
    expect(r.count).toBe(3);
    expect(r.apiJob).toEqual({
      jobId: 'j1',
      providerId: 'kl',
      providerName: '可灵',
      status: 'queued',
      kind: 'video',
      batch: true,
    });
  });

  it('首位失败、其后成功 ⇒ count 只数成功的、jobId 跳过 null', () => {
    const r = planVideoBatchLanding(
      { jobIds: [null, 'j2', 'j3'], errors: ['失败', null, null], total: 3 },
      provider,
    );
    expect(r.count).toBe(2);
    expect(r.apiJob.jobId).toBe('j2');
  });

  it('全部失败 ⇒ count=0、jobId=null（**不抛**，apiJob 仍可用作状态）', () => {
    const r = planVideoBatchLanding({ jobIds: [null, null, null], errors: ['a', 'b', 'c'], total: 3 }, provider);
    expect(r.count).toBe(0);
    expect(r.apiJob.jobId).toBeNull();
  });
});
