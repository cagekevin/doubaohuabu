// TODO(全局, 无需 import): style, className, nodeStrokeColor, nodeColor, nodeClassName, nodeBorderRadius, nodeStrokeWidth, nodeComponent, bgColor, maskColor, maskStrokeColor, maskStrokeWidth, position, onClick, onNodeClick, pannable, zoomable, ariaLabel, inversePan, zoomStep, offsetScale, boundingRect, viewBB, rfId, panZoom, translateExtent, flowWidth, flowHeight, ariaLabelConfig, e, S, D, A, F, M, U, k, _, J, H, P, q, C, j, ce, domNode, getTransform, N, getViewScale, De, I, width, z, height, O, b, w, x, v, h, X, le, y, te, m, R, p, c, u, d, f, r, n, a, t, se, ke, V, pe, ne, oe, Ie, he, o, s, l, E
import _cmp_Mu from './Mu.jsx';
import { Ut, Et, RM, DM, $M, TM, LM, $A, Zt, MM } from './shared.js';
import * as g from 'react';
export default function lk({
  style: e,
  className: t,
  nodeStrokeColor: n,
  nodeColor: r,
  nodeClassName: s = '',
  nodeBorderRadius: o = 5,
  nodeStrokeWidth: a,
  nodeComponent: l,
  bgColor: c,
  maskColor: u,
  maskStrokeColor: d,
  maskStrokeWidth: f,
  position: p = 'bottom-right',
  onClick: h,
  onNodeClick: m,
  pannable: w = false,
  zoomable: v = false,
  ariaLabel: y,
  inversePan: b,
  zoomStep: x = 1,
  offsetScale: k = 5
}) {
  const N = Ut();
  const C = g.useRef(null);
  const {
    boundingRect: S,
    viewBB: E,
    rfId: P,
    panZoom: j,
    translateExtent: I,
    flowWidth: z,
    flowHeight: O,
    ariaLabelConfig: R
  } = Et(RM, DM);
  const D = (e == null ? undefined : e.width) ?? $M;
  const A = (e == null ? undefined : e.height) ?? TM;
  const F = S.width / D;
  const M = S.height / A;
  const U = Math.max(F, M);
  const _ = U * D;
  const H = U * A;
  const J = k * U;
  const se = S.x - (_ - S.width) / 2 - J;
  const ke = S.y - (H - S.height) / 2 - J;
  const V = _ + J * 2;
  const pe = H + J * 2;
  const ne = `${LM}-${P}`;
  const q = g.useRef(0);
  const ce = g.useRef();
  q.current = U;
  g.useEffect(() => {
    if (C.current && j) {
      ce.current = $A({
        domNode: C.current,
        panZoom: j,
        getTransform: () => {
          return N.getState().transform;
        },
        getViewScale: () => {
          return q.current;
        }
      });
      return () => {
        var De;
        if ((De = ce.current) != null) {
          De.destroy();
        }
      };
    }
  }, [j]);
  g.useEffect(() => {
    var De;
    if ((De = ce.current) != null) {
      De.update({
        translateExtent: I,
        width: z,
        height: O,
        inversePan: b,
        pannable: w,
        zoomStep: x,
        zoomable: v
      });
    }
  }, [w, v, b, x, I, z, O]);
  const oe = h ? De => {
    var X;
    const [le, te] = ((X = ce.current) == null ? undefined : X.pointer(De)) || [0, 0];
    h(De, {
      x: le,
      y: te
    });
  } : undefined;
  const he = m ? g.useCallback((De, le) => {
    const te = N.getState().nodeLookup.get(le).internals.userNode;
    m(De, te);
  }, []) : undefined;
  const Ie = y ?? R['minimap.ariaLabel'];
  return <_cmp_Mu position={p} style={{
    ...e,
    '--xy-minimap-background-color-props': typeof c == 'string' ? c : undefined,
    '--xy-minimap-mask-background-color-props': typeof u == 'string' ? u : undefined,
    '--xy-minimap-mask-stroke-color-props': typeof d == 'string' ? d : undefined,
    '--xy-minimap-mask-stroke-width-props': typeof f == 'number' ? f * U : undefined,
    '--xy-minimap-node-background-color-props': typeof r == 'string' ? r : undefined,
    '--xy-minimap-node-stroke-color-props': typeof n == 'string' ? n : undefined,
    '--xy-minimap-node-stroke-width-props': typeof a == 'number' ? a : undefined
  }} className={Zt(['react-flow__minimap', t])} data-testid="rf__minimap">
      <svg width={D} height={A} viewBox={`${se} ${ke} ${V} ${pe}`} className="react-flow__minimap-svg" role="img" aria-labelledby={ne} ref={C} onClick={oe}>
        {Ie && <title id={ne}>{Ie}</title>}
        <MM onClick={he} nodeColor={r} nodeStrokeColor={n} nodeBorderRadius={o} nodeClassName={s} nodeStrokeWidth={a} nodeComponent={l} />
        <path className="react-flow__minimap-mask" d={`M${se - J},${ke - J}h${V + J * 2}v${pe + J * 2}h${-V - J * 2}z
        M${E.x},${E.y}h${E.width}v${E.height}h${-E.width}z`} fillRule="evenodd" pointerEvents="none" />
      </svg>
    </_cmp_Mu>;
}