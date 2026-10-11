/**
 * 日志唯一入口单测 —— ★ `TD-16-108` 的**开关**（级别闸）
 *
 * 原则 7：只测纯逻辑（本文件在 `src/lib/tests/` 下，合规）
 *
 * ⚠️ `vite.config.ts` 开了 `isolate: false`（worker 跨文件复用）⇒ 本文件**必须**在
 *   `afterEach` 里 `log.resetLevel()`，否则会把级别泄漏给其它测试文件。
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { log } from '../log';
import { IS_DEV } from '../env';

afterEach(() => {
  log.resetLevel();
  vi.restoreAllMocks();
});

/** 装三个 spy，返回它们的调用记录 */
function spyConsole() {
  return {
    warn: vi.spyOn(console, 'warn').mockImplementation(() => {}),
    error: vi.spyOn(console, 'error').mockImplementation(() => {}),
    info: vi.spyOn(console, 'info').mockImplementation(() => {}),
  };
}

describe('log · 开关（TD-16-108）', () => {
  it('★ 级别清单由低到高（`silent` < `error` < `warn` < `info`）', () => {
    expect(log.LEVELS).toEqual(['silent', 'error', 'warn', 'info']);
  });

  it('★ 默认级别由 `lib/env.ts` 的 `IS_DEV` 定：开发/测试 `info`，生产 `warn`', () => {
    // 这条钉住"单源"：默认值**不是**散写在这里的魔法值，而是 env 单源的函数
    expect(log.getLevel()).toBe(IS_DEV ? 'info' : 'warn');
  });

  it('★ `silent` ⇒ 三档都不进控制台', () => {
    log.setLevel('silent');
    const c = spyConsole();
    log.warn('w');
    log.error('e');
    log.info('i');
    expect(c.warn).not.toHaveBeenCalled();
    expect(c.error).not.toHaveBeenCalled();
    expect(c.info).not.toHaveBeenCalled();
  });

  it('★ `error` ⇒ 只放行 error（warn/info 被闸）', () => {
    log.setLevel('error');
    const c = spyConsole();
    log.warn('w');
    log.error('e');
    log.info('i');
    expect(c.error).toHaveBeenCalledTimes(1);
    expect(c.warn).not.toHaveBeenCalled();
    expect(c.info).not.toHaveBeenCalled();
  });

  it('★ `warn` ⇒ 放行 error ＋ warn，闸掉 info（**生产默认档**）', () => {
    log.setLevel('warn');
    const c = spyConsole();
    log.warn('w');
    log.error('e');
    log.info('i');
    expect(c.warn).toHaveBeenCalledTimes(1);
    expect(c.error).toHaveBeenCalledTimes(1);
    expect(c.info).not.toHaveBeenCalled();
  });

  it('★ `info` ⇒ 三档全放行，且**逐字透传**（多参、非字符串原样）', () => {
    log.setLevel('info');
    const c = spyConsole();
    const obj = { a: 1 };
    log.warn('[chime] 播放失败:', obj);
    log.error('boom');
    log.info('[hydrate]', 'a\nb');
    expect(c.warn).toHaveBeenCalledWith('[chime] 播放失败:', obj);
    expect(c.error).toHaveBeenCalledWith('boom');
    expect(c.info).toHaveBeenCalledWith('[hydrate]', 'a\nb');
  });

  it('★ 非法级别 ⇒ **原样不动**（不抛、不改）', () => {
    log.setLevel('warn');
    log.setLevel('trace' as never);
    expect(log.getLevel()).toBe('warn');
  });

  it('★ `resetLevel()` 回默认档（测试清理用）', () => {
    log.setLevel('silent');
    log.resetLevel();
    expect(log.getLevel()).toBe(IS_DEV ? 'info' : 'warn');
  });
});
