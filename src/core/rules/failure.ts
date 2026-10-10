/**
 * 失败分类与决策（★ 纯函数，必测 —— §6.5 原则 7）
 *
 * 依据（**逐条回源抄录**，非推断）：
 *   - `f3` shared.js:41421-41463（不可重试表）
 *   - `p3` shared.js:41464-41496（换号 / 重试表）
 *   - `h3` shared.js:41497-41501（稍后重试表）
 *   - `m3 = [...f3, ...p3, ...h3]`（41502）
 *   - `z0`（41503-41508，兜底）
 *   - `_S`（41509-41525，分类）
 *   - `g3`（41526+，决策）
 *
 * ⚠️ 2026-10-10 修正（由单测抓出）：`p3` 表的 `retryable` 实际是 **`true`**（此前误记为 false），
 *    且 `busy` 的 `switchAccount` 是 **`false`**（此前误记为 true）。
 *    —— 若 `retryable: false`，`g3` 会先命中 `give-up`，**换号分支永远不可达**。
 *
 * 铁律（原则 6）：本模块是**生产者**，返回的 `message` 必须是原始错误原文。
 * 本模块**不接触** window / Date.now / 随机（原则 4）。
 */

import {
  FAIL_KIND_FALLBACK,
  FAIL_LABEL,
  type FailAction,
  type SendFailInfo,
  type SendFailKind,
} from '@/constants/failure';
import { FAILURE_MAX_RETRY } from '@/constants';

/** 一条分类规则（原表字段名就是 `kind` / `re` / `retryable` / `switchAccount` / `label`） */
interface Rule {
  kind: SendFailKind;
  re: RegExp;
  retryable: boolean;
  switchAccount: boolean;
}

/** 表 1 · 不可重试（原 `f3` 41421-41463）—— 命中即**停手**，提示人工介入 */
const F3: readonly Rule[] = [
  {
    kind: 'risk-refuse',
    re: /(肖像|敏感(?:内容|信息)?|违规|不(?:符合|适宜)(?:内容|规范)|审核未通过|内容安全|无法生成该|已被驳回|生成失败.*(?:政策|规范))/,
    retryable: false,
    switchAccount: false,
  },
  {
    kind: 'safety-promise',
    re: /(安全承诺|承诺书|安全确认|实名认证|违规.*(?:封|限制))/,
    retryable: false,
    switchAccount: false,
  },
  {
    kind: 'human-verification',
    re: /(人机验证|安全验证|验证码|滑动验证|请完成验证)/,
    retryable: false,
    switchAccount: false,
  },
  {
    kind: 'confirm-required',
    re: /(需要(?:你)?确认|确认后再生成|是否继续|建议拆[分成]|请先确认|等待你确认)/,
    retryable: false,
    switchAccount: false,
  },
  {
    kind: 'send-stuck',
    re: /(发送卡住|点(?:击)?发送(?:按钮)?(?:无|未)响应|未能点击发送)/,
    retryable: false,
    switchAccount: false,
  },
  {
    kind: 'empty-text',
    re: /(内容为空|提示词为空|文本框内容为空)/,
    retryable: false,
    switchAccount: false,
  },
  {
    kind: 'no-account',
    re: /(暂无已登录|账号池.*无|无可用账号|不存在或已失效)/,
    retryable: false,
    switchAccount: false,
  },
];

/**
 * 表 2 · 换号 / 重试（原 `p3` 41464-41496）
 * ★ `retryable` 全部为 `true` —— 否则 `g3` 会先判 `give-up`，换号分支不可达
 */
const P3: readonly Rule[] = [
  {
    kind: 'quota',
    re: /(次数已用完|额度.{0,6}(?:用完|耗尽|不足)|(?:已经|已)?达(?:到)?(?:了)?上限|剩余\s*0\s*个(?:视频生成)?额度|开通(?:标准)?套餐|订阅会员|会员.{0,4}权限|配额)/,
    retryable: true,
    switchAccount: true,
  },
  {
    kind: 'account-invalid',
    re: /(账号已失效|未登录|登录已过期|登录状态|账号不可用|掉线)/,
    retryable: true,
    switchAccount: true,
  },
  {
    kind: 'busy',
    re: /(正在发送中|请稍候再试|已被占用|忙碌)/,
    retryable: true,
    /** ★ 源码是 `false` —— 忙碌只重试，**不换号** */
    switchAccount: false,
  },
];

