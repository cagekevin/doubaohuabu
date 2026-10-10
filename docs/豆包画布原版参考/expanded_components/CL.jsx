// TODO(全局, 无需 import): data, selected, T, e, K, c, u, Y, de, d, f, t, o, we, Se, ae, dataUrl, label, missing, ge, w, v, a, Le, ids, items, _, J, se, r, H, s, name, content, ne, he, le, ut, De, Ie, Q, text, oe, ct, te, x, y, n, re, je, et, left, width, height, He, current, Ge, Je, Ve, ze, Qe, block, kt, Be, Nt, Ke, Ct, idx, startX, startY, offsetX, offsetY, barEl, thumbEl, hasMoved, xt, gt, materialIds, P, S, I, N, O, C, _e, j, qe, lt, st, dt, A, F, U, bottom, right, D, filtered, linkedShownCount, E, b, h, V, ke, wt, ce, it, Rt, l, p, m, q, pe, Ae, ee, me, ve, tt, Ee, X, At, _t, Mt, zt, k, z, Z, R, M, nt
import _cmp__Component28 from "./_Component28.jsx";
import _cmp__Component33 from "./_Component33.jsx";
import _cmp_kL from "./kL.jsx";
import { id, L, Ru, fk, l$, c$, Jh, bL, f$, p$, i$, SL, la, D0, um, hL, mL, Hc, Ak, pt, NL, Xt, on, Mn } from "./shared.js";
import * as g from 'react';
export default function CL({
  id: e,
  data: t,
  selected: n
}) {
  const r = L(T => {
    return T.updateNodeData;
  });
  const s = L(T => {
    return T.addPreset;
  });
  const o = L(T => {
    return T.library;
  });
  const a = L(T => {
    return T.edges;
  });
  const l = L(T => {
    return T.nodeSendStates[e];
  });
  const c = L(T => {
    var K;
    if ((K = T.nodeWaitTimes) == null) {
      return undefined;
    } else {
      return K[e];
    }
  });
  const [, u] = g.useState(0);
  const d = c ? `${c.detectedAt}|${c.seconds}` : '';
  g.useEffect(() => {
    if (!c) {
      return;
    }
    const T = c.detectedAt + c.seconds * 1000;
    let K = null;
    const Y = () => {
      if (K) {
        clearInterval(K);
        K = null;
      }
    };
    if (Date.now() >= T) {
      u(1);
      return;
    }
    K = setInterval(() => {
      if (Date.now() >= T) {
        Y();
      }
      u(de => {
        return de + 1 & 1073741823;
      });
    }, 250);
    return Y;
  }, [d]);
  const f = c ? Math.max(0, c.detectedAt + c.seconds * 1000 - Date.now()) : 0;
  const p = !!c && f <= 0;
  const h = L(T => {
    var K;
    if ((K = T.nodeNotices) == null) {
      return undefined;
    } else {
      return K[e];
    }
  });
  const m = L(T => {
    var K;
    if ((K = T.nodeSwitches) == null) {
      return undefined;
    } else {
      return K[e];
    }
  });
  const w = g.useMemo(() => {
    const T = t && t.text || '';
    const K = Ru(T);
    new Map(o.map(we => {
      return [we.id, we];
    }));
    const Y = new Map(L.getState().nodes.map(we => {
      return [we.id, we];
    }));
    const de = new Set();
    const ae = [];
    for (const we of K) {
      if (de.has(we.id)) {
        continue;
      }
      de.add(we.id);
      const Se = fk(we.id, o, Y);
      const ge = !Se.dataUrl;
      ae.push({
        id: we.id,
        data: {
          dataUrl: Se.dataUrl,
          label: Se.label || we.rawName
        },
        missing: ge
      });
    }
    return ae;
  }, [t, o]);
  const v = g.useMemo(() => {
    const T = t && t.materialIds || null;
    if (T && Array.isArray(T) && T.length > 0) {
      const K = new Map(T.map((Y, de) => {
        return [Y, de];
      }));
      return [...w].sort((Y, de) => {
        const ae = K.has(Y.id) ? K.get(Y.id) : 999;
        const we = K.has(de.id) ? K.get(de.id) : 999;
        return ae - we;
      });
    }
    return w;
  }, [w, t]);
  const y = g.useMemo(() => {
    return Object.fromEntries(v.map(T => {
      return [T.id, T];
    }));
  }, [v]);
  const b = g.useMemo(() => {
    const T = new Set();
    const K = [];
    const Y = L.getState().nodes;
    const de = new Map();
    for (const ae of Y) {
      if (ae.type === 'material') {
        de.set(ae.id, ae);
      }
    }
    for (const ae of a) {
      if (ae.target !== e) {
        continue;
      }
      const we = de.get(ae.source);
      if (!we) {
        continue;
      }
      const Se = we.data && (we.data.label || we.data.name) || '';
      let ge = null;
      if (we.data && we.data.dataUrl) {
        ge = o.find(Le => {
          return Le.dataUrl === we.data.dataUrl;
        });
      }
      if (!ge && Se) {
        ge = o.find(Le => {
          return Le.name === Se;
        }) || o.find(Le => {
          return Le.name && Le.name.includes(Se);
        }) || o.find(Le => {
          return Se.includes(Le.name);
        });
      }
      if (ge && !T.has(ge.id)) {
        T.add(ge.id);
        K.push(ge);
      }
    }
    return {
      ids: T,
      items: K
    };
  }, [e, o, a]);
  const x = g.useRef(null);
  const k = g.useRef(null);
  const N = g.useRef(null);
  const [C, S] = g.useState(false);
  const [E, P] = g.useState('');
  const [j, I] = g.useState(0);
  const [z, O] = g.useState({});
  const [R, D] = g.useState(false);
  const A = g.useRef(null);
  const F = g.useRef(null);
  const [M, U] = g.useState(null);
  const [_, H] = g.useState(false);
  const J = g.useRef(null);
  const se = t.label || '文本框';
  g.useEffect(() => {
    if (_ && J.current) {
      J.current.focus();
      const T = document.createRange();
      T.selectNodeContents(J.current);
      const K = window.getSelection();
      K.removeAllRanges();
      K.addRange(T);
    }
  }, [_]);
  const ke = () => {
    var K;
    const T = (((K = J.current) == null ? undefined : K.textContent) || '').trim() || '文本框';
    if (T !== se) {
      r(e, {
        label: T
      });
    }
    H(false);
  };
  const V = T => {
    T.stopPropagation();
    H(true);
  };
  const [pe, ne] = g.useState(false);
  const q = g.useCallback(() => {
    const T = (t.text || '').trim();
    if (!T) {
      return;
    }
    s({
      name: se,
      content: T
    });
    ne(true);
    setTimeout(() => {
      return ne(false);
    }, 1500);
  }, [t.text, se, s]);
  const [ce, oe] = g.useState(null);
  const [he, Ie] = g.useState([]);
  const De = g.useRef(new Set());
  const [le, te] = g.useState(0);
  const [X, re] = g.useState([]);
  const [Ee, je] = g.useState(null);
  const [Ve, ze] = g.useState(0);
  const Qe = g.useRef(null);
  const Je = he.length > 0;
  const ut = Math.min(le, Math.max(0, he.length - 1));
  const et = he[ut] || null;
  const ct = g.useCallback(T => {
    const K = l$(T || '', o).filter(Y => {
      return !De.current.has(Y.key);
    });
    Ie(c$(K));
  }, [o]);
  const wt = g.useCallback(() => {
    Q();
    const T = L.getState().nodes.find(de => {
      return de.id === e;
    });
    const K = T && T.data && T.data.text || '';
    const Y = Jh(K, o);
    if (Y !== K) {
      r(e, {
        text: Y
      });
      oe('ok');
    } else {
      oe('none');
    }
    De.current = new Set();
    ct(Y);
    te(0);
    setTimeout(() => {
      return oe(null);
    }, 1500);
  }, [o, e, r, ct]);
  const At = g.useCallback(() => {
    if (!(he.length < 2)) {
      te(T => {
        return (T - 1 + he.length) % he.length;
      });
    }
  }, [he.length]);
  const _t = g.useCallback(() => {
    if (!(he.length < 2)) {
      te(T => {
        return (T + 1) % he.length;
      });
    }
  }, [he.length]);
  g.useEffect(() => {
    if (x.current && document.activeElement !== x.current) {
      const T = bL(t.text || '', y);
      if (x.current.innerHTML !== T) {
        x.current.innerHTML = T;
      }
    }
  }, [t.text, y, n]);
  g.useEffect(() => {
    if (!Je || !x.current || !et) {
      re([]);
      je(null);
      return;
    }
    const T = x.current;
    const K = T.parentElement;
    const Y = t.text || '';
    const de = T.getBoundingClientRect();
    const ae = K.getBoundingClientRect();
    const we = T.offsetWidth > 0 ? de.width / T.offsetWidth : 1;
    const Se = we > 0 ? we : 1;
    let ge = f$(T, Y, [[et.start, et.end]]);
    if (ge.length === 0 && et.matchText) {
      ge = p$(T, et.matchText);
    }
    const Le = {
      left: (de.left - ae.left) / Se,
      top: (de.top - ae.top) / Se,
      width: de.width / Se,
      height: de.height / Se
    };
    re(ge.map(He => {
      return {
        left: He.left / Se,
        top: He.top / Se,
        width: He.width / Se,
        height: He.height / Se,
        current: true
      };
    }));
    je(Le);
    const Ge = ge[0];
    if (Ge) {
      if (Ge.top < 0) {
        T.scrollTop += Ge.top - 8;
      } else if (Ge.top + Ge.height > T.clientHeight) {
        T.scrollTop += Ge.top + Ge.height - T.clientHeight + 8;
      }
    }
  }, [Je, he, t.text, et && et.start, et && et.end, et && et.matchText, y, Ve]);
  g.useEffect(() => {
    if (!Je) {
      return;
    }
    const T = x.current;
    let K = false;
    const Y = () => {
      if (!K) {
        K = true;
        requestAnimationFrame(() => {
          ze(ae => {
            return ae + 1;
          });
          K = false;
        });
      }
    };
    const de = () => {
      return ze(ae => {
        return ae + 1;
      });
    };
    if (T) {
      T.addEventListener('scroll', Y);
    }
    window.addEventListener('resize', de);
    return () => {
      if (T) {
        T.removeEventListener('scroll', Y);
      }
      window.removeEventListener('resize', de);
    };
  }, [Je]);
  g.useEffect(() => {
    if (!Je || !Qe.current) {
      return;
    }
    const T = Qe.current.querySelector('.fuzzy-card.is-current');
    if (T) {
      T.scrollIntoView({
        block: 'nearest'
      });
    }
  }, [Je, ut]);
  const Mt = g.useCallback(T => {
    if (!et) {
      return;
    }
    Q();
    const K = L.getState().nodes.find(we => {
      return we.id === e;
    });
    const Y = K && K.data && K.data.text || '';
    const de = `@[${T.id}|${T.name}]`;
    const ae = i$(Y, de, et.start, et.end);
    r(e, {
      text: ae
    });
    et.materials.forEach(we => {
      return De.current.add(we.key);
    });
    ct(ae);
  }, [et, e, r, ct]);
  const zt = g.useCallback(() => {
    if (et) {
      et.materials.forEach(T => {
        return De.current.add(T.key);
      });
      ct(t.text || '');
    }
  }, [et, t.text, ct]);
  const [Rt, Be] = g.useState(null);
  const it = g.useCallback(() => {
    L.getState().openSplitKeywordModal(e);
  }, [e]);
  const kt = L(T => {
    return T.splitFeedback;
  });
  g.useEffect(() => {
    if (!kt || kt.nodeId !== e) {
      return;
    }
    Be(kt.ok ? 'ok' : kt.reason === 'no-keyword' ? 'nokeyword' : 'none');
    const T = setTimeout(() => {
      Be(null);
      L.getState().setSplitFeedback(null);
    }, 1800);
    return () => {
      return clearTimeout(T);
    };
  }, [kt, e]);
  const [xt, Nt] = g.useState(null);
  const [gt, Ke] = g.useState(null);
  const Ct = g.useRef(null);
  const ee = g.useCallback((T, K) => {
    if (T.button !== 0) {
      return;
    }
    T.preventDefault();
    T.stopPropagation();
    const Y = T.currentTarget.closest('.mat-preview-bar');
    const de = T.currentTarget;
    const ae = de.getBoundingClientRect();
    const we = T.clientX - ae.left;
    const Se = T.clientY - ae.top;
    Nt(K);
    Ke(K);
    Ct.current = {
      idx: K,
      startX: T.clientX,
      startY: T.clientY,
      offsetX: we,
      offsetY: Se,
      barEl: Y,
      thumbEl: de,
      hasMoved: false
    };
    de.classList.add('mat-thumb-dragging');
  }, []);
  g.useEffect(() => {
    if (xt === null) {
      return;
    }
    const T = Y => {
      if (!Ct.current) {
        return;
      }
      const de = Ct.current;
      de.hasMoved = true;
      if (de.barEl) {
        const ae = de.barEl.querySelectorAll('.mat-thumb:not(.mat-thumb-dragging)');
        for (let we = 0; we < ae.length; we++) {
          const Se = ae[we].getBoundingClientRect();
          if (Y.clientX >= Se.left && Y.clientX <= Se.right && Y.clientY >= Se.top && Y.clientY <= Se.bottom) {
            const ge = ae[we].getAttribute('data-idx');
            if (ge !== null && parseInt(ge) !== gt) {
              Ke(parseInt(ge));
            }
            break;
          }
        }
      }
    };
    const K = Y => {
      if (!Ct.current) {
        return;
      }
      const de = Ct.current;
      if (de.thumbEl) {
        de.thumbEl.classList.remove('mat-thumb-dragging');
      }
      if (de.hasMoved && gt !== null && xt !== gt) {
        const ae = [...v];
        const [we] = ae.splice(xt, 1);
        ae.splice(gt, 0, we);
        r(e, {
          materialIds: ae.map(Se => {
            return Se.id;
          })
        });
      }
      Nt(null);
      Ke(null);
      Ct.current = null;
    };
    document.addEventListener('mousemove', T);
    document.addEventListener('mouseup', K);
    return () => {
      document.removeEventListener('mousemove', T);
      document.removeEventListener('mouseup', K);
    };
  }, [xt, gt, v, e, r]);
  const Q = () => {
    if (!x.current) {
      return;
    }
    const T = _cmp_kL(x.current);
    if (T !== (t.text || '')) {
      r(e, {
        text: T
      });
    }
  };
  const me = () => {
    Q();
    const T = x.current;
    if (!T) {
      return;
    }
    const K = window.getSelection();
    if (K && K.rangeCount) {
      const Y = K.getRangeAt(0);
      const ae = SL(T).match(/@([\w\u4e00-\u9fa5]*)$/);
      if (ae) {
        P(ae[1]);
        S(true);
        I(0);
        const we = N.current;
        if (we) {
          const Se = Y.getClientRects();
          const ge = Se && Se[0] || Y.getBoundingClientRect();
          const Le = we.getBoundingClientRect();
          O({
            top: `${ge.bottom - Le.top + 4}px`
          });
        }
      } else {
        S(false);
      }
    }
  };
  const ve = T => {
    if (C) {
      if (T.key === 'ArrowDown') {
        T.preventDefault();
        if (!_e.length) {
          return;
        }
        I(K => {
          return Math.min(K + 1, _e.length - 1);
        });
      } else if (T.key === 'ArrowUp') {
        T.preventDefault();
        if (!_e.length) {
          return;
        }
        I(K => {
          return Math.max(K - 1, 0);
        });
      } else if (T.key === 'Enter') {
        T.preventDefault();
        const K = _e[j];
        if (K) {
          qe(K);
        }
      } else if (T.key === 'Escape') {
        T.preventDefault();
        S(false);
      }
    }
  };
  const qe = T => {
    if (!T) {
      return;
    }
    const K = window.getSelection();
    if (K && K.rangeCount) {
      const Y = K.getRangeAt(0);
      const de = Y.startContainer;
      if (de.nodeType === 3) {
        const lt = de.textContent.slice(0, Y.startOffset);
        const st = lt.lastIndexOf('@');
        if (st >= 0) {
          const dt = lt.length - st;
          de.textContent = de.textContent.slice(0, st) + de.textContent.slice(st + dt);
          Y.setStart(de, st);
          Y.collapse(true);
        }
      }
      const ae = T.name || T.data && T.data.label || '';
      const we = ae && ae !== 'undefined' ? ae : '素材';
      const Se = T.dataUrl || T.data && T.data.dataUrl || '';
      const ge = document.createElement('span');
      ge.className = 'ref-chip';
      ge.contentEditable = 'false';
      ge.dataset.id = T.id;
      ge.dataset.name = we;
      ge.innerHTML = la(we, Se);
      const Le = document.createTextNode('\xA0');
      Y.deleteContents();
      Y.insertNode(Le);
      Y.insertNode(ge);
      const Ge = window.getSelection();
      const He = document.createRange();
      He.setStartAfter(Le);
      He.collapse(true);
      Ge.removeAllRanges();
      Ge.addRange(He);
    }
    S(false);
    P('');
    I(0);
    Q();
  };
  const tt = () => {
    setTimeout(() => {
      return S(false);
    }, 150);
    Q();
  };
  const Ae = g.useCallback(() => {
    const T = x.current;
    if (T) {
      try {
        T.focus();
      } catch {}
      A.current = D0(T);
    }
    const K = F.current;
    if (K) {
      const Y = K.getBoundingClientRect();
      U({
        left: Y.left,
        top: Y.top,
        bottom: Y.bottom,
        right: Y.right,
        width: Y.width,
        height: Y.height
      });
    }
    D(true);
  }, []);
  const nt = g.useCallback(T => {
    const K = x.current;
    if (!K || !T) {
      return;
    }
    try {
      K.focus();
    } catch {}
    let Y = A.current;
    if (!Y || !K.contains(Y.startContainer)) {
      Y = D0(K);
    }
    if (!Y) {
      return;
    }
    A.current = Y;
    let de = '';
    try {
      const He = document.createRange();
      He.selectNodeContents(K);
      He.setEnd(Y.startContainer, Y.startOffset);
      de = He.toString();
    } catch {
      de = '';
    }
    const ae = document.createDocumentFragment();
    if (um(de)) {
      ae.appendChild(document.createTextNode('\xA0'));
    }
    const we = document.createElement('span');
    we.className = 'ref-chip';
    we.contentEditable = 'false';
    we.dataset.id = T.id;
    const Se = hL(T);
    we.dataset.name = Se;
    we.innerHTML = la(Se, mL(T));
    ae.appendChild(we);
    const ge = document.createTextNode('\xA0');
    ae.appendChild(ge);
    Y.deleteContents();
    Y.insertNode(ae);
    const Le = document.createRange();
    Le.setStartAfter(ge);
    Le.collapse(true);
    A.current = Le.cloneRange();
    const Ge = window.getSelection();
    if (Ge) {
      Ge.removeAllRanges();
      Ge.addRange(Le);
    }
    Q();
  }, [Q]);
  const {
    filtered: _e,
    linkedShownCount: Z
  } = g.useMemo(() => {
    const T = (E || '').toLowerCase();
    const K = b.items;
    const Y = o.filter(de => {
      return !b.ids.has(de.id);
    }).filter(de => {
      return (de.name || '').toLowerCase().includes(T);
    });
    return {
      filtered: [...K, ...Y],
      linkedShownCount: K.length
    };
  }, [o, E, b]);
  return <div className={`text-node ${n ? 'selected' : ''}`} ref={N}>
      <_cmp__Component28 minWidth={Hc} minHeight={Ak} isVisible={n} lineClassName="r-line" handleClassName="r-handle" />
      <Mn type="target" position={pt.Left} />
      <Mn type="source" position={pt.Right} />
      {h && <div className={`reply-notice reply-notice-${h.level || 'warn'} nodrag nopan`} title={h.text} onMouseDown={T => {
      return T.stopPropagation();
    }}>
          <span className="reply-notice-icon" aria-hidden="true">
            {h.level === 'info' ? 'ℹ' : h.level === 'error' ? '✕' : '⚠'}
          </span>
          <span className="reply-notice-body">
            {h.title && <span className="reply-notice-title">{h.title}</span>}
            <span className="reply-notice-text">{h.text}</span>
          </span>
          <button type="button" className="reply-notice-close" title="关闭提示" onClick={T => {
        T.stopPropagation();
        L.getState().clearNodeNotice(e);
      }}>
            ×
          </button>
        </div>}
      <div className="node-head" onDoubleClick={V}>
        <span className="dot text-dot" />
        {_ ? <span ref={J} className="node-name-edit" contentEditable={true} suppressContentEditableWarning={true} onBlur={ke} onKeyDown={T => {
        if (T.key === 'Enter') {
          T.preventDefault();
          ke();
        }
        if (T.key === 'Escape') {
          H(false);
        }
      }} onMouseDown={T => {
        return T.stopPropagation();
      }}>
            {se}
          </span> : <span className="node-name">{se}</span>}
        <button className="auto-match-btn nodrag nopan" title="将资源库素材名称与文本匹配（精确 / 字母数字组合自动匹配；部分重叠将列出待确认项），命中后追加 @素材 引用" onClick={T => {
        T.stopPropagation();
        wt();
      }}>
          {ce === 'ok' ? '✓ 已匹配' : ce === 'none' ? '无匹配' : '自动匹配'}
        </button>
        {t.text && t.text.trim().length > 0 && <button className="split-md-btn nodrag nopan" title="按自定义关键词拆分：弹窗输入关键词，每个出现关键词的行作为新片段起点，按原文顺序生成文本框，内容不丢失" onClick={T => {
        T.stopPropagation();
        it();
      }}>
            {Rt === 'ok' ? '✓ 已拆分' : Rt === 'nokeyword' ? '未匹配到关键词' : Rt === 'none' ? '无可识别结构' : '拆分'}
          </button>}
        {l && l.status && <span className={`foot-send-status head-send-status foot-send-${l.status} nodrag nopan`} title={l.msg} onMouseDown={T => {
        return T.stopPropagation();
      }}>
            {l.status === 'sending' ? '⏳ ' : l.status === 'success' ? '✓ ' : '⚠ '}
            {l.msg}
          </span>}
        {c && <span className={`wait-countdown nodrag nopan${p ? ' wait-done' : ''}`} title={`来自豆包回复：「${c.text || `预计等待时长 ${c.minutes} 分钟`}」${p ? '（倒计时已结束）' : '\u3000倒计时结束后自动停止'}`} onMouseDown={T => {
        return T.stopPropagation();
      }}>
            {p ? '⏳ 等待已结束' : `⏳ 预计等待 ${c.minutes} 分钟 · ${NL(f)}`}
          </span>}
        {m && <span className={`switch-status nodrag nopan switch-${m.state || 'switching'}`} title={m.reason ? `原因：${m.reason}${m.toName ? `　已切换至 ${m.toName}` : ''}` : undefined} onMouseDown={T => {
        return T.stopPropagation();
      }}>
            {m.state === 'done' ? `🔁 已切换账号${m.toName ? `：${m.toName}` : ''}` : m.state === 'failed' ? `🔁 换号失败${m.reason ? `：${m.reason}` : ''}` : `🔁 额度受限，正在切换账号${m.toName ? `：${m.toName}` : ''}…`}
          </span>}
        <span className="head-actions nodrag nopan">
          <button className="save-preset-btn nodrag nopan" title="保存到提示词预设" onClick={T => {
          T.stopPropagation();
          q();
        }}>
            {pe ? '✓ 已保存' : '保存预设'}
          </button>
        </span>
      </div>
      <div className="text-body">
        <div className="text-toolbar nodrag nopan" onMouseDown={T => {
        return T.stopPropagation();
      }}>
          <button ref={F} className="at-ref-btn nodrag nopan" title="从资源库选择素材，以 @ 引用形式插入到文本框（单击即插入）" onMouseDown={T => {
          T.preventDefault();
          T.stopPropagation();
          Ae();
        }}>
            @ 引用素材
          </button>
          {v.length === 0 && <span className="mat-strip-hint">尚未连接素材 · 点左侧「@」引用素材</span>}
          <div className="mat-preview-bar">
            {v.map((T, K) => {
            const Y = T.data || {};
            const de = Y.label || T.name || '素材';
            const ae = Y.dataUrl;
            const we = xt === K;
            const Se = gt === K;
            const ge = xt !== null && gt !== null && (xt < gt && K > xt && K <= gt || xt > gt && K >= gt && K < xt);
            return <div data-idx={K} className={`mat-thumb${we ? ' mat-thumb-dragging' : ''}${Se ? ' mat-thumb-over' : ''}${ge ? ' mat-thumb-placeholder-shift' : ''}`} title={`${de}（拖拽调整顺序）`} onMouseDown={Le => {
              return ee(Le, K);
            }} key={T.id}>
                  {ae ? <img src={Xt(ae, 160)} alt={de} className="mat-thumb-img" draggable={false} loading="lazy" decoding="async" /> : <div className="mat-thumb-placeholder">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                        <rect x="3" y="3" width="18" height="18" rx="2.5" />
                        <circle cx="9" cy="10" r="2" />
                        <path d="M21 15l-3.5-4.5L14 15l-1.5 2H21v-2z" />
                      </svg>
                    </div>}
                  <span className="mat-thumb-grip">⠿</span>
                </div>;
          })}
            {v.length > 0 && <span className="mat-count">{v.length}</span>}
          </div>
        </div>
        <div ref={x} className="text-edit nodrag nowheel" contentEditable={true} suppressContentEditableWarning={true} onInput={me} onKeyDown={ve} onBlur={tt} data-placeholder="输入文字，输入 @ 从资源库引用素材…" />
        {Je && Ee && X.length > 0 && <div className="fuzzy-overlay nodrag nopan" style={{
        left: Ee.left,
        top: Ee.top,
        width: Ee.width,
        height: Ee.height
      }}>
            {X.map((T, K) => {
          return <span className={`fuzzy-mark${T.current ? ' is-current' : ''}`} style={{
            left: T.left,
            top: T.top,
            width: T.width,
            height: T.height
          }} key={K} />;
        })}
          </div>}
        {Je && et && <div className="fuzzy-panel nodrag nopan" ref={Qe}>
            <div className="fuzzy-head">
              <span>
                疑似匹配：<b className="fuzzy-current-match">「{et.matchText}」</b>
                <span className="fuzzy-current-name">({et.fuzzy ? '大致相同' : '关键词命中'})</span>
              </span>
              <span className="fuzzy-findbar">
                <button className="fuzzy-nav" title="定位文本框内上一处疑似匹配文字" disabled={he.length < 2} onClick={T => {
              T.stopPropagation();
              At();
            }}>
                  ‹
                </button>
                <span className="fuzzy-counter">
                  {ut + 1} / {he.length}
                </span>
                <button className="fuzzy-nav" title="定位文本框内下一处疑似匹配文字" disabled={he.length < 2} onClick={T => {
              T.stopPropagation();
              _t();
            }}>
                  ›
                </button>
              </span>
            </div>
            <div className="fuzzy-gallery">
              {et.materials.map(T => {
            return <div className="fuzzy-card" title={`素材：${T.name}`} onClick={K => {
              K.stopPropagation();
              Mt(T);
            }} key={T.key}>
                    <div className="fuzzy-thumb-wrap">
                      {T.dataUrl ? <img src={Xt(T.dataUrl, 160)} alt={T.name} className="fuzzy-thumb-img" draggable={false} /> : <div className="fuzzy-thumb-placeholder">
                          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                            <rect x="3" y="3" width="18" height="18" rx="2.5" />
                            <circle cx="9" cy="10" r="2" />
                            <path d="M21 15l-3.5-4.5L14 15l-1.5 2H21v-2z" />
                          </svg>
                          <span>无预览</span>
                        </div>}
                    </div>
                    <div className="fuzzy-card-name">
                      {T.name.slice(0, T.nameStart)}
                      <mark className="fuzzy-kw">{T.name.slice(T.nameStart, T.nameEnd)}</mark>
                      {T.name.slice(T.nameEnd)}
                    </div>
                    <div className="fuzzy-card-match">{T.fuzzy ? '大致匹配' : '关键词命中'}</div>
                  </div>;
          })}
            </div>
            <div className="fuzzy-foot">
              <span className="fuzzy-tip">选择一个素材确认，自动跳到下一处疑似匹配</span>
              <button className="fuzzy-ignore" onClick={T => {
            T.stopPropagation();
            zt();
          }}>
                忽略此位置
              </button>
            </div>
          </div>}
      </div>
      {C && <div ref={k} className="ref-menu nodrag nopan nowheel" style={z}>
          {o.length === 0 && <div className="ref-empty">资源库暂无素材，请先在左侧「资源库」添加</div>}
          {o.length > 0 && _e.length === 0 && <div className="ref-empty">没有匹配 "{E}" 的素材</div>}
          {Z > 0 && <div className="ref-menu-head">已链接素材（优先）</div>}
          {_e.map((T, K) => {
        const Y = T.name && T.name !== 'undefined' ? T.name : '未命名素材';
        const de = b.ids.has(T.id);
        return <div className={`ref-item ${de ? 'ref-item-linked' : ''} ${K === j ? 'active' : ''}`} onMouseDown={ae => {
          ae.preventDefault();
          qe(T);
        }} key={T.id}>
                {T.dataUrl ? <img src={Xt(T.dataUrl, 160)} className="ref-item-img" alt="" /> : <div className="ref-item-img ref-item-placeholder" />}
                <span className="ref-item-name">{Y}</span>
                {de && <span className="ref-item-badge">链接</span>}
                {de && K === Z - 1 && K !== _e.length - 1 && <span className="ref-menu-divider" />}
              </div>;
      })}
        </div>}
      {on.createPortal(<_cmp__Component33 open={R} anchor={M} onCancel={() => {
      return D(false);
    }} onPick={nt} />, document.body)}
    </div>;
}