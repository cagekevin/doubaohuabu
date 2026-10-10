// TODO(全局, 无需 import): style, type, CustomComponent, isValid, inProgress, from, fromNode, fromHandle, fromPosition, toNode, toHandle, toPosition, pointer, _Component9, t, e, a, l, o, u, c, p, r, d, f, h, sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition, w, borderRadius, m
import { is, to, YI, qx, ju, Wb, ip, ib } from './shared.js';
const _Component8 = ({
  style: e,
  type: t = is.Bezier,
  CustomComponent: _Component9,
  isValid: r
}) => {
  const {
    inProgress: s,
    from: o,
    fromNode: a,
    fromHandle: l,
    fromPosition: c,
    to: u,
    toNode: d,
    toHandle: f,
    toPosition: p,
    pointer: h
  } = YI();
  if (!s) {
    return;
  }
  if (_Component9) {
    return <_Component9 connectionLineType={t} connectionLineStyle={e} fromNode={a} fromHandle={l} fromX={o.x} fromY={o.y} toX={u.x} toY={u.y} fromPosition={c} toPosition={p} connectionStatus={qx(r)} toNode={d} toHandle={f} pointer={h} />;
  }
  let m = '';
  const w = {
    sourceX: o.x,
    sourceY: o.y,
    sourcePosition: c,
    targetX: u.x,
    targetY: u.y,
    targetPosition: p
  };
  switch (t) {
    case is.Bezier:
      {
        [m] = ju(w);
        break;
      }
    case is.SimpleBezier:
      {
        [m] = Wb(w);
        break;
      }
    case is.Step:
      {
        [m] = ip({
          ...w,
          borderRadius: 0
        });
        break;
      }
    case is.SmoothStep:
      {
        [m] = ip(w);
        break;
      }
    default:
      {
        [m] = ib(w);
      }
  }
  return <path d={m} fill="none" className="react-flow__connection-path" style={e} />;
};
export default _Component8;