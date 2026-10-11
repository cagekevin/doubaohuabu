/**
 * 指纹撞车体检（**纯函数**，★ 必测）—— 原 `zk`(34300) / `Jl`(34253) / `UP`(34366)
 *
 * ★★ **它是什么**：把**带指纹的账号两两比对**，逐个**环境维度**看两边取值是否一致，
 *   按"命中几个维度"分级（全命中 ⇒ `critical`；≥ 70% ⇒ `warn`），产出一份体检报告。
 *   这是 `scanHistory` 那条链的**参数来源** —— 没有它，那份历史永远只能读不能写。
 *
 * ★★ **它整体是纯的**（没有时间、没有宿主、没有随机）⇒ 完全可测。
 *   `now` 只在 `formatScanAge` 里用到（相对时间显示），也是注入的。
 *
 * 依据（**逐行回源**）：
 *   | 件 | 源 | 语义 |
 *   |---|---|---|
 *   | 维度表 | `Jl` 34253-34294 | **7 个**：UA / 时区 / 语言 / 分辨率 / WebGL 渲染器 / 并发核数 / 内存 |
 *   | 参检者 | 34301-34302 | **只算带 `fingerprint` 的**；`noFp` = 总数 − 带指纹数 |
 *   | 维度离散度 | 34304-34316 | 每维把**非空**取值收进 `Set` 取 `size` |
 *   | 逐维命中 | 34322-34329 | 两边**都非空且字符串相等**才算命中 |
 *   | 分级 | 34330-34335 | **全命中 ⇒ `critical`**；`命中比例 >= 0.7` ⇒ `warn`；否则**不入列表** |
 *   | 统计 | 34349-34363 | `critical`/`warn` 各自计数；**`totalPairs = n(n-1)/2`**（**与有没有撞车无关**） |
 *   | 相对时间 | `UP` 34366-34385 | 「刚刚」→「N 分钟前」→「N 小时前」→「N 天前」→ 日期 |
 *
 * ⚠️ **三处容易写错、已用测试锁住**：**(a)** `totalPairs` 是**组合数**而非"实际比出的对数"
 *   （0 撞车时它仍然很大）；**(b)** 空串与 `null` **都不算取值**（`!== '' && != null`）——
 *   于是"两边都没填"**不算命中**；**(c)** 分级判据用的是**命中数 / 维度总数**（`h = Jl.length`），
 *   而"全命中"是**先判**的（否则 `1.0` 也会落进 `>= 0.7` 的 `warn`）。
 */

/** 一条维度（原 `Jl` 的元素） */
export interface FingerprintDimension {
  /** 短键（原 `key`；`distinct` 与 `matched` 用的是 `label`，`key` 只作标识） */
  key: string;
  label: string;
  /** 从指纹里取该维度的值（可能为空/未定义） */
  get: (fingerprint: FingerprintShape) => unknown;
}

/** 指纹里本模块会用到的字段（源的 `fingerprint` 是会话探测出来的环境快照） */
export interface FingerprintShape {
  userAgent?: string;
  timezone?: string;
  languages?: string[];
  screen?: { width: number; height: number; pixelRatio: number } | null;
  webgl?: { renderer?: string } | null;
  hardwareConcurrency?: number;
  deviceMemory?: number;
}

/**
 * **7 个环境维度**（原 `Jl` 34253-34294，**逐条照抄**）
 *
 * ⚠️ 两处照抄的细节：**(a)** `语言` 是把数组 `join(', ')` 成**一个字符串**再去比
 *   （所以"顺序不同"会被视为不同）；**(b)** `分辨率` 拼成 `` `${w}×${h}@${pr}x` ``，
 *   而 `screen` 缺失时**返回空串**（空串在比对里等于"没这个维度"）。
 */
export const FINGERPRINT_DIMENSIONS: readonly FingerprintDimension[] = [
  { key: 'ua', label: 'User-Agent', get: (f) => f.userAgent },
  { key: 'tz', label: '时区', get: (f) => f.timezone },
  { key: 'lang', label: '语言', get: (f) => (f.languages ?? []).join(', ') },
  {
    key: 'screen',
    label: '分辨率',
    get: (f) => (f.screen ? `${f.screen.width}×${f.screen.height}@${f.screen.pixelRatio}x` : ''),
  },
  { key: 'webgl', label: 'WebGL 渲染器', get: (f) => f.webgl?.renderer },
  { key: 'hcon', label: '并发核数', get: (f) => f.hardwareConcurrency },
  { key: 'mem', label: '内存', get: (f) => f.deviceMemory },
];

/** 一条撞车对（原 34337-34344） */
export interface FingerprintPair {
  /** 账号**名字**（源版存的就是 name，不是 id） */
  a: string;
  b: string;
  aId: string;
  bId: string;
  /** 命中的**维度 label** 列表 */
  matched: string[];
  level: 'critical' | 'warn';
}

