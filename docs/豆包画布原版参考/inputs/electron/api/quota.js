// ============================================================
// API 接入 · 额度信号（引擎 v2，对标改造方案 §3.1 / §1.4）
// ------------------------------------------------------------
// 把中转站五花八门的「扣费失败/没额度」报错文案归一为结构化信号：
//   · quota_not_deducted —— 扣费失败但任务未计费，可直接重试（噜噜口径：
//     「额度未扣除」类，不识别就会白等一个永远跑不完的任务）；
//   · quota_exhausted —— 今日额度用完 / 套餐不足 / 余额不足，重试无意义。
// 命中即终态 kind='quota'，不进重试矩阵（防白等、防重复扣费风险）。
// 额度文案库是「数据不是逻辑」：adapter.quotaHints 可按实测热改补充。
// ============================================================

/** 引擎级默认文案库（各家通用的中/英文口径，适配器可再叠加） */
const DEFAULT_QUOTA_HINTS = [
  {
    re: /生成(?:额度)?未扣除|额度未扣除|未扣除(?:额度|费用)/,
    kind: 'quota_not_deducted',
    advice: '任务未计费，可直接重试'
  },
  {
    re: /没额度|需要开通标准套餐|额度(?:已)?用完|额度不足|今日视频没额度|今日图片没额度/,
    kind: 'quota_exhausted',
    advice: '额度已用完或套餐不足，请充值/开通后重试'
  },
  {
    re: /insufficient[_ ]?quota|quota[_ ]?(?:exceeded|exhausted)|billing(?:_[_ ]?)?hard[_ ]?limit|余额不足|账户欠费/i,
    kind: 'quota_exhausted',
    advice: '账户额度/余额不足，请充值后重试'
  }
];

/**
 * 在文本中匹配额度信号。适配器 hints 优先（可覆盖默认口径），默认库兜底。
 * @param {import('./types').ProviderAdapter} adapter 可为 null（只用默认库）
 * @param {string} text  报错原文（响应体 text / outcome.error.message）
 * @returns {{kind:string, advice:string, matched:string}|null}
 */
function matchQuotaHint(adapter, text) {
  const s = String(text || '');
  if (!s) return null;
  const groups = [];
  if (adapter && Array.isArray(adapter.quotaHints)) groups.push(adapter.quotaHints);
  groups.push(DEFAULT_QUOTA_HINTS);
  for (const hints of groups) {
    for (const h of hints) {
      if (!h || !(h.re instanceof RegExp)) continue;
      const m = s.match(h.re);
      if (m) {
        return { kind: h.kind || 'quota', advice: h.advice || '', matched: m[0] };
      }
    }
  }
  return null;
}

/**
 * 把额度命中结果包装成「统一额度错误消息」：
 * 原文 + 归一建议，渲染层可直接整条展示。
 * @returns {string}
 */
function quotaMessage(hit, rawMessage) {
  const raw = String(rawMessage || '').trim();
  const advice = hit && hit.advice ? `（${hit.advice}）` : '';
  return raw ? `${raw}${advice}` : (hit && hit.advice) || '额度不足';
}

module.exports = { DEFAULT_QUOTA_HINTS, matchQuotaHint, quotaMessage };
