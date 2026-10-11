/**
 * 指纹诊断（★ 纯函数，必测 —— §6.5 原则 7）
 *
 * 依据（**逐行回源抄录**）：`OP.jsx:59-125` 的 `h(W)`
 *   · 页面探针（59-78）→ 结果形状见 `FingerprintPageProbe`（`core/ports/backendPage.port.ts`）
 *   · **探不到页面 ⇒ 回落账号里存的指纹配置**（83-97，`rt = 'configured'`）
 *   · 出口网络（98-107，`fpNetDiag`）
 *   · 摘要拼接（108-113）
 *
 * 做什么：把「页面**实际生效**的指纹」+「真实出口网络」拼成**一行摘要**（原 `$t` 的 7 段），
 *   供 toast 显示；并给出 toast 级别判据（原 `mt = !!Pe.spoofed`）。
 *
 * ⚠️ **原则 4**：不接触 window / document / Date.now —— 探针与网络结果**由调用方注入**。
 * ⚠️ **文案归属**：7 段标签与 4 个伪装状态是**带类型的真源**（`Record<…, string>`，
 *    加一个状态编译器会逼你补）—— 与 `core/rules/fingerprint.ts` 的 `COLLISION_LEVEL_LABEL`
 *    **同一形态、同一理由**（那边是分级 label，这边是段标签 / 状态 label）。
 *    自由文案（toast 前缀、段分隔）在 `constants/text.ts` 的 `FP_DIAG_TEXT`。
 */

import type { Fingerprint } from '@/stable/model/account';
import type { FingerprintPageProbe } from '@/core/ports/backendPage.port';

/**
 * 出口网络探针结果（原 `window.api.fpNetDiag` 的返回值）
 *
 * ⚠️ 后端返回什么就是什么（判据 D1：适配器不解释，用例也不解释）⇒ 这里**宽读**，
 *    字段全部可选、类型放宽 —— 拿到什么算什么，缺项一律按"未知"处理。
 */
export interface FingerprintNetProbe {
  ok?: boolean;
  proxy?: string;
  engineChrome?: string;
}

/** 诊断数据来源（原 `rt`）：`live` = 页面实探；`configured` = 回落配置 */
export type DiagnosisSource = 'live' | 'configured';

/** 伪装状态（原 `OP.jsx:109` 那一串三目） */
export type SpoofState = 'on' | 'off' | 'configured' | 'none';

/** 摘要段键（顺序即 `$t` 数组的顺序） */
export const DIAG_SEGMENTS = ['mask', 'ua', 'screen', 'lang', 'tz', 'proxy', 'engine'] as const;
export type DiagSegment = (typeof DIAG_SEGMENTS)[number];

/** 段标签（原 `$t` 里每段的前缀字面量）—— 带类型的真源（见文件头） */
export const DIAG_SEGMENT_LABEL: Record<DiagSegment, string> = {
  mask: '伪装',
  ua: 'UA',
  screen: '屏',
  lang: '语言',
  tz: '时区',
  proxy: '出口',
  engine: '引擎',
};

/** 伪装状态文案（原 109 的三目四支）—— 带类型的真源（见文件头） */
export const SPOOF_STATE_LABEL: Record<SpoofState, string> = {
  on: '✓生效',
  off: '✗未生效(preload未加载)',
  configured: '配置未生效(页未打开)',
  none: '页面未加载',
};

/** 缺值占位（原 `|| '?'`） */
export const DIAG_UNKNOWN = '?';
/** 出口未知（原 `'未知'` —— 与 `DIAG_UNKNOWN` **不同**，源版这两处字面量就不同） */
export const DIAG_NET_UNKNOWN = '未知';
/** 无代理 = 直连（原 `ot.proxy || 'DIRECT'`） */
export const DIAG_DIRECT = 'DIRECT';

export interface FingerprintDiagnosis {
  source: DiagnosisSource;
  spoofState: SpoofState;
  /** toast 级别判据（原 `mt = Pe != null && !!Pe.spoofed`）—— `true` ⇒ success，否则 warn */
  spoofed: boolean;
  /** 平台（原 `uadPlatform || platform`）；缺 ⇒ `''` */
  platform: string;
  /** Chrome 主版本（原 `ua.match(/Chrome\/(\d+)/)`）；缺 ⇒ `''` */
  chromeMajor: string;
  /** 屏幕（原 `screen`）；缺 ⇒ `''` */
  screen: string;
  /** **首个**语言（原 `languages.split(',')[0]`）；缺 ⇒ `''` */
  lang: string;
  /** 时区；缺 ⇒ `''` */
  tz: string;
  /** 出口：`null` = 未知；`'DIRECT'` = 直连；否则是代理串 */
  proxy: string | null;
  /** 引擎主版本（原 `engineChrome`）；缺 ⇒ `''` */
  engine: string;
}

