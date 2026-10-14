/**
 * `newAccountPartition` 单测 —— 分区**产生方**（源 `$P.jsx:31-35`）
 *
 * 原则 7：只测纯逻辑（本文件在 `core/rules/tests/` 下，合规）
 * ⚠️ 断言对源：形状 = `persist:<type>_d_<base36 时间>_<base36 随机 5 位>`；
 *    且「同一时间、不同随机 ⇒ 不同分区」——**这一条就是分区的全部意义**
 *    （它是会话隔离键；会重复就等于多账号共用 cookie）。
 */

import { describe, expect, it } from 'vitest';
import { makeImportedPartition, newAccountPartition } from '../partition';

describe('newAccountPartition（源 `$P.jsx:31-35`）', () => {
  it('形状逐字对源：`persist:<type>_d_<ts36>_<rand36>`', () => {
    // now = 0 ⇒ '0'；rand = 0.5 ⇒ '0.i' ⇒ slice(2,7) = 'i'（源那行也是直接 slice）
    expect(newAccountPartition('doubao', 0, 0.5)).toBe('persist:doubao_d_0_i');
  });

  it('真实量级：时间戳的 base36 段照进（定长前缀 + 5 位随机）', () => {
    const p = newAccountPartition('dola', 1_791_940_000_000, 0.123456789);
    expect(p).toMatch(/^persist:dola_d_[0-9a-z]+_[0-9a-z]{5}$/);
  });

  it('★ 类型原样进键（不做白名单/归一 —— 与源一致）', () => {
    expect(newAccountPartition('whatever', 0, 0.5)).toBe('persist:whatever_d_0_i');
  });

  it('★ 同一时间、不同随机 ⇒ 不同分区（会话隔离键的全部意义）', () => {
    const a = newAccountPartition('doubao', 1_791_940_000_000, 0.1);
    const b = newAccountPartition('doubao', 1_791_940_000_000, 0.9);
    expect(a).not.toBe(b);
  });

  it('★ 与「整个站点共用一个会话」划清界限：任何取值都带账号级后缀', () => {
    // 曾经那条 `defaultPartitionOf` 返回的是裸 `persist:doubao` ⇒ 多账号串味。
    // 这条断言锁住「产生方永远带后缀」—— 改回裸键必红。
    const p = newAccountPartition('doubao', 1_791_940_000_000, 0.5);
    expect(p).not.toBe('persist:doubao');
    expect(p.startsWith('persist:doubao_d_')).toBe(true);
  });
});

/**
 * 导入路径的**另一种形状**（源 `OP.jsx:636`）—— 两者同住本模块（分区键形状的唯一落点）
 *
 * ⚠️ 期望值**砸字面量**，不用 `IMPORTED_PARTITION_PREFIX` 拼：该常量是**冻结契约**
 *    （随账号数据落盘、老数据要能直接读）⇒ 常量被改时必须在这里变红。
 */
describe('makeImportedPartition（源 `OP.jsx:636`）', () => {
  it('形状逐字：`persist:import_<账号id>`', () => {
    expect(makeImportedPartition('acc_mv1raqbo_0')).toBe('persist:import_acc_mv1raqbo_0');
  });

  it('★ 与建号形状**不是同一个键**（导入号不会撞上登录号）', () => {
    const imported = makeImportedPartition('acc_1');
    const fresh = newAccountPartition('doubao', 1_791_940_000_000, 0.5);
    expect(imported).not.toBe(fresh);
    expect(imported.startsWith('persist:import_')).toBe(true);
  });
});
