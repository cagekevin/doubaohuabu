// TODO(全局, 无需 import): nodeColorFunc, nodeStrokeColorFunc, nodeClassNameFunc, nodeBorderRadius, nodeStrokeWidth, shapeRendering, NodeComponent, onClick, node, x, y, width, height, m, e, w, v, b, k, u, d, f, p, h, r, t, s, n, o, a, c
import { id, Et, _r, Vt, eb } from './shared.js';
export default function AM({
  id: e,
  nodeColorFunc: t,
  nodeStrokeColorFunc: n,
  nodeClassNameFunc: r,
  nodeBorderRadius: s,
  nodeStrokeWidth: o,
  shapeRendering: a,
  NodeComponent: _Component22,
  onClick: c
}) {
  const {
    node: u,
    x: d,
    y: f,
    width: p,
    height: h
  } = Et(m => {
    const w = m.nodeLookup.get(e);
    if (!w) {
      return {
        node: undefined,
        x: 0,
        y: 0,
        width: 0,
        height: 0
      };
    }
    const v = w.internals.userNode;
    const {
      x: y,
      y: b
    } = w.internals.positionAbsolute;
    const {
      width: x,
      height: k
    } = _r(v);
    return {
      node: v,
      x: y,
      y: b,
      width: x,
      height: k
    };
  }, Vt);
  if (!u || u.hidden || !eb(u)) {
    return null;
  } else {
    return <_Component22 x={d} y={f} width={p} height={h} style={u.style} selected={!!u.selected} className={r(u)} color={t(u)} borderRadius={s} strokeColor={n(u)} strokeWidth={o} shapeRendering={a} onClick={c} id={u.id} />;
  }
}