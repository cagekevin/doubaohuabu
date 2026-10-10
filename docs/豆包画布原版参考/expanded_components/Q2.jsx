// TODO(全局, 无需 import): isSelecting, selectionKeyPressed, selectionMode, panOnDrag, autoPanOnSelection, paneClickDistance, selectionOnDrag, onSelectionStart, onSelectionEnd, onPaneClick, onPaneContextMenu, onPaneScroll, onPaneMouseEnter, onPaneMouseMove, onPaneMouseLeave, children, userSelectionActive, elementsSelectable, dragging, panBy, autoPanSpeed, x, e, b, y, O, z, u, q, nodesSelectionActive, r, d, f, domNode, transform, ce, P, E, re, Ee, le, te, oe, userSelectionRect, width, height, startX, X, startY, nodeLookup, edgeLookup, connectionLookup, triggerNodeChanges, triggerEdgeChanges, defaultEdgeOptions, he, je, Ve, j, I, Ie, ze, n, et, ct, edgeId, De, wt, At, ut, Qe, Je, R, C, N, v, J, H, D, se, resetSelectedElements, t, o, l, A, c, draggable, ne, k, selection, S, F, M, p, ke, h, V, pe, _, U, m, w
import _cmp_X2 from './X2.jsx';
import { na, Ut, Et, J2, Vt, ir, Ui, sa, Oh, Fg, Po, Uh, Zt, Ed, $u } from './shared.js';
import * as g from 'react';
export default function Q2({
  isSelecting: e,
  selectionKeyPressed: t,
  selectionMode: n = na.Full,
  panOnDrag: r,
  autoPanOnSelection: s,
  paneClickDistance: o,
  selectionOnDrag: a,
  onSelectionStart: l,
  onSelectionEnd: c,
  onPaneClick: u,
  onPaneContextMenu: d,
  onPaneScroll: f,
  onPaneMouseEnter: p,
  onPaneMouseMove: h,
  onPaneMouseLeave: m,
  children: w
}) {
  const v = g.useRef(0);
  const y = Ut();
  const {
    userSelectionActive: b,
    elementsSelectable: x,
    dragging: k,
    panBy: N,
    autoPanSpeed: C
  } = Et(J2, Vt);
  const S = x && (e || b);
  const E = g.useRef(null);
  const P = g.useRef();
  const j = g.useRef(new Set());
  const I = g.useRef(new Set());
  const z = g.useRef(false);
  const O = g.useRef(false);
  const R = g.useRef({
    x: 0,
    y: 0
  });
  const D = g.useRef(false);
  const A = q => {
    if (O.current || z.current || y.getState().connection.inProgress) {
      O.current = false;
      z.current = false;
      return;
    }
    if (u != null) {
      u(q);
    }
    y.getState().resetSelectedElements();
    y.setState({
      nodesSelectionActive: false
    });
  };
  const F = q => {
    if (Array.isArray(r) && r != null && r.includes(2)) {
      q.preventDefault();
      return;
    }
    if (d != null) {
      d(q);
    }
  };
  const M = f ? q => {
    return f(q);
  } : undefined;
  const U = q => {
    if (O.current) {
      q.stopPropagation();
      O.current = false;
    }
  };
  const _ = q => {
    var re;
    var Ee;
    const {
      domNode: ce,
      transform: oe
    } = y.getState();
    if (ce == null) {
      P.current = undefined;
    } else {
      P.current = ce.getBoundingClientRect();
    }
    if (!P.current) {
      return;
    }
    const he = q.target === E.current;
    if (!he && !!q.target.closest('.nokey') || !e || (!a || !he) && !t || q.button !== 0 || !q.isPrimary) {
      return;
    }
    if ((Ee = (re = q.target) == null ? undefined : re.setPointerCapture) != null) {
      Ee.call(re, q.pointerId);
    }
    O.current = false;
    const {
      x: le,
      y: te
    } = ir(q.nativeEvent, P.current);
    const X = Ui({
      x: le,
      y: te
    }, oe);
    y.setState({
      userSelectionRect: {
        width: 0,
        height: 0,
        startX: X.x,
        startY: X.y,
        x: le,
        y: te
      }
    });
    if (!he) {
      q.stopPropagation();
      q.preventDefault();
    }
  };
  function H(q, ce) {
    const {
      userSelectionRect: oe
    } = y.getState();
    if (!oe) {
      return;
    }
    const {
      transform: he,
      nodeLookup: Ie,
      edgeLookup: De,
      connectionLookup: le,
      triggerNodeChanges: te,
      triggerEdgeChanges: X,
      defaultEdgeOptions: re
    } = y.getState();
    const Ee = {
      x: oe.startX,
      y: oe.startY
    };
    const {
      x: je,
      y: Ve
    } = sa(Ee, he);
    const ze = {
      startX: Ee.x,
      startY: Ee.y,
      x: q < je ? q : je,
      y: ce < Ve ? ce : Ve,
      width: Math.abs(q - je),
      height: Math.abs(ce - Ve)
    };
    const Qe = j.current;
    const Je = I.current;
    j.current = new Set(Oh(Ie, ze, he, n === na.Partial, true).map(et => {
      return et.id;
    }));
    I.current = new Set();
    const ut = (re == null ? undefined : re.selectable) ?? true;
    for (const et of j.current) {
      const ct = le.get(et);
      if (ct) {
        for (const {
          edgeId: wt
        } of ct.values()) {
          const At = De.get(wt);
          if (At && (At.selectable ?? ut)) {
            I.current.add(wt);
          }
        }
      }
    }
    if (!Fg(Qe, j.current)) {
      const et = Po(Ie, j.current, true);
      te(et);
    }
    if (!Fg(Je, I.current)) {
      const et = Po(De, I.current);
      X(et);
    }
    y.setState({
      userSelectionRect: ze,
      userSelectionActive: true,
      nodesSelectionActive: false
    });
  }
  function J() {
    if (!s || !P.current) {
      return;
    }
    const [q, ce] = Uh(R.current, P.current, C);
    N({
      x: q,
      y: ce
    }).then(oe => {
      if (!O.current || !oe) {
        v.current = requestAnimationFrame(J);
        return;
      }
      const {
        x: he,
        y: Ie
      } = R.current;
      H(he, Ie);
      v.current = requestAnimationFrame(J);
    });
  }
  const se = () => {
    cancelAnimationFrame(v.current);
    v.current = 0;
    D.current = false;
  };
  g.useEffect(() => {
    return () => {
      return se();
    };
  }, []);
  const ke = q => {
    const {
      userSelectionRect: ce,
      transform: oe,
      resetSelectedElements: he
    } = y.getState();
    if (!P.current || !ce) {
      return;
    }
    const {
      x: Ie,
      y: De
    } = ir(q.nativeEvent, P.current);
    R.current = {
      x: Ie,
      y: De
    };
    const le = sa({
      x: ce.startX,
      y: ce.startY
    }, oe);
    if (!O.current) {
      const te = t ? 0 : o;
      if (Math.hypot(Ie - le.x, De - le.y) <= te) {
        return;
      }
      he();
      if (l != null) {
        l(q);
      }
    }
    O.current = true;
    if (!D.current) {
      J();
      D.current = true;
    }
    H(Ie, De);
  };
  const V = q => {
    var ce;
    var oe;
    if (!S) {
      if (q.target === E.current && y.getState().connection.inProgress) {
        z.current = true;
      }
      return;
    }
    if (q.button === 0) {
      if ((oe = (ce = q.target) == null ? undefined : ce.releasePointerCapture) != null) {
        oe.call(ce, q.pointerId);
      }
      if (!b && q.target === E.current && y.getState().userSelectionRect) {
        if (A != null) {
          A(q);
        }
      }
      y.setState({
        userSelectionActive: false,
        userSelectionRect: null
      });
      if (O.current) {
        if (c != null) {
          c(q);
        }
        y.setState({
          nodesSelectionActive: j.current.size > 0
        });
      }
      se();
    }
  };
  const pe = q => {
    var ce;
    var oe;
    if ((oe = (ce = q.target) == null ? undefined : ce.releasePointerCapture) != null) {
      oe.call(ce, q.pointerId);
    }
    se();
  };
  const ne = r === true || Array.isArray(r) && r.includes(0);
  return <div className={Zt(['react-flow__pane', {
    draggable: ne,
    dragging: k,
    selection: e
  }])} onClick={S ? undefined : Ed(A, E)} onContextMenu={Ed(F, E)} onWheel={Ed(M, E)} onPointerEnter={S ? undefined : p} onPointerMove={S ? ke : h} onPointerUp={V} onPointerCancel={S ? pe : undefined} onPointerDownCapture={S ? _ : undefined} onClickCapture={S ? U : undefined} onPointerLeave={m} ref={E} style={$u}>
      {w}
      <_cmp_X2 />
    </div>;
}