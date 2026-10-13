// TODO(全局, 无需 import): defaultColor, rfId, o, n, t, e, defaultMarkerStart, r, defaultMarkerEnd, s
import _cmp_AI_1 from './AI_1.jsx';
import { Et, mA, id } from './shared.js';
import * as g from 'react';
const Bb = ({
  defaultColor: e,
  rfId: t
}) => {
  const n = Et(o => {
    return o.edges;
  });
  const r = Et(o => {
    return o.defaultEdgeOptions;
  });
  const s = g.useMemo(() => {
    return mA(n, {
      id: t,
      defaultColor: e,
      defaultMarkerStart: r == null ? undefined : r.markerStart,
      defaultMarkerEnd: r == null ? undefined : r.markerEnd
    });
  }, [n, r, t, e]);
  if (s.length) {
    return <svg className="react-flow__marker" aria-hidden="true">
        <defs>
          {s.map(o => {
          return <_cmp_AI_1 id={o.id} type={o.type} color={o.color} width={o.width} height={o.height} markerUnits={o.markerUnits} strokeWidth={o.strokeWidth} orient={o.orient} key={o.id} />;
        })}
        </defs>
      </svg>;
  } else {
    return null;
  }
};
export default Bb;