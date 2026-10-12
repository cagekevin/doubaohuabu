/**
 * `@` 引用协议（★ 纯函数，必测）
 *
 * 依据（**逐条回源抄录**）：
 *   - `U0` shared.js:40794 —— `@[id|显示名]` 源形式（chip 的文本形式）
 *   - `Ks` shared.js:40795 —— `@图N` 编号形式（`N` 最多 3 位）
 *   - `Ja` shared.js:40796-40830 —— **解析 + 分配编号**：`@[id|name]` → `@图N`，并产出 `refs`
 *   - `KL` shared.js:40848-40872 —— `refs` → `参考图N`（按 `n` 映射、去重保序）⇒ **发送报文**
 *   - `eu` shared.js:40873-40934 —— **重编号压实**（删引用后 `@图2 @图5` → `@图1 @图2`）
 *
 * ★ **更正 `docs/过程.md` §10 的判断（回源实测）**：
 *   那里写「`@图N`/`参考图N` 引用替换 —— 疑似 **SSOT 重复（4 处）** ⇒ 收口为一处」—— **读错了**。
 *   实测 `Ja`/`KL`/`eu`/`Qc` 是**四个不同操作**（解析编号 / 映射发送 / 重编号 / 直查映射），
 *   **不是同一段代码**。真正的重复是**两个正则**与**两个协议 token**。
 *   ⇒ 本模块职责 = **独占 `@图N`/`参考图N` 协议**（正则工厂 + token 格式化 + 3 个纯操作）。
 *
 * **协议全景（5 个操作，别混淆）**：
 *   | 操作 | 原声明 | 落点 |
 *   |---|---|---|
 *   | DOM → 文本（chip → `@图N`） | `LS` 42691-42732 | ⚠️ **不进 core**（DOM ⇒ `ui/`，M12） |
 *   | 解析 + 编号 | `Ja` | 本模块 `parseRefChips` |
 *   | 重编号压实 | `eu` | 本模块 `renumberRefs` |
 *   | `refs` → `参考图N`（发送） | `KL` | 本模块 `refsToReferenceLabels` |
 *   | `@[id\|label]` → `参考图N`（直查） | `Qc` | `prompt.ts` `resolveReferences`（复用本模块工厂 + token） |
 *
 * ★ **为什么正则是「工厂」而不是「共享常量」**（独立审查抓出的**必修项**）：
 *   原版在每次 `exec` 前都显式 `U0.lastIndex = 0` / `Ks.lastIndex = 0`（40808 / 40888）——
 *   即**对共享 `/g` 正则的 `lastIndex` 污染免疫**。
 *   而 `String.prototype.matchAll` 会**复制当前 `lastIndex` 作为迭代起点**（不归零）⇒
 *   若导出一个共享的 `/g` 正则、日后有人写 `REF_CHIP_RE.test(s)`，`lastIndex` 被留成非 0，
 *   `parseRefChips` 就会**从中间开始匹配、静默漏掉首条**。
 *   ⇒ 用**工厂**（每次调用新建）从根上消灭共享可变状态 —— 比"注释约定禁止 `test()`"可靠得多。
 *
 * ⚠️ 本模块**不接触** `window`/`document`/`Date`/随机（原则 4）。
 */

/** 新建 `@[id|显示名]` 源形式正则（原 `U0` 40794）—— **每次调用都是新实例**（无 `lastIndex` 共享） */
export const createRefChipRe = (): RegExp => /@\[([^\]|]+)\|([^\]]+)\]/g;

/**
 * 新建 `@[id|显示名]` 的**整段锚定**正则（`^…$`，**非 `/g`**）—— 「**这一整片**是不是一枚合法芯片」用
 *
 * ⚠️ **为什么不复用 `createRefChipRe()`**：带锚 ⇒ **不能** `/g`（`lastIndex` 在同一串上推进会失配），
 *   两处语义不同：一个是「**全文扫描**所有芯片」，一个是「**判定整段**」。
 * 消费者：`richText.splitRefMarkers`（先按跨度切，再逐片判定）。
 */
export const createRefChipExactRe = (): RegExp => /^@\[([^\]|]+)\|([^\]]+)\]$/;

