// TODO(全局, 无需 import): children, nodes, setNodes, hasDefaultNodes, onNodesChange, nodeLookup, fitViewQueued, onNodesChangeMiddlewareMap, t, c, l, y, w, items, lookup, p, m, v, d, u, f, h, x, b, n, edges, setEdges, hasDefaultEdges, onEdgesChange, edgeLookup, s, nodeQueue, r, edgeQueue, o, a, e
import { Ut, cy, fy, Rb } from './shared.js';
import * as g from 'react';
export default function F2({
  children: e
}) {
  const t = Ut();
  const n = g.useCallback(l => {
    const {
      nodes: c = [],
      setNodes: u,
      hasDefaultNodes: d,
      onNodesChange: f,
      nodeLookup: p,
      fitViewQueued: h,
      onNodesChangeMiddlewareMap: m
    } = t.getState();
    let w = c;
    for (const y of l) {
      if (typeof y == 'function') {
        w = y(w);
      } else {
        w = y;
      }
    }
    let v = cy({
      items: w,
      lookup: p
    });
    for (const y of m.values()) {
      v = y(v);
    }
    if (d) {
      u(w);
    }
    if (v.length > 0) {
      if (f != null) {
        f(v);
      }
    } else if (h) {
      window.requestAnimationFrame(() => {
        const {
          fitViewQueued: y,
          nodes: b,
          setNodes: x
        } = t.getState();
        if (y) {
          x(b);
        }
      });
    }
  }, []);
  const r = fy(n);
  const s = g.useCallback(l => {
    const {
      edges: c = [],
      setEdges: u,
      hasDefaultEdges: d,
      onEdgesChange: f,
      edgeLookup: p
    } = t.getState();
    let h = c;
    for (const m of l) {
      if (typeof m == 'function') {
        h = m(h);
      } else {
        h = m;
      }
    }
    if (d) {
      u(h);
    } else if (f) {
      f(cy({
        items: h,
        lookup: p
      }));
    }
  }, []);
  const o = fy(s);
  const a = g.useMemo(() => {
    return {
      nodeQueue: r,
      edgeQueue: o
    };
  }, []);
  return <Rb.Provider value={a}>{e}</Rb.Provider>;
}