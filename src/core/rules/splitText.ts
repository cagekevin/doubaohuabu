/**
 * 文本拆分（**纯函数**，★ 必测）—— 原 `gk`(24874) / `$y`(24888) / `Na`(24923) / `Ty`(24941)
 *
 * ★ **它是什么**：把一段提示词文本切成多个片段，每段成为**一个文本框**（由 `splitDirect`
 *   建节点、串联）。两条路：
 *   · **按关键词**（`splitByKeywords`）—— 用户给关键词，**每个出现关键词的行**是新片段起点
 *   · **自动**（`splitAuto`）—— 认「(提示词组|分镜|镜头|场景|Prompt)+数字」的行首标记
 *
 * 依据（**逐行回源**）：
 *   | 件 | 源 | 语义 |
 *   |---|---|---|
 *   | `stripHtml` | `gk` 24874-24887 | 富文本正文 → 纯文本（`<br>`/`</p>` → `\n`，实体解码） |
 *   | `parseKeywords` | `Na` 24923-24940 | 按 `[\s,，、;；]+` 拆 + **大小写不敏感去重** |
 *   | `splitAuto` | `$y` 24888-24922 | 行首「关键词+数字」；**< 2 处 ⇒ 拆不动** |
 *   | `splitByKeywords` | `Ty` 24941-25021 | 逐行判「出现关键词」；前置内容单独成一段 |
 *
 * ⚠️ **原则 4**：纯的 —— 不接触 window / Date.now。
 */

/**
 * 拆分失败的三档（原 `splitDirect` 写进 `splitFeedback.reason` 的三个字面量）
 *
 * ⚠️ `no-keyword` / `not-splittable` 的分工：**给了关键词**却一处没命中 ⇒ `no-keyword`；
 *    **没给关键词**（走自动模式）却没认出结构 ⇒ `not-splittable`。
 */
export type SplitFailReason = 'node-missing' | 'no-keyword' | 'not-splittable';

/**
 * 失败原因 → 文案（原 `CL.jsx:411` 那个三目 + `CL.jsx:755` 的按钮文字）
 *
 * ★ 与 `core/rules/fingerprintDiagnosis.ts` 的段标签 / 伪装状态 label **同形态同理由**：
 *   带类型的 label 真源住 `core/rules`（加一档编译器会逼你补）；`constants/` 是 L0、**不能** import `core`。
 *   ⚠️ **2026-10-11 更正（`TD-02-12`）**：原引 `fingerprint.ts` 的 `COLLISION_LEVEL_LABEL` ——
 *   但**那个文件 0 生产消费** ⇒ 改引**活的** `fingerprintDiagnosis.ts`（免得读者去追一个死文件）。
 */
export const SPLIT_FAIL_REASON_LABEL: Record<SplitFailReason, string> = {
  'node-missing': '节点不存在',
  'no-keyword': '未匹配到关键词',
  'not-splittable': '无可识别结构',
};

/** 一个片段（原 `Ty`/`$y` 的产物 `{title, content}`） */
export interface SplitPart {
  /** 片段标题（关键词行 / 自动模式下的「关键词+数字」） */
  title: string;
  /** 片段正文（**含**那行关键词） */
  content: string;
}

/**
 * 默认关键词（原 `_Component42.jsx:1804` 的三目：没输入关键词时用这五个）
 * ⚠️ 顺序即语义（原版字面量顺序）
 */
export const DEFAULT_SPLIT_KEYWORDS = ['提示词组', '分镜', '镜头', '场景', 'Prompt'] as const;

/**
 * 富文本 → 纯文本（原 `gk` 24874-24887，**逐字**）
 *
 * ⚠️ 顺序即语义：先统一换行（`\r\n?` → `\n`），再把块级标签（`<br>` / `</p>`）**换成换行**，
 *    然后才剥其余标签 —— 反过来的话 `<br>` 会先被 `<[^>]+>` 吃掉，**换行就没了**。
 */
