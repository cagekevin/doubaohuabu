// TODO(全局, 无需 import): edgesFocusable, edgesReconnectable, elementsSelectable, onClick, onDoubleClick, onContextMenu, onMouseEnter, onMouseMove, onMouseLeave, reconnectRadius, onReconnect, onReconnectStart, onReconnectEnd, rfId, edgeTypes, noPanClassName, onError, disableKeyboardA11y, Ie, e, k, x, w, N, C, y, n, zIndex, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, sourceNode, De, targetNode, le, sourceHandle, targetHandle, connectionMode, selected, elevateOnSelect, zIndexMode, te, X, m, F, M, U, _, addSelectedEdges, unselectNodesAndEdges, multiSelectionActive, D, P, nodesSelectionActive, nodes, edges, j, s, o, a, l, c, u, A, v, animated, inactive, updating, I, selectable, V, pe, ne, q, ce, oe, S, he, H, J, se, ke, E, d, f, p, h, z, R
import _cmp_OI from './OI.jsx';
import { id, Et, vy, dr, Ut, wy, hA, aA, Vt, lp, Wx, Zt, _b } from './shared.js';
import * as g from 'react';
export default function UI({
  id: e,
  edgesFocusable: t,
  edgesReconnectable: n,
  elementsSelectable: r,
  onClick: s,
  onDoubleClick: o,
  onContextMenu: a,
  onMouseEnter: l,
  onMouseMove: c,
  onMouseLeave: u,
  reconnectRadius: d,
  onReconnect: f,
  onReconnectStart: p,
  onReconnectEnd: h,
  rfId: m,
  edgeTypes: w,
  noPanClassName: v,
  onError: y,
  disableKeyboardA11y: b
}) {
  let x = Et(Ie => {
    return Ie.edgeLookup.get(e);
  });
  const k = Et(Ie => {
    return Ie.defaultEdgeOptions;
  });
  if (k) {
    x = {
      ...k,
      ...x
    };
  } else {
    x = x;
  }
  let N = x.type || 'default';
  let C = (w == null ? undefined : w[N]) || vy[N];
  if (C === undefined) {
    if (y != null) {
      y('011', dr.error011(N));
    }
    N = 'default';
    C = (w == null ? undefined : w.default) || vy.default;
  }
  const S = !!x.focusable || !!t && typeof x.focusable === 'undefined';
  const E = typeof f !== 'undefined' && (x.reconnectable || n && typeof x.reconnectable === 'undefined');
  const P = !!x.selectable || !!r && typeof x.selectable === 'undefined';
  const j = g.useRef(null);
  const [I, z] = g.useState(false);
  const [O, R] = g.useState(false);
  const D = Ut();
  const {
    zIndex: A = x.zIndex,
    sourceX: F,
    sourceY: M,
    targetX: U,
    targetY: _,
    sourcePosition: H,
    targetPosition: J
  } = Et(g.useCallback(Ie => {
    const De = Ie.nodeLookup.get(x.source);
    const le = Ie.nodeLookup.get(x.target);
    if (!De || !le) {
      return wy;
    }
    const te = hA({
      id: e,
      sourceNode: De,
      targetNode: le,
      sourceHandle: x.sourceHandle || null,
      targetHandle: x.targetHandle || null,
      connectionMode: Ie.connectionMode,
      onError: y
    });
    const X = aA({
      selected: x.selected,
      zIndex: x.zIndex,
      sourceNode: De,
      targetNode: le,
      elevateOnSelect: Ie.elevateEdgesOnSelect,
      zIndexMode: Ie.zIndexMode
    });
    return {
      ...(te || wy),
      zIndex: X
    };
  }, [x.source, x.target, x.sourceHandle, x.targetHandle, x.selected, x.zIndex]), Vt);
  const se = g.useMemo(() => {
    if (x.markerStart) {
      return `url('#${lp(x.markerStart, m)}')`;
    } else {
      return undefined;
    }
  }, [x.markerStart, m]);
  const ke = g.useMemo(() => {
    if (x.markerEnd) {
      return `url('#${lp(x.markerEnd, m)}')`;
    } else {
      return undefined;
    }
  }, [x.markerEnd, m]);
  if (x.hidden || F === null || M === null || U === null || _ === null) {
    return null;
  }
  const V = Ie => {
    var X;
    const {
      addSelectedEdges: De,
      unselectNodesAndEdges: le,
      multiSelectionActive: te
    } = D.getState();
    if (P) {
      D.setState({
        nodesSelectionActive: false
      });
      if (x.selected && te) {
        le({
          nodes: [],
          edges: [x]
        });
        if ((X = j.current) != null) {
          X.blur();
        }
      } else {
        De([e]);
      }
    }
    if (s) {
      s(Ie, x);
    }
  };
  const pe = o ? Ie => {
    o(Ie, {
      ...x
    });
  } : undefined;
  const ne = a ? Ie => {
    a(Ie, {
      ...x
    });
  } : undefined;
  const q = l ? Ie => {
    l(Ie, {
      ...x
    });
  } : undefined;
  const ce = c ? Ie => {
    c(Ie, {
      ...x
    });
  } : undefined;
  const oe = u ? Ie => {
    u(Ie, {
      ...x
    });
  } : undefined;
  const he = Ie => {
    var De;
    if (!b && Wx.includes(Ie.key) && P) {
      const {
        unselectNodesAndEdges: le,
        addSelectedEdges: te
      } = D.getState();
      if (Ie.key === 'Escape') {
        if ((De = j.current) != null) {
          De.blur();
        }
        le({
          edges: [x]
        });
      } else {
        te([e]);
      }
    }
  };
  return <svg style={{
    zIndex: A
  }}>
      <g className={Zt(['react-flow__edge', `react-flow__edge-${N}`, x.className, v, {
      selected: x.selected,
      animated: x.animated,
      inactive: !P && !s,
      updating: I,
      selectable: P
    }])} onClick={V} onDoubleClick={pe} onContextMenu={ne} onMouseEnter={q} onMouseMove={ce} onMouseLeave={oe} onKeyDown={S ? he : undefined} tabIndex={S ? 0 : undefined} role={x.ariaRole ?? (S ? 'group' : 'img')} aria-roledescription="edge" data-id={e} data-testid={`rf__edge-${e}`} aria-label={x.ariaLabel === null ? undefined : x.ariaLabel || `Edge from ${x.source} to ${x.target}`} aria-describedby={S ? `${_b}-${m}` : undefined} ref={j} {...x.domAttributes}>
        {!O && <C id={e} source={x.source} target={x.target} type={x.type} selected={x.selected} animated={x.animated} selectable={P} deletable={x.deletable ?? true} label={x.label} labelStyle={x.labelStyle} labelShowBg={x.labelShowBg} labelBgStyle={x.labelBgStyle} labelBgPadding={x.labelBgPadding} labelBgBorderRadius={x.labelBgBorderRadius} sourceX={F} sourceY={M} targetX={U} targetY={_} sourcePosition={H} targetPosition={J} data={x.data} style={x.style} sourceHandleId={x.sourceHandle} targetHandleId={x.targetHandle} markerStart={se} markerEnd={ke} pathOptions={'pathOptions' in x ? x.pathOptions : undefined} interactionWidth={x.interactionWidth} />}
        {E && <_cmp_OI edge={x} isReconnectable={E} reconnectRadius={d} onReconnect={f} onReconnectStart={p} onReconnectEnd={h} sourceX={F} sourceY={M} targetX={U} targetY={_} sourcePosition={H} targetPosition={J} setUpdateHover={z} setReconnecting={R} />}
      </g>
    </svg>;
}