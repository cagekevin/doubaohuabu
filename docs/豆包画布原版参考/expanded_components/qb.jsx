// TODO(全局, 无需 import): sourceX, sourceY, targetX, targetY, label, labelStyle, labelShowBg, labelBgStyle, labelBgPadding, labelBgBorderRadius, style, sourcePosition, targetPosition, markerEnd, markerStart, pathOptions, interactionWidth, n, r, h, s, o, m, borderRadius, y, offset, stepPosition, e, t, C, x, k, N, a, l, c, u, d, f, p, w, v, b
import _cmp__Component5 from './_Component5.jsx';
import { id, pt, ip } from './shared.js';
import * as g from 'react';
export default function qb(e) {
  return g.memo(({
    id: t,
    sourceX: n,
    sourceY: r,
    targetX: s,
    targetY: o,
    label: a,
    labelStyle: l,
    labelShowBg: c,
    labelBgStyle: u,
    labelBgPadding: d,
    labelBgBorderRadius: f,
    style: p,
    sourcePosition: h = pt.Bottom,
    targetPosition: m = pt.Top,
    markerEnd: w,
    markerStart: v,
    pathOptions: y,
    interactionWidth: b
  }) => {
    const [x, k, N] = ip({
      sourceX: n,
      sourceY: r,
      sourcePosition: h,
      targetX: s,
      targetY: o,
      targetPosition: m,
      borderRadius: y == null ? undefined : y.borderRadius,
      offset: y == null ? undefined : y.offset,
      stepPosition: y == null ? undefined : y.stepPosition
    });
    const C = e.isInternal ? undefined : t;
    return <_cmp__Component5 id={C} path={x} labelX={k} labelY={N} label={a} labelStyle={l} labelShowBg={c} labelBgStyle={u} labelBgPadding={d} labelBgBorderRadius={f} style={p} markerEnd={w} markerStart={v} interactionWidth={b} />;
  });
}