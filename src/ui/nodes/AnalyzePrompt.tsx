/**
 * 提示词分析（浮动按钮 + `.mpp-*` 结果面板）—— 文生图 / 文生视频节点**共用**
 *
 * ★ **判据 C1**：源版在 `ZL.jsx`（文生图）与 `fL.jsx`（文生视频）里**逐字重复**了同一套
 *   浮动按钮 + 面板（`gS`/`yS` 调用、徽章四态、三个 tab、复制、调整区）⇒ 抽成共享组件。
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

import { useState } from 'react';
import { useAnalyze, useHostOps, useStore } from '@/state';
import type { AnalyzePromptState } from '@/stable/model/node';
// ⚠️ 纯函数放 `core/rules`（判据 E1：`ui/` 下不得有测试 ⇒ 留在组件里就永远没有单测）
import { formatJsonPrompt } from '@/core/rules/analyzePrompt';
import { ANALYZE_UI_TEXT } from '@/constants/text';
import styles from './AnalyzePrompt.module.css';

export type AnalyzeTab = 'zh' | 'en' | 'json';

export interface AnalyzePromptProps {
  nodeId: string;
  /** 当前图片（原 `se()` 的 `d`）—— 没有则按钮不可用 */
  imageUrl?: string;
  /** 节点上的 `analyzePrompt`（原 `ZL.jsx:158` 的 `l.analyzePrompt`） */
  state: AnalyzePromptState | null;
  /** 是否显示浮动按钮（原 256 的 `u && !l.generating`） */
  showButton: boolean;
}

export function AnalyzePrompt({ nodeId, imageUrl, state, showButton }: AnalyzePromptProps) {
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

  /** 原 `se()` 168-180 */
  const onAnalyze = (): void => {
    setOpen(true);
    if (busy) return; // 已在分析 ⇒ **只展开面板**，不重复触发
    if (!imageUrl) return; // 原 `if (d)` 守卫
    void analyze.analyze(nodeId, imageUrl);
  };

  /** 原 `ke()` 181-193 */
  const onRevise = (): void => {
    const v = draft.trim();
    if (!v || busy) return;
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
          <button
            type="button"
            className={styles.analyzeBtn}
            title={ANALYZE_UI_TEXT.buttonTitle}
            disabled={busy}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onAnalyze();
            }}
          >
            {busy ? ANALYZE_UI_TEXT.buttonBusy : ANALYZE_UI_TEXT.buttonLabel}
          </button>
        </div>
      )}

      {state && open && (
        <div className={`${styles.pop} nodrag nopan nowheel`}>
          <div className={styles.head}>
            <span
              className={`${styles.badge} ${
                state.status === 'error' ? styles.badgeFailed : state.ok === true ? styles.badgeDone : ''
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
            <span className={styles.title}>{ANALYZE_UI_TEXT.panelTitle(state.accountName)}</span>
            <button type="button" className={styles.close} title={ANALYZE_UI_TEXT.collapse} onClick={() => setOpen(false)}>
              ×
            </button>
          </div>

          {/* 原 333：`key={`${status}-${at}`}` —— 状态或时刻一变就重挂（用于重放入场动画） */}
          <div className={styles.body} key={`${state.status}-${state.at}`}>
            {state.status === 'error' ? (
              <div className={styles.error}>{state.error}</div>
            ) : busy ? (
              <div className={styles.wait}>
                <div className={styles.waitRow}>
                  <span className={styles.spinner} aria-hidden="true" />
                  <span>{state.phase || ANALYZE_UI_TEXT.waitDefault}</span>
                </div>
              </div>
            ) : (
              <>
                <div className={styles.tabs}>
                  <button
                    type="button"
                    className={`${styles.tab} ${tab === 'zh' ? styles.on : ''}`}
                    onClick={() => setTab('zh')}
                  >
                    {ANALYZE_UI_TEXT.tabZh}
                  </button>
                  <button
                    type="button"
                    className={`${styles.tab} ${tab === 'en' ? styles.on : ''}`}
                    onClick={() => setTab('en')}
                  >
                    {ANALYZE_UI_TEXT.tabEn}
                  </button>
                  <button
                    type="button"
                    className={`${styles.tab} ${tab === 'json' ? styles.on : ''}`}
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
          </div>

          {/* 原 389-407：调整区（`O` = 有分析结果时才有；这里等价于「非忙碌」） */}
          {!busy && (
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
              <button type="button" className={styles.reviseBtn} disabled={!draft.trim()} onClick={onRevise}>
                {ANALYZE_UI_TEXT.reviseSubmit}
              </button>
            </div>
          )}
        </div>
      )}
    </>
  );
}
