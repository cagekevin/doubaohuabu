/**
 * 画布顶栏（原 `.canvas-topbar`）
 *
 * 依据：docs/03-人类版.md §8（顶栏文案）+ §2（工程导出）
 *
 * ⚠️ 原则 1：不直接写 store，只调 action
 * ⚠️ 原则 6：导出失败时**原样上报**（`saveFile` 的 message）
 */

import { useStore, usePorts } from '@/state';
import { PROJECT_TEXT } from '@/constants/text';
import styles from './AppShell.module.css';

export function TopBar() {
  const project = useStore((s) => s.projects.find((p) => p.id === s.activeId) ?? null);
  const renameProject = useStore((s) => s.renameProject);
  const pushToast = useStore((s) => s.pushToast);
  const pushBackendError = useStore((s) => s.pushBackendError);
  const ports = usePorts();

  /** 导出当前工程为 JSON（走 `HostPort.file.saveFile`） */
  const onExport = async (): Promise<void> => {
    if (!project) return;
    const res = await ports.host.file.saveFile(JSON.stringify([project], null, 2));
    if (!res.ok) {
      // ★ 原样上报（不改写成「导出失败」）
      pushBackendError('unknown', res.message);
      return;
    }
    pushToast(`已导出「${project.name}」`);
  };

  const onRename = (): void => {
    if (!project) return;
    const next = window.prompt(PROJECT_TEXT.renameHint, project.name);
    if (next === null) return;
    renameProject(project.id, next);
  };

  return (
    <div className={styles.topbar}>
      <button type="button" onClick={onRename} title={PROJECT_TEXT.renameHint}>
        {project?.name ?? '—'}
      </button>
      <span style={{ color: 'var(--color-text-faint)', fontSize: 'var(--font-size-xs)' }}>
        {project ? `${project.data.nodes.length} 个节点` : ''}
      </span>
      <span style={{ flex: 1 }} />
      <button type="button" onClick={() => void onExport()}>
        {PROJECT_TEXT.export}
      </button>
    </div>
  );
}
