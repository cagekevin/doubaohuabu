// TODO(全局, 无需 import): imgRef, label, onClose, onSaved, w, h, x, y, active, last, u, f, T, Z, de, K, Y, ke, V, se, ae, we, pe, F, O, D, U, l, te, e, a, c, J, ne, Se, Ge, ge, He, Le, lt, st, Ee, dt, G, xe, Me, Re, q, je, Ve, ze, Qe, k, E, s, De, ut, ce, X, Je, C, I, p, z, Ie, index, mode, start, orig, he, M, _, oe, startX, startY, b, n, R, le, ct, wt, ve, r, v, t, o, N, S, P, j, At, _t, nt, re, Mt, H, Nt, m, d, gt, Ke, Ct, ee, transform, width, height, et, Q, me, Rt, Be, left, zt, kt, xt, bottom, right, it, _e, Ae, tt, qe
import { FD, KM, V3, Tt, wS, LD, V0, El, ef, ts, Fu } from './shared.js';
import * as g from 'react';
import * as i from 'react';
export default function G3({
  imgRef: e,
  label: t,
  onClose: n,
  onSaved: r
}) {
  const [s, o] = g.useState('mask');
  const [a, l] = g.useState({
    w: 0,
    h: 0
  });
  const [c, u] = g.useState(false);
  const [d, f] = g.useState('');
  const [p, h] = g.useState('');
  const [m, w] = g.useState('');
  const [v, y] = g.useState(1);
  const [b, x] = g.useState({
    x: 0,
    y: 0
  });
  const [k, N] = g.useState('mosaic');
  const [C, S] = g.useState(64);
  const [E, P] = g.useState(1);
  const [j, I] = g.useState(true);
  const [z, O] = g.useState([]);
  const [R, D] = g.useState(-1);
  const [A, F] = g.useState(false);
  const [M, U] = g.useState(null);
  const [_, H] = g.useState('free');
  const J = g.useRef(null);
  const se = g.useRef(null);
  const ke = g.useRef(null);
  const V = g.useRef(null);
  const pe = g.useRef([]);
  const ne = g.useRef(null);
  const q = g.useRef({});
  const ce = g.useRef({
    active: false,
    last: null
  });
  const oe = g.useRef(null);
  const he = g.useRef(null);
  const Ie = g.useRef(null);
  const De = g.useRef(false);
  const le = g.useRef(null);
  g.useEffect(() => {
    let Z = false;
    u(false);
    f('');
    const T = new Image();
    T.crossOrigin = 'anonymous';
    T.onload = () => {
      if (Z) {
        return;
      }
      const K = T.naturalWidth;
      const Y = T.naturalHeight;
      if (!K || !Y) {
        f('图片尺寸异常，无法编辑');
        return;
      }
      const de = document.createElement('canvas');
      de.width = K;
      de.height = Y;
      de.getContext('2d').drawImage(T, 0, 0);
      ke.current = de;
      V.current = T;
      const ae = se.current;
      if (ae) {
        ae.width = K;
        ae.height = Y;
        const we = ae.getContext('2d');
        we.clearRect(0, 0, K, Y);
        we.drawImage(T, 0, 0);
      }
      pe.current = [];
      F(false);
      O([]);
      D(-1);
      U(null);
      l({
        w: K,
        h: Y
      });
      u(true);
      FD();
      requestAnimationFrame(() => {
        return te(K, Y);
      });
    };
    T.onerror = () => {
      if (!Z) {
        f('图片加载失败（引用可能已失效）');
      }
    };
    T.src = KM(e);
    return () => {
      Z = true;
    };
  }, [e]);
  g.useEffect(() => {
    if (!c) {
      return;
    }
    const Z = se.current;
    const T = V.current;
    if (!Z || !T) {
      return;
    }
    if (Z.width !== a.w || Z.height !== a.h) {
      Z.width = a.w;
      Z.height = a.h;
    }
    const K = Z.getContext('2d');
    K.clearRect(0, 0, Z.width, Z.height);
    K.drawImage(T, 0, 0, Z.width, Z.height);
  }, [c]);
  const te = g.useCallback((Z, T) => {
    const K = J.current;
    if (!K || !Z || !T) {
      return;
    }
    const Y = K.getBoundingClientRect();
    if (!Y.width || !Y.height) {
      return;
    }
    const de = Math.min(Y.width / Z, Y.height / T) * 0.92;
    y(de);
    x({
      x: (Y.width - Z * de) / 2,
      y: (Y.height - T * de) / 2
    });
  }, []);
  const X = g.useCallback(() => {
    const Z = se.current;
    if (!Z || !Z.width) {
      return;
    }
    const T = document.createElement('canvas');
    T.width = Z.width;
    T.height = Z.height;
    T.getContext('2d').drawImage(Z, 0, 0);
    const K = pe.current;
    K.push(T);
    if (K.length > V3) {
      K.shift();
    }
    F(true);
  }, []);
  const re = g.useCallback(() => {
    const Z = pe.current;
    if (!Z.length) {
      return;
    }
    const T = Z.pop();
    const K = se.current;
    const Y = K.getContext('2d');
    Y.save();
    Y.globalAlpha = 1;
    Y.globalCompositeOperation = 'source-over';
    Y.clearRect(0, 0, K.width, K.height);
    Y.drawImage(T, 0, 0);
    Y.restore();
    F(Z.length > 0);
  }, []);
  const Ee = (Z, T) => {
    let K = ne.current;
    if (!K) {
      K = document.createElement('canvas');
      ne.current = K;
    }
    if (K.width !== Z || K.height !== T) {
      K.width = Z;
      K.height = T;
    }
    return K;
  };
  const je = (Z, T, K, Y, de, ae, we) => {
    const Se = Math.max(4, Math.round(we));
    const ge = Tt(Math.floor(K / Se) * Se, 0, T.width);
    const Le = Tt(Math.floor(Y / Se) * Se, 0, T.height);
    const Ge = Tt(Math.ceil((K + de) / Se) * Se, 0, T.width);
    const He = Tt(Math.ceil((Y + ae) / Se) * Se, 0, T.height);
    const lt = Ge - ge;
    const st = He - Le;
    if (lt <= 0 || st <= 0) {
      return;
    }
    const dt = Math.max(1, Math.round(lt / Se));
    const G = Math.max(1, Math.round(st / Se));
    const xe = Ee(dt, G);
    const Me = xe.getContext('2d');
    Me.clearRect(0, 0, dt, G);
    Me.imageSmoothingEnabled = true;
    Me.imageSmoothingQuality = 'high';
    Me.drawImage(T, ge, Le, lt, st, 0, 0, dt, G);
    const Re = Z.imageSmoothingEnabled;
    Z.imageSmoothingEnabled = false;
    Z.drawImage(xe, 0, 0, dt, G, ge, Le, lt, st);
    Z.imageSmoothingEnabled = Re;
  };
  const Ve = (Z, T, K, Y, de, ae, we) => {
    const Se = Tt(Math.floor(K) - Math.ceil(we * 2), 0, T.width);
    const ge = Tt(Math.floor(Y) - Math.ceil(we * 2), 0, T.height);
    const Le = Tt(Math.ceil(K + de) + Math.ceil(we * 2), 0, T.width);
    const Ge = Tt(Math.ceil(Y + ae) + Math.ceil(we * 2), 0, T.height);
    const He = Le - Se;
    const lt = Ge - ge;
    if (He <= 0 || lt <= 0) {
      return;
    }
    const st = Z.filter;
    Z.filter = `blur(${we}px)`;
    Z.drawImage(T, Se, ge, He, lt, Se, ge, He, lt);
    Z.filter = st;
  };
  const ze = (Z, T, K) => {
    const Y = `${T}_${K}`;
    if (q.current[Y]) {
      return q.current[Y];
    }
    const de = document.createElement('canvas');
    de.width = K;
    de.height = K;
    const ae = de.getContext('2d');
    if (T === 'dots') {
      ae.fillStyle = '#ffffff';
      ae.beginPath();
      ae.arc(K / 2, K / 2, K * 0.3, 0, Math.PI * 2);
      ae.fill();
    } else {
      ae.strokeStyle = '#ffffff';
      ae.lineWidth = Math.max(1, K * 0.1);
      ae.beginPath();
      ae.moveTo(0, 0);
      ae.lineTo(K, 0);
      ae.moveTo(0, 0);
      ae.lineTo(0, K);
      ae.stroke();
    }
    const we = Z.createPattern(de, 'repeat');
    q.current[Y] = we;
    return we;
  };
  const Qe = (Z, T, K, Y, de, ae, we) => {
    const Se = ke.current;
    if (!Se) {
      return;
    }
    Z.globalAlpha = we;
    const ge = Math.min(Y, de);
    if (ae === 'mosaic') {
      je(Z, Se, T, K, Y, de, Math.max(6, ge * 0.07));
    } else if (ae === 'blur') {
      Ve(Z, Se, T, K, Y, de, Math.max(4, ge * 0.06));
    } else {
      const Le = Math.max(10, Math.round(ge * 0.09));
      Z.fillStyle = ze(Z, ae, Le);
      Z.fillRect(T - 1, K - 1, Y + 2, de + 2);
    }
    Z.globalAlpha = 1;
  };
  const Je = (Z, T, K, Y) => {
    Z.save();
    Z.beginPath();
    Z.arc(T, K, Y, 0, Math.PI * 2);
    Z.clip();
    Qe(Z, T - Y, K - Y, Y * 2, Y * 2, k, E);
    Z.restore();
  };
  const ut = g.useCallback((Z, T) => {
    const Y = (T || Z.currentTarget).getBoundingClientRect();
    if (!Y.width || !Y.height) {
      return {
        x: 0,
        y: 0
      };
    } else {
      return {
        x: (Z.clientX - Y.left) * (a.w / Y.width),
        y: (Z.clientY - Y.top) * (a.h / Y.height)
      };
    }
  }, [a]);
  const et = g.useCallback(Z => {
    var de;
    var ae;
    if (s !== 'mask' || Z.button === 1 || Z.button === 2 || De.current) {
      return;
    }
    const T = ut(Z);
    ce.current.active = true;
    ce.current.last = T;
    X();
    const Y = se.current.getContext('2d');
    Je(Y, T.x, T.y, C / 2);
    if ((ae = (de = Z.currentTarget).setPointerCapture) != null) {
      ae.call(de, Z.pointerId);
    }
    Z.preventDefault();
  }, [s, ut, X, C, k, E, a]);
  const ct = g.useCallback(Z => {
    if (!ce.current.active) {
      return;
    }
    const T = se.current;
    if (!T) {
      return;
    }
    const K = T.getContext('2d');
    const Y = ut(Z);
    const de = ce.current.last || Y;
    const ae = Y.x - de.x;
    const we = Y.y - de.y;
    const Se = Math.hypot(ae, we);
    const ge = Math.max(1, C * 0.22);
    const Le = Math.max(1, Math.ceil(Se / ge));
    for (let Ge = 1; Ge <= Le; Ge++) {
      const He = Ge / Le;
      Je(K, de.x + ae * He, de.y + we * He, C / 2);
    }
    ce.current.last = Y;
  }, [ut, C, k, E, a]);
  const wt = g.useCallback(Z => {
    var T;
    var K;
    if (ce.current.active) {
      ce.current.active = false;
      ce.current.last = null;
      if ((K = (T = Z.currentTarget).releasePointerCapture) != null) {
        K.call(T, Z.pointerId);
      }
    }
  }, []);
  const At = g.useCallback(async () => {
    const Z = ke.current;
    if (!!Z && !p) {
      h('正在识别人脸…');
      w('');
      try {
        const T = await wS(Z);
        if (!T.length) {
          const K = LD();
          const Y = K.errors[0] || '';
          w(K.failed > 0 && K.failed >= K.tried ? /activeTexture|WebGL|GL_|gpu/i.test(Y) ? '人脸识别失败：当前环境 GPU/WebGL 不可用，请改用笔刷手动涂抹遮脸' : `人脸识别失败：${Y || '检测器异常'}` : '未识别到人脸，可用效果笔刷手动涂抹遮脸');
          return;
        }
        O(T.map(K => {
          return {
            x: K.x,
            y: K.y,
            w: K.w,
            h: K.h
          };
        }));
        D(-1);
        I(true);
        w(`识别到 ${T.length} 个人脸框，可拖动调整后点「一键遮脸」`);
      } catch (T) {
        w(`人脸识别失败：${T && T.message || T}`);
      } finally {
        h('');
      }
    }
  }, [p]);
  const _t = g.useCallback(() => {
    const Z = se.current;
    if (!Z) {
      return;
    }
    if (!z.length) {
      w('请先「识别脸框」或手动添加脸框');
      return;
    }
    X();
    const T = Z.getContext('2d');
    for (const K of z) {
      const Y = K.w * V0;
      const de = K.h * V0;
      const ae = Tt(K.x - Y, 0, Z.width);
      const we = Tt(K.y - de, 0, Z.height);
      const Se = Tt(K.w + Y * 2, 0, Z.width - ae);
      const ge = Tt(K.h + de * 2, 0, Z.height - we);
      if (!(Se <= 0) && !(ge <= 0)) {
        T.save();
        T.beginPath();
        T.rect(ae, we, Se, ge);
        T.clip();
        Qe(T, ae, we, Se, ge, k, E);
        T.restore();
      }
    }
    w(`已对 ${z.length} 个脸框遮脸`);
  }, [z, X, k, E]);
  const Mt = g.useCallback(() => {
    const Z = se.current;
    if (!Z) {
      return;
    }
    X();
    const T = Z.getContext('2d');
    Qe(T, 0, 0, Z.width, Z.height, k, E);
    w('已对整张图应用遮脸效果');
  }, [X, k, E]);
  const zt = g.useCallback((Z, T, K) => {
    var de;
    var ae;
    Z.stopPropagation();
    Z.preventDefault();
    D(T);
    const Y = ut(Z, Z.currentTarget.closest('.ie-overlay') || Z.currentTarget);
    Ie.current = {
      index: T,
      mode: K,
      start: Y,
      orig: {
        ...z[T]
      }
    };
    if ((ae = (de = Z.currentTarget).setPointerCapture) != null) {
      ae.call(de, Z.pointerId);
    }
  }, [z, ut]);
  const Rt = g.useCallback(Z => {
    const T = Ie.current;
    if (!T) {
      return;
    }
    const K = ut(Z, Z.currentTarget);
    const Y = K.x - T.start.x;
    const de = K.y - T.start.y;
    const ae = T.orig;
    O(we => {
      const Se = [...we];
      let ge = {
        ...ae
      };
      if (T.mode === 'move') {
        ge.x = Tt(ae.x + Y, 0, a.w - ae.w);
        ge.y = Tt(ae.y + de, 0, a.h - ae.h);
      } else {
        let Le = ae.x;
        let Ge = ae.y;
        let He = ae.x + ae.w;
        let lt = ae.y + ae.h;
        if (T.mode.includes('w')) {
          Le = Tt(ae.x + Y, 0, He - El);
        }
        if (T.mode.includes('e')) {
          He = Tt(ae.x + ae.w + Y, Le + El, a.w);
        }
        if (T.mode.includes('n')) {
          Ge = Tt(ae.y + de, 0, lt - El);
        }
        if (T.mode.includes('s')) {
          lt = Tt(ae.y + ae.h + de, Ge + El, a.h);
        }
        ge = {
          x: Le,
          y: Ge,
          w: He - Le,
          h: lt - Ge
        };
      }
      Se[T.index] = ge;
      return Se;
    });
  }, [ut, a]);
  const Be = g.useCallback(Z => {
    var T;
    var K;
    if (Ie.current) {
      Ie.current = null;
      if ((K = (T = Z.currentTarget).releasePointerCapture) != null) {
        K.call(T, Z.pointerId);
      }
    }
  }, []);
  const it = g.useCallback((Z, T) => {
    var Y;
    var de;
    Z.stopPropagation();
    Z.preventDefault();
    if (!M) {
      return;
    }
    const K = ut(Z, Z.currentTarget.closest('.ie-overlay') || Z.currentTarget);
    he.current = {
      mode: T,
      start: K,
      orig: {
        ...M
      }
    };
    if ((de = (Y = Z.currentTarget).setPointerCapture) != null) {
      de.call(Y, Z.pointerId);
    }
  }, [M, ut]);
  const kt = g.useCallback(Z => {
    const T = he.current;
    if (!T) {
      return;
    }
    const K = ut(Z, Z.currentTarget);
    const Y = K.x - T.start.x;
    const de = K.y - T.start.y;
    const ae = T.orig;
    const we = (ef.find(Se => {
      return Se.value === _;
    }) || {}).r || 0;
    U(() => {
      if (T.mode === 'move') {
        return {
          x: Tt(ae.x + Y, 0, a.w - ae.w),
          y: Tt(ae.y + de, 0, a.h - ae.h),
          w: ae.w,
          h: ae.h
        };
      }
      let Se = ae.x;
      let ge = ae.y;
      let Le = ae.x + ae.w;
      let Ge = ae.y + ae.h;
      const He = T.mode.includes('w');
      const lt = T.mode.includes('e');
      const st = T.mode.includes('n');
      const dt = T.mode.includes('s');
      if (He) {
        Se = Tt(ae.x + Y, 0, Le - ts);
      }
      if (lt) {
        Le = Tt(ae.x + ae.w + Y, Se + ts, a.w);
      }
      if (st) {
        ge = Tt(ae.y + de, 0, Ge - ts);
      }
      if (dt) {
        Ge = Tt(ae.y + ae.h + de, ge + ts, a.h);
      }
      let G = Le - Se;
      let xe = Ge - ge;
      if (we) {
        const Me = /^\d/.test(_) ? we : 1;
        xe = G / Me;
        if (xe > a.h) {
          xe = a.h;
          G = xe * Me;
        }
        if (st) {
          ge = Ge - xe;
        } else {
          Ge = ge + xe;
        }
        if (He) {
          Se = Le - G;
        } else {
          Le = Se + G;
        }
        if (Se < 0) {
          Se = 0;
          Le = G;
        }
        if (ge < 0) {
          ge = 0;
          Ge = xe;
        }
        if (Le > a.w) {
          Le = a.w;
          Se = Le - G;
        }
        if (Ge > a.h) {
          Ge = a.h;
          ge = Ge - xe;
        }
        G = Le - Se;
        xe = Ge - ge;
      }
      return {
        x: Se,
        y: ge,
        w: G,
        h: xe
      };
    });
  }, [ut, a, _]);
  const xt = g.useCallback(Z => {
    var T;
    var K;
    if (he.current) {
      he.current = null;
      if ((K = (T = Z.currentTarget).releasePointerCapture) != null) {
        K.call(T, Z.pointerId);
      }
    }
  }, []);
  g.useEffect(() => {
    if (s !== 'crop' || !c || M) {
      return;
    }
    const Z = Math.min(a.w, a.h) * 0.8;
    const T = (ef.find(de => {
      return de.value === _;
    }) || {}).r || 0;
    let K = Z;
    let Y = T ? Z / T : Z;
    if (Y > a.h * 0.9) {
      Y = a.h * 0.9;
      if (T) {
        K = Y * T;
      } else {
        K = K;
      }
    }
    U({
      x: Math.round((a.w - K) / 2),
      y: Math.round((a.h - Y) / 2),
      w: Math.round(K),
      h: Math.round(Y)
    });
  }, [s, c, M, a, _]);
  const Nt = g.useCallback(() => {
    const Z = se.current;
    const T = ke.current;
    if (!Z || !T || !M) {
      return;
    }
    const K = Math.round(Tt(M.x, 0, a.w - 1));
    const Y = Math.round(Tt(M.y, 0, a.h - 1));
    const de = Math.round(Tt(M.w, ts, a.w - K));
    const ae = Math.round(Tt(M.h, ts, a.h - Y));
    if (de < ts || ae < ts) {
      w('裁剪区域太小');
      return;
    }
    const we = Se => {
      const ge = document.createElement('canvas');
      ge.width = de;
      ge.height = ae;
      ge.getContext('2d').drawImage(Se, K, Y, de, ae, 0, 0, de, ae);
      Se.width = de;
      Se.height = ae;
      const Ge = Se.getContext('2d');
      Ge.clearRect(0, 0, de, ae);
      Ge.drawImage(ge, 0, 0);
    };
    we(Z);
    we(T);
    ke.current = T;
    pe.current = [];
    F(false);
    O([]);
    D(-1);
    U(null);
    l({
      w: de,
      h: ae
    });
    w(`已裁剪为 ${de} × ${ae}`);
    requestAnimationFrame(() => {
      return te(de, ae);
    });
  }, [M, a, te]);
  const gt = g.useCallback(Z => {
    Z.preventDefault();
    const T = J.current;
    if (!T) {
      return;
    }
    const K = T.getBoundingClientRect();
    const Y = Z.clientX - K.left;
    const de = Z.clientY - K.top;
    y(ae => {
      const we = Z.deltaY < 0 ? 1.12 : 0.8928571428571428;
      const Se = Tt(ae * we, 0.05, 12);
      const ge = Se / ae;
      x(Le => {
        return {
          x: Y - (Y - Le.x) * ge,
          y: de - (de - Le.y) * ge
        };
      });
      return Se;
    });
  }, []);
  const Ke = g.useCallback(Z => {
    var de;
    if (Z.button !== 1 && Z.button !== 2 && !De.current) {
      return;
    }
    Z.preventDefault();
    const K = J.current;
    if (!K) {
      return;
    }
    const Y = K.getBoundingClientRect();
    oe.current = {
      startX: Z.clientX - Y.left,
      startY: Z.clientY - Y.top,
      orig: {
        ...b
      }
    };
    if ((de = K.setPointerCapture) != null) {
      de.call(K, Z.pointerId);
    }
  }, [b]);
  const Ct = g.useCallback(Z => {
    const T = oe.current;
    if (!T) {
      return;
    }
    const K = J.current;
    if (!K) {
      return;
    }
    const Y = K.getBoundingClientRect();
    x({
      x: T.orig.x + (Z.clientX - Y.left - T.startX),
      y: T.orig.y + (Z.clientY - Y.top - T.startY)
    });
  }, []);
  const ee = g.useCallback(Z => {
    var T;
    var K;
    if (oe.current) {
      oe.current = null;
      if ((K = (T = J.current) == null ? undefined : T.releasePointerCapture) != null) {
        K.call(T, Z.pointerId);
      }
    }
  }, []);
  g.useEffect(() => {
    const Z = K => {
      if (K.code === 'Space') {
        De.current = true;
        K.preventDefault();
      }
      if (K.key === 'Escape') {
        if (n != null) {
          n();
        }
      }
      if ((K.key === 'Delete' || K.key === 'Backspace') && R >= 0 && s === 'mask') {
        const Y = K.target && K.target.tagName || '';
        if (Y === 'INPUT' || Y === 'TEXTAREA') {
          return;
        }
        K.preventDefault();
        O(de => {
          return de.filter((ae, we) => {
            return we !== R;
          });
        });
        D(-1);
      }
    };
    const T = K => {
      if (K.code === 'Space') {
        De.current = false;
      }
    };
    window.addEventListener('keydown', Z);
    window.addEventListener('keyup', T);
    return () => {
      window.removeEventListener('keydown', Z);
      window.removeEventListener('keyup', T);
    };
  }, [n, R, s]);
  const Q = g.useCallback(Z => {
    const T = le.current;
    if (T) {
      const K = Z.currentTarget.getBoundingClientRect();
      T.style.display = 'block';
      T.style.left = `${Z.clientX - K.left}px`;
      T.style.top = `${Z.clientY - K.top}px`;
      T.style.width = `${C / (a.w || 1) * K.width}px`;
      T.style.height = `${C / (a.h || 1) * K.height}px`;
    }
    ct(Z);
  }, [C, a, ct]);
  const me = g.useCallback(Z => {
    if (le.current) {
      le.current.style.display = 'none';
    }
    wt(Z);
  }, [wt]);
  const ve = g.useCallback(() => {
    const Z = se.current;
    if (Z) {
      if (/\.jpe?g($|\?)/i.test(e || '') || /^data:image\/jpe?g/i.test(e || '')) {
        return Z.toDataURL('image/jpeg', 0.95);
      } else {
        return Z.toDataURL('image/png');
      }
    } else {
      return '';
    }
  }, [e]);
  const qe = g.useCallback(() => {
    try {
      const Z = se.current;
      const T = ve();
      if (!T || !Z) {
        return;
      }
      const K = window.api;
      const Y = K && typeof K.saveImageSync == 'function' ? K.saveImageSync(T) : T;
      if (r != null) {
        r(Y || T, {
          w: Z.width,
          h: Z.height
        });
      }
    } catch (Z) {
      f(`保存失败：${Z && Z.message || Z}（画布可能被跨源图片污染）`);
    }
  }, [ve, r]);
  const tt = g.useCallback(async () => {
    try {
      const Z = se.current;
      if (!Z) {
        return;
      }
      const T = await new Promise(K => {
        return Z.toBlob(K, 'image/png');
      });
      if (!T) {
        throw new Error('导出失败');
      }
      await navigator.clipboard.write([new ClipboardItem({
        'image/png': T
      })]);
      w('已复制到剪贴板');
    } catch (Z) {
      w(`复制失败：${Z && Z.message || Z}`);
    }
  }, []);
  const Ae = Math.round(v * 100);
  const nt = z.length;
  const _e = g.useMemo(() => {
    if (s === 'mask') {
      return '滚轮缩放，空格/右键拖拽，可多次涂抹';
    } else {
      return '滚轮缩放，空格/右键拖拽，拖动裁剪框调整范围';
    }
  }, [s]);
  return <div className="ie-overlay-root">
      <div className="ie-backdrop" onMouseDown={() => {
      if (n == null) {
        return undefined;
      } else {
        return n();
      }
    }} />
      <div className="ie-panel" onMouseDown={Z => {
      return Z.stopPropagation();
    }}>
        <div className="ie-head">
          <div className="ie-title">
            图片编辑{t ? <span className="ie-title-sub"> · {t}</span> : null}
          </div>
          <div className="ie-tabs">
            <button className={`ie-tab${s === 'mask' ? ' ie-tab-active' : ''}`} onClick={() => {
            return o('mask');
          }}>
              一键遮脸
            </button>
            <button className={`ie-tab${s === 'crop' ? ' ie-tab-active' : ''}`} onClick={() => {
            return o('crop');
          }}>
              裁剪
            </button>
          </div>
          <button className="ie-close" onClick={() => {
          if (n == null) {
            return undefined;
          } else {
            return n();
          }
        }} title="关闭">
            ✕
          </button>
        </div>
        <div className="ie-toolbar">
          {s === 'mask' ? <i.Fragment>
              <div className="ie-group">
                <span className="ie-group-label">遮脸效果</span>
                <div className="ie-seg">
                  {Fu.map(Z => {
                return <button className={`ie-seg-btn${k === Z.value ? ' ie-seg-active' : ''}`} onClick={() => {
                  return N(Z.value);
                }} title={Z.hint} key={Z.value}>
                        {Z.label}
                      </button>;
              })}
                </div>
              </div>
              <div className="ie-divider" />
              <div className="ie-group">
                <span className="ie-group-label">笔刷</span>
                <input className="ie-range" type="range" min={12} max={220} value={C} onChange={Z => {
              return S(Number(Z.target.value));
            }} title={`笔刷大小 ${C}px`} />
                <span className="ie-range-val">{C}</span>
              </div>
              <div className="ie-group">
                <span className="ie-group-label">透明</span>
                <input className="ie-range" type="range" min={20} max={100} value={Math.round(E * 100)} onChange={Z => {
              return P(Number(Z.target.value) / 100);
            }} title={`不透明度 ${Math.round(E * 100)}%`} />
                <span className="ie-range-val">{Math.round(E * 100)}%</span>
              </div>
              <label className="ie-check">
                <input type="checkbox" checked={j} onChange={Z => {
              return I(Z.target.checked);
            }} />
                显示脸框
              </label>
              <div className="ie-divider" />
              <div className="ie-group">
                <button className="ie-btn" onClick={At} disabled={!!p}>
                  {p ? '识别中…' : '识别脸框'}
                </button>
                <button className="ie-btn" onClick={_t} disabled={!nt}>
                  一键遮脸
                </button>
                <button className="ie-btn" onClick={() => {
              O([]);
              D(-1);
              w('已清空脸框');
            }} disabled={!nt}>
                  清空框
                </button>
                <span className="ie-count">{nt} 个脸框</span>
              </div>
              <div className="ie-divider" />
              <button className="ie-btn" onClick={re} disabled={!A}>
                撤销
              </button>
              <button className="ie-btn" onClick={Mt} title="不依赖脸框，直接对整张图应用效果">
                整图遮脸
              </button>
            </i.Fragment> : <i.Fragment>
              <div className="ie-group">
                <span className="ie-group-label">比例</span>
                <div className="ie-seg">
                  {ef.map(Z => {
                return <button className={`ie-seg-btn${_ === Z.value ? ' ie-seg-active' : ''}`} onClick={() => {
                  return H(Z.value);
                }} key={Z.value}>
                        {Z.label}
                      </button>;
              })}
                </div>
              </div>
              <div className="ie-divider" />
              <button className="ie-btn" onClick={() => {
            return U(null);
          }}>
                重置框
              </button>
              <button className="ie-btn primary" onClick={Nt} disabled={!M}>
                应用裁剪
              </button>
            </i.Fragment>}
        </div>
        {(m || d || p) && <div className={`ie-notice${d ? ' ie-notice-error' : ''}`}>{d || p || m}</div>}
        <div className={`ie-viewport${s === 'mask' ? ' ie-cursor-brush' : ''}`} ref={J} onWheel={gt} onPointerDown={Ke} onPointerMove={Ct} onPointerUp={ee} onContextMenu={Z => {
        return Z.preventDefault();
      }}>
          {!c && !d && <div className="ie-loading">正在载入图片…</div>}
          {c && <div className="ie-stage" style={{
          transform: `translate(${b.x}px, ${b.y}px) scale(${v})`
        }}>
              <div className="ie-canvas-wrap" style={{
            width: a.w,
            height: a.h
          }}>
                <canvas ref={se} className="ie-canvas" style={{
              width: a.w,
              height: a.h
            }} onPointerDown={et} onPointerMove={Q} onPointerUp={wt} onPointerLeave={me} />
                {s === 'mask' && <div ref={le} className="ie-brush-cursor" />}
                {s === 'mask' && <div className="ie-overlay" onPointerMove={Rt} onPointerUp={Be}>
                    {j && z.map((Z, T) => {
                return <div className={`ie-facebox${R === T ? ' ie-facebox-active' : ''}`} style={{
                  left: Z.x,
                  top: Z.y,
                  width: Z.w,
                  height: Z.h
                }} onPointerDown={K => {
                  return zt(K, T, 'move');
                }} key={T}>
                            {['nw', 'n', 'ne', 'w', 'e', 'sw', 's', 'se'].map(K => {
                    return <span className={`ie-handle ie-handle-${K}`} onPointerDown={Y => {
                      return zt(Y, T, K);
                    }} key={K} />;
                  })}
                          </div>;
              })}
                  </div>}
                {s === 'crop' && M && <div className="ie-overlay" onPointerMove={kt} onPointerUp={xt}>
                    <div className="ie-crop-shade ie-shade-top" style={{
                height: M.y
              }} />
                    <div className="ie-crop-shade ie-shade-bottom" style={{
                top: M.y + M.h,
                bottom: 0
              }} />
                    <div className="ie-crop-shade ie-shade-left" style={{
                top: M.y,
                height: M.h,
                width: M.x
              }} />
                    <div className="ie-crop-shade ie-shade-right" style={{
                top: M.y,
                height: M.h,
                left: M.x + M.w,
                right: 0
              }} />
                    <div className="ie-cropbox" style={{
                left: M.x,
                top: M.y,
                width: M.w,
                height: M.h
              }} onPointerDown={Z => {
                return it(Z, 'move');
              }}>
                      <div className="ie-crop-grid" />
                      {['nw', 'n', 'ne', 'w', 'e', 'sw', 's', 'se'].map(Z => {
                  return <span className={`ie-handle ie-handle-${Z}`} onPointerDown={T => {
                    return it(T, Z);
                  }} key={Z} />;
                })}
                    </div>
                  </div>}
              </div>
            </div>}
        </div>
        <div className="ie-foot">
          <div className="ie-hint">{c ? `${_e}  ·  ${a.w}×${a.h}` : ''}</div>
          <div className="ie-zoom">
            <button className="ie-zoom-btn" onClick={() => {
            return y(Z => {
              return Tt(Z / 1.15, 0.05, 12);
            });
          }}>
              −
            </button>
            <span className="ie-zoom-val">{Ae}%</span>
            <button className="ie-zoom-btn" onClick={() => {
            return y(Z => {
              return Tt(Z * 1.15, 0.05, 12);
            });
          }}>
              +
            </button>
            <button className="ie-zoom-btn ie-zoom-fit" onClick={() => {
            return te(a.w, a.h);
          }}>
              适应
            </button>
          </div>
          <div className="ie-actions">
            <button className="ie-btn" onClick={() => {
            if (n == null) {
              return undefined;
            } else {
              return n();
            }
          }}>
              取消
            </button>
            <button className="ie-btn" onClick={tt} disabled={!c}>
              复制
            </button>
            <button className="ie-btn primary" onClick={qe} disabled={!c}>
              保存并替换
            </button>
          </div>
        </div>
      </div>
    </div>;
}