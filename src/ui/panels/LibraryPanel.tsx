/**
 * 资源库面板（右栏）—— 原 `.side` 右栏 + `.lib-*`
 * 依据：docs/03-人类版.md §3（素材与媒体）+ §8（文案）
 *
 * ⚠️ 原则 1：本组件**不直接写 store**，只调 state 暴露的 action
 * ⚠️ 图片一律走 `<Thumb>`（`?w=`），不加载原图（docs/10 #7）
 * ⚠️ 拖拽 MIME = `DRAG_MIME_MATERIAL`（与原实现一致，画布 `onDrop` 认它）
 */

import { useState } from 'react';
import { useHostOps, useStore } from '@/state';
import { Thumb } from '@/ui/common/Thumb';
import { EmptyState } from '@/ui/common/EmptyState';
import { LIBRARY_TEXT } from '@/constants/text';
import { DRAG_MIME_MATERIAL } from '@/constants';
import { makeLibraryId } from '@/core/rules/project';
import styles from './LibraryPanel.module.css';

export function LibraryPanel() {
  const library = useStore((s) => s.library);
  const setLibrary = useStore((s) => s.setLibrary);
  const commit = useStore((s) => s.commit);
  const pushToast = useStore((s) => s.pushToast);
  const pushBackendError = useStore((s) => s.pushBackendError);
  const hostOps = useHostOps();
  const [busy, setBusy] = useState(false);

  /** 从文件添加（走 `hostOps.importFiles`） */
  const addFromFile = async (): Promise<void> => {
    setBusy(true);
    try {
      const res = await hostOps.importFiles();
      if (!res.ok) {
        // ★ 原则 6：原始 message 原样上报，不改写
        // ⚠️ kind 归 'unknown' 的原因同 TopBar：两套分类域不互通，`res.reason` 无法转发（TD-16-68）
        pushBackendError('unknown', res.message);
        return;
      }
      const picked = res.value.filter((f) => f.dataUrl);
      if (picked.length === 0) return;
      commit('library');
      // ⚠️ id 形状与 `canvas.addMaterialsBatch` **共用一处**（`makeLibraryId`，判据 C1）
      const now = Date.now();
      setLibrary([
        ...library,
        ...picked.map((f, i) => ({
          id: makeLibraryId(now, i),
          favorite: false,
          name: f.name,
          dataUrl: f.dataUrl as string,
        })),
      ]);
    } finally {
      setBusy(false);
    }
  };

  const toggleFavorite = (id: string): void => {
    commit('library');
    setLibrary(library.map((it) => (it.id === id ? { ...it, favorite: !it.favorite } : it)));
  };

  const remove = (id: string): void => {
    commit('library');
    setLibrary(library.filter((it) => it.id !== id));
  };

  if (library.length === 0) {
    return (
      <div className={styles.column}>
        <div className={styles.head}>
          <span>资源库</span>
          <button type="button" className={styles.headBtn} onClick={() => void addFromFile()} disabled={busy}>
            从文件选择
          </button>
        </div>
        <EmptyState title={LIBRARY_TEXT.empty} />
      </div>
    );
  }

  return (
    <div className={styles.column}>
      <div className={styles.head}>
        <span>资源库（{library.length}）</span>
        <button type="button" className={styles.headBtn} onClick={() => void addFromFile()} disabled={busy}>
          从文件选择
        </button>
      </div>

      <div className={styles.grid}>
        {library.map((it) => (
          <div
            key={it.id}
            className={styles.item}
            title={it.name}
            draggable
            onDragStart={(e) => {
              // ★ 与原实现一致的 MIME（画布 onDrop 靠它识别素材）
              e.dataTransfer.setData(DRAG_MIME_MATERIAL, it.id);
              e.dataTransfer.effectAllowed = 'copy';
            }}
            onDoubleClick={() => pushToast(LIBRARY_TEXT.alreadyOnCanvas(it.name))}
          >
            <Thumb src={it.dataUrl} alt={it.name} width={160} className={styles.thumb} />
            <div className={styles.actions}>
              <button
                type="button"
                className={styles.actionBtn}
                aria-label={it.favorite ? '取消收藏' : '收藏'}
                onClick={() => toggleFavorite(it.id)}
              >
                {it.favorite ? '★' : '☆'}
              </button>
              <button
                type="button"
                className={styles.actionBtn}
                aria-label="删除"
                onClick={() => remove(it.id)}
              >
                ✕
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
