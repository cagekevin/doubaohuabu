/**
 * 启动页（docs/11 §二 ui/pages）—— 原 `_Component47.jsx`（60 行）
 *
 * 依据（**逐行回源** `_Component47.jsx`）：
 *   | 源 | 语义 | 本仓 |
 *   |---|---|---|
 *   | `:25-27` `[...e].sort((m,w) => w.updatedAt - m.updatedAt)` | 历史列表按 `updatedAt` **倒序** | 纯层 `orderProjectsByUpdatedAt`（`core/rules/project.ts`） |
 *   | `:89` `UP(m.updatedAt)` | 行右侧 = **相对时间** | `lib/time.formatRelativeTime`（通用；`now` 由本组件注入） |
 *   | `:74-90` `.startup-proj-main` 的 `onDoubleClick` | **就地重命名**（Enter/blur 提交、Esc 取消） | 本组件局部态（`editingId`/`draft`）+ store `renameProject` |
 *   | `:91-98` 删除钮 | `✕` + `confirm` + `deleteProject` | 已落 |
 *   | `:28-42` 「导入项目文件（.json）」 | 读文件 → 导入 | 已落（`projectOps.importProjectFile`） |
 *
 * ⚠️ 与源的一处**有意差异**（保键盘可达性）：源把「点开工程」挂在**外层 `div`** 上，
 *   本仓用 `<button>`（源那个外层是 `div`、不可聚焦）⇒ 删除钮**无需** `stopPropagation`。
 * ⚠️ 源在那行**只显示名字 + 相对时间**；本仓此前多显示「N 个节点」（源里没有）⇒ 已改回源的两项。
 * ⚠️ 宿主调用走 `useProjectOps()` 控制器 —— `ui` 不得直持 `Ports`（TD-16-8）。
 * ⚠️ **当前时刻必须收进 state**：渲染期直接调 `Date.now()` 是不纯调用（同 `FingerprintScanPanel`）。
 */

import { useState } from 'react';
import { BRAND, PROJECT_TEXT } from '@/constants/text';
import { useProjectOps, useStore } from '@/state';
import { orderProjectsByUpdatedAt } from '@/core/rules/project';
import { formatRelativeTime } from '@/lib/time';
import { EmptyState } from '@/ui/common/EmptyState';
import styles from './StartPage.module.css';

export function StartPage() {
  const projects = useStore((s) => s.projects);
  /**
   * ★ **必须用 `openProject`（而不是 `setActiveId` + `setStarted`）**
   *
   * 只切 `activeId` 不换画布 ⇒ `store.ts` 的镜像会把**旧画布**写进**新工程**
   * （`docs/过程.md` §2 的 ⭐⭐ 数据损坏 bug）。`openProject` 会原子地把新工程的画布数据带进来。
   */
  const openProject = useStore((s) => s.openProject);
  const createProject = useStore((s) => s.createProject);
  const deleteProject = useStore((s) => s.deleteProject);
  const renameProject = useStore((s) => s.renameProject);
  const projectOps = useProjectOps();

  /** ★ 「＋ 新建项目」= **真的建一个**工程并进入（不是"打开第一个"） */
  const onNewProject = (): void => {
    createProject();
  };

  /** 展示顺序：按 `updatedAt` 倒序（原 `:25-27`）—— **只影响渲染**，store 里的顺序不动 */
  const ordered = orderProjectsByUpdatedAt(projects);
  /** 打开页面时的时刻（相对时间用它算；进页面取一次即可，见头注） */
  const [nowMs] = useState(() => Date.now());
  /** 正在就地重命名的工程 id（原 `:23` 的 `a`） */
  const [editingId, setEditingId] = useState<string | null>(null);
  /** 重命名输入框的草稿（原 `:24` 的 `c`） */
  const [draft, setDraft] = useState('');

  /** 进入编辑态（原 `:43-46` 的 `p`）—— 双击行主区触发 */
  const startRename = (id: string, name: string): void => {
    setEditingId(id);
    setDraft(name);
  };
  /** 提交并退出编辑态（原 `:47-52` 的 `h`）—— `blur` 与 `Enter` 都走它 */
  const commitRename = (): void => {
    if (editingId) renameProject(editingId, draft);
    setEditingId(null);
  };

  return (
    <div className={styles.page}>
      <div className={styles.brand}>
        <h1 className={styles.brandName}>{BRAND.name}</h1>
        <p className={styles.brandTagline}>{BRAND.tagline}</p>
      </div>

      {ordered.length === 0 ? (
        <EmptyState title={BRAND.emptyHistory} />
      ) : (
        <div className={styles.history}>
          <div className={styles.historyLabel}>{BRAND.openHistory}</div>
          {ordered.map((p) => (
            <div key={p.id} className={styles.projectItem}>
              {editingId === p.id ? (
                // 就地重命名（原 `:78-88`）—— `Esc` 只退出编辑态、**不提交**（源 `:85-87`）
                <input
                  className={styles.projectInput}
                  value={draft}
                  autoFocus
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => setDraft(e.target.value)}
                  onBlur={commitRename}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitRename();
                    else if (e.key === 'Escape') setEditingId(null);
                  }}
                />
              ) : (
                <button
                  type="button"
                  className={styles.projectMain}
                  title={PROJECT_TEXT.renameHint}
                  onClick={() => openProject(p.id)}
                  onDoubleClick={() => startRename(p.id, p.name)}
                >
                  <span>{p.name}</span>
                  <span className={styles.projectMeta}>{formatRelativeTime(p.updatedAt, nowMs)}</span>
                </button>
              )}
              {/*
                「删除项目」（原 `_Component47.jsx:91-98`）—— `✕` 图标钮 + `confirm` + `deleteProject(id)`。
                ⚠️ 源把「点开工程」挂在外层 `.startup-proj`、删除钮 `stopPropagation`；本仓把点开放到
                  `.projectMain`（**保住键盘可达性** —— 源那个外层是 `div`、不可聚焦）⇒ 此处**无需** stopPropagation。
                ⚠️ 文案走 `PROJECT_TEXT`（`deleteTitle` / `deleteConfirm`，均逐字对源）。
              */}
              <button
                type="button"
                className={styles.projectDelete}
                title={PROJECT_TEXT.deleteTitle}
                onClick={() => {
                  if (window.confirm(PROJECT_TEXT.deleteConfirm(p.name))) deleteProject(p.id);
                }}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {/*
        「导入项目文件（.json）」（原 `_Component47.jsx:28-42`）—— 走 `projectOps` 控制器：
        读文件 → `usecases/importProject`（解析 / 建工程 / 激活存储 / 合并预设）→ state 写入 store。
        ⚠️ 失败由控制器 `pushBackendError` 上报（含 `JSON.parse` 的「项目文件解析失败」原文）。
      */}
      <button
        type="button"
        className={styles.importProject}
        onClick={() => void projectOps.importProjectFile()}
      >
        {BRAND.importProject}
      </button>

      <button type="button" className={styles.newProject} onClick={onNewProject}>
        {BRAND.newProject}
      </button>
    </div>
  );
}
