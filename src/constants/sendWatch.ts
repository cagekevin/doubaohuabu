/**
 * 「发送后监测」的**检测规则表 + 模式表**（★ SSOT —— 页面脚本与 app 侧**共用同一份**）
 *
 * 依据（**逐字回源**）：`shared.js:25022-25060`
 *   | 件 | 源 | 语义 |
 *   |---|---|---|
 *   | `WAIT_MIN_PATTERNS` | `h$` 25022 | 等待时长「分钟」档（7 条正则） |
 *   | `WAIT_SEC_PATTERNS` | `m$` 25023 | 等待时长「秒」档（2 条正则） |
 *   | `WAIT_MAX_SECONDS` | `g$` 25024 = `21600` | 超过上限视为**误匹配** |
 *   | `REPLY_NOTICE_RULES` | `Qh` 25025-25051 | 回复通知 5 条规则（`code`/`level`/`title`/`action`/`patterns`） |
 *   | `QUOTA_CONSUME_WARN` / `QUOTA_REMAIN_WARN` | `yk`=20 / `vk`=10 | 额度预警阈值 |
 *   | `QUOTA_KEYWORDS` / `QUOTA_LOW_PATTERNS` / `QUOTA_CONSUME_PATTERNS` / `QUOTA_REMAIN_PATTERNS` | `y$`/`v$`/`w$`/`x$` 25057-25060 | 额度话术与数值 |
 *
 * ★★ **为什么住 `constants/`**（而不是 `adapters/site/**`）：这张表有**两个消费者** ——
 *   ① **页面脚本**（`adapters/site/doubao/scripts.ts` 用 `JSON.stringify` 注入，页面据此计数）；
 *   ② **app 侧**（`core/rules/sendWatch.ts` 据 `code` 查 `level`/`title` 决定节点上显示什么）。
 *   `core` **不得** import `adapters`（铁律①）⇒ 真源必须住**两边都能引**的层。
 *   ⚠️ 本仓先例：`constants/failure.ts`（失败分类表：kind + label + patterns）同法。
 *
 * ⚠️ **正则写成字符串**（不是 `RegExp` 字面量）：页面脚本要用 `JSON.stringify` 注入，
 *    字符串形态才是它需要的；`core` 侧要用时自己 `new RegExp(src)`（源也是这么做的）。
 * ⚠️ 模式串里的 `\\s` / `\\d` 是**正则源码**（转义一层）—— 与源逐字一致，**别改成 `\s`**。
 */

// ─────────────────────────── 等待时长（原 `h$` / `m$` / `g$`）───────────────────────────

/** 等待时长「分钟」档（原 `h$`，`shared.js:25022`） */
export const WAIT_MIN_PATTERNS: readonly string[] = [
  '预计等待时长\\s*(?:为|是|约|大约)?\\s*(\\d+(?:\\.\\d+)?)\\s*(?:分钟|分|min|minutes?)',
  '预计等待时间\\s*(?:为|是|约|大约)?\\s*(\\d+(?:\\.\\d+)?)\\s*(?:分钟|分|min|minutes?)',
  '预计等待\\s*(?:时长|时间)?\\s*(?:为|是|约|大约)?\\s*(\\d+(?:\\.\\d+)?)\\s*(?:分钟|分|min|minutes?)',
  '预计需要\\s*(?:约|大约)?\\s*(\\d+(?:\\.\\d+)?)\\s*(?:分钟|分|min|minutes?)',
  '预计\\s*(?:约|大约)?\\s*(\\d+(?:\\.\\d+)?)\\s*(?:分钟|分|min|minutes?)',
  '(?:大约|约)\\s*(?:需要)?\\s*(\\d+(?:\\.\\d+)?)\\s*(?:分钟|分|min|minutes?)',
  '等待\\s*(?:约|大约)?\\s*(\\d+(?:\\.\\d+)?)\\s*(?:分钟|分|min|minutes?)',
];

