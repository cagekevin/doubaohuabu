/**
 * 富文本编辑器 DOM → 纯文本（★ 不纯：读 DOM，但**无状态、无副作用**）
 * —— 原 `kL.jsx` 51 行**逐行移植**
 *
 * ★ **它做什么**（反方向在 `core/rules/richText.ts` 的 `textToEditorHtml`）：
 *   ① `.ref-chip` ⇒ 文本 `@[${data-id}|${data-name}]`
 *   ② `.ref-missing` ⇒ 文本 `@[x|${data-name}]`（**id 是字面量 `x`** —— 源版如此）
 *   ③ 删掉 `meta/link/style/script/noscript/iframe/object/embed/form/sc-clipboard/[data-clipboard]/[block-data]/[data-slate-fragment]`
 *   ④ 块级元素（`div/p/h1..h6/blockquote/pre/...`）**展平**成它们的子节点，并**补一个 `<br>`**
 *      （若最后一个子节点不是 `<br>`）⇒ 于是"换行"在纯文本里仍然有痕迹
 *   ⑤ 返回 **`innerHTML`**（不是 `textContent`！）
 *
 * ★★ **为什么返回 HTML 而不是纯文本**：`data.text` 的冻结契约里**允许** `<br>` 与 `@[...]` 标记
 *   （`docs/16` 记的迁移把老富文本洗成了"标记 + `<br>`"的形态）；后续 `stripHtml`（原 `In`）
 *   会在读取时把标签去掉。⇒ **本函数必须与它配套**，否则往返会丢换行。
 *
 * ⚠️ 归 `lib`（L0）而不是 `adapters`：它不读宿主、不经 IPC，只操作**传进来的元素**，
 *   与 `lib/selection.ts` 同类；且它**不 import `stable`**（只处理字符串/DOM）。
 * ⚠️ **不改入参**：源版第一行就是 `e.cloneNode(true)` 在**副本**上干活 —— 照抄（否则用户的
 *   编辑器内容会被这条"读数"路径改掉）。
 */

/** 原 `kL.jsx:12` 的剔除名单（**逐条照抄**，含 `sc-clipboard` 这类 Slate 残留） */
const DROP_SELECTOR = [
  'meta',
  'link',
  'style',
  'script',
  'noscript',
  'iframe',
  'object',
  'embed',
  'form',
  'sc-clipboard',
  '[data-clipboard]',
  '[block-data]',
  '[data-block]',
  'span[data-slate-fragment]',
].join(', ');

/** 原 `kL.jsx:16` 的二次清洗判定 */
const RESIDUE_RE = /<(sc[-:]?clipboard|script|style|meta|link|noscript)\b/i;

/** 原 `kL.jsx:21` 的残留标签移除（循环 10 次防嵌套） */
const RESIDUE_STRIP_RE = /<(?:sc[-:]?clipboard|script|style|meta|link|noscript)[^>]*>/gi;

/** 原 `kL.jsx:26` 与 `39` 的块级元素（**两处清单不同** —— 照抄，别合并） */
const BLOCK_SELECTOR_A =
  'div, p, h1, h2, h3, h4, h5, h6, blockquote, pre';
const BLOCK_SELECTOR_B =
  'div, p, h1, h2, h3, h4, h5, h6, blockquote, pre, article, section, figure, figcaption';

/**
 * 把块级元素**展平**成子节点（并在末尾补 `<br>`）—— 原 `kL.jsx:26-36` / `39-49` 的公共体
 * @returns 是否发生了替换（源版用 `replaceWith` 原地替换，这里同样原地）
 */
function flattenBlocks(root: ParentNode, selector: string): void {
  root.querySelectorAll(selector).forEach((el) => {
    const frag = document.createDocumentFragment();
    while (el.firstChild) frag.appendChild(el.firstChild);
    const last = frag.lastChild;
    // 原版：最后一个子节点**不是 `<br>`** 才补（否则会出现双换行）
    if (!last || last.nodeType !== 1 || (last as Element).tagName !== 'BR') {
      frag.appendChild(document.createElement('br'));
    }
    el.replaceWith(frag);
  });
}

/**
 * 读编辑器内容（原 `kL`）
 *
 * @param el 编辑器的 `contentEditable` 元素（**不会被改动** —— 内部先克隆）
 * @returns `innerHTML`（含 `@[id|名]` 标记与 `<br>`）
 */
