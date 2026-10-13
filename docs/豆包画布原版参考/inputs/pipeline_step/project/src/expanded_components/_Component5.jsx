// TODO(全局, 无需 import): path, labelX, labelY, label, labelStyle, labelShowBg, labelBgStyle, labelBgPadding, labelBgBorderRadius, interactionWidth, d, e, u, r, t, n, s, o, a, l, c
import { Zt, ar, MI } from './shared.js';
import * as i from 'react';
export default function _Component5({
  path: e,
  labelX: t,
  labelY: n,
  label: r,
  labelStyle: s,
  labelShowBg: o,
  labelBgStyle: a,
  labelBgPadding: l,
  labelBgBorderRadius: c,
  interactionWidth: u = 20,
  ...d
}) {
  return <i.Fragment>
      <path {...d} d={e} fill="none" className={Zt(['react-flow__edge-path', d.className])} />
      {u ? <path d={e} fill="none" strokeOpacity={0} strokeWidth={u} className="react-flow__edge-interaction" /> : null}
      {r && ar(t) && ar(n) ? <MI x={t} y={n} label={r} labelStyle={s} labelShowBg={o} labelBgStyle={a} labelBgPadding={l} labelBgBorderRadius={c} /> : null}
    </i.Fragment>;
}