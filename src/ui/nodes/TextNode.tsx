/**
 * 文本节点（`type: 'text'`）—— 对应原 `CL.jsx`（915 行）
 *
 * ★★ **2026-10-10 切片 5b**：正文从 `<textarea>` 换成 **`contentEditable`（药丸渲染）** ——
 *    消除「`@` 引用显示成 `@[lib_1|素材甲]` 标记原文」的观感差异。
 *    ★ **存进 `data.text` 的字节格式不变**（纯文本 + `@[id|名]` 标记 + `<br>`）——
 *      换的只是"显示成药丸"，此前落地的**消费侧**（`rules/refs.ts` · `accountNode.ts` ·
 *      `state/batchSend.ts` 的 `prepare`）**一行都不用改**。
 *
 * 依据（**逐行回源**）：
 *   | 行为 | 源 | 语义 |
 *   |---|---|---|
 *   | 初始/外部改动静默重写 | `CL.jsx:279-286` | ★ **只在编辑器没聚焦时**才写 `innerHTML`，且**只在内容真不同**时写 —— 这就是"打字时光标不被吃掉"的关键 |
 *   | 渲染 | `bL` 40047 快路径 | 见 `core/rules/richText.ts` 的 `textToEditorHtml` |
 *   | 读数 | `kL.jsx` 51 行 | 见 `lib/editorText.ts` 的 `editorToText` |
 *   | 药丸 | `P0` 39988 | `<span class="ref-chip" contenteditable="false" data-id data-name>` |
 *   | 正文提交 | `Q` 501-511 | 读 contentEditable → **变了才写** `{text}` |
 *   | 头部双击改名 | `V` 207-210 | `stopPropagation()` + 进改名态 |
 *   | 改名提交 | `ke` 197-206 | `trim() \|\| '文本框'`，**变了才写** `{label}` |
 *
 * ⚠️ **本工程新增的一处守卫（源版没有）**：**输入法合成期间不提交**（`compositionstart/end`）。
 *    源版靠"只在未聚焦时重写 DOM"回避了光标问题，但中文输入法在合成中途 `onInput` 也触发，
 *    此时读 DOM 会把**半成品拼音**写进 `data.text`（且撤销栈会碎成一堆单字）。
 *    中文是本项目的主要输入 ⇒ 这个守卫是必要的（行为差异只在"合成期间不落盘"，落盘时机不变）。
 *
 * ⚠️ 归 `ui/nodes`（组件层）；纯字符串半在 `core/rules/richText.ts`（**可测**），
 *    DOM 读数半在 `lib/editorText.ts`（不纯但无状态）。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '@/state';
import { TEXT_NODE_LABEL } from '@/stable/model/node';
import { NODE_EDIT_TEXT, REF_TEXT } from '@/constants/text';
import { parseRefChips } from '@/core/rules/refs';
import { resolveRefMaterial, type RefNodeLike } from '@/core/rules/prompt';
import { refChipHtml, textToEditorHtml } from '@/core/rules/richText';
import { editorToText } from '@/lib/editorText';
import { NodeShell } from './NodeShell';
import { RefAutocomplete, matchRefTrigger } from './RefAutocomplete';
import type { RFNodeProps } from './types';
import styles from './shared.module.css';

export function TextNode({ id, data, selected }: RFNodeProps<'text'>) {
  const patchNodeData = useStore((s) => s.patchNodeData);
  const library = useStore((s) => s.library);
  const nodes = useStore((s) => s.nodes);
  const [editingName, setEditingName] = useState(false);
  const nameRef = useRef<HTMLSpanElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const [refTrigger, setRefTrigger] = useState<{ query: string; start: number } | null>(null);
  /** 输入法合成中（**本工程新增守卫**，见文件头） */
  const composingRef = useRef(false);

  /** 药丸解析用的素材表（原 `bL` 的第二参是**节点表**） */
  const materials = useMemo(() => {
    const map: Record<string, { name?: string; dataUrl?: string }> = {};
    for (const n of nodes) {
      const d = n.data as Record<string, unknown>;
      const url = typeof d.dataUrl === 'string' ? d.dataUrl : '';
      if (url) map[n.id] = { name: String(d.label ?? d.name ?? ''), dataUrl: url };
    }
    return map;
  }, [nodes]);

  /**
   * ★★ **光标安全的重写**（原 `CL.jsx:279-286`，**逐字对齐**）
   *
   * 三道闸，缺一不可：
   *   ① 编辑器**没聚焦**才写 —— 打字时**绝不**动 DOM（否则光标跳到开头）
   *   ② 内容**真不同**才写 —— 免得每次渲染都重置一次（会打断选择/滚动）
   *   ③ 只从 `data.text` 单向推导 —— 不把 DOM 当作真源
   */
  useEffect(() => {
    const el = bodyRef.current;
    if (!el || document.activeElement === el) return;
    const next = textToEditorHtml(data.text ?? '', materials);
    if (el.innerHTML !== next) el.innerHTML = next;
  }, [data.text, materials]);

  /** 读 DOM 并**变了才写**（原 `Q` 501-511） */
  const commit = useCallback(() => {
    const next = editorToText(bodyRef.current);
    if (next !== (data.text ?? '')) patchNodeData(id, { text: next });
  }, [data.text, id, patchNodeData]);

  /** 光标左侧的纯文本（用于 `@` 触发检测） */
  const textBeforeCaret = (): string => {
    const el = bodyRef.current;
    const sel = window.getSelection();
    if (!el || !sel || sel.rangeCount === 0) return '';
    const range = sel.getRangeAt(0);
    if (!el.contains(range.startContainer)) return '';
    const pre = range.cloneRange();
    pre.selectNodeContents(el);
    pre.setEnd(range.startContainer, range.startOffset);
    return pre.toString();
  };

  const syncTrigger = (): void => {
    const hit = matchRefTrigger(textBeforeCaret());
    setRefTrigger(hit ? { query: hit.query, start: hit.start } : null);
  };

  /** 采纳候选：把光标前的 `@查询词` **换成药丸**（原 `CL.jsx:592-600` 的 Range 手法） */
  const pickRef = (libId: string, name: string): void => {
    const el = bodyRef.current;
    const sel = window.getSelection();
    setRefTrigger(null);
    if (!el || !sel || sel.rangeCount === 0 || !refTrigger) return;
    const range = sel.getRangeAt(0);
    if (!el.contains(range.startContainer)) return;

    const n = refTrigger.query.length + 1; // `@` 自身也算
    const container = range.startContainer;
    const simple =
      container.nodeType === Node.TEXT_NODE && range.startOffset >= n;

    if (simple) {
      range.setStart(container, range.startOffset - n);
      range.deleteContents();
    } else {
      // ⚠️ **兜底**（源版没有这条）：`@查询词` 跨了文本节点（粘贴等）⇒ 做不到精确回退。
      //    此时**整段重写**：结果文本一定正确，代价是光标落到末尾。
      //    （不静默失败 —— 宁可光标不理想，也不要"点了没反应"。）
      range.selectNodeContents(el);
      range.deleteContents();
    }

    const tpl = document.createElement('div');
    tpl.innerHTML = refChipHtml({
      id: libId,
      name,
      dataUrl: materials[libId]?.dataUrl ?? library.find((l) => l.id === libId)?.dataUrl ?? '',
    });
    const chip = tpl.firstElementChild as HTMLElement | null;
    if (!chip) return;
    range.insertNode(chip);

    // 光标落到药丸**之后**（否则下一次输入会插到药丸前面）
    const after = document.createRange();
    after.setStartAfter(chip);
    after.collapse(true);
    sel.removeAllRanges();
    sel.addRange(after);
    commit();
  };

  /** 提交节点名（原 `ke` 197-206） */
  const commitName = (): void => {
    const next = (nameRef.current?.textContent ?? '').trim() || TEXT_NODE_LABEL;
    if (next !== (data.label ?? '')) patchNodeData(id, { label: next });
    setEditingName(false);
  };

  /** 正文里已经写下的引用（预览行 —— 药丸已经表达了，但它还标出"素材缺失"） */
  const refPreview = useMemo(() => {
    const parsed = parseRefChips(data.text);
    if (parsed.refs.length === 0) return [];
    const nodeMap: Record<string, RefNodeLike> = Object.fromEntries(
      nodes.map((n) => [n.id, { id: n.id, type: n.type, data: n.data as unknown as Record<string, unknown> }]),
    );
    return parsed.refs.map((r) => ({ n: r.n, ...resolveRefMaterial(r.id, library, nodeMap) }));
  }, [data.text, library, nodes]);

  const title = editingName ? (
    <span
      ref={nameRef}
      className={styles.nameEdit}
      contentEditable
      suppressContentEditableWarning
      onBlur={commitName}
      onKeyDown={(e) => {
        // ⚠️ 与源一致：**只有 Enter** 分支（`CL.jsx:732`）。
        //   Escape 处理只允许住 `ui/common/`（`原则8/rule-of-three`）⇒ 不在这里加。
        if (e.key === 'Enter') {
          e.preventDefault();
          commitName();
        }
      }}
    >
      {data.label ?? TEXT_NODE_LABEL}
    </span>
  ) : (
    <span
      onDoubleClick={(e) => {
        e.stopPropagation();
        setEditingName(true);
      }}
    >
      {data.label ?? TEXT_NODE_LABEL}
    </span>
  );

  return (
    <NodeShell title={title} meta={`${data.aspectRatio} · ${data.duration}s`} selected={selected}>
      <div className={styles.editWrap}>
        <div
          ref={bodyRef}
          className={`${styles.textEdit} ${styles.textEditor} nodrag nowheel`}
          // ⚠️ 初始内容由上面的 effect 写（`dangerouslySetInnerHTML` 只在首次挂载时生效，
          //    而源版是"每次 `data.text` 变了都对一下" ⇒ 用 effect 才是同语义）
          contentEditable
          suppressContentEditableWarning
          data-placeholder={NODE_EDIT_TEXT.textPlaceholder}
          onInput={() => {
            // ⚠️ 输入法合成中不提交（见文件头）
            if (composingRef.current) return;
            commit();
            syncTrigger();
          }}
          onCompositionStart={() => {
            composingRef.current = true;
          }}
          onCompositionEnd={() => {
            composingRef.current = false;
            // 合成刚结束 ⇒ 补一次提交 + 触发检测（否则这一段落不进 `data.text`）
            commit();
            syncTrigger();
          }}
          onBlur={() => {
            setRefTrigger(null);
            commit();
          }}
        />
        <RefAutocomplete
          query={refTrigger?.query ?? null}
          library={library}
          onPick={(it) => pickRef(it.id, it.name)}
          onClose={() => setRefTrigger(null)}
        />
      </div>

      {refPreview.length > 0 && (
        <div className={styles.refPreview}>
          {refPreview.map((r) => (
            <span key={r.id} className={r.dataUrl ? styles.refOk : styles.refMissing}>
              {`参考图${r.n}`}
              {REF_TEXT.previewSep}
              {r.dataUrl ? r.label : REF_TEXT.previewMissing}
            </span>
          ))}
        </div>
      )}
    </NodeShell>
  );
}
