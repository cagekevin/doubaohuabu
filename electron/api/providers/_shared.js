// ============================================================
// 服务商适配器的**共享件**（判据 C1「能一种的别搞两种」/ 三振出局）
// ------------------------------------------------------------
// 为什么有它：`transientErrorHints` 曾在 4 个 provider 里**逐字重复**
// （kling / vidu / llm-openai-compat / geeknow-relay）—— 改一处就得记住改四处。
// ⚠️ 只收**逐字相同**的；各自不同的（如 llm 的 `insufficient_quota` 专用 re、
//    geeknow 的「额度未扣除」表）**留在各自文件**，不强行合并（那会改匹配语义）。
// ============================================================

'use strict';

/**
 * 「瞬时网络错误」探测正则 —— 各 provider 共用（`executeJob` 据此判 retryable）。
 *
 * 覆盖：连接复位 / 中止 / 超时 / 半开 / 上游 DNS 抖动（undici 的 `UND_ERR`）。
 */
const TRANSIENT_ERROR_HINTS = /ECONNRESET|ECONNABORTED|ETIMEDOUT|ESOCKETTIMEDOUT|EPIPE|EAI_AGAIN|ENOTFOUND|UND_ERR/i;

module.exports = { TRANSIENT_ERROR_HINTS };
