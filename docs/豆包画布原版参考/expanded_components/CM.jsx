// TODO(全局, 无需 import): x, y, width, height, style, color, strokeColor, strokeWidth, className, borderRadius, shapeRendering, selected, onClick, background, backgroundColor, o, a, m, w, p, u, t, n, d, r, s, fill, v, stroke, l, c, f, h, e
import { id, Zt } from './shared.js';
export default function CM({
  id: e,
  x: t,
  y: n,
  width: r,
  height: s,
  style: o,
  color: a,
  strokeColor: l,
  strokeWidth: c,
  className: u,
  borderRadius: d,
  shapeRendering: f,
  selected: p,
  onClick: h
}) {
  const {
    background: m,
    backgroundColor: w
  } = o || {};
  const v = a || m || w;
  return <rect className={Zt(['react-flow__minimap-node', {
    selected: p
  }, u])} x={t} y={n} rx={d} ry={d} width={r} height={s} style={{
    fill: v,
    stroke: l,
    strokeWidth: c
  }} shapeRendering={f} onClick={h ? y => {
    return h(y, e);
  } : undefined} />;
}