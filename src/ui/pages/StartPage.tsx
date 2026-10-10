/**
 * 启动页（docs/11 §二 ui/pages）
 * 依据：docs/05-画布与交互.md §5（原「＋ 新建项目 / 打开历史项目」）
 *
 * 空态复用 `ui/common/EmptyState`（原则 8：三振出局）
 */

import { BRAND } from '@/constants/text';
import { useStore } from '@/state';
import { EmptyState } from '@/ui/common/EmptyState';

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
    <div
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 'var(--space-5)',
      }}
    >
      <div style={{ textAlign: 'center' }}>
        <h1 style={{ margin: '0 0 var(--space-2)', fontSize: 'var(--font-size-xl)' }}>{BRAND.name}</h1>
        <p style={{ margin: 0, color: 'var(--color-text-muted)' }}>{BRAND.tagline}</p>
      </div>

      {projects.length === 0 ? (
        <EmptyState title={BRAND.emptyHistory} />
      ) : (
        <div style={{ minWidth: 320, display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          <div style={{ color: 'var(--color-text-muted)', fontSize: 'var(--font-size-sm)' }}>
            {BRAND.openHistory}
          </div>
          {projects.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => openProject(p.id)}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: 'var(--space-3)',
                padding: 'var(--space-3) var(--space-4)',
                background: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-md)',
                textAlign: 'left',
              }}
            >
              <span>{p.name}</span>
              <span style={{ color: 'var(--color-text-faint)', fontSize: 'var(--font-size-sm)' }}>
                {p.data.nodes.length} 个节点
              </span>
            </button>
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={onNewProject}
        style={{
          padding: 'var(--space-2) var(--space-5)',
          background: 'var(--color-primary)',
          color: 'var(--color-surface)',
          borderRadius: 'var(--radius-md)',
        }}
      >
        {BRAND.newProject}
      </button>
    </div>
  );
}