/** 等待时长「秒」档（原 `m$`，`shared.js:25023`） */
export const WAIT_SEC_PATTERNS: readonly string[] = [
  '预计等待时长\\s*(?:为|是|约|大约)?\\s*(\\d+(?:\\.\\d+)?)\\s*(?:秒|s|seconds?)',
  '预计等待(?:时长|时间)?\\s*(?:为|是|约|大约)?\\s*(\\d+(?:\\.\\d+)?)\\s*(?:秒|s|seconds?)',
];

/** 等待时长上限（秒）—— 超过 ⇒ 视为误匹配（原 `g$` = 21600，`shared.js:25024`） */
export const WAIT_MAX_SECONDS = 21600;

// ─────────────────────────── 回复通知规则（原 `Qh`）───────────────────────────

/** 语气档（原 `Qh` 的 `level`；`ye` 直接透传给 `setNodeNotice`） */
export type ReplyNoticeLevel = 'info' | 'warn' | 'error';

/** 一条回复通知规则（原 `Qh` 的一项） */
export interface ReplyNoticeRule {
  code: string;
  level: ReplyNoticeLevel;
  title: string;
  /** 源里是站点侧的处置建议（`switch-account`）——本仓只透传，不据它做动作 */
  action: string;
  patterns: readonly string[];
}

/** 回复通知规则表（原 `Qh`，`shared.js:25025-25051` —— 5 条，逐字） */
export const REPLY_NOTICE_RULES: readonly ReplyNoticeRule[] = [
  {
    code: 'quota-exhausted',
    level: 'warn',
    title: '今日免费次数用尽',
    action: 'switch-account',
    patterns: [
      '今日视频生成免费次数(?:已经|已|都|也)?用完了',
      '今日视频生成免费次数(?:已经|已|都|也)?用完',
      '今日视频生成免费次数(?:已经|已|都|也)?用尽',
      '视频生成免费次数(?:已经|已|都|也)?用完',
      '今日(?:的)?免费次数(?:已经|已|都|也)?用完',
      '生成次数[^。]{0,4}上限',
      '明天再来免费生成',
      '剩余\\s*0\\s*个视频生成额度',
    ],
  },
  {
    code: 'infringe',
    level: 'error',
    title: '疑似包含侵权',
    action: '',
    patterns: [
      '生成内容中疑似包含侵权',
      '生成内容(?:可能|疑似)?(?:涉嫌|包含|涉及)侵权',
      '(?:内容|结果)(?:中)?疑似(?:包含|涉及)侵权',
    ],
  },
  {
    code: 'cannot-return',
    level: 'error',
    title: '无法返回该内容',
    action: '',
    patterns: ['无法返回该内容', '无法(?:为|帮)你返回该内容', '(?:暂时)?无法返回(?:该|此)内容'],
  },
  {
    code: 'change-topic',
    level: 'warn',
    title: '建议换个主题',
    action: '',
    patterns: ['换个主题再试试', '换个主题(?:再)?试(?:试|一下)', '(?:建议|请)换个主题'],
  },
  {
    code: 'quota-not-deducted',
    level: 'info',
    title: '生成额度未扣除',
    action: '',
    patterns: ['生成额度未扣除', '额度未扣除', '(?:本次)?(?:生成)?额度(?:未|没有)扣除'],
  },
];

/** 「今日免费次数用尽」的文案兜底（原 `ye` 2575/2577 的 `|| '今日视频生成免费次数用完了'`） */
export const QUOTA_EXHAUSTED_FALLBACK_TEXT = '今日视频生成免费次数用完了';

// ─────────────────────────── 额度用量（原 `y$` / `v$` / `w$` / `x$` / `yk` / `vk`）───────────────────────────

/** 明确话术关键词（原 `y$`，`shared.js:25057`）—— 最强信号，且不依赖数值 */
export const QUOTA_KEYWORDS: readonly string[] = [
  '消耗了较多额度',
  '消耗较多额度',
  '额度消耗较多',
  '额度不足',
  '余额不足',
  '额度不够',
  '积分不足',
  '点数不足',
  '额度快用完了',
  '额度即将用尽',
  '额度已见底',
  '积分快用完了',
  '较多额度',
  '额度用完了',
  '额度已用完',
  '额度用完',
  '额度用尽',
  '额度已用尽',
  '额度耗尽',
];