/**
 * 新建**宽松**芯片正则（全文 `/g`）—— id / 显示名**允许为空**（即"**残缺**芯片"也算）
 *
 * ⚠️ 与 `createRefChipRe()` 的差别**是语义、不是风格**：源 `Jh`（`shared.js:24280-24394` 的
 *   `o`）就是宽松形态 `@\[[^\]|]*\|[^\]]*\]` —— 它的用途是「**正文里已经有哪些芯片字面量**
 *   （好避开、别重复插）」；**残缺的也算"这里已经有个引用"** ⇒ 用严格版会漏掉残缺的，
 *   于是**重复插一条**。
 * 消费者：`autoMatch`（避开既有芯片区间）。
 */
export const createRefLooseRe = (): RegExp => /@\[[^\]|]*\|[^\]]*\]/g;

/**
 * 新建**任意 `@[…]` 跨度**正则（全文 `/g`，**不要求有 `|`**，**带捕获取整段**）—— 切分用
 *
 * ⚠️ 三种形态各不相同，**都在源里有出处**（不是"我造了三个"）：
 *   · **严格**（合法芯片 ＋ 两捕获）＝ 本文件 `createRefChipRe()`（原 `U0`）
 *   · **宽松**（芯片，允许残缺，无捕获）＝ 本文件 `createRefLooseRe()`（原 `Jh` 的 `o`）
 *   · **跨度**（只要像 `@[…]` 就算，**连"有 `|` 吗"都不问**）＝ 本函数（原 `bL` 40052
 *     的 `split(/(@\[[^\]]+\])/g)`）—— 用途是**按原始长度切/数，不做解析**。
 * 消费者：`richText.splitRefMarkers`（切分）。
 */
export const createRefSpanRe = (): RegExp => /(@\[[^\]]+\])/g;

/**
 * 同 `createRefSpanRe`，但**从串首锚定且允许空内容**（`^@\[[^\]]*\]`）—— DOM 走位计数用
 *
 * ⚠️ **它连 `$` 锚都没有**（只有 `^`）：源 `d$:24749` 的用法是 `t.slice(m).match(/^@\[[^\]]*\]/)`
 *   —— 在**从下标 m 起切出的尾巴**上取"紧贴的那枚 `@[…]`"，故只需头部锚定。
 * 消费者：`ui/nodes/fuzzyRects`（段落表按**原始 `@[…]` 的长度**累加，见该文件头 ★）。
 */
export const createRefSpanFromStartRe = (): RegExp => /^@\[[^\]]*\]/;

/**
 * 数一遍正文里的芯片**出现次数**（宽松口径 —— 残缺芯片也算一枚）
 *
 * ⚠️ **与 `parseRefChips(...).refs.length` 不是一回事，别互相替代**：
 *   · `parseRefChips().refs.length` ＝ **去重后的引用条数**（按 `id` 编号，同一 id 出现多次算 **1**）；
 *   · 本函数 ＝ **出现次数**（同一 id 出现两次算 **2**）。
 *   两者都有消费方（编号/发送要前者；"本次新增几处"要后者）。
 * 消费者：`ui/panels/GenPanel`（自动匹配的 toast：`匹配后 − 匹配前`）。**此前那里在 ui 侧自造正则。**
 */
export const countRefChips = (text: unknown): number =>
  (String(text ?? '').match(createRefLooseRe()) ?? []).length;

/** 新建 `@图N` 编号形式正则（原 `Ks` 40795）—— 模块私有（无外部消费者，避免多余导出） */
/**
 * `@图N` 的匹配正则（原 `Ks` shared.js:40795 **逐字**：`/@图(\d{1,3})/g`）
 *
 * ⚠️ **每次返回新正则**（源版是个**模块级** `/g` 正则，靠 `lastIndex = 0` 手动复位 —— 那是个
 *   隐患：任何一处忘记复位就会从上次的位置继续匹配）⇒ 这里不共享实例。
 * ⚠️ 2026-10-10 起**对外导出**：它有 2 处消费者（本文件的报文改写 + `richText.ts` 的 gp 编辑器渲染）。
 */
export const createRefMarkRe = (): RegExp => /@图(\d{1,3})/g;

/**
 * `参考图N` 的**唯一**格式化处（原 `Ja`/`KL`/`Qc` 各自硬编码过这个 token）
 * ⚠️ 这是**提示词协议 token**（发给模型的），不是 UI 文案 ⇒ 不放 `constants/text.ts`，放协议模块
 */
export const formatReferenceLabel = (n: number): string => `参考图${n}`;

