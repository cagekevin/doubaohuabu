/**
 * 「模糊匹配待确认」面板（原 `CL.jsx:834-892`）—— 文本节点里自动匹配**吃不下**的那部分
 *
 * ★ 为什么需要它：自动匹配（`autoMatchText` / 原 `Jh`）只处理**能确定**的命中；剩下的
 *   **部分重叠**（`大致匹配`）替用户做主是危险的 ⇒ 列成候选让人**确认 / 忽略**。
 *
 * ★ **面板开合是纯派生的**（原 `CL.jsx:234` 的 `const Je = he.length > 0`，**没有**开合标志）：
 *   有候选就显示、处理完就自己消失 ⇒ 本组件没有 `open` prop。
 * ★ 三条交互（逐行对源）：
 *   · **确认**（原 `Mt`，`:380-391`）：把该位置替换成 `@[id|名]`（走 `hk` 吸收相邻 `参考图`，
 *     见 `replaceRangeWithRef`）→ 把该位置**所有**候选记账 → 重算；
 *   · **忽略此位置**（原 `zt`，`:392-399`）：把该位置所有候选记账 → 重算；
 *   · **上一个 / 下一个**（原 `At`/`_t`，`:265-278`）：**环形**切换（`< 2` 时禁用）。
 *
 * ★ **正文内高亮 + 定位滚动**（原 `CL.jsx:287-361`）—— **2026-10-11 补齐**：
 *   · 只量**当前这处**匹配的矩形（源 `f$(T, Y, [[et.start, et.end]])`，落空再 `p$(T, et.matchText)` 回退）
 *     ⇒ 几何全在 `ui/nodes/fuzzyRects.ts`（原 `d$`/`f$`/`p$` 的逐行移植）；
 *   · 高亮层挂在**节点根**（`position: relative`）里、用**未缩放**坐标定位（除以画布 `scale`）；
 *   · 量到第一块矩形后**把它滚进视野**（源 `:320-327`，含那两个 `8px` 留白）；
 *   · 编辑器**滚动**与窗口 `resize` 都要**重量**（源 `:329-361` 的 tick）—— 否则高亮不跟着走。
 *
 * ⚠️ 与源的两处如实差异（登记 `TD-03-17`）：
 *   ① **光标钳制** —— 源保持 `ut` 不变，确认中间一项后 `et = he[ut]` 变 `null` ⇒ 面板**空掉**
 *      （`Je` 仍为真）。本实现钳到最后一个有效位置（同源语义下不会出现空面板）；
 *   ② 高亮层定位以**节点根**为参照系（源是编辑器 `parentElement`）—— 两者只差一个固定偏移，
 *      本实现用**高亮层自身的 rect** 现测该偏移（见下），不做额外假设。
 */

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { withThumb } from '@/stable/protocols/img';
import {
  fuzzyCandidates,
  groupCandidates,
  replaceRangeWithRef,
  type FuzzyCandidate,
  type FuzzyLibraryItem,
} from '@/core/rules/fuzzyMatch';
import { FUZZY_TEXT } from '@/constants/text';
import { rectsForMatch, zoomScaleOf, type FuzzyRect } from './fuzzyRects';
import { Icon } from '@/ui/common/Icon';
import styles from './FuzzyConfirmPanel.module.css';

export interface FuzzyConfirmPanelProps {
  /** 节点当前正文（**原始形态**：纯文本 + `@[id|名]`） */
  text: string;
  /** 资源库（只读 `id` / `name` / `dataUrl`） */
  library: readonly FuzzyLibraryItem[];
  /** 写回正文（由调用方落到 store —— 原则 1：`ui` 不直接写） */
  onWrite: (nextText: string) => void;
  /**
   * 正文编辑器元素（`TextNode` 的 `contentEditable`）—— 高亮/滚动都要对着它量。
   * ⚠️ 传 **ref 本身**（不是 `.current`）：调用方挂载时值还是 `null`，传值会永远拿到空。
   */
  editorRef: RefObject<HTMLElement | null>;
}

/** 滚动留白（原 `CL.jsx:323/325` 的两个 `8` —— 命中块贴边时留一点余量） */
const SCROLL_PAD = 8;

