/**
 * 资源库面板（右栏）—— 原 `RT.jsx`（354 行）
 *
 * 依据：`docs/过程.md` §3（素材与媒体）+ §8（文案）
 *
 * ── 骨架（**逐行对源** `RT.jsx:252-335`）──
 *   `.library-panel`
 *     → `.library-head`（标题「资源库」＋「＋ 添加」）
 *     → `.library-list`（**卡片网格**：缩略图（悬浮 ☆）+ 卡片脚（名字 · ✕）；空态「拖入图片 / 或点击「添加」」；
 *        整块可接**外部拖入的图片文件**）
 *     → `.library-tip`（有素材时：`拖拽素材到画布生成节点 · 长按拖入后台页面 · 列表内拖动调整顺序`）
 *
 * ── 本轮补的两件（原 `RT.jsx` 有、本仓此前没有的）──
 *   · **双击重命名**（原 `M`/`U`，`RT.jsx:242-251`/`:301-314`）—— 走 `renameLibrary`
 *     （库条目 + 所有同源素材节点一起改）
 *   · **右键「替换素材」**（原 `O`，`RT.jsx:133-154`/`:342-352`）—— 走 `replaceLibrary`
 *     （换**库条目自身的图** + 同步所有引用节点）
 *
 * ⚠️ 原则 1：本组件**不直接写 store**，只调 state 暴露的 action
 * ⚠️ 图片一律走 `<Thumb>`（`?w=`），不加载原图（`docs/过程.md` #7）
 * ⚠️ 拖拽 MIME = `DRAG_MIME_MATERIAL`（与原实现一致，画布 `onDrop` 认它）
 * ⚠️ 与「更换素材」（节点右键菜单那个）**不是同一件事** —— 见 `constants/text.ts` 的 `LIBRARY_TEXT.libReplace` 注
 */

import { useMemo, useState, type DragEvent } from 'react';
import { useHostOps, useStore } from '@/state';
import { Thumb } from '@/ui/common/Thumb';
import { ContextMenu, type MenuItem } from '@/ui/common/ContextMenu';
import { useEscapeKey } from '@/ui/common/useEscapeKey';
import { LIBRARY_TEXT } from '@/constants/text';
import { DRAG_MIME_MATERIAL } from '@/constants';
import { makeLibraryId } from '@/core/rules/project';
import { countLibRefs, sortLibrary } from '@/core/rules/libraryEdit';
import { readImageFile } from '@/lib/readDroppedFile';
import { dragLeftContainer } from '@/lib/dragHover';
import type { LibraryItem } from '@/stable/model/project';
import { Icon } from '@/ui/common/Icon';
import styles from './LibraryPanel.module.css';

/** 右键菜单的锚点（原 `x`，`RT.jsx:43`）—— 屏幕坐标 + 条目 id */
interface LibMenuAnchor {
  id: string;
  x: number;
  y: number;
}