/** `@图N` 的**唯一**格式化处（原 `Ja`/`eu` 各自拼过） */
export const formatRefMark = (n: number): string => `@图${n}`;

/** 一条引用（原 `Ja` 产出的 `{n, id, rawName}`） */
export interface ParsedRef {
  /** 编号，从 **1** 起 */
  n: number;
  /** 被引用节点的 id */
  id: string;
  /** 原始显示名（未编号时的文本） */
  rawName: string;
}

/**
 * 解析 `@[id|显示名]` 并**按首次出现顺序**分配编号（原 `Ja` 40796）
 *
 * @param transform 可选：对**编号后**的文本做一次变换（原签名第二参 `t`）
 *
 * ⚠️ 同一 `id` 重复出现 → **复用同一个编号**（原实现用 `Map` 缓存）
 */
export function parseRefChips(
  text: unknown,
  transform?: (s: string) => string,
): { text: string; refs: ParsedRef[] } {
  const src = String(text ?? '');
  if (!src) return { text: '', refs: [] };

  const refs: ParsedRef[] = [];
  const byId = new Map<string, number>();
  let out = '';
  let cursor = 0;

  for (const m of src.matchAll(createRefChipRe())) {
    const id = m[1] as string;
    let n = byId.get(id);
    if (!n) {
      n = refs.length + 1;
      byId.set(id, n);
      refs.push({ n, id, rawName: m[2] as string });
    }
    out += `${src.slice(cursor, m.index)}${formatRefMark(n)}`;
    cursor = m.index + m[0].length;
  }
  out += src.slice(cursor);

  return { text: transform ? transform(out) : out, refs };
}

/**
 * `refs` → `参考图N`（原 `KL` 40848）—— **发送报文**用
 *
 * ⚠️ 去重保序：同一编号只进 `sentRefs` 一次（首次出现即记录）
 * ⚠️ 命中不到的 `@图N`（不在 `refs` 里）**原样保留**（源码即如此）
 */
export function refsToReferenceLabels(
  text: unknown,
  refs: readonly ParsedRef[] | null | undefined,
): { body: string; sentRefs: ParsedRef[] } {
  const src = String(text ?? '');
  const list = Array.isArray(refs) ? refs : [];
  const byN = new Map(list.map((r) => [r.n, r]));

  const sentRefs: ParsedRef[] = [];
  const seen = new Set<number>();

  const body = src.replace(createRefMarkRe(), (whole, d: string) => {
    const n = Number(d);
    const hit = byN.get(n);
    if (!hit) return whole;
    if (!seen.has(n)) {
      seen.add(n);
      sentRefs.push(hit);
    }
    return formatReferenceLabel(n);
  });

  return { body, sentRefs };
}

/**
 * `@图N` → 引用素材的**显示名原文**（原 `Z3_1.jsx:792-801` 的内联替换）—— **API 视频提示词**用
 *
 * 源：
 *   ```js
 *   N.current.replace(/@图(\d{1,3})/g, (whole, d) => {
 *     const hit = refs.find(r => r.n === Number(d));
 *     return hit ? String(hit.rawName || '').trim() : whole;
 *   })
 *   ```
 *
 * ⚠️ **图片通道不走这里** —— 它用 `参考图N` 标签（`refsToReferenceLabels`）。源版两条通道的写法
 *    **本就不同**（`Z3_1.jsx:792` vs `_Component45.jsx:855` 的 `KL`）⇒ 照抄，不合并。
 * ⚠️ 命中不到编号 ⇒ **原样保留**（源同）。
 */
export function refsToRawNames(
  text: unknown,
  refs: readonly ParsedRef[] | null | undefined,
): string {
  const byN = new Map((refs ?? []).map((r) => [r.n, r]));
  return String(text ?? '').replace(createRefMarkRe(), (whole: string, d: string) => {
    const hit = byN.get(Number(d));
    return hit ? String(hit.rawName || '').trim() : whole;
  });
}

/**
 * `@图N` → `@[id|rawName]`（原 `Zc` `shared.js:40831-40847`）—— **`parseRefChips` 的逆**
 *
 * ★ **为什么必须有它**：源版生成面板里 **`data.text` 存的就是 `@[id|名]` 形态**
 *   （`Z3_1.jsx:409` 的 `Zc(N.current, C.current)`），编辑器内部才用 `@图N`；
 *   而**写入**前 `Zc` 把它换回来 ⇒ 下游（`state/batchSend` 的 `resolveRefMaterial`、
 *   `core/rules/accountNode`）才认得出引用的是哪个素材。
 *   ⚠️ 只写 `@图N`（不做这步）= 把**只有编号、没有身份**的文本落进 `data.text` ⇒
 *      引用身份**永久丢失**（见 `TD-03-8`）。
 *
 * ⚠️ 命中不到编号的 `@图N` ⇒ **原样保留**（源同）。
 */
