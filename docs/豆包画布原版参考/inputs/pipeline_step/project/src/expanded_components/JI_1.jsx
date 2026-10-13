// TODO(全局, 无需 import): containerStyle, style, type, component, nodesConnectable, width, height, isValid, inProgress, e, o, a, l, t, n, r
import _cmp__Component8 from './_Component8.jsx';
import { Et, XI, Vt, Zt, qx, g } from './shared.js';
export default function JI({
  containerStyle: e,
  style: t,
  type: n,
  component: r
}) {
  const {
    nodesConnectable: s,
    width: o,
    height: a,
    isValid: l,
    inProgress: c
  } = Et(XI, Vt);
  if (!o || !s || !c) {
    return null;
  } else {
    return <svg style={e} width={o} height={a} className="react-flow__connectionline react-flow__container">
        <g className={Zt(['react-flow__connection', qx(l)])}>
          <_cmp__Component8 style={t} type={n} CustomComponent={r} isValid={l} />
        </g>
      </svg>;
  }
}