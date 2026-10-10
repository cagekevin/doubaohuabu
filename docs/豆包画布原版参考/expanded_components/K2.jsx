// TODO(全局, 无需 import): onPaneContextMenu, zoomOnScroll, zoomOnPinch, panOnScroll, panOnScrollSpeed, panOnScrollMode, zoomOnDoubleClick, panOnDrag, defaultViewport, translateExtent, minZoom, maxZoom, zoomActivationKeyCode, preventScrolling, children, noWheelClassName, noPanClassName, onViewportChange, isControlledViewport, paneClickDistance, selectionOnDrag, userSelectionActive, lib, connectionInProgress, p, C, y, x, O, zoom, N, transform, b, I, domNode, d, f, u, viewport, c, onDraggingChange, F, A, paneDragging, onPanZoomStart, onViewportChangeStart, onMoveStart, U, M, onPanZoom, onMove, onPanZoomEnd, onViewportChangeEnd, onMoveEnd, panZoom, R, D, e, t, n, r, s, o, a, l, zoomActivationKeyPressed, j, h, v, S, w, E, onTransformChange, z, P, k, m
import { Gs, Ut, Et, q2, Vt, ki, G2, zA, $u } from './shared.js';
import * as g from 'react';
export default function K2({
  onPaneContextMenu: e,
  zoomOnScroll: t = true,
  zoomOnPinch: n = true,
  panOnScroll: r = false,
  panOnScrollSpeed: s = 0.5,
  panOnScrollMode: o = Gs.Free,
  zoomOnDoubleClick: a = true,
  panOnDrag: l = true,
  defaultViewport: c,
  translateExtent: u,
  minZoom: d,
  maxZoom: f,
  zoomActivationKeyCode: p,
  preventScrolling: h = true,
  children: m,
  noWheelClassName: w,
  noPanClassName: v,
  onViewportChange: y,
  isControlledViewport: b,
  paneClickDistance: x,
  selectionOnDrag: k
}) {
  const N = Ut();
  const C = g.useRef(null);
  const {
    userSelectionActive: S,
    lib: E,
    connectionInProgress: P
  } = Et(q2, Vt);
  const j = ki(p);
  const I = g.useRef();
  G2(C);
  const z = g.useCallback(O => {
    if (y != null) {
      y({
        x: O[0],
        y: O[1],
        zoom: O[2]
      });
    }
    if (!b) {
      N.setState({
        transform: O
      });
    }
  }, [y, b]);
  g.useEffect(() => {
    if (C.current) {
      I.current = zA({
        domNode: C.current,
        minZoom: d,
        maxZoom: f,
        translateExtent: u,
        viewport: c,
        onDraggingChange: A => {
          return N.setState(F => {
            if (F.paneDragging === A) {
              return F;
            } else {
              return {
                paneDragging: A
              };
            }
          });
        },
        onPanZoomStart: (A, F) => {
          const {
            onViewportChangeStart: M,
            onMoveStart: U
          } = N.getState();
          if (U != null) {
            U(A, F);
          }
          if (M != null) {
            M(F);
          }
        },
        onPanZoom: (A, F) => {
          const {
            onViewportChange: M,
            onMove: U
          } = N.getState();
          if (U != null) {
            U(A, F);
          }
          if (M != null) {
            M(F);
          }
        },
        onPanZoomEnd: (A, F) => {
          const {
            onViewportChangeEnd: M,
            onMoveEnd: U
          } = N.getState();
          if (U != null) {
            U(A, F);
          }
          if (M != null) {
            M(F);
          }
        }
      });
      const {
        x: O,
        y: R,
        zoom: D
      } = I.current.getViewport();
      N.setState({
        panZoom: I.current,
        transform: [O, R, D],
        domNode: C.current.closest('.react-flow')
      });
      return () => {
        var A;
        if ((A = I.current) != null) {
          A.destroy();
        }
      };
    }
  }, []);
  g.useEffect(() => {
    var O;
    if ((O = I.current) != null) {
      O.update({
        onPaneContextMenu: e,
        zoomOnScroll: t,
        zoomOnPinch: n,
        panOnScroll: r,
        panOnScrollSpeed: s,
        panOnScrollMode: o,
        zoomOnDoubleClick: a,
        panOnDrag: l,
        zoomActivationKeyPressed: j,
        preventScrolling: h,
        noPanClassName: v,
        userSelectionActive: S,
        noWheelClassName: w,
        lib: E,
        onTransformChange: z,
        connectionInProgress: P,
        selectionOnDrag: k,
        paneClickDistance: x
      });
    }
  }, [e, t, n, r, s, o, a, l, j, h, v, S, w, E, z, P, k, x]);
  return <div className="react-flow__renderer" ref={C} style={$u}>
      {m}
    </div>;
}