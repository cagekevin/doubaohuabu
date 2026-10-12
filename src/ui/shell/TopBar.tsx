/**
 * 画布顶栏（原 `.canvas-topbar`）
 *
 * 依据：docs/03-人类版.md §8（顶栏文案）+ §2（工程导出/导入）+ 原 `_Component42.jsx:1578-1602`（保存路径区）
 *
 * ★ **2026-10-11 补「项目保存路径」区**：设置保存路径 / 打开保存目录 / 占用空间统计
 *   —— 接 `core/usecases/projectStorage`（此前 0 消费）。
 *
 * ⚠️ 原则 1：不直接写 store，只调 action
 * ⚠️ 原则 6：失败时**原样上报**（`hostOps.saveTextFile` / `projectOps` 控制器给出的原始 message）
 * ⚠️ 宿主调用走控制器（`useHostOps` / `useProjectOps`）—— `ui` 不得直持 `Ports`（TD-16-8）。
 * ⚠️ **effect 里不做同步 `setState`**（`react-hooks/set-state-in-effect`）—— 占用统计只经 `.then` 回写。
 */

import { useEffect, useRef, useState } from 'react';
import { useHostOps, useProjectOps, useStore } from '@/state';
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
  const pushBackendError = useStore((s) => s.pushBackendError);
  const hostOps = useHostOps();
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

  /** 导出当前工程为 JSON（走 `hostOps.saveTextFile`） */
  const onExport = async (): Promise<void> => {
    if (!project) return;
    const res = await hostOps.saveTextFile(JSON.stringify([project], null, 2));
    if (!res.ok) {
      // ★ 原样上报（不改写成「导出失败」）
      // ⚠️ kind 归 'unknown' **不是偷懒**：`res.reason` 是 `SendFailKind`，横幅域是
      //    `BackendErrorKind`，两域不互通 ⇒ 无法转发（原则 6 禁止 #3 认可归 unknown）。见 TD-16-68。
      pushBackendError('unknown', res.message);
      return;
    }
    pushToast(`已导出「${project.name}」`);
  };

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
      <button type="button" className={styles.topbarName} onClick={onRename} title={PROJECT_TEXT.renameHint}>
        {project?.name ?? '—'}
      </button>
      <span className={styles.topbarCount}>
        {project ? `${project.data.nodes.length} 个节点` : ''}
      </span>
      <span className={styles.topbarSpacer} />

      {/* 项目保存路径区（原 `.topbar-project-storage`，1583-1602） */}
      <div className={styles.storage}>
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
          <span>{storageLabel}</span>
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

      <button type="button" onClick={() => void onExport()}>
        {PROJECT_TEXT.export}
      </button>

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