/** 报告（原 34356-34364） */
export interface FingerprintScanResult {
  /** 参检账号数（带指纹的） */
  withFpCount: number;
  /** 没有指纹记录、被跳过的账号数 */
  noFp: number;
  pairs: FingerprintPair[];
  /** 每个维度的**取值种类数**（种类越少 ⇒ 大家越像 ⇒ 越危险） */
  dimDistinct: { label: string; distinct: number }[];
  critical: number;
  warn: number;
  /** **组合数** `n(n-1)/2`（⚠️ 不是"实际比出的对数"，与有没有撞车无关） */
  totalPairs: number;
}

/** 参检账号的最小形状 */
export interface ScannableAccount {
  id: string;
  name: string;
  fingerprint?: FingerprintShape | null;
}

/** 「两维取值算不算相同」—— 原 34325：**都非空**且**字符串相等** */
function isSameValue(x: unknown, y: unknown): boolean {
  if (x == null || x === '' || y == null || y === '') return false;
  return String(x) === String(y);
}

/**
 * 跑一次撞车体检（原 `zk` 34300-34365）
 *
 * ⚠️ 与源一致：**账号顺序即比对顺序**（`for i` × `for j > i`），故 `pairs` 的顺序可复现
 *   （`a` 总是数组里靠前的那个）。
 * ⚠️ 只有**命中至少一维**才进 `pairs`，但 `totalPairs` 照算全部组合 ✓。
 */
export function scanFingerprintCollisions(
  accounts: readonly ScannableAccount[] | null | undefined,
  dimensions: readonly FingerprintDimension[] = FINGERPRINT_DIMENSIONS,
): FingerprintScanResult {
  const all = accounts ?? [];
  const withFp = all.filter((a) => !!a.fingerprint);
  const noFp = all.length - withFp.length;

  // 每维的取值种类数（原 34304-34316）—— ⚠️ 只数**非空**取值
  const dimDistinct = dimensions.map((dim) => {
    const seen = new Set<string>();
    for (const a of withFp) {
      const v = dim.get(a.fingerprint as FingerprintShape);
      if (v != null && v !== '') seen.add(String(v));
    }
    return { label: dim.label, distinct: seen.size };
  });

  const total = dimensions.length;
  const pairs: FingerprintPair[] = [];

  for (let i = 0; i < withFp.length; i++) {
    for (let j = i + 1; j < withFp.length; j++) {
      const fpA = withFp[i]!.fingerprint as FingerprintShape;
      const fpB = withFp[j]!.fingerprint as FingerprintShape;
      const matched: string[] = [];
      for (const dim of dimensions) {
        if (isSameValue(dim.get(fpA), dim.get(fpB))) matched.push(dim.label);
      }
      if (matched.length === 0) continue;

      // 分级（原 34330-34335）—— ⚠️ **全命中先判**，否则 1.0 会落进 warn
      let level: FingerprintPair['level'] | 'ok' = 'ok';
      if (matched.length === total) level = 'critical';
      else if (matched.length / total >= 0.7) level = 'warn';

      if (level !== 'ok') {
        pairs.push({
          a: withFp[i]!.name,
          b: withFp[j]!.name,
          aId: withFp[i]!.id,
          bId: withFp[j]!.id,
          matched,
          level,
        });
      }
    }
  }

  return {
    withFpCount: withFp.length,
    noFp,
    pairs,
    dimDistinct,
    critical: pairs.filter((p) => p.level === 'critical').length,
    warn: pairs.filter((p) => p.level === 'warn').length,
    // 原 34355：**组合数**（`n(n-1)/2`）
    totalPairs: (withFp.length * (withFp.length - 1)) / 2,
  };
}

// ⚠️ 只用到「分钟」这一个毫秒基数：源版是 `floor(diff/60000)` → `floor(minutes/60)`
//   → `floor(hours/24)`（**逐级取整**，不是各自除毫秒再取整 —— 两者在边界上不同）
const MINUTE = 60_000;

/**
 * 相对时间（原 `UP` 34366-34385）
 *
 * 五档（**逐字对齐**）：
 *   `< 1 分钟` ⇒ `刚刚` · `< 60 分钟` ⇒ `N 分钟前` · `< 24 小时` ⇒ `N 小时前`
 *   · `< 30 天` ⇒ `N 天前` · 否则 ⇒ **`YYYY-MM-DD`（本地时区）**
 * ⚠️ 各档都是 `Math.floor`（**向下取整**：59.9 分钟仍是「59 分钟前」）。
 * ⚠️ 用的是 `Date.now() - ts` ⇒ **`ts` 在未来**时得到负数 ⇒ 落进「刚刚」（源版如此，照抄）。
 */
export function formatScanAge(ts: number, now: number): string {
  const diff = now - ts;
  const minutes = Math.floor(diff / MINUTE);
  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} 天前`;
  const d = new Date(ts);
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
