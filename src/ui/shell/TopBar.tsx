/**
 * 画布顶栏（原 `.canvas-topbar`，`_Component42.jsx:1563-1609`）
 *
 * ★ **它不是全宽顶栏** —— 它是**浮在画布上方的居中条**（`position: absolute; top: 12px; left: 50%`），
 *   内容只有四件：**项目名 · 保存路径 · 授权 · 豆包后台**（`docs/mockup/README.md` §3.2）。
 *   样式真值 = `docs/mockup/assets/mockup.css:1892-1925`（`.canvas-topbar` 一族）。
 *
 * ⚠️ **2026-10-12 收口**：此前它是一条**全宽条**（占布局高度），且带两样源里没有的东西 ——
 *   「N 个节点」计数与「导出工程」按钮（回源 `_Component42` / `_Component47` **均 0 命中**）⇒ 已删。
 * ⚠️ 项目名**双击**重命名（原 `1575` 的 `onDoubleClick`），不是单击。
 *
 * ★ **2026-10-11 补「项目保存路径」区**：设置保存路径 / 打开保存目录 / 占用空间统计
 *   —— 接 `core/usecases/projectStorage`（此前 0 消费）。
 *
 * ⚠️ 原则 1：不直接写 store，只调 action
 * ⚠️ 宿主调用走控制器（`useHostOps` / `useProjectOps`）—— `ui` 不得直持 `Ports`（TD-16-8）。
 * ⚠️ **effect 里不做同步 `setState`**（`react-hooks/set-state-in-effect`）—— 占用统计只经 `.then` 回写。
 */

import { useEffect, useRef, useState } from 'react';
import { useProjectOps, useStore } from '@/state';
import { BACKEND_VIEW_TEXT, PROJECT_STORAGE_TEXT, PROJECT_TEXT } from '@/constants/text';
import { formatStorageSize } from '@/core/rules/storageSize';
import { toMessage } from '@/core/model/result';
import type { StorageUsage } from '@/core/ports';
import styles from './AppShell.module.css';

/** 占用统计的轮询间隔（原 `_Component42.jsx:279` 的 `30000`） */
const STORAGE_POLL_MS = 30000;

export interface TopBarProps {
  /**
   * 「豆包后台」入口被点（原 `_Component42.jsx:1606` 的 `onClick={tt}`）
   * ⚠️ 由**宿主**（`AppShell`）实现：源 `tt` 要"先补齐当前账号再打开视图"，
   *   而显隐是宿主的本地态 ⇒ 回调留在宿主（源也是这样把 `onOpenDoubaoView` 传进画布的）。
   */
  onOpenDoubaoView: () => void;
}

