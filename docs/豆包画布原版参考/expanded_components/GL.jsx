// TODO(全局, 无需 import): data, selected, a, l, e, t, n, o, r, s
import _cmp__Component28 from './_Component28.jsx';
import { id, L } from './shared.js';
export default function GL({
  id: e,
  data: t,
  selected: n
}) {
  const r = L(a => {
    return a.nodes.filter(l => {
      return l.parentId === e;
    }).length;
  });
  const s = L(a => {
    return a.ungroupNodes;
  });
  const o = t && t.label || '组';
  return <div className={`group-node${n ? ' selected' : ''}`}>
      <_cmp__Component28 minWidth={200} minHeight={140} isVisible={n} lineClassName="r-line" handleClassName="r-handle" />
      <div className="group-node-head" title="拖动标题栏可整体移动该组">
        <span className="group-node-icon" aria-hidden="true">
          <svg width="12" height="12" viewBox="0 0 24 24">
            <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
          </svg>
        </span>
        <span className="group-node-name">{o}</span>
        <span className="group-node-count" title="组内节点数">
          {r}
        </span>
        <button type="button" className="group-ungroup-btn nodrag nopan" title="取消组：释放内部节点，仅删除组容器" onMouseDown={a => {
        return a.stopPropagation();
      }} onClick={a => {
        a.stopPropagation();
        s(e);
      }}>
          取消组
        </button>
      </div>
    </div>;
}