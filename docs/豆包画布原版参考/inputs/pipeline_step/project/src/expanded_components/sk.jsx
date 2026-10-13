// TODO(全局, 无需 import): nodeTypes, edgeTypes, onInit, onNodeClick, onEdgeClick, onNodeDoubleClick, onEdgeDoubleClick, onNodeMouseEnter, onNodeMouseMove, onNodeMouseLeave, onNodeContextMenu, onSelectionContextMenu, onSelectionStart, onSelectionEnd, connectionLineType, connectionLineStyle, connectionLineComponent, connectionLineContainerStyle, selectionKeyCode, selectionOnDrag, selectionMode, multiSelectionKeyCode, panActivationKeyCode, zoomActivationKeyCode, deleteKeyCode, onlyRenderVisibleElements, elementsSelectable, defaultViewport, translateExtent, minZoom, maxZoom, preventScrolling, defaultMarkerColor, zoomOnScroll, zoomOnPinch, panOnScroll, panOnScrollSpeed, panOnScrollMode, zoomOnDoubleClick, panOnDrag, autoPanOnSelection, onPaneClick, onPaneMouseEnter, onPaneMouseMove, onPaneMouseLeave, onPaneScroll, onPaneContextMenu, paneClickDistance, nodeClickDistance, onEdgeContextMenu, onEdgeMouseEnter, onEdgeMouseMove, onEdgeMouseLeave, reconnectRadius, onReconnect, onReconnectStart, onReconnectEnd, noDragClassName, noWheelClassName, noPanClassName, disableKeyboardA11y, nodeExtent, rfId, viewport, onViewportChange, nodesDraggable, e, t, n, wt, V, pe, ne, q, oe, ce, he, E, b, x, k, p, h, N, C, S, j, F, M, J, U, _, H, se, ke, I, z, O, R, f, D, ze, Qe, Je, ut, At, s, a, Ee, je, Ve, P, De, le, te, X, re, A, ct, w, m, v, y, r, o, l, c, u, d, Ie, et, _t
import _cmp_HI from './HI.jsx';
import _cmp_JI_1 from './JI_1.jsx';
import { Sy, ZI, WI, GI, _Component0, NI } from './shared.js';
export default function sk({
  nodeTypes: e,
  edgeTypes: t,
  onInit: n,
  onNodeClick: r,
  onEdgeClick: s,
  onNodeDoubleClick: o,
  onEdgeDoubleClick: a,
  onNodeMouseEnter: l,
  onNodeMouseMove: c,
  onNodeMouseLeave: u,
  onNodeContextMenu: d,
  onSelectionContextMenu: f,
  onSelectionStart: p,
  onSelectionEnd: h,
  connectionLineType: m,
  connectionLineStyle: w,
  connectionLineComponent: v,
  connectionLineContainerStyle: y,
  selectionKeyCode: b,
  selectionOnDrag: x,
  selectionMode: k,
  multiSelectionKeyCode: N,
  panActivationKeyCode: C,
  zoomActivationKeyCode: S,
  deleteKeyCode: E,
  onlyRenderVisibleElements: P,
  elementsSelectable: j,
  defaultViewport: I,
  translateExtent: z,
  minZoom: O,
  maxZoom: R,
  preventScrolling: D,
  defaultMarkerColor: A,
  zoomOnScroll: F,
  zoomOnPinch: M,
  panOnScroll: U,
  panOnScrollSpeed: _,
  panOnScrollMode: H,
  zoomOnDoubleClick: J,
  panOnDrag: se,
  autoPanOnSelection: ke,
  onPaneClick: V,
  onPaneMouseEnter: pe,
  onPaneMouseMove: ne,
  onPaneMouseLeave: q,
  onPaneScroll: ce,
  onPaneContextMenu: oe,
  paneClickDistance: he,
  nodeClickDistance: Ie,
  onEdgeContextMenu: De,
  onEdgeMouseEnter: le,
  onEdgeMouseMove: te,
  onEdgeMouseLeave: X,
  reconnectRadius: re,
  onReconnect: Ee,
  onReconnectStart: je,
  onReconnectEnd: Ve,
  noDragClassName: ze,
  noWheelClassName: Qe,
  noPanClassName: Je,
  disableKeyboardA11y: ut,
  nodeExtent: et,
  rfId: ct,
  viewport: wt,
  onViewportChange: At,
  nodesDraggable: _t
}) {
  Sy(e);
  Sy(t);
  ZI();
  WI(n);
  GI(wt);
  return <_Component0 onPaneClick={V} onPaneMouseEnter={pe} onPaneMouseMove={ne} onPaneMouseLeave={q} onPaneContextMenu={oe} onPaneScroll={ce} paneClickDistance={he} deleteKeyCode={E} selectionKeyCode={b} selectionOnDrag={x} selectionMode={k} onSelectionStart={p} onSelectionEnd={h} multiSelectionKeyCode={N} panActivationKeyCode={C} zoomActivationKeyCode={S} elementsSelectable={j} zoomOnScroll={F} zoomOnPinch={M} zoomOnDoubleClick={J} panOnScroll={U} panOnScrollSpeed={_} panOnScrollMode={H} panOnDrag={se} autoPanOnSelection={ke} defaultViewport={I} translateExtent={z} minZoom={O} maxZoom={R} onSelectionContextMenu={f} preventScrolling={D} noDragClassName={ze} noWheelClassName={Qe} noPanClassName={Je} disableKeyboardA11y={ut} onViewportChange={At} isControlledViewport={!!wt}>
      <_cmp_HI>
        <BI edgeTypes={t} onEdgeClick={s} onEdgeDoubleClick={a} onReconnect={Ee} onReconnectStart={je} onReconnectEnd={Ve} onlyRenderVisibleElements={P} onEdgeContextMenu={De} onEdgeMouseEnter={le} onEdgeMouseMove={te} onEdgeMouseLeave={X} reconnectRadius={re} defaultMarkerColor={A} noPanClassName={Je} disableKeyboardA11y={ut} rfId={ct} />
        <_cmp_JI_1 style={w} type={m} component={v} containerStyle={y} />
        <div className="react-flow__edgelabel-renderer" />
        <NI nodeTypes={e} onNodeClick={r} onNodeDoubleClick={o} onNodeMouseEnter={l} onNodeMouseMove={c} onNodeMouseLeave={u} onNodeContextMenu={d} nodeClickDistance={Ie} onlyRenderVisibleElements={P} noPanClassName={Je} noDragClassName={ze} disableKeyboardA11y={ut} nodeExtent={et} rfId={ct} nodesDraggable={_t} />
        <div className="react-flow__viewport-portal" />
      </_cmp_HI>
    </_Component0>;
}