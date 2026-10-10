// TODO(全局, 无需 import): sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, label, labelStyle, labelShowBg, labelBgStyle, labelBgPadding, labelBgBorderRadius, style, markerEnd, markerStart, pathOptions, interactionWidth, n, r, a, s, o, l, curvature, y, e, t, C, x, k, N, c, u, d, f, p, h, m, w, v, b
import _cmp__Component5 from './_Component5.jsx';
import { id, pt, ju } from './shared.js';
import * as g from 'react';
export default function ek(e) {
  return g.memo(({
    id: t,
    sourceX: n,
    sourceY: r,
    targetX: s,
    targetY: o,
    sourcePosition: a = pt.Bottom,
    targetPosition: l = pt.Top,
    label: c,
    labelStyle: u,
    labelShowBg: d,
    labelBgStyle: f,
    labelBgPadding: p,
    labelBgBorderRadius: h,
    style: m,
    markerEnd: w,
    markerStart: v,
    pathOptions: y,
    interactionWidth: b
  }) => {
    const [x, k, N] = ju({
      sourceX: n,
      sourceY: r,
      sourcePosition: a,
      targetX: s,
      targetY: o,
      targetPosition: l,
      curvature: y == null ? undefined : y.curvature
    });
    const C = e.isInternal ? undefined : t;
    return <_cmp__Component5 id={C} path={x} labelX={k} labelY={N} label={c} labelStyle={u} labelShowBg={d} labelBgStyle={f} labelBgPadding={p} labelBgBorderRadius={h} style={m} markerEnd={w} markerStart={v} interactionWidth={b} />;
  });
}