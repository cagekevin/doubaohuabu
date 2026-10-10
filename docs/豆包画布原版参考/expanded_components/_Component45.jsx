// TODO(全局, 无需 import): $, ie, y, w, ze, m, P, Ee, Ve, h, t, Qe, x, zoom, At, wt, et, ct, be, ye, $e, Ne, at, W, Ce, fe, Te, Fe, Ue, rt, Ye, Pe, Je, text, channel, ratio, count, styleIds, model, resolution, v, z, M, _, J, R, A, q, ke, je, S, le, e, j, _t, s, n, label, dataUrl, Mt, zt, C, E, re, X, te, N, left, bottom, Be, Rt, rawName, xt, it, p, I, O, F, U, D, H, aspectRatio, imageCount, igModel, igResolution, u, d, f, ne, he, oe, Ie, me, ve, _e, tt, level, Ae, nt, o, a, gid, list, sendAccount, ae, ut, generating, Le, status, note, Ge, c, r, body, sentRefs, lt, l, pe, mt, providerId, kind, prompt, params, nodeId, refSources, ot, length, ht, ok, error, bt, $t, jobIds, startedAt, key, stylePrefix, refImages, reason, accountId, account, name, source, accountName, onItem, natW, natH, onEnd, He, timeoutMs, st, we, de, xe, Me, Re, gt, Nt, kt, height, De, Ke, Ct, ge, Q, G, Z, Se, V, dt, qe, Y, T, ee, K, ce, se, b, k
import _cmp_US from "./US.jsx";
import _cmp__Component33 from "./_Component33.jsx";
import { L, Rp, sf, Or, Tu, Ja, In, $r, rf, eu, Zc, DS, RS, LS, go, SS, um, la, CS, NS, id, OS, iO, nf, Jh, jl, J0, Np, Sp, Hu, KL, Q0, nu, aO, tO, Uu, DR, tn, tf, Xt, on, lO } from "./shared.js";
import * as g from 'react';
import * as i from 'react';
export default function _Component45() {
  const e = L($ => {
    return $.imggenPanelNodeId;
  });
  const t = L($ => {
    if ($.imggenPanelNodeId) {
      return $.nodes.find(ie => {
        return ie.id === $.imggenPanelNodeId;
      });
    } else {
      return null;
    }
  });
  const n = L($ => {
    return $.nodes;
  });
  const r = L($ => {
    return $.edges;
  });
  const s = L($ => {
    return $.library;
  });
  const o = L($ => {
    return $.accounts;
  });
  const a = L($ => {
    return $.groups;
  }) || [];
  const l = L($ => {
    return $.styles || [];
  });
  const c = L($ => {
    return $.apiJobs || {};
  });
  const u = L($ => {
    return $.apiProvidersMeta || [];
  });
  const d = L($ => {
    return $.apiConfigs || {};
  });
  const f = L($ => {
    return $.apiSetup || {};
  });
  const p = L($ => {
    return $.closeImageGenPanel;
  });
  const [h, m] = g.useState('');
  const [w, v] = g.useState([]);
  const y = g.useRef([]);
  y.current = w;
  const [b, x] = g.useState(false);
  const [k, N] = g.useState(null);
  const C = g.useRef(null);
  const S = g.useRef(null);
  const [E, P] = g.useState(0);
  const j = g.useCallback($ => {
    ze.current = $;
    m($);
    P(ie => {
      return ie + 1;
    });
  }, []);
  const [I, z] = g.useState('doubao');
  const [O, R] = g.useState(Rp.doubao[0].value);
  const [D, A] = g.useState(sf);
  const [F, M] = g.useState('1:1');
  const [U, _] = g.useState(1);
  const [H, J] = g.useState([]);
  const [se, ke] = g.useState(false);
  const [V, pe] = g.useState(false);
  const [ne, q] = g.useState(null);
  const [ce, oe] = g.useState(null);
  const he = g.useRef({});
  const Ie = g.useRef(null);
  const [De, le] = g.useState(Or);
  const [te, X] = g.useState(false);
  const re = g.useRef(null);
  const [Ee, je] = g.useState([]);
  const Ve = g.useRef(Ee);
  Ve.current = Ee;
  const ze = g.useRef('');
  ze.current = h;
  const Qe = t && t.data || {};
  const Je = Array.isArray(Qe.results) ? Qe.results : [];
  const ut = Qe.sendAccount || 'auto';
  const {
    x: et,
    y: ct,
    zoom: wt
  } = Tu();
  const At = g.useRef(null);
  g.useLayoutEffect(() => {
    const $ = At.current;
    if (!$ || !t) {
      return;
    }
    const ie = t.measured && t.measured.width || t.width || 380;
    const be = t.measured && t.measured.height || t.height || 320;
    const ye = t.position.x * wt + et;
    const Ne = t.position.y * wt + ct;
    const $e = ie * wt;
    const at = be * wt;
    const Fe = ye + $e / 2;
    const W = Ne + at;
    const Ce = 12;
    const fe = window.innerHeight - W - Ce;
    const Te = Ne - Ce;
    $.style.maxHeight = `${Math.max(300, Math.round(Math.max(fe, Te)))}px`;
    const Ue = $.offsetWidth || Math.min(680, window.innerWidth * 0.92);
    const Ye = $.offsetHeight || 360;
    let Pe = Fe - Ue / 2;
    let rt = W + Ce;
    if (rt + Ye > window.innerHeight - Ce) {
      rt = Ne - Ye - Ce;
    }
    if (rt < Ce) {
      rt = Math.max(Ce, window.innerHeight - Ye - Ce);
    }
    Pe = Math.max(Ce, Math.min(Pe, window.innerWidth - Ue - Ce));
    $.style.left = `${Pe}px`;
    $.style.top = `${rt}px`;
  }, [t, et, ct, wt, Je.length]);
  g.useEffect(() => {
    if (!e || !t) {
      return;
    }
    const $ = t.data || {};
    const ie = Array.isArray($.results) ? $.results : [];
    const be = $.viewUrl && ie.some(Fe => {
      return Fe.dataUrl === $.viewUrl;
    }) ? $.viewUrl : $.resultUrl || null;
    const ye = be ? ie.find(Fe => {
      return Fe.dataUrl === be;
    }) : null;
    const Ne = ye && ye.params || null;
    const $e = {
      text: Ne && Ne.text || $.text || '',
      channel: Ne && Ne.channel || $.channel || 'doubao',
      ratio: Ne && Ne.aspectRatio || $.aspectRatio || '1:1',
      count: Math.max(1, Math.min(4, Ne && Ne.imageCount || $.imageCount | 0 || 1)),
      styleIds: Array.isArray(Ne && Ne.styleIds) ? Ne.styleIds : Array.isArray($.styleIds) ? $.styleIds : [],
      model: Ne && Ne.igModel || $.igModel || '',
      resolution: Ne && Ne.igResolution || $.igResolution || ''
    };
    const at = Ja($e.text, In);
    m(at.text);
    v(at.refs);
    z($e.channel);
    M($e.ratio);
    _($e.count);
    J($e.styleIds);
    R($e.model && $r($e.channel).some(Fe => {
      return Fe.value === $e.model;
    }) ? $e.model : $r($e.channel)[0].value);
    A(rf.includes($e.resolution) ? $e.resolution : sf);
    q(null);
    ke(false);
    je([]);
    x(false);
    P(Fe => {
      return Fe + 1;
    });
    S.current = null;
    le(Or);
  }, [e]);
  g.useEffect(() => {
    if (!e || !t) {
      return;
    }
    const $ = t.data || {};
    if (!$.viewUrl) {
      return;
    }
    const be = (Array.isArray($.results) ? $.results : []).find($e => {
      return $e.dataUrl === $.viewUrl;
    });
    const ye = be && be.params;
    if (!ye) {
      return;
    }
    z(ye.channel || 'doubao');
    M(ye.aspectRatio || '1:1');
    _(Math.max(1, Math.min(4, ye.imageCount | 0 || 1)));
    J(Array.isArray(ye.styleIds) ? ye.styleIds : []);
    R(ye.igModel && $r(ye.channel || 'doubao').some($e => {
      return $e.value === ye.igModel;
    }) ? ye.igModel : $r(ye.channel || 'doubao')[0].value);
    A(rf.includes(ye.igResolution) ? ye.igResolution : sf);
    const Ne = Ja(ye.text || '', In);
    j(Ne.text);
    v(Ne.refs);
  }, [e, t && t.data && t.data.viewUrl]);
  const _t = g.useCallback(() => {
    const $ = eu(ze.current || '', y.current || []);
    return Zc($.text, $.refs);
  }, []);
  g.useEffect(() => {
    const $ = e;
    return () => {
      if ($) {
        try {
          const ie = L.getState();
          if (!ie.nodes.some(be => {
            return be.id === $;
          })) {
            return;
          }
          ie.updateNodeData($, {
            text: _t()
          });
        } catch {}
      }
    };
  }, [e, _t]);
  const Mt = g.useCallback($ => {
    const ie = (y.current || []).find($e => {
      return $e.n === $;
    });
    if (!ie) {
      return {};
    }
    const be = (s || []).find($e => {
      return $e.id === ie.id;
    });
    const ye = (n || []).find($e => {
      return $e.id === ie.id;
    });
    const Ne = be && be.dataUrl || ye && ye.type === 'material' && ye.data && ye.data.dataUrl || ye && ye.type === 'video' && ye.data && ye.data.poster || ye && ye.type === 'imggen' && ye.data && ye.data.dataUrl || '';
    return {
      label: be && be.name || ie.rawName || '素材',
      dataUrl: Ne
    };
  }, [s, n]);
  const zt = g.useRef(Mt);
  zt.current = Mt;
  g.useLayoutEffect(() => {
    const $ = C.current;
    if ($) {
      $.innerHTML = DS(ze.current || '', ie => {
        return zt.current(ie);
      });
    }
  }, [E]);
  g.useEffect(() => {
    if (!te) {
      return;
    }
    const $ = be => {
      const ye = re.current;
      if (ye) {
        le(RS(ye.h + (be.clientY - ye.y)));
      }
    };
    const ie = () => {
      re.current = null;
      X(false);
    };
    window.addEventListener('mousemove', $);
    window.addEventListener('mouseup', ie);
    document.body.classList.add('gp-resizing');
    return () => {
      window.removeEventListener('mousemove', $);
      window.removeEventListener('mouseup', ie);
      document.body.classList.remove('gp-resizing');
    };
  }, [te]);
  const Rt = g.useCallback(() => {
    const $ = C.current;
    if (!$) {
      return;
    }
    const ie = LS($);
    ze.current = ie;
    m(ie);
  }, []);
  const Be = g.useCallback(() => {
    const $ = C.current;
    if (!$) {
      return null;
    }
    const ie = go($);
    S.current = ie;
    return ie;
  }, []);
  const it = g.useCallback(() => {
    const $ = C.current;
    const ie = window.getSelection();
    let be = null;
    if (ie && ie.rangeCount) {
      const ye = ie.getRangeAt(0);
      be = ye.getBoundingClientRect();
      if ((!be || !be.width && !be.height) && typeof ye.getClientRects == 'function') {
        const Ne = ye.getClientRects();
        if (Ne && Ne.length) {
          be = Ne[0];
        }
      }
    }
    if ((!be || !be.width && !be.height) && $) {
      be = $.getBoundingClientRect();
    }
    N(be ? {
      left: be.left,
      top: be.top,
      bottom: be.bottom
    } : null);
    x(true);
  }, []);
  const kt = g.useCallback($ => {
    Be();
    const ie = $ ? $.getBoundingClientRect() : null;
    N(ie ? {
      left: ie.left,
      top: ie.top,
      bottom: ie.bottom
    } : null);
    x(true);
  }, [Be]);
  const xt = g.useCallback(($, ie, be) => {
    const ye = C.current;
    if (!ye) {
      const Te = SS(ze.current || '', (ze.current || '').length, $);
      j(Te.text);
      return;
    }
    try {
      ye.focus();
    } catch {}
    let Ne = S.current;
    if (!Ne || !Ne.startContainer || !ye.contains(Ne.startContainer)) {
      Ne = go(ye);
    }
    if (!Ne) {
      return;
    }
    let $e = '';
    try {
      const Te = document.createRange();
      Te.selectNodeContents(ye);
      Te.setEnd(Ne.startContainer, Ne.startOffset);
      $e = Te.toString();
    } catch {
      $e = '';
    }
    if (/@$/.test($e)) {
      try {
        if (Ne.startContainer.nodeType === 3) {
          const Te = Math.max(0, Ne.startOffset - 1);
          const Ue = document.createRange();
          Ue.setStart(Ne.startContainer, Te);
          Ue.setEnd(Ne.startContainer, Ne.startOffset);
          Ue.deleteContents();
          Ne = Ue;
          $e = $e.slice(0, -1);
        }
      } catch {}
    }
    const at = document.createDocumentFragment();
    if (um($e)) {
      at.appendChild(document.createTextNode('\xA0'));
    }
    const Fe = document.createElement('span');
    Fe.className = 'ref-chip gp-ref-chip';
    Fe.contentEditable = 'false';
    Fe.dataset.n = String($);
    Fe.innerHTML = la(ie, be);
    at.appendChild(Fe);
    const W = document.createTextNode('\xA0');
    at.appendChild(W);
    Ne.deleteContents();
    Ne.insertNode(at);
    const Ce = document.createRange();
    Ce.setStartAfter(W);
    Ce.collapse(true);
    S.current = Ce.cloneRange();
    const fe = window.getSelection();
    if (fe) {
      fe.removeAllRanges();
      fe.addRange(Ce);
    }
    Rt();
  }, [Rt, j]);
  const Nt = g.useCallback($ => {
    const ie = $ && $.id || '';
    const be = (s || []).find(Fe => {
      return Fe.id === ie;
    });
    const ye = $ && $.name || be && be.name || '素材';
    const Ne = $ && $.dataUrl || be && be.dataUrl || '';
    const $e = CS(y.current, ie);
    const at = NS(y.current, ie);
    if (!$e) {
      v(Fe => {
        return [...Fe, {
          n: at,
          id: ie,
          rawName: ye
        }];
      });
    }
    xt(at, ye, Ne);
  }, [s, xt]);
  const gt = g.useCallback($ => {
    const ie = Mt($.n);
    xt($.n, ie.label || $.rawName, ie.dataUrl);
  }, [Mt, xt]);
  const Ke = g.useCallback(() => {
    const $ = C.current;
    if ($) {
      if (OS($)) {
        $.innerHTML = '';
      }
      Rt();
      if (iO($)) {
        S.current = go($);
        it();
      }
    }
  }, [Rt, it]);
  const Ct = g.useCallback($ => {
    const ie = $.clipboardData || window.clipboardData;
    if (!ie) {
      return;
    }
    const be = ie.getData('text');
    if (!be) {
      return;
    }
    $.preventDefault();
    const ye = String(be).replace(/\r\n?/g, `
`);
    try {
      if (typeof document.execCommand == 'function' && document.execCommand('insertText', false, ye)) {
        requestAnimationFrame(Rt);
        return;
      }
    } catch {}
    const Ne = C.current;
    const $e = Ne && go(Ne);
    if ($e) {
      $e.deleteContents();
      $e.insertNode(document.createTextNode(ye));
      $e.collapse(false);
      const at = window.getSelection();
      if (at) {
        at.removeAllRanges();
        at.addRange($e);
      }
    }
    requestAnimationFrame(Rt);
  }, [Rt]);
  g.useEffect(() => {
    if (e && !t) {
      p();
    }
  }, [e, t, p]);
  g.useEffect(() => {
    const $ = ie => {
      if (ie.key === 'Escape') {
        p();
      }
    };
    window.addEventListener('keydown', $);
    return () => {
      return window.removeEventListener('keydown', $);
    };
  }, [p]);
  g.useEffect(() => {
    if (I === 'api') {
      return;
    }
    const $ = $r(I);
    if (!$.some(ie => {
      return ie.value === O;
    })) {
      R($[0].value);
    }
  }, [I, O]);
  g.useEffect(() => {
    if (e) {
      try {
        const $ = L.getState();
        const ie = $.nodes.find(ye => {
          return ye.id === e;
        });
        if (!ie) {
          return;
        }
        const be = ie.data || {};
        if (be.channel === I && be.aspectRatio === F && (be.imageCount | 0) === U && be.igModel === O && be.igResolution === D && JSON.stringify(be.styleIds || []) === JSON.stringify(H)) {
          return;
        }
        $.updateNodeData(e, {
          channel: I,
          aspectRatio: F,
          styleIds: H,
          imageCount: U,
          igModel: O,
          igResolution: D
        });
      } catch {}
    }
  }, [e, I, F, U, H, O]);
  const ee = g.useMemo(() => {
    const $ = L.getState().resolveApiProviderId('image');
    if (!$) {
      return false;
    }
    const ie = u.find(ye => {
      return ye.id === $;
    });
    const be = d[$] || {};
    return !!ie && be.enabled !== false && be.hasKey;
  }, [u, d, f]);
  const Q = $ => {
    if (ne === $) {
      q(null);
      return;
    }
    const ie = he.current[$];
    const be = ie && ie.getBoundingClientRect();
    if (be) {
      oe({
        left: be.left,
        bottom: window.innerHeight - be.top + 8
      });
    }
    q($);
  };
  g.useEffect(() => {
    if (!ne) {
      return;
    }
    const $ = ie => {
      const be = Ie.current && Ie.current.contains(ie.target);
      const ye = Object.values(he.current).some(Ne => {
        return Ne && Ne.contains(ie.target);
      });
      if (!be && !ye) {
        q(null);
      }
    };
    document.addEventListener('mousedown', $);
    return () => {
      return document.removeEventListener('mousedown', $);
    };
  }, [ne]);
  const [me, ve] = g.useState(null);
  const [qe, tt] = g.useState(null);
  const Ae = g.useRef(null);
  const nt = g.useRef(null);
  const _e = g.useRef(null);
  const Z = () => {
    q(null);
    if (me) {
      ve(null);
      return;
    }
    const $ = _e.current && _e.current.getBoundingClientRect();
    if ($) {
      tt({
        left: $.left,
        bottom: window.innerHeight - $.top + 8
      });
    }
    ve({
      level: 'root'
    });
  };
  g.useEffect(() => {
    if (!me) {
      return;
    }
    const $ = ie => {
      const be = Ae.current && Ae.current.contains(ie.target);
      const ye = nt.current && nt.current.contains(ie.target);
      if (!be && !ye) {
        ve(null);
      }
    };
    document.addEventListener('mousedown', $);
    return () => {
      return document.removeEventListener('mousedown', $);
    };
  }, [me]);
  const T = g.useMemo(() => {
    const $ = new Map();
    (o || []).forEach(ye => {
      const Ne = ye.groupId || null;
      if (!$.has(Ne)) {
        $.set(Ne, []);
      }
      $.get(Ne).push(ye);
    });
    const ie = [];
    (a || []).forEach(ye => {
      const Ne = $.get(ye.id) || [];
      if (Ne.length) {
        ie.push({
          gid: ye.id,
          label: ye.name || '未命名分组',
          list: Ne
        });
      }
    });
    const be = $.get(null) || [];
    if (be.length) {
      ie.push({
        gid: null,
        label: '未分组',
        list: be
      });
    }
    return ie;
  }, [o, a]);
  const K = $ => {
    const ie = new Set($.map(ye => {
      return ye.type || 'doubao';
    }));
    const be = nf.filter(ye => {
      return ie.has(ye);
    });
    if (be.length === 1) {
      return be[0];
    } else {
      return 'doubao';
    }
  };
  const Y = ($, ie) => {
    if (ie && ie !== I) {
      z(ie);
    }
    try {
      L.getState().updateNodeData(e, ie ? {
        sendAccount: $,
        channel: ie
      } : {
        sendAccount: $
      });
    } catch {}
    ve(null);
  };
  const [de, ae] = g.useState(null);
  const we = () => {
    const $ = L.getState();
    const ie = $.library || [];
    if (!ie.filter(Fe => {
      return Fe && Fe.id && Fe.name && String(Fe.name).trim();
    }).length) {
      $.showToast('资源库为空：先添加素材再自动匹配', 'warn', 3200);
      return;
    }
    const be = _t();
    const ye = Jh(be, ie);
    const Ne = Fe => {
      return (String(Fe || '').match(/@\[[^\]|]*\|[^\]]*\]/g) || []).length;
    };
    const $e = Ne(ye) - Ne(be);
    if (ye === be) {
      ae('none');
      $.showToast('未匹配到资源库素材：正文里没有与素材同名的文字', 'warn', 3500);
      setTimeout(() => {
        return ae(null);
      }, 1500);
      return;
    }
    $.updateNodeData(e, {
      text: ye
    });
    const at = Ja(ye, In);
    j(at.text);
    v(at.refs);
    ae('ok');
    $.showToast(`自动匹配完成：新增 ${$e} 处素材引用`, 'success', 3000);
    setTimeout(() => {
      return ae(null);
    }, 1500);
  };
  const Se = g.useMemo(() => {
    if (I === 'api') {
      return 'API';
    }
    const $ = ut;
    if ($ === 'auto') {
      return '自动';
    }
    if (typeof $ == 'string' && $.startsWith('auto:group:')) {
      const be = $.slice(11);
      if (be === jl) {
        return '未分组 · 自动';
      }
      const ye = (a || []).find(Ne => {
        return Ne.id === be;
      });
      return `${ye && ye.name || '分组'} · 自动`;
    }
    const ie = (o || []).find(be => {
      return be.id === $;
    });
    if (ie) {
      return ie.name;
    } else {
      return '自动';
    }
  }, [I, ut, o, a]);
  const ge = $ => {
    J(ie => {
      if (ie.includes($)) {
        return [];
      } else {
        return [$];
      }
    });
  };
  const Le = ($, ie) => {
    je(be => {
      return be.map(ye => {
        if (ye.id === $) {
          return {
            ...ye,
            ...ie
          };
        } else {
          return ye;
        }
      });
    });
  };
  const Ge = ($, ie) => {
    const be = ie || e;
    if (be) {
      try {
        L.getState().updateNodeData(be, {
          generating: $
        });
      } catch {}
    }
  };
  const He = ($, ie) => {
    for (const be of Ve.current) {
      if (be.kind === 'backend' && be.key === $) {
        Le(be.id, ie ? {
          status: 'failed',
          note: ie
        } : {
          status: 'done'
        });
        if (ie) {
          Ge(false, be.nodeId);
        }
      }
    }
  };
  g.useEffect(() => {
    for (const $ of Ve.current) {
      if ($.kind !== 'backend' || $.status !== 'running' || !$.key) {
        continue;
      }
      if ((Je || []).some(be => {
        return be.genKey && be.genKey === $.key;
      })) {
        Le($.id, {
          status: 'done'
        });
      } else if (Date.now() - $.startedAt > J0) {
        Le($.id, {
          status: 'failed',
          note: '等待超时：未收到图片（可去豆包后台查看该会话）'
        });
        Ge(false, $.nodeId);
        Np($.key);
        try {
          Sp($.key);
        } catch {}
        if ($.accountId) {
          try {
            L.getState().releaseAccountBusy($.accountId);
          } catch {}
        }
      }
    }
  }, [Je]);
  g.useEffect(() => {
    for (const $ of Ve.current) {
      if ($.kind !== 'api' || $.status !== 'running') {
        continue;
      }
      const ie = $.jobIds || [];
      const be = ie.map($e => {
        return c[$e];
      }).filter(Boolean);
      if (be.length < ie.length || !be.every($e => {
        return ['done', 'failed', 'cancelled'].includes($e.status);
      })) {
        continue;
      }
      const Ne = be.find($e => {
        return $e.status === 'failed';
      });
      Le($.id, Ne ? {
        status: 'failed',
        note: Ne.error && Ne.error.message || 'API 生成失败'
      } : {
        status: 'done'
      });
      Ge(false, $.nodeId);
    }
  }, [c]);
  const lt = g.useCallback($ => {
    const ie = Object.fromEntries((n || []).map(Ne => {
      return [Ne.id, Ne];
    }));
    const be = (s || []).find(Ne => {
      return Ne.id === $.id;
    });
    if (be && be.dataUrl) {
      return be.dataUrl;
    }
    const ye = ie[$.id];
    if (ye && ye.type === 'material' && ye.data && ye.data.dataUrl) {
      return ye.data.dataUrl;
    } else if (ye && ye.type === 'video' && ye.data && ye.data.poster) {
      return ye.data.poster;
    } else if (ye && ye.type === 'imggen' && ye.data && ye.data.dataUrl) {
      return ye.data.dataUrl;
    } else {
      return '';
    }
  }, [s, n]);
  const st = g.useMemo(() => {
    if (e) {
      return Hu(e, n, r, s);
    } else {
      return [];
    }
  }, [e, n, r, s]);
  const dt = async () => {
    if (!e) {
      return;
    }
    const $ = L.getState();
    const ie = eu(h || '', y.current || []);
    const be = ie.text;
    if (ie.changed) {
      y.current = ie.refs;
      v(ie.refs);
      j(ie.text);
    }
    const ye = Zc(be || '', y.current || []);
    const {
      body: Ne,
      sentRefs: $e
    } = KL(be || '', y.current || []);
    const at = Ne.trim();
    if (!at) {
      $.showToast('请先输入提示词', 'warn');
      return;
    }
    const Fe = $e.map(Pe => {
      const rt = lt(Pe);
      if (rt) {
        return {
          label: `参考图${Pe.n}`,
          dataUrl: rt
        };
      } else {
        return null;
      }
    }).filter(Boolean);
    if (I !== 'api' && ut && ut !== 'auto' && !String(ut).startsWith('auto:')) {
      const Pe = ($.accounts || []).find(rt => {
        return rt.id === ut;
      });
      if (Pe && !nf.includes(Pe.type || 'doubao')) {
        $.showToast(`「${Pe.name}」是 ${Q0[Pe.type] || Pe.type} 账号，暂不能执行文生图：请改选豆包/Dola/GPT 账号，或选 API 通道`, 'warn', 6000);
        return;
      }
    }
    const W = nu(H, l);
    const Ce = `igt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    q(null);
    try {
      $.updateNodeData(e, {
        text: ye,
        channel: I,
        aspectRatio: F,
        styleIds: H,
        imageCount: U,
        igModel: O,
        igResolution: D,
        sendAccount: ut
      });
    } catch {}
    const fe = {
      text: ye,
      channel: I,
      aspectRatio: F,
      styleIds: H,
      imageCount: U,
      igModel: O,
      igResolution: D,
      sendAccount: ut
    };
    if (I === 'api') {
      if (!ee) {
        $.showToast('没有可用的图片 API 服务商：请到「API 服务」配置图片通道密钥', 'warn', 4500);
        return;
      }
      pe(true);
      Ge(true);
      const Pe = $.resolveApiProviderId('image');
      const rt = ($.apiProvidersMeta || []).find(mt => {
        return mt.id === Pe;
      });
      const ot = {
        providerId: Pe,
        kind: 'image',
        prompt: W.prefix ? `${W.prefix}${at}` : at,
        params: {
          ratio: F
        },
        nodeId: e,
        refSources: Fe.map(mt => {
          return mt.dataUrl;
        })
      };
      const ht = Math.max(1, Math.min(4, U | 0));
      let bt = null;
      try {
        bt = await $.submitApiBatch(ot, Array.from({
          length: ht
        }, () => {
          return {};
        }));
      } catch (mt) {
        bt = {
          ok: false,
          error: mt && mt.message || String(mt)
        };
      }
      pe(false);
      if (!bt || !bt.ok) {
        Ge(false);
        $.showToast(`API 提交失败：${bt && bt.error || '未知错误'}`, 'error', 5000);
        return;
      }
      const $t = (bt.jobIds || []).filter(Boolean);
      try {
        $.bindImageGenJobs($t, e, fe);
      } catch {}
      $.showToast(`已提交 ${$t.length} 个图片任务（${rt ? rt.name : 'API'}），出图后直接长在卡片上`, 'success');
      je(mt => {
        return [{
          id: Ce,
          kind: 'api',
          status: 'running',
          jobIds: $t,
          nodeId: e,
          label: `API · ${rt ? rt.name : ''} · ${F} · ${ht} 张`,
          startedAt: Date.now()
        }, ...mt].slice(0, 8);
      });
      return;
    }
    const Te = Q0[I] || '豆包';
    const Ue = ($r(I).find(Pe => {
      return Pe.value === O;
    }) || {}).label || '';
    pe(true);
    Ge(true);
    je(Pe => {
      return [{
        id: Ce,
        kind: 'backend',
        status: 'running',
        key: null,
        nodeId: e,
        label: `${Te}后台 · 正在挑号发送…`,
        startedAt: Date.now()
      }, ...Pe].slice(0, 8);
    });
    let Ye = null;
    try {
      if (I === 'gpt') {
        Ye = await aO({
          prompt: at,
          stylePrefix: W.prefix,
          ratio: F,
          count: U,
          model: Ue,
          resolution: D,
          sendAccount: ut,
          refImages: Fe
        });
      } else {
        Ye = await tO({
          channel: I,
          prompt: at,
          stylePrefix: W.prefix,
          ratio: F,
          count: U,
          model: Ue,
          resolution: D,
          sendAccount: ut,
          refImages: Fe
        });
      }
    } catch (Pe) {
      Ye = {
        ok: false,
        reason: 'exception',
        note: Pe && Pe.message || String(Pe)
      };
    }
    pe(false);
    if (!Ye || !Ye.ok) {
      Ge(false);
      Le(Ce, {
        status: 'failed',
        note: Ye && (Ye.note || Ye.reason) || '发送失败'
      });
      $.showToast(`文生图发送失败：${Ye && (Ye.note || Ye.reason) || '发送失败'}`, 'error', 5000);
      return;
    }
    try {
      $.bindImageGenKey(Ye.key, e, U, fe);
    } catch {}
    Le(Ce, {
      status: 'running',
      key: Ye.key,
      accountId: Ye.accountId,
      account: Ye.account || null,
      label: `${Te}后台${Ue ? ` · ${Ue}` : ''} · ${Ye.accountName} · 等待出图（${U} 张）…`
    });
    $.showToast(`已发给 ${Ye.accountName}，出图后直接长在卡片上`, 'success');
    try {
      let Pe = null;
      if (I === 'gpt' && Ye.accountId) {
        try {
          Pe = Uu.hold(Ye.accountId);
        } catch {
          Pe = null;
        }
        await new Promise(rt => {
          return setTimeout(rt, 350);
        });
      }
      DR({
        account: Ye.account || {
          id: Ye.accountId,
          name: Ye.accountName
        },
        key: Ye.key,
        source: I === 'dola' ? 'dola' : I === 'gpt' ? 'gpt' : 'doubao',
        accountName: Ye.accountName,
        onItem: rt => {
          const ot = L.getState().addImageGenResult({
            key: rt.key,
            dataUrl: rt.dataUrl,
            source: rt.source,
            accountName: rt.accountName,
            accountId: Ye.accountId,
            natW: rt.natW,
            natH: rt.natH
          });
          if (ot && ot.satisfied) {
            Sp(rt.key);
          }
        },
        onEnd: ({
          count: rt,
          reason: ot
        }) => {
          if (Pe) {
            try {
              Pe();
            } catch {}
          }
          if (Ye.accountId) {
            try {
              L.getState().releaseAccountBusy(Ye.accountId);
            } catch {}
            try {
              tn(Ye.accountId);
            } catch {}
          }
          if (ot === 'timeout' && rt === 0) {
            He(Ye.key, `等待超时：未收到图片（可去${Te}会话查看该对话）`);
          }
        },
        timeoutMs: J0
      });
    } catch (Pe) {
      console.warn('[imggen] 启动出图侦测失败:', Pe && Pe.message);
    }
  };
  if (!e || !t) {
    return null;
  }
  const G = (tf.find($ => {
    return $.value === F;
  }) || tf[0]).label;
  const xe = Ee.filter($ => {
    return $.status === 'running';
  }).length;
  const Me = st.filter($ => {
    return ($.type === 'material' || $.type === 'video' || $.type === 'imggen') && !w.some(ie => {
      return ie.id === ($.libId || $.id);
    }) && $.dataUrl;
  });
  const Re = (() => {
    const $ = new Set();
    const ie = new Set();
    const be = [];
    w.forEach(ye => {
      const Ne = ye.id || `#n${ye.n}`;
      if ($.has(Ne)) {
        return;
      }
      const $e = (lt(ye) || '').trim();
      if (!$e || !ie.has($e)) {
        $.add(Ne);
        if ($e) {
          ie.add($e);
        }
        be.push(ye);
      }
    });
    return be;
  })();
  return <i.Fragment>
      <div className="gen-panel-layer" onMouseDown={p}>
        <div className="gen-panel gen-panel-image" ref={At} onMouseDown={$ => {
        return $.stopPropagation();
      }}>
          <div className="gp-head">
            <span className="gp-title">文生图</span>
            <button type="button" className="gp-btn gp-automatch-btn gp-head-automatch" title="自动匹配：把资源库素材名与正文比对（精准 / 「参考图」前缀 / 字母数字组合），命中后追加 @素材 引用" onClick={we}>
              {de === 'ok' ? '✓ 已匹配' : de === 'none' ? '无匹配' : '自动匹配'}
            </button>
            <span className="gp-meta">
              {Qe.label || '文生图'} · 已出 {Je.length} 张{xe ? ` · ${xe} 个进行中` : ''}
            </span>
            <button className="gp-close" onClick={p} title="关闭（Esc）">
              ✕
            </button>
          </div>
          {Ee.length > 0 ? <div className="igt-tasks">
              {Ee.map($ => {
            return <div className={`igt-task igt-task-${$.status}`} key={$.id}>
                    <span className="igt-dot" />
                    <span className="igt-label">{$.label}</span>
                    {$.status === 'running' && <span className="igt-note">出图中…</span>}
                    {$.status === 'failed' && <span className="igt-note is-err">{$.note || '失败'}</span>}
                    {$.status === 'done' && <span className="igt-note is-ok">已完成</span>}
                    <button className="igt-close" title="移除这条记录" onClick={() => {
                if ($.key) {
                  Np($.key);
                }
                je(ie => {
                  return ie.filter(be => {
                    return be.id !== $.id;
                  });
                });
              }}>
                      ✕
                    </button>
                  </div>;
          })}
            </div> : null}
          <div className="igp-params">
            {w.length > 0 || Me.length > 0 ? <div className="gp-thumbs">
                {Re.map($ => {
              const ie = lt($);
              return <button type="button" className="gp-thumb" title={`@${$.rawName}（角标 ${$.n}；在正文里删掉这枚引用芯片即移除引用）`} onClick={be => {
                be.stopPropagation();
                S.current = go(C.current);
                gt($);
              }} key={`${$.n}-${$.id}`}>
                      {ie ? <img src={Xt(ie, 160)} alt="" /> : <span className="gp-thumb-noimg">?</span>}
                      <span className="gp-thumb-badge">{$.n}</span>
                    </button>;
            })}
                {Me.map($ => {
              return <button type="button" className="gp-thumb is-unrefed" title={`上游素材「${$.label}」尚未被正文引用，点击插入 @引用`} onClick={ie => {
                ie.stopPropagation();
                S.current = go(C.current);
                Nt({
                  id: $.id,
                  name: $.label,
                  dataUrl: $.dataUrl
                });
              }} key={`up-${$.id}`}>
                      <img src={Xt($.dataUrl, 160)} alt="" />
                      <span className="gp-thumb-plus">＋</span>
                    </button>;
            })}
                <button type="button" className="gp-thumb is-add" title="添加参考图（从资源库选择）" onClick={$ => {
              $.stopPropagation();
              kt($.currentTarget);
            }}>
                  <span className="gp-thumb-plus">＋</span>
                </button>
              </div> : null}
            <div ref={C} className="gp-prompt" contentEditable={true} suppressContentEditableWarning={true} role="textbox" aria-multiline="true" aria-label="提示词正文" data-placeholder="描述想要画的内容…（输入 @ 引用素材）" style={{
            height: `${De}px`
          }} onInput={Ke} onBlur={Rt} onPaste={Ct} onMouseDown={$ => {
            return $.stopPropagation();
          }} />
            <div className="gp-toolbar" onMouseDown={$ => {
            return $.stopPropagation();
          }}>
              <button type="button" className="gp-btn" title="引用素材（弹出素材列表，选中后以「微缩图 + 素材名」插入正文）" onMouseDown={$ => {
              return $.preventDefault();
            }} onClick={$ => {
              return kt($.currentTarget);
            }}>
                @
              </button>
              {H.length === 0 ? <button type="button" className="gp-btn" title="风格库：发送时注入的修饰前缀（单选；「不使用风格」则不传）" onClick={() => {
              return ke(true);
            }}>
                  ◇ 风格 <span className="gp-caret" />
                </button> : H.map($ => {
              const ie = l.find(be => {
                return be.id === $;
              });
              if (ie) {
                return <span className="gp-style-chip" key={$}>
                        <button type="button" className="gp-style-chip-main" title={`风格「${ie.name}」：点击打开风格库`} onClick={() => {
                    return ke(true);
                  }}>
                          <span className="gp-style-chip-glyph">◇</span> {ie.name}
                        </button>
                        <button type="button" className="gp-style-chip-x" title={`移除风格「${ie.name}」`} onClick={() => {
                    return ge($);
                  }}>
                          ×
                        </button>
                      </span>;
              } else {
                return null;
              }
            })}
              <button type="button" ref={$ => {
              he.current.ratio = $;
            }} className="gp-btn" title="画面比例" onClick={() => {
              return Q('ratio');
            }}>
                {G} <span className={`gp-caret${ne === 'ratio' ? ' open' : ''}`} />
              </button>
              <button type="button" ref={$ => {
              he.current.count = $;
            }} className="gp-btn" title="每次生成的张数：画布按此数收图；后台通道同时把张数写进提示词约束豆包/Dola/GPT" onClick={() => {
              return Q('count');
            }}>
                {U} 张 <span className={`gp-caret${ne === 'count' ? ' open' : ''}`} />
              </button>
              <div className="gp-acc-wrap" ref={Ae}>
                <button type="button" ref={_e} className="gp-btn igp-acc-btn" title="执行账号：选分组/账号即按其类型走豆包/Dola/GPT 后台，选 API 则走 API 服务商出图" onClick={Z}>
                  {Se} <span className={`gp-caret${me ? ' open' : ''}`} />
                </button>
              </div>
              {I !== 'api' ? <button type="button" ref={$ => {
              he.current.model = $;
            }} className="gp-btn" title="生成模型：发送时随提示词一并发给后台，账号按该模型出图" onClick={() => {
              return Q('model');
            }}>
                  {($r(I).find($ => {
                return $.value === O;
              }) || $r(I)[0]).label}{' '}
                  <span className={`gp-caret${ne === 'model' ? ' open' : ''}`} />
                </button> : null}
              {I !== 'api' ? <button type="button" ref={$ => {
              he.current.resolution = $;
            }} className="gp-btn" title="图片分辨率：发送时随提示词一并发给后台，账号按该分辨率出图" onClick={() => {
              return Q('resolution');
            }}>
                  {D} <span className={`gp-caret${ne === 'resolution' ? ' open' : ''}`} />
                </button> : null}
              <div className="gp-toolbar-grow" />
              <button type="button" className={`gp-generate${V ? ' busy' : ''}`} onClick={dt}>
                {V ? '稍等…' : '生成'}
              </button>
              <span className={`gp-resize${te ? ' is-dragging' : ''}`} title={`拖动调整输入框高度（双击复位 ${Or}px）`} aria-label="拖动调整输入框高度" role="separator" onMouseDown={$ => {
              $.preventDefault();
              $.stopPropagation();
              re.current = {
                y: $.clientY,
                h: De
              };
              X(true);
            }} onDoubleClick={() => {
              return le(Or);
            }}>
                <span className="gp-resize-grip" />
              </span>
            </div>
            {me ? on.createPortal(<div className="gp-acc-menu" ref={nt} style={qe ? {
            left: qe.left,
            bottom: qe.bottom
          } : undefined} onMouseDown={$ => {
            return $.stopPropagation();
          }}>
                    {me.level === 'root' ? (o || []).length ? <i.Fragment>
                          <button type="button" className={`gp-acc-item${I !== 'api' && ut === 'auto' ? ' on' : ''}`} onClick={() => {
                return Y('auto', I === 'dola' || I === 'gpt' ? I : 'doubao');
              }}>
                            <span className="gp-acc-name">全部账号（自动）</span>
                          </button>
                          {T.map($ => {
                return <button type="button" className="gp-acc-item" onClick={() => {
                  return ve({
                    level: 'group',
                    gid: $.gid
                  });
                }} key={$.gid || jl}>
                                <span className="gp-acc-name">{$.label}</span>
                                <span className="gp-acc-count">
                                  {$.list.filter(ie => {
                      return (ie.status || '已登录') === '已登录';
                    }).length}
                                  /{$.list.length}
                                </span>
                              </button>;
              })}
                          <button type="button" className={`gp-acc-item${I === 'api' ? ' on' : ''}`} title={ee ? '走图片 API 服务商出图（不占用登录账号）' : '未配置图片 API 服务商（到「API 服务」设置）'} onClick={() => {
                z('api');
                ve(null);
              }}>
                            <span className="gp-acc-name">API{ee ? '' : '（未配置）'}</span>
                          </button>
                        </i.Fragment> : <div className="gp-acc-empty">暂无账号，请先在「账号」页登录</div> : (() => {
              const $ = T.find(ye => {
                return (ye.gid || jl) === me.gid;
              });
              if (!$) {
                return null;
              }
              const ie = `auto:group:${$.gid || jl}`;
              const be = $.list.some(ye => {
                return (ye.status || '已登录') === '已登录' && nf.includes(ye.type || 'doubao');
              });
              return <i.Fragment>
                            <button type="button" className="gp-acc-item gp-acc-back" onClick={() => {
                  return ve({
                    level: 'root'
                  });
                }}>
                              ← {$.label}
                            </button>
                            <button type="button" className={`gp-acc-item${I !== 'api' && ut === ie ? ' on' : ''}`} disabled={!be} title={be ? '在该分组内自动挑空闲账号执行文生图' : '该分组内暂无可执行文生图（豆包/Dola/GPT）的账号：可先选组内账号或改用 API'} onClick={() => {
                  return Y(ie, K($.list));
                }}>
                              自动选择可用{$.label}
                            </button>
                            {$.list.map(ye => {
                  const Ne = (ye.status || '已登录') === '已登录';
                  const $e = I !== 'api' && ut === ye.id;
                  return <button type="button" className={`gp-acc-item${$e ? ' on' : ''}${Ne ? '' : ' off'}`} title={`${ye.name} · ${Ne ? '可用' : ye.status || '不可用'}`} disabled={!Ne} onClick={() => {
                    return Y(ye.id, lO[ye.type || 'doubao'] || 'doubao');
                  }} key={ye.id}>
                                  <span className={`gp-acc-dot${Ne ? '' : ' gray'}`} />
                                  <span className="gp-acc-name">{ye.name}</span>
                                </button>;
                })}
                          </i.Fragment>;
            })()}
                  </div>, document.body) : null}
            {ne ? on.createPortal(<div className="gp-acc-menu gp-param-menu" ref={Ie} style={ce ? {
            left: ce.left,
            bottom: ce.bottom
          } : undefined} onMouseDown={$ => {
            return $.stopPropagation();
          }}>
                    {ne === 'ratio' && tf.map($ => {
              return <button type="button" className={`gp-acc-item${F === $.value ? ' on' : ''}`} onClick={() => {
                M($.value);
                q(null);
              }} key={$.value}>
                            <span className="gp-acc-name">{$.label}</span>
                          </button>;
            })}
                    {ne === 'count' && [1, 2, 3, 4].map($ => {
              return <button type="button" className={`gp-acc-item${U === $ ? ' on' : ''}`} onClick={() => {
                _($);
                q(null);
              }} key={$}>
                            <span className="gp-acc-name">{$} 张</span>
                          </button>;
            })}
                    {ne === 'model' && $r(I).map($ => {
              return <button type="button" className={`gp-acc-item${O === $.value ? ' on' : ''}`} title={`用 ${$.label} 生成（随提示词发送给后台）`} onClick={() => {
                R($.value);
                q(null);
              }} key={$.value}>
                            <span className="gp-acc-name">{$.label}</span>
                          </button>;
            })}
                    {ne === 'resolution' && rf.map($ => {
              return <button type="button" className={`gp-acc-item${D === $ ? ' on' : ''}`} title={`以 ${$} 分辨率出图（随提示词发送给后台）`} onClick={() => {
                A($);
                q(null);
              }} key={$}>
                            <span className="gp-acc-name">{$}</span>
                          </button>;
            })}
                  </div>, document.body) : null}
          </div>
        </div>
      </div>
      <_cmp_US open={se} selectedIds={H} onToggle={ge} onUseNone={() => {
      return J([]);
    }} onClose={() => {
      return ke(false);
    }} />
      <_cmp__Component33 open={b} anchor={k} variant="list" onCancel={() => {
      return x(false);
    }} onPick={Nt} />
    </i.Fragment>;
}