// TODO(全局, 无需 import): G, xe, x, y, zoom, w, t, m, p, h, Me, Re, ie, $, be, ye, $e, Ne, Fe, Ce, at, W, N, v, C, b, M, s, n, label, dataUrl, V, pe, D, F, se, _, J, H, e, d, k, A, z, E, R, r, q, c, ct, le, te, Ve, re, left, bottom, level, Ee, je, o, a, gid, list, Je, Ie, et, _t, At, Mt, ce, he, De, l, u, text, xt, Nt, j, ke, gt, rawName, ee, Ct, Q, name, _e, Ae, styleIds, added, skipped, nodeId, force, excludeAccountIds, sendOne, f, ne, ae, de, ratio, duration, oe, resolution, watermark, accountName, He, params, styleId, prompt, edit, aspectRatio, model, sendAccount, status, note, providerId, kind, refSources, attempt, apiJob, jobId, providerName, batch, Ke, Ge, Z, nt, it, we, Se, me, tt, dt, height, U, ve, qe, kt, T, zt, Rt, ze, ut, X, channel, Qe, Be, wt, Y, lt, K, Le, st, S, P, O
import _cmp__Component33 from "./_Component33.jsx";
import _cmp_US from "./US.jsx";
import { L, Tu, Or, DS, RS, Ja, In, Hu, tu, ES, Aa, X0, K0, Y0, eu, Zc, LS, Ia, SS, um, la, CS, NS, id, OS, Q3, Jh, Wk, wn, $S, TS, PS, nu, Fc, io, Xt, on, Ts, xo } from "./shared.js";
import * as g from 'react';
import * as i from 'react';
export default function Z3() {
  const e = L(G => {
    return G.genPanelNodeId;
  });
  const t = L(G => {
    if (G.genPanelNodeId) {
      return G.nodes.find(xe => {
        return xe.id === G.genPanelNodeId;
      });
    } else {
      return null;
    }
  });
  const n = L(G => {
    return G.nodes;
  });
  const r = L(G => {
    return G.edges;
  });
  const s = L(G => {
    return G.library;
  });
  const o = L(G => {
    return G.accounts;
  });
  const a = L(G => {
    return G.groups;
  }) || [];
  const l = L(G => {
    return G.styles;
  }) || [];
  const c = L(G => {
    return G.canvasDefaults;
  }) || {};
  const u = L(G => {
    return G.updateNodeData;
  });
  const d = L(G => {
    return G.closeGeneratePanel;
  });
  L(G => {
    if (G.genPanelNodeId) {
      return G.nodeRecipes[G.genPanelNodeId];
    } else {
      return null;
    }
  });
  const f = L(G => {
    if (G.genPanelNodeId) {
      return G.nodeSendStates[G.genPanelNodeId];
    } else {
      return null;
    }
  });
  const {
    x: p,
    y: h,
    zoom: m
  } = Tu();
  const w = g.useRef(null);
  g.useLayoutEffect(() => {
    const G = w.current;
    if (!G || !t) {
      return;
    }
    const xe = t.measured && t.measured.width || t.width || 380;
    const Me = t.measured && t.measured.height || t.height || 220;
    const Re = t.position.x * m + p;
    const $ = t.position.y * m + h;
    const ie = xe * m;
    const be = Me * m;
    const ye = Re + ie / 2;
    const Ne = $ + be;
    const $e = G.offsetWidth || Math.min(860, window.innerWidth * 0.92);
    const at = G.offsetHeight || 360;
    const Fe = 12;
    let W = ye - $e / 2;
    let Ce = Ne + Fe;
    if (Ce + at > window.innerHeight - Fe) {
      Ce = $ - at - Fe;
    }
    if (Ce < Fe) {
      Ce = Fe;
    }
    W = Math.max(Fe, Math.min(W, window.innerWidth - $e - Fe));
    G.style.left = `${W}px`;
    G.style.top = `${Ce}px`;
  }, [t, p, h, m]);
  const [v, y] = g.useState('');
  const [b, x] = g.useState([]);
  const k = g.useRef('');
  const N = g.useRef('');
  const C = g.useRef([]);
  const [S, E] = g.useState(false);
  const [P, j] = g.useState(null);
  const [I, z] = g.useState(null);
  const [O, R] = g.useState(false);
  const D = g.useRef(null);
  const A = g.useRef(null);
  const [F, M] = g.useState(0);
  const [U, _] = g.useState(Or);
  const [H, J] = g.useState(false);
  const se = g.useRef(null);
  N.current = v;
  C.current = b;
  const ke = g.useCallback(G => {
    N.current = G;
    y(G);
    M(xe => {
      return xe + 1;
    });
  }, []);
  const V = g.useCallback(G => {
    const xe = (C.current || []).find(ie => {
      return ie.n === G;
    });
    if (!xe) {
      return {};
    }
    const Me = (s || []).find(ie => {
      return ie.id === xe.id;
    });
    const Re = (n || []).find(ie => {
      return ie.id === xe.id;
    });
    const $ = Me && Me.dataUrl || Re && Re.type === 'material' && Re.data && Re.data.dataUrl || Re && Re.type === 'video' && Re.data && Re.data.poster || Re && Re.type === 'imggen' && Re.data && Re.data.dataUrl || '';
    return {
      label: Me && Me.name || xe.rawName || '素材',
      dataUrl: $
    };
  }, [s, n]);
  const pe = g.useRef(V);
  pe.current = V;
  g.useLayoutEffect(() => {
    const G = D.current;
    if (G) {
      G.innerHTML = DS(N.current, xe => {
        return pe.current(xe);
      });
    }
  }, [F]);
  g.useEffect(() => {
    if (!H) {
      return;
    }
    const G = Me => {
      const Re = se.current;
      if (Re) {
        _(RS(Re.h + (Me.clientY - Re.y)));
      }
    };
    const xe = () => {
      se.current = null;
      J(false);
    };
    window.addEventListener('mousemove', G);
    window.addEventListener('mouseup', xe);
    document.body.classList.add('gp-resizing');
    return () => {
      window.removeEventListener('mousemove', G);
      window.removeEventListener('mouseup', xe);
      document.body.classList.remove('gp-resizing');
    };
  }, [H]);
  g.useLayoutEffect(() => {
    if (!e) {
      return;
    }
    const G = L.getState().nodes.find(Me => {
      return Me.id === e;
    });
    if (!G) {
      d();
      return;
    }
    const xe = Ja(G.data && G.data.text || '', In);
    y(xe.text);
    x(xe.refs);
    k.current = xe.text;
    M(Me => {
      return Me + 1;
    });
    A.current = null;
    _(Or);
    z(null);
    E(false);
    R(false);
  }, [e, d]);
  g.useEffect(() => {
    if (e && !t) {
      d();
    }
  }, [e, t, d]);
  const ne = g.useMemo(() => {
    if (e) {
      return Hu(e, n, r, s);
    } else {
      return [];
    }
  }, [e, n, r, s]);
  const q = t && t.data || {};
  const ce = q.aspectRatio || c.ratio || '16:9';
  const oe = tu(q.duration) ? Number(q.duration) : tu(c.duration) ? Number(c.duration) : ES;
  const he = q.model || c.model || 'seedance-2.0-mini';
  const Ie = q.sendAccount || 'auto';
  const De = Array.isArray(q.styleIds) ? q.styleIds : [];
  const [le, te] = g.useState(null);
  const [X, re] = g.useState(null);
  const Ee = g.useRef(null);
  const je = g.useRef(null);
  const Ve = g.useRef(null);
  const ze = () => {
    ct(null);
    if (le) {
      te(null);
      return;
    }
    const G = Ve.current && Ve.current.getBoundingClientRect();
    if (G) {
      re({
        left: G.left,
        bottom: window.innerHeight - G.top + 8
      });
    }
    te({
      level: 'root'
    });
  };
  g.useEffect(() => {
    if (!le) {
      return;
    }
    const G = xe => {
      const Me = Ee.current && Ee.current.contains(xe.target);
      const Re = je.current && je.current.contains(xe.target);
      if (!Me && !Re) {
        te(null);
      }
    };
    document.addEventListener('mousedown', G);
    return () => {
      return document.removeEventListener('mousedown', G);
    };
  }, [le]);
  const Qe = g.useMemo(() => {
    const G = new Map();
    (o || []).forEach(Re => {
      const $ = Re.groupId || null;
      if (!G.has($)) {
        G.set($, []);
      }
      G.get($).push(Re);
    });
    const xe = [];
    (a || []).forEach(Re => {
      const $ = G.get(Re.id) || [];
      if ($.length) {
        xe.push({
          gid: Re.id,
          label: Re.name || '未命名分组',
          list: $
        });
      }
    });
    const Me = G.get(null) || [];
    if (Me.length) {
      xe.push({
        gid: null,
        label: '未分组',
        list: Me
      });
    }
    return xe;
  }, [o, a]);
  const Je = (t && t.data && t.data.channel) === 'api' ? 'api' : 'backend';
  const ut = g.useMemo(() => {
    if (Je === 'api') {
      return 'API';
    }
    const G = Ie;
    if (G === 'auto') {
      return '自动';
    }
    if (typeof G == 'string' && G.startsWith('auto:group:')) {
      const Me = G.slice(11);
      if (Me === Aa) {
        return '未分组 · 自动';
      }
      const Re = (a || []).find($ => {
        return $.id === Me;
      });
      return `${Re && Re.name || '分组'} · 自动`;
    }
    if (typeof G == 'string' && G.startsWith('auto:')) {
      return `${X0[G.slice(5)] || G.slice(5)} · 自动`;
    }
    const xe = (o || []).find(Me => {
      return Me.id === G;
    });
    if (xe) {
      return xe.name;
    } else {
      return '豆包 · 自动';
    }
  }, [Je, Ie, o, a]);
  const [et, ct] = g.useState(null);
  const [wt, At] = g.useState(null);
  const _t = g.useRef({});
  const Mt = g.useRef(null);
  const zt = G => {
    te(null);
    if (et === G) {
      ct(null);
      return;
    }
    const xe = _t.current[G];
    const Me = xe && xe.getBoundingClientRect();
    if (Me) {
      At({
        left: Me.left,
        bottom: window.innerHeight - Me.top + 8
      });
    }
    ct(G);
  };
  g.useEffect(() => {
    if (!et) {
      return;
    }
    const G = xe => {
      const Me = Mt.current && Mt.current.contains(xe.target);
      const Re = Object.values(_t.current).some($ => {
        return $ && $.contains(xe.target);
      });
      if (!Me && !Re) {
        ct(null);
      }
    };
    document.addEventListener('mousedown', G);
    return () => {
      return document.removeEventListener('mousedown', G);
    };
  }, [et]);
  const Rt = (K0.find(G => {
    return G.value === ce;
  }) || {}).label || ce;
  const Be = (Y0.find(G => {
    return G.value === he;
  }) || {}).label || he;
  const it = g.useMemo(() => {
    const G = Ie;
    if (G === 'auto') {
      return '全部账号（自动）';
    }
    if (typeof G == 'string' && G.startsWith('auto:group:')) {
      const Me = G.slice(11);
      if (Me === Aa) {
        return '未分组账号（自动）';
      }
      const Re = (a || []).find(ie => {
        return ie.id === Me;
      });
      const $ = Re && Re.name || '分组';
      return `${$}${$.endsWith('账号') ? '' : '账号'}（自动）`;
    }
    if (typeof G == 'string' && G.startsWith('auto:')) {
      return `${X0[G.slice(5)] || G.slice(5)}账号（自动）`;
    }
    const xe = (o || []).find(Me => {
      return Me.id === G;
    });
    if (xe) {
      return xe.name;
    } else {
      return '自动分配';
    }
  }, [Ie, o, a]);
  const kt = g.useMemo(() => {
    return De.map(G => {
      return (l.find(xe => {
        return xe.id === G;
      }) || {}).name;
    }).filter(Boolean);
  }, [De, l]);
  const xt = g.useCallback(() => {
    if (!e) {
      return false;
    }
    const G = eu(N.current, C.current);
    if (G.changed) {
      N.current = G.text;
      C.current = G.refs;
      y(G.text);
      x(G.refs);
      M(Re => {
        return Re + 1;
      });
    }
    const xe = N.current;
    if (xe === k.current) {
      return false;
    }
    const Me = Zc(xe, C.current);
    u(e, {
      text: Me
    });
    k.current = xe;
    return true;
  }, [e, u]);
  const Nt = g.useCallback(() => {
    xt();
    d();
  }, [xt, d]);
  g.useEffect(() => {
    if (!e) {
      return;
    }
    const G = xe => {
      if (xe.key === 'Escape') {
        xe.preventDefault();
        Nt();
      }
    };
    window.addEventListener('keydown', G);
    return () => {
      return window.removeEventListener('keydown', G);
    };
  }, [e, Nt]);
  g.useEffect(() => {
    if (e) {
      try {
        L.getState().loadApiSetup();
      } catch {}
    }
  }, [e]);
  const gt = g.useCallback(() => {
    const G = D.current;
    if (!G) {
      return;
    }
    const xe = LS(G);
    N.current = xe;
    y(xe);
  }, []);
  const Ke = g.useCallback(() => {
    const G = D.current;
    if (!G) {
      return null;
    }
    const xe = Ia(G);
    A.current = xe;
    return xe;
  }, []);
  const Ct = g.useCallback(() => {
    const G = D.current;
    const xe = window.getSelection();
    let Me = null;
    if (xe && xe.rangeCount) {
      const Re = xe.getRangeAt(0);
      Me = Re.getBoundingClientRect();
      if ((!Me || !Me.width && !Me.height) && typeof Re.getClientRects == 'function') {
        const $ = Re.getClientRects();
        if ($ && $.length) {
          Me = $[0];
        }
      }
    }
    if ((!Me || !Me.width && !Me.height) && G) {
      Me = G.getBoundingClientRect();
    }
    j(Me ? {
      left: Me.left,
      top: Me.top,
      bottom: Me.bottom
    } : null);
    E(true);
  }, []);
  const ee = g.useCallback((G, xe, Me) => {
    const Re = D.current;
    if (!Re) {
      const Fe = SS(N.current, N.current.length, G);
      ke(Fe.text);
      return;
    }
    try {
      Re.focus();
    } catch {}
    let $ = A.current;
    if (!$ || !$.startContainer || !Re.contains($.startContainer)) {
      $ = Ia(Re);
    }
    if (!$) {
      return;
    }
    let ie = '';
    try {
      const Fe = document.createRange();
      Fe.selectNodeContents(Re);
      Fe.setEnd($.startContainer, $.startOffset);
      ie = Fe.toString();
    } catch {
      ie = '';
    }
    if (/@$/.test(ie)) {
      try {
        if ($.startContainer.nodeType === 3) {
          const Fe = Math.max(0, $.startOffset - 1);
          const W = document.createRange();
          W.setStart($.startContainer, Fe);
          W.setEnd($.startContainer, $.startOffset);
          W.deleteContents();
          $ = W;
          ie = ie.slice(0, -1);
        }
      } catch {}
    }
    const be = document.createDocumentFragment();
    if (um(ie)) {
      be.appendChild(document.createTextNode('\xA0'));
    }
    const ye = document.createElement('span');
    ye.className = 'ref-chip gp-ref-chip';
    ye.contentEditable = 'false';
    ye.dataset.n = String(G);
    ye.innerHTML = la(xe, Me);
    be.appendChild(ye);
    const Ne = document.createTextNode('\xA0');
    be.appendChild(Ne);
    $.deleteContents();
    $.insertNode(be);
    const $e = document.createRange();
    $e.setStartAfter(Ne);
    $e.collapse(true);
    A.current = $e.cloneRange();
    const at = window.getSelection();
    if (at) {
      at.removeAllRanges();
      at.addRange($e);
    }
    gt();
  }, [gt, ke]);
  const Q = g.useCallback(G => {
    const xe = G && G.id || '';
    const Me = (s || []).find(ye => {
      return ye.id === xe;
    });
    const Re = G && G.name || Me && Me.name || '素材';
    const $ = G && G.dataUrl || Me && Me.dataUrl || '';
    const ie = CS(C.current, xe);
    const be = NS(C.current, xe);
    if (!ie) {
      x(ye => {
        return [...ye, {
          n: be,
          id: xe,
          rawName: Re
        }];
      });
    }
    ee(be, Re, $);
  }, [s, ee]);
  const me = g.useCallback(G => {
    const xe = V(G.n);
    ee(G.n, xe.label || G.rawName, xe.dataUrl);
  }, [V, ee]);
  const ve = g.useCallback(() => {
    const G = D.current;
    if (G) {
      if (OS(G)) {
        G.innerHTML = '';
      }
      gt();
      if (Q3(G)) {
        A.current = Ia(G);
        Ct();
      }
    }
  }, [gt, Ct]);
  const qe = g.useCallback(G => {
    const xe = G.clipboardData || window.clipboardData;
    if (!xe) {
      return;
    }
    const Me = xe.getData('text');
    if (!Me) {
      return;
    }
    G.preventDefault();
    const Re = String(Me).replace(/\r\n?/g, `
`);
    try {
      if (typeof document.execCommand == 'function' && document.execCommand('insertText', false, Re)) {
        requestAnimationFrame(gt);
        return;
      }
    } catch {}
    const $ = D.current;
    const ie = $ && Ia($);
    if (ie) {
      ie.deleteContents();
      ie.insertNode(document.createTextNode(Re));
      ie.collapse(false);
      const be = window.getSelection();
      if (be) {
        be.removeAllRanges();
        be.addRange(ie);
      }
    }
    requestAnimationFrame(gt);
  }, [gt]);
  const tt = g.useCallback(G => {
    Q({
      id: G.libId || G.id,
      name: G.label,
      dataUrl: G.dataUrl
    });
  }, [Q]);
  const Ae = g.useCallback(G => {
    if (e) {
      u(e, G);
    }
  }, [e, u]);
  const [nt, _e] = g.useState(null);
  const Z = g.useCallback(() => {
    if (!e) {
      return;
    }
    const G = L.getState();
    const xe = G.library || [];
    if (!xe.filter(Ne => {
      return Ne && Ne.id && Ne.name && String(Ne.name).trim();
    }).length) {
      G.showToast('资源库为空：先添加素材再自动匹配', 'warn', 3200);
      return;
    }
    const Me = eu(N.current, C.current);
    const Re = Zc(Me.text, Me.refs);
    const $ = Jh(Re, xe);
    const ie = Ne => {
      return (String(Ne || '').match(/@\[[^\]|]*\|[^\]]*\]/g) || []).length;
    };
    const be = ie($) - ie(Re);
    if ($ === Re) {
      _e('none');
      G.showToast('未匹配到资源库素材：正文里没有与素材同名的文字', 'warn', 3500);
      setTimeout(() => {
        return _e(null);
      }, 1500);
      return;
    }
    u(e, {
      text: $
    });
    const ye = Ja($, In);
    N.current = ye.text;
    C.current = ye.refs;
    y(ye.text);
    x(ye.refs);
    k.current = ye.text;
    M(Ne => {
      return Ne + 1;
    });
    _e('ok');
    G.showToast(`自动匹配完成：新增 ${be} 处素材引用`, 'success', 3000);
    setTimeout(() => {
      return _e(null);
    }, 1500);
  }, [e, u]);
  const T = g.useCallback(G => {
    const xe = De.includes(G);
    Ae({
      styleIds: xe ? [] : [G]
    });
  }, [De, Ae]);
  const K = g.useCallback(() => {
    if (!e) {
      return;
    }
    if (!(N.current || '').trim()) {
      L.getState().showToast('请先输入提示词', 'warn');
      return;
    }
    xt();
    const G = L.getState();
    const xe = Wk();
    if (!xe.logged) {
      G.showToast('账号池暂无已登录的账号，请先登录账号后再生成', 'warn');
      return;
    }
    const Me = wn().filter(ie => {
      return ie.nodeId === e && (ie.status === 'waiting' || ie.status === 'sending');
    }).map(ie => {
      return ie.accountId;
    }).filter(Boolean);
    const {
      added: Re,
      skipped: $
    } = $S([{
      nodeId: e,
      name: t && t.data && t.data.label || '文生视频'
    }], {
      force: true,
      excludeAccountIds: Me
    });
    if (!Re.length) {
      G.showToast($.length && $[0].reason || '该任务已在队列中', 'info');
      return;
    }
    TS({
      sendOne: PS()
    });
    if (!xe.idle) {
      G.showToast('所有账号都在生成中，已排队等待空闲账号', 'info');
    }
  }, [e, xt, t]);
  const Y = !!f && f.status === 'sending';
  if (!e || !t) {
    return null;
  }
  const de = G => {
    const xe = Object.fromEntries(n.map($ => {
      return [$.id, $];
    }));
    const Me = s.find($ => {
      return $.id === G.id;
    });
    if (Me && Me.dataUrl) {
      return Me.dataUrl;
    }
    const Re = xe[G.id];
    if (Re && Re.type === 'material' && Re.data && Re.data.dataUrl) {
      return Re.data.dataUrl;
    } else if (Re && Re.type === 'video' && Re.data && Re.data.poster) {
      return Re.data.poster;
    } else if (Re && Re.type === 'imggen' && Re.data && Re.data.dataUrl) {
      return Re.data.dataUrl;
    } else {
      return '';
    }
  };
  const ae = new Set(b.map(G => {
    return G.id;
  }));
  const we = ne.filter(G => {
    return (G.type === 'material' || G.type === 'video' || G.type === 'imggen') && !ae.has(G.libId || G.id) && G.dataUrl;
  });
  const Se = (() => {
    const G = new Set();
    const xe = new Set();
    const Me = [];
    b.forEach(Re => {
      const $ = Re.id || `#n${Re.n}`;
      if (G.has($)) {
        return;
      }
      const ie = (de(Re) || '').trim();
      if (!ie || !xe.has(ie)) {
        G.add($);
        if (ie) {
          xe.add(ie);
        }
        Me.push(Re);
      }
    });
    return Me;
  })();
  const Le = !!t.data && (!!t.data.resultUrl || !!t.data.resultPoster);
  const Ge = b.length > 0 ? '图生视频' : '文生视频';
  const He = (() => {
    const G = L.getState().resolveApiProviderId('video');
    return G && (L.getState().apiProvidersMeta || []).find(Me => {
      return Me.id === G;
    }) || null;
  })();
  const lt = async () => {
    if (!(N.current || '').trim()) {
      L.getState().showToast('请先输入提示词', 'warn');
      return;
    }
    if (!He) {
      L.getState().showToast('没有可用的 API 服务商：请到顶栏「API 服务」启用并保存密钥', 'warn', 4500);
      return;
    }
    xt();
    const G = L.getState();
    const xe = (N.current || '').replace(/@图(\d{1,3})/g, (Ne, $e) => {
      const at = (C.current || []).find(Fe => {
        return Fe.n === Number($e);
      });
      if (at) {
        return String(at.rawName || '').trim();
      } else {
        return Ne;
      }
    });
    const Me = nu(De, G.styles || []);
    const Re = Me.prefix ? `${Me.prefix}，${xe}` : xe;
    const $ = {
      ratio: ce,
      duration: oe,
      resolution: '1080p',
      watermark: 'off'
    };
    const ie = Fc({
      accountName: `API · ${He.name}`,
      params: {
        ratio: ce,
        duration: oe,
        styleId: De[0] || null
      },
      prompt: Re,
      edit: {
        text: N.current,
        aspectRatio: ce,
        duration: oe,
        model: he,
        sendAccount: 'api',
        styleIds: De
      },
      status: 'pending',
      note: `API 通道 · ${He.name}`
    });
    const be = b.map(Ne => {
      return de(Ne);
    }).filter(Boolean);
    const ye = await G.submitApiJob({
      providerId: He.id,
      kind: 'video',
      prompt: Re,
      params: $,
      nodeId: e,
      refSources: be,
      attempt: ie
    });
    if (ye && ye.ok) {
      Ae({
        apiJob: {
          jobId: ye.jobId,
          providerId: He.id,
          providerName: He.name,
          status: 'queued',
          kind: 'video'
        }
      });
      G.showToast(`已提交 API 生成（${He.name}），出片后自动连到本节点`, 'success');
    } else {
      G.showToast(`API 提交失败：${ye && ye.error || '未知错误'}`, 'error', 5000);
    }
  };
  const st = async () => {
    if (!(N.current || '').trim()) {
      L.getState().showToast('请先输入提示词', 'warn');
      return;
    }
    if (!He) {
      L.getState().showToast('没有可用的 API 服务商：请到顶栏「API 服务」启用并保存密钥', 'warn', 4500);
      return;
    }
    xt();
    const G = L.getState();
    const xe = (N.current || '').replace(/@图(\d{1,3})/g, ($e, at) => {
      const Fe = (C.current || []).find(W => {
        return W.n === Number(at);
      });
      if (Fe) {
        return String(Fe.rawName || '').trim();
      } else {
        return $e;
      }
    });
    const Me = nu(De, G.styles || []);
    const Re = Me.prefix ? `${Me.prefix}，${xe}` : xe;
    const $ = {
      ratio: ce,
      duration: oe,
      resolution: '1080p',
      watermark: 'off'
    };
    const ie = ['16:9', '9:16', '1:1'].map($e => {
      return {
        params: {
          ...$,
          ratio: $e
        }
      };
    });
    const be = b.map($e => {
      return de($e);
    }).filter(Boolean);
    const ye = {
      providerId: He.id,
      kind: 'video',
      prompt: Re,
      params: $,
      nodeId: e,
      refSources: be
    };
    const Ne = await G.submitApiBatch(ye, ie.map(($e, at) => {
      return {
        params: $e.params,
        attempt: Fc({
          accountName: `API · ${He.name} · ${$e.params.ratio}`,
          params: {
            ratio: $e.params.ratio,
            duration: oe,
            styleId: De[0] || null
          },
          prompt: Re,
          edit: {
            text: N.current,
            aspectRatio: $e.params.ratio,
            duration: oe,
            model: he,
            sendAccount: 'api',
            styleIds: De
          },
          status: 'pending',
          note: `API 批量 · ${He.name} · ${$e.params.ratio}`
        })
      };
    }));
    if (Ne && Ne.ok) {
      const $e = (Ne.jobIds || []).filter(Boolean).length;
      Ae({
        apiJob: {
          jobId: (Ne.jobIds || []).find(Boolean) || null,
          providerId: He.id,
          providerName: He.name,
          status: 'queued',
          kind: 'video',
          batch: true
        }
      });
      G.showToast(`已批量提交 ${$e} 个任务（多比例 · ${He.name}），出片后自动连到本节点`, 'success');
    } else {
      G.showToast(`批量提交失败：${Ne && Ne.error || '未知错误'}`, 'error', 5000);
    }
  };
  const dt = G => {
    Ke();
    const xe = G ? G.getBoundingClientRect() : null;
    j(xe ? {
      left: xe.left,
      top: xe.top,
      bottom: xe.bottom
    } : null);
    E(true);
  };
  return <i.Fragment>
      <div className="gen-panel-layer" onMouseDown={Nt}>
        <div className="gen-panel" ref={w} onMouseDown={G => {
        return G.stopPropagation();
      }}>
          <div className="gp-head">
            <span className="gp-title">{Ge}</span>
            <button type="button" className="gp-btn gp-automatch-btn gp-head-automatch" title="自动匹配：把资源库素材名与正文比对（精准 / 「参考图」前缀 / 字母数字组合），命中后追加 @素材 引用" onClick={Z}>
              {nt === 'ok' ? '✓ 已匹配' : nt === 'none' ? '无匹配' : '自动匹配'}
            </button>
            <span className="gp-meta">
              已连接 {ne.length} 个输入 · {it} · {io(he)} · {oe}s
              {b.length ? ` · ${b.length} 张参考` : ''}
            </span>
            <button className="gp-close" onClick={Nt} title="保存并关闭（Esc）">
              ✕
            </button>
          </div>
          {f && f.msg ? <div className={`gp-status gp-status-${f.status || 'info'}`}>
              {f.status === 'error' ? '⚠️ ' : f.status === 'success' ? '✓ ' : '⏳ '}
              {f.msg}
            </div> : null}
          {b.length > 0 || we.length > 0 ? <div className="gp-thumbs">
              {Se.map(G => {
            const xe = de(G);
            return <button type="button" className="gp-thumb" title={`@${G.rawName}（角标 ${G.n}；在正文里删掉这枚引用芯片即移除引用）`} onClick={Me => {
              Me.stopPropagation();
              A.current = Ia(D.current);
              me(G);
            }} key={`${G.n}-${G.id}`}>
                    {xe ? <img src={Xt(xe, 160)} alt="" /> : <span className="gp-thumb-noimg">?</span>}
                    <span className="gp-thumb-badge">{G.n}</span>
                  </button>;
          })}
              {we.map(G => {
            return <button type="button" className="gp-thumb is-unrefed" title={`上游素材「${G.label}」尚未被正文引用，点击插入 @引用`} onClick={xe => {
              xe.stopPropagation();
              tt(G);
            }} key={`up-${G.id}`}>
                    <img src={Xt(G.dataUrl, 160)} alt="" />
                    <span className="gp-thumb-plus">＋</span>
                  </button>;
          })}
              <button type="button" className="gp-thumb is-add" title="添加参考图（从资源库选择）" onClick={G => {
            G.stopPropagation();
            dt(G.currentTarget);
          }}>
                <span className="gp-thumb-plus">＋</span>
              </button>
            </div> : null}
          <div ref={D} className="gp-prompt" contentEditable={true} suppressContentEditableWarning={true} role="textbox" aria-multiline="true" aria-label="提示词正文" data-placeholder="描述想生成的视频画面…（输入 @ 引用素材）" style={{
          height: `${U}px`
        }} onInput={ve} onBlur={gt} onPaste={qe} onMouseDown={G => {
          return G.stopPropagation();
        }} />
          <div className="gp-toolbar" onMouseDown={G => {
          return G.stopPropagation();
        }}>
            <button type="button" className="gp-btn" title="引用素材（弹出素材列表，选中后以「微缩图 + 素材名」插入正文）" onMouseDown={G => {
            return G.preventDefault();
          }} onClick={G => {
            return dt(G.currentTarget);
          }}>
              @
            </button>
            <span className="gp-sep" />
            {kt.length === 0 ? <button type="button" className="gp-btn" title="风格库：发送时注入的修饰前缀（单选；「不使用风格」则不传）" onClick={() => {
            return R(true);
          }}>
                ◇ 风格 <span className="gp-caret" />
              </button> : De.map(G => {
            const xe = (l || []).find(Me => {
              return Me.id === G;
            });
            if (xe) {
              return <span className="gp-style-chip" key={G}>
                      <button type="button" className="gp-style-chip-main" title={`风格「${xe.name}」：点击打开风格库`} onClick={() => {
                  return R(true);
                }}>
                        <span className="gp-style-chip-glyph">◇</span> {xe.name}
                      </button>
                      <button type="button" className="gp-style-chip-x" title={`移除风格「${xe.name}」`} onClick={() => {
                  return T(G);
                }}>
                        ×
                      </button>
                    </span>;
            } else {
              return null;
            }
          })}
            <button type="button" ref={G => {
            _t.current.ratio = G;
          }} className="gp-btn" title="画面比例" onClick={() => {
            return zt('ratio');
          }}>
              {Rt} <span className={`gp-caret${et === 'ratio' ? ' open' : ''}`} />
            </button>
            <div className="gp-acc-wrap" ref={Ee}>
              <button type="button" ref={Ve} className="gp-btn" title="发送账号：先选分组（与后台分组同步），再选自动或组内账号" onClick={ze}>
                {ut} <span className={`gp-caret${le ? ' open' : ''}`} />
              </button>
              {le ? on.createPortal(<div className="gp-acc-menu" ref={je} style={X ? {
              left: X.left,
              bottom: X.bottom
            } : undefined} onMouseDown={G => {
              return G.stopPropagation();
            }}>
                      {le.level === 'root' ? (o || []).length ? <i.Fragment>
                            <button type="button" className={`gp-acc-item${Ie === 'auto' ? ' on' : ''}`} onClick={() => {
                  Ae({
                    sendAccount: 'auto',
                    channel: 'backend'
                  });
                  te(null);
                }}>
                              <span className="gp-acc-name">全部账号（自动）</span>
                            </button>
                            {Qe.map(G => {
                  return <button type="button" className="gp-acc-item" onClick={() => {
                    return te({
                      level: 'group',
                      gid: G.gid
                    });
                  }} key={G.gid || Aa}>
                                  <span className="gp-acc-name">{G.label}</span>
                                  <span className="gp-acc-count">
                                    {G.list.filter(xe => {
                        return (xe.status || '已登录') === '已登录';
                      }).length}
                                    /{G.list.length}
                                  </span>
                                </button>;
                })}
                            <button type="button" className={`gp-acc-item${Je === 'api' ? ' on' : ''}`} onClick={() => {
                  Ae({
                    channel: 'api'
                  });
                  te(null);
                }}>
                              <span className="gp-acc-name">API{He ? '' : '（未配置）'}</span>
                            </button>
                          </i.Fragment> : <div className="gp-acc-empty">暂无账号，请先在「账号」页登录</div> : (() => {
                const G = Qe.find(Me => {
                  return (Me.gid || Aa) === le.gid;
                });
                if (!G) {
                  return null;
                }
                const xe = `auto:group:${G.gid || Aa}`;
                return <i.Fragment>
                              <button type="button" className="gp-acc-item gp-acc-back" onClick={() => {
                    return te({
                      level: 'root'
                    });
                  }}>
                                ← {G.label}
                              </button>
                              <button type="button" className={`gp-acc-item${Ie === xe ? ' on' : ''}`} onClick={() => {
                    Ae({
                      sendAccount: xe
                    });
                    te(null);
                  }}>
                                自动选择可用{G.label}
                              </button>
                              {G.list.map(Me => {
                    const Re = (Me.status || '已登录') === '已登录';
                    const $ = Ie === Me.id;
                    return <button type="button" className={`gp-acc-item${$ ? ' on' : ''}${Re ? '' : ' off'}`} title={`${Me.name} · ${Re ? '可用' : Me.status || '不可用'} · ${Me.name}`} disabled={!Re} onClick={() => {
                      Ae({
                        sendAccount: Me.id
                      });
                      te(null);
                    }} key={Me.id}>
                                    <span className={`gp-acc-dot${Re ? '' : ' gray'}`} />
                                    <span className="gp-acc-name">{Me.name}</span>
                                  </button>;
                  })}
                            </i.Fragment>;
              })()}
                    </div>, document.body) : null}
            </div>
            <button type="button" ref={G => {
            _t.current.model = G;
          }} className="gp-btn" title="生成模型" onClick={() => {
            return zt('model');
          }}>
              {Be} <span className={`gp-caret${et === 'model' ? ' open' : ''}`} />
            </button>
            <button type="button" ref={G => {
            _t.current.dur = G;
          }} className="gp-btn" title={`视频时长：${oe} 秒（${Ts}–${xo} 秒可调）`} onClick={() => {
            return zt('dur');
          }}>
              {oe}s <span className={`gp-caret${et === 'dur' ? ' open' : ''}`} />
            </button>
            {et ? on.createPortal(<div className="gp-acc-menu gp-param-menu" ref={Mt} style={wt ? {
            left: wt.left,
            bottom: wt.bottom
          } : undefined} onMouseDown={G => {
            return G.stopPropagation();
          }}>
                    {et === 'ratio' && K0.map(G => {
              return <button type="button" className={`gp-acc-item${ce === G.value ? ' on' : ''}`} onClick={() => {
                Ae({
                  aspectRatio: G.value
                });
                ct(null);
              }} key={G.value}>
                            <span className="gp-acc-name">{G.label}</span>
                          </button>;
            })}
                    {et === 'model' && Y0.map(G => {
              return <button type="button" className={`gp-acc-item${he === G.value ? ' on' : ''}`} onClick={() => {
                Ae({
                  model: G.value
                });
                ct(null);
              }} key={G.value}>
                            <span className="gp-acc-name">{G.label}</span>
                          </button>;
            })}
                    {et === 'dur' && <div className="gp-dur-pop">
                        <div className="gp-dur-pop-head">
                          <span className="gp-dur-pop-label">视频时长</span>
                          <span className="gp-dur-pop-val">{oe}s</span>
                        </div>
                        <input type="range" className="dur-slider gp-dur-pop-input" min={Ts} max={xo} step={1} value={oe} onChange={G => {
                return Ae({
                  duration: Number(G.target.value)
                });
              }} aria-label={`视频时长（秒），${Ts} 到 ${xo}`} style={{
                '--progress': `${(oe - Ts) / (xo - Ts) * 100}%`
              }} />
                        <div className="gp-dur-pop-scale">
                          <span>{Ts}s</span>
                          <span>{xo}s</span>
                        </div>
                      </div>}
                  </div>, document.body) : null}
            <div className="gp-toolbar-grow" />
            <button type="button" className={`gp-generate${Y ? ' busy' : ''}`} onClick={Je === 'api' ? lt : K} title={Je === 'api' ? `走 API 通道生成${He ? `（${He.name}）` : '（未配置可用服务商）'}` : Le ? '按当前提示词与参数重新生成（可连点：自动换另一个空闲账号并行）' : '按当前提示词与参数生成视频（可连点：自动换另一个空闲账号并行）'}>
              {Le ? '重新生成' : '生成'}
            </button>
            {Je === 'api' && He ? <button type="button" className="gp-batch" onClick={st} title={`批量出片：同一提示词 + ${He.name}，按 16:9 / 9:16 / 1:1 三个比例各出一片（复用并发队列）`}>
                批量出片
              </button> : null}
            <span className={`gp-resize${H ? ' is-dragging' : ''}`} title={`拖动调整输入框高度（双击复位 ${Or}px）`} aria-label="拖动调整输入框高度" role="separator" onMouseDown={G => {
            G.preventDefault();
            G.stopPropagation();
            se.current = {
              y: G.clientY,
              h: U
            };
            J(true);
          }} onDoubleClick={() => {
            return _(Or);
          }}>
              <span className="gp-resize-grip" />
            </span>
          </div>
        </div>
      </div>
      <_cmp__Component33 open={S} anchor={P} variant="list" onCancel={() => {
      return E(false);
    }} onPick={G => {
      return Q(G);
    }} />
      <_cmp_US open={O} selectedIds={De} onToggle={T} onUseNone={() => {
      return Ae({
        styleIds: []
      });
    }} onClose={() => {
      return R(false);
    }} />
    </i.Fragment>;
}