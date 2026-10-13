// TODO(全局, 无需 import): children, onPaneClick, onPaneMouseEnter, onPaneMouseMove, onPaneMouseLeave, onPaneContextMenu, onPaneScroll, paneClickDistance, deleteKeyCode, selectionKeyCode, selectionOnDrag, selectionMode, onSelectionStart, onSelectionEnd, multiSelectionKeyCode, panActivationKeyCode, zoomActivationKeyCode, elementsSelectable, zoomOnScroll, zoomOnPinch, panOnScroll, panOnScrollSpeed, panOnScrollMode, zoomOnDoubleClick, panOnDrag, autoPanOnSelection, defaultViewport, translateExtent, minZoom, maxZoom, preventScrolling, onSelectionContextMenu, noWheelClassName, noPanClassName, disableKeyboardA11y, onViewportChange, isControlledViewport, nodesSelectionActive, userSelectionActive, u, w, ke, E, k, d, V, se, J, ne, c, m, o, y, b, x, pe, N, C, S, j, I, z, O, v, R, A, F, U, _, l, p, h, t, n, r, s, a, P, f, e, H, D, M
import _cmp_K2 from './K2.jsx';
import _cmp_Q2 from './Q2.jsx';
import _cmp__Component from './_Component.jsx';
import { Et, hI, Vt, ki, my, V2 } from './shared.js';
export default function zb({
  children: e,
  onPaneClick: t,
  onPaneMouseEnter: n,
  onPaneMouseMove: r,
  onPaneMouseLeave: s,
  onPaneContextMenu: o,
  onPaneScroll: a,
  paneClickDistance: l,
  deleteKeyCode: c,
  selectionKeyCode: u,
  selectionOnDrag: d,
  selectionMode: f,
  onSelectionStart: p,
  onSelectionEnd: h,
  multiSelectionKeyCode: m,
  panActivationKeyCode: w,
  zoomActivationKeyCode: v,
  elementsSelectable: y,
  zoomOnScroll: b,
  zoomOnPinch: x,
  panOnScroll: k,
  panOnScrollSpeed: N,
  panOnScrollMode: C,
  zoomOnDoubleClick: S,
  panOnDrag: E,
  autoPanOnSelection: P,
  defaultViewport: j,
  translateExtent: I,
  minZoom: z,
  maxZoom: O,
  preventScrolling: R,
  onSelectionContextMenu: D,
  noWheelClassName: A,
  noPanClassName: F,
  disableKeyboardA11y: M,
  onViewportChange: U,
  isControlledViewport: _
}) {
  const {
    nodesSelectionActive: H,
    userSelectionActive: J
  } = Et(hI, Vt);
  const se = ki(u, {
    target: my
  });
  const ke = ki(w, {
    target: my
  });
  const V = ke || E;
  const pe = ke || k;
  const ne = d && V !== true;
  const q = se || J || ne;
  V2({
    deleteKeyCode: c,
    multiSelectionKeyCode: m
  });
  return <_cmp_K2 onPaneContextMenu={o} elementsSelectable={y} zoomOnScroll={b} zoomOnPinch={x} panOnScroll={pe} panOnScrollSpeed={N} panOnScrollMode={C} zoomOnDoubleClick={S} panOnDrag={!se && V} defaultViewport={j} translateExtent={I} minZoom={z} maxZoom={O} zoomActivationKeyCode={v} preventScrolling={R} noWheelClassName={A} noPanClassName={F} onViewportChange={U} isControlledViewport={_} paneClickDistance={l} selectionOnDrag={ne}>
      <_cmp_Q2 onSelectionStart={p} onSelectionEnd={h} onPaneClick={t} onPaneMouseEnter={n} onPaneMouseMove={r} onPaneMouseLeave={s} onPaneContextMenu={o} onPaneScroll={a} panOnDrag={V} autoPanOnSelection={P} isSelecting={!!q} selectionMode={f} selectionKeyPressed={se} paneClickDistance={l} selectionOnDrag={ne}>
        {e}
        {H && <_cmp__Component onSelectionContextMenu={D} noPanClassName={F} disableKeyboardA11y={M} />}
      </_cmp_Q2>
    </_cmp_K2>;
}