export function stripHtml(html: unknown): string {
  if (!html) return '';
  return String(html)
    .replace(/\r\n?/g, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#(\d+);/g, (_m, n: string) => String.fromCharCode(+n))
    .replace(/&#x([0-9a-f]+);/gi, (_m, n: string) => String.fromCharCode(parseInt(n, 16)));
}

/**
 * 解析关键词（原 `Na` 24923-24940）
 *
 * 规则：按 `[\s,，、;；]+` 拆 → `trim` → 滤空 → **按小写去重**（保留首次出现的**原样大小写**）。
 * ⚠️ 非字符串 / 空 ⇒ `[]`。
 */
export function parseKeywords(text: unknown): string[] {
  if (!text || typeof text !== 'string') return [];
  const parts = text
    .split(/[\s,，、;；]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of parts) {
    const lower = s.toLowerCase();
    if (!seen.has(lower)) {
      seen.add(lower);
      out.push(s);
    }
  }
  return out;
}

/** 片段标题的截断（原 `Ty` 24981-24992 的 `u`）：空 ⇒ `（片段）`；> 40 字 ⇒ 截断加省略号 */
function titleOf(line: string): string {
  const t = (line || '').trim();
  if (!t) return '（片段）';
  return t.length > 40 ? `${t.slice(0, 40)}…` : t;
}

/**
 * 按关键词拆分（原 `Ty` 24941-25021）
 *
 * ⚠️ **"出现关键词"的判据**（原 24955-24969，最容易写错的一处）：
 *    行内**含**该关键词，且关键词的**后一个字符**是 `undefined` 或落在
 *    `[\d０-９一二三四五六七八九十百千万:：、，,。.\-—（(【[ \t]` 里
 *    —— 即「关键词后面跟着数字 / 分隔符 / 空白」才算命中，避免 `场景` 误命中 `场景化`。
 * ⚠️ 大小写不敏感（两边都 `toLowerCase`）。
 * ⚠️ 切点**只按行**（`\n`）；**第一个关键词行之前**的内容单独成一段（标题取"第一行非空"，
 *    全空则 `（开头）`）—— 这正是「前置内容不丢失」。
 * ⚠️ 一处没命中 ⇒ `[]`（**调用方据此报 `no-keyword`**）。
 */
export function splitByKeywords(text: unknown, keywords: readonly unknown[]): SplitPart[] {
  const plain = stripHtml(text);
  if (!plain.trim()) return [];
  const kws = (keywords || []).map((k) => String(k).trim()).filter(Boolean);
  if (kws.length === 0) return [];

  const lowers = kws.map((k) => k.toLowerCase());
  /** 关键词后一个字符落在这里 ⇒ 算命中（原 24955 那个字符类，**逐字**） */
  const SEP = /[\d０-９一二三四五六七八九十百千万:：、，,。.\-—（(【[ \t]/;
  const hit = (line: string): boolean => {
    const h = line.toLowerCase();
    for (const m of lowers) {
      let i = 0;
      while ((i = h.indexOf(m, i)) !== -1) {
        const next = h[i + m.length];
        if (next === undefined || SEP.test(next)) return true;
        i += m.length;
      }
    }
    return false;
  };

  const lines = plain.split('\n');
  const starts: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (hit((lines[i] ?? '').trim())) starts.push(i);
  }
  if (starts.length === 0) return [];

  const out: SplitPart[] = [];
  const first = starts[0] as number;
  if (first > 0) {
    const head = lines.slice(0, first).join('\n').trim();
    if (head) {
      const firstLine = (lines.slice(0, first).find((m) => m.trim()) || '').trim();
      out.push({ title: firstLine ? titleOf(firstLine) : '（开头）', content: head });
    }
  }
  for (let p = 0; p < starts.length; p++) {
    const from = starts[p] as number;
    const to = p + 1 < starts.length ? (starts[p + 1] as number) : lines.length;
    const body = lines.slice(from, to).join('\n').trim();
    if (body) out.push({ title: titleOf(lines[from] ?? ''), content: body });
  }
  return out;
}

/**
 * 自动拆分（原 `$y` 24888-24922）—— 用户不给关键词时
 *
 * 规则：只认**行首**（可带 `#` 标题符）的「(提示词组|分镜|镜头|场景|Prompt) + 数字」，
 *    数字可带尾随 `：` / `-`；**匹配到 < 2 处 ⇒ `[]`**（拆不动）。
 * ⚠️ 切点若正好落在**换行符**上，往后挪一格（原 24910-24911：不把那个换行算进片段）。
 */
export function splitAuto(text: unknown): SplitPart[] {
  const plain = stripHtml(text);
  if (!plain) return [];
  const re =
    /(?:^|\n)\s*(?:#{1,6}\s*)?(提示词组|分镜|镜头|场景|Prompt)\s*([0-9０-９一二三四五六七八九十]+)\s*[：:\-]?\s*/gi;
  const marks: { index: number; keyword: string }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(plain)) !== null) {
    marks.push({ index: m.index, keyword: `${m[1]}${m[2]}` });
  }
  if (marks.length < 2) return [];

  const out: SplitPart[] = [];
  for (let i = 0; i < marks.length; i++) {
    const cur = marks[i] as { index: number; keyword: string };
    const next = marks[i + 1];
    const from = cur.index + (plain[cur.index] === '\n' ? 1 : 0);
    const to = next ? next.index : plain.length;
    const body = plain
      .slice(from, to)
      .replace(/^\s*\n?|\s*\n?$/g, '')
      .trim();
    if (body) out.push({ title: cur.keyword, content: body });
  }
  return out;
}
