/**
 * `defaultPartitionOf` 单测 —— `TD-04-11` 的真源（★ 纯函数，必测）
 *
 * 原则 7：只测纯逻辑（本文件在 `core/rules/tests/` 下，合规）
 */

import { describe, expect, it } from 'vitest';
import { defaultPartitionOf } from '../partition';

describe('defaultPartitionOf（原 BackendView 那条 type-aware 三目的通用形态）', () => {
  it('六种站点类型各得自己的会话（与源六路三目的取值一一对应）', () => {
    expect(defaultPartitionOf('doubao')).toBe('persist:doubao');
    expect(defaultPartitionOf('dola')).toBe('persist:dola');
    expect(defaultPartitionOf('lovart')).toBe('persist:lovart');
    expect(defaultPartitionOf('tapnow')).toBe('persist:tapnow');
    expect(defaultPartitionOf('gpt')).toBe('persist:gpt');
    expect(defaultPartitionOf('other')).toBe('persist:other');
  });

  it('未知类型不兜底成固定站点（照抄源的模板形态：类型原样进键）', () => {
    // ⚠️ 源版就是模板串，没有"未知类型"分支 ⇒ 这里**不擅自加**：加了才是新语义
    expect(defaultPartitionOf('whatever')).toBe('persist:whatever');
  });
});