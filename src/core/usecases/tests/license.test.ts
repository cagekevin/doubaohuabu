/**
 * 授权用例单测
 *
 * 覆盖（`_Component48.jsx:105-145` + `W3.jsx` + `electron/license.js`）：
 *   - ★ **fail-close**：只有 `status === 'ok'` 放行；`none/expired/invalid/tampered/used` 一律不放行
 *   - ★ **业务失败 ≠ 传输失败**：`{status:'used'|'tampered'}` 走 `ok(...)`，`err` 只留给后端异常
 *   - 三个原因字段（`reason` / `tamperReason` / `error`）**原样带出去**（UI 才能分支显示）
 */

import { describe, expect, it } from 'vitest';
import {
  activateLicense,
  checkLicense,
  exportMachineCode,
  readMachineCode,
  type LicenseDeps,
} from '../license';
import { ok, err } from '@/core/model/result';
import type { LicenseStatus, LicenseStatusKind } from '@/core/model/license';

function makeDeps(over: Partial<LicenseDeps['license']> = {}): LicenseDeps {
  return {
    license: {
      getStatus: async () => ok({ status: 'ok' }),
      activateWithCode: async () => ok({ status: 'ok' }),
      exportMachineCode: async () => ok({ path: '/tmp/mc.txt' }),
      getMachineCode: async () => ok('DBPC-AAAA-BBBB-CCCC-DDDD'),
      ...over,
    },
  };
}

const statusOf = (status: LicenseStatusKind): LicenseStatus => ({ status });

describe('checkLicense · 启动闸门', () => {
  it('status ok ⇒ allowed true', async () => {
    const res = await checkLicense(makeDeps({ getStatus: async () => ok(statusOf('ok')) }));
    expect(res).toEqual(ok({ info: { status: 'ok' }, allowed: true }));
  });

  it('★ 其余 5 个状态一律**不放行**（fail-close）', async () => {
    for (const s of ['none', 'invalid', 'expired', 'tampered', 'used'] as const) {
      const res = await checkLicense(makeDeps({ getStatus: async () => ok(statusOf(s)) }));
      expect(res.ok).toBe(true);
      if (res.ok) expect(res.value.allowed).toBe(false);
    }
  });

  it('携带的字段原样保留（machineCode / expireAt / reason / tamperReason）', async () => {
    const info: LicenseStatus = {
      status: 'invalid',
      machineCode: 'DBPC-X',
      reason: '授权文件异常',
      expireAt: 123,
    };
    const res = await checkLicense(makeDeps({ getStatus: async () => ok(info) }));
    if (!res.ok) throw new Error('unreachable');
    expect(res.value.info).toEqual(info);
    expect(res.value.allowed).toBe(false);
  });

  it('后端失败 ⇒ **原样转发**（源版丢弃原因显示固定文案 ⇒ 原文留在 Result 里）', async () => {
    const res = await checkLicense(makeDeps({ getStatus: async () => err('unknown', 'no_window') }));
    expect(res).toEqual(err('unknown', 'no_window'));
  });
});

describe('activateLicense · ★ 业务失败也是 ok(...)', () => {
  it('激活成功 ⇒ allowed true', async () => {
    const res = await activateLicense(
      makeDeps({ activateWithCode: async () => ok({ status: 'ok', expireAt: 999 }) }),
      'CODE-1',
    );
    expect(res).toEqual(ok({ info: { status: 'ok', expireAt: 999 }, allowed: true }));
  });

  it('★ `used`（激活码已被使用）⇒ ok(...) + allowed false + error 原样保留', async () => {
    const res = await activateLicense(
      makeDeps({
        activateWithCode: async () => ok({ status: 'used', error: '该激活码已被使用，无法重复激活' }),
      }),
      'CODE-1',
    );
    if (!res.ok) throw new Error('unreachable');
    expect(res.value.allowed).toBe(false);
    expect(res.value.info.error).toBe('该激活码已被使用，无法重复激活');
  });

  it('★ `tampered`（时间篡改）⇒ tamperReason 原样保留', async () => {
    const res = await activateLicense(
      makeDeps({
        activateWithCode: async () =>
          ok({ status: 'tampered', tamperReason: 'clock_rollback', error: '检测到系统时间被回拨' }),
      }),
      'CODE-1',
    );
    if (!res.ok) throw new Error('unreachable');
    expect(res.value.info.tamperReason).toBe('clock_rollback');
    expect(res.value.allowed).toBe(false);
  });

  it('IPC 真的没打通 ⇒ err（与业务失败区分开）', async () => {
    const res = await activateLicense(
      makeDeps({ activateWithCode: async () => err('unknown', '窗口未就绪') }),
      'CODE-1',
    );
    expect(res).toEqual(err('unknown', '窗口未就绪'));
  });
});

describe('readMachineCode（原 W3.jsx:16-19）', () => {
  it('成功拿到机器码', async () => {
    expect(await readMachineCode(makeDeps())).toEqual(ok('DBPC-AAAA-BBBB-CCCC-DDDD'));
  });

  it('失败原样转发（不把空串当成功）', async () => {
    const res = await readMachineCode(makeDeps({ getMachineCode: async () => err('unknown', 'no_window') }));
    expect(res).toEqual(err('unknown', 'no_window'));
  });
});

describe('exportMachineCode', () => {
  it('成功转发 path', async () => {
    expect(await exportMachineCode(makeDeps(), 'MC')).toEqual(ok({ path: '/tmp/mc.txt' }));
  });

  it('失败转发（后端把「取消」也当失败 ⇒ 文案由适配器兜底）', async () => {
    const res = await exportMachineCode(
      makeDeps({ exportMachineCode: async () => err('unknown', '导出已取消') }),
      'MC',
    );
    expect(res).toEqual(err('unknown', '导出已取消'));
  });
});