export function refsToChipMarks(
  text: unknown,
  refs: readonly ParsedRef[] | null | undefined,
): string {
  const byN = new Map((refs ?? []).map((r) => [r.n, r]));
  return String(text ?? '').replace(createRefMarkRe(), (whole: string, d: string) => {
    const hit = byN.get(Number(d));
    return hit ? `@[${hit.id}|${hit.rawName}]` : whole;
  });
}

/**
 * 重编号压实（原 `eu` 40873）
 *
 * 场景：删掉中间某条引用后，`@图1 @图3` 要压成 `@图1 @图2`（并把 `refs` 一并重排）。
 *
 * ⚠️ 两趟替换（与原版同法）：先把「能映射的」换成 `@@R<n>@@` 占位，再统一换成新编号
 *    —— 否则 `@图1→@图2` 与 `@图2→@图1` 会互相踩。
 *
 * ★ **与原版的两处有意偏离**（都已文档化）：
 *   ① 第二趟**只**替换能映射到新编号的占位符，其余原样保留。
 *      原版无条件 `u.get(Number(h))` ⇒ 若正文恰好含 `@@R99@@` 这类字面量，会产出 `@图undefined`（脏文本）。
 *   ② 未变更时返回 `refs` 的**副本**（`[...list]`），原版返回**同一引用**。
 *      值相等、引用身份不同 ⇒ 防调用方误改入参（本模块统一"不改入参"）。
 */
export function renumberRefs(
  text: unknown,
  refs: readonly ParsedRef[] | null | undefined,
): { text: string; refs: ParsedRef[]; changed: boolean } {
  const src = String(text ?? '');
  const list = Array.isArray(refs) ? refs : [];
  if (!src || !list.length) return { text: src, refs: [...list], changed: false };

  const byN = new Map(list.map((r) => [r.n, r]));

  // ① 正文里**实际出现**的编号，按首次出现顺序
  const order: number[] = [];
  const seen = new Set<number>();
  for (const m of src.matchAll(createRefMarkRe())) {
    const n = Number(m[1]);
    if (byN.has(n) && !seen.has(n)) {
      seen.add(n);
      order.push(n);
    }
  }

  // ② 旧编号 → 新编号，并同步重排 refs
  let changed = false;
  const remap = new Map<number, number>();
  const nextRefs: ParsedRef[] = [];
  order.forEach((oldN, i) => {
    const newN = i + 1;
    const hit = byN.get(oldN);
    // 防御性分支：`order` 已用 `byN.has(n)` 过滤 ⇒ 不可达（保留以防将来改动漏掉过滤）
    if (!hit) return;
    remap.set(oldN, newN);
    if (oldN !== newN) changed = true;
    nextRefs.push({ ...hit, n: newN });
  });

  if (!changed) return { text: src, refs: [...list], changed: false };

  // ③ 两趟替换（占位防撞）
  const staged = src.replace(createRefMarkRe(), (whole, d: string) =>
    remap.has(Number(d)) ? `@@R${Number(d)}@@` : whole,
  );
  const out = staged.replace(/@@R(\d{1,3})@@/g, (whole, d: string) => {
    const newN = remap.get(Number(d));
    return newN === undefined ? whole : formatRefMark(newN);
  });

  return { text: out, refs: nextRefs, changed: true };
}

// ─────────────────────────── 作者侧（`@` 自动补全）───────────────────────────

/**
 * 输入 `@` 的**触发正则**（**逐字**抄 `CL.jsx:521`）
 * ⚠️ 只匹配「**光标左侧紧邻**」的那个 `@`（`$` 锚定）—— 所以正文中间的 `@` 不会误触发。
 * ⚠️ 查询词只认 `\w` 与中文（源版如此）；其它字符（空格/标点）即视为"查询结束"。
 */
const REF_TRIGGER_RE = /@([\w\u4e00-\u9fa5]*)$/;

