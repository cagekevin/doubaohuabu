import { describe, expect, it } from 'vitest';
import { collectGenParams } from '../genParams';

describe('collectGenParams（原 `Be` Phase 2c 的取参，`_Component43.jsx:1058-1063`）', () => {
  it('三项全无 ⇒ null（调用方走源那句「跳过（无生成参数）」）', () => {
    expect(collectGenParams({})).toBeNull();
    expect(collectGenParams(null)).toBeNull();
    expect(collectGenParams(undefined)).toBeNull();
  });

  it('只有 aspectRatio ⇒ 带它，另两项为 null', () => {
    expect(collectGenParams({ aspectRatio: '16:9' })).toEqual({
      aspectRatio: '16:9',
      duration: null,
      modelLabel: null,
    });
  });

  it('★ `duration: 0` 是**有效值**（源判的是 `!= null`，不是真值）', () => {
    expect(collectGenParams({ duration: 0 })).toEqual({
      aspectRatio: null,
      duration: 0,
      modelLabel: null,
    });
  });

  it('★ 只给 `model`（**id**）⇒ 仍是 null —— 源读的是 `params.modelLabel`，payload 里没这个键', () => {
    // ⚠️ 这条不是在测"我们的实现"，是在**锁住源的行为**：模型档在 Phase 2c **从不生效**。
    //    若哪天有人"顺手修正"成 `io(params.model)`，这条会红 —— 那正是它要提醒的。
    expect(collectGenParams({ model: 'seedance-2.5' })).toBeNull();
  });

  it('给了 `modelLabel`（展示名）⇒ 有效', () => {
    expect(collectGenParams({ modelLabel: 'Seedance 2.5' })).toEqual({
      aspectRatio: null,
      duration: null,
      modelLabel: 'Seedance 2.5',
    });
  });

  it('类型不符 ⇒ 当没有（`aspectRatio` 非字符串 / `duration` 非数字）', () => {
    expect(collectGenParams({ aspectRatio: 123 })).toBeNull();
    expect(collectGenParams({ duration: '10' })).toBeNull();
  });

  it('三项都有效 ⇒ 全带', () => {
    expect(
      collectGenParams({ aspectRatio: '9:16', duration: 10, modelLabel: 'Seedance 2.0' }),
    ).toEqual({ aspectRatio: '9:16', duration: 10, modelLabel: 'Seedance 2.0' });
  });
});
