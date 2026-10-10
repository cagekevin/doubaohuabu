/**
 * 撤销/重做栈单测 —— 对应 docs/08-验证用例.md **W5**
 *
 * 原则 7：只测纯逻辑（本文件在 `core/rules/tests/` 下，合规）
 */

import { describe, expect, it } from 'vitest';
import { commitSnapshot, initialUndoStack, redo, shouldMerge, undo, type UndoStack } from '../undo';
import { UNDO_LIMIT, UNDO_MERGE_MS } from '@/constants';

/** 模拟「节点位置」这一被快照的状态 */
interface Snap {
  x: number;
}

const snap = (x: number): Snap => ({ x });

/** 模拟一次「变更前 commit + 变更」 */
function step(
  stack: UndoStack<Snap>,
  before: Snap,
  after: Snap,
  key: string,
  now: number,
): { stack: UndoStack<Snap>; current: Snap } {
  const next = commitSnapshot(stack, before, key, now);
  return { stack: next, current: after };
}

describe('W5 · 常量', () => {
  it('★ 合并窗口 800ms / 栈上限 80（与源码一致）', () => {
    expect(UNDO_MERGE_MS).toBe(800);
    expect(UNDO_LIMIT).toBe(80);
  });
});

describe('W5 · shouldMerge', () => {
  it('同 key 且在窗口内 → 合并', () => {
    const s: UndoStack<Snap> = { past: [], future: [], lastKey: 'drag', lastAt: 1000 };
    expect(shouldMerge(s, 'drag', 1500)).toBe(true);
  });

  it('★ 边界：恰好 800ms → **不**合并（源码是 `< 800`）', () => {
    const s: UndoStack<Snap> = { past: [], future: [], lastKey: 'drag', lastAt: 1000 };
    expect(shouldMerge(s, 'drag', 1800)).toBe(false);
    expect(shouldMerge(s, 'drag', 1799)).toBe(true);
  });

  it('不同 key → 不合并', () => {
    const s: UndoStack<Snap> = { past: [], future: [], lastKey: 'drag', lastAt: 1000 };
    expect(shouldMerge(s, 'delete', 1100)).toBe(false);
  });

  it('key 为空 → 不合并（源码：`if (n && ...)`）', () => {
    const s: UndoStack<Snap> = { past: [], future: [], lastKey: '', lastAt: 1000 };
    expect(shouldMerge(s, '', 1100)).toBe(false);
  });
});

describe('W5 · ① 10 次移动（间隔 <800ms）合并为 1 步', () => {
  it('★ 压栈只发生 1 次；undo 一次回到初始位置', () => {
    let stack = initialUndoStack<Snap>();
    let current = snap(0);

    // 10 次移动，每次间隔 100ms（< 800ms，同 key）
    for (let i = 1; i <= 10; i++) {
      const r = step(stack, current, snap(i * 10), 'graph-move', 1000 + i * 100);
      stack = r.stack;
      current = r.current;
    }

    expect(current.x).toBe(100);
    // ★ 合并成 1 步
    expect(stack.past).toHaveLength(1);
    // 快照是「第一次变更前」的状态 = 初始位置
    expect(stack.past[0]).toEqual(snap(0));

    // ② undo 一次 → 回到初始位置
    const u = undo(stack, current);
    expect(u).not.toBeNull();
    expect(u!.restored).toEqual(snap(0));
    expect(u!.stack.past).toHaveLength(0);
  });

  it('间隔 ≥800ms → 各自成步', () => {
    let stack = initialUndoStack<Snap>();
    let current = snap(0);
    for (let i = 1; i <= 3; i++) {
      const r = step(stack, current, snap(i * 10), 'graph-move', 1000 + i * 900);
      stack = r.stack;
      current = r.current;
    }
    expect(stack.past).toHaveLength(3);
  });

  it('不同 key 不合并', () => {
    let stack = initialUndoStack<Snap>();
    stack = commitSnapshot(stack, snap(0), 'graph-move', 1000);
    stack = commitSnapshot(stack, snap(10), 'delete', 1100);
    expect(stack.past).toHaveLength(2);
  });
});

describe('W5 · ③ 栈上限 80', () => {
  it('★ 连续 100 次独立操作后，past 最多 80', () => {
    let stack = initialUndoStack<Snap>();
    for (let i = 0; i < 100; i++) {
      // 每次间隔 900ms（不合并）+ 不同 key
      stack = commitSnapshot(stack, snap(i), `op-${i}`, 1000 + i * 900);
    }
    expect(stack.past).toHaveLength(UNDO_LIMIT);
    // 最旧的被 shift 掉 ⇒ 首个是第 20 次（index 20）
    expect(stack.past[0]).toEqual(snap(20));
    expect(stack.past[stack.past.length - 1]).toEqual(snap(99));
  });
});

describe('W5 · undo / redo 对称性', () => {
  it('undo 后 redo 回到原状态', () => {
    let stack = commitSnapshot(initialUndoStack<Snap>(), snap(0), 'a', 1000);
    const u = undo(stack, snap(10))!;
    stack = u.stack;
    expect(u.restored).toEqual(snap(0));

    const r = redo(stack, u.restored)!;
    expect(r.restored).toEqual(snap(10));
  });

  it('空栈 undo / redo → null（不抛）', () => {
    const s = initialUndoStack<Snap>();
    expect(undo(s, snap(0))).toBeNull();
    expect(redo(s, snap(0))).toBeNull();
  });

  it('★ 新提交会清空 future（不能 redo 到分叉后的旧分支）', () => {
    let stack = commitSnapshot(initialUndoStack<Snap>(), snap(0), 'a', 1000);
    const u = undo(stack, snap(10))!;
    stack = u.stack;
    expect(stack.future).toHaveLength(1);

    stack = commitSnapshot(stack, snap(0), 'b', 2000);
    expect(stack.future).toHaveLength(0);
  });

  it('★ 合并时也清 future（源码：`e({future: []}); return;`）', () => {
    let stack = commitSnapshot(initialUndoStack<Snap>(), snap(0), 'a', 1000);
    const u = undo(stack, snap(10))!;
    stack = u.stack; // future 有 1 项
    stack = commitSnapshot(stack, snap(0), 'a', 1100); // 同 key 且 <800ms？lastAt 被 undo 置 0
    // undo 后 lastAt = 0 ⇒ 不满足 `now - 0 < 800`（1100 > 800）⇒ 走正常压栈
    expect(stack.future).toHaveLength(0);
  });

  it('undo 后 lastKey 被清空（源码 `_lastCommit: null`）', () => {
    const stack = commitSnapshot(initialUndoStack<Snap>(), snap(0), 'a', 1000);
    const u = undo(stack, snap(10))!;
    expect(u.stack.lastKey).toBeNull();
    expect(u.stack.lastAt).toBe(0);
  });
});
