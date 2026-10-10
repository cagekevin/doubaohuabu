/**
 * 指纹相关常量（★ SSOT）
 *
 * 依据：docs/06-账号与站点集成.md §3 + `zk`（shared.js:34296-34336）
 */

/**
 * 指纹关联的 `warn` 阈值（原 `zk` 的 `m >= 0.7`）
 * ⚠️ **全部 7 维相同 ⇒ `critical`**（不看比例）
 */
export const FINGERPRINT_WARN_RATIO = 0.7;

/** 指纹维度数（原 `Jl.length`）—— 比较分母 */
export const FINGERPRINT_DIMENSION_COUNT = 7;

/**
 * 当前指纹版本（原 `Zh = 3`，shared.js:25120）
 * ⚠️ 与 `stable/model/account.ts` 的 `isFingerprintStale` 共用
 */
export const FINGERPRINT_VERSION = 3;
