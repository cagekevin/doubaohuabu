// TODO(全局, 无需 import): variant, gap, size, lineWidth, offset, color, bgColor, style, className, patternClassName, transform, patternId, r, t, n, y, p, m, o, v, x, b, k, N, h, e, u, c, l, a, f, S, C, w, d, s
import _cmp__Component14 from './_Component14.jsx';
import _cmp__Component15 from './_Component15.jsx';
import { id, zr, Et, gM, Vt, mM, Zt, $u } from './shared.js';
import * as g from 'react';
export default function ak({
  id: e,
  variant: t = zr.Dots,
  gap: n = 20,
  size: r,
  lineWidth: s = 1,
  offset: o = 0,
  color: a,
  bgColor: l,
  style: c,
  className: u,
  patternClassName: d
}) {
  const f = g.useRef(null);
  const {
    transform: p,
    patternId: h
  } = Et(gM, Vt);
  const m = r || mM[t];
  const w = t === zr.Dots;
  const v = t === zr.Cross;
  const y = Array.isArray(n) ? n : [n, n];
  const b = [y[0] * p[2] || 1, y[1] * p[2] || 1];
  const x = m * p[2];
  const k = Array.isArray(o) ? o : [o, o];
  const N = v ? [x, x] : b;
  const C = [k[0] * p[2] || 1 + N[0] / 2, k[1] * p[2] || 1 + N[1] / 2];
  const S = `${h}${e || ''}`;
  return <svg className={Zt(['react-flow__background', u])} style={{
    ...c,
    ...$u,
    '--xy-background-color-props': l,
    '--xy-background-pattern-color-props': a
  }} ref={f} data-testid="rf__background">
      <pattern id={S} x={p[0] % b[0]} y={p[1] % b[1]} width={b[0]} height={b[1]} patternUnits="userSpaceOnUse" patternTransform={`translate(-${C[0]},-${C[1]})`}>
        {w ? <_cmp__Component14 radius={x / 2} className={d} /> : <_cmp__Component15 dimensions={N} lineWidth={s} variant={t} className={d} />}
      </pattern>
      <rect x="0" y="0" width="100%" height="100%" fill={`url(#${S})`} />
    </svg>;
}