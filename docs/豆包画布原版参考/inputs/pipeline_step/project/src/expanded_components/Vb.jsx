// TODO(全局, 无需 import): sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, label, labelStyle, labelShowBg, labelBgStyle, labelBgPadding, labelBgBorderRadius, style, markerEnd, markerStart, interactionWidth, n, r, a, s, o, l, e, t, N, b, x, k, c, u, d, f, p, h, m, w, v, y
import _cmp__Component5 from './_Component5.jsx';
import { id, Wb } from './shared.js';
import * as g from 'react';
export default function Vb(e) {
  return g.memo(({
    id: t,
    sourceX: n,
    sourceY: r,
    targetX: s,
    targetY: o,
    sourcePosition: a,
    targetPosition: l,
    label: c,
    labelStyle: u,
    labelShowBg: d,
    labelBgStyle: f,
    labelBgPadding: p,
    labelBgBorderRadius: h,
    style: m,
    markerEnd: w,
    markerStart: v,
    interactionWidth: y
  }) => {
    const [b, x, k] = Wb({
      sourceX: n,
      sourceY: r,
      sourcePosition: a,
      targetX: s,
      targetY: o,
      targetPosition: l
    });
    const N = e.isInternal ? undefined : t;
    return <_cmp__Component5 id={N} path={b} labelX={x} labelY={k} label={c} labelStyle={u} labelShowBg={d} labelBgStyle={f} labelBgPadding={p} labelBgBorderRadius={h} style={m} markerEnd={w} markerStart={v} interactionWidth={y} />;
  });
}