/** 表 3 · 稍后重试（原 `h3` 41497-41501） */
const H3: readonly Rule[] = [
  {
    kind: 'rate-limit',
    re: /(限流|请求(?:过于)?频繁|操作(?:过于)?频繁|稍后再试|稍候再试|并发上限|已达并发|rate\s*limit|too\s+many\s+requests|429)/i,
    retryable: true,
    switchAccount: false,
  },
  {
    kind: 'page-timeout',
    re: /(超时|timeout|页面加载|加载失败|页面未就绪)/i,
    retryable: true,
    switchAccount: false,
  },
  {
    kind: 'page-error',
    re: /(页面没起来|会话异常|页面异常|导航失败|webview|guest)/i,
    retryable: true,
    switchAccount: false,
  },
];

/** 合并表（原 `m3 = [...f3, ...p3, ...h3]`）—— **顺序遍历，命中即停** */
export const CLASSIFY_TABLE: readonly Rule[] = [...F3, ...P3, ...H3];

/** 兜底（原 `z0` 41503-41508） */
const Z0: SendFailInfo = {
  kind: FAIL_KIND_FALLBACK,
  retryable: true,
  switchAccount: false,
  label: FAIL_LABEL[FAIL_KIND_FALLBACK],
};

/**
 * 失败分类（原 `_S` 41509-41525）
 * 空文本 → 直接返回兜底（源码：`if (!t.trim()) return z0`）
 */
export function classifyFailure(raw: string | null | undefined): SendFailInfo {
  const t = String(raw ?? '');
  if (!t.trim()) return Z0;
  for (const r of CLASSIFY_TABLE) {
    if (r.re.test(t)) {
      return { kind: r.kind, retryable: r.retryable, switchAccount: r.switchAccount, label: FAIL_LABEL[r.kind] };
    }
  }
  return Z0;
}

/** 决策结果（原 `g3` 的返回） */
export interface FailDecision {
  action: FailAction;
  label: string;
  info: SendFailInfo;
}

/**
 * 处置决策（原 `g3` 41526+）
 *
 * ⚠️ `maxRetry` 默认 **2**（不是 1 —— 1 是发送层的 `SEND_MAX_RETRIES`）
 * ⚠️ 分支顺序即优先级：`give-up` 先于 `retry-switch`
 */
export function decideFailAction(
  note: string,
  attempt: number,
  maxRetry: number = FAILURE_MAX_RETRY,
): FailDecision {
  return decideByReason(classifyFailure(note).kind, attempt, maxRetry);
}

/** 按 `kind` 取规则（未知名 → 兜底规则，与原 `_S` 的 `z0` 一致） */
export function ruleOf(kind: SendFailKind): { retryable: boolean; switchAccount: boolean; label: string } {
  const hit = CLASSIFY_TABLE.find((r) => r.kind === kind);
  if (hit) return { retryable: hit.retryable, switchAccount: hit.switchAccount, label: FAIL_LABEL[kind] };
  return { retryable: true, switchAccount: false, label: FAIL_LABEL[FAIL_KIND_FALLBACK] };
}

/**
 * 决策 —— **按已知的 `reason`**（★ 推荐路径）
 *
 * ⚠️ 为什么需要这个变体（原则 6 的直接推论）：
 *    **生产者（adapter）已经分类好了**，返回 `{reason, message}`。
 *    消费者若再拿 `message` 去 `classifyFailure`，就是**二次分类** ——
 *    而 `message` 是**原文**（可能是一句 label，也可能是站点原文），二次分类会失真。
 *
 * ⚠️ 与源码 `g3` 一致：`attempt` 从 **1** 起，`n >= maxRetry` ⇒ `give-up`
 *    ⇒ `maxRetry = 2` 意味着**最多 2 次尝试**（不是 3 次）。
 */
export function decideByReason(
  reason: SendFailKind,
  attempt: number,
  maxRetry: number = FAILURE_MAX_RETRY,
): FailDecision {
  const rule = ruleOf(reason);
  const info: SendFailInfo = {
    kind: reason,
    label: rule.label,
    retryable: rule.retryable,
    switchAccount: rule.switchAccount,
  };
  const n = Number(attempt) || 1;
  if (!rule.retryable || n >= maxRetry) {
    return { action: 'give-up', label: rule.label, info };
  }
  if (rule.switchAccount) {
    return { action: 'retry-switch', label: rule.label, info };
  }
  return { action: 'retry', label: rule.label, info };
}
