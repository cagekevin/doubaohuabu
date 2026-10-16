/**
 * 节点内的**提示词行**（生成类节点的身内：提示词 + 生成）
 *
 * ★ 它是**设计稿新增**的件（`index.html:259-264`）。设计稿原话写明了理由：
 *   真机生成节点的输入在**生成面板**里，**但空态文案写着「文生图 / 文生视频 · 在下方输入提示词」，
 *   而下方根本没有框** ⇒ 补这一行，与文案呼应。（已核：`stageEmptyTitle` 逐字对源，矛盾成立。）
 *
 * ── 边界（与浮层 `GenPanel` 的分工，别往这里加东西）──
 *   · 本件**只做**：芯片渲染 + 光标安全写入 + `blur`/`Enter` 提交 + 一颗「生成」；
 *   · **不做**：`@` 自动补全 · 拖高手柄 · 参数工具条 —— 那三样留在面板里（面板仍是**完整参数**入口）。
 *
 * ── 数据（不新增状态）──
 *   读 / 写都是节点自己的 `data.text`（`@[id|名]` 标记形态），与 `GenPanel` **同一字段**。
 *   芯片换算一律走现成的**纯函数**（`parseRefChips` / `textToGpEditorHtml` / `gpEditorToText` /
 *   `refsToChipMarks`）—— **不重写第二份**。
 *
 * ⚠️ **组件本身不认识 store**：`onCommit` / `onGenerate` / `generateLabel` 全由节点传入
 *    （同一个 `patchNodeData` / **同一个生成动作 `runForNode`** / 同一句文案）。
 *    （同文件另有一个便利 hook `usePromptLookup`，它才读 store —— 那只是"省得两个节点各写一份查表"。）
 * ⚠️ 为什么不能用一个普通 `<input>` 绑 `data.text`：字段里存的是 `@[lib-1|产品主图]` 这种**标记**
 *   ⇒ 普通输入框会把**裸标记**显示给用户（设计稿画的是静态页，用 `<input>` 是它的简化）。
 */
import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { parseRefChips, refsToChipMarks, type ParsedRef } from '@/core/rules/refs';
import { textToGpEditorHtml } from '@/core/rules/richText';
import { gpEditorToText } from '@/ui/lib/editorText';
import { stripHtml } from '@/lib/text';
import { useStore } from '@/state';
import shared from '@/ui/common/shared.module.css';
import styles from './shared.module.css';

/**
 * 芯片查表（**引用编号 `n`** → 显示名 / 缩略图）—— ★ 一处实现，两个节点共用。
 *
 * ⚠️ 入参是**编号**不是 id：先按 `refs` 把编号换成 `ParsedRef`，再拿它的 `id` 去
 *    资源库 / 画布节点里取名字与图（与 `GenPanel` 那段 `lookup` 同形）。
 * ⚠️ 返回的函数**引用稳定**（依赖 `refs` / `library` / `nodes`）—— 它是"写回编辑器"那个
 *    effect 的依赖之一，每次渲染换新函数会让它每次都跑。
 *
 * ★ 组件本身**不认识 store**；这个 hook 只是"省得两个节点各写一份查表"的便利件，
 *   调用方当然也可以自己传 `lookup`。
 */
export function usePromptLookup(refs: readonly ParsedRef[]): (n: number) => { label?: string; dataUrl?: string } {
  const library = useStore((s) => s.library);
  const nodes = useStore((s) => s.nodes);
  return useCallback(
    (n: number) => {
      const r = refs.find((x) => x.n === n);
      const lib = r ? (library.find((l) => l.id === r.id) ?? null) : null;
      const node = r ? (nodes.find((x) => x.id === r.id) ?? null) : null;
      const dataUrl =
        typeof lib?.dataUrl === 'string' && lib.dataUrl
          ? lib.dataUrl
          : node?.type === 'video' && typeof node.data.poster === 'string'
            ? node.data.poster
            : '';
      return { label: lib?.name ?? r?.rawName ?? String(n), dataUrl };
    },
    [refs, library, nodes],
  );
}

