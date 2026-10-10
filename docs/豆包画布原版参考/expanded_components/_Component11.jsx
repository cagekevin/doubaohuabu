// TODO(全局, 无需 import): initialNodes, initialEdges, defaultNodes, defaultEdges, initialWidth, initialHeight, initialMinZoom, initialMaxZoom, initialFitViewOptions, fitView, nodeOrigin, nodeExtent, zIndexMode, children, nodes, e, edges, t, n, r, width, s, height, o, u, minZoom, a, maxZoom, l, fitViewOptions, c, d, f, p, m, h
import _cmp_F2 from './F2.jsx';
import _cmp__Component1 from './_Component1.jsx';
import { nM, _Component10 } from './shared.js';
import * as g from 'react';
export default function _Component11({
  initialNodes: e,
  initialEdges: t,
  defaultNodes: n,
  defaultEdges: r,
  initialWidth: s,
  initialHeight: o,
  initialMinZoom: a,
  initialMaxZoom: l,
  initialFitViewOptions: c,
  fitView: u,
  nodeOrigin: d,
  nodeExtent: f,
  zIndexMode: p,
  children: h
}) {
  const [m] = g.useState(() => {
    return nM({
      nodes: e,
      edges: t,
      defaultNodes: n,
      defaultEdges: r,
      width: s,
      height: o,
      fitView: u,
      minZoom: a,
      maxZoom: l,
      fitViewOptions: c,
      nodeOrigin: d,
      nodeExtent: f,
      zIndexMode: p
    });
  });
  return <_Component10 value={m}>
      <_cmp_F2>
        <_cmp__Component1>{h}</_cmp__Component1>
      </_cmp_F2>
    </_Component10>;
}