// TODO(全局, 无需 import): position, centerX, centerY, radius, onMouseDown, onMouseEnter, onMouseOut, type, s, o, a, l, t, r, e, n
import { Zt, xy, DI, LI } from './shared.js';
export default function _Component6({
  position: e,
  centerX: t,
  centerY: n,
  radius: r = 10,
  onMouseDown: s,
  onMouseEnter: o,
  onMouseOut: a,
  type: l
}) {
  return <circle onMouseDown={s} onMouseEnter={o} onMouseOut={a} className={Zt([xy, `${xy}-${l}`])} cx={DI(t, r, e)} cy={LI(n, r, e)} r={r} stroke="transparent" fill="transparent" />;
}