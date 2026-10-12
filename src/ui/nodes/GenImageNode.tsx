/**
 * 文生图节点（`type: 'imggen'`）—— 对应原 `ZL.jsx`
 * 依据：docs/03-人类版.md §1（29559-29575）+ §5 · `docs/12` §1.8 · `docs/13` §1.8
 *
 * ⚠️ `results[]` 上限由 `IMAGE_GEN_FEED_LIMIT`（80）约束
 * ⚠️ 结果图走 `<Thumb>`（`?w=`），不加载原图
 *
 * ★ **2026-10-11**：
 *   · 当前展示图改用纯层 **`genImageCurrentUrl`**（原 `d`，`ZL.jsx:25-27`）—— 此前是
 *     `resultUrl ?? results[0].dataUrl`，**漏了源的「`viewUrl` 且仍在 `results` 里则优先」**；
 *   · 补 **`gv-dl` 下载这张图**（原 108-157,244-255）—— 走 `hostOps.downloadFileAs`
 *     + 成功 toast 带「在文件夹中显示」（`hostOps.revealPath`）。⚠️ 源**写死** `png` 与文件名
 *     `` `文生图_${Date.now()}.png` ``（与文生视频那套走 `label` 的**不同**，各自逐字对源）。
 *   · 补 **`ig-chip-status`**（原 218-220）+ **`gv-hist-btn` / `gv-hist-pop`**（原 221-225,288-314）
 *     + **`gv-meta` 落点更正**（原 960-962：源在**卡片底部独立行**，此前误经 `NodeShell` 的
 *     `meta` 塞进**头部右槽**；头部右槽按源留给 `ig-chip-status` / `gv-hist-btn`）。
 *     ⚠️ 本节点的历史版本走的是 **`results` + `viewUrl`**（**不是** `genHistory`/`selVer` ——
 *     文生视频才是那套）；切换 = `patchNodeData({viewUrl, dataUrl})`（原 `E`，101-107）。
 *
 * 外壳统一走 `NodeShell`（判据 C1）
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useHostOps, useStore } from '@/state';
import { Thumb } from '@/ui/common/Thumb';
import { COMMON_TEXT, GEN_IMAGE_TEXT, MATERIAL_NODE_TEXT } from '@/constants/text';
import { isCardClick } from '@/core/rules/cardClick';
import { genImageCurrentUrl, imageApiChipLabel, imageChannelLabel, imageVersionView } from '@/core/rules/genImage';
// ⚠️ 舞台的 `aspectRatio` 与文生视频**同一条纯规则**（判据 C1）—— 不各写一份
import { stageRatio } from '@/core/rules/genVideo';
import { countInputs } from '@/core/rules/linkedMaterials';
import { withThumb } from '@/stable/protocols/img';
import { formatDateTimeMinute } from '@/lib/time';
import { NodeShell } from './NodeShell';
import { AnalyzePrompt } from './AnalyzePrompt';
import type { RFNodeProps } from './types';
import styles from './shared.module.css';

export function GenImageNode({ id, data, selected }: RFNodeProps<'imggen'>) {
  const nodes = useStore((s) => s.nodes);
  const edges = useStore((s) => s.edges);
  const pushToast = useStore((s) => s.pushToast);
  const openImageGenPanel = useStore((s) => s.openImageGenPanel);
  const patchNodeData = useStore((s) => s.patchNodeData);
  const openImageEditor = useStore((s) => s.openImageEditor);
  // ★ 宿主能力走控制器（`ui` 不持 `Ports` —— TD-16-8）
  const hostOps = useHostOps();
  /** 卡片按下起点（原 `ZL.jsx` 的 pointer-down ref）—— 供「点击 vs 拖动」判定 */
  const pressRef = useRef<{ x: number; y: number } | null>(null);
  /** 当前展示的图（原 `d`）—— 与 `gv-dl` 下载、历史版本高亮都是**同一个值** */
  const current = genImageCurrentUrl(data) ?? undefined;
  /** 历史版本列表（原 `c = Array.isArray(l.results) ? l.results : []`，`ZL.jsx:23`） */
  const versions = useMemo(() => (Array.isArray(data.results) ? data.results : []), [data.results]);
  /** `gv-meta` 首项：已连接 N 个输入（原 `a.length`，`ZL.jsx:961`） */
  const inputCount = useMemo(() => countInputs(nodes, edges, id), [nodes, edges, id]);
  /** `ig-chip-status` 文案（原 218-220）—— `null` = 不渲染 */
  const chipText = imageApiChipLabel(data.apiJob);
  const [histOpen, setHistOpen] = useState(false);
  const [histPos, setHistPos] = useState<{ left: number; top: number } | null>(null);
  const histBtnRef = useRef<HTMLButtonElement>(null);
  const histPopRef = useRef<HTMLDivElement>(null);

  /** 开合历史弹层（原 `C`，`ZL.jsx` 与 `YL.jsx:407-422` 同法） */
  const toggleHistory = (e: { stopPropagation: () => void }) => {
    e.stopPropagation();
    if (histOpen) {
      setHistOpen(false);
      return;
    }
    const rect = histBtnRef.current?.getBoundingClientRect();
    if (rect) {
      setHistPos({
        left: Math.max(8, Math.min(rect.left, window.innerWidth - 264 - 8)),
        top: rect.bottom + 8,
      });
    }
    setHistOpen(true);
  };

  /** 弹层开着时：点外面关掉（与 `YL.jsx:423-438` 同法） */
  useEffect(() => {
    if (!histOpen) return;
    const onDown = (e: MouseEvent) => {
      const inBtn = histBtnRef.current?.contains(e.target as Node);
      const inPop = histPopRef.current?.contains(e.target as Node);
      if (!inBtn && !inPop) setHistOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [histOpen]);

  /**
   * 切换到某一张（原 `E`，`ZL.jsx:100-107`）
   *
   * `updateNodeData(id, {viewUrl: V, dataUrl: V})` —— 两个字段**都写**（`dataUrl` 是源里
   * 「本节点已产出」的缓存字段），并**关掉弹层**。
   */
  const selectVersion = (dataUrl: string) => {
    patchNodeData(id, { viewUrl: dataUrl, dataUrl });
    setHistOpen(false);
  };

  /**
   * 下载这张图（原 `P`，`ZL.jsx:108-157`）
   *
   * ⚠️ 与 `GenVideoNode.download` 同法：源的「`window.api` 有没有该方法」三段回落在本仓
   *   **塌成一段**（`FilePort` 恒存在）· 源的 `try/catch` 兜的是调用抛异常，端口恒返 `Result`
   *   ⇒ 无 `catch`（失败走 `!r.ok`，原文透传，原则 6）。
   */
  const download = useCallback(async () => {
    const url = genImageCurrentUrl(data);
    if (!url) return;
    const name = GEN_IMAGE_TEXT.downloadName(Date.now());
    const r = await hostOps.downloadFileAs(url, name, [
      { name: COMMON_TEXT.imageFilter, extensions: ['png'] },
    ]);
    if (!r.ok) {
      pushToast(COMMON_TEXT.downloadFailed(r.message || COMMON_TEXT.unknownReason), 5000, 'warn');
      return;
    }
    // 用户主动取消 ⇒ 静默返回（原 123：`if (oe && oe.canceled) return;`）
    if (r.value.canceled) return;
    const path = r.value.path || '';
    pushToast(
      COMMON_TEXT.downloadedTo(path || name),
      9000,
      'success',
      // 原 148-153：有落盘路径才给「在文件夹中显示」
      path ? { label: COMMON_TEXT.revealInFolder, onClick: () => void hostOps.revealPath(path) } : undefined,
    );
  }, [data, hostOps, pushToast]);

  return (
    // ⚠️ 用 Fragment 包住：历史弹层走 `createPortal` 到 `document.body`（源 `ZL.jsx:288` 同法）
    <>
      <NodeShell
        type="imggen"
        title={GEN_IMAGE_TEXT.title}
        selected={selected}
        // 有框外浮层（分析按钮 / 提示词浮层）⇒ 不能被 `.node` 的 overflow 裁掉
        overflowVisible
        // 中槽 = 状态 chip；右槽 = 历史按钮（按源 218-225 的顺序）
        meta={chipText !== null ? <span className={styles.igChipStatus}>{chipText}</span> : undefined}
        actions={
          versions.length > 0 ? (
            <button
              ref={histBtnRef}
              type="button"
              className={`${styles.gvHistBtn} nodrag${histOpen ? ` ${styles.gvHistBtnOpen}` : ''}`}
              title={GEN_IMAGE_TEXT.histBtnTitle}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={toggleHistory}
            >
              {GEN_IMAGE_TEXT.histBtn(versions.length)}
            </button>
          ) : undefined
        }
        cardTitle={GEN_IMAGE_TEXT.cardTitle}
        // 整卡点击 → 打开文生图面板（原 `ZL.jsx:210` 的 `onPointerDown`/`onClick`）
        onPointerDown={(e) => {
          pressRef.current = { x: e.clientX, y: e.clientY };
        }}
        onClick={(e) => {
          const start = pressRef.current;
          pressRef.current = null;
          if (isCardClick(start, { x: e.clientX, y: e.clientY })) openImageGenPanel(id);
        }}
      >
        {/*
          `gv-stage`（原 `ZL.jsx:227-229`）—— 按比例撑开的舞台。
          ⚠️ **2026-10-12 对齐源**：此前卡片顶部多印一行 `（空提示词）`（源卡片**没有**这行），
            且空态用的是「未生成」两字（源是 `.gv-preview-empty` 的**标题 + 副标题**两句）。
        */}
        <div className={styles.gvStage} style={{ aspectRatio: stageRatio(data.aspectRatio) }}>
          {data.generating && (
            <div className={styles.gvWaiting} aria-label={GEN_IMAGE_TEXT.waitingAria}>
              <div className={styles.gvwDots}>
                <span />
                <span />
                <span />
              </div>
              <div className={styles.gvwText}>
                {current ? GEN_IMAGE_TEXT.waitingRegenerate : GEN_IMAGE_TEXT.waitingFirst}
              </div>
            </div>
          )}
          {current ? (
            // 原 240：`Xt(d, 720)` —— 缩略图宽 **720**
            <Thumb src={current} width={720} className={styles.thumb} />
          ) : (
            <div className={styles.gvPreviewEmpty}>
              <div className={styles.gvPreviewTitle}>{GEN_IMAGE_TEXT.stageEmptyTitle}</div>
              <div className={styles.gvPreviewSub}>{GEN_IMAGE_TEXT.stageEmptySub}</div>
            </div>
          )}
          {/* `gv-dl`（原 244-255）：下载这张图（条件 = 有当前图 `u`，与是否在生成无关） */}
          {current ? (
          <button
            type="button"
            className={`${styles.gvDl} nodrag`}
            title={GEN_IMAGE_TEXT.download}
            aria-label={GEN_IMAGE_TEXT.downloadAria}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              void download();
            }}
          >
            <svg
              viewBox="0 0 24 24"
              width="15"
              height="15"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 3v12" />
              <path d="m7 11 5 5 5-5" />
              <path d="M4 20h16" />
            </svg>
          </button>
        ) : null}
          {/*
            ★ 提示词分析（原 `ZL.jsx:256/273-286` 的浮动按钮 + `321` 的浮层）
            ⚠️ **落点在 `gv-stage` 内**（源 256 的 `.mat-float-actions` 就在 `.gv-stage` 里）——
              所以它压在**图上**，不是压在卡片底。

            ⚠️ **`leading` = 「编辑图片」**（原 `mat-edit-float`，256-272）：源里两颗按钮同住
               `.mat-float-actions` ⇒ 动作条由 `AnalyzePrompt` 出容器，这里只把「前面那颗」传进去
               （此前是**两条** bar：编辑图片在左下、分析按钮浮在节点上方 —— 与源都不符）。
          */}
          <AnalyzePrompt
            nodeId={id}
            imageUrl={current}
            state={data.analyzePrompt ?? null}
            showButton={!!current && !data.generating}
            leading={
              <button
                type="button"
                className={styles.matFloatBtn}
                title={MATERIAL_NODE_TEXT.editImageTitle}
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  // ⚠️ `leading` 是**先构造、后由 `showButton` 决定渲不渲染** ⇒ 这里要自己收窄
                  if (current) openImageEditor(id, current, data.label || GEN_IMAGE_TEXT.title);
                }}
              >
                {MATERIAL_NODE_TEXT.editImage}
              </button>
            }
          />
        </div>
        {/*
          `gv-meta`（原 960-962）—— ★ **落点更正**：源在**卡片底部独立行**（`gv-stage` 之后），
          此前误经 `NodeShell` 的 `meta` 塞进**头部右槽**。内容亦按源改：
          `已连接 N 个输入 · <频道> · <比例>[ · 已出 N 张]`（此前是「频道 · 分辨率 · 张数」）。
        */}
        <div className={styles.gvMeta}>
          {GEN_IMAGE_TEXT.metaInputs(inputCount)}
          {GEN_IMAGE_TEXT.metaSep}
          {imageChannelLabel(data.channel)}
          {GEN_IMAGE_TEXT.metaSep}
          {data.aspectRatio || GEN_IMAGE_TEXT.metaDefaultRatio}
          {versions.length > 0 ? GEN_IMAGE_TEXT.metaOutput(versions.length) : ''}
        </div>
      </NodeShell>
      {/* `gv-hist-pop`（原 288-314）：历史版本弹层（portal 到 body，按按钮位置定位） */}
      {histOpen && versions.length > 0
        ? createPortal(
            <div
              ref={histPopRef}
              className={styles.gvHistPop}
              style={histPos ?? undefined}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
            >
              <div className={styles.gvHistTitle}>{GEN_IMAGE_TEXT.histTitle(versions.length)}</div>
              {versions.map((item, i) => {
                const view = imageVersionView(item, current ?? null);
                return (
                  <button
                    type="button"
                    key={view.dataUrl || i}
                    className={`${styles.gvHistItem}${view.selected ? ` ${styles.gvHistItemSel}` : ''}`}
                    title={GEN_IMAGE_TEXT.histItemTitle(i + 1)}
                    onClick={(e) => {
                      e.stopPropagation();
                      selectVersion(view.dataUrl);
                    }}
                  >
                    <img
                      className={styles.gvHistThumb}
                      src={withThumb(view.dataUrl, GEN_IMAGE_TEXT.histThumbWidth)}
                      alt=""
                    />
                    <span className={styles.gvHistMeta}>
                      {/*
                        ⚠️ 源这里是 `{S(V.ts)}` —— `S` **不在 `ZL.jsx` 的 import 表**（是全局别名，
                        抽取器也标了 TODO）⇒ 本仓按既有的 `l0` = `formatDateTimeMinute`（`YYYY-MM-DD HH:mm`）取。
                        ⚠️ **该映射未确证同一函数**（未登记债）。
                      */}
                      <span className={styles.gvHistRow}>{`#${i + 1} · ${formatDateTimeMinute(view.ts)} · ${view.account}`}</span>
                      <span className={styles.gvHistRow}>{view.ratio}</span>
                      <span className={styles.gvHistPrompt}>{view.prompt}</span>
                    </span>
                  </button>
                );
              })}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