export interface PromptLineProps {
  /** 节点的 `data.text`（`@[id|名]` 标记形态） */
  text: unknown;
  /**
   * 引用编号 → 显示名 / 缩略图（与 `GenPanel` 同形的查表）。
   * ⚠️ 传 `useCallback` 稳定的函数：它是写回编辑器的依赖之一。
   */
  lookup: (n: number) => { label?: string; dataUrl?: string };
  /** 提交（**内容真变了才调**）—— 节点侧转成 `patchNodeData(id, { text: refsToChipMarks(next, refs) })` */
  onCommit: (next: string) => void;
  /**
   * 「生成」—— 与面板那颗走**同一个**动作（由节点传入：`useGen().runForNode(id)`）。
   * ★ 返回 Promise：**防重复提交由本件自己管**（`pending`），两个节点不必各写一份。
   */
  onGenerate: () => Promise<unknown>;
  /** 节点自己的"生成中"（如 `data.apiJob` 派生）—— 与 `pending` 取或，用于禁用 */
  busy?: boolean;
  /** 空态提示（`data-placeholder`，样式在 `.promptField`） */
  placeholder?: string;
  /**
   * 「生成」按钮文案 —— ⚠️ **由节点传入 SSOT 常量**（与面板那颗同一个字），
   * 本件**不写死文案**（原则 5：文案归 `constants/text`）。
   */
  generateLabel: string;
}

export function PromptLine({
  text,
  lookup,
  onCommit,
  onGenerate,
  busy = false,
  placeholder,
  generateLabel,
}: PromptLineProps) {
  const ref = useRef<HTMLDivElement>(null);
  /**
   * 提交中（**组件局部 state**，与面板 `run()` 里那个 `busy` 同性质 —— 它只是"这次点击还没回来"，
   * 不是任何真相的来源）⇒ 防重复提交不必两个节点各写一份。
   */
  const [pending, setPending] = useState(false);
  /** 节点文本 → `{ 纯文本, 引用表 }`（与 `GenPanel` 的 `gpSeed` 同一行推导，不是面板私有状态） */
  const seed = parseRefChips(stripHtml(text ?? ''));

  /**
   * 编辑器内容 ⇐ 节点文本
   * ★ **光标安全**（与 `GenPanel` / `TextNode` 同一模式）：① 编辑器没聚焦才写
   *   ② 内容真不同才写 —— 否则打字时光标会被吃。
   */
  useEffect(() => {
    const el = ref.current;
    if (!el || document.activeElement === el) return;
    const next = textToGpEditorHtml(seed.text, lookup);
    if (el.innerHTML !== next) el.innerHTML = next;
  }, [seed.text, seed.refs, lookup]);

  /** 提交：芯片 → `@[id|名]` 标记；**没变就不写**（与 `GenPanel.commitPrompt` 同判据） */
  const commit = (): void => {
    const el = ref.current;
    if (!el) return;
    const next = gpEditorToText(el);
    if (next === seed.text) return;
    onCommit(refsToChipMarks(next, seed.refs));
  };

  /** 「生成」：**先提交提示词、再生成**（否则刚打的字会被丢掉）；`pending` 期间禁止再点 */
  const run = async (): Promise<void> => {
    commit();
    setPending(true);
    try {
      await onGenerate();
    } finally {
      setPending(false);
    }
  };

  /** `Enter` 提交（单行行的直觉）；`Shift+Enter` 不拦（留给需要多行的人） */
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>): void => {
    if (e.key !== 'Enter' || e.shiftKey) return;
    e.preventDefault();
    commit();
  };

  return (
    <div className={styles.promptRow}>
      <div
        ref={ref}
        className={styles.promptField}
        contentEditable
        suppressContentEditableWarning
        // `nodrag nopan nowheel` 是 ReactFlow 的约定类名：没有它，输入会顺带拖动节点 / 平移画布
        data-placeholder={placeholder}
        aria-label={placeholder}
        onBlur={commit}
        onKeyDown={onKeyDown}
        // 输入框自己吃掉指针事件，别让它穿透到节点（否则一点就选中 / 拖走）
        onMouseDown={(e) => e.stopPropagation()}
      />
      <button
        type="button"
        className={`${shared.btn} ${shared.btnSm} ${shared.btnPrimary} nodrag nopan`}
        disabled={busy || pending}
        onClick={() => void run()}
      >
        {generateLabel}
      </button>
    </div>
  );
}
