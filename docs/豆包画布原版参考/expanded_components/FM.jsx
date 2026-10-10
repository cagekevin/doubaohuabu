// TODO(全局, 无需 import): nodeId, position, variant, className, style, children, color, minWidth, minHeight, maxWidth, maxHeight, keepAspectRatio, resizeDirection, autoScale, shouldResize, onResizeStart, onResize, onResizeEnd, e, b, n, C, h, t, N, E, domNode, x, getStoreItems, nodeLookup, transform, snapGrid, snapToGrid, nodeOrigin, k, I, z, O, R, D, paneDomNode, A, onChange, triggerNodeChanges, parentLookup, y, U, parentId, rect, width, H, height, J, _, se, F, ke, M, type, resizing, setAttributes, p, dimensions, onEnd, controlPosition, P, boundaries, l, c, u, d, f, w, v, m, j, r, s, scale, S, a, o
import { oo, Ob, Ut, Et, UM, Vt, zM, qA, id, tb, Gh, Zt } from './shared.js';
import * as g from 'react';
export default function FM({
  nodeId: e,
  position: t,
  variant: n = oo.Handle,
  className: r,
  style: s = undefined,
  children: o,
  color: a,
  minWidth: l = 10,
  minHeight: c = 10,
  maxWidth: u = Number.MAX_VALUE,
  maxHeight: d = Number.MAX_VALUE,
  keepAspectRatio: f = false,
  resizeDirection: p,
  autoScale: h = true,
  shouldResize: m,
  onResizeStart: w,
  onResize: v,
  onResizeEnd: y
}) {
  const b = Ob();
  const x = typeof e == 'string' ? e : b;
  const k = Ut();
  const N = g.useRef(null);
  const C = n === oo.Handle;
  const S = Et(g.useCallback(UM(C && h), [C, h]), Vt);
  const E = g.useRef(null);
  const P = t ?? zM[n];
  g.useEffect(() => {
    if (!!N.current && !!x) {
      E.current ||= qA({
        domNode: N.current,
        nodeId: x,
        getStoreItems: () => {
          const {
            nodeLookup: I,
            transform: z,
            snapGrid: O,
            snapToGrid: R,
            nodeOrigin: D,
            domNode: A
          } = k.getState();
          return {
            nodeLookup: I,
            transform: z,
            snapGrid: O,
            snapToGrid: R,
            nodeOrigin: D,
            paneDomNode: A
          };
        },
        onChange: (I, z) => {
          const {
            triggerNodeChanges: O,
            nodeLookup: R,
            parentLookup: D,
            nodeOrigin: A
          } = k.getState();
          const F = [];
          const M = {
            x: I.x,
            y: I.y
          };
          const U = R.get(x);
          if (U && U.expandParent && U.parentId) {
            const _ = U.origin ?? A;
            const H = I.width ?? U.measured.width ?? 0;
            const J = I.height ?? U.measured.height ?? 0;
            const se = {
              id: U.id,
              parentId: U.parentId,
              rect: {
                width: H,
                height: J,
                ...tb({
                  x: I.x ?? U.position.x,
                  y: I.y ?? U.position.y
                }, {
                  width: H,
                  height: J
                }, U.parentId, R, _)
              }
            };
            const ke = Gh([se], R, D, A);
            F.push(...ke);
            if (I.x) {
              M.x = Math.max(_[0] * H, I.x);
            } else {
              M.x = undefined;
            }
            if (I.y) {
              M.y = Math.max(_[1] * J, I.y);
            } else {
              M.y = undefined;
            }
          }
          if (M.x !== undefined && M.y !== undefined) {
            const _ = {
              id: x,
              type: 'position',
              position: {
                ...M
              }
            };
            F.push(_);
          }
          if (I.width !== undefined && I.height !== undefined) {
            const H = {
              id: x,
              type: 'dimensions',
              resizing: true,
              setAttributes: p ? p === 'horizontal' ? 'width' : 'height' : true,
              dimensions: {
                width: I.width,
                height: I.height
              }
            };
            F.push(H);
          }
          for (const _ of z) {
            const H = {
              ..._,
              type: 'position'
            };
            F.push(H);
          }
          O(F);
        },
        onEnd: ({
          width: I,
          height: z
        }) => {
          const O = {
            id: x,
            type: 'dimensions',
            resizing: false,
            dimensions: {
              width: I,
              height: z
            }
          };
          k.getState().triggerNodeChanges([O]);
        }
      });
      E.current.update({
        controlPosition: P,
        boundaries: {
          minWidth: l,
          minHeight: c,
          maxWidth: u,
          maxHeight: d
        },
        keepAspectRatio: f,
        resizeDirection: p,
        onResizeStart: w,
        onResize: v,
        onResizeEnd: y,
        shouldResize: m
      });
      return () => {
        var I;
        if ((I = E.current) != null) {
          I.destroy();
        }
      };
    }
  }, [P, l, c, u, d, f, w, v, y, m]);
  const j = P.split('-');
  return <div className={Zt(['react-flow__resize-control', 'nodrag', ...j, n, r])} ref={N} style={{
    ...s,
    scale: S,
    ...(a && {
      [C ? 'backgroundColor' : 'borderColor']: a
    })
  }}>
      {o}
    </div>;
}