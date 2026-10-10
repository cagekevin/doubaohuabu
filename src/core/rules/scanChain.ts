/**
 * 抓取降级链（★ 纯决策，必测 —— §6.5 原则 7）
 *
 * 依据（**回源 + 校验修正**）：
 *   - `dk` shared.js:23619-23778 —— 三档降级
 *   - `main.js`「`lovart-chrome-is-open` **故意恒返 false** —— 采集一律走 webview」
 *   - `09-校验记录.md` **C2**：Chrome CDP 采集通道是**死代码**
 *
 * ⚠️ **本版本实际只有两档**（`frames` → `webview`）。
 *    原 `dk` 里的 `chrome-cdp` 分支被 `if (f)` 守卫（`f` 恒 false）⇒ **不可达**；
 *    且 `window.api.lovartChromeEval` **全仓不存在**。
 *    真实 Chrome 仍用于**人工登录 + cookie 源**，但**不用于采集**。
 *
 * ⚠️ 本文件只做**纯决策**（「还剩哪几档可试」）；真正的 IO 在 `adapters/site/**`
 */

/** 抓取档位（原 `dk` 的 `via` 取值；`chrome-cdp` 已剔除） */
export const SCAN_CHAIN = ['frames', 'webview'] as const;
export type ScanStrategy = (typeof SCAN_CHAIN)[number];

/** 已废弃的档位（**保留常量仅供兼容读取**，不得作为可选档位） */
export const DEPRECATED_SCAN_STRATEGY = 'chrome-cdp';

/**
 * 还剩哪几档可试（按链序，排除已试过的）
 *
 * @param attempted 已尝试过（含失败）的档位
 * @returns 未尝试的档位，**保持链序**；全试过 → 空数组
 */
export function remainingScanStrategies(attempted: readonly string[]): ScanStrategy[] {
  const tried = new Set(attempted);
  return SCAN_CHAIN.filter((s) => !tried.has(s));
}

/** 下一档（无则 `null`） */
export function nextScanStrategy(attempted: readonly string[]): ScanStrategy | null {
  return remainingScanStrategies(attempted)[0] ?? null;
}

/** 链是否已耗尽 */
export function isScanChainExhausted(attempted: readonly string[]): boolean {
  return remainingScanStrategies(attempted).length === 0;
}

/**
 * 汇总一次降级链的执行结果（供 `ScanResult.via` 与诊断使用）
 *
 * @param attempts 每档的结果（成功则带 `count`）
 */
export function summarizeScanAttempts(
  attempts: ReadonlyArray<{ via: ScanStrategy; ok: boolean; count?: number; error?: string }>,
): {
  /** 成功的档位（无成功则 `null`） */
  via: ScanStrategy | null;
  ok: boolean;
  total: number;
  /** 逐档失败原因（**原样保留**，原则 6） */
  failures: Array<{ via: ScanStrategy; error: string }>;
} {
  const failures = attempts
    .filter((a) => !a.ok)
    .map((a) => ({ via: a.via, error: a.error ?? '' }));

  const hit = attempts.find((a) => a.ok);
  return {
    via: hit?.via ?? null,
    ok: !!hit,
    total: attempts.reduce((n, a) => n + (a.ok ? (a.count ?? 0) : 0), 0),
    failures,
  };
}
