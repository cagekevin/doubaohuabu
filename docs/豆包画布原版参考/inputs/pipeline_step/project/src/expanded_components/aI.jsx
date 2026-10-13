// TODO(全局, 无需 import): type, position, isValidConnection, isConnectable, isConnectableStart, isConnectableEnd, onConnect, children, className, onMouseDown, onTouchStart, a, e, connectOnClick, noPanClassName, rfId, connectingFrom, connectingTo, clickConnecting, isPossibleEndHandle, connectionInProcess, clickConnectionInProcess, valid, y, m, v, A, D, defaultEdgeOptions, hasDefaultEdges, M, F, _, edges, setEdges, onError, se, H, J, ke, U, l, s, handleDomNode, autoPanOnConnect, connectionMode, connectionRadius, domNode, nodeLookup, lib, isTarget, w, handleId, nodeId, flowId, panBy, cancelConnection, onConnectStart, onConnectEnd, updateConnection, z, n, getTransform, getFromHandle, autoPanSpeed, dragThreshold, d, f, onClickConnectStart, onClickConnectEnd, connectionClickStartHandle, connection, handleType, isValid, handle, fromNodeId, fromHandleId, fromType, q, doc, ne, V, oe, ce, pe, he, t, k, x, u, source, connectable, r, connectablestart, connectableend, o, clickconnecting, S, connectingfrom, N, connectingto, C, I, connectionindicator, E, P, j, O, b, R, h, p, c
import { pt, id, Ut, Ob, rI, Et, oI, Vt, dr, yo, sb, up, nb, Zt } from './shared.js';
export default function aI({
  type: e = 'source',
  position: t = pt.Top,
  isValidConnection: n,
  isConnectable: r = true,
  isConnectableStart: s = true,
  isConnectableEnd: o = true,
  id: a,
  onConnect: l,
  children: c,
  className: u,
  onMouseDown: d,
  onTouchStart: f,
  ...p
}, h) {
  var D;
  var A;
  const m = a || null;
  const w = e === 'target';
  const v = Ut();
  const y = Ob();
  const {
    connectOnClick: b,
    noPanClassName: x,
    rfId: k
  } = rI();
  const {
    connectingFrom: N,
    connectingTo: C,
    clickConnecting: S,
    isPossibleEndHandle: E,
    connectionInProcess: P,
    clickConnectionInProcess: j,
    valid: I
  } = Et(oI(y, m, e), Vt);
  if (!y && (A = (D = v.getState()).onError) != null) {
    A.call(D, '010', dr.error010());
  }
  const z = F => {
    const {
      defaultEdgeOptions: M,
      onConnect: U,
      hasDefaultEdges: _
    } = v.getState();
    const H = {
      ...M,
      ...F
    };
    if (_) {
      const {
        edges: J,
        setEdges: se,
        onError: ke
      } = v.getState();
      se(yo(H, J, {
        onError: ke
      }));
    }
    if (U != null) {
      U(H);
    }
    if (l != null) {
      l(H);
    }
  };
  const O = F => {
    if (!y) {
      return;
    }
    const M = sb(F.nativeEvent);
    if (s && (M && F.button === 0 || !M)) {
      const U = v.getState();
      up.onPointerDown(F.nativeEvent, {
        handleDomNode: F.currentTarget,
        autoPanOnConnect: U.autoPanOnConnect,
        connectionMode: U.connectionMode,
        connectionRadius: U.connectionRadius,
        domNode: U.domNode,
        nodeLookup: U.nodeLookup,
        lib: U.lib,
        isTarget: w,
        handleId: m,
        nodeId: y,
        flowId: U.rfId,
        panBy: U.panBy,
        cancelConnection: U.cancelConnection,
        onConnectStart: U.onConnectStart,
        onConnectEnd: (..._) => {
          var H;
          var J;
          if ((J = (H = v.getState()).onConnectEnd) == null) {
            return undefined;
          } else {
            return J.call(H, ..._);
          }
        },
        updateConnection: U.updateConnection,
        onConnect: z,
        isValidConnection: n || ((..._) => {
          var H;
          var J;
          return ((J = (H = v.getState()).isValidConnection) == null ? undefined : J.call(H, ..._)) ?? true;
        }),
        getTransform: () => {
          return v.getState().transform;
        },
        getFromHandle: () => {
          return v.getState().connection.fromHandle;
        },
        autoPanSpeed: U.autoPanSpeed,
        dragThreshold: U.connectionDragThreshold
      });
    }
    if (M) {
      if (d != null) {
        d(F);
      }
    } else if (f != null) {
      f(F);
    }
  };
  const R = F => {
    const {
      onClickConnectStart: M,
      onClickConnectEnd: U,
      connectionClickStartHandle: _,
      connectionMode: H,
      isValidConnection: J,
      lib: se,
      rfId: ke,
      nodeLookup: V,
      connection: pe
    } = v.getState();
    if (!y || !_ && !s) {
      return;
    }
    if (!_) {
      if (M != null) {
        M(F.nativeEvent, {
          nodeId: y,
          handleId: m,
          handleType: e
        });
      }
      v.setState({
        connectionClickStartHandle: {
          nodeId: y,
          type: e,
          id: m
        }
      });
      return;
    }
    const ne = nb(F.target);
    const q = n || J;
    const {
      connection: ce,
      isValid: oe
    } = up.isValid(F.nativeEvent, {
      handle: {
        nodeId: y,
        id: m,
        type: e
      },
      connectionMode: H,
      fromNodeId: _.nodeId,
      fromHandleId: _.id || null,
      fromType: _.type,
      isValidConnection: q,
      flowId: ke,
      doc: ne,
      lib: se,
      nodeLookup: V
    });
    if (oe && ce) {
      z(ce);
    }
    const he = structuredClone(pe);
    delete he.inProgress;
    if (he.toHandle) {
      he.toPosition = he.toHandle.position;
    } else {
      he.toPosition = null;
    }
    if (U != null) {
      U(F, he);
    }
    v.setState({
      connectionClickStartHandle: null
    });
  };
  return <div data-handleid={m} data-nodeid={y} data-handlepos={t} data-id={`${k}-${y}-${m}-${e}`} className={Zt(['react-flow__handle', `react-flow__handle-${t}`, 'nodrag', x, u, {
    source: !w,
    target: w,
    connectable: r,
    connectablestart: s,
    connectableend: o,
    clickconnecting: S,
    connectingfrom: N,
    connectingto: C,
    valid: I,
    connectionindicator: r && (!P || E) && (P || j ? o : s)
  }])} onMouseDown={O} onTouchStart={O} onClick={b ? R : undefined} ref={h} {...p}>
      {c}
    </div>;
}