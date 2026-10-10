// TODO(全局, 无需 import): onClick, onMouseEnter, onMouseMove, onMouseLeave, onContextMenu, onDoubleClick, nodesDraggable, elementsSelectable, nodesConnectable, nodesFocusable, resizeObserver, noDragClassName, noPanClassName, disableKeyboardA11y, rfId, nodeTypes, nodeClickDistance, onError, node, internals, isParent, q, e, ce, oe, x, v, C, S, b, nodeType, hasDimensions, O, f, nodeRef, R, disabled, p, handleSelector, nodeId, isSelectable, P, y, E, t, n, r, s, k, o, a, selectNodesOnDrag, nodeDragThreshold, z, store, unselect, ariaLabelConfig, ariaLiveMessage, direction, A, factor, m, le, transform, width, height, autoPanOnNodeFocus, setCenter, Ie, F, zoom, h, selected, selectable, N, draggable, dragging, D, zIndex, pointerEvents, U, visibility, M, _, H, J, se, V, ke, I, pe, ne, w, j
import { id, Et, Vt, hy, dr, Ut, eb, xI, Db, Lb, _r, dI, dp, rb, Wx, Rc, Oh, Zt, jb, _Component2 } from "./shared.js";
export default function bI({
  id: e,
  onClick: t,
  onMouseEnter: n,
  onMouseMove: r,
  onMouseLeave: s,
  onContextMenu: o,
  onDoubleClick: a,
  nodesDraggable: l,
  elementsSelectable: c,
  nodesConnectable: u,
  nodesFocusable: d,
  resizeObserver: f,
  noDragClassName: p,
  noPanClassName: h,
  disableKeyboardA11y: m,
  rfId: w,
  nodeTypes: v,
  nodeClickDistance: y,
  onError: b
}) {
  const {
    node: x,
    internals: k,
    isParent: N
  } = Et(q => {
    const ce = q.nodeLookup.get(e);
    const oe = q.parentLookup.has(e);
    return {
      node: ce,
      internals: ce.internals,
      isParent: oe
    };
  }, Vt);
  let C = x.type || 'default';
  let S = (v == null ? undefined : v[C]) || hy[C];
  if (S === undefined) {
    if (b != null) {
      b('003', dr.error003(C));
    }
    C = 'default';
    S = (v == null ? undefined : v.default) || hy.default;
  }
  const E = !!x.draggable || !!l && typeof x.draggable === 'undefined';
  const P = !!x.selectable || !!c && typeof x.selectable === 'undefined';
  const j = !!x.connectable || !!u && typeof x.connectable === 'undefined';
  const I = !!x.focusable || !!d && typeof x.focusable === 'undefined';
  const z = Ut();
  const O = eb(x);
  const R = xI({
    node: x,
    nodeType: C,
    hasDimensions: O,
    resizeObserver: f
  });
  const D = Db({
    nodeRef: R,
    disabled: x.hidden || !E,
    noDragClassName: p,
    handleSelector: x.dragHandle,
    nodeId: e,
    isSelectable: P,
    nodeClickDistance: y
  });
  const A = Lb();
  if (x.hidden) {
    return null;
  }
  const F = _r(x);
  const M = dI(x);
  const U = P || E || t || n || r || s;
  const _ = n ? q => {
    return n(q, {
      ...k.userNode
    });
  } : undefined;
  const H = r ? q => {
    return r(q, {
      ...k.userNode
    });
  } : undefined;
  const J = s ? q => {
    return s(q, {
      ...k.userNode
    });
  } : undefined;
  const se = o ? q => {
    return o(q, {
      ...k.userNode
    });
  } : undefined;
  const ke = a ? q => {
    return a(q, {
      ...k.userNode
    });
  } : undefined;
  const V = q => {
    const {
      selectNodesOnDrag: ce,
      nodeDragThreshold: oe
    } = z.getState();
    if (P && (!ce || !E || oe > 0)) {
      dp({
        id: e,
        store: z,
        nodeRef: R
      });
    }
    if (t) {
      t(q, {
        ...k.userNode
      });
    }
  };
  const pe = q => {
    if (!rb(q.nativeEvent) && !m) {
      if (Wx.includes(q.key) && P) {
        const ce = q.key === 'Escape';
        dp({
          id: e,
          store: z,
          unselect: ce,
          nodeRef: R
        });
      } else if (E && x.selected && Object.prototype.hasOwnProperty.call(Rc, q.key)) {
        q.preventDefault();
        const {
          ariaLabelConfig: ce
        } = z.getState();
        z.setState({
          ariaLiveMessage: ce['node.a11yDescription.ariaLiveMessage']({
            direction: q.key.replace('Arrow', '').toLowerCase(),
            x: ~~k.positionAbsolute.x,
            y: ~~k.positionAbsolute.y
          })
        });
        A({
          direction: Rc[q.key],
          factor: q.shiftKey ? 4 : 1
        });
      }
    }
  };
  const ne = () => {
    var le;
    if (m || (le = R.current) == null || !le.matches(':focus-visible')) {
      return;
    }
    const {
      transform: q,
      width: ce,
      height: oe,
      autoPanOnNodeFocus: he,
      setCenter: Ie
    } = z.getState();
    if (!he) {
      return;
    }
    if (!(Oh(new Map([[e, x]]), {
      x: 0,
      y: 0,
      width: ce,
      height: oe
    }, q, true).length > 0)) {
      Ie(x.position.x + F.width / 2, x.position.y + F.height / 2, {
        zoom: q[2]
      });
    }
  };
  return <div className={Zt(['react-flow__node', `react-flow__node-${C}`, {
    [h]: E
  }, x.className, {
    selected: x.selected,
    selectable: P,
    parent: N,
    draggable: E,
    dragging: D
  }])} ref={R} style={{
    zIndex: k.z,
    transform: `translate(${k.positionAbsolute.x}px,${k.positionAbsolute.y}px)`,
    pointerEvents: U ? 'all' : 'none',
    visibility: O ? 'visible' : 'hidden',
    ...x.style,
    ...M
  }} data-id={e} data-testid={`rf__node-${e}`} onMouseEnter={_} onMouseMove={H} onMouseLeave={J} onContextMenu={se} onClick={V} onDoubleClick={ke} onKeyDown={I ? pe : undefined} tabIndex={I ? 0 : undefined} onFocus={I ? ne : undefined} role={x.ariaRole ?? (I ? 'group' : undefined)} aria-roledescription="node" aria-describedby={m ? undefined : `${jb}-${w}`} aria-label={x.ariaLabel} {...x.domAttributes}>
      <_Component2 value={e}>
        <S id={e} data={x.data} type={C} positionAbsoluteX={k.positionAbsolute.x} positionAbsoluteY={k.positionAbsolute.y} selected={x.selected ?? false} selectable={P} draggable={E} deletable={x.deletable ?? true} isConnectable={j} sourcePosition={x.sourcePosition} targetPosition={x.targetPosition} dragging={D} dragHandle={x.dragHandle} zIndex={k.z} parentId={x.parentId} {...F} />
      </_Component2>
    </div>;
}