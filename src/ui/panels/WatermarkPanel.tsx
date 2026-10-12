/**
 * 无水印资源面板（原 `SD.jsx` 160 行）—— ★ **2026-10-12 落（`docs/过程.md` §10 的 ⛔ 阻塞）**
 *
 * ⚠️ **范围如实标注**：源 `SD` 展示「图 + 视频」两类（图来自 `onDolaMedia` 后端推送，未落），
 *   本仓 `VideoShare` **只有视频**（`url`/`vid`/`poster`）⇒ **只展示视频**，不假装有图。
 * ⚠️ **宿主方法简化**：源用 `getDownloadSettings`/`pickDownloadPath`/`downloadDolaMedia`/
 *   `clearDolaMedia`（专用宿主方法，未进 `HostPort`）⇒ 本仓**下载走 `hostOps.downloadFile`**
 *   （通用下载）、清空走 `removeVideoShare`（store）—— 不为此扩展 4 个宿主方法。
 */

import { useState } from 'react';
import { useHostOps, useStore } from '@/state';
import { COMMON_TEXT, WATERMARK_PANEL_TEXT } from '@/constants/text';
import type { VideoShare } from '@/stable/model/project';
import styles from './WatermarkPanel.module.css';
import shared from '@/ui/common/shared.module.css';
import { PanelShell } from '@/ui/common/PanelShell';

export interface WatermarkPanelProps {
  onClose: () => void;
}

export function WatermarkPanel({ onClose }: WatermarkPanelProps) {
  const videoShares = useStore((s) => s.videoShares);
  const removeVideoShare = useStore((s) => s.removeVideoShare);
  const pushToast = useStore((s) => s.pushToast);
  const hostOps = useHostOps();
  const [downloading, setDownloading] = useState<string | null>(null);

  const download = async (item: VideoShare) => {
    if (!item.url) return;
    setDownloading(item.id);
    const r = await hostOps.downloadFile(item.url, item.vid || WATERMARK_PANEL_TEXT.typeVideo);
    setDownloading(null);
    if (!r.ok) {
      pushToast(COMMON_TEXT.downloadFailed(r.message || COMMON_TEXT.unknownReason), 5000, 'warn');
      return;
    }
    pushToast(COMMON_TEXT.downloadedTo(r.value.path || item.vid || ''), 5000, 'success');
  };

  return (
    <PanelShell
      className={styles.panel}
      bodyClassName={styles.body}
      title={WATERMARK_PANEL_TEXT.title}
      meta={WATERMARK_PANEL_TEXT.count(videoShares.length)}
      onClose={onClose}
    >
        {videoShares.length === 0 ? (
          <div className={shared.empty}>{WATERMARK_PANEL_TEXT.empty}</div>
        ) : (
          videoShares.map((item) => (
            <div className={styles.item} key={item.id}>
              <div className={styles.thumbWrap}>
                {item.poster ? (
                  <img className={styles.thumb} src={item.poster} alt="" loading="lazy" />
                ) : (
                  <div className={styles.noPoster}>▶</div>
                )}
              </div>
              <div className={styles.meta}>
                <span className={styles.type}>{WATERMARK_PANEL_TEXT.typeVideo}</span>
                {item.accountName ? <span className={styles.account}>{item.accountName}</span> : null}
                {item.url ? (
                  <a
                    className={styles.link}
                    href={item.url}
                    onClick={(e) => {
                      e.preventDefault();
                      void hostOps.openExternal(item.url!);
                    }}
                  >
                    {WATERMARK_PANEL_TEXT.openLink}
                  </a>
                ) : null}
              </div>
              <div className={styles.itemActions}>
                <button
                  type="button"
                  className={styles.downloadBtn}
                  disabled={downloading === item.id}
                  onClick={() => void download(item)}
                >
                  {downloading === item.id ? WATERMARK_PANEL_TEXT.downloading : WATERMARK_PANEL_TEXT.download}
                </button>
                <button type="button" className={styles.removeBtn} onClick={() => removeVideoShare(item.id)}>
                  {WATERMARK_PANEL_TEXT.remove}
                </button>
              </div>
            </div>
          ))
        )}
    </PanelShell>
  );
}
