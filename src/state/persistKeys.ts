/**
 * 20 个键的**「怎么读 / 怎么写」映射**（★ 键的**唯一落点**）
 *
 * 依据：`docs/16` §1.8 + §4.1（**用结构穷尽替代 `keys-coverage` 闸**）
 *
 * **三层分工**（`docs/16` §3 裁决 3）：
 *   - **形状** → `stable/contracts/lsValues.ts`（冻结契约）
 *   - **怎么存** → `core/usecases/persistProject`（工程 data：序列化 + 图片外置）
 *   - **怎么读/写** → **本文件**（`adapters/storage/local` 只管 localStorage，不碰业务 —— 见 `docs/11` §6.5 越权 3）
 *
 * ⚠️ **结构穷尽（这就是"不建闸"的替代物）**：
 *   `PersistMap` 是 **mapped type over `LsKey`** ⇒ 联合里每个成员**必填**
 *   ⇒ **少写一个键 = 编译不过**。所以「键声明了却没有落点」在结构上不可能发生，**无需闸**。
 *
 * ⚠️ **只读键没有 `write`**：`PersistMap` 用条件类型把 `doubao-canvas` / `access_token`
 *    （`keys.ts` 的 `READONLY_LS_KEYS`）收窄成「只有 `read`」⇒ 给它们写 `write` 反而是**类型错误**。
 *
 * ⚠️ **用法：用 `LS_*` 常量做下标**（它们是字面量类型 ⇒ 类型精确、**零断言**）：
 * ```ts
 * const projects = PERSIST[LS_PROJECTS].read(storage) ?? [];   // Project[]
 * PERSIST[LS_PROXY_POOL].write(storage, ['http://127.0.0.1:7890']);
 * ```
 * ⚠️ **不提供 `readKey<K>(key: K)` 这类泛型取值器** —— TS 在「泛型 `K` 索引映射类型」时会退化成
 *    **所有成员值的联合**（`write` 的参数甚至塌成 `never`）⇒ 只能靠 `as` 硬断言，而 `as` 是
 *    `TD-08-1` 已登记的反模式。用字面量下标既精确又无需断言。
 */

import type { StoragePort } from '@/core/ports';
import type { LsValue } from '@/stable/contracts/lsValues';
import {
  LS_ACCESS_TOKEN,
  LS_ACCOUNT_GROUPS,
  LS_ACCOUNT_POOL_STRATEGY,
  LS_ACCOUNTS,
  LS_AUTO_VIDEO_DETECT,
  LS_CANVAS_DEFAULTS,
  LS_FACE_MASK_OPTS,
  LS_IMGGEN_DEDUP,
  LS_LEGACY_CANVAS,
  LS_LOVART_GALLERIES,
  LS_NEWIMAGES_AUTOCAP,
  LS_NEWIMAGES_CURRENT_ONLY,
  LS_NEWIMAGES_FOLDED,
  LS_PRESETS,
  LS_PROJECTS,
  LS_PROXY_POOL,
  LS_SCAN_HISTORY,
  LS_SENDQUEUE_POS,
  LS_STYLES,
  LS_VIEW_HEAD_COLLAPSED,
  type READONLY_LS_KEYS,
  type LsKey,
} from '@/stable/contracts/keys';

/**
 * 只读键（**不得写入**）—— ★ **从唯一真源派生**：`keys.ts` 的 `READONLY_LS_KEYS`
 *
 * ⚠️ TD-01-6：此前这里**手写**了一份 `typeof LS_LEGACY_CANVAS | typeof LS_ACCESS_TOKEN`，
 *    与 `keys.ts` 那份数组各管各的 —— 加一个只读键要改两处，改漏一处**不报错**（静默漂）。
 *    派生后只改真源一处。
 * ⚠️ 不写字面量：`doubao-*` 字面量只允许出现在 `stable/contracts/`（`原则5/ssot-keys`）。
 */
type ReadonlyLsKey = (typeof READONLY_LS_KEYS)[number];

/** 可写键（联合） */
type WritableLsKey = Exclude<LsKey, ReadonlyLsKey>;

/**
 * 键 → 读写器。**可写键必须有 `write`；只读键必须没有**（条件类型，两向都挡）。
 */
type PersistMap = {
  [K in LsKey]: K extends ReadonlyLsKey
    ? { read(storage: StoragePort): LsValue<K> | null }
    : {
        read(storage: StoragePort): LsValue<K> | null;
        write(storage: StoragePort, value: LsValue<K>): void;
      };
};

/**
 * 可写键的读写器。
 * ⚠️ 参数**只收 `WritableLsKey`** —— 这一条堵住一个真实的洞：
 *    `rw(LS_ACCESS_TOKEN)` 的返回值是**函数调用结果**，不走「多余属性检查」
 *    ⇒ 若签名放宽到 `LsKey`，「给只读键挂 write」会**静默编译通过**（探针实测踩过）。
 */
const rw = <K extends WritableLsKey>(key: K) => ({
  read: (s: StoragePort) => s.read<LsValue<K>>(key),
  write: (s: StoragePort, v: LsValue<K>) => s.write(key, v),
});

/** 只读键的读器 */
const ro = <K extends LsKey>(key: K) => ({
  read: (s: StoragePort) => s.read<LsValue<K>>(key),
});

/**
 * ★ 20 键的读写映射 —— **唯一落点**。
 * 少一个键 / 给只读键加 `write` ⇒ **编译报错**（这就是替代闸的结构保证）。
 */
export const PERSIST: PersistMap = {
  [LS_PROJECTS]: rw(LS_PROJECTS),
  [LS_ACCOUNTS]: rw(LS_ACCOUNTS),
  [LS_ACCOUNT_GROUPS]: rw(LS_ACCOUNT_GROUPS),
  [LS_PRESETS]: rw(LS_PRESETS),
  [LS_STYLES]: rw(LS_STYLES),
  [LS_CANVAS_DEFAULTS]: rw(LS_CANVAS_DEFAULTS),
  [LS_LOVART_GALLERIES]: rw(LS_LOVART_GALLERIES),
  [LS_SCAN_HISTORY]: rw(LS_SCAN_HISTORY),
  [LS_PROXY_POOL]: rw(LS_PROXY_POOL),
  [LS_AUTO_VIDEO_DETECT]: rw(LS_AUTO_VIDEO_DETECT),
  [LS_FACE_MASK_OPTS]: rw(LS_FACE_MASK_OPTS),
  [LS_ACCOUNT_POOL_STRATEGY]: rw(LS_ACCOUNT_POOL_STRATEGY),
  [LS_SENDQUEUE_POS]: rw(LS_SENDQUEUE_POS),
  [LS_IMGGEN_DEDUP]: rw(LS_IMGGEN_DEDUP),
  [LS_LEGACY_CANVAS]: ro(LS_LEGACY_CANVAS),
  [LS_ACCESS_TOKEN]: ro(LS_ACCESS_TOKEN),
  [LS_NEWIMAGES_AUTOCAP]: rw(LS_NEWIMAGES_AUTOCAP),
  [LS_NEWIMAGES_CURRENT_ONLY]: rw(LS_NEWIMAGES_CURRENT_ONLY),
  [LS_NEWIMAGES_FOLDED]: rw(LS_NEWIMAGES_FOLDED),
  [LS_VIEW_HEAD_COLLAPSED]: rw(LS_VIEW_HEAD_COLLAPSED),
};
