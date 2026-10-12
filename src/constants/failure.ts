/**
 * 失败分类（★ SSOT：kind 联合 + 文案映射的唯一真源）
 *
 * 依据：docs/04-AI协议版.md 附表（原 `_S` 41509 / `f3` / `p3` / `h3` / `m3` / `z0` / `g3`）
 *
 * ⚠️ 为什么 kind 放在 `constants` 而不是 `core/model`：
 *    `constants` 是 L0、`core` 是 L2。文案映射（本文件）必须被 L0 使用，
 *    所以 kind 联合也必须落在 L0，否则 L0 会依赖 L2 → 违反分层。
 */

/** 发送失败分类（14 项，原 `_S`） */
export const SEND_FAIL_KINDS = [
  'risk-refuse',
  'safety-promise',
  'human-verification',
  'confirm-required',
  'send-stuck',
  'empty-text',
  'no-account',
  'quota',
  'account-invalid',
  'busy',
  'rate-limit',
  'page-timeout',
  'page-error',
  /**
   * 入参不合法（**逐字对源** —— `shared.js:27686` 的 `replaceMaterialWithLib` 守卫
   * `return { ok: false, reason: 'bad-input' }`）
   *
   * ★ **2026-10-12 补**（"源头没给全"的又一例）：本仓 `core/rules/materialReplace.ts`
   *   照源写了这个 reason，而**分类表里没有它** ⇒ `tsc` 直接报错（TS2345）。
   * ⚠️ **只补到"刚好够"**：源里约 60 个 `reason:` 字面量，但**绝大多数属本仓未落的路径**
   *   （拆分/分析/参数脚本/租约…）⇒ 全搬进来＝声明一堆**没有生产者**的 kind（那才是"造一堆"）。
   *   实测本仓生产的 reason 只有 9 种，前 8 种都已在表里 ⇒ **只缺这一个**。
   */
  'bad-input',
  'unknown',
] as const;
export type SendFailKind = (typeof SEND_FAIL_KINDS)[number];

/**
 * ⚠️ **两套失败分类域不互通**（2026-10-11 如实登记 —— TD-16-68）
 *
 *   · **发送域** = 本文件上面的 `SendFailKind`（14 项）—— 由 `core/rules/failure.ts` 生产，
 *     经 `Result.reason` 一路传到 `ui` / `state`。
 *   · **后端横幅域** = 下面的 `BackendErrorKind`（6 项）—— 错误横幅（`ErrorBanner`）用它选文案。
 *
 *   两域**只有 `quota` / `unknown` 相交** ⇒ **消费者无法把 `res.reason` 转发进横幅**（类型不符），
 *   只能归 `unknown` —— 这**属原则 6 禁止 #3 认可的情形**：「分类表没有的 → 归 `unknown`
 *   但必须保留原始 message」。**不是** UI 偷懒（TD-10-1 已据此改判为该母体的症状）。
 *
 *   ⚠️ 另一事实：本域 5 个**具体** kind（`copyright` / `generation_failed` / `network` / `auth`）
 *   在本仓**零生产者** —— 全仓 12 处 `pushBackendError` 全为 `unknown`（原版的"后端推送"路径
 *   重写尚未接）。⇒ **两域是否应当合一，是一个待裁定项**（见 TD-16-68）。
 */

/** 后端错误横幅类型（原 1610-1633） */
export const BACKEND_ERROR_KINDS = [
  'copyright',
  'quota',
  'generation_failed',
  'network',
  'auth',
  'unknown',
] as const;
export type BackendErrorKind = (typeof BACKEND_ERROR_KINDS)[number];

/** 兜底 kind（原 `z0`） */
export const FAIL_KIND_FALLBACK: SendFailKind = 'unknown';

/** 处置动作（原 `g3` 的 action） */
export const FAIL_ACTIONS = ['give-up', 'retry-switch', 'retry'] as const;
export type FailAction = (typeof FAIL_ACTIONS)[number];

/** 失败分类结果 */
export interface SendFailInfo {
  kind: SendFailKind;
  retryable: boolean;
  switchAccount: boolean;
  /** 展示层 label（来自本文件，**不覆盖**原始 message） */
  label: string;
}

/** 失败分类 label（14 项，与 SEND_FAIL_KINDS 一一对应） */
export const FAIL_LABEL: Record<SendFailKind, string> = {
  'risk-refuse': '平台拒绝（风控/内容规范）',
  'safety-promise': '出现安全确认，已停止自动重试（防封号）',
  'human-verification': '需要人机验证，请到该账号页面手动处理后重跑',
  'confirm-required': '豆包需人工确认，请到文本框查看回复',
  'send-stuck': '发送卡住，请手动检查该账号页面',
  'empty-text': '文本框内容为空',
  'no-account': '无可用账号',
  quota: '该账号额度不足，自动换号重试',
  'account-invalid': '账号已失效，自动换号重试',
  busy: '发送通道忙碌，稍后自动重试',
  'rate-limit': '接口限流，稍后自动重试',
  'page-timeout': '页面超时，自动重试',
  'page-error': '页面异常，自动重试',
  // ★ 2026-10-12 随 `bad-input` 一并补（`Record<SendFailKind, string>` 要求一一对应）——
  //   源里**没有**这个 label（它只是守卫的 reason）⇒ 本句是展示层自产，与其余项同性质；
  //   ⚠️ 它**不覆盖**原始 message（`materialReplace` 已带原文「更换素材：节点不是素材节点或未选择图片」）。
  'bad-input': '入参不合法：节点或素材不符合要求',
  unknown: '发送失败',
};

/** 后端错误横幅（类型 → 文案） */
export const BACKEND_ERROR_LABEL: Record<BackendErrorKind, string> = {
  copyright: '版权限制',
  quota: '额度不足',
  generation_failed: '生成失败',
  network: '网络异常',
  auth: '认证问题',
  unknown: '后台异常',
};
