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
 * 内部不变量被破坏时的**显式失败**（原则 6：不静默）。
 * 用在"类型说可能 undefined、但构造上不可能"的收窄点 —— ⛔ 不用 `!`、也不用 `?? 默认值` 蒙过去
 * （后者会把"游标越界"这种真 bug 变成一次静默的错域名）。
 */
function invariant(what: string): never {
  throw new Error(`api/domains: 内部不变量被破坏（${what}）`);
}

/** 域轮换器（`createDomainRota` 的产物；状态在闭包里，按 provider 维度复用同一实例） */
export interface DomainRota {
  /** 取应使用的域名 */
  pick(): string;
  /** 网络层失败：该 url 的域进入冷却，游标移到下一个未冷却域 */
  reportFailure(url: unknown): void;
  /** 成功：该域视为健康（清冷却），游标对齐该域 */
  reportSuccess(url: unknown): void;
  /** 测试/诊断用快照（不外发渲染层） */
  snapshot(): { domains: string[]; idx: number; coldUntil: number[] };
  readonly _list: string[];
}

function createDomainRota(
  domains: readonly string[] | null | undefined,
  opts?: { now?: () => number; cooldownMs?: number },
): DomainRota | null {
  const all = (domains || []).map(String).filter(Boolean);
  if (all.length < 2) return null;

  /**
   * ★ **非空元组**：上面那句 `length < 2` 是**构造保证**，但 TS 不认 —— 用元组类型把它表达出来，
   *   于是后面所有下标访问都是 `string` 而不是 `string | undefined`（⛔ 不用 `!`、也不用 `as`）。
   */
  const head = all[0];
  if (head === undefined) return null; // 与 `length < 2` 同义（只为收窄，不可达）
  const list: [string, ...string[]] = [head, ...all.slice(1)];

  const nowFn = opts?.now ?? (() => Date.now());
  const cooldownMs = opts?.cooldownMs != null ? opts.cooldownMs : DEFAULT_COOLDOWN_MS;

  let idx = 0;
  // ⚠️ 用 `Array.from` 而不是 `new Array(n).fill(0)` —— 后者在 TS 里是 `any[]`（会踩 no-unsafe-*）。
  const coldUntil: number[] = Array.from({ length: list.length }, () => 0);

  /** 找到 url 对应的域下标（前缀匹配）；找不到 → -1 */
  function indexOfUrl(url: unknown): number {
    const u = String(url || '');
    return list.findIndex((d) => u === d || u.startsWith(d));
  }

  /**
   * 取应使用的域名：按优先级取第一个未冷却域（冷却到期自动回归主域）；
   * 全部冷却中 → 返回游标域（死马当活马医，总得试一个）。
   */
  function pick(): string {
    const t = nowFn();
    for (let i = 0; i < list.length; i++) {
      if ((coldUntil[i] ?? 0) <= t) {
        const d = list[i];
        if (d !== undefined) return d;
      }
    }
    // 全冷：游标域（`idx` 由构造保证落在 [0, len) ⇒ 这里只是把类型收窄，不是兜底）
    return list[idx] ?? invariant('游标越界');
  }

  /** 网络层失败：当前 url 的域进入冷却，游标移到下一个未冷却域 */
  function reportFailure(url: unknown): void {
    const i = indexOfUrl(url);
    const k = i >= 0 ? i : idx;
    coldUntil[k] = nowFn() + cooldownMs;
    for (let step = 1; step <= list.length; step++) {
      const j = (k + step) % list.length;
      if ((coldUntil[j] ?? 0) <= nowFn()) {
        idx = j;
        return;
      }
    }
    idx = (k + 1) % list.length; // 全冷：游标照样前进，pick 时会兜底
  }

  /** 成功：该域视为健康（清冷却）；游标对齐到该域 */
  function reportSuccess(url: unknown): void {
    const i = indexOfUrl(url);
    if (i >= 0) {
      coldUntil[i] = 0;
      idx = i;
    }
  }

  /** 测试/诊断用快照（不外发渲染层） */
  function snapshot(): { domains: string[]; idx: number; coldUntil: number[] } {
    return { domains: [...list], idx, coldUntil: [...coldUntil] };
  }

  return { pick, reportFailure, reportSuccess, snapshot, _list: list };
}

export { createDomainRota, DEFAULT_COOLDOWN_MS };
