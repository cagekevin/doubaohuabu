/**
 * 生成面板（原 `_Component45.jsx` 的 `.gp-*` 工具条 —— **文生图 / 文生视频共用**）
 *
 * 依据：docs/03-人类版.md §5 §8
 *
 * ⚠️ 原则 1：本组件**不写 store**，落值走 `patchNodeData` / `useGen()`
 * ⚠️ 原则 8：这是**首个**生成面板；第二个（视频面板）出现时**必须**抽成复合组件
 *    （`<GenPanel>` + `<ModelPicker>` / `<RatioPicker>` —— 见 §9.4 组合模式）
 *
 * ★★ **2026-10-10 三次补齐**（此前都是断链）：
 *   ① **提示词输入** —— 面板原先没有它 ⇒ 生成节点永远发**空提示词**；
 *   ② **执行账号** —— `sendAccount` 原先无处可改 ⇒ 永远是 `auto`（`jS` 的四个分支用不上）；
 *   ③ **`@` 药丸编辑器** —— 提示词原先用 `<textarea>` ⇒ 引用显示成 `@图1` 标记原文。
 *
 * ⚠️ **提示词与文本框是两套 chip 协议**（源版即如此，`richText.ts` 的 `GP_REF_CHIP_CLASS` 有对照表）：
 *    文本框存 `@[id|名]`（带 id 与名字）、**提示词存 `@图N`（只有编号）**。
 *    ⇒ 触发检测与候选浮层复用，渲染/读数各自一套（判据 C1 复用的是**纯层**）。
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useGen, useStore } from '@/state';
import { GEN_PANEL_TEXT, NODE_EDIT_TEXT, REF_TEXT, PROJECT_TEXT } from '@/constants/text';
import { AccountPicker } from '@/ui/common/AccountPicker';
import { RefAutocomplete, matchRefTrigger } from '@/ui/nodes/RefAutocomplete';
// ⚠️ `Esc` 处理**必须**走 `ui/common`（`原则8/rule-of-three`）
import { useEscapeKey } from '@/ui/common/useEscapeKey';
// ⚠️ `DEFAULT_IMAGE_RESOLUTION` 来自 SSOT，不在 JSX 里内联 `'2K'` —— TD-08-2
import { ASPECT_RATIOS, DEFAULT_IMAGE_RESOLUTION, IMAGE_RESOLUTIONS, VIDEO_MODELS } from '@/constants/models';
import { parseRefChips } from '@/core/rules/refs';
import { gpRefChipHtml, textToGpEditorHtml } from '@/core/rules/richText';
import { gpEditorToText } from '@/lib/editorText';
import styles from './GenPanel.module.css';

export function GenPanel() {
  // ── ① 全部 hooks（`react-hooks/rules-of-hooks`：**必须**在任何提前 return 之前）──
  const nodes = useStore((s) => s.nodes);
  const library = useStore((s) => s.library);
  const accounts = useStore((s) => s.accounts);
  const groups = useStore((s) => s.groups);
  const apiSetup = useStore((s) => s.apiSetup);
  const patchNodeData = useStore((s) => s.patchNodeData);
  const gen = useGen();
  const [busy, setBusy] = useState(false);
  /**
   * ★ `@` 引用（作者侧）—— 与 `TextNode` **同一套**触发检测与候选浮层。
   * ⚠️ 判据 C1（三振出局）：这是**第 2 处**消费 ⇒ 复用即可；**第 3 处出现时必须抽 hook**。
   * ⚠️ 但两处的**协议不同**（见文件头）⇒ 渲染/读数各自一套。
   */
  const [refTrigger, setRefTrigger] = useState<{ query: string; start: number } | null>(null);
  const promptRef = useRef<HTMLDivElement>(null);
  /** 输入法合成中（与 `TextNode` 同法：中文输入法在合成中途也会触发 `onInput`） */
  const composingRef = useRef(false);
  const onEscape = useEscapeKey(refTrigger !== null, () => setRefTrigger(null));

  // ── ② 派生值（**不提前 return**，全部可空安全 —— 否则上面的 hooks 会被条件跳过）──
  const selected = nodes.find((n) => n.selected);
  const imageNode = selected && selected.type === 'imggen' ? selected : null;
  const videoNode = selected && selected.type === 'genvideo' ? selected : null;
  const genNode = imageNode ?? videoNode;
  const nodeId = genNode?.id ?? '';
  /** ★ 提示词 = **生成节点自身的 `data.text`**（`runForNode` 取的就是它，不读关联文本节点） */
  const prompt = genNode?.data.text ?? '';
  const ratio = genNode?.data.aspectRatio ?? '';
  const hasResult = !!genNode?.data.resultUrl;
  /** 执行账号（原 `_Component45.jsx` 的 `ut`/`I`）；`channel` 缺省 `'doubao'`（源 `I` 的初值；`generate.ts:105` 同判） */
  const sendAccount = genNode?.data.sendAccount ?? 'auto';
  const channel = genNode?.data.channel ?? 'doubao';
  // 「API 是否已配置」与 `state/generate.ts:72` 判的是**同一个条件**（不另立标准）
  const apiReady = !!(apiSetup.imageProviderId || apiSetup.videoProviderId);

  /** 提示词里 `编号 → 素材` 的映射（供 gp 药丸显示缩略图与名字）—— 必须先于下面的 effect */
  const gpMaterials = useMemo(() => {
    const byN = new Map<number, { label?: string; dataUrl?: string }>();
    for (const r of parseRefChips(prompt).refs) {
      const lib = library.find((l) => l.id === r.id);
      const node = nodes.find((n) => n.id === r.id);
      const d = (node?.data ?? {}) as Record<string, unknown>;
      byN.set(r.n, {
        label: lib?.name ?? String(d.label ?? d.name ?? r.rawName),
        ...(lib?.dataUrl
          ? { dataUrl: lib.dataUrl }
          : typeof d.dataUrl === 'string'
            ? { dataUrl: d.dataUrl }
            : {}),
      });
    }
    return byN;
  }, [prompt, library, nodes]);

  /**
   * ★ 光标安全的重写（原 `CL.jsx:279-286` 的**同一模式**，与 `TextNode` 同法）：
   *   ① 编辑器没聚焦才写 ② 内容真不同才写 —— 否则打字时光标会被吃
   */
  useEffect(() => {
    const el = promptRef.current;
    if (!el || document.activeElement === el) return;
    const next = textToGpEditorHtml(prompt, (n) => gpMaterials.get(n) ?? {});
    if (el.innerHTML !== next) el.innerHTML = next;
  }, [prompt, gpMaterials]);

  // ── ③ 提前 return（hooks 已全部调用完毕）──
  if (!genNode) return null;

  /** 写回提示词（**变了才写** —— 与源 `Q` 501-511 同法） */
  const commitPrompt = (): void => {
    const next = gpEditorToText(promptRef.current);
    if (next !== prompt) patchNodeData(nodeId, { text: next });
  };

  /** 光标左侧的纯文本（`@` 触发检测） */
  const textBeforeCaret = (): string => {
    const el = promptRef.current;
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

  /** 采纳候选：把光标前的 `@查询词` 换成 **gp 药丸**（编号沿用已有编号，否则取下一个空号） */
  const pickRef = (item: { id: string; name: string; dataUrl: string }): void => {
    const el = promptRef.current;
    const sel = window.getSelection();
    setRefTrigger(null);
    if (!el || !sel || sel.rangeCount === 0 || !refTrigger) return;
    const range = sel.getRangeAt(0);
    if (!el.contains(range.startContainer)) return;

    const used = new Map<string, number>();
    for (const r of parseRefChips(prompt).refs) used.set(r.id, r.n);
    let n = used.get(item.id) ?? 0;
    if (!n) {
      const taken = new Set(used.values());
      n = 1;
      while (taken.has(n)) n += 1;
    }

    const back = refTrigger.query.length + 1; // `@` 自身也算
    const simple = range.startContainer.nodeType === Node.TEXT_NODE && range.startOffset >= back;
    if (simple) {
      range.setStart(range.startContainer, range.startOffset - back);
      range.deleteContents();
    } else {
      // ⚠️ 兜底（源版没有）：跨文本节点时做不到精确回退 ⇒ 整段重写（结果一定正确，光标落末尾）
      range.selectNodeContents(el);
      range.deleteContents();
    }

    const tpl = document.createElement('div');
    tpl.innerHTML = gpRefChipHtml(n, item.name, item.dataUrl);
    const chip = tpl.firstElementChild as HTMLElement | null;
    if (!chip) return;
    range.insertNode(chip);

    // 光标落到药丸**之后**（否则下一次输入会插到药丸前面）
    const after = document.createRange();
    after.setStartAfter(chip);
    after.collapse(true);
    sel.removeAllRanges();
    sel.addRange(after);
    commitPrompt();
  };

  const run = async (): Promise<void> => {
    setBusy(true);
    try {
      await gen.runForNode(nodeId);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.panel} data-testid="gen-panel">
      <div className={styles.head}>{imageNode ? '文生图' : '文生视频'}</div>

      <label className={styles.row}>
        <span>{NODE_EDIT_TEXT.promptLabel}</span>
      </label>
      <div className={styles.promptWrap}>
        {/*
          ★ 提示词编辑器（原 `_Component45.jsx:1211` 的 `.gp-prompt`，源版就是 **contentEditable**）
          ⚠️ 协议与文本框**不同**：存的是 `@图N`（编号）而不是 `@[id|名]` ——
             渲染 `textToGpEditorHtml`（原 `DS`/`X3`）、读数 `gpEditorToText`（原 `LS`）。
        */}
        <div
          ref={promptRef}
          className={`${styles.prompt} ${styles.promptEditor} nodrag nowheel`}
          contentEditable
          suppressContentEditableWarning
          data-placeholder={`${NODE_EDIT_TEXT.promptPlaceholder}（${REF_TEXT.triggerHint}）`}
          onInput={() => {
            // ⚠️ 输入法合成中不提交（与 `TextNode` 同法 —— 否则会把半成品拼音写进 `data.text`）
            if (composingRef.current) return;
            commitPrompt();
            syncTrigger();
          }}
          onCompositionStart={() => {
            composingRef.current = true;
          }}
          onCompositionEnd={() => {
            composingRef.current = false;
            commitPrompt();
            syncTrigger();
          }}
          onKeyDown={onEscape}
          onBlur={() => {
            setRefTrigger(null);
            commitPrompt();
          }}
        />
        <RefAutocomplete
          query={refTrigger?.query ?? null}
          library={library}
          onPick={(it) => pickRef(it)}
          onClose={() => setRefTrigger(null)}
        />
      </div>

      {/*
        ★ 执行账号（原 `_Component45.jsx:1265-1269` 的 `.gp-acc-wrap`）
        ⚠️ 2026-10-10 补：此前**没有任何地方能改 `sendAccount`** ⇒ 它永远是默认的 `auto`，
          而 `jS` 早就支持 `auto` / `auto:group:<gid>` / `auto:<type>` / 显式 id 四个分支。
      */}
      <label className={styles.row}>
        <span>{GEN_PANEL_TEXT.accountLabel}</span>
        <AccountPicker
          value={sendAccount}
          channel={channel}
          accounts={accounts}
          groups={groups}
          apiReady={apiReady}
          onChange={(next) => patchNodeData(nodeId, next)}
        />
      </label>

      <label className={styles.row}>
        <span>{GEN_PANEL_TEXT.ratioLabel}</span>
        <select value={ratio} onChange={(e) => patchNodeData(nodeId, { aspectRatio: e.target.value })}>
          {ASPECT_RATIOS.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </label>

      {imageNode && (
        <>
          <label className={styles.row}>
            <span>{GEN_PANEL_TEXT.resolutionLabel}</span>
            <select
              value={imageNode.data.igResolution ?? DEFAULT_IMAGE_RESOLUTION}
              onChange={(e) => patchNodeData(nodeId, { igResolution: e.target.value })}
            >
              {IMAGE_RESOLUTIONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.row}>
            <span>{GEN_PANEL_TEXT.countLabel}</span>
            <input
              type="number"
              min={1}
              max={4}
              value={imageNode.data.imageCount ?? 1}
              onChange={(e) => patchNodeData(nodeId, { imageCount: Number(e.target.value) || 1 })}
            />
          </label>
        </>
      )}

      {videoNode && (
        <label className={styles.row}>
          <span>{GEN_PANEL_TEXT.modelLabel}</span>
          <select
            value={videoNode.data.model ?? ''}
            onChange={(e) => patchNodeData(nodeId, { model: e.target.value })}
          >
            <option value="">（默认）</option>
            {VIDEO_MODELS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </label>
      )}

      <button type="button" className={styles.run} onClick={() => void run()} disabled={busy}>
        {busy ? '生成中…' : hasResult ? PROJECT_TEXT.regenerating : PROJECT_TEXT.generate}
      </button>
    </div>
  );
}
