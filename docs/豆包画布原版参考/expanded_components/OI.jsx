// TODO(全局, 无需 import): isReconnectable, reconnectRadius, edge, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, onReconnect, onReconnectStart, onReconnectEnd, setReconnecting, setUpdateHover, k, autoPanOnConnect, domNode, connectionMode, connectionRadius, lib, onConnectStart, cancelConnection, nodeLookup, rfId, panBy, updateConnection, m, N, p, f, H, n, J, u, d, I, C, E, P, S, handleId, nodeId, O, isTarget, F, edgeUpdaterType, j, flowId, R, z, D, isValidConnection, se, onConnect, U, _, onConnectEnd, M, A, getTransform, getFromHandle, dragThreshold, handleDomNode, w, type, h, e, l, r, s, t, v, b, x, c, o, a, y
import _cmp__Component6 from './_Component6.jsx';
import { Ut, up, id } from './shared.js';
import * as i from 'react';
export default function OI({
  isReconnectable: e,
  reconnectRadius: t,
  edge: n,
  sourceX: r,
  sourceY: s,
  targetX: o,
  targetY: a,
  sourcePosition: l,
  targetPosition: c,
  onReconnect: u,
  onReconnectStart: d,
  onReconnectEnd: f,
  setReconnecting: p,
  setUpdateHover: h
}) {
  const m = Ut();
  const w = (k, N) => {
    if (k.button !== 0) {
      return;
    }
    const {
      autoPanOnConnect: C,
      domNode: S,
      connectionMode: E,
      connectionRadius: P,
      lib: j,
      onConnectStart: I,
      cancelConnection: z,
      nodeLookup: O,
      rfId: R,
      panBy: D,
      updateConnection: A
    } = m.getState();
    const F = N.type === 'target';
    const M = (H, J) => {
      p(false);
      if (f != null) {
        f(H, n, N.type, J);
      }
    };
    const U = H => {
      if (u == null) {
        return undefined;
      } else {
        return u(n, H);
      }
    };
    const _ = (H, J) => {
      p(true);
      if (d != null) {
        d(k, n, N.type);
      }
      if (I != null) {
        I(H, J);
      }
    };
    up.onPointerDown(k.nativeEvent, {
      autoPanOnConnect: C,
      connectionMode: E,
      connectionRadius: P,
      domNode: S,
      handleId: N.id,
      nodeId: N.nodeId,
      nodeLookup: O,
      isTarget: F,
      edgeUpdaterType: N.type,
      lib: j,
      flowId: R,
      cancelConnection: z,
      panBy: D,
      isValidConnection: (...H) => {
        var J;
        var se;
        return ((se = (J = m.getState()).isValidConnection) == null ? undefined : se.call(J, ...H)) ?? true;
      },
      onConnect: U,
      onConnectStart: _,
      onConnectEnd: (...H) => {
        var J;
        var se;
        if ((se = (J = m.getState()).onConnectEnd) == null) {
          return undefined;
        } else {
          return se.call(J, ...H);
        }
      },
      onReconnectEnd: M,
      updateConnection: A,
      getTransform: () => {
        return m.getState().transform;
      },
      getFromHandle: () => {
        return m.getState().connection.fromHandle;
      },
      dragThreshold: m.getState().connectionDragThreshold,
      handleDomNode: k.currentTarget
    });
  };
  const v = k => {
    return w(k, {
      nodeId: n.target,
      id: n.targetHandle ?? null,
      type: 'target'
    });
  };
  const y = k => {
    return w(k, {
      nodeId: n.source,
      id: n.sourceHandle ?? null,
      type: 'source'
    });
  };
  const b = () => {
    return h(true);
  };
  const x = () => {
    return h(false);
  };
  return <i.Fragment>
      {(e === true || e === 'source') && <_cmp__Component6 position={l} centerX={r} centerY={s} radius={t} onMouseDown={v} onMouseEnter={b} onMouseOut={x} type="source" />}
      {(e === true || e === 'target') && <_cmp__Component6 position={c} centerX={o} centerY={a} radius={t} onMouseDown={y} onMouseEnter={b} onMouseOut={x} type="target" />}
    </i.Fragment>;
}