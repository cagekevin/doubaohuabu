/**
 * 提示词分析（浮动按钮 + `.mpp-*` 结果面板）—— 文生图 / 素材节点**共用**
 *
 * ★ **判据 C1**：源版在 `ZL.jsx`（文生图）与 `fL.jsx`（素材）里**逐字重复**了同一套
 *   浮动按钮 + 面板（`gS`/`yS` 调用、徽章四态、三个 tab、复制、调整区）⇒ 抽成共享组件。
 * ⚠️ **文生视频节点（源 `YL.jsx`）没有这套**（源不碰 `analyzePrompt`）⇒ 不消费本组件。
 *
 * 依据（**逐行回源抄录**，行号均为 `ZL.jsx`）：
 *   | 行为 | 源 | 语义 |
 *   |---|---|---|
 *   | 分析按钮 | 273-286 | 有图且不在生成中才显示；忙碌 ⇒「分析中…」 |
 *   | 分析动作 | 168-180 `se()` | **先展开面板**；已在分析 ⇒ 只展开（不重复触发）；否则 `analyze(nodeId, imageUrl)` |
 *   | 面板外壳 | 321-332 | `.mpp-head`：徽章 + 标题（`AI 提示词 · 账号名`）+ 收起 |
 *   | 面板内容 | 333-344 | `error` ⇒ 错误；`analyzing/revising` ⇒ 转圈 + `phase`；否则 ⇒ tab 区 |
 *   | 三个 tab | 345-360 | 中文 / 英文 / JSON |
 *   | 复制 | 362-374 | 复制当前 tab 的文本（JSON ⇒ `JSON.stringify(…, null, 2)`） |
 *   | 内容 | 376-385 | `<pre>`；JSON 逐行 `${键}: ${值（数组用 `；` 连）}`；无 JSON ⇒ 占位 |
 *   | 调整区 | 389-407 | 输入 + 「调整」按钮；**Enter 提交**；成功才清空输入 |
 *
 * ⚠️ 原则 1：本组件**不写 store** —— 分析/调整走 `useAnalyze()`（state 控制器）；
 *    复制走 `useHostOps()` 的 `copyText`（`ui` 不得直持 `Ports` —— TD-16-8）+ `pushToast`。
 * ⚠️ 与源版一致：面板**只在已有 `analyzePrompt` 且已展开时**才渲染。
 */

import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react';
// ★ 浮层壳走**共享件**（头三槽 / ✕ / 正文只有一种）—— 不带 `overlay`：它是**节点锚定浮层**
import { PanelShell } from '@/ui/common/PanelShell';
import { useAnalyze, useHostOps, useStore } from '@/state';
import type { AnalyzePromptState } from '@/stable/model/node';
// ⚠️ 纯函数放 `core/rules`（判据 E1：`ui/` 下不得有测试 ⇒ 留在组件里就永远没有单测）
import { formatJsonPrompt } from '@/core/rules/analyzePrompt';
import { ANALYZE_UI_TEXT } from '@/constants/text';
import styles from './AnalyzePrompt.module.css';
import shared from '@/ui/common/shared.module.css';

export type AnalyzeTab = 'zh' | 'en' | 'json';

export interface AnalyzePromptProps {
  nodeId: string;
  /** 当前图片（原 `se()` 的 `d`）—— 没有则按钮不可用 */
  imageUrl?: string;
  /** 节点上的 `analyzePrompt`（原 `ZL.jsx:158` 的 `l.analyzePrompt`） */
  state: AnalyzePromptState | null;
  /** 是否显示浮动按钮（原 256 的 `u && !l.generating`） */
  showButton: boolean;
  /**
   * ★ **同一条浮动动作条里排在前面的按钮**（如素材 / 文生图节点的「编辑图片」）
   *
   * 依据：源里两个按钮**同住一个 `.mat-float-actions`**
   *   （`fL.jsx:162-192` / `ZL.jsx:255-286`：`mat-edit-float` 与 `mat-analyze-float` 是**兄弟**）
   *   ⇒ 由本组件出容器、消费者把「前面那颗」传进来，避免两处各画一条 bar。
   */
  leading?: ReactNode;
}

