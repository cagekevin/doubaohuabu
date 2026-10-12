/**
 * 资源库面板（右栏）—— 原 `.side` 右栏 + `.lib-*`（`RT.jsx`，354 行）
 *
 * 依据：docs/03-人类版.md §3（素材与媒体）+ §8（文案）
 *
 * **本轮（2026-10-12）补的两件**（原 `RT.jsx` 有、本仓此前没有的）：
 *   · **双击重命名**（原 `M`/`U`，`RT.jsx:242-251`/`:301-314`）—— 走 `renameLibrary`
 *     （库条目 + 所有同源素材节点一起改）
 *   · **右键「替换素材」**（原 `O`，`RT.jsx:133-154`/`:342-352`）—— 走 `replaceLibrary`
 *     （换**库条目自身的图** + 同步所有引用节点）
 *
 * ⚠️ 原则 1：本组件**不直接写 store**，只调 state 暴露的 action
 * ⚠️ 图片一律走 `<Thumb>`（`?w=`），不加载原图（docs/10 #7）
 * ⚠️ 拖拽 MIME = `DRAG_MIME_MATERIAL`（与原实现一致，画布 `onDrop` 认它）
 * ⚠️ 与「更换素材」（节点右键菜单那个）**不是同一件事** —— 见 `constants/text.ts` 的 `LIBRARY_TEXT.libReplace` 注
 */

import { useState } from 'react';
import { useHostOps, useStore } from '@/state';
import { Thumb } from '@/ui/common/Thumb';
import { ContextMenu, type MenuItem } from '@/ui/common/ContextMenu';
import { EmptyState } from '@/ui/common/EmptyState';
import { LIBRARY_TEXT } from '@/constants/text';
import { DRAG_MIME_MATERIAL } from '@/constants';
import { makeLibraryId } from '@/core/rules/project';
import styles from './LibraryPanel.module.css';

/** 右键菜单的锚点（原 `x`，`RT.jsx:43`）—— 屏幕坐标 + 条目 id */
interface LibMenuAnchor {
  id: string;
  x: number;
  y: number;
}

export function LibraryPanel() {
  const library = useStore((s) => s.library);
  const setLibrary = useStore((s) => s.setLibrary);
  const commit = useStore((s) => s.commit);
  const renameLibrary = useStore((s) => s.renameLibrary);
  const replaceLibrary = useStore((s) => s.replaceLibrary);
  const pushToast = useStore((s) => s.pushToast);
  const pushBackendError = useStore((s) => s.pushBackendError);
  const hostOps = useHostOps();
  const [busy, setBusy] = useState(false);

  /** 正在改名的条目 id + 输入框值（原 `f`/`h`，`RT.jsx:39-40`） */
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  /** 右键菜单锚点（原 `x`）—— `null` = 关 */
  const [menu, setMenu] = useState<LibMenuAnchor | null>(null);

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

  // ── 双击重命名（原 `M`/`U`）──────────────────────────────────────────────
  const startRename = (it: { id: string; name: string }): void => {
    setRenamingId(it.id);
    setRenameDraft(it.name);
  };

  /** 提交改名（原 `U`，`RT.jsx:246-251`：空 ⇒ 兜底「未命名」） */
  const commitRename = (): void => {
    if (renamingId) renameLibrary(renamingId, renameDraft.trim() || LIBRARY_TEXT.libUnnamed);
    setRenamingId(null);
  };

  // ── 右键菜单（原 `RT.jsx:292-298` + `:336-353`）─────────────────────────
  // ★ 开合走**共享件** `ui/common/ContextMenu`（点外部 + Esc + 键盘导航它都有，
  //   原版 `RT.jsx:158-180` 那组 window 监听正是它要收的口 —— 不另写第三份）
  const menuItems: MenuItem[] = menu
    ? [
        {
          key: 'replace',
          label: LIBRARY_TEXT.libReplace,
          onSelect: () => void replaceItemImage(menu.id),
        },
      ]
    : [];

  /**
   * 右键「替换素材」（原 `O`，`RT.jsx:133-154`）—— 从文件选一张，换**库条目自身的图**
   *
   * 源逐行：`importFiles()` → 取第一张 → **量实测宽高**（`z`，`RT.jsx:115-132`）→
   * `replaceLibrary(id, {dataUrl, w, h})` → `!ok` ⇒ `alert('替换素材失败：' + …)`。
   * ⚠️ 本仓两处偏离（都留痕）：**(a)** 不量宽高（`replaceLibrary` 内部走 `persistImage`，
   *    主进程 `import-files` 已给 `img://`；实测宽高要再读一次图 ⇒ 不为一个展示字段多读一次盘）；
   *    **(b)** 失败不用 `alert`（阻塞式、且属后端错误文案域）⇒ toast（原则 6）。
   */
  const replaceItemImage = async (id: string): Promise<void> => {
    setMenu(null);
    setBusy(true);
    try {
      const res = await hostOps.importFiles();
      if (!res.ok) {
        pushBackendError('unknown', res.message);
        return;
      }
      const first = res.value.find((f) => f.dataUrl);
      if (!first) return;
      const replaced = replaceLibrary(id, { dataUrl: first.dataUrl as string });
      if (replaced === null) pushToast(LIBRARY_TEXT.libReplaceFailed, undefined, 'warn');
    } finally {
      setBusy(false);
    }
  };

  if (library.length === 0) {
    return (
      <div className={styles.column}>
        <div className={styles.head}>
          <span>{LIBRARY_TEXT.title}</span>
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
            onDoubleClick={() => startRename(it)}
            onContextMenu={(e) => {
              // 源 `RT.jsx:292-298`：preventDefault + 记锚点
              e.preventDefault();
              setMenu({ id: it.id, x: e.clientX, y: e.clientY });
            }}
          >
            <Thumb src={it.dataUrl} alt={it.name} width={160} className={styles.thumb} />
            {renamingId === it.id ? (
              <input
                className={styles.renameInput}
                value={renameDraft}
                autoFocus
                onChange={(e) => setRenameDraft(e.target.value)}
                onBlur={commitRename}
                onMouseDown={(e) => e.stopPropagation()}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitRename();
                  else if (e.key === 'Escape') setRenamingId(null);
                }}
              />
            ) : (
              <div className={styles.name} title={LIBRARY_TEXT.libRenameHint}>
                {it.name}
              </div>
            )}
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

      {/* ★ 右键菜单（原 `RT.jsx:336-353` 的 `node-ctx-menu`）—— 只有一项「替换素材」。
          开合（点外部 / Esc / 键盘导航）全部走共享件 `ui/common/ContextMenu`。 */}
      {menu && <ContextMenu x={menu.x} y={menu.y} items={menuItems} onClose={() => setMenu(null)} />}
    </div>
  );
}
