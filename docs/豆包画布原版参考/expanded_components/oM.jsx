// TODO(全局, 无需 import): nodes, edges, defaultNodes, defaultEdges, className, nodeTypes, edgeTypes, onNodeClick, onEdgeClick, onInit, onMove, onMoveStart, onMoveEnd, onConnect, onConnectStart, onConnectEnd, onClickConnectStart, onClickConnectEnd, onNodeMouseEnter, onNodeMouseMove, onNodeMouseLeave, onNodeContextMenu, onNodeDoubleClick, onNodeDragStart, onNodeDrag, onNodeDragStop, onNodesDelete, onEdgesDelete, onDelete, onSelectionChange, onSelectionDragStart, onSelectionDrag, onSelectionDragStop, onSelectionContextMenu, onSelectionStart, onSelectionEnd, onBeforeDelete, connectionMode, connectionLineType, connectionLineStyle, connectionLineComponent, connectionLineContainerStyle, deleteKeyCode, selectionKeyCode, selectionOnDrag, selectionMode, panActivationKeyCode, multiSelectionKeyCode, zoomActivationKeyCode, snapToGrid, snapGrid, onlyRenderVisibleElements, selectNodesOnDrag, nodesDraggable, autoPanOnNodeFocus, nodesConnectable, nodesFocusable, nodeOrigin, edgesFocusable, edgesReconnectable, elementsSelectable, defaultViewport, minZoom, maxZoom, translateExtent, preventScrolling, nodeExtent, defaultMarkerColor, zoomOnScroll, zoomOnPinch, panOnScroll, panOnScrollSpeed, panOnScrollMode, zoomOnDoubleClick, panOnDrag, onPaneClick, onPaneMouseEnter, onPaneMouseMove, onPaneMouseLeave, onPaneScroll, onPaneContextMenu, paneClickDistance, nodeClickDistance, children, onReconnect, onReconnectStart, onReconnectEnd, onEdgeContextMenu, onEdgeDoubleClick, onEdgeMouseEnter, onEdgeMouseMove, onEdgeMouseLeave, reconnectRadius, onNodesChange, onEdgesChange, noDragClassName, noWheelClassName, noPanClassName, fitView, fitViewOptions, connectOnClick, attributionPosition, proOptions, defaultEdgeOptions, elevateNodesOnSelect, elevateEdgesOnSelect, disableKeyboardA11y, autoPanOnConnect, autoPanOnNodeDrag, autoPanOnSelection, autoPanSpeed, connectionRadius, isValidConnection, onError, style, nodeDragThreshold, connectionDragThreshold, viewport, onViewportChange, width, height, colorMode, debug, onScroll, ariaLabelConfig, zIndexMode, fe, ht, B, left, behavior, $t, $n, uo, Ce, Yr, s, pa, e, t, rt, ot, lt, st, ct, wt, ze, Mt, yt, n, r, h, m, w, v, y, re, Ee, je, Ve, Qe, Je, ut, Re, $, Se, ge, De, le, H, At, dt, Me, j, I, z, S, E, P, D, R, A, d, f, p, He, Qn, be, ye, $e, W, at, Fe, X, Te, Ue, _, bt, mt, u, l, c, b, x, k, N, C, o, a, J, se, ke, V, ne, q, ce, pe, he, oe, Ie, te, et, _t, Rt, Be, Nt, it, kt, xt, gt, Ne, Ke, Ct, ee, Q, me, ve, qe, tt, F, M, U, nt, _e, Z, T, K, Y, de, ae, we, zt, Le, Ge, ie, Ye, Pe, O, Ae, xe, G
import _cmp__Component13 from './_Component13.jsx';
import _cmp_I2 from './I2.jsx';
import _cmp_C2 from './C2.jsx';
import _cmp_N2 from './N2.jsx';
import { is, na, bi, Ab, M2, wi, Gs, id, R2, sM, Zt, _Component12, P2 } from './shared.js';
import * as g from 'react';
export default function oM({
  nodes: e,
  edges: t,
  defaultNodes: n,
  defaultEdges: r,
  className: s,
  nodeTypes: o,
  edgeTypes: a,
  onNodeClick: l,
  onEdgeClick: c,
  onInit: u,
  onMove: d,
  onMoveStart: f,
  onMoveEnd: p,
  onConnect: h,
  onConnectStart: m,
  onConnectEnd: w,
  onClickConnectStart: v,
  onClickConnectEnd: y,
  onNodeMouseEnter: b,
  onNodeMouseMove: x,
  onNodeMouseLeave: k,
  onNodeContextMenu: N,
  onNodeDoubleClick: C,
  onNodeDragStart: S,
  onNodeDrag: E,
  onNodeDragStop: P,
  onNodesDelete: j,
  onEdgesDelete: I,
  onDelete: z,
  onSelectionChange: O,
  onSelectionDragStart: R,
  onSelectionDrag: D,
  onSelectionDragStop: A,
  onSelectionContextMenu: F,
  onSelectionStart: M,
  onSelectionEnd: U,
  onBeforeDelete: _,
  connectionMode: H,
  connectionLineType: J = is.Bezier,
  connectionLineStyle: se,
  connectionLineComponent: ke,
  connectionLineContainerStyle: V,
  deleteKeyCode: pe = 'Backspace',
  selectionKeyCode: ne = 'Shift',
  selectionOnDrag: q = false,
  selectionMode: ce = na.Full,
  panActivationKeyCode: oe = 'Space',
  multiSelectionKeyCode: he = bi() ? 'Meta' : 'Control',
  zoomActivationKeyCode: Ie = bi() ? 'Meta' : 'Control',
  snapToGrid: De,
  snapGrid: le,
  onlyRenderVisibleElements: te = false,
  selectNodesOnDrag: X,
  nodesDraggable: re,
  autoPanOnNodeFocus: Ee,
  nodesConnectable: je,
  nodesFocusable: Ve,
  nodeOrigin: ze = Ab,
  edgesFocusable: Qe,
  edgesReconnectable: Je,
  elementsSelectable: ut = true,
  defaultViewport: et = M2,
  minZoom: ct = 0.5,
  maxZoom: wt = 2,
  translateExtent: At = wi,
  preventScrolling: _t = true,
  nodeExtent: Mt,
  defaultMarkerColor: zt = '#b1b1b7',
  zoomOnScroll: Rt = true,
  zoomOnPinch: Be = true,
  panOnScroll: it = false,
  panOnScrollSpeed: kt = 0.5,
  panOnScrollMode: xt = Gs.Free,
  zoomOnDoubleClick: Nt = true,
  panOnDrag: gt = true,
  onPaneClick: Ke,
  onPaneMouseEnter: Ct,
  onPaneMouseMove: ee,
  onPaneMouseLeave: Q,
  onPaneScroll: me,
  onPaneContextMenu: ve,
  paneClickDistance: qe = 1,
  nodeClickDistance: tt = 0,
  children: Ae,
  onReconnect: nt,
  onReconnectStart: _e,
  onReconnectEnd: Z,
  onEdgeContextMenu: T,
  onEdgeDoubleClick: K,
  onEdgeMouseEnter: Y,
  onEdgeMouseMove: de,
  onEdgeMouseLeave: ae,
  reconnectRadius: we = 10,
  onNodesChange: Se,
  onEdgesChange: ge,
  noDragClassName: Le = 'nodrag',
  noWheelClassName: Ge = 'nowheel',
  noPanClassName: He = 'nopan',
  fitView: lt,
  fitViewOptions: st,
  connectOnClick: dt,
  attributionPosition: G,
  proOptions: xe,
  defaultEdgeOptions: Me,
  elevateNodesOnSelect: Re = true,
  elevateEdgesOnSelect: $ = false,
  disableKeyboardA11y: ie = false,
  autoPanOnConnect: be,
  autoPanOnNodeDrag: ye,
  autoPanOnSelection: Ne = true,
  autoPanSpeed: $e,
  connectionRadius: at,
  isValidConnection: Fe,
  onError: W,
  style: Ce,
  id: fe,
  nodeDragThreshold: Te,
  connectionDragThreshold: Ue,
  viewport: Ye,
  onViewportChange: Pe,
  width: rt,
  height: ot,
  colorMode: ht = 'light',
  debug: bt,
  onScroll: $t,
  ariaLabelConfig: mt,
  zIndexMode: yt = 'basic',
  ...$n
}, Yr) {
  const Qn = fe || '1';
  const pa = R2(ht);
  const uo = g.useCallback(B => {
    B.currentTarget.scrollTo({
      top: 0,
      left: 0,
      behavior: 'instant'
    });
    if ($t != null) {
      $t(B);
    }
  }, [$t]);
  return <div data-testid="rf__wrapper" {...$n} onScroll={uo} style={{
    ...Ce,
    ...sM
  }} ref={Yr} className={Zt(['react-flow', s, pa])} id={fe} role="application">
      <_cmp__Component13 nodes={e} edges={t} width={rt} height={ot} fitView={lt} fitViewOptions={st} minZoom={ct} maxZoom={wt} nodeOrigin={ze} nodeExtent={Mt} zIndexMode={yt}>
        <P2 nodes={e} edges={t} defaultNodes={n} defaultEdges={r} onConnect={h} onConnectStart={m} onConnectEnd={w} onClickConnectStart={v} onClickConnectEnd={y} nodesDraggable={re} autoPanOnNodeFocus={Ee} nodesConnectable={je} nodesFocusable={Ve} edgesFocusable={Qe} edgesReconnectable={Je} elementsSelectable={ut} elevateNodesOnSelect={Re} elevateEdgesOnSelect={$} minZoom={ct} maxZoom={wt} nodeExtent={Mt} onNodesChange={Se} onEdgesChange={ge} snapToGrid={De} snapGrid={le} connectionMode={H} translateExtent={At} connectOnClick={dt} defaultEdgeOptions={Me} fitView={lt} fitViewOptions={st} onNodesDelete={j} onEdgesDelete={I} onDelete={z} onNodeDragStart={S} onNodeDrag={E} onNodeDragStop={P} onSelectionDrag={D} onSelectionDragStart={R} onSelectionDragStop={A} onMove={d} onMoveStart={f} onMoveEnd={p} noPanClassName={He} nodeOrigin={ze} rfId={Qn} autoPanOnConnect={be} autoPanOnNodeDrag={ye} autoPanSpeed={$e} onError={W} connectionRadius={at} isValidConnection={Fe} selectNodesOnDrag={X} nodeDragThreshold={Te} connectionDragThreshold={Ue} onBeforeDelete={_} debug={bt} ariaLabelConfig={mt} zIndexMode={yt} />
        <_Component12 onInit={u} onNodeClick={l} onEdgeClick={c} onNodeMouseEnter={b} onNodeMouseMove={x} onNodeMouseLeave={k} onNodeContextMenu={N} onNodeDoubleClick={C} nodeTypes={o} edgeTypes={a} connectionLineType={J} connectionLineStyle={se} connectionLineComponent={ke} connectionLineContainerStyle={V} selectionKeyCode={ne} selectionOnDrag={q} selectionMode={ce} deleteKeyCode={pe} multiSelectionKeyCode={he} panActivationKeyCode={oe} zoomActivationKeyCode={Ie} onlyRenderVisibleElements={te} defaultViewport={et} translateExtent={At} minZoom={ct} maxZoom={wt} preventScrolling={_t} zoomOnScroll={Rt} zoomOnPinch={Be} zoomOnDoubleClick={Nt} panOnScroll={it} panOnScrollSpeed={kt} panOnScrollMode={xt} panOnDrag={gt} autoPanOnSelection={Ne} onPaneClick={Ke} onPaneMouseEnter={Ct} onPaneMouseMove={ee} onPaneMouseLeave={Q} onPaneScroll={me} onPaneContextMenu={ve} paneClickDistance={qe} nodeClickDistance={tt} onSelectionContextMenu={F} onSelectionStart={M} onSelectionEnd={U} onReconnect={nt} onReconnectStart={_e} onReconnectEnd={Z} onEdgeContextMenu={T} onEdgeDoubleClick={K} onEdgeMouseEnter={Y} onEdgeMouseMove={de} onEdgeMouseLeave={ae} reconnectRadius={we} defaultMarkerColor={zt} noDragClassName={Le} noWheelClassName={Ge} noPanClassName={He} rfId={Qn} disableKeyboardA11y={ie} nodeExtent={Mt} viewport={Ye} onViewportChange={Pe} nodesDraggable={re} />
        <_cmp_I2 onSelectionChange={O} />
        {Ae}
        <_cmp_C2 proOptions={xe} position={G} />
        <_cmp_N2 rfId={Qn} disableKeyboardA11y={ie} />
      </_cmp__Component13>
    </div>;
}