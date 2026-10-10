// TODO(全局, 无需 import): children, nodes, edges, defaultNodes, defaultEdges, width, height, fitView, fitViewOptions, minZoom, maxZoom, nodeOrigin, nodeExtent, zIndexMode, e, t, n, r, s, o, a, l, c, u, d, f, p, h
import _cmp__Component11 from './_Component11.jsx';
import { Iu } from './shared.js';
import * as g from 'react';
import * as i from 'react';
export default function _Component13({
  children: e,
  nodes: t,
  edges: n,
  defaultNodes: r,
  defaultEdges: s,
  width: o,
  height: a,
  fitView: l,
  fitViewOptions: c,
  minZoom: u,
  maxZoom: d,
  nodeOrigin: f,
  nodeExtent: p,
  zIndexMode: h
}) {
  if (g.useContext(Iu)) {
    return <i.Fragment>{e}</i.Fragment>;
  } else {
    return <_cmp__Component11 initialNodes={t} initialEdges={n} defaultNodes={r} defaultEdges={s} initialWidth={o} initialHeight={a} fitView={l} initialFitViewOptions={c} initialMinZoom={u} initialMaxZoom={d} nodeOrigin={f} nodeExtent={p} zIndexMode={h}>
        {e}
      </_cmp__Component11>;
  }
}