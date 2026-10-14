/**
 * 无水印资源面板（原 `SD.jsx`）—— 数据源 = **CDP 捕获列表**（`ui.dolaMediaItems`）
 *
 * ★ **信息源必须对源**：源 `SD` 的 `items` 是**瞬态捕获列表**（`_Component43.jsx:128` 的 `ce`；
 *   每次推送 `oe(ve.items)` **整体替换**），**不是** `videoShares`（后者是**持久化分享记录**，
 *   源里只用于检测播种 `_Component43.jsx:531`）⇒ 本面板与它的计数徽标都读捕获列表，展示「图 + 视频」。
 * ★ **4 个宿主能力逐字对源**（`SD.jsx`，经唯一入口 `state/hostOps` → `ports.host.media`）：
 *   · 「下载到：」+「更改」→ `getDownloadSettings` / `pickDownloadPath`（`SD.jsx:22/43-60`）
 *   · 「清空」            → `clearDolaMedia`（`SD.jsx:78-88`；清空后后端推空列表 ⇒ 面板自动变空）
 *   · 「下载」            → `downloadDolaMedia(url, type)`（`SD.jsx:127-155`；走设置目录 + 自动命名）
 *   · 「原链接」          → `openExternal`（`SD.jsx:115-122`）
 *   ⚠️ 一处如实差异：源用 `alert` 报下载结果，本仓统一走 `pushToast`。
 */

import { useEffect, useState } from 'react';
import { useHostOps, useStore } from '@/state';
import { COMMON_TEXT, WATERMARK_PANEL_TEXT } from '@/constants/text';
import type { DolaMediaItem } from '@/core/ports/host.port';
import styles from './WatermarkPanel.module.css';
import shared from '@/ui/common/shared.module.css';
import { PanelShell } from '@/ui/common/PanelShell';

export interface WatermarkPanelProps {
  onClose: () => void;
}

/** 每条的稳定 key（捕获项无 `id` ⇒ 用 类型 + url） */
const keyOf = (item: DolaMediaItem): string => `${item.type}:${item.url}`;

export function WatermarkPanel({ onClose }: WatermarkPanelProps) {
  const items = useStore((s) => s.dolaMediaItems);
  const pushToast = useStore((s) => s.pushToast);
  const hostOps = useHostOps();

  const [downloading, setDownloading] = useState<string | null>(null);
  /** 下载设置（`null` = 还没读到）；`configured === false` ⇒ 显示「系统默认」标 */
  const [settings, setSettings] = useState<{ path?: string; configured?: boolean } | null>(null);
  const [picking, setPicking] = useState(false);

  const images = items.filter((it) => it.type === 'image');
  const videos = items.filter((it) => it.type !== 'image');

  // ① 开面板读一次下载设置（原 `SD.jsx` 的 `useEffect(…, [open])` —— 本仓面板即开即挂 ⇒ 等价）
  useEffect(() => {
    let alive = true;
    void (async () => {
      const r = await hostOps.getDolaMediaDownloadSettings();
      if (!alive) return;
      if (r.ok) setSettings(r.value);
      else pushToast(r.message || COMMON_TEXT.unknownReason, 5000, 'warn');
    })();
    return () => {
      alive = false;
    };
  }, [hostOps, pushToast]);

  // ② 「更改」下载目录（原 `SD.jsx:43-60`）
  const changePath = async () => {
    setPicking(true);
    const r = await hostOps.pickDolaMediaDownloadPath();
    setPicking(false);
    if (!r.ok) {
      pushToast(r.message || COMMON_TEXT.unknownReason, 5000, 'warn');
      return;
    }
    // ⚠️ 取消是**如实结果**（用户主动关掉对话框）⇒ 静默返回，不报错（同 `pickStorage`）
    if (r.value.canceled) return;
    setSettings({ path: r.value.path, configured: r.value.configured });
  };

  // ③ 「清空」（原 `SD.jsx:78-88`）—— 后端清空后会推一次空列表 ⇒ `dolaMediaItems` 自动变空
  const clearAll = async () => {
    const r = await hostOps.clearDolaMedia();
    if (!r.ok) pushToast(r.message || COMMON_TEXT.unknownReason, 5000, 'warn');
  };

  // ④ 「下载」一条（原 `SD.jsx:127-155`）
  const download = async (item: DolaMediaItem) => {
    if (!item.url) return;
    setDownloading(keyOf(item));
    const r = await hostOps.downloadDolaMedia(item.url, item.type);
    setDownloading(null);
    if (!r.ok) {
      pushToast(COMMON_TEXT.downloadFailed(r.message || COMMON_TEXT.unknownReason), 5000, 'warn');
      return;
    }
    pushToast(COMMON_TEXT.downloadedTo(r.value.path || item.url), 5000, 'success');
  };

  return (
    <PanelShell
      className={styles.panel}
      bodyClassName={styles.body}
      title={WATERMARK_PANEL_TEXT.title}
      meta={WATERMARK_PANEL_TEXT.count(images.length, videos.length)}
      actions={
        <button
          type="button"
          className={`${shared.btn} ${shared.btnGhost} ${shared.btnSm}`}
          onClick={() => void clearAll()}
        >
          {WATERMARK_PANEL_TEXT.clear}
        </button>
      }
      onClose={onClose}
    >
      {/* 「下载到：」+「更改」（原 `SD.jsx:94-103` 的非停靠版）*/}
      <div className={styles.pathRow}>
        <span className={styles.pathLabel}>{WATERMARK_PANEL_TEXT.downloadTo}</span>
        <span className={styles.pathText} title={settings?.path ?? ''}>
          {settings?.path ?? ''}
        </span>
        {settings && settings.configured === false ? (
          <span className={styles.pathTag}>{WATERMARK_PANEL_TEXT.defaultDirTag}</span>
        ) : null}
        <button
          type="button"
          className={`${shared.btn} ${shared.btnGhost} ${shared.btnSm}`}
          disabled={picking}
          onClick={() => void changePath()}
        >
          {picking ? WATERMARK_PANEL_TEXT.changingPath : WATERMARK_PANEL_TEXT.changePath}
        </button>
      </div>

      {items.length === 0 ? (
        <div className={shared.empty}>{WATERMARK_PANEL_TEXT.empty}</div>
      ) : (
        items.map((item) => (
          <div className={styles.item} key={keyOf(item)}>
            <div className={styles.thumbWrap}>
              {item.type === 'image' ? (
                <img className={styles.thumb} src={item.url} alt="" loading="lazy" />
              ) : (
                <video className={styles.thumb} src={item.url} preload="metadata" controls />
              )}
            </div>
            <div className={styles.meta}>
              <span className={styles.type}>
                {item.type === 'image' ? WATERMARK_PANEL_TEXT.typeImage : WATERMARK_PANEL_TEXT.typeVideo}
              </span>
              <a
                className={styles.link}
                href={item.url}
                onClick={(e) => {
                  e.preventDefault();
                  void hostOps.openExternal(item.url);
                }}
              >
                {WATERMARK_PANEL_TEXT.openLink}
              </a>
            </div>
            <div className={styles.itemActions}>
              <button
                type="button"
                className={`${shared.btn} ${shared.btnPrimary} ${shared.btnSm}`}
                disabled={downloading === keyOf(item)}
                onClick={() => void download(item)}
              >
                {downloading === keyOf(item)
                  ? WATERMARK_PANEL_TEXT.downloading
                  : WATERMARK_PANEL_TEXT.download}
              </button>
            </div>
          </div>
        ))
      )}
    </PanelShell>
  );
}