export function LibraryPanel() {
  const library = useStore((s) => s.library);
  const nodes = useStore((s) => s.nodes);
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
  /** 有文件拖到列表上方（原 `u`，`RT.jsx:38`） */
  const [dragOver, setDragOver] = useState(false);

  /** 展示顺序：**收藏在前**（原 `c`，`RT.jsx:29-37`） */
  const ordered = useMemo(() => sortLibrary(library), [library]);

  /** 从文件添加（原 `R`，`RT.jsx:256` 的「＋ 添加」） */
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

  /**
   * 把**外部拖进来的图片文件**加进资源库（原 `F`，`RT.jsx:219-241`）
   *
   * 源逐行：`preventDefault` → 只留 `type` 以 `image/` 开头的 → 逐个 `Pu(file)`（读成
   *   `{name, dataUrl, natW, natH}`）→ 建库条目（`favorite:false`）。
   */
  const onDropFiles = async (e: DragEvent<HTMLDivElement>): Promise<void> => {
    e.preventDefault();
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files || []).filter((f) =>
      (f.type || '').startsWith('image/'),
    );
    if (files.length === 0) return;
    setBusy(true);
    try {
      const now = Date.now();
      const added: LibraryItem[] = [];
      let i = 0;
      for (const file of files) {
        const img = await readImageFile(file);
        added.push({
          id: makeLibraryId(now, i),
          favorite: false,
          name: img.name,
          dataUrl: img.dataUrl,
          w: img.natW,
          h: img.natH,
        });
        i += 1;
      }
      commit('library');
      setLibrary([...library, ...added]);
    } finally {
      setBusy(false);
    }
  };

  const toggleFavorite = (id: string): void => {
    commit('library');
    setLibrary(library.map((it) => (it.id === id ? { ...it, favorite: !it.favorite } : it)));
  };

  /**
   * 删除条目（原 `RT.jsx:321-329`）
   * ⚠️ **仍有引用时先确认**（源 `l ? l(_.id) : 0` → `confirm(...)`）—— 删了会让那些节点的图失效。
   */
  const remove = (id: string, name: string): void => {
    const refs = countLibRefs(library, nodes, id);
    if (refs > 0 && !window.confirm(LIBRARY_TEXT.deleteConfirm(name, refs))) return;
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

  /**
   * 就地改名的 `Esc` ⇒ 只退出编辑态、不落值。
   * ⚠️ 走 `ui/common/useEscapeKey`（元素级）：**Escape 处理只许住 `ui/common/`**
   *   —— 此前这里是就地手写的一份 `else if (e.key === 'Escape')`。
   */
  const onEscapeRename = useEscapeKey(renamingId !== null, () => setRenamingId(null));

  // ── 右键菜单（原 `RT.jsx:292-298` + `:336-353`）─────────────────────────
  // ★ 开合走**共享件** `ui/common/ContextMenu`（点外部 + Esc + 键盘导航它都有，
  //   原版 `RT.jsx:158-180` 那组 window 监听正是它要收的口 —— 不另写第三份）
  const menuItems: MenuItem[] = menu
    ? [
        {
          key: 'replace',
          label: LIBRARY_TEXT.libReplace,
          /* ★ 真值 = 设计稿 `index.html:934`（`#i-swap` + 「替换素材」）—— 与 `B05` 的
             「菜单三处 DOM 同构」同一口径：菜单项必挂图标槽。 */
          icon: 'swap',
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

  return (
    <div className={styles.column}>
      <div className={styles.head}>
        <span className={styles.title}>{LIBRARY_TEXT.title}</span>
        <button type="button" className={styles.addBtn} onClick={() => void addFromFile()} disabled={busy}>
          {/* ★ §7-D11：加号由**图标**承担（原来它是 `LIBRARY_TEXT.add` 里的全角字符 `＋`）*/}
          <Icon name="plus" />
          {LIBRARY_TEXT.add}
        </button>
      </div>

      {/* 列表容器（原 `.library-list`）—— 整块是**外部图片文件的落点** */}
      <div
        className={`${styles.list}${dragOver ? ` ${styles.dragOver}` : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'copy';
          setDragOver(true);
        }}
        // 判据 = `lib/dragHover.dragLeftContainer`（全仓唯一；理由与"为什么偏离源"在该文件头注）
        onDragLeave={(e) => {
          if (dragLeftContainer(e)) setDragOver(false);
        }}
        onDrop={(e) => void onDropFiles(e)}
      >
        {/* 空态 —— 真值 = 设计稿 `.empty.isInline`（横排一行；次句是旁注档 `.mk-cell-hint`） */}
        {ordered.length === 0 && (
          <div className={styles.dropHint}>
            <span>{LIBRARY_TEXT.dropHint}</span>
            <span className={styles.dropHintSub}>{LIBRARY_TEXT.dropHintSub}</span>
          </div>
        )}

        {ordered.map((it) => (
          <div
            key={it.id}
            className={styles.card}
            draggable
            onDragStart={(e) => {
              // ★ 与原实现一致的 MIME（画布 onDrop 靠它识别素材）
              e.dataTransfer.setData(DRAG_MIME_MATERIAL, it.id);
              e.dataTransfer.effectAllowed = 'copy';
            }}
            onContextMenu={(e) => {
              // 源 `RT.jsx:292-298`：preventDefault + 记锚点
              e.preventDefault();
              setMenu({ id: it.id, x: e.clientX, y: e.clientY });
            }}
          >
            {/* 缩略图壳 —— 设计稿：收藏钮**压在图上**（悬停或已收藏才显形）*/}
            <div className={styles.thumb}>
              <Thumb src={it.dataUrl} alt={it.name} width={240} className={styles.thumbImg} />
              <button
                type="button"
                className={`${styles.fav}${it.favorite ? ` ${styles.favOn}` : ''}`}
                title={it.favorite ? LIBRARY_TEXT.unfavorite : LIBRARY_TEXT.favorite}
                onClick={() => toggleFavorite(it.id)}
              >
                <Icon name="star" />
              </button>
            </div>

            {/* 卡片脚：名字（双击改名）＋ 删除钮 */}
            <div className={styles.foot}>
              {renamingId === it.id ? (
                <input
                  className={styles.renameInput}
                  value={renameDraft}
                  autoFocus
                  onChange={(e) => setRenameDraft(e.target.value)}
                  onBlur={commitRename}
                  onMouseDown={(e) => e.stopPropagation()}
                  onKeyDown={(e) => {
                    // `Esc` 归 `ui/common/useEscapeKey`（Escape 处理只许住 `ui/common/`）
                    if (e.key === 'Enter') commitRename();
                    else onEscapeRename(e);
                  }}
                />
              ) : (
                <div className={styles.name} title={LIBRARY_TEXT.libRenameHint} onDoubleClick={() => startRename(it)}>
                  {it.name}
                </div>
              )}
              <button
                type="button"
                className={styles.del}
                title={LIBRARY_TEXT.deleteAria}
                aria-label={LIBRARY_TEXT.deleteAria}
                onClick={() => remove(it.id, it.name)}
              >
                <Icon name="trash" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* 底部提示（原 `RT.jsx:333-335`）—— 有素材才显示 */}
      {ordered.length > 0 && <div className={styles.tip}>{LIBRARY_TEXT.tip}</div>}

      {/* ★ 右键菜单（原 `RT.jsx:336-353` 的 `node-ctx-menu`）—— 只有一项「替换素材」。
          开合（点外部 / Esc / 键盘导航）全部走共享件 `ui/common/ContextMenu`。 */}
      {menu && <ContextMenu x={menu.x} y={menu.y} items={menuItems} onClose={() => setMenu(null)} />}
    </div>
  );
}
