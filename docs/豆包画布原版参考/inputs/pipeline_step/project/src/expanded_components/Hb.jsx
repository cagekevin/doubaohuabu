// TODO(全局, 无需 import): x, y, label, labelStyle, labelShowBg, labelBgStyle, labelBgPadding, labelBgBorderRadius, children, className, width, height, u, m, p, w, n, e, f, t, h, d, s, a, o, l, r, c
import { Zt } from './shared.js';
import * as g from 'react';
export default function Hb({
  x: e,
  y: t,
  label: n,
  labelStyle: r,
  labelShowBg: s = true,
  labelBgStyle: o,
  labelBgPadding: a = [2, 4],
  labelBgBorderRadius: l = 2,
  children: c,
  className: u,
  ...d
}) {
  const [f, p] = g.useState({
    x: 1,
    y: 0,
    width: 0,
    height: 0
  });
  const h = Zt(['react-flow__edge-textwrapper', u]);
  const m = g.useRef(null);
  g.useEffect(() => {
    if (m.current) {
      const w = m.current.getBBox();
      p({
        x: w.x,
        y: w.y,
        width: w.width,
        height: w.height
      });
    }
  }, [n]);
  if (n) {
    return <g transform={`translate(${e - f.width / 2} ${t - f.height / 2})`} className={h} visibility={f.width ? 'visible' : 'hidden'} {...d}>
        {s && <rect width={f.width + a[0] * 2} x={-a[0]} y={-a[1]} height={f.height + a[1] * 2} className="react-flow__edge-textbg" style={o} rx={l} ry={l} />}
        <text className="react-flow__edge-text" y={f.height / 2} dy="0.3em" ref={m} style={r}>
          {n}
        </text>
        {c}
      </g>;
  } else {
    return null;
  }
}