/**
 * 文本工具（无状态 —— `lib` 层，L0）
 *
 * 依据（**逐行回源抄录**）：
 *   - `ia` shared.js:36560-36562 —— 空白归一（`/\s+/g` → 单空格 + trim）
 *   - `In` shared.js:24036-24063 —— HTML 实体解码 + 标签剥离（≤10 轮）+ 空白整理
 *
 * ⚠️ 为什么抽到 `lib/`（判据 C1 三振出局）：
 *   原版 `ia` 被 `FR`/`BR`/`HR`/`WR`/`VR` 等**多处**使用；`In` 被 `AS`(41866) / `v3`(41551) / `bL`(40047) 使用
 *   ⇒ 同一段代码出现 >2 次，**必须抽共享实现**，否则又是一堆松散副本。
 */

/**
 * 空白归一（原 `ia` 36560）
 * ⚠️ **所有**连续空白（含换行/制表）→ 单空格，再 trim
 */
export function normalizeSpace(v: unknown): string {
  return String(v || '').replace(/\s+/g, ' ').trim();
}

/**
 * HTML 实体解码 + 标签剥离（原 `In` 24036）
 *
 * ⚠️ 与原实现**逐条对齐**（含三个易错点）：
 *   ① 无 HTML 标签（`/<[a-z][\s>]/i` 不匹配）⇒ **原样返回**（快路径，**不做**实体解码）
 *   ② 标签剥离**最多 10 轮**（嵌套标签逐层剥，防止一层剥不干净）
 *   ③ 收尾只把 `[ \t]+` → 单空格、`\n{3,}` → `\n\n`，再 trim
 *      —— ⚠️ **不是**全空白归一（那是 `normalizeSpace` 的职责，两者不可互换）
 */
export function stripHtml(v: unknown): string {
  if (!v) return '';
  let t = typeof v === 'string' ? v : String(v);
  if (!/<[a-z][\s>]/i.test(t)) return t;

  t = t
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#(\d+);/g, (_m, d: string) => String.fromCharCode(parseInt(d, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_m, h: string) => String.fromCharCode(parseInt(h, 16)));

  let prev = '';
  let round = 0;
  while (t !== prev && round < 10) {
    prev = t;
    t = t.replace(/<[^>]*>/g, '');
    round += 1;
  }

  return t.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}