/**
 * 从账号里**存的**指纹配置**伪造一份页面探针**（原 `OP.jsx:83-97`）
 *
 * 用途：页面没打开（探不到实况）时，至少能把"**我们打算伪装成什么**"显示出来。
 * ⚠️ `spoofed` **恒为 `false`**（源版逐字）—— 配置不等于生效，这正是那句
 *    「配置未生效(页未打开)」的由来。
 */
export function probeFromFingerprint(fp: Fingerprint): FingerprintPageProbe {
  const s = fp.screen;
  return {
    spoofed: false,
    ua: fp.userAgent || '',
    uadPlatform: fp.userAgentData?.platform || fp.platform || '',
    platform: fp.platform || '',
    // ⚠️ 保留 `Array.isArray` 守卫：指纹来自**持久化/导入数据**，可能是坏形状
    languages: Array.isArray(fp.languages) ? fp.languages.join(',') : fp.language || '',
    screen: s ? `${s.width}x${s.height}@${s.pixelRatio || 1}` : '',
    tz: fp.timezone || '',
    cores: fp.hardwareConcurrency || '',
    gl: fp.webgl ? String(fp.webgl.renderer || fp.webgl.vendor || '') : '',
  };
}

/**
 * 组装诊断（原 108-113 那一段）
 *
 * @param page 页面探针结果（探不到传 `null`；回落配置时传 `probeFromFingerprint(...)`）
 * @param net 出口网络结果（拿不到传 `null`）
 * @param source 数据来源（`live` / `configured`）
 */
export function buildFingerprintDiagnosis(
  page: FingerprintPageProbe | null,
  net: FingerprintNetProbe | null,
  source: DiagnosisSource,
): FingerprintDiagnosis {
  const spoofState: SpoofState = !page
    ? 'none'
    : source === 'configured'
      ? 'configured'
      : page.spoofed
        ? 'on'
        : 'off';
  return {
    source,
    spoofState,
    spoofed: page !== null && !!page.spoofed,
    platform: page?.uadPlatform || page?.platform || '',
    chromeMajor: (page?.ua || '').match(/Chrome\/(\d+)/)?.[1] ?? '',
    screen: page?.screen || '',
    lang: (page?.languages || '').split(',')[0] || '',
    tz: page?.tz || '',
    proxy: net && net.ok ? net.proxy || DIAG_DIRECT : null,
    engine: net?.engineChrome || '',
  };
}

/**
 * 拼成 7 段（原 `$t` 数组）—— 顺序即 `DIAG_SEGMENTS`
 *
 * ⚠️ `UA` 段是**两截**：`平台 Chrome/主版本`（源版就是拼在一起的）
 * ⚠️ `出口` 段的三态：`未知`（`proxy === null`）/ `DIRECT`（无代理）/ 代理串
 */
export function diagnosisSegments(d: FingerprintDiagnosis): string[] {
  return [
    `${DIAG_SEGMENT_LABEL.mask} ${SPOOF_STATE_LABEL[d.spoofState]}`,
    `${DIAG_SEGMENT_LABEL.ua} ${d.platform || DIAG_UNKNOWN} Chrome/${d.chromeMajor || DIAG_UNKNOWN}`,
    `${DIAG_SEGMENT_LABEL.screen} ${d.screen || DIAG_UNKNOWN}`,
    `${DIAG_SEGMENT_LABEL.lang} ${d.lang || DIAG_UNKNOWN}`,
    `${DIAG_SEGMENT_LABEL.tz} ${d.tz || DIAG_UNKNOWN}`,
    `${DIAG_SEGMENT_LABEL.proxy} ${d.proxy ?? DIAG_NET_UNKNOWN}`,
    `${DIAG_SEGMENT_LABEL.engine} ${d.engine || DIAG_UNKNOWN}`,
  ];
}
