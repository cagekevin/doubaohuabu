/**
 * 提示词分析 —— **纯决策半**（★ 必测）
 *
 * 依据（**逐行回源抄录**）：
 *   - `CD` shared.js:38678-38692 —— 从模型回复里**抠出 JSON 块**
 *   - `oS` shared.js:38683-38718 —— 解析成分（`zh_prompt` / `en_prompt` / `json_prompt`）
 *   - `$D` shared.js:38979-38989 —— 构造「读回复」脚本的入参（`head` / `full` / `baseline`）
 *
 * ⚠️ **与源版的一处结构性差异（有意）**：源 `CD` 用 `throw new Error('空文本'/'未找到 JSON 对象')`
 *    表达"抠不出来"，而调用方 `oS` 又用 `try{}catch{}` 把异常吞掉 ⇒ 那两条 message
 *    **永远到不了任何界面**。本实现把 `CD` 改成返回 `string | null`（**不抛**）：
 *    同样信息、少一层异常控制流，且不制造"看着有文案其实没人用"的假象。
 */

import { isRecord } from '@/lib/object';

/**
 * 从模型回复里抠出 JSON 文本（原 `CD` 38678）
 *
 * 两级策略（**顺序即语义**）：
 *   ① ```` ```json … ``` ```` 围栏（大小写不敏感）⇒ 取围栏**内部**并 trim
 *   ② 否则取**第一个 `{` 到最后一个 `}`**（能容忍模型在 JSON 前后啰嗦）
 *
 * @returns `null` = 抠不出来（原版此处 `throw`）
 */
export function extractJsonBlock(text: string): string | null {
  if (!text) return null;

  const fenced = text.match(/```json\s*([\s\S]*?)```/i);
  if (fenced && fenced[1]) return fenced[1].trim();

  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  // 原：`if (n === -1 || r === -1 || r <= n) throw`
  if (start === -1 || end === -1 || end <= start) return null;
  return text.slice(start, end + 1);
}

/** 解析结果（原 `oS` 返回的六字段） */
export interface AnalyzeParseResult {
  ok: boolean;
  zh_prompt: string;
  en_prompt: string;
  json_prompt: unknown;
  parsed: unknown;
  raw: string;
}

/**
 * 解析模型的回复（原 `oS` 38683）
 *
 * ⚠️ 逐字对齐源版的三个兜底（**这几条最容易被"顺手改好"**）：
 *    · 回复为空 / 全空白 ⇒ 直接返回 `ok:false`，且 `zh/en/raw` 都等于**原文**
 *    · `zh_prompt` 不是非空字符串 ⇒ **回落成整段原文**（不是空串）
 *    · `en_prompt` 不是非空字符串 ⇒ **回落成 `zh_prompt`**（不是原文）
 *    · 解析失败 ⇒ 返回**同一形状**的 `ok:false`（`zh_prompt`/`en_prompt`/`raw` 都是原文）
 */
export function parseAnalyzeResult(reply: unknown): AnalyzeParseResult {
  const raw = typeof reply === 'string' ? reply : '';
  const failed: AnalyzeParseResult = {
    ok: false,
    zh_prompt: raw,
    en_prompt: raw,
    json_prompt: null,
    parsed: null,
    raw,
  };
  if (!raw.trim()) return failed;

  const block = extractJsonBlock(raw);
  if (block === null) return failed;

  let parsed: unknown;
  try {
    parsed = JSON.parse(block);
  } catch {
    return failed;
  }
  // ⚠️ 模型返回的 JSON ⇒ **不可信输入**：先过 `isRecord`（与原来的「非空 + 对象 + 非数组」三连判**等价**）
  if (!isRecord(parsed)) return failed;

  const p = parsed;
  const zh = typeof p.zh_prompt === 'string' && p.zh_prompt.trim() ? p.zh_prompt.trim() : raw;
  const en = typeof p.en_prompt === 'string' && p.en_prompt.trim() ? p.en_prompt.trim() : zh;

  return {
    ok: true,
    zh_prompt: zh,
    en_prompt: en,
    // 原：`s.json_prompt || null`（假值一律 `null`）
    json_prompt: p.json_prompt || null,
    parsed,
    raw,
  };
}

/** 「读回复」脚本的入参（原 `$D` 38979 的返回值） */
export interface ReplyReadOptions {
  /** 归一化全文的前 40 字（脚本用它快速定位"这是不是我发的那条"） */
  head: string;
  /** 归一化全文 */
  full: string;
  /** 发送前的消息基线（最多 20 条）—— 脚本据此**排除旧回复** */
  baseline: string[];
}

/**
 * 把 `json_prompt` 渲染成**多行展示文本**（原 `ZL.jsx:380-383`）
 *
 * 规则（逐字对齐源）：
 *   · 不是对象（或缺失）⇒ `null`（调用方回落「(无结构化 JSON)」）
 *   · 否则逐行 `${键}: ${值}`，**数组用全角分号 `；` 连接**
 *
 * ⚠️ **为什么放 `core/rules` 而不是组件里**：它是**纯函数**，而判据 E1 规定
 *    `ui/` 下不得有测试文件 ⇒ 留在组件里就**永远没有单测**（假守卫）。
 */
export function formatJsonPrompt(jsonPrompt: unknown): string | null {
  if (!isRecord(jsonPrompt)) return null;
  return Object.entries(jsonPrompt)
    .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join('；') : String(v)}`)
    .join('\n');
}

/**
 * 构造「读回复」脚本的入参（原 `$D` 38979-38989）
 *
 * ⚠️ 归一化与源逐字一致：`String(s || '').replace(/\s+/g, ' ').trim()` ——
 *    **空白折叠成单空格再 trim**（脚本侧用"完全相等"匹配，见源注释）。
 */
export function buildReplyReadOptions(instruction: unknown, baseline: unknown): ReplyReadOptions {
  const norm = (v: unknown): string => String(v ?? '').replace(/\s+/g, ' ').trim();
  const full = norm(instruction);
  return {
    head: full.slice(0, 40),
    full,
    baseline: Array.isArray(baseline) ? (baseline.slice(0, 20) as string[]) : [],
  };
}