export function TopBar({ onOpenDoubaoView }: TopBarProps) {
  const project = useStore((s) => s.projects.find((p) => p.id === s.activeId) ?? null);
  const renameProject = useStore((s) => s.renameProject);
  const pushToast = useStore((s) => s.pushToast);
  const projectOps = useProjectOps();

  const storagePath = project?.storagePath ?? '';
  /** 正在选路径（原 `je`）—— 按钮禁用 + 标签「正在选择…」 */
  const [picking, setPicking] = useState(false);
  /**
   * 占用统计结果 —— **带上它属于哪个路径**：
   * `usage.path !== storagePath` 表示「当前路径还没取到」（= 原版的 `wt` 统计中）。
   * ★ 这样**不需要额外的"统计中"布尔**（也就避免了在 effect 体里同步 setState）。
   */
  const [usage, setUsage] = useState<{ path: string; value: StorageUsage | null } | null>(null);
  /** 代次闸（原 `_t`）：路径切换后**晚到的旧结果丢弃** */
  const genRef = useRef(0);

  // 占用统计：路径一变就统计一次，之后每 30s 刷新（原 239-283；**只经 `.then` 回写**）
  useEffect(() => {
    if (!storagePath) return;
    const gen = ++genRef.current;
    const fetchUsage = (): void => {
      void projectOps.storageUsage(storagePath).then((u) => {
        if (genRef.current !== gen) return; // 旧路径的结果——丢
        setUsage({ path: storagePath, value: u });
      });
    };
    fetchUsage();
    const timer = window.setInterval(fetchUsage, STORAGE_POLL_MS);
    return () => {
      genRef.current += 1;
      window.clearInterval(timer);
    };
  }, [storagePath, projectOps]);

  /** 选择/更改保存路径（原 `zt`）—— 失败已由控制器 toast；这里只兜「调用本身抛出」（TD-16-53 的教训） */
  const onPickStorage = async (): Promise<void> => {
    if (!project || picking) return;
    setPicking(true);
    try {
      await projectOps.pickStorage();
    } catch (e) {
      pushToast(toMessage(e), 5000, 'error');
    } finally {
      setPicking(false);
    }
  };

  /** 双击重命名项目（原 `1575` 的 `onDoubleClick`） */
  const onRename = (): void => {
    if (!project) return;
    const next = window.prompt(PROJECT_TEXT.renameHint, project.name);
    if (next === null) return;
    renameProject(project.id, next);
  };

  /** 当前路径的占用还没取到（= 原版 `wt` 统计中；首次 & 切路径后为真） */
  const usagePending = !!storagePath && usage?.path !== storagePath;
  const value = usage?.path === storagePath ? usage.value : null;

  /** 按钮文案（原 1595 的四路三目） */
  const storageLabel = picking
    ? PROJECT_STORAGE_TEXT.storagePicking
    : !storagePath
      ? PROJECT_STORAGE_TEXT.setStoragePath
      : usagePending
        ? PROJECT_STORAGE_TEXT.counting
        : value === null
          ? PROJECT_STORAGE_TEXT.storageUsageDash
          : `${formatStorageSize(value.bytes)}${value.partial ? '…' : ''}`;

  /** tooltip 里的占用行（原 1587 的三目） */
  const usageLine = usagePending
    ? PROJECT_STORAGE_TEXT.storageBusy
    : value === null
      ? PROJECT_STORAGE_TEXT.storageUsageDashLine
      : PROJECT_STORAGE_TEXT.storageUsageLine(formatStorageSize(value.bytes), value.partial, value.files);

  return (
    <div className={styles.topbar}>
      {/* 项目名（原 `.topbar-project-name` → `.topbar-project-label`，双击重命名） */}
      <div className={styles.topbarProjectName}>
        <span
          className={styles.topbarProjectLabel}
          title={PROJECT_TEXT.renameHint}
          onDoubleClick={(e) => {
            e.stopPropagation();
            onRename();
          }}
        >
          {project?.name ?? '—'}
        </span>
      </div>

      {/* 项目保存路径区（原 `.topbar-project-storage`，1582-1602） */}
      <div className={`${styles.storage}${storagePath ? ` ${styles.storageConfigured}` : ''}`}>
        <button
          type="button"
          className={styles.storageMain}
          disabled={!project || picking}
          title={storagePath ? PROJECT_STORAGE_TEXT.storageTooltip(storagePath, usageLine) : PROJECT_STORAGE_TEXT.storageHint}
          onClick={() => void onPickStorage()}
        >
          <svg className={styles.storageIcon} viewBox="0 0 20 20" aria-hidden="true">
            <path d="M2.8 5.2c0-.9.7-1.6 1.6-1.6h4l1.6 1.8h5.6c.9 0 1.6.7 1.6 1.6v7.6c0 .9-.7 1.6-1.6 1.6H4.4c-.9 0-1.6-.7-1.6-1.6V5.2Z" />
          </svg>
          <span className={styles.storageLabel}>{storageLabel}</span>
        </button>
        {storagePath && (
          <button
            type="button"
            className={styles.storageReveal}
            title={PROJECT_STORAGE_TEXT.openStorageDir}
            aria-label={PROJECT_STORAGE_TEXT.openStorageDir}
            onClick={() => void projectOps.revealStorage()}
          >
            ↗
          </button>
        )}
      </div>

      {/* ★ **「豆包后台」入口**（原 `_Component42.jsx:1606`，逐字：`<span className="topbar-icon">▦</span>豆包后台`）
          —— 它是**后台视图的唯一打开入口**；其 `onClick`（源 `tt`）＝ 补齐当前账号 ＋ 打开视图。 */}
      <button
        type="button"
        className={styles.topbarToggle}
        onClick={onOpenDoubaoView}
        title={BACKEND_VIEW_TEXT.entryTitle}
      >
        <span className={styles.topbarIcon} aria-hidden="true">▦</span>
        {BACKEND_VIEW_TEXT.entry}
      </button>
    </div>
  );
}
