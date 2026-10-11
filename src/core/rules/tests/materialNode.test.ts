/**
 * 素材节点「同源」判定单测（原 `Ms`，`shared.js:24117-24132`）
 *
 * ⚠️ 断言**逐值对源**（`libId` 优先 / `dataUrl` **或 `poster`** 反查 / 都空 ⇒ 空串）——
 *    不是"不崩"式自证。
 */

import { describe, expect, it } from 'vitest';
import { findMaterialNodeByLibId, materialLibId } from '../materialNode';

const lib = [
  { id: 'lib_1', dataUrl: 'img://a.png' },
  { id: 'lib_2', dataUrl: 'img://b.png' },
];

describe('materialLibId（原 `Ms`）', () => {
  it('★ 节点自带 `libId` ⇒ **直接用它**（不再反查）', () => {
    expect(materialLibId({ type: 'material', data: { libId: 'lib_9', dataUrl: 'img://a.png' } }, lib)).toBe('lib_9');
  });

  it('没有 `libId` ⇒ 按 `dataUrl` 反查资源库', () => {
    expect(materialLibId({ type: 'material', data: { dataUrl: 'img://b.png' } }, lib)).toBe('lib_2');
  });

  it('★ **`poster` 也参与反查**（生成节点的图在 `poster` 里 —— 源是一条 `||` 链）', () => {
    expect(materialLibId({ type: 'genvideo', data: { poster: 'img://a.png' } }, lib)).toBe('lib_1');
    // `dataUrl` 优先于 `poster`
    expect(materialLibId({ data: { dataUrl: 'img://b.png', poster: 'img://a.png' } }, lib)).toBe('lib_2');
  });

  it('★ 都空 / 反查不到 ⇒ **空串**（不是 `null`）', () => {
    expect(materialLibId({ data: {} }, lib)).toBe('');
    expect(materialLibId(null, lib)).toBe('');
    expect(materialLibId(undefined, lib)).toBe('');
    expect(materialLibId({ data: { dataUrl: 'img://zzz.png' } }, lib)).toBe('');
    // ⚠️ 库里那条 `dataUrl` 为空 ⇒ 不参与匹配（源的 `o.dataUrl && …`）
    expect(materialLibId({ data: { dataUrl: '' } }, [{ id: 'lib_x', dataUrl: '' }])).toBe('');
  });

  it('`libId` 非字符串（脏数据）⇒ 当没有，走反查', () => {
    expect(materialLibId({ data: { libId: 7, dataUrl: 'img://a.png' } }, lib)).toBe('lib_1');
  });
});

describe('findMaterialNodeByLibId', () => {
  const nodes = [
    { id: 'n_text', type: 'text', data: { libId: 'lib_1' } }, // ⚠️ 非 material ⇒ 不算
    { id: 'n_m1', type: 'material', data: { libId: 'lib_1' } },
    { id: 'n_m2', type: 'material', data: { dataUrl: 'img://b.png' } },
  ];

  it('只认 `type === material`，且取**第一个**命中', () => {
    expect(findMaterialNodeByLibId(nodes, lib, 'lib_1')?.id).toBe('n_m1');
    expect(findMaterialNodeByLibId(nodes, lib, 'lib_2')?.id).toBe('n_m2');
  });

  it('★ `libId` 空 ⇒ `undefined`（源先判 `c` 才查）', () => {
    expect(findMaterialNodeByLibId(nodes, lib, '')).toBeUndefined();
  });

  it('没有命中 ⇒ `undefined`', () => {
    expect(findMaterialNodeByLibId(nodes, lib, 'lib_zzz')).toBeUndefined();
  });
});
