// TODO(全局, 无需 import): defaultMarkerColor, onlyRenderVisibleElements, rfId, edgeTypes, noPanClassName, onReconnect, onEdgeContextMenu, onEdgeMouseEnter, onEdgeMouseMove, onEdgeMouseLeave, onEdgeClick, reconnectRadius, onEdgeDoubleClick, onReconnectStart, onReconnectEnd, disableKeyboardA11y, edgesFocusable, edgesReconnectable, elementsSelectable, onError, t, e, n, k, N, v, y, b, s, o, a, l, c, u, d, f, p, h, m, x, r, w
import { Et, FI, Vt, CI, _Component7 } from './shared.js';
export default function nk({
  defaultMarkerColor: e,
  onlyRenderVisibleElements: t,
  rfId: n,
  edgeTypes: r,
  noPanClassName: s,
  onReconnect: o,
  onEdgeContextMenu: a,
  onEdgeMouseEnter: l,
  onEdgeMouseMove: c,
  onEdgeMouseLeave: u,
  onEdgeClick: d,
  reconnectRadius: f,
  onEdgeDoubleClick: p,
  onReconnectStart: h,
  onReconnectEnd: m,
  disableKeyboardA11y: w
}) {
  const {
    edgesFocusable: v,
    edgesReconnectable: y,
    elementsSelectable: b,
    onError: x
  } = Et(FI, Vt);
  const k = CI(t);
  return <div className="react-flow__edges">
      <II defaultColor={e} rfId={n} />
      {k.map(N => {
      return <_Component7 id={N} edgesFocusable={v} edgesReconnectable={y} elementsSelectable={b} noPanClassName={s} onReconnect={o} onContextMenu={a} onMouseEnter={l} onMouseMove={c} onMouseLeave={u} onClick={d} reconnectRadius={f} onDoubleClick={p} onReconnectStart={h} onReconnectEnd={m} rfId={n} onError={x} edgeTypes={r} disableKeyboardA11y={w} key={N} />;
    })}
    </div>;
}