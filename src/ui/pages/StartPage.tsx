/**
 * 启动页（docs/11 §二 ui/pages）
 * 依据：docs/05-画布与交互.md §5（原「＋ 新建项目 / 打开历史项目」）
 *
 * 空态复用 `ui/common/EmptyState`（原则 8：三振出局）
 */

import { BRAND } from '@/constants/text';
import { useStore } from '@/state';
import { EmptyState } from '@/ui/common/EmptyState';
import styles from './StartPage.module.css';

export function StartPage() {
  const projects = useStore((s) => s.projects);
  /**
   * ★ **必须用 `openProject`（而不是 `setActiveId` + `setStarted`）**
   *
   * 只切 `activeId` 不换画布 ⇒ `store.ts` 的镜像会把**旧画布**写进**新工程**
   * （`docs/14` §2 的 ⭐⭐ 数据损坏 bug）。`openProject` 会原子地把新工程的画布数据带进来。
   */
  const openProject = useStore((s) => s.openProject);
  const createProject = useStore((s) => s.createProject);

  /** ★ 「＋ 新建项目」= **真的建一个**工程并进入（不是"打开第一个"） */
  const onNewProject = (): void => {
    createProject();
  };

  return (
    <div className={styles.page}>
      <div className={styles.brand}>
        <h1 className={styles.brandName}>{BRAND.name}</h1>
        <p className={styles.brandTagline}>{BRAND.tagline}</p>
      </div>

      {projects.length === 0 ? (
        <EmptyState title={BRAND.emptyHistory} />
      ) : (
        <div className={styles.history}>
          <div className={styles.historyLabel}>{BRAND.openHistory}</div>
          {projects.map((p) => (
            <button
              key={p.id}
              type="button"
              className={styles.projectItem}
              onClick={() => openProject(p.id)}
            >
              <span>{p.name}</span>
              <span className={styles.projectMeta}>{p.data.nodes.length} 个节点</span>
            </button>
          ))}
        </div>
      )}

      <button type="button" className={styles.newProject} onClick={onNewProject}>
        {BRAND.newProject}
      </button>
    </div>
  );
}
