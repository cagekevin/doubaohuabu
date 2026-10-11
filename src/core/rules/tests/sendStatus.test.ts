/**
 * 发送状态显示单测（原 `CL.jsx:757-762`）
 *
 * ⚠️ 断言**逐值对源**（三档：`sending` / `success` / **其余一律 `⚠`**）—— 不是"不崩"式自证。
 */

import { describe, expect, it } from 'vitest';
import { sendStatusView } from '../sendStatus';

describe('sendStatusView（原 `CL.jsx:757-762`）', () => {
  it('★ 空 / 未定义 ⇒ `null`（源 `l && l.status` 为假 ⇒ 不渲染）', () => {
    expect(sendStatusView(undefined)).toBeNull();
    expect(sendStatusView('')).toBeNull();
  });

  it('`sending` / `success` 各一档（图标**含尾空格**，逐字）', () => {
    expect(sendStatusView('sending')).toEqual({ icon: '⏳ ', tone: 'sending' });
    expect(sendStatusView('success')).toEqual({ icon: '✓ ', tone: 'success' });
  });

  it('★ **其余一律** `⚠`（含 `waiting` / `skipped` / `error` / 未知值）', () => {
    for (const s of ['error', 'waiting', 'skipped', 'whatever']) {
      expect(sendStatusView(s)).toEqual({ icon: '⚠ ', tone: 'error' });
    }
  });
});