/** 额度偏低的**正则变体**（原 `v$`，`shared.js:25058`）—— 覆盖语序/措辞变化 */
export const QUOTA_LOW_PATTERNS: readonly string[] = [
  '(?:消耗|使用|花费|扣除)\\s*(?:了)?\\s*较多\\s*(?:的)?\\s*(?:额度|积分)',
  '(?:额度|积分)\\s*(?:已经|已)?\\s*(?:用完|用尽|耗尽|见底|不足|所剩不多|吃紧)',
  '(?:近|最近|这)\\s*\\d+\\s*(?:天|日|个月)\\s*(?:内)?\\s*(?:的)?\\s*(?:额度|积分)\\s*(?:已经|已)?\\s*(?:用完|用尽|耗尽)',
];

/** 本次消耗的数值（原 `w$`，`shared.js:25059`）—— 取**最大值** */
export const QUOTA_CONSUME_PATTERNS: readonly string[] = [
  '本次(?:生成|创作|消耗)?\\s*(?:消耗|使用|花费|扣(?:除|掉)?)?\\s*(\\d+)\\s*(?:额度|积分|点|个?额度|次)',
  '本次(?:共)?\\s*(?:消耗|花费|扣除)\\s*(\\d+)',
  '(?:消耗|花费|扣除)\\s*(?:了)?\\s*(\\d+)\\s*(?:额度|积分|点)',
];

/** 剩余额度的数值（原 `x$`，`shared.js:25060`）—— 取**最小值** */
export const QUOTA_REMAIN_PATTERNS: readonly string[] = [
  '剩余\\s*(?:可用)?\\s*(?:额度|积分|点)\\s*(\\d+)',
  '(?:额度|积分|点)\\s*剩余\\s*(\\d+)',
  '还(?:剩|有)\\s*(\\d+)\\s*(?:额度|积分|点)',
];

/** 「本次消耗 ≥ 此值」⇒ 额度预警（原 `yk` = 20，`shared.js:25055`） */
export const QUOTA_CONSUME_WARN = 20;
/** 「剩余 ≤ 此值」⇒ 额度预警（原 `vk` = 10，`shared.js:25056`） */
export const QUOTA_REMAIN_WARN = 10;

/** 额度不足的兜底文案（原 `Ne` 2621 的初值 `fe`） */
export const QUOTA_LOW_FALLBACK_TEXT = '本次创作额度消耗较多，额度不足。';
/** 额度不足的通知标题（原 `Ne` 2632） */
export const QUOTA_LOW_TITLE = '额度不足';
/** 额度不足通知的 `code`（原 `Ne` 2631） */
export const QUOTA_LOW_CODE = 'quota-low';

// ─────────────────────────── 监测节奏（原 `watchSendReply` 的内联值）───────────────────────────

/** 后台监测窗口（原 `_Component43.jsx:2640` 的 `180000`） */
export const SEND_WATCH_WINDOW_MS = 180000;
/** 轮询间隔（原 `:2641-2643` 的 `setTimeout(…, 2000)`） */
export const SEND_WATCH_POLL_MS = 2000;
/** 每 N 轮打一条「监测中…」日志（原 `:2664` 的 `at % 15 === 0`） */
export const SEND_WATCH_LOG_EVERY = 15;

// ─────────────────────────── 自动换号（原 `be` 2420-2559）───────────────────────────

/**
 * 换号的**动作名**（原 `be` 的第二参 `W`，只进日志）
 *
 * ⚠️ 与「原因」分开：原因是随读数变化的一句话（`quotaLowText` / 通知原文），动作名是固定标签。
 * ⚠️ **只有两处会换号**（逐字对源）：额度预警（`:2636`）与「今日免费次数用尽」（`:2577`）。
 */
export const SWITCH_ACTION = {
  quotaExhausted: '额度用尽',
  quotaLow: '额度不足',
} as const;

/** 自动换号的次数上限（原 `:2310` 的 `typeof ve.maxSwitches == 'number' ? ve.maxSwitches : 3`） */
export const SWITCH_MAX_TIMES = 3;
