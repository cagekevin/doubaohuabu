/**
 * 顶栏（原 `.canvas-topbar`，`_Component42.jsx:1563-1609`）
 *
 * ★ 它是**全宽应用栏**，由 `AppShell` 渲染、**两个界面共用一份**（布局里的一根条，不是浮层）——
 *   设计稿的判断：浮动条会被节点盖住，且吃掉画布顶部一条。
 *   样式真值 = `docs/mockup/assets/mockup.css` 的 `.AppShell-topbar` 一族（按选择器指名，不引行号）。
 *
 * ★ 内容：**品牌标记 · 项目名 · 保存路径 · 豆包后台入口**。
 *   ⚠️ 设计稿这里还画了一件「授权」chip —— **真机不做**（用户裁定：不需要显示授权，
 *      见 `docs/plan/01-界面统一-移植计划.md` §7-D19）。
 *
 * ★ 「保存路径」那件 = 设置路径 / 打开目录 / 占用空间统计，接 `core/usecases/projectStorage`。
 * ⚠️ 项目名**双击**重命名（原 `1575` 的 `onDoubleClick`），不是单击。
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
import { Icon } from '@/ui/common/Icon';
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
      {/* 品牌标记（设计稿 `.mk-brand` / `.mk-brand-mark`）—— 钉在最左，**不参与**中间那一组 */}
      <span className={styles.brand} aria-hidden="true">
        <span className={styles.brandMark} />
      </span>

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
          <Icon name="folder" className={styles.storageIcon} />
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
            <Icon name="external" />
          </button>
        )}
      </div>

      {/* ★ **「豆包后台」入口**（原 `_Component42.jsx:1606` 的 `▦`；设计稿改走图标 `i-grid`）
          —— 它是**后台视图的唯一打开入口**；其 `onClick`（源 `tt`）＝ 补齐当前账号 ＋ 打开视图。 */}
      <button
        type="button"
        className={styles.topbarToggle}
        onClick={onOpenDoubaoView}
        title={BACKEND_VIEW_TEXT.entryTitle}
      >
        <Icon name="grid" />
        {BACKEND_VIEW_TEXT.entry}
      </button>
    </div>
  );
}