export interface RefTriggerMatch {
  /** 命中的整段（含 `@`）在文本里的**起始下标** */
  start: number;
  /** `@` 后面的查询词（**可能为空串** —— 刚敲下 `@`） */
  query: string;
}

/**
 * 从「光标左侧的文本」里找一次引用触发（原 `CL.jsx:521`）
 * @param beforeCaret 光标**之前**的全部文本
 */
export function matchRefTrigger(beforeCaret: string): RefTriggerMatch | null {
  const m = REF_TRIGGER_RE.exec(beforeCaret);
  if (!m) return null;
  return { start: beforeCaret.length - m[0].length, query: m[1] ?? '' };
}

/**
 * 拼一条引用标记（原 `kL.jsx:5`）
 *
 * ⚠️ 名字里的 `"` 换成 `&quot;`（源版为 HTML 属性准备；纯文本里同样无害且必须照抄，
 *    否则与老数据里的既有标记**形态不一致**）。
 */
export function toRefMarker(id: string, name: string): string {
  return `@[${id}|${String(name).replace(/"/g, '&quot;')}]`;
}

/** 资源库条目的最小形状（只读这两项） */
export interface RefCandidateItem {
  id: string;
  name: string;
}

/**
 * 按查询词筛候选（作者侧下拉用）
 *
 * ⚠️ **名称包含即命中**（大小写不敏感）；空查询 ⇒ **全给**（刚敲下 `@` 时应当列全库）。
 * ⚠️ 与源版一致：候选**封顶**（源下拉也不会把整库铺开）。
 */
export function filterRefCandidates<T extends RefCandidateItem>(
  library: readonly T[],
  query: string,
  max = 8,
): T[] {
  const q = query.trim().toLowerCase();
  const hit = q ? library.filter((it) => (it.name || '').toLowerCase().includes(q)) : [...library];
  return hit.slice(0, max);
}

// ─────────────────────── 换 id（原 `Gy`，`shared.js:26674-26723`）───────────────────────

/** 可被「换 id」改写的节点 —— 只声明**真正会读的两个字段**（结构最小化） */
export interface RefRewritableNode {
  type?: string;
  data?: Record<string, unknown> | null;
}

/**
 * 把画布上所有**指向 `prevId`** 的引用改指 `nextId`（原 `Gy`，`shared.js:26674-26723`）
 *
 * 源改两处（**只认 `text` 类型节点**）：
 *   · `data.text` 里的 `@[prevId|旧名]` → `@[nextId|新名]`
 *   · `data.materialIds` 数组里的 `prevId` → `nextId`
 *
 * ⚠️ **返回 `null` = 一处都没改**（源 `if (o) return a; else return null`）—— 调用方据此
 *    **跳过写回**（不产生无谓的撤销快照）。
 * ⚠️ 源用 `new RegExp('@\\[' + escaped(prevId) + '\\|[^\\]]*\\]')` 拼动态正则；本仓改用
 *    `createRefChipRe()` 工厂 + **比对捕获到的 id**（等价，且不必再引一个转义助手 —— 判据 C1）。
 * ⚠️ `prevId === nextId` / 任一为空 ⇒ `null`（源第一句）。
 * ⚠️ **不改 `library`**：换库条目是调用方的事（源也是分开做的）。
 */
export function replaceRefId<T extends RefRewritableNode>(
  nodes: readonly T[] | null | undefined,
  opts: { prevId: string; nextId: string; nextName: string },
): T[] | null {
  const { prevId, nextId, nextName } = opts;
  if (!prevId || !nextId || prevId === nextId) return null;

  let changed = false;
  const out = (nodes ?? []).map((node) => {
    if (node.type !== 'text' || !node.data) return node;
    const text = typeof node.data.text === 'string' ? node.data.text : '';
    const hitRef = text.includes(`@[${prevId}|`);
    const ids = Array.isArray(node.data.materialIds) ? (node.data.materialIds as unknown[]) : null;
    const hitId = !!ids && ids.includes(prevId);
    if (!hitRef && !hitId) return node;

    changed = true;
    return {
      ...node,
      data: {
        ...node.data,
        ...(hitRef
          ? {
              text: text.replace(createRefChipRe(), (whole: string, id: string) =>
                id === prevId ? `@[${nextId}|${nextName}]` : whole,
              ),
            }
          : {}),
        ...(hitId ? { materialIds: (ids as unknown[]).map((v) => (v === prevId ? nextId : v)) } : {}),
      },
    };
  });
  return changed ? out : null;
}