export function editorToText(el: HTMLElement | null): string {
  if (!el) return '';
  const clone = el.cloneNode(true) as HTMLElement;

  // ① 药丸 → 标记（原 4-7）
  clone.querySelectorAll('.ref-chip').forEach((chip) => {
    const d = (chip as HTMLElement).dataset;
    const text = document.createTextNode(
      `@[${d.id || 'x'}|${(d.name || '').replace(/"/g, '&quot;')}]`,
    );
    chip.replaceWith(text);
  });

  // ② 素材缺失占位 → `@[x|名]`（原 8-11；**id 是字面量 `x`**）
  clone.querySelectorAll('.ref-missing').forEach((miss) => {
    const d = (miss as HTMLElement).dataset;
    miss.replaceWith(document.createTextNode(`@[x|${(d.name || '').replace(/"/g, '&quot;')}]`));
  });

  // ③ 剔除不该留下的节点（原 12-14）
  clone.querySelectorAll(DROP_SELECTOR).forEach((n) => n.remove());

  let html = clone.innerHTML;
  if (RESIDUE_RE.test(html)) {
    // 原 16-38：还有残留 ⇒ 先剥标签，再展平（**清单是 A**），返回
    let prev = '';
    let guard = 0;
    while (html !== prev && guard < 10) {
      prev = html;
      html = html.replace(RESIDUE_STRIP_RE, '');
      guard += 1;
    }
    const box = document.createElement('div');
    box.innerHTML = html;
    flattenBlocks(box, BLOCK_SELECTOR_A);
    return box.innerHTML;
  }

  // 原 39-49：正常路径（**清单是 B**，比 A 多 4 个）
  flattenBlocks(clone, BLOCK_SELECTOR_B);
  return clone.innerHTML;
}

// ─────────────────────────── `gp` 变体（生成面板的提示词编辑器）───────────────────────────

/**
 * 读 **gp 编辑器**（生成面板的提示词）—— 原 `LS` shared.js:42708-42732
 *
 * ★ 与 `editorToText`（原 `kL`）**不是同一个协议**：
 *   | | `kL`（文本节点） | `LS`（生成面板） |
 *   |---|---|---|
 *   | 走法 | `querySelectorAll` 替换 + 返回 `innerHTML` | **递归遍历 `childNodes`**，返回**纯文本** |
 *   | 药丸 | `@[id\|名]`（带 id 与名字） | **`@图N`**（只有编号） |
 *   | 换行 | 保留 `<br>` 标签 | **`<br>` ⇒ `\n` 字符** |
 *   | 块级 | 展平 + 补 `<br>` | `div/p/li` 递归前**保证一个 `\n`** |
 *
 * 规则（**逐行对齐**）：
 *   ① 文本节点 ⇒ 原样追加 `nodeValue`
 *   ② `<br>` ⇒ 追加 `\n`
 *   ③ `.ref-chip` ⇒ 取 `data-n`，**有限且 > 0** 才追加 `@图${n}`（否则**整段丢弃**）
 *   ④ `div`/`p`/`li` ⇒ 若当前串非空且末尾不是 `\n` **先补一个**，再递归子节点
 *   ⑤ 其它元素 ⇒ 直接递归子节点
 *   ⑥ 收尾：`\u00A0`（不换行空格）⇒ 普通空格；**去掉末尾的连续 `\n`**（**不 trim** 首尾其它空白）
 *
 * ⚠️ 与源一致：**只有 `.ref-chip` 分支**（没有 `.ref-missing`）—— gp 编辑器不产生缺失占位。
 */
export function gpEditorToText(el: HTMLElement | null): string {
  if (!el || !el.childNodes) return '';
  let out = '';

  const walk = (nodes: ArrayLike<ChildNode>): void => {
    Array.prototype.slice.call(nodes).forEach((node: ChildNode) => {
      if (node.nodeType === 3) {
        out += node.nodeValue || '';
        return;
      }
      if (node.nodeType !== 1) return;
      const e = node as HTMLElement;
      const tag = String(e.tagName || '').toUpperCase();
      if (tag === 'BR') {
        out += '\n';
        return;
      }
      const cls = e.classList;
      if (cls && typeof cls.contains === 'function' && cls.contains('ref-chip')) {
        const n = Number(e.dataset?.n);
        if (Number.isFinite(n) && n > 0) out += `@图${n}`;
        return;
      }
      if (tag === 'DIV' || tag === 'P' || tag === 'LI') {
        if (out && !/\n$/.test(out)) out += '\n';
        walk(e.childNodes);
        return;
      }
      walk(e.childNodes);
    });
  };

  walk(el.childNodes);
  return out.replace(/\u00A0/g, ' ').replace(/\n+$/, '');
}