export function FuzzyConfirmPanel({ text, library, onWrite, editorRef }: FuzzyConfirmPanelProps) {
  /**
   * 已处理（确认 / 忽略）过的去重键（原 `CL.jsx:228` 的 `De.current`，一个 `Set`）
   * ⚠️ 用 **state** 而不是 ref：候选列表是从它**派生**出来的（见下），ref 变了不会重算。
   */
  const [ignored, setIgnored] = useState<ReadonlySet<string>>(() => new Set());
  /** 当前在**第几处位置**（原 `ut`，`:229`） */
  const [cursor, setCursor] = useState(0);

  /**
   * 候选**按位置归组**（原 `ct` = `l$` → 过滤已忽略 → `c$`）
   * ⚠️ 必须 `useMemo`：`l$` 里对每个素材都要跑一次最长公共子串 DP（名字 200 × 正文 4000）
   *    —— 源也是"按需算"（只在点击 / 确认 / 忽略时 `ct`），不是每次渲染都算。
   */
  const matches = useMemo(
    () => groupCandidates(fuzzyCandidates(text, library).filter((c) => !ignored.has(c.key))),
    [text, library, ignored],
  );

  // ⚠️ 钳制（**有意偏离源**，见文件头 ①）：源的 `et = he[ut] || null` 会让面板空掉
  const safeCursor = cursor >= matches.length ? Math.max(0, matches.length - 1) : cursor;
  const current = matches[safeCursor] ?? null;

  // ── 正文内高亮 + 定位滚动（原 `CL.jsx:287-361`）──────────────────────────────
  const overlayRef = useRef<HTMLDivElement>(null);
  /** 已量好的高亮块（**未缩放** CSS px，相对高亮层原点） */
  const [marks, setMarks] = useState<FuzzyRect[]>([]);
  /** 重测触发器（编辑器滚动 / 窗口 resize 后 +1 —— 源那个 tick 计数器 `ze`） */
  const [tick, setTick] = useState(0);
  const matchKey = current ? `${current.start}:${current.end}:${current.matchText}` : '';

  /**
   * 量当前这处匹配的矩形 → 落到 state，并把第一块**滚进视野**
   *
   * 源（`CL.jsx:287-328`）：`f$(T, t.text, [[et.start, et.end]])`，空则 `p$(T, et.matchText)`；
   * 再按 `Se = rect.width / offsetWidth` 除回未缩放坐标；最后按第一块调整 `editor.scrollTop`。
   */
  useLayoutEffect(() => {
    const editor = editorRef.current;
    const overlay = overlayRef.current;
    if (!editor || !overlay || !current) {
      setMarks([]);
      return;
    }
    const scale = zoomScaleOf(editor);
    const rects = rectsForMatch(editor, text, current);
    // 高亮层的原点就是它自己的 (0,0)（`.fuzzyOverlay` 是 `left/top: 0` 的零尺寸盒子）
    const frame = overlay.getBoundingClientRect();
    const editorBox = editor.getBoundingClientRect();
    const originX = (editorBox.left - frame.left) / scale;
    const originY = (editorBox.top - frame.top) / scale;
    setMarks(
      rects.map((r) => ({
        left: originX + r.left / scale,
        top: originY + r.top / scale,
        width: r.width / scale,
        height: r.height / scale,
      })),
    );

    // 定位滚动（原 `:320-327`）—— 第一块在视口外才滚，且**贴边留 8px**
    const first = rects[0];
    if (first) {
      if (first.top < 0) editor.scrollTop += first.top - SCROLL_PAD;
      else if (first.top + first.height > editor.clientHeight) {
        editor.scrollTop += first.top + first.height - editor.clientHeight + SCROLL_PAD;
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `current` 的等价键是 `matchKey`
  }, [matchKey, text, editorRef, tick]);

  /**
   * 编辑器滚动 / 窗口 resize ⇒ 重量（原 `:329-361`）
   * ⚠️ 源用 `requestAnimationFrame` 节流（`K` 那把手铡刀），照抄；否则滚动时每帧都在跑量算。
   */
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    let raf: number | null = null;
    const schedule = (): void => {
      if (raf !== null) return;
      raf = requestAnimationFrame(() => {
        raf = null;
        setTick((v) => v + 1);
      });
    };
    editor.addEventListener('scroll', schedule);
    window.addEventListener('resize', schedule);
    return () => {
      if (raf !== null) cancelAnimationFrame(raf);
      editor.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
    };
  }, [editorRef]);

  if (!current) return null;

  /** 记账：该位置**所有**候选都算处理过（原 `et.materials.forEach(…)`） */
  const remember = (): void => {
    setIgnored((prev) => {
      const next = new Set(prev);
      for (const m of current.materials) next.add(m.key);
      return next;
    });
  };

  /** 确认某条候选（原 `Mt`） */
  const confirm = (candidate: FuzzyCandidate): void => {
    const next = replaceRangeWithRef(
      text,
      `@[${candidate.id}|${candidate.name}]`,
      current.start,
      current.end,
    );
    remember();
    onWrite(next);
  };

  /** 上一个 / 下一个（**环形**，原 `At`/`_t`） */
  const step = (delta: number): void => {
    if (matches.length < 2) return;
    setCursor((prev) => (prev + delta + matches.length) % matches.length);
  };

  return (
    <>
      {/*
        正文内高亮（原 `CL.jsx:819-833` 的 `.fuzzy-overlay` / `.fuzzy-mark.is-current`）
        ⚠️ **只渲染当前这处**（源同）；零尺寸 + `pointer-events:none` ⇒ 不挡正文点击
          —— 它的作用只是给下面那些块**当参照系**（自己量自己的 rect 即可）。
        ⚠️ 块坐标是**未缩放** CSS px（画布 `transform: scale` 已除掉），故这里不再考虑缩放。
      */}
      <div ref={overlayRef} className={styles.fuzzyOverlay} aria-hidden="true">
        {marks.map((m, i) => (
          <span key={`${m.left}:${m.top}:${i}`} className={`${styles.fuzzyMark} ${styles.fuzzyMarkCurrent}`} style={m} />
        ))}
      </div>

      <div className={`${styles.fuzzyPanel} nodrag nopan`}>
      <div className={styles.fuzzyHead}>
        <span>
          {FUZZY_TEXT.matchPrefix}
          <b className={styles.fuzzyCurrentMatch}>{`「${current.matchText}」`}</b>
          <span className={styles.fuzzyCurrentName}>
            {`(${current.fuzzy ? FUZZY_TEXT.same : FUZZY_TEXT.byKeyword})`}
          </span>
        </span>
        <span className={styles.fuzzyFindbar}>
          <button
            type="button"
            className={styles.fuzzyNav}
            title={FUZZY_TEXT.prevTitle}
            disabled={matches.length < 2}
            onClick={(e) => {
              e.stopPropagation();
              step(-1);
            }}
          >
            {FUZZY_TEXT.prevGlyph}
          </button>
          <span className={styles.fuzzyCounter}>{FUZZY_TEXT.counter(safeCursor + 1, matches.length)}</span>
          <button
            type="button"
            className={styles.fuzzyNav}
            title={FUZZY_TEXT.nextTitle}
            disabled={matches.length < 2}
            onClick={(e) => {
              e.stopPropagation();
              step(1);
            }}
          >
            {FUZZY_TEXT.nextGlyph}
          </button>
        </span>
      </div>

      <div className={styles.fuzzyGallery}>
        {current.materials.map((m) => (
          <div
            className={styles.fuzzyCard}
            title={FUZZY_TEXT.cardTitle(m.name)}
            key={m.key}
            onClick={(e) => {
              e.stopPropagation();
              confirm(m);
            }}
          >
            <div className={styles.fuzzyThumbWrap}>
              {m.dataUrl ? (
                <img
                  src={withThumb(m.dataUrl, 160)}
                  alt={m.name}
                  className={styles.fuzzyThumbImg}
                  draggable={false}
                />
              ) : (
                <div className={styles.fuzzyThumbPlaceholder}>
                  <Icon name="image" />
                  <span>{FUZZY_TEXT.noPreview}</span>
                </div>
              )}
            </div>
            <div className={styles.fuzzyCardName}>
              {m.name.slice(0, m.nameStart)}
              <mark className={styles.fuzzyKw}>{m.name.slice(m.nameStart, m.nameEnd)}</mark>
              {m.name.slice(m.nameEnd)}
            </div>
            <div className={styles.fuzzyCardMatch}>
              {m.fuzzy ? FUZZY_TEXT.matchFuzzy : FUZZY_TEXT.matchKeyword}
            </div>
          </div>
        ))}
      </div>

      <div className={styles.fuzzyFoot}>
        <span className={styles.fuzzyTip}>{FUZZY_TEXT.tip}</span>
        <button
          type="button"
          className={styles.fuzzyIgnore}
          onClick={(e) => {
            e.stopPropagation();
            remember();
          }}
        >
          {FUZZY_TEXT.ignore}
        </button>
      </div>
      </div>
    </>
  );
}
