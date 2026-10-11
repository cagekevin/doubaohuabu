/**
 * `resolveApiProviderId` 单测（原 `shared.js:30624-30649`）
 *
 * 断言红线：实现一变必红 —— 覆盖「首选可用 / 首选被跳过 / 能力不符 / 未启用 / 无密钥 / 空表」。
 */

import { describe, expect, it } from 'vitest';
import { resolveApiProviderId } from '../apiProvider';
import type { ApiConfigMap, ApiProviderMeta, ApiSetup } from '@/stable/model/gen';

const meta = (id: string, capabilities: string[]): ApiProviderMeta => ({ id, name: id, capabilities });

const cfg = (over: Partial<{ enabled: boolean; hasKey: boolean }> = {}) => ({
  id: 'x',
  enabled: over.enabled ?? true,
  baseUrl: '',
  model: '',
  params: {},
  hasKey: over.hasKey ?? true,
  keyHint: '',
  hasSecret: false,
});

const setup = (over: Partial<ApiSetup> = {}): ApiSetup => ({
  imageProviderId: null,
  videoProviderId: null,
  fallbackProviderId: null,
  concurrency: 3,
  ...over,
});

describe('resolveApiProviderId', () => {
  it('首选可用 ⇒ 直接返回首选', () => {
    const providers = [meta('a', ['video']), meta('b', ['video'])];
    const configs: ApiConfigMap = { a: cfg(), b: cfg() };
    expect(resolveApiProviderId('video', providers, configs, setup({ videoProviderId: 'b' }))).toBe('b');
  });

  it('首选能力不符 ⇒ 线性找第一个可用的', () => {
    const providers = [meta('a', ['image']), meta('b', ['video'])];
    const configs: ApiConfigMap = { a: cfg(), b: cfg() };
    expect(resolveApiProviderId('video', providers, configs, setup({ videoProviderId: 'a' }))).toBe('b');
  });

  it('首选未启用（`enabled === false`）⇒ 跳过它', () => {
    const providers = [meta('a', ['video']), meta('b', ['video'])];
    const configs: ApiConfigMap = { a: cfg({ enabled: false }), b: cfg() };
    expect(resolveApiProviderId('video', providers, configs, setup({ videoProviderId: 'a' }))).toBe('b');
  });

  it('首选无密钥 ⇒ 跳过它', () => {
    const providers = [meta('a', ['video']), meta('b', ['video'])];
    const configs: ApiConfigMap = { a: cfg({ hasKey: false }), b: cfg() };
    expect(resolveApiProviderId('video', providers, configs, setup({ videoProviderId: 'a' }))).toBe('b');
  });

  it('`enabled` 缺省（配置里没这个键）⇒ 视为启用', () => {
    const providers = [meta('a', ['image'])];
    const configs: ApiConfigMap = {
      a: { ...cfg(), enabled: undefined as unknown as boolean },
    };
    expect(resolveApiProviderId('image', providers, configs, setup())).toBe('a');
  });

  it('image / video 各自认自己的能力项（互不串台）', () => {
    const providers = [meta('a', ['image']), meta('b', ['video'])];
    const configs: ApiConfigMap = { a: cfg(), b: cfg() };
    expect(resolveApiProviderId('image', providers, configs, setup())).toBe('a');
    expect(resolveApiProviderId('video', providers, configs, setup())).toBe('b');
  });

  it('没有任何可用 ⇒ null（不造默认值）', () => {
    expect(resolveApiProviderId('video', [], {}, setup())).toBeNull();
    expect(
      resolveApiProviderId('video', [meta('a', ['video'])], { a: cfg({ hasKey: false }) }, setup()),
    ).toBeNull();
  });
});
