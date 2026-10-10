// TODO(全局, 无需 import): onGroupConnectEnd, p, screenToFlowPosition, t, s, b, v, y, h, m, x, w, k, minX, minY, maxX, maxY, count, o, c, start, targetEl, l, r, C, N, n, e, a, sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition, curvature, position, left, width, height, overflow, pointerEvents, d, f, marginLeft, marginTop, u
import { L, Kr, s3, o3, cx, cy, x1, y1, x2, y2, ju, _Component34 } from './shared.js';
import * as g from 'react';
export default function _Component37({
  onGroupConnectEnd: e
}) {
  const t = L(p => {
    return p.nodes;
  });
  const n = L(p => {
    return p.connectManyToTarget;
  });
  const {
    screenToFlowPosition: r
  } = Kr();
  const s = g.useMemo(() => {
    return t.filter(p => {
      return p.selected;
    });
  }, [t]);
  const o = g.useMemo(() => {
    var v;
    var y;
    if (s.length < 2) {
      return null;
    }
    let p = Infinity;
    let h = Infinity;
    let m = -Infinity;
    let w = -Infinity;
    for (const b of s) {
      const x = ((v = b.measured) == null ? undefined : v.width) ?? b.width ?? s3;
      const k = ((y = b.measured) == null ? undefined : y.height) ?? b.height ?? o3;
      p = Math.min(p, b.position.x);
      h = Math.min(h, b.position.y);
      m = Math.max(m, b.position.x + x);
      w = Math.max(w, b.position.y + k);
    }
    return {
      minX: p,
      minY: h,
      maxX: m,
      maxY: w,
      cx: (p + m) / 2,
      cy: (h + w) / 2,
      count: s.length
    };
  }, [s]);
  const [a, l] = g.useState(null);
  const c = g.useRef(null);
  const u = g.useCallback(p => {
    p.preventDefault();
    p.stopPropagation();
    if (!o) {
      return;
    }
    const h = {
      x: o.maxX + 24,
      y: o.cy
    };
    c.current = {
      start: h,
      targetEl: null
    };
    l({
      x1: h.x,
      y1: h.y,
      x2: h.x,
      y2: h.y
    });
    const m = v => {
      const y = r({
        x: v.clientX,
        y: v.clientY
      });
      l(C => {
        return C && {
          ...C,
          x2: y.x,
          y2: y.y
        };
      });
      const b = document.elementFromPoint(v.clientX, v.clientY);
      const x = b && b.closest('.react-flow__node');
      const k = x ? x.getAttribute('data-id') : null;
      const N = x && k && !s.some(C => {
        return C.id === k;
      });
      if (c.current.targetEl && c.current.targetEl !== x) {
        c.current.targetEl.classList.remove('gc-target-hint');
      }
      if (N) {
        x.classList.add('gc-target-hint');
        c.current.targetEl = x;
      } else {
        c.current.targetEl = null;
      }
    };
    const w = v => {
      window.removeEventListener('pointermove', m);
      window.removeEventListener('pointerup', w);
      const y = document.elementFromPoint(v.clientX, v.clientY);
      const b = y && y.closest('.react-flow__node');
      const x = b ? b.getAttribute('data-id') : null;
      if (b) {
        b.classList.remove('gc-target-hint');
      }
      c.current = null;
      l(null);
      if (x) {
        const k = s.map(N => {
          return N.id;
        }).filter(N => {
          return N !== x;
        });
        if (k.length > 0) {
          n(k, x);
        }
      } else {
        const k = s.map(N => {
          return N.id;
        });
        if (e && k.length > 0) {
          e(k, {
            x: v.clientX,
            y: v.clientY
          });
        }
      }
    };
    window.addEventListener('pointermove', m);
    window.addEventListener('pointerup', w);
  }, [o, r, s, n]);
  if (!o) {
    return null;
  }
  const d = o.maxX + 24;
  const f = o.cy;
  return <_Component34>
      {a && (() => {
      const p = a.x2 - a.x1;
      const h = a.y2 - a.y1;
      let m;
      if (Math.abs(p) > Math.abs(h)) {
        if (p > 0) {
          m = 'left';
        } else {
          m = 'right';
        }
      } else {
        if (h > 0) {
          m = 'top';
        } else {
          m = 'bottom';
        }
      }
      const [w] = ju({
        sourceX: a.x1,
        sourceY: a.y1,
        sourcePosition: 'right',
        targetX: a.x2,
        targetY: a.y2,
        targetPosition: m,
        curvature: 0.3
      });
      return <svg style={{
        position: 'absolute',
        left: 0,
        top: 0,
        width: '100%',
        height: '100%',
        overflow: 'visible',
        pointerEvents: 'none'
      }}>
              <path d={w} className="gc-line" fill="none" />
            </svg>;
    })()}
      <div className="gc-handle nodrag nopan" style={{
      left: d,
      top: f,
      marginLeft: -15,
      marginTop: -15,
      pointerEvents: 'auto'
    }} onPointerDown={u} title="拖拽此锚点，将所选节点一次性连接到目标节点">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 12h6" />
          <path d="M13 8l4 4-4 4" />
          <circle cx="6" cy="12" r="2.4" />
        </svg>
      </div>
    </_Component34>;
}