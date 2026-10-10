// TODO(全局, 无需 import): nodeId, src, natW, natH, label, w, h, j, I, e, c, t, u, status, z, key, faces, masking, O, R, error, o, l, n, r, v, a, y, f, dataUrl, s, A, p, D, name, F, d, C, x, N, m, b, P, left, width, height, k, S, E
import _cmp_nL from './nL.jsx';
import { L, aL, GD, qD, KD, sL, Tn, oL } from './shared.js';
import * as g from 'react';
export default function iL({
  nodeId: e,
  src: t,
  natW: n,
  natH: r,
  label: s
}) {
  const o = g.useRef(null);
  const [a, l] = g.useState({
    w: 0,
    h: 0
  });
  const c = L(j => {
    var I;
    if ((I = j.faceMarks) == null) {
      return undefined;
    } else {
      return I[e];
    }
  });
  const u = L(j => {
    return j.setFaceMark;
  });
  const d = L(j => {
    return j.clearFaceMark;
  });
  const f = L(j => {
    return j.setFaceMasking;
  });
  const p = L(j => {
    return j.replaceMaterialImage;
  });
  const h = L(j => {
    return j.faceMaskOpts;
  });
  const m = L(j => {
    return j.openFaceMaskPanel;
  });
  const w = (c == null ? undefined : c.status) || 'idle';
  const v = (c == null ? undefined : c.faces) || [];
  const y = (c == null ? undefined : c.masking) ?? null;
  g.useEffect(() => {
    var z;
    if (!t) {
      return;
    }
    const j = aL(t);
    const I = GD(j);
    if (I) {
      u(e, {
        status: (z = I.faces) != null && z.length ? 'done' : 'empty',
        key: j,
        faces: I.faces || [],
        masking: null
      });
      return;
    }
    u(e, {
      status: 'loading',
      key: j,
      faces: [],
      masking: null
    });
    qD(e, j, t).then(O => {
      var R;
      if (!O.cancelled) {
        u(e, {
          status: (R = O.faces) != null && R.length ? 'done' : O.error ? 'error' : 'empty',
          key: j,
          faces: O.faces || [],
          error: O.error || null,
          masking: null
        });
      }
    });
    return () => {
      return KD(e);
    };
  }, [t, e, u]);
  g.useEffect(() => {
    const j = o.current;
    if (!j) {
      return;
    }
    const I = () => {
      return l({
        w: j.clientWidth,
        h: j.clientHeight
      });
    };
    I();
    if (typeof ResizeObserver === 'undefined') {
      return;
    }
    const z = new ResizeObserver(I);
    z.observe(j);
    return () => {
      return z.disconnect();
    };
  }, []);
  const b = g.useMemo(() => {
    const j = n && r ? n / r : 1;
    return sL(v, a, j);
  }, [a, v, n, r]);
  const x = g.useCallback(async j => {
    if (y != null) {
      return;
    }
    const I = v[j];
    if (!!I && !!t) {
      f(e, j);
      try {
        const {
          dataUrl: z,
          w: O,
          h: R
        } = await _cmp_nL(t, I, L.getState().faceMaskOpts);
        const D = Tn(z);
        if (!D || typeof D != 'string') {
          throw new Error('图片保存失败');
        }
        const A = String(s || '素材');
        const F = A.includes('已遮脸') ? A : `${A}·已遮脸`;
        p(e, D, {
          name: F,
          w: O,
          h: R
        });
        d(e);
      } catch (z) {
        console.warn('[face-mark] 遮脸失败，已静默跳过:', z);
        f(e, null);
      }
    }
  }, [y, v, t, e, s, f, p, d]);
  const k = g.useCallback(j => {
    return j.stopPropagation();
  }, []);
  const N = 220;
  const C = g.useRef(null);
  g.useEffect(() => {
    return () => {
      if (C.current) {
        clearTimeout(C.current);
      }
    };
  }, []);
  const S = g.useCallback((j, I) => {
    j.stopPropagation();
    if (!C.current) {
      C.current = setTimeout(() => {
        C.current = null;
        x(I);
      }, N);
    }
  }, [x]);
  const E = g.useCallback(j => {
    j.stopPropagation();
    if (C.current) {
      clearTimeout(C.current);
      C.current = null;
    }
    m(e, j.clientX, j.clientY);
  }, [e, m]);
  const P = w === 'done' && b.length > 0;
  return <div className="face-marks-layer" ref={o}>
      {w === 'loading' && <span className="face-marks-busy">识别人脸…</span>}
      {P && <span className="face-marks-badge" title={`检测到 ${b.length} 张人脸 · 单击角标遮脸，双击设置参数`}>
          检测到人脸
        </span>}
      {P && b.map(j => {
      return <div className={`face-mark nodrag nopan nowheel${y === j.i ? ' is-masking' : ''}`} style={{
        left: j.left,
        top: j.top,
        width: j.width,
        height: j.height
      }} title={y === j.i ? '遮脸中…' : `单击：用当前参数（${oL[h == null ? undefined : h.effect] || '马赛克'} · 强度${(h == null ? undefined : h.strength) ?? 1}× · 外扩${Math.round(((h == null ? undefined : h.pad) ?? 0.12) * 100)}%）一键遮脸；双击：设置遮脸参数`} onMouseDown={k} onClick={I => {
        return S(I, j.i);
      }} onDoubleClick={E} key={j.i}>
              <span className="fc fc-tl" />
              <span className="fc fc-tr" />
              <span className="fc fc-bl" />
              <span className="fc fc-br" />
              <span className="face-mark-tip">{y === j.i ? '遮脸中…' : '单击遮脸 · 双击设置'}</span>
            </div>;
    })}
    </div>;
}