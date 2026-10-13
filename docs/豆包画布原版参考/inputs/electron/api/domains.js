// ============================================================
// API 接入 · 多域名健康轮换（引擎 v2，对标改造方案 §3.1 / §1.4）
// ------------------------------------------------------------
// adapter.domains 声明多域名（按序 = 优先级）。引擎侧行为：
//   · 默认用当前域；提交遇网络层失败（status 0 / 超时）→ 当前域冷却
//     5 分钟并切下一域（withRetry 的下一次提交自动换域）；
//   · 全部域都冷却中 → 仍然返回当前序（死马当活马医，总得试一个），
//     冷却到期自动恢复；
//   · 提交/轮询成功 → 该域健康记录清零。
// 轮换状态按 provider 维度共享（一个任务探明主域挂了，后续任务直接走备域）。
// ============================================================

const DEFAULT_COOLDOWN_MS = 5 * 60 * 1000;

/**
 * @param {string[]} domains  域名列表（≥2 才有意义；调用方负责判空）
 * @param {{now?:()=>number, cooldownMs?:number}} [opts]
 */
function createDomainRota(domains, opts) {
  const list = (domains || []).map(String).filter(Boolean);
  if (list.length < 2) return null;
  const nowFn = (opts && opts.now) || (() => Date.now());
  const cooldownMs = (opts && opts.cooldownMs) != null ? opts.cooldownMs : DEFAULT_COOLDOWN_MS;

  let idx = 0;
  const coldUntil = new Array(list.length).fill(0);

  /** 找到 url 对应的域下标（前缀匹配）；找不到 → -1 */
  function indexOfUrl(url) {
    const u = String(url || '');
    return list.findIndex((d) => u === d || u.startsWith(d));
  }

  /**
   * 取应使用的域名：按优先级取第一个未冷却域（冷却到期自动回归主域）；
   * 全部冷却中 → 返回游标域（死马当活马医，总得试一个）。
   * @returns {string}
   */
  function pick() {
    const t = nowFn();
    for (let i = 0; i < list.length; i++) {
      if (coldUntil[i] <= t) return list[i];
    }
    return list[idx];
  }

  /** 网络层失败：当前 url 的域进入冷却，游标移到下一个未冷却域 */
  function reportFailure(url) {
    const i = indexOfUrl(url);
    const k = i >= 0 ? i : idx;
    coldUntil[k] = nowFn() + cooldownMs;
    for (let step = 1; step <= list.length; step++) {
      const j = (k + step) % list.length;
      if (coldUntil[j] <= nowFn()) { idx = j; return; }
    }
    idx = (k + 1) % list.length; // 全冷：游标照样前进，pick 时会兜底
  }

  /** 成功：该域视为健康（清冷却）；游标对齐到该域 */
  function reportSuccess(url) {
    const i = indexOfUrl(url);
    if (i >= 0) {
      coldUntil[i] = 0;
      idx = i;
    }
  }

  /** 测试/诊断用快照（不外发渲染层） */
  function snapshot() {
    return { domains: [...list], idx, coldUntil: [...coldUntil] };
  }

  return { pick, reportFailure, reportSuccess, snapshot, _list: list };
}

module.exports = { createDomainRota, DEFAULT_COOLDOWN_MS };
