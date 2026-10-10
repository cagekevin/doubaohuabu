// TODO(全局, 无需 import): sourceX, sourceY, targetX, targetY, label, labelStyle, labelShowBg, labelBgStyle, labelBgPadding, labelBgBorderRadius, style, markerEnd, markerStart, interactionWidth, n, r, s, o, e, t, x, v, y, b, a, l, c, u, d, f, p, h, m, w
import _cmp__Component5 from './_Component5.jsx';
import { id, ib } from './shared.js';
import * as g from 'react';
export default function Qb(e) {
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
    markerEnd: h,
    markerStart: m,
    interactionWidth: w
  }) => {
    const [v, y, b] = ib({
      sourceX: n,
      sourceY: r,
      targetX: s,
      targetY: o
    });
    const x = e.isInternal ? undefined : t;
    return <_cmp__Component5 id={x} path={v} labelX={y} labelY={b} label={a} labelStyle={l} labelShowBg={c} labelBgStyle={u} labelBgPadding={d} labelBgBorderRadius={f} style={p} markerEnd={h} markerStart={m} interactionWidth={w} />;
  });
}