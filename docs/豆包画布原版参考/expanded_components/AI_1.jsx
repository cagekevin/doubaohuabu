// TODO(全局, 无需 import): type, color, width, height, markerUnits, strokeWidth, orient, t, _Component4, e, r, s, o, l, n, a
import { id, _I } from './shared.js';
const AI = ({
  id: e,
  type: t,
  color: n,
  width: r = 12.5,
  height: s = 12.5,
  markerUnits: o = 'strokeWidth',
  strokeWidth: a,
  orient: l = 'auto-start-reverse'
}) => {
  const _Component4 = _I(t);
  if (_Component4) {
    return <marker className="react-flow__arrowhead" id={e} markerWidth={`${r}`} markerHeight={`${s}`} viewBox="-10 -10 20 20" markerUnits={o} orient={l} refX="0" refY="0">
        <_Component4 color={n} strokeWidth={a} />
      </marker>;
  } else {
    return null;
  }
};
export default AI;