export function AnalyzePrompt({
  nodeId,
  imageUrl,
  state,
  showButton,
  leading,
}: AnalyzePromptProps) {
  const analyze = useAnalyze();
  const hostOps = useHostOps();
  const pushToast = useStore((s) => s.pushToast);

  /** 面板是否展开（原 `A`/`D`） */
  const [open, setOpen] = useState(false);
  /** 当前 tab（原 `F`/`M`） */
  const [tab, setTab] = useState<AnalyzeTab>('zh');
  /** 调整意见草稿（原 `U`/`_`） */
  const [draft, setDraft] = useState('');

  const busy = state?.status === 'analyzing' || state?.status === 'revising';
  /** 原 `ZL.jsx:194` 的 `I` —— **只**看 `analyzing`（`revising` 时按钮文案 / 禁用态都不变） */
  const analyzing = state?.status === 'analyzing';
  /**
   * 原 `ZL.jsx:197` 的 `R` —— 「**已有可展示的结果**」：分析中 ∨ 调整中 ∨ 已完成且有内容。
   * ★ 它决定点「分析提示词」是**重跑**还是**只展开面板**（源 `se():205-208`）。
   */
  const hasResult =
    !!state &&
    (state.status === 'analyzing' ||
      state.status === 'revising' ||
      (state.status === 'done' &&
        (!!state.zh_prompt || !!state.en_prompt || !!state.json_prompt || !!state.raw)));

  /** 面板卡片 ref（原 `ZL.jsx:202` 的 `J`）—— 判「点在外面」用 */
  const popRef = useRef<HTMLDivElement>(null);
  /**
   * ★ **点面板外面 ⇒ 收起**（原 `ZL.jsx:229-243`）
   *
   * ⚠️ 只在「展开 **且** 有 `state`」时挂（源同：`if (!D || !j) return`）。
   * ⚠️ 用**捕获**阶段（源第三参 `true`）—— 否则面板内部的 `stopPropagation` 会让它收不到。
   * ⚠️ **一处简化（留痕）**：源同时排除「节点根」（`H`），本组件拿不到那个 ref ⇒ 只排除面板本身
   *    （点节点会收起面板；源不会）。
   */
  useEffect(() => {
    if (!open || !state) return;
    const onDown = (e: MouseEvent): void => {
      if (popRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onDown, true);
    return () => document.removeEventListener('mousedown', onDown, true);
  }, [open, state]);

  /** 原 `se()` 168-180 */
  const onAnalyze = (): void => {
    if (!imageUrl) return; // 原 `if (d)` 守卫（源在它之内才展开面板）
    setOpen(true);
    // ★ 源 `:205-208`：**已有结果 ⇒ 只展开面板、不重跑**（本仓此前缺这一档 ⇒ 再点会白跑一遍）
    if (hasResult) return;
    void analyze.analyze(nodeId, imageUrl);
  };

  /** 原 `ke()` 181-193 */
  const onRevise = (): void => {
    const v = draft.trim();
    // 源 `ke()`：`if (!!V && !z)` —— **只**拦 `revising`（不看 `analyzing`）
    if (!v || state?.status === 'revising') return;
    void analyze.revise(nodeId, v).then((ok) => {
      if (ok) setDraft(''); // ★ 与源一致：**成功才清空输入**
    });
  };

  /** 原 `JL` 40996：复制到剪贴板 + 提示 */
  const onCopy = (): void => {
    const text =
      tab === 'zh'
        ? (state?.zh_prompt ?? '')
        : tab === 'en'
          ? (state?.en_prompt ?? '')
          : state?.json_prompt
            ? JSON.stringify(state.json_prompt, null, 2)
            : '';
    void hostOps.copyText(text).then((r) => {
      pushToast(
        r.ok ? ANALYZE_UI_TEXT.copied : ANALYZE_UI_TEXT.copyFailed,
        undefined,
        r.ok ? 'info' : 'error',
      );
    });
  };

  const tabLabel = tab === 'zh' ? ANALYZE_UI_TEXT.tabZh : tab === 'en' ? ANALYZE_UI_TEXT.tabEn : ANALYZE_UI_TEXT.tabJson;
  const jsonText = formatJsonPrompt(state?.json_prompt);

  return (
    <>
      {showButton && (
        // ⚠️ `nodrag nopan` 是 ReactFlow 约定类名（按钮不该拖动节点 / 平移画布）
        <div className={`${styles.floatActions} nodrag nopan`}>
          {leading}
          <button
            type="button"
            className={styles.analyzeBtn}
            title={ANALYZE_UI_TEXT.buttonTitle}
            /* ⚠️ 源 `:308` 用的是 `I`（**只** `analyzing`）—— 写成 `busy` 会让「调整中」也禁用并改文案 */
            disabled={analyzing}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onAnalyze();
            }}
          >
            {analyzing ? ANALYZE_UI_TEXT.buttonBusy : ANALYZE_UI_TEXT.buttonLabel}
          </button>
        </div>
      )}

      {state && open && (
        /*
         * ★★ **2026-10-12 收口到共享壳**：此前它自拼 `.panelHead` + 自绘 `×` 关闭钮（`btnIcon`）
         *   ⇒ 关闭钮与全站唯一的 `✕`（`panelClose`）**不是同一个**。
         *   现走 `PanelShell`（**不带 `overlay`** —— 它是**节点锚定浮层**，不是模态）：
         *   · 中槽 = 状态药丸 · `✕` = 真源那颗。
         */
        <PanelShell
          className={`${styles.pop} nodrag nopan nowheel`}
          testId="analyze-prompt-pop"
          wrapperRef={popRef}
          title={ANALYZE_UI_TEXT.panelTitle(state.accountName)}
          meta={
            <span
              className={`${shared.pill} ${
                state.status === 'error' ? shared.pillErr : state.ok === true ? shared.pillOk : ''
              }`}
            >
              {state.status === 'analyzing' || state.status === 'revising'
                ? ANALYZE_UI_TEXT.badgeBusy
                : state.status === 'done'
                  ? state.ok
                    ? ANALYZE_UI_TEXT.badgeDone
                    : ANALYZE_UI_TEXT.badgeRaw
                  : ANALYZE_UI_TEXT.badgeFailed}
            </span>
          }
          onClose={() => setOpen(false)}
          closeLabel={ANALYZE_UI_TEXT.collapse}
        >
          {/* 原 333：`key={`${status}-${at}`}` —— 状态或时刻一变就重挂（用于重放入场动画） */}
          <Fragment key={`${state.status}-${state.at}`}>
            {state.status === 'error' ? (
              <div className={styles.error}>{state.error}</div>
            ) : busy ? (
              <div className={styles.wait}>
                <div className={styles.waitRow}>
                  <span className={shared.spinnerRing} aria-hidden="true" />
                  <span>{state.phase || ANALYZE_UI_TEXT.waitDefault}</span>
                </div>
              </div>
            ) : (
              <>
                <div className={shared.tabs}>
                  <button
                    type="button"
                    className={`${shared.tab} ${tab === 'zh' ? shared.isOn : ''}`}
                    onClick={() => setTab('zh')}
                  >
                    {ANALYZE_UI_TEXT.tabZh}
                  </button>
                  <button
                    type="button"
                    className={`${shared.tab} ${tab === 'en' ? shared.isOn : ''}`}
                    onClick={() => setTab('en')}
                  >
                    {ANALYZE_UI_TEXT.tabEn}
                  </button>
                  <button
                    type="button"
                    className={`${shared.tab} ${tab === 'json' ? shared.isOn : ''}`}
                    onClick={() => setTab('json')}
                  >
                    {ANALYZE_UI_TEXT.tabJson}
                  </button>
                  <span className={styles.tabsGap} />
                  <button type="button" className={styles.copy} title={ANALYZE_UI_TEXT.copyTitle(tabLabel)} onClick={onCopy}>
                    {ANALYZE_UI_TEXT.copy}
                  </button>
                </div>
                <div className={styles.content}>
                  <pre className={styles.pre}>
                    {tab === 'zh'
                      ? (state.zh_prompt ?? '')
                      : tab === 'en'
                        ? (state.en_prompt ?? '')
                        : (jsonText ?? String(state.json_prompt ?? ANALYZE_UI_TEXT.noJson))}
                  </pre>
                </div>
                {state.error ? <div className={styles.error}>{state.error}</div> : null}
              </>
            )}
          </Fragment>

          {/* 原 `:424`：调整区**只在 `status === 'done'` 时**出现（源 `O`）——
              此前写成 `!busy` ⇒ `error` 态也会露出调整区（源里那时没有）。 */}
          {state?.status === 'done' && (
            <div className={styles.revise}>
              <input
                type="text"
                className={`${styles.reviseInput} nodrag`}
                placeholder={ANALYZE_UI_TEXT.revisePlaceholder}
                value={draft}
                onMouseDown={(e) => e.stopPropagation()}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') onRevise();
                }}
              />
              {/*
                ⚠️ 源 `:434/:440` 在按钮上还判了 `z`（`revising`）—— 但**调整区整体只在 `done` 时渲染**
                （`:424` 的 `O`）⇒ `z` 在这里**恒为 false**，那两处是**源的死代码**。
                ⇒ 本仓不照抄死代码（TS 也会直接报「`'done'` 与 `'revising'` 无交集」）。
              */}
              <button
                type="button"
                className={styles.reviseBtn}
                disabled={!draft.trim()}
                onClick={onRevise}
              >
                {ANALYZE_UI_TEXT.reviseSubmit}
              </button>
            </div>
          )}
        </PanelShell>
      )}
    </>
  );
}
