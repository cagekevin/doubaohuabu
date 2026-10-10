// TODO(全局, 无需 import): nodeStrokeColor, nodeColor, nodeClassName, nodeBorderRadius, nodeStrokeWidth, nodeComponent, onClick, t, e, n, l, p, c, u, d, r, s, o, a, f
import { EM, Et, jM, Vt, jd, IM } from './shared.js';
import * as i from 'react';
export default function _M({
  nodeStrokeColor: e,
  nodeColor: t,
  nodeClassName: n = '',
  nodeBorderRadius: r = 5,
  nodeStrokeWidth: s,
  nodeComponent: o = EM,
  onClick: a
}) {
  const l = Et(jM, Vt);
  const c = jd(t);
  const u = jd(e);
  const d = jd(n);
  const f = typeof window === 'undefined' || window.chrome ? 'crispEdges' : 'geometricPrecision';
  return <i.Fragment>
      {l.map(p => {
      return <IM id={p} nodeColorFunc={c} nodeStrokeColorFunc={u} nodeClassNameFunc={d} nodeBorderRadius={r} nodeStrokeWidth={s} NodeComponent={o} onClick={a} shapeRendering={f} key={p} />;
    })}
    </i.Fragment>;
}