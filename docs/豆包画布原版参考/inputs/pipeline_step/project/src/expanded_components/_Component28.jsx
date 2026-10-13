// TODO(全局, 无需 import): nodeId, isVisible, handleClassName, handleStyle, lineClassName, lineStyle, color, minWidth, minHeight, maxWidth, maxHeight, keepAspectRatio, autoScale, shouldResize, onResizeStart, onResize, onResizeEnd, t, s, o, e, y, a, l, c, u, d, m, f, p, h, w, v, n, r
import { BA, oo, FA, Ey } from './shared.js';
import * as i from 'react';
export default function _Component28({
  nodeId: e,
  isVisible: t = true,
  handleClassName: n,
  handleStyle: r,
  lineClassName: s,
  lineStyle: o,
  color: a,
  minWidth: l = 10,
  minHeight: c = 10,
  maxWidth: u = Number.MAX_VALUE,
  maxHeight: d = Number.MAX_VALUE,
  keepAspectRatio: f = false,
  autoScale: p = true,
  shouldResize: h,
  onResizeStart: m,
  onResize: w,
  onResizeEnd: v
}) {
  if (t) {
    return <i.Fragment>
        {BA.map(y => {
        return <Ey className={s} style={o} nodeId={e} position={y} variant={oo.Line} color={a} minWidth={l} minHeight={c} maxWidth={u} maxHeight={d} onResizeStart={m} keepAspectRatio={f} autoScale={p} shouldResize={h} onResize={w} onResizeEnd={v} key={y} />;
      })}
        {FA.map(y => {
        return <Ey className={n} style={r} nodeId={e} position={y} color={a} minWidth={l} minHeight={c} maxWidth={u} maxHeight={d} onResizeStart={m} keepAspectRatio={f} autoScale={p} shouldResize={h} onResize={w} onResizeEnd={v} key={y} />;
      })}
      </i.Fragment>;
  } else {
    return null;
  }
}