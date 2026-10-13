// TODO(全局, 无需 import): nodesConnectable, nodesFocusable, elementsSelectable, onError, e, o, l, a, t, n, r, s
import { Et, SI, Vt, yI, wI, $u, _Component3 } from './shared.js';
export default function Fb(e) {
  const {
    nodesConnectable: t,
    nodesFocusable: n,
    elementsSelectable: r,
    onError: s
  } = Et(SI, Vt);
  const o = yI(e.onlyRenderVisibleElements);
  const a = wI();
  return <div className="react-flow__nodes" style={$u}>
      {o.map(l => {
      return <_Component3 id={l} nodeTypes={e.nodeTypes} nodeExtent={e.nodeExtent} onClick={e.onNodeClick} onMouseEnter={e.onNodeMouseEnter} onMouseMove={e.onNodeMouseMove} onMouseLeave={e.onNodeMouseLeave} onContextMenu={e.onNodeContextMenu} onDoubleClick={e.onNodeDoubleClick} noDragClassName={e.noDragClassName} noPanClassName={e.noPanClassName} rfId={e.rfId} disableKeyboardA11y={e.disableKeyboardA11y} resizeObserver={a} nodesDraggable={e.nodesDraggable ?? true} nodesConnectable={t} nodesFocusable={n} elementsSelectable={r} nodeClickDistance={e.nodeClickDistance} onError={s} key={l} />;
    })}
    </div>;
}