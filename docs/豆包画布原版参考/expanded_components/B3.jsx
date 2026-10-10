// TODO(全局, 无需 import): source, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, screenToFlowPosition, I, e, t, n, m, h, x, y, w, f, v, r, s, l, o, a, c, curvature, p, u, N, C, O, R, z, D, A, k, cursor, b, S, d, position, transform, E, pointerEvents, zIndex, P, j
import _cmp__Component5 from './_Component5.jsx';
import { id, Kr, Et, ju, L, W0, _Component35 } from './shared.js';
import * as g from 'react';
import * as i from 'react';
export default function B3({
  id: e,
  source: t,
  target: n,
  sourceX: r,
  sourceY: s,
  targetX: o,
  targetY: a,
  sourcePosition: l,
  targetPosition: c
}) {
  const {
    screenToFlowPosition: u
  } = Kr();
  const [d, f] = g.useState(false);
  const [p, h] = g.useState(null);
  const m = g.useRef(null);
  const w = g.useRef(null);
  const v = 1000;
  const y = Et(I => {
    return !!I.edgeLookup && !!I.edgeLookup.get(e) && !!I.edgeLookup.get(e).selected || !!I.nodeLookup && !!I.nodeLookup.get(t) && !!I.nodeLookup.get(t).selected || !!I.nodeLookup && !!I.nodeLookup.get(n) && !!I.nodeLookup.get(n).selected;
  });
  const b = I => {
    if (m.current) {
      clearTimeout(m.current);
      m.current = null;
    }
    if ((I == null ? undefined : I.clientX) != null) {
      h({
        x: I.clientX,
        y: I.clientY
      });
    }
    if (w.current) {
      clearTimeout(w.current);
    }
    w.current = setTimeout(() => {
      f(true);
      w.current = null;
    }, v);
  };
  const x = () => {
    if (w.current) {
      clearTimeout(w.current);
      w.current = null;
    }
    if (m.current) {
      clearTimeout(m.current);
    }
    m.current = setTimeout(() => {
      f(false);
      h(null);
    }, 120);
  };
  const [k, N, C] = ju({
    sourceX: r,
    sourceY: s,
    sourcePosition: l,
    targetX: o,
    targetY: a,
    targetPosition: c,
    curvature: 0.3
  });
  const S = g.useCallback(I => {
    if (I.clientX != null) {
      h({
        x: I.clientX,
        y: I.clientY
      });
    }
  }, []);
  const E = p ? u({
    x: p.x,
    y: p.y
  }) : {
    x: N,
    y: C
  };
  const P = g.useCallback(I => {
    I.stopPropagation();
    const z = L.getState();
    const O = (p == null ? undefined : p.x) ?? window.innerWidth / 2;
    const R = (p == null ? undefined : p.y) ?? window.innerHeight / 2;
    let D;
    try {
      D = u({
        x: O,
        y: R
      });
    } catch {
      D = {
        x: (r + o) / 2,
        y: (s + a) / 2
      };
    }
    const A = z.addText({
      x: D.x - W0.w / 2,
      y: D.y - W0.h / 2
    });
    z.removeEdge(e);
    z.addConnection({
      source: t,
      target: A
    });
    z.addConnection({
      source: A,
      target: n
    });
    f(false);
    h(null);
  }, [e, t, n, r, s, o, a, p, u]);
  const j = g.useCallback(I => {
    I.stopPropagation();
    L.getState().removeEdge(e);
    f(false);
    h(null);
  }, [e]);
  return <i.Fragment>
      <_cmp__Component5 id={e} path={k} markerEnd={undefined} className={y ? 'edge-hl' : undefined} />
      <path d={k} fill="none" stroke="transparent" strokeWidth={28} style={{
      cursor: 'pointer'
    }} onMouseEnter={b} onMouseLeave={x} onMouseMove={S} />
      <_Component35>
        {d && <div className="edge-actions edge-actions-v2 nodrag nopan" style={{
        position: 'absolute',
        transform: `translate(-50%, -50%) translate(${E.x}px, ${E.y}px)`,
        pointerEvents: 'all',
        zIndex: 9999
      }} onMouseEnter={I => {
        I.stopPropagation();
        b(I);
      }} onMouseLeave={x}>
            <button type="button" className="edge-act edge-act-add edge-act-lg" title="插入节点" onClick={P}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="9" />
                <path d="M12 8v8M8 12h8" />
              </svg>
            </button>
            <button type="button" className="edge-act edge-act-del edge-act-lg" title="断开连线" onClick={j}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="9" />
                <path d="M15 9l-6 6M9 9l6 6" />
              </svg>
            </button>
          </div>}
      </_Component35>
    </i.Fragment>;
}