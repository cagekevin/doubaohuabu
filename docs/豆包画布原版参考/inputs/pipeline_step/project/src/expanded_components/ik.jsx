// TODO(全局, 无需 import): style, showZoom, showFitView, showInteractive, fitViewOptions, onZoomIn, onZoomOut, onFitView, onInteractiveChange, className, children, position, orientation, isInteractive, minZoomReached, maxZoomReached, ariaLabelConfig, zoomIn, zoomOut, fitView, x, o, k, a, N, s, l, m, nodesDraggable, nodesConnectable, elementsSelectable, c, p, j, u, f, e, h, b, t, C, y, S, v, n, E, r, P, w, d
import _cmp_Mu from './Mu.jsx';
import _cmp__Component17 from './_Component17.jsx';
import _cmp__Component16 from './_Component16.jsx';
import _cmp__Component18 from './_Component18.jsx';
import _cmp__Component19 from './_Component19.jsx';
import _cmp__Component20 from './_Component20.jsx';
import _cmp__Component21 from './_Component21.jsx';
import { Ut, Et, SM, Vt, Kr, Zt } from './shared.js';
import * as i from 'react';
export default function ik({
  style: e,
  showZoom: t = true,
  showFitView: n = true,
  showInteractive: r = true,
  fitViewOptions: s,
  onZoomIn: o,
  onZoomOut: a,
  onFitView: l,
  onInteractiveChange: c,
  className: u,
  children: d,
  position: f = 'bottom-left',
  orientation: p = 'vertical',
  'aria-label': h
}) {
  const m = Ut();
  const {
    isInteractive: w,
    minZoomReached: v,
    maxZoomReached: y,
    ariaLabelConfig: b
  } = Et(SM, Vt);
  const {
    zoomIn: x,
    zoomOut: k,
    fitView: N
  } = Kr();
  const C = () => {
    x();
    if (o != null) {
      o();
    }
  };
  const S = () => {
    k();
    if (a != null) {
      a();
    }
  };
  const E = () => {
    N(s);
    if (l != null) {
      l();
    }
  };
  const P = () => {
    m.setState({
      nodesDraggable: !w,
      nodesConnectable: !w,
      elementsSelectable: !w
    });
    if (c != null) {
      c(!w);
    }
  };
  const j = p === 'horizontal' ? 'horizontal' : 'vertical';
  return <_cmp_Mu className={Zt(['react-flow__controls', j, u])} position={f} style={e} data-testid="rf__controls" aria-label={h ?? b['controls.ariaLabel']}>
      {t && <i.Fragment>
          <_cmp__Component17 onClick={C} className="react-flow__controls-zoomin" title={b['controls.zoomIn.ariaLabel']} aria-label={b['controls.zoomIn.ariaLabel']} disabled={y}>
            <_cmp__Component16 />
          </_cmp__Component17>
          <_cmp__Component17 onClick={S} className="react-flow__controls-zoomout" title={b['controls.zoomOut.ariaLabel']} aria-label={b['controls.zoomOut.ariaLabel']} disabled={v}>
            <_cmp__Component18 />
          </_cmp__Component17>
        </i.Fragment>}
      {n && <_cmp__Component17 className="react-flow__controls-fitview" onClick={E} title={b['controls.fitView.ariaLabel']} aria-label={b['controls.fitView.ariaLabel']}>
          <_cmp__Component19 />
        </_cmp__Component17>}
      {r && <_cmp__Component17 className="react-flow__controls-interactive" onClick={P} title={b['controls.interactive.ariaLabel']} aria-label={b['controls.interactive.ariaLabel']}>
          {w ? <_cmp__Component20 /> : <_cmp__Component21 />}
        </_cmp__Component17>}
      {d}
    </_cmp_Mu>;
}