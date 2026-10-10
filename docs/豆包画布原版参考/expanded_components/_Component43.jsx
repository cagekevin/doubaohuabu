// TODO(全局, 无需 import): visible, onClose, ee, s, f, Q, d, c, p, u, l, O, D, model, aspectRatio, duration, V, ne, me, t, ke, ve, oe, Y, C, ae, we, de, ge, Le, tt, Se, j, _e, S, I, qe, Ae, nt, entry, lastAt, key, url, accountId, accountName, Ge, P, Z, T, E, K, arr0, arr, vid, width, height, poster, He, name, sourceAccountId, sourceNodeId, attempt, status, _pendingAttempts, _pendingAttempt, modelLabel, De, le, J, m, w, getWebview, te, isReady, reloadAccount, A, je, autoStart, z, b, _execError, error, ze, type, keyCode, modifiers, ut, o, ok, U, v, _, M, H, wt, timestamp, source, appliedParams, summary, modeSwitched, modelSet, ratioSet, durationSet, modelVerified, ratioVerified, durationVerified, allPassed, reason, note, st, y, dt, _fp, _origIndex, ct, fe, Te, et, Qe, Ye, Ue, Pe, dataUrl, rt, label, ot, $t, ht, $n, mt, bt, Je, yt, G, be, $, ye, Me, xe, Re, pass, Ne, text, imagesExpected, imagesAttached, imagesOk, order, at, ie, W, Fe, Rt, lt, sessionId, precheck, $e, precheckIssue, log, textInserted, imagesTotal, imagesUnique, duplicatesRemoved, confirmAutoClicked, fillOnly, autoClicked, Ce, lastPollAt, accountsTotal, projectAccounts, webviewsReady, sentAccounts, baselineCount, apiOk, videosTotal, videosReady, newVideos, lastError, x, assignment, leftoverJobs, vids, jobs, k, fallbackNodeId, isNodeAlive, isFinite, jobId, purpose, timeoutMs, leaseTtlMs, level, code, title, count, autoReplied, clicked, button, acked, skipped, N, pings, ackedAt, lastPingAt, now, kind, none, offer, busy, other, askedAt, counts, samples, hit, lowCount, consume, remain, sample, minutes, seconds, detectedAt, webview, leaseId, state, fromName, toName, Mt, Be, zt, gt, tried, maxSwitches, payload, runtimeLeaseId, warn, info, rule, switched, Nt, mediaType, r, sendPayload, a, sendAccount, styleIds, params, ratio, prompt, edit, conversationId, nodeId, sendTime, it, sentAt, satisfied, kt, submitBaselineCount, beforeUrl, ownText, runParamScript, handleAutoSet, At, handleTest, _t, fetchWatermarkFree, xt, resolveThreadAndFetch, pullResult, pull, started, R, Ct, se, pe, Ke, Ie, he, ce, n, q, h, X, re, Ee, Ve
import _cmp__Component25 from "./_Component25.jsx";
import _cmp_SD from "./SD.jsx";
import _cmp__Component26 from "./_Component26.jsx";
import { L, oT, sT, Uu, M0, kp, Sp, d0, sD, rT, aT, iT, lT, zT, LT, OT, Xy, Ap, ji, yD, JP, Yc, XP, QP, vD, In, Ql, _a, wv, cD, uD, Zl, hR, es, Bd, Hd, E0, Kk, La, vr, zy, Vd, A0, lD, j0, rn, mD, eS, iD, UR, VR, zR, GR, aD, WR, Cp, dD, pD, hD, Wd, fD, Qh, yk, vk, zu, N0, Fc, gD, xk, _p, nS, rS, sS, UT, i } from "./shared.js";
import * as g from 'react';
const _Component43 = g.forwardRef(function ({
  visible: t,
  onClose: n
}, r) {
  const s = L(ee => {
    return ee.accounts;
  });
  const o = L(ee => {
    return ee.activeDoubaoAccountId;
  });
  const a = L(ee => {
    return ee.setActiveDoubaoAccount;
  });
  const l = L(ee => {
    return ee.activeId;
  });
  const c = s.filter(ee => {
    return (ee.status || '已登录') === '已登录';
  });
  const u = g.useRef(new Map());
  const [d, f] = g.useState(() => {
    return oT();
  });
  g.useEffect(() => {
    return sT(ee => {
      f(ee.map(Q => {
        return Q.accountId;
      }));
    });
  }, []);
  const p = g.useMemo(() => {
    return new Set([...s.filter(ee => {
      return ee.autoStart === true;
    }).map(ee => {
      return ee.id;
    }), ...d]);
  }, [s, d]);
  const h = c.filter(ee => {
    return p.has(ee.id);
  });
  g.useEffect(() => {
    for (const ee of Array.from(u.current.keys())) {
      if (!p.has(ee)) {
        u.current.delete(ee);
      }
    }
  }, [p]);
  const m = g.useRef(new Map());
  const w = g.useRef(null);
  const v = g.useRef(new Set());
  const y = g.useRef(null);
  const b = g.useRef(new Set());
  const x = g.useRef(new Set());
  const k = g.useRef(new Map());
  const N = g.useRef(new Map());
  const C = g.useRef(new Map());
  const S = g.useRef(new Map());
  const E = g.useRef(new Map());
  const P = g.useRef(new Set());
  const j = g.useRef(new Set());
  const I = g.useRef(new Map());
  const z = g.useRef(l);
  const O = g.useRef(null);
  O.current ||= Uu;
  const [R, D] = g.useState([]);
  g.useEffect(() => {
    const ee = O.current;
    ee.onChange(Q => {
      return D(Q);
    });
    D(ee.snapshot());
    return () => {
      return ee.onChange(null);
    };
  }, []);
  const A = g.useCallback(ee => {
    return O.current.hold(ee);
  }, []);
  const [F, M] = g.useState(null);
  const [U, _] = g.useState(false);
  const [H, J] = g.useState({
    model: 'Seedance 2.0 Mini',
    aspectRatio: '16:9',
    duration: 10
  });
  const [se, ke] = g.useState(() => {
    try {
      return localStorage.getItem(M0) === '1';
    } catch {
      return false;
    }
  });
  const V = g.useRef(null);
  const [pe, ne] = g.useState(0);
  g.useEffect(() => {
    const ee = V.current;
    if (!ee) {
      return;
    }
    const Q = () => {
      return ne(ee.offsetHeight);
    };
    Q();
    if (typeof ResizeObserver === 'undefined') {
      return;
    }
    const me = new ResizeObserver(Q);
    me.observe(ee);
    return () => {
      return me.disconnect();
    };
  }, [t]);
  const q = g.useCallback(() => {
    ke(ee => {
      const Q = !ee;
      try {
        localStorage.setItem(M0, Q ? '1' : '0');
      } catch {}
      return Q;
    });
  }, []);
  const [ce, oe] = g.useState([]);
  const [he, Ie] = g.useState(false);
  g.useEffect(() => {
    var Q;
    var me;
    const ee = (me = (Q = window.api) == null ? undefined : Q.onDolaMedia) == null ? undefined : me.call(Q, ve => {
      if (!ve || !Array.isArray(ve.items)) {
        return;
      }
      oe(ve.items);
      const qe = 12000;
      const tt = 3000000;
      const Ae = Y => {
        if (Y) {
          for (const [de, ae] of Array.from(C.current.entries())) {
            const we = ae.indexOf(Y);
            if (we >= 0) {
              ae.splice(we, 1);
              if (ae.length === 0) {
                C.current.delete(de);
              }
              return;
            }
          }
        }
      };
      const nt = Y => {
        const de = Date.now();
        const ae = ge => {
          if (!Array.isArray(ge)) {
            return null;
          }
          for (let Le = ge.length - 1; Le >= 0; Le--) {
            if (de - ge[Le].sentAt > tt) {
              ge.splice(Le, 1);
            }
          }
          return ge.find(Le => {
            return String(Le.nodeId || '').startsWith('imggen:');
          }) || null;
        };
        const we = Y ? ae(C.current.get(Y)) : null;
        if (we) {
          return we;
        }
        if (Y && (C.current.get(Y) || []).length === 0) {
          C.current.delete(Y);
        }
        let Se = null;
        for (const [, ge] of Array.from(C.current.entries())) {
          const Le = ae(ge);
          if (Le && (!Se || Le.sentAt < Se.sentAt)) {
            Se = Le;
          }
        }
        return Se;
      };
      const _e = ve.items.filter(Y => {
        return Y && Y.type === 'image' && Y.url && !j.current.has(Y.url);
      });
      if (_e.length > 0) {
        const Y = Date.now();
        for (const de of _e) {
          j.current.add(de.url);
          const ae = de.wcId != null && S.current.get(de.wcId) || null;
          const we = ae || '_global';
          const Se = I.current.get(we) || null;
          let ge = Se && Y - Se.lastAt < qe ? Se.entry : null;
          if (Se) {
            Ae(Se.entry);
          }
          ge = nt(ae);
          if (!ge && !ge) {
            continue;
          }
          I.current.set(we, {
            entry: ge,
            lastAt: Y
          });
          ge.satisfied = true;
          const Le = String(ge.nodeId).slice(7);
          if (!kp(Le)) {
            try {
              L.getState().ingestImageGenCdp({
                key: Le,
                url: de.url,
                accountId: ge.accountId,
                accountName: ge.accountName
              }).then(Ge => {
                if (Ge && Ge.satisfied) {
                  try {
                    Sp(Le);
                  } catch {}
                }
                console.log(`[imggen-cdp] 账号=${ge.accountId} key=${Le} 图片回流 satisfied=${!!Ge && !!Ge.satisfied}`);
              }).catch(Ge => {
                console.error('[imggen-cdp] 回流失败:', (Ge == null ? undefined : Ge.message) || String(Ge));
              });
            } catch (Ge) {
              console.error('[imggen-cdp] 回流失败:', (Ge == null ? undefined : Ge.message) || String(Ge));
            }
          }
        }
      }
      const Z = ve.items.filter(Y => {
        return Y && Y.type === 'video' && Y.url && !P.current.has(Y.url);
      });
      if (Z.length === 0) {
        return;
      }
      const T = Date.now();
      const K = 12000;
      for (const Y of Z) {
        P.current.add(Y.url);
        const de = Y.wcId != null && S.current.get(Y.wcId) || null;
        const ae = de ? C.current.get(de) : null;
        let we = null;
        if (ae) {
          while (ae.length > 0 && T - ae[0].sentAt > 3000000) {
            ae.shift();
          }
          if (ae.length === 0) {
            C.current.delete(de);
          } else {
            const Se = E.current.get(de) || 0;
            if (ae[0].satisfied && T - Se > K) {
              ae.shift();
            }
            we = ae[0] || null;
          }
        }
        if (!we && !de) {
          let Se = null;
          for (const [, ge] of C.current) {
            while (ge.length > 0 && T - ge[0].sentAt > 3000000) {
              ge.shift();
            }
            if (ge.length > 0 && (!Se || ge[0].sentAt < Se.arr0.sentAt)) {
              Se = {
                arr0: ge[0],
                arr: ge
              };
            }
          }
          if (Se) {
            we = Se.arr.shift();
          }
        }
        if (we) {
          we.satisfied = true;
          if (de) {
            E.current.set(de, T);
          }
          try {
            const Se = L.getState();
            Se.addVideoShare({
              accountId: we.accountId,
              accountName: we.accountName,
              url: Y.url,
              vid: Y.url,
              width: null,
              height: null,
              duration: null,
              poster: null
            });
            const ge = Se.nodes.find(He => {
              return He.id === we.nodeId;
            });
            const Le = ge && ge.data && ((ge.data._pendingAttempts || {})[we.accountId] || ge.data._pendingAttempt) || null;
            const Ge = Se.addVideoNode({
              url: Y.url,
              vid: Y.url,
              width: null,
              height: null,
              duration: null,
              poster: null,
              accountId: we.accountId,
              accountName: we.accountName,
              name: '视频',
              sourceAccountId: we.accountId,
              sourceNodeId: we.nodeId,
              ...d0(Se, we.nodeId),
              ...(Le ? {
                attempt: Le
              } : null)
            });
            if (Ge && Le) {
              Se.patchVideoAttempt(Ge, Le.id, {
                vid: Y.url,
                status: 'success'
              });
            }
            if (Le && ge && ge.data && ge.data._pendingAttempts) {
              const He = {
                ...ge.data._pendingAttempts
              };
              delete He[we.accountId];
              Se.updateNodeData(we.nodeId, {
                _pendingAttempts: He
              });
            }
            if (ge && ge.data && ge.data._pendingAttempt && (!Le || ge.data._pendingAttempt.id === Le.id)) {
              Se.updateNodeData(we.nodeId, {
                _pendingAttempt: undefined
              });
            }
            if (we.accountId) {
              try {
                Se.releaseAccountBusy(we.accountId);
              } catch {}
            }
            console.log(`[cdp-autoadd] 账号=${we.accountId} 节点=${we.nodeId} url=${Y.url.slice(0, 60)}…`);
          } catch (Se) {
            console.error('[cdp-autoadd] 失败:', (Se == null ? undefined : Se.message) || String(Se));
          }
        }
      }
    });
    return () => {
      if (ee) {
        ee();
      }
    };
  }, []);
  const De = L(ee => {
    return ee.nodes;
  });
  L(ee => {
    return ee.edges;
  });
  const le = g.useMemo(() => {
    const ee = ve => {
      return {
        model: ve.model || 'seedance-2.0-mini',
        aspectRatio: ve.aspectRatio || '16:9',
        duration: ve.duration ?? 7,
        modelLabel: sD[ve.model] || ve.model || 'Seedance 2.0 Mini'
      };
    };
    const Q = De.filter(ve => {
      return ve.type === 'text';
    });
    for (const ve of Q) {
      const qe = ve.data || {};
      if (qe.model || qe.aspectRatio || qe.duration != null) {
        return ee(qe);
      }
    }
    const me = De.filter(ve => {
      return ve.type === 'account';
    });
    for (const ve of me) {
      const qe = ve.data || {};
      if (qe.model || qe.aspectRatio || qe.duration != null) {
        return ee(qe);
      }
    }
    return null;
  }, [De]);
  g.useEffect(() => {
    if (le) {
      J({
        model: le.modelLabel,
        aspectRatio: le.aspectRatio,
        duration: le.duration
      });
    }
  }, [le]);
  g.useCallback((ee, Q) => {
    if (Q) {
      m.current.set(ee, Q);
    } else {
      m.current.delete(ee);
    }
  }, []);
  const te = g.useCallback(ee => {
    let Q = m.current.get(ee);
    if (Q != null && Q.isConnected) {
      return Q;
    }
    if (Q) {
      m.current.delete(ee);
    }
    const me = w.current || document.querySelector('.doubao-view-webviews');
    if (me) {
      Q = me.querySelector(`webview[data-account-id="${ee}"]`);
      if (Q) {
        m.current.set(ee, Q);
      }
      return Q;
    } else {
      return null;
    }
  }, []);
  g.useEffect(() => {
    return rT({
      getWebview: te,
      isReady: ee => {
        return u.current.get(ee) === true;
      },
      reloadAccount: ee => {
        var me;
        const Q = te(ee);
        u.current.delete(ee);
        try {
          if ((me = Q == null ? undefined : Q.reload) != null) {
            me.call(Q);
          }
        } catch {}
      }
    });
  }, [te]);
  const X = g.useCallback((ee, Q) => {
    if (Q) {
      S.current.set(Q, ee);
    }
    u.current.set(ee, true);
    aT(ee);
  }, []);
  const re = g.useCallback((ee, Q) => {
    u.current.delete(ee);
    iT(ee, Q);
  }, []);
  const Ee = g.useCallback(ee => {
    u.current.delete(ee);
    m.current.delete(ee);
    for (const [Q, me] of S.current) {
      if (me === ee) {
        S.current.delete(Q);
      }
    }
    lT(ee);
  }, []);
  const je = g.useCallback(async ee => {
    try {
      const Q = te(ee);
      if (!Q || typeof Q.capturePage != 'function') {
        return false;
      }
      const me = A(ee);
      try {
        await new Promise(tt => {
          return setTimeout(tt, 400);
        });
        const ve = await Promise.race([Promise.resolve().then(() => {
          return Q.capturePage();
        }), new Promise((tt, Ae) => {
          return setTimeout(() => {
            return Ae(new Error('capture-timeout'));
          }, 4000);
        })]);
        if (!ve || typeof ve.isEmpty == 'function' && ve.isEmpty()) {
          return false;
        }
        let qe = '';
        try {
          qe = ve.resize({
            width: 960
          }).toDataURL();
        } catch {
          qe = ve.toDataURL();
        }
        if (!qe || qe.length < 64) {
          return false;
        } else {
          zT(ee, qe);
          return true;
        }
      } finally {
        me();
      }
    } catch {
      return false;
    }
  }, [te, A]);
  g.useEffect(() => {
    LT(je);
    return () => {
      return OT(je);
    };
  }, [je]);
  g.useEffect(() => {
    for (const ee of s) {
      if (ee.autoStart === true) {
        Xy(ee.id);
      }
    }
  }, [s]);
  const Ve = g.useCallback(ee => {
    Xy(ee);
    const Q = L.getState();
    if (typeof Q.updateAccount == 'function') {
      Q.updateAccount(ee, {
        autoStart: true
      });
    }
  }, []);
  g.useEffect(() => {
    if (z.current !== l) {
      z.current = l;
      b.current.clear();
    }
    const ee = L.getState();
    (ee.videoShares || []).forEach(Q => {
      if (Q.vid) {
        b.current.add(Q.vid);
      }
    });
    (ee.nodes || []).forEach(Q => {
      if (Q.type === 'video' && Q.data && Q.data.vid) {
        b.current.add(Q.data.vid);
      }
    });
  }, [l]);
  const ze = g.useCallback(async (ee, Q, me) => {
    if (ee == null || !ee.executeJavaScript) {
      throw new Error('webview 不可用');
    }
    try {
      return await ee.executeJavaScript(Q);
    } catch (ve) {
      const qe = (ve == null ? undefined : ve.message) || (ve == null ? undefined : ve.toString()) || 'unknown';
      console.warn(`[DoubaoView] execJS(${me || '?'}) 失败: ${qe}`);
      return {
        _execError: true,
        error: qe
      };
    }
  }, []);
  const Qe = g.useCallback(async ee => {
    var ve;
    if (!ee) {
      throw new Error('webview 不可用');
    }
    await ze(ee, Ap, 'focus');
    try {
      ee.focus();
    } catch {}
    const Q = ee.getWebContentsId ? ee.getWebContentsId() : null;
    if (!Q) {
      throw new Error('无法获取 webContentsId');
    }
    if ((ve = window.api) == null || !ve.pasteToWebview) {
      throw new Error('pasteToWebview API 不可用');
    }
    const me = await window.api.pasteToWebview(Q);
    if (!me.ok) {
      throw new Error(me.error || 'paste 失败');
    }
    return me;
  }, [ze]);
  const Je = g.useCallback(async ee => {
    if (!ee || !ee.sendInputEvent) {
      return false;
    }
    const me = [/Mac|iPhone|iPad/i.test(String(navigator.platform || navigator.userAgent || '')) ? 'meta' : 'control'];
    try {
      await ze(ee, Ap, 'focus-key');
      try {
        ee.focus();
      } catch {}
      ee.sendInputEvent({
        type: 'keyDown',
        keyCode: 'v',
        modifiers: me
      });
      ee.sendInputEvent({
        type: 'char',
        keyCode: 'v',
        modifiers: me
      });
      ee.sendInputEvent({
        type: 'keyUp',
        keyCode: 'v',
        modifiers: me
      });
      return true;
    } catch {
      return false;
    }
  }, [ze]);
  const ut = g.useCallback(async (ee, Q) => {
    if (!ee) {
      return false;
    }
    try {
      await ze(ee, ji(Q), `input-lock:${Q}`);
      return true;
    } catch {
      return false;
    }
  }, [ze]);
  const et = g.useCallback(async (ee, Q) => {
    await ut(ee, 'allow');
    try {
      return await Q();
    } finally {
      await ut(ee, 'block');
    }
  }, [ut]);
  const ct = g.useCallback(ee => {
    var Q;
    var me;
    try {
      if ((me = (Q = window.api) == null ? undefined : Q.dolaDurationDiag) != null) {
        me.call(Q, `[send] ${ee}`);
      }
    } catch {}
  }, []);
  const wt = g.useCallback(async (ee, Q = {}) => {
    const me = (Q == null ? undefined : Q.wv) || te(o);
    if (!me) {
      return {
        ok: false,
        error: '当前账号的 webview 未初始化'
      };
    }
    const ve = (Q == null ? undefined : Q.accountId) || o;
    const qe = '!!(document && document.body && document.body.innerHTML)';
    let tt = u.current.get(ve) || false;
    if (!tt) {
      for (let nt = 0; nt < 20; nt++) {
        try {
          if (await me.executeJavaScript(qe)) {
            tt = true;
            u.current.set(ve, true);
            break;
          }
        } catch {}
        await new Promise(_e => {
          return setTimeout(_e, 500);
        });
      }
    }
    if (!tt) {
      return {
        ok: false,
        error: '豆包页面加载超时'
      };
    }
    const Ae = yD.replace('/*__GEN_PARAMS__*/', JSON.stringify({
      aspectRatio: ee.aspectRatio || null,
      duration: ee.duration ?? null,
      modelLabel: ee.modelLabel || null
    }));
    try {
      return (await ze(me, Ae, 'bottom-bar-set-params')) || {
        ok: false,
        error: '脚本无返回值'
      };
    } catch (nt) {
      return {
        ok: false,
        error: (nt == null ? undefined : nt.message) || String(nt)
      };
    }
  }, [o, te, ze]);
  const At = g.useCallback(async () => {
    if (U || v.current.size > 0) {
      return;
    }
    _(true);
    M(null);
    const ee = le || {
      modelLabel: H.model,
      aspectRatio: H.aspectRatio,
      duration: H.duration
    };
    try {
      const Q = await wt(ee);
      M({
        ...Q,
        timestamp: Date.now(),
        source: 'autoset',
        appliedParams: ee
      });
    } catch (Q) {
      M({
        ok: false,
        error: (Q == null ? undefined : Q.message) || '未知异常',
        timestamp: Date.now(),
        source: 'autoset'
      });
    } finally {
      _(false);
    }
  }, [U, le, H, wt]);
  const _t = g.useCallback(async () => {
    if (U || v.current.size > 0) {
      return;
    }
    _(true);
    M(null);
    const ee = le || {
      modelLabel: H.model,
      aspectRatio: H.aspectRatio,
      duration: H.duration
    };
    try {
      const Q = await wt(ee);
      const me = Q.results || {};
      const ve = me.verify || {};
      const qe = {
        ...Q,
        timestamp: Date.now(),
        source: 'test',
        appliedParams: ee,
        summary: {
          modeSwitched: me.mode === 'video' && !!me.modeSwitched,
          modelSet: !!me.model && !!me.model.ok,
          ratioSet: !!me.aspectRatio && !!me.aspectRatio.ok,
          durationSet: !!me.duration && !!me.duration.ok,
          modelVerified: !!ve.model && !!ve.model.ok,
          ratioVerified: !!ve.aspectRatio && !!ve.aspectRatio.ok,
          durationVerified: !!ve.duration && !!ve.duration.ok,
          allPassed: Q.ok && !Q._catch && Q.allVerified === true
        }
      };
      M(qe);
    } catch (Q) {
      M({
        ok: false,
        error: (Q == null ? undefined : Q.message) || '未知异常',
        timestamp: Date.now(),
        source: 'test'
      });
    } finally {
      _(false);
    }
  }, [U, le, H, wt]);
  const Mt = g.useCallback(async (ee, Q, me) => {
    const ve = me && (me.genParams || me.params) || {};
    const qe = Number(ve.duration) || 0;
    if (Q !== 'dola' || !(qe > 15) || ve.model !== 'seedance-2.5' || !ee) {
      return false;
    }
    try {
      await ze(ee, JP, 'dola-force-patch');
      await ze(ee, `window[${JSON.stringify(Yc)}] = ${JSON.stringify(XP(qe))}; true`, 'dola-force-cfg');
      return true;
    } catch (Ae) {
      console.log(`[DolaCanvas30s] 强开注入失败（按常规链路发送）: ${(Ae == null ? undefined : Ae.message) || Ae}`);
      return false;
    }
  }, [ze]);
  const zt = g.useCallback(ee => {
    setTimeout(() => {
      try {
        ee.executeJavaScript(`try{delete window[${JSON.stringify(Yc)}]}catch(e){}; true`);
      } catch {}
    }, 3000);
  }, []);
  const Rt = g.useCallback(async ee => {
    if (!ee || !ee.executeJavaScript) {
      return {
        ok: false,
        reason: 'no-wv'
      };
    }
    try {
      const Q = await ze(ee, QP, 'dola-force-ui');
      console.log('[DolaCanvas30s] 面板 UI 自动化结果', Q);
      if (Q && typeof Q == 'object') {
        return Q;
      } else {
        return {
          ok: false,
          reason: 'bad-return'
        };
      }
    } catch (Q) {
      console.log(`[DolaCanvas30s] 面板 UI 自动化注入失败（网络层兜底）: ${(Q == null ? undefined : Q.message) || Q}`);
      return {
        ok: false,
        reason: 'inject-fail',
        note: String((Q == null ? undefined : Q.message) || Q)
      };
    }
  }, [ze]);
  const Be = g.useCallback(async (ee, Q, me) => {
    var Le;
    var Ge;
    var He;
    var lt;
    v.current.add(Q);
    const ve = L.getState().accounts.find(st => {
      return st.id === Q;
    });
    const qe = (ve == null ? undefined : ve.type) === 'dola' || (ve == null ? undefined : ve.type) === 'lovart';
    const tt = `send_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    y.current = tt;
    const Ae = new Set();
    const nt = new Set();
    const _e = [`📋 会话 ${tt} → 账号 ${Q}`];
    const Z = me.images || [];
    const T = Z.length;
    const K = [];
    const Y = {};
    let de = 0;
    for (let st = 0; st < Z.length; st++) {
      const dt = vD(Z[st]);
      if (Y.hasOwnProperty(dt)) {
        de++;
        _e.push(`  ⚠ 图片 [${st}] "${Z[st].label || '?'}" 与 [#${Y[dt]}] 重复，跳过`);
        continue;
      }
      Y[dt] = K.length;
      K.push({
        ...Z[st],
        _fp: dt,
        _origIndex: st
      });
    }
    if (de > 0) {
      _e.push(`  📊 图片去重：原始 ${T} 张 → 去重后 ${K.length} 张（去除 ${de} 张重复）`);
    }
    ct(`会话 ${tt} 账号=${Q} 参考图 原始=${T} 去重后=${K.length} :: ${Z.map(st => {
      return `${st.label || '?'}<${String(st.dataUrl || '').slice(0, 28)}>`;
    }).join(' , ')}`);
    let ae = false;
    let we = 0;
    let Se = 0;
    const ge = [];
    try {
      if (me.text && me.text.trim()) {
        const fe = In(me.text).trim();
        _e.push(`
── Phase 1: 文本填入 (${fe.length} 字符, 原始 ${me.text.length} 字符) ──`);
        const Te = await window.api.copyTextToClipboard(fe);
        if (Te != null && Te.ok) {
          await et(ee, () => {
            return Qe(ee);
          });
          await new Promise(Ye => {
            return setTimeout(Ye, 600);
          });
          const Ue = await ze(ee, Ql, 'verify-text');
          if (Ue && Ue._execError) {
            _e.push(`  ⚠ 文本验证脚本异常: ${Ue.error} — 假定文本已填入`);
            ae = true;
          } else {
            ae = Ue && Ue.valueLen > 0;
            _e.push(`  ${ae ? '✓' : '✗'} 文本填入: valueLen=${Ue == null ? undefined : Ue.valueLen}, found=${Ue == null ? undefined : Ue.found}`);
            if (!ae) {
              await new Promise(Pe => {
                return setTimeout(Pe, 800);
              });
              const Ye = await ze(ee, Ql, 'verify-text-retry');
              ae = Ye && Ye.valueLen > 0;
              _e.push(`  ${ae ? '✓' : '✗'} 文本重试: valueLen=${Ye == null ? undefined : Ye.valueLen}`);
            }
          }
        } else {
          _e.push('  ✗ 文本复制到剪贴板失败');
        }
      } else {
        ae = true;
        _e.push(`
── Phase 1: 跳过（无文本） ──`);
      }
      if (K.length > 0) {
        _e.push(`
── Phase 2: 图片粘贴（${K.length} 张去重后） ──`);
        const fe = await ze(ee, _a, 'verify-img-before');
        const Te = fe && !fe._execError && fe.attachImgCount || 0;
        const Ue = ee && ee.getWebContentsId ? ee.getWebContentsId() : null;
        _e.push(`  目标 webview wcId=${Ue ?? 'null'}`);
        ct(`Phase2 开始 startCount=${Te} wcId=${Ue} 策略=${(fe == null ? undefined : fe.strategy) || '?'}`);
        _e.push(`  粘贴前附件基数: ${Te}${fe != null && fe._execError ? ' (验证脚本异常，使用默认值)' : ''} (策略: ${(fe == null ? undefined : fe.strategy) || '?'})`);
        if (fe && !fe._execError) {
          _e.push(`  诊断: 锚定输入框=${fe.inputTag || '未找到'} (area=${fe.inputArea ?? '?'}, 候选编辑器=${fe.edCount ?? '?'}, 全页img=${fe.totalImgTags ?? '?'})`);
        }
        let Ye = false;
        if ((Le = window.api) != null && Le.attachImagesToWebview && Ue) {
          try {
            ct(`Phase2 主通路 CDP 直喂 ${K.length} 张…`);
            const Pe = await window.api.attachImagesToWebview(Ue, K.map(rt => {
              return {
                dataUrl: rt.dataUrl,
                label: rt.label
              };
            }));
            if (Pe != null && Pe.ok) {
              _e.push(`  已把 ${Pe.count} 张参考图作为文件喂给上传控件 (nodeId=${Pe.nodeId} accept=${String(Pe.accept || '').slice(0, 32)})`);
              ct(`Phase2 主通路喂文件成功 ${Pe.count} 张 nodeId=${Pe.nodeId}`);
              let rt = 0;
              for (let ot = 0; ot < 8; ot++) {
                await new Promise($t => {
                  return setTimeout($t, 1200);
                });
                const ht = await ze(ee, _a, `verify-batch-${ot}`);
                rt = (ht && !ht._execError && ht.attachImgCount || 0) - Te;
                if (rt >= K.length) {
                  break;
                }
              }
              if (rt > 0) {
                Ye = true;
                we = rt;
                K.forEach(ot => {
                  if (ot._fp) {
                    nt.add(ot._fp);
                    Ae.add(ot._fp);
                  }
                });
                _e.push(`  ✓ CDP 通路确认输入区附件 +${rt}`);
                ct(`Phase2 主通路成功 附件+${rt}`);
              } else {
                _e.push('  ⚠ 文件已喂入但未探测到附件缩略图 → 回退剪贴板通路');
                ct('Phase2 主通路喂文件成功但 DOM 未探测到附件，回退剪贴板');
              }
            } else {
              _e.push(`  ⚠ CDP 直喂失败：${((Pe == null ? undefined : Pe.errors) || []).join('；') || '未知原因'} → 回退剪贴板通路`);
              ct(`Phase2 主通路失败 ${((Pe == null ? undefined : Pe.errors) || []).join('；')}`);
            }
          } catch (Pe) {
            _e.push(`  ⚠ CDP 直喂异常：${(Pe == null ? undefined : Pe.message) || Pe} → 回退剪贴板通路`);
            ct(`Phase2 主通路异常 ${(Pe == null ? undefined : Pe.message) || Pe}`);
          }
        } else {
          _e.push('  ⚠ CDP 直喂不可用（api 或 webviewId 缺失）→ 使用剪贴板通路');
          ct(`Phase2 主通路不可用 api=${(Ge = window.api) != null && !!Ge.attachImagesToWebview} wcId=${Ue}`);
        }
        for (let Pe = 0; Pe < K.length && !Ye; Pe++) {
          const rt = K[Pe];
          const ot = rt._fp;
          if (nt.has(ot)) {
            _e.push(`  ⏭ [${Pe}] "${rt.label || '?'}" 已尝试过，跳过`);
            continue;
          }
          _e.push(`  📎 [${Pe}] "${rt.label || '?'}" 正在粘贴…`);
          const ht = await window.api.copyImageToClipboard(rt, Ue);
          if (ht == null || !ht.ok) {
            _e.push(`    ✗ 剪贴板写入失败: ${(ht == null ? undefined : ht.error) || 'unknown'}`);
            ct(`Phase2 image[${Pe}] 剪贴板失败 err=${(ht == null ? undefined : ht.error) || 'unknown'}`);
            ge.push(Pe);
            continue;
          }
          _e.push(`    剪贴板已写入 (via=${ht.via || '?'}${ht.verified ? ' 回读校验✓' : ''})`);
          ct(`Phase2 image[${Pe}] 剪贴板成功 via=${ht.via || '?'} verified=${!!ht.verified}`);
          nt.add(ot);
          try {
            await et(ee, () => {
              return Qe(ee);
            });
            Se += 1;
            let bt = 0;
            for (let $t = 0; $t < 3; $t++) {
              await new Promise($n => {
                return setTimeout($n, 1200);
              });
              const mt = await ze(ee, _a, `verify-img-${Pe}-${$t}`);
              bt = (mt && !mt._execError && mt.attachImgCount || 0) - Te - we;
              if (bt > 0) {
                break;
              }
            }
            if (bt <= 0 && (await et(ee, () => {
              return Je(ee);
            }))) {
              await new Promise($n => {
                return setTimeout($n, 2500);
              });
              const mt = await ze(ee, _a, `verify-img-key-${Pe}`);
              const yt = mt && !mt._execError && mt.attachImgCount || 0;
              bt = yt - Te - we;
              _e.push(`    ↩ 按键粘贴补充尝试 → 附件探测 ${yt}（新增 ${bt}）`);
            }
            if (bt > 0) {
              we += bt;
              Ae.add(ot);
              _e.push(`    ✓ 成功! 附件+${bt} (总计: ${we})`);
              ct(`Phase2 image[${Pe}] 粘贴成功 附件+${bt}`);
            } else {
              _e.push('    ⚠ 未检测到新增附件 — 加入重试队列');
              ct(`Phase2 image[${Pe}] 粘贴后未探测到新增附件（可能站点未接收粘贴图片）`);
              ge.push(Pe);
            }
          } catch (bt) {
            _e.push(`    ✗ 粘贴异常: ${(bt == null ? undefined : bt.message) || 'unknown'}`);
            ct(`Phase2 image[${Pe}] 粘贴异常 err=${(bt == null ? undefined : bt.message) || 'unknown'}`);
            ge.push(Pe);
          }
        }
        if (ge.length > 0) {
          _e.push(`
── Phase 2b: 增量重试（${ge.length} 张失败图片） ──`);
          for (const Pe of ge) {
            const rt = K[Pe];
            const ot = rt._fp;
            if (nt.has(ot)) {
              _e.push(`  ⏭ [${Pe}] "${rt.label || '?'}" 已尝试过，不再重试（防重复）`);
              continue;
            }
            _e.push(`  🔄 [${Pe}] "${rt.label || '?'}" 重试…`);
            const ht = await window.api.copyImageToClipboard(rt, Ue);
            if (ht == null || !ht.ok) {
              _e.push('    ✗ 重试剪贴板失败');
              continue;
            }
            nt.add(ot);
            try {
              await et(ee, () => {
                return Qe(ee);
              });
              await new Promise(yt => {
                return setTimeout(yt, 2000);
              });
              const bt = await ze(ee, _a, `verify-img-retry-${Pe}`);
              const $t = bt && !bt._execError && bt.attachImgCount || 0;
              const mt = $t - Te;
              if (mt > we) {
                we = mt;
                Ae.add(ot);
                _e.push(`    ✓ 重试成功! (附件总计: ${$t})`);
              } else {
                _e.push(`    ⚠ 重试仍未检测到新增 (附件: ${$t})`);
              }
            } catch (bt) {
              _e.push(`    ✗ 重试异常: ${(bt == null ? undefined : bt.message) || '?'}`);
            }
          }
        }
      } else {
        _e.push(`
── Phase 2: 跳过（无图片） ──`);
      }
      const st = me.params;
      const dt = st && (st.aspectRatio || st.duration != null || st.modelLabel);
      if (qe) {
        _e.push(`
── Phase 2c: 跳过（dola 账号无生成参数控件） ──`);
      } else if (dt) {
        _e.push(`
── Phase 2c: 应用生成参数 → 比例:${st.aspectRatio || '-'} 时长:${st.duration ?? '-'}s 模型:${st.modelLabel || '-'} ──`);
        try {
          const fe = await wt({
            aspectRatio: st.aspectRatio || null,
            duration: st.duration ?? null,
            modelLabel: st.modelLabel || null
          }, {
            wv: ee,
            accountId: Q
          });
          if (fe && fe.ok) {
            const Te = fe.results || {};
            if (Te.mode === 'video' && Te.modeSwitched) {
              _e.push('  模式: ✓ 已切换至视频生成模式');
            } else if (Te.modeError) {
              _e.push(`  模式: ⚠ ${Te.modeError}`);
            } else {
              _e.push('  模式: ℹ 未明确切换（将尝试直接匹配参数）');
            }
            if (Te.entryClicked) {
              _e.push(`  入口: ✓ 已点击「${Te.entryClicked}」`);
            }
            if (Te.entryError) {
              _e.push(`  入口: ⚠ ${Te.entryError}`);
            }
            if (Te.aspectRatio) {
              _e.push(`  分辨率/比例: ${Te.aspectRatio.ok ? '✓' : '⚠'} ${Te.aspectRatio.label || Te.aspectRatio.value || ''}${Te.aspectRatio.validated ? ' [已校验]' : ''}`);
            }
            if (Te.duration) {
              _e.push(`  时长: ${Te.duration.ok ? '✓' : '⚠'} ${Te.duration.label || Te.duration.value || ''}${Te.duration.validated ? ' [已校验]' : ''}`);
            }
            if (Te.model) {
              _e.push(`  模型: ${Te.model.ok ? '✓' : '⚠'} ${Te.model.label || Te.model.value || ''}${Te.model.validated ? ' [已校验]' : ''}`);
            }
            const Ue = Te.verify || {};
            const Ye = [];
            if (Ue.model) {
              Ye.push(`模型${Ue.model.ok ? '✓' : '⚠'}`);
            }
            if (Ue.aspectRatio) {
              Ye.push(`比例${Ue.aspectRatio.ok ? '✓' : '⚠'}`);
            }
            if (Ue.duration) {
              Ye.push(`时长${Ue.duration.ok ? '✓' : '⚠'}`);
            }
            if (Ye.length) {
              _e.push(`  核对: ${Ye.join(' ')}${Te.allVerified ? ' — 全部一致' : ' — 存在不一致！'}`);
            }
            if (Te.panelOpened) {
              _e.push(`  已打开设置面板: ${Te.panelOpened}`);
            }
            if (Te.panelClosed) {
              _e.push(`  已收起设置面板: ${Te.panelClosed}`);
            }
            if ((!Te.aspectRatio || !Te.aspectRatio.ok) && (!Te.duration || !Te.duration.ok) && (!Te.model || !Te.model.ok)) {
              _e.push('  ℹ 未在豆包界面找到对应选项，请检查豆包布局——参数已写入提示词兜底，见输入文本');
            }
            if (Te.allVerified === false) {
              _e.push('  ⚠ 参数核对存在不一致：豆包界面显示值与文本框配置不符，已按提示词兜底发送（请人工复核）');
            }
            if (fe.log && fe.log.length > 0) {
              _e.push('  ── 参数脚本详细日志 ──');
              for (let rt = 0; rt < fe.log.length; rt++) {
                _e.push(`    ${fe.log[rt]}`);
              }
            }
          } else {
            const Te = fe != null && fe._catch ? `内部异常: ${((He = fe == null ? undefined : fe.results) == null ? undefined : He.error) || ''}` : (fe == null ? undefined : fe.error) || 'unknown';
            _e.push(`  ⚠ 参数设置脚本异常: ${Te} — 已作为提示词兜底`);
          }
        } catch (fe) {
          _e.push(`  ✗ 参数设置异常: ${(fe == null ? undefined : fe.message) || '?'}`);
        }
      } else {
        _e.push(`
── Phase 2c: 跳过（无生成参数） ──`);
      }
      const G = K.length;
      let xe = true;
      xe = ae;
      if (me.text && me.text.trim() && !xe) {
        const fe = await ze(ee, Ql, 'precheck-text');
        xe = fe && !fe._execError && (fe.valueLen || 0) > 0;
      }
      let Me = 0;
      let Re = G === 0;
      let $ = 'unknown';
      let ie = null;
      let be = [];
      let ye = 0;
      if (G > 0) {
        const fe = await ze(ee, cD, 'precheck-order');
        if (fe && !fe._execError && Array.isArray(fe.sigs)) {
          be = fe.sigs;
        } else {
          be = [];
        }
        $ = uD(be, K);
        ye = fe && !fe._execError && fe.count || 0;
        if (fe && !fe._execError) {
          ie = fe;
        } else {
          ie = null;
        }
        if ($ === 'ok') {
          Me = Math.max(we, ye, be.length, G);
          Re = true;
        } else {
          Me = Math.max(we, ye);
          Re = Me >= G;
        }
      }
      if (G > 0 && !Re && Se >= G) {
        _e.push(`  ⚠ ${Se}/${G} 张参考图「粘贴动作」已执行，但输入区未探测到对应附件 — 不视为已填入`);
        ct(`Phase3a 警告：粘贴动作 ${Se}/${G} 成功，但 DOM 未探测到附件`);
      }
      const Ne = xe && Re && $ !== 'mismatch';
      const $e = {
        pass: Ne,
        text: xe,
        imagesExpected: G,
        imagesAttached: Me,
        imagesOk: Re,
        order: $
      };
      const at = [];
      if (!xe) {
        at.push('文本未填入聊天框');
      }
      if (G > 0 && !Re) {
        at.push(`参考图缺失（${Me}/${G}）`);
      }
      if ($ === 'mismatch') {
        at.push('图片顺序与素材顺序不一致');
      }
      let Fe = at.join('；');
      const W = G > 0 ? `锚定输入框=${(ie == null ? undefined : ie.inputTag) || '未找到'}(area=${(ie == null ? undefined : ie.inputArea) ?? '?'} 候选编辑器=${(ie == null ? undefined : ie.edCount) ?? '?'}) liveDomCount=${ye} 过程计数=${we} 指纹=${be.length}` : '';
      _e.push(`
── Phase 3a: 发送前完整性校验 ──`);
      _e.push(`  文本: ${xe ? '✓' : '✗'}${me.text && me.text.trim() ? '' : '（无文本）'}`);
      if (G > 0) {
        _e.push(`  图片: ${Re ? '✓' : '✗'} ${Me}/${G}`);
        _e.push(`  顺序: ${$ === 'ok' ? '✓ 一致' : $ === 'mismatch' ? '✗ 不一致' : '⚠ 无法判定（不阻塞）'}`);
        _e.push(`  诊断: ${W}`);
      }
      if (!Ne && Fe) {
        _e.push(`  ✗ 校验明细: ${Fe}`);
      }
      _e.push(`  校验结论: ${Ne ? '✓ 通过' : '✗ 未通过'}`);
      ct(`Phase3a 文本=${xe ? 1 : 0} 图片=${Me}/${G} ok=${Re ? 1 : 0} 顺序=${$} 过程计数=${we} liveDom=${ye} 结论=${Ne ? 'PASS' : 'FAIL'}${Fe ? ' 明细=' + Fe : ''}`);
      {
        const fe = me && (me.genParams || me.params) || {};
        if (qe && Number(fe.duration) > 15 && fe.model === 'seedance-2.5') {
          _e.push(`
── Phase 2d: Dola 面板 UI 自动化（强开 Seedance 2.5 + ${Number(fe.duration)}s） ──`);
          try {
            const Ue = await Rt(ee);
            const Ye = typeof (Ue == null ? undefined : Ue.mode) == 'string' ? Ue.mode : Ue != null && Ue.mode ? JSON.stringify(Ue.mode) : 'unknown';
            _e.push(`  视频模式: ${(Ue == null ? undefined : Ue.reason) === 'video-mode-inactive' ? '⚠ 未激活' : '✓'} (${Ye})`);
            _e.push(`  模型: ${Ue != null && Ue.model ? '✓' : '⚠'} 时长: ${Ue != null && Ue.duration ? '✓' : '⚠'}${Ue != null && Ue.durVia ? ` (via=${Ue.durVia})` : ''}${Ue != null && Ue.curDuration ? ` 当前=${Ue.curDuration}s` : ''}`);
            if (Ue == null || !Ue.ok) {
              if ((Ue == null ? undefined : Ue.reason) === 'video-mode-inactive') {
                _e.push(`  ⚠ Dola 未切到「视频生成」技能模式，${((lt = Ue == null ? undefined : Ue.mode) == null ? undefined : lt.reason) || 'no-video-chip'} → 面板层无控件，但网络层仍会改写请求体`);
              } else {
                _e.push(`  ⚠ UI 自动化未完全命中（${(Ue == null ? undefined : Ue.durReason) || (Ue == null ? undefined : Ue.modelReason) || 'unknown'}）→ 由网络层改写兜底`);
              }
            }
          } catch (Ue) {
            _e.push(`  ⚠ UI 自动化异常: ${(Ue == null ? undefined : Ue.message) || Ue} → 由网络层改写兜底`);
          }
        }
      }
      let Ce = false;
      if (me.autoSend) {
        _e.push(`
── Phase 3b: 自动点击发送按钮（autoSend=开启） ──`);
        if (Ne) {
          await new Promise(fe => {
            return setTimeout(fe, 800);
          });
          for (let fe = 0; fe < 3; fe++) {
            if (fe > 0) {
              await new Promise(Te => {
                return setTimeout(Te, fe * 800);
              });
              _e.push(`  🔄 重试第 ${fe} 次点击发送…`);
            }
            try {
              const Te = await ze(ee, Zl, 'click-send-btn');
              if (Te && Te.ok) {
                Ce = true;
                _e.push(`  ✓ 已自动点击发送按钮 (策略: ${Te.strategy}, 元素: <${Te.tag}> ${Te.clicked})`);
                break;
              } else {
                _e.push(`  ⚠ 自动点击失败 (尝试 ${fe + 1}/3): ${(Te == null ? undefined : Te.reason) || '未知原因'}`);
              }
            } catch (Te) {
              _e.push(`  ✗ 自动点击异常 (尝试 ${fe + 1}/3): ${(Te == null ? undefined : Te.message) || '?'}`);
            }
          }
          if (!Ce) {
            _e.push('  ✗ 3 次尝试均未成功点击发送按钮——可能豆包 UI 结构已变更，请手动发送');
          }
        } else {
          const fe = Fe || '漏图/漏文本/顺序错乱';
          _e.push(`  ✗ 发送前校验未通过（${fe}）→ 已阻止自动发送，请人工核对豆包对话框`);
          return {
            ok: false,
            reason: 'precheck-fail',
            note: `发送前校验未通过：${fe}`,
            sessionId: tt,
            precheck: $e,
            precheckIssue: Fe ? W ? `${Fe}｜诊断: ${W}` : Fe : W ? `诊断: ${W}` : null,
            log: _e
          };
        }
        await new Promise(fe => {
          return setTimeout(fe, 500);
        });
      } else {
        _e.push(`
── Phase 3: 仅填入对话框（autoSend=关闭，不触发发送） ──`);
      }
      _e.push(`
═══ 填入完成 ═══`);
      _e.push(`  文本: ${ae ? '✓' : '✗'} | 图片: ${we}/${T} (去重前) | ${we}/${K.length} (去重后)`);
      return {
        ok: true,
        sessionId: tt,
        textInserted: ae,
        imagesAttached: we,
        imagesTotal: T,
        imagesUnique: K.length,
        duplicatesRemoved: de,
        confirmAutoClicked: false,
        fillOnly: true,
        autoClicked: Ce,
        precheck: $e,
        precheckIssue: Fe ? W ? `${Fe}｜诊断: ${W}` : Fe : W ? `诊断: ${W}` : null,
        log: _e
      };
    } catch (st) {
      _e.push(`
═══ 发送异常 ═══`);
      _e.push(`  错误: ${(st == null ? undefined : st.message) || 'unknown'}`);
      return {
        ok: false,
        reason: 'exception',
        note: (st == null ? undefined : st.message) || '',
        sessionId: tt,
        log: _e
      };
    } finally {
      v.current.delete(Q);
      y.current = null;
    }
  }, [ze, Qe, Je, ct, wt, et, Rt]);
  const it = g.useCallback(async (ee, Q) => {
    console.log(`[postSendDetect] ====== 启动发送后检测 账号=${ee} 节点=${Q || '无'} ======`);
    const me = L.getState();
    const ve = Date.now();
    const qe = (me.accounts || []).find(Y => {
      return Y.id === ee;
    });
    const tt = qe ? qe.name : '豆包';
    const Ae = Y => {
      try {
        me.setDetectDebugInfo({
          lastPollAt: Date.now(),
          accountsTotal: (me.accounts || []).length,
          projectAccounts: 1,
          webviewsReady: 1,
          sentAccounts: 1,
          baselineCount: 0,
          apiOk: false,
          videosTotal: 0,
          videosReady: 0,
          newVideos: 0,
          lastError: null,
          status: '发送后检测中…',
          ...Y
        });
      } catch {}
    };
    if (x.current.has(ee)) {
      console.log(`[postSendDetect] 账号${ee} 已有检测任务在运行，本次发送排队等待连线`);
      return;
    }
    x.current.add(ee);
    const nt = (Y, de, ae) => {
      const {
        assignment: we,
        leftoverJobs: Se
      } = hR({
        vids: de,
        jobs: k.current.get(Y) || [],
        fallbackNodeId: ae,
        isNodeAlive: ge => {
          return L.getState().nodes.some(Le => {
            return Le.id === ge;
          });
        }
      });
      if (Se.length > 0) {
        k.current.set(Y, Se);
      } else {
        k.current.delete(Y);
      }
      return we;
    };
    const _e = () => {
      const Y = (k.current.get(ee) || []).map(de => {
        return de && de.sendTime || 0;
      }).filter(de => {
        return de > 0;
      });
      return Math.min(ve, ...(Y.length ? Y : [ve])) - 60000;
    };
    const Z = (Y, de) => {
      try {
        const ae = L.getState();
        ae.addVideoShare({
          accountId: ee,
          accountName: tt,
          url: Y.url,
          vid: Y.key,
          width: Y.width || null,
          height: Y.height || null,
          duration: Y.duration || null,
          poster: Y.poster || null
        });
        const we = de ? ae.nodes.find(Le => {
          return Le.id === de;
        }) : null;
        const Se = we && we.data && ((we.data._pendingAttempts || {})[ee] || we.data._pendingAttempt) || null;
        const ge = ae.addVideoNode({
          url: Y.url,
          vid: Y.key,
          width: Y.width || null,
          height: Y.height || null,
          duration: Y.duration || null,
          poster: Y.poster || null,
          accountId: ee,
          accountName: tt,
          name: Y.name || '视频',
          sourceAccountId: ee,
          sourceNodeId: de,
          ...d0(ae, de),
          ...(Se ? {
            attempt: Se
          } : null)
        });
        if (ge && Se) {
          ae.patchVideoAttempt(ge, Se.id, {
            vid: Y.key,
            status: 'success'
          });
        }
        if (we && we.data && we.data._pendingAttempts) {
          const Le = {
            ...we.data._pendingAttempts
          };
          delete Le[ee];
          ae.updateNodeData(de, {
            _pendingAttempts: Le
          });
        }
        if (we && we.data && we.data._pendingAttempt && (!Se || we.data._pendingAttempt.id === Se.id)) {
          ae.updateNodeData(de, {
            _pendingAttempt: undefined
          });
        }
        try {
          ae.releaseAccountBusy(ee);
        } catch {}
        b.current.add(Y.key);
        if (K) {
          K.add(Y.key);
        }
        return true;
      } catch (ae) {
        console.error('[postSendDetect] 添加失败:', (ae == null ? undefined : ae.message) || String(ae));
        return false;
      }
    };
    let T = false;
    let K = null;
    try {
      const Y = te(ee);
      if (!Y) {
        Ae({
          status: '检测失败：后台视图未初始化'
        });
        return;
      }
      const de = '!!(document && document.body && document.body.innerHTML)';
      let ae = u.current.get(ee) || false;
      if (!ae) {
        const Me = Date.now();
        while (Date.now() - Me < 15000) {
          try {
            if (await Y.executeJavaScript(de)) {
              ae = true;
              u.current.set(ee, true);
              break;
            }
          } catch {}
          await new Promise(Re => {
            return setTimeout(Re, 500);
          });
        }
      }
      if (!ae) {
        Ae({
          status: '检测失败：豆包后台未就绪'
        });
        return;
      }
      const we = Y.getURL && Y.getURL() || '';
      console.log(`[postSendDetect] 当前 webview URL: ${we}`);
      if (/\/samantha\/aispace/.test(we)) {
        console.log('[postSendDetect] 已在 aispace 页面，无需导航');
        T = false;
      } else {
        let Me = false;
        for (let $ = 0; $ < 2; $++) {
          console.log(`[postSendDetect] 导航到 aispace (尝试 ${$ + 1}/2)…`);
          T = await es(Y, Bd);
          if (T) {
            Me = true;
            break;
          }
          console.warn(`[postSendDetect] 导航失败/超时 (尝试 ${$ + 1}/2)，等待后重试…`);
          await new Promise(ie => {
            return setTimeout(ie, 2000);
          });
        }
        if (!Me) {
          console.error('[postSendDetect] 导航到 aispace 失败，检测无法继续（homepage API 在 /chat/ 页返回空数据）');
          Ae({
            status: '检测失败：无法导航到创作空间页',
            lastError: 'navigateWebview 两次均失败/超时'
          });
          return;
        }
        console.log('[postSendDetect] 导航成功，等待 SPA 水合…');
        await new Promise($ => {
          return setTimeout($, 1500);
        });
        const Re = Y.getURL && Y.getURL() || '';
        console.log(`[postSendDetect] 导航后 URL: ${Re}`);
      }
      const Se = 4000;
      const ge = 900000;
      const Le = 3000000;
      const Ge = 90000;
      const He = Date.now();
      let lt = Date.now();
      let st = false;
      let dt = true;
      const G = new Set();
      const xe = async Me => {
        var ye;
        if (!Me || G.has(Me)) {
          return false;
        }
        const Re = L.getState();
        const $ = (ye = Re.nodePendingTimers) == null ? undefined : ye[Me];
        if ($ == null) {
          return false;
        }
        let ie = false;
        try {
          const Ne = await ze(Y, Hd, 'detect-gen-submit');
          if (Ne && !Ne._execError && Ne.hit) {
            ie = true;
            console.log(`[postSendDetect] 探测到「已提交」回复 → 启动节点=${Me} 计时（text=${Ne.text} src=${Ne.src}）`);
          }
        } catch {}
        const be = Date.now() - $;
        if (ie || be >= Ge) {
          Re.setNodeTimer(Me, ie ? Date.now() : $ + Ge);
          Re.removeNodePendingTimer(Me);
          G.add(Me);
          if (!ie) {
            console.warn(`[postSendDetect] 节点=${Me} 兜底启动计时器（${Ge / 1000}s 内未探测到「已提交」回复，sentAt=${$}）`);
          }
          return true;
        } else {
          return false;
        }
      };
      while (Date.now() - He < Le) {
        const Me = Y.getWebContentsId ? Y.getWebContentsId() : null;
        if (!Me || Me < 0) {
          Ae({
            status: '检测失败：webview 未就绪'
          });
          break;
        }
        let Re = null;
        try {
          const $e = await window.api.detectVideos(Me, Array.from(b.current));
          if (typeof $e == 'string') {
            try {
              Re = JSON.parse($e);
            } catch {
              Re = {
                ok: false,
                error: 'parse_failed:' + $e.slice(0, 80)
              };
            }
          } else if ($e && typeof $e == 'object') {
            Re = $e;
          } else {
            Re = {
              ok: false,
              error: 'invalid_type:' + typeof $e
            };
          }
        } catch ($e) {
          console.warn('[postSendDetect] JS执行异常 账号' + ee + ':', ($e == null ? undefined : $e.message) || String($e));
          await new Promise(at => {
            return setTimeout(at, Se);
          });
          continue;
        }
        if (!Re || !Re.ok) {
          const $e = Re && Re.error ? String(Re.error).slice(0, 300) : '返回数据异常';
          console.warn(`[postSendDetect] 检测失败 账号${ee}: ${$e}`);
          Ae({
            lastError: $e,
            status: '检测失败，稍后重试…'
          });
          await new Promise(at => {
            return setTimeout(at, Se);
          });
          continue;
        }
        const $ = Re.videos || [];
        const ie = $.filter($e => {
          return $e.ready && $e.url;
        }).length;
        console.log(`[postSendDetect] 轮询结果: 总${$.length}个视频, ${ie}个可下载, seenKeys=${b.current.size}`);
        if (dt) {
          K = new Set();
          const $e = new Set();
          const at = _e();
          for (const fe of $) {
            if (!fe.key) {
              continue;
            }
            const Te = E0(fe.created_at);
            const Ue = isFinite(Te) && Te > at;
            if (fe.ready && fe.url) {
              if (Ue) {
                $e.add(fe.key);
              } else {
                K.add(fe.key);
              }
            }
          }
          for (const fe of K) {
            b.current.add(fe);
          }
          const Fe = $.filter(fe => {
            return fe.key && $e.has(fe.key) && !b.current.has(fe.key) && fe.ready && fe.url;
          });
          const W = nt(ee, Fe, Q || null);
          let Ce = 0;
          for (const fe of Fe) {
            const Te = W.get(fe.key) ?? null;
            console.log(`[postSendDetect] 首轮新视频 ${fe.key} → 节点 ${Te || '无(兜底丢弃归属)'}`);
            if (Z(fe, Te)) {
              Ce++;
            }
          }
          if (Ce > 0) {
            st = true;
          }
          dt = false;
          console.log(`[postSendDetect] 账号${ee} 基线建立: ${K.size}个旧视频${Ce ? `, 首轮即检测到 ${Ce} 个新视频` : ''}`);
          Ae({
            apiOk: true,
            baselineCount: K.size,
            videosTotal: $.length,
            videosReady: ie,
            newVideos: Ce,
            status: Ce > 0 ? `✅ 已添加 ${Ce} 个新视频` : '检测中…（等待新视频生成）'
          });
          await new Promise(fe => {
            return setTimeout(fe, Se);
          });
          continue;
        }
        let be = 0;
        const ye = _e();
        const Ne = [];
        for (const $e of $) {
          if (!$e.key || b.current.has($e.key) || !$e.ready || !$e.url) {
            continue;
          }
          const at = E0($e.created_at);
          if (isFinite(at) && at > ye || !K.has($e.key)) {
            Ne.push($e);
          } else {
            b.current.add($e.key);
          }
        }
        if (Ne.length > 0) {
          const $e = nt(ee, Ne, Q || null);
          for (const at of Ne) {
            const Fe = $e.get(at.key) ?? null;
            console.log(`[postSendDetect] ✅ 新视频: "${at.name || '?'}" (${at.key}) → 节点 ${Fe || '无(兜底丢弃归属)'}`);
            if (Z(at, Fe)) {
              be++;
            }
          }
        }
        if (Q) {
          xe(Q).catch(() => {});
        }
        if (be > 0) {
          st = true;
          lt = Date.now();
          console.log(`[postSendDetect] 账号${ee} 本轮新增 ${be} 个视频`);
        }
        Ae({
          apiOk: true,
          videosTotal: $.length,
          videosReady: ie,
          newVideos: be,
          status: be > 0 ? `✅ 已添加 ${be} 个新视频，继续检测…` : '等待新视频生成…'
        });
        if (st && Date.now() - lt > ge) {
          console.log(`[postSendDetect] 账号${ee} 5min 无新增，结束检测`);
          break;
        }
        await new Promise($e => {
          return setTimeout($e, Se);
        });
      }
    } catch (Y) {
      console.error('[postSendDetect] 异常 账号' + ee + ':', (Y == null ? undefined : Y.message) || String(Y));
      try {
        L.getState().setDetectDebugInfo({
          lastError: String((Y == null ? undefined : Y.message) || Y).slice(0, 300),
          status: '检测异常已结束'
        });
      } catch {}
    } finally {
      x.current.delete(ee);
      console.log(`[postSendDetect] ====== 检测结束 账号=${ee} navigated=${T} ======`);
      const Y = Kk(k.current.get(ee) || [], de => {
        return L.getState().nodes.some(ae => {
          return ae.id === de;
        });
      });
      if (Y.length > 0) {
        k.current.set(ee, Y);
      } else {
        k.current.delete(ee);
      }
      if (T) {
        try {
          const de = te(ee);
          if (de) {
            es(de, La);
          }
        } catch {}
      }
      try {
        L.getState().releaseAccountBusy(ee);
      } catch {}
    }
  }, [te, u]);
  const kt = g.useCallback(async (ee, Q, me, ve = {}) => {
    var st;
    const qe = '确认，直接生成完整的一段视频';
    const _e = Date.now();
    let Z = null;
    try {
      const dt = await vr(Q, {
        jobId: `auto-confirm:${me || Date.now()}`,
        purpose: 'auto-confirm',
        timeoutMs: 30000,
        leaseTtlMs: 900000
      });
      if (dt.ok) {
        Z = dt.leaseId;
      }
    } catch (dt) {
      console.warn(`[autoConfirm] 账号=${Q} 申请独立租约失败：${(dt == null ? undefined : dt.message) || dt} → fallback 到 opts.runtimeLeaseId`);
    }
    const T = () => {
      if (Z) {
        return zy(Z);
      } else {
        return !ve.runtimeLeaseId || zy(ve.runtimeLeaseId);
      }
    };
    let K = Number.isFinite(ve.baselineCount) ? ve.baselineCount : 0;
    let Y = Number.isFinite(ve.submitBaselineCount) ? ve.submitBaselineCount : 0;
    let de = false;
    let ae = ee;
    let we = false;
    const Se = async (dt, G) => {
      const xe = te(Q);
      if (xe) {
        ae = xe;
      }
      if (ae != null && ae.isConnected) {
        return ze(ae, dt, G);
      } else {
        return {
          _execError: true,
          error: 'webview-unmounted'
        };
      }
    };
    const ge = () => {
      var G;
      let dt = '';
      try {
        dt = ((G = ae.getURL) == null ? undefined : G.call(ae)) || '';
      } catch {}
      if (!de && ve.beforeUrl && dt && dt !== ve.beforeUrl && /\/chat\//.test(dt)) {
        K = 0;
        Y = 0;
        de = true;
      }
    };
    const Le = dt => {
      var G;
      console.warn(`[autoConfirm] 账号=${Q} 节点=${me || '无'} ${dt}`);
      if (me && T()) {
        const xe = L.getState();
        const Me = (G = xe.nodeNotices) == null ? undefined : G[me];
        if (Me && Me.code !== 'generation-confirm') {
          return;
        }
        xe.setNodeNotice(me, {
          level: 'warn',
          code: 'generation-confirm',
          accountId: Q,
          title: '后台等待生成确认',
          text: dt
        });
      }
    };
    const Ge = dt => {
      var Me;
      if (!me || !T()) {
        return;
      }
      const G = L.getState();
      const xe = (Me = G.nodeNotices) == null ? undefined : Me[me];
      if (!xe || xe.code === 'generation-confirm') {
        if (dt) {
          G.setNodeNotice(me, {
            level: 'info',
            code: 'generation-confirm',
            accountId: Q,
            title: '正在确认后台生成',
            text: dt
          });
        } else if ((xe == null ? undefined : xe.code) === 'generation-confirm' && xe.accountId === Q) {
          G.clearNodeNotice(me);
        }
      }
    };
    const He = Z || ve.runtimeLeaseId || `${Q}|${me || 'none'}|${Date.now()}`;
    if (Vd.has(He)) {
      console.log(`[autoConfirm] 账号=${Q} 已处于自动确认周期中（${He}）→ 跳过重复触发`);
      return {
        ok: false,
        reason: 'already-triggered'
      };
    }
    Vd.add(He);
    console.log(`[autoConfirm] 启动 账号=${Q} 节点=${me || '无'} 独立租约=${Z || '无'} onceKey=${He}`);
    const lt = A(Q);
    try {
      const dt = async () => {
        var Ne;
        try {
          const $e = await Se(Hd, 'detect-gen-submit');
          ge();
          if ($e.count < Y) {
            Y = 0;
          }
          if (!$e || $e._execError || typeof $e.count != 'number' || $e.count <= Y || !$e.text || String(ve.ownText || '').includes($e.text)) {
            return false;
          }
          we = true;
          console.log(`[autoConfirm] 探测到本轮「已提交」回复 → 节点=${me || '无'} text=${$e.text}`);
        } catch {}
        if (we && me) {
          const $e = L.getState();
          if (((Ne = $e.nodePendingTimers) == null ? undefined : Ne[me]) != null) {
            $e.setNodeTimer(me, Date.now());
            $e.removeNodePendingTimer(me);
          }
        }
        if (we) {
          Ge(null);
        }
        return we;
      };
      let G = false;
      let xe = null;
      let Me = 0;
      while (T() && Date.now() - _e < 3000000) {
        await new Promise(Ne => {
          return setTimeout(Ne, 2500);
        });
        if (!T()) {
          console.log(`[autoConfirm] 账号=${Q} 循环中断：taskAlive=false（租约已释放）`);
          break;
        }
        if (await dt()) {
          return {
            ok: true,
            reason: 'already-submitted'
          };
        }
        xe = await Se(A0, 'detect-gen-confirm');
        Me += 1;
        if (xe && !xe._execError && typeof xe.count == 'number') {
          ge();
          if (xe.count < K) {
            console.log(`[autoConfirm] 账号=${Q} SPA 切换/裁剪导致基线重置 ${K} → 0`);
            K = 0;
          }
          if (xe.count > K && xe.text && !String(ve.ownText || '').includes(xe.text)) {
            G = true;
            break;
          }
          if (Me % 10 === 0 || xe.count !== K) {
            console.log(`[autoConfirm] 账号=${Q} 第 ${Me} 轮探测 count=${xe.count} baseline=${K} text=${((st = xe.text) == null ? undefined : st.slice(0, 40)) || '无'} bodyLen=${xe.bodyLen}`);
          }
        } else if (Me % 10 === 0) {
          console.log(`[autoConfirm] 账号=${Q} 第 ${Me} 轮探测 无结果 det=${xe ? JSON.stringify({
            _execError: xe._execError,
            error: xe.error,
            count: xe.count
          }) : 'null'}`);
        }
      }
      if (!G) {
        const Ne = T();
        console.log(`[autoConfirm] 账号=${Q} 探测结束 detected=false alive=${Ne} 耗时=${Date.now() - _e}ms`);
        if (Ne) {
          Le('任务仍在等待，但 12 分钟内未识别到生成确认/已提交回复，请到该账号后台核对。');
        }
        return {
          ok: false,
          reason: Ne ? 'confirm-timeout' : 'task-finished'
        };
      }
      console.log(`[autoConfirm] 账号=${Q} 检测到本轮新增确认回复「${xe.text}」（${xe.count} > ${K}）→ 延迟 2 秒后确认`);
      Ge('后台要求确认生成参数，正在自动回复确认；收到接单回执后才开始生成。');
      await new Promise(Ne => {
        return setTimeout(Ne, 2000);
      });
      if (!T()) {
        return {
          ok: false,
          reason: 'task-finished'
        };
      }
      const Re = await Se(lD, 'click-confirm-btn');
      if (Re && !Re._execError && Re.clicked) {
        console.log(`[autoConfirm] 账号=${Q} 已点击内联确认按钮「${Re.label}」(${Re.strategy})`);
        const Ne = Date.now();
        await new Promise($e => {
          return setTimeout($e, 2500);
        });
        while (T() && Date.now() - Ne < 90000 && !(await dt())) {}
        if (T() && !we) {
          Le('已点击确认按钮，但未收到“已提交/正在生成”回执，请检查后台。');
        }
        return {
          ok: we,
          autoReplied: false,
          clicked: true,
          button: Re.label,
          acked: we
        };
      }
      console.log(`[autoConfirm] 账号=${Q} 无内联按钮 → 自动回复「${qe}」`);
      let $ = null;
      $ = await Se(j0, 'confirm-input-before');
      for (let Ne = 0; Ne < 3 && T() && ($ == null || !$.found || !!$.text); Ne++) {
        await new Promise($e => {
          return setTimeout($e, 500);
        });
      }
      if (!T()) {
        return {
          ok: false,
          reason: 'task-finished'
        };
      }
      if ($ == null || !$.found || $._execError || $.text) {
        Le('检测到后台要求确认，但输入框尚有内容或无法读取；为避免混发，请手动核对并确认。');
        return {
          ok: false,
          reason: 'composer-not-empty'
        };
      }
      const ie = await window.api.copyTextToClipboard(qe);
      if (ie == null || !ie.ok) {
        Le('自动确认失败：无法写入剪贴板，请手动在后台回复确认。');
        return {
          ok: false,
          reason: 'clipboard-fail'
        };
      }
      await Qe(ae);
      let be = null;
      await new Promise($e => {
        return setTimeout($e, 400);
      });
      be = await Se(j0, 'confirm-input-verify');
      for (let Ne = 0; Ne < 3 && T() && (be == null ? undefined : be.text) !== qe; Ne++) {}
      if (!T()) {
        return {
          ok: false,
          reason: 'task-finished'
        };
      }
      if (be == null || !be.found || be.text !== qe) {
        Le('自动确认语未能准确填入输入框，已停止自动发送，请到后台手动确认。');
        return {
          ok: false,
          reason: 'confirm-input-mismatch'
        };
      }
      let ye = false;
      for (let Ne = 0; Ne < 3; Ne++) {
        if (Ne > 0) {
          await new Promise(at => {
            return setTimeout(at, Ne * 800);
          });
        }
        if (!T()) {
          return {
            ok: false,
            reason: 'task-finished'
          };
        }
        const $e = await Se(Zl, 'confirm-reply-send');
        if ($e && $e.ok) {
          ye = true;
          break;
        }
      }
      if (ye) {
        const Ne = Date.now();
        await new Promise($e => {
          return setTimeout($e, 2500);
        });
        while (T() && Date.now() - Ne < 90000 && !(await dt())) {}
      }
      if (ye) {
        if (T() && !we) {
          Le('确认语已发出，但未收到“已提交/正在生成”回执，请检查后台。');
        }
      } else {
        Le('检测到后台要求确认，但自动发送确认语失败，请手动处理。');
      }
      return {
        ok: ye && we,
        autoReplied: ye,
        acked: we
      };
    } catch (dt) {
      Le(`自动确认异常：${(dt == null ? undefined : dt.message) || String(dt)}。请到后台手动确认。`);
      return {
        ok: false,
        reason: 'exception'
      };
    } finally {
      Vd.delete(He);
      lt();
      if (Z) {
        rn(Z, 'auto-confirm-done');
      }
    }
  }, [ze, Qe, te, A, vr, rn]);
  const xt = g.useCallback(async (ee, Q) => {
    const me = Q || o;
    const ve = await vr(me, {
      jobId: `fetch-video:${ee || Date.now()}`,
      purpose: 'result-pull',
      timeoutMs: 30000
    });
    if (!ve.ok) {
      return {
        ok: false,
        error: ve.reason,
        note: ve.note
      };
    }
    const qe = ve.webview || te(me);
    if (!qe) {
      rn(ve.leaseId, 'result-pull-no-webview');
      return {
        ok: false,
        error: 'no-webview',
        note: `账号 ${me} 的后台视图未初始化`
      };
    }
    const tt = '!!(document && document.body && document.body.innerHTML)';
    let Ae = u.current.get(me) || false;
    if (!Ae) {
      const _e = Date.now();
      while (Date.now() - _e < 15000) {
        try {
          if (await qe.executeJavaScript(tt)) {
            Ae = true;
            u.current.set(me, true);
            break;
          }
        } catch {}
        await new Promise(Z => {
          return setTimeout(Z, 500);
        });
      }
    }
    if (!Ae) {
      rn(ve.leaseId, 'result-pull-not-ready');
      return {
        ok: false,
        error: 'webview-not-ready',
        note: '豆包后台页面加载超时'
      };
    }
    let nt = false;
    try {
      const _e = qe.getURL && qe.getURL() || '';
      if (!/\/samantha\/aispace/.test(_e)) {
        nt = await es(qe, Bd);
        await new Promise(T => {
          return setTimeout(T, 1500);
        });
      }
      return (await qe.executeJavaScript(`(${mD})('${ee}')`)) || {
        ok: false,
        error: 'empty-response'
      };
    } catch (_e) {
      return {
        ok: false,
        error: (_e == null ? undefined : _e.message) || String(_e)
      };
    } finally {
      if (nt) {
        es(qe, La);
      }
      rn(ve.leaseId, 'result-pull-finished');
    }
  }, [o, te, u, es]);
  const Nt = g.useCallback(async (ee, Q, me, ve = {}) => {
    if (String(ve.mediaType || 'video').toLowerCase() !== 'video') {
      return {
        ok: true,
        skipped: 'not-video'
      };
    }
    if (!ee || !Q || !me) {
      return {
        ok: false,
        reason: 'bad-args'
      };
    }
    const tt = `${Q}::${me}`;
    if (N.current.has(tt)) {
      return {
        ok: true,
        skipped: 'already-running'
      };
    }
    N.current.set(tt, Date.now());
    const Ae = A(Q);
    const nt = Number(ve.ackedAt) || Date.now();
    L.getState();
    const _e = eS(me, Q);
    let Z = ee;
    let T = 0;
    let K = 0;
    const Y = () => {
      return !L.getState().nodes.some(Se => {
        return Se.id === me;
      });
    };
    const de = () => {
      const Se = L.getState().nodes || [];
      const ge = Se.find(Le => {
        return Le.id === me;
      });
      if (ge && ge.data && (ge.data.resultUrl || ge.data.resultPoster)) {
        return true;
      } else {
        return Se.some(Le => {
          return Le.type === 'video' && Le.data && Le.data.gridAnchor === me;
        });
      }
    };
    const ae = async Se => {
      try {
        const ge = await ze(Z, iD, Se);
        if (ge && !ge._execError) {
          return ge.text || '';
        }
      } catch {}
      return '';
    };
    const we = async Se => {
      const ge = Date.now() + UR;
      let Le = '';
      let Ge = 0;
      while (Date.now() < ge) {
        const He = await ae('queue-ping-reply');
        if (VR(Se, He)) {
          if (He === Le) {
            if (Date.now() - Ge >= 600) {
              return He;
            }
          } else {
            Le = He;
            Ge = Date.now();
          }
        }
        await new Promise(lt => {
          return setTimeout(lt, 1500);
        });
      }
      return '';
    };
    try {
      await new Promise(dt => {
        return setTimeout(dt, 5000);
      });
      while (Date.now() - nt < zR && !Y()) {
        if (de()) {
          L.getState().clearQueueProgress(_e);
          break;
        }
        const Se = te(Q);
        if (Se) {
          Z = Se;
        }
        if (!GR({
          pings: T,
          ackedAt: nt,
          lastPingAt: K,
          now: Date.now()
        })) {
          continue;
        }
        T += 1;
        K = Date.now();
        const ge = await ae('queue-ping-baseline');
        if (de()) {
          L.getState().clearQueueProgress(_e);
          break;
        }
        const Le = await ze(Z, aD, 'queue-ping-fill');
        if (!Le || Le._execError || !Le.ok) {
          L.getState().setQueueProgress(_e, {
            kind: 'unknown',
            pings: T,
            text: '未能向页面追问排队进度（输入框未找到）'
          });
          continue;
        }
        await new Promise(dt => {
          return setTimeout(dt, 800);
        });
        if (de()) {
          L.getState().clearQueueProgress(_e);
          break;
        }
        const Ge = await ze(Z, Zl, 'queue-ping-send');
        if (!Ge || Ge._execError || !Ge.ok) {
          L.getState().setQueueProgress(_e, {
            kind: 'unknown',
            pings: T,
            text: '排队追问未能发送（未找到发送按钮）'
          });
          continue;
        }
        const He = await we(ge);
        const lt = WR(He);
        const st = {
          none: '助手回复：当前没有正在生成的视频（仍在等待，未判定失败）',
          offer: '助手回复：是否要现在开始生成？（本次任务可能未被受理）',
          busy: '助手回复：任务正在排队 / 生成中',
          other: `助手回复：${String(He || '').slice(0, 80)}`,
          'no-reply': '已追问排队进度，暂未收到回复（继续等待出片）'
        };
        L.getState().setQueueProgress(_e, {
          kind: lt.kind,
          pings: T,
          askedAt: K,
          text: lt.kind === 'other' ? st.other : st[lt.kind]
        });
        if (lt.kind === 'none' || lt.kind === 'no-reply') {
          console.log(`[queuePing] 节点=${me} 账号=${Q} 第 ${T}/${Cp} 次追问 → ${lt.kind}（不判失败，继续等待）`);
        } else {
          console.log(`[queuePing] 节点=${me} 账号=${Q} 第 ${T}/${Cp} 次追问 → ${lt.kind}`);
        }
      }
      return {
        ok: true,
        pings: T
      };
    } catch (Se) {
      console.warn(`[queuePing] 节点=${me} 账号=${Q} 异常: ${(Se == null ? undefined : Se.message) || String(Se)}`);
      return {
        ok: false,
        reason: 'exception'
      };
    } finally {
      N.current.delete(tt);
      Ae();
    }
  }, [ze, te, A]);
  const gt = g.useCallback(async (ee, Q, me, ve = {}) => {
    if (!ee || !Q) {
      return {
        ok: false,
        reason: 'bad-args'
      };
    }
    const Ae = A(Q);
    let nt = ee;
    const _e = Fe => {
      Ae();
      if (ve.runtimeLeaseId) {
        rn(ve.runtimeLeaseId, 'watch-send-done');
      }
      return Fe;
    };
    const Z = Array.isArray(ve.tried) && ve.tried.length ? ve.tried : [];
    const T = Z.includes(Q) ? Z : [...Z, Q];
    const K = typeof ve.maxSwitches == 'number' ? ve.maxSwitches : 3;
    const Y = ve.payload || null;
    const de = Fe => {
      try {
        const W = L.getState().accounts.find(Ce => {
          return Ce.id === Fe;
        });
        if (W) {
          return W.name;
        } else {
          return Fe;
        }
      } catch {
        return Fe;
      }
    };
    const ae = async Fe => {
      try {
        const W = await ze(nt, dD, Fe);
        if (W && !W._execError && typeof W.count == 'number') {
          return {
            count: W.count,
            text: W.text || ''
          };
        }
      } catch {}
      return null;
    };
    const we = async Fe => {
      try {
        const W = await ze(nt, pD, Fe);
        if (W && !W._execError && W.counts && typeof W.counts == 'object') {
          return {
            counts: W.counts,
            samples: W.samples || {}
          };
        }
      } catch {}
      return null;
    };
    const Se = async Fe => {
      try {
        const W = await ze(nt, hD, Fe);
        if (W && !W._execError && typeof W.hit == 'boolean') {
          return {
            hit: W.hit,
            lowCount: typeof W.lowCount == 'number' ? W.lowCount : W.hit ? 1 : 0,
            consume: typeof W.consume == 'number' ? W.consume : null,
            remain: typeof W.remain == 'number' ? W.remain : null,
            reason: W.reason || '',
            sample: W.sample || ''
          };
        }
      } catch {}
      return null;
    };
    const ge = await ae('detect-gen-ack-base');
    let Le = Wd[Q] || 0;
    let Ge = Math.max(ge ? ge.count : 0, Le);
    const He = await we('detect-reply-notice-base');
    const lt = He && He.counts || {};
    const st = await Se('detect-quota-usage-base');
    const dt = st && typeof st.lowCount == 'number' ? st.lowCount : 0;
    const G = new Set();
    let xe = false;
    let Me = false;
    let Re = false;
    const $ = async Fe => {
      if (Re || !me) {
        return false;
      }
      try {
        const W = await ze(nt, fD, Fe);
        if (W && !W._execError && W.hit && W.seconds > 0) {
          L.getState().setNodeWaitTime(me, {
            minutes: W.minutes,
            seconds: W.seconds,
            detectedAt: Date.now(),
            text: W.text || ''
          });
          Re = true;
          console.log(`[waitTime] 节点=${me} 解析到预计等待 ${W.minutes} 分钟（原文「${W.text}」）→ 启动倒计时`);
          return true;
        }
      } catch {}
      return false;
    };
    const ie = async (Fe, W = 25000) => {
      const Ce = (L.getState().accounts || []).find(Te => {
        return Te.id === Fe;
      });
      if (!Ce) {
        return null;
      }
      console.log(`[switch] 按需启用目标账号 ${Ce.name || Fe}，等待后台页面就绪`);
      const fe = await vr(Fe, {
        jobId: me || `switch:${Date.now()}`,
        purpose: 'quota-switch',
        timeoutMs: W
      });
      if (fe.ok) {
        return {
          webview: fe.webview || te(Fe),
          leaseId: fe.leaseId
        };
      } else {
        console.warn(`[switch] 账号 ${Ce.name || Fe} 加载失败：${fe.note || fe.reason}`);
        return null;
      }
    };
    const be = async (Fe, W) => {
      var $t;
      if (xe || !me) {
        return false;
      }
      xe = true;
      const Ce = L.getState();
      try {
        Ce.markAccountBusy(Q);
      } catch {}
      if (K <= 0) {
        Ce.setNodeSwitch(me, {
          state: 'failed',
          fromName: de(Q),
          reason: '已达最大自动换号次数'
        });
        console.log(`[switch] 节点=${me} ${W}，但已达最大换号次数 ${ve.maxSwitches} → 停止换号`);
        return false;
      }
      if (!Y) {
        Ce.setNodeSwitch(me, {
          state: 'failed',
          fromName: de(Q),
          reason: '缺少原始发送载荷，无法自动重发'
        });
        console.log('[switch] 无原始载荷（payload 为空）→ 换号失败');
        return false;
      }
      const fe = Ce.listNextIdleAccounts(T) || [];
      if (!fe.length) {
        Ce.setNodeSwitch(me, {
          state: 'failed',
          fromName: de(Q),
          reason: '没有其他已登录的可用账号'
        });
        console.log(`[switch] 节点=${me} ${W}，但没有其他可用账号 → 停止换号`);
        return false;
      }
      const Te = ($t = (Ce.accounts || []).find(mt => {
        return mt.id === Q;
      })) == null ? undefined : $t.type;
      const Ue = [...fe.filter(mt => {
        return Te && mt.type === Te;
      }), ...fe.filter(mt => {
        return !Te || mt.type !== Te;
      })];
      Ce.setNodeSwitch(me, {
        state: 'switching',
        fromName: de(Q),
        toName: Ue[0].name,
        reason: Fe
      });
      console.log(`[switch] 账号=${Q} 命中「${Fe}」→ 候选 ${Ue.map(mt => {
        return mt.name || mt.id;
      }).join('、')}`);
      let Ye = null;
      let Pe = null;
      let rt = null;
      const ot = [];
      for (const mt of Ue) {
        const yt = await ie(mt.id);
        if (yt && yt.webview) {
          Ye = yt.webview;
          rt = yt.leaseId;
          Pe = mt;
          break;
        }
        ot.push(mt.name || mt.id);
      }
      if (!Pe || !Ye) {
        Ce.setNodeSwitch(me, {
          state: 'failed',
          fromName: de(Q),
          reason: `其他账号后台未加载且自动加载失败（${ot.join('、')}）`
        });
        console.log(`[switch] ${W}，但没有能加载后台页面的账号（跳过：${ot.join('、')}）→ 停止换号`);
        return false;
      }
      Ce.setNodeSwitch(me, {
        state: 'switching',
        fromName: de(Q),
        toName: Pe.name,
        reason: Fe
      });
      console.log(`[switch] → 切换到 ${Pe.name}(${Pe.id}) 重发`);
      let ht = null;
      let bt = false;
      try {
        bt = await Mt(Ye, Pe.type, Y);
        if (bt) {
          console.log(`[switch] Dola 30s 强开就绪 账号=${Pe.id}`);
        }
      } catch {}
      try {
        ht = await Be(Ye, Pe.id, Y);
      } catch (mt) {
        ht = {
          ok: false,
          note: (mt == null ? undefined : mt.message) || String(mt)
        };
      } finally {
        if (bt) {
          zt(Ye);
        }
      }
      if (!ht || !ht.ok) {
        if (rt) {
          rn(rt, 'switch-resend-failed');
        }
        Ce.setNodeSwitch(me, {
          state: 'failed',
          fromName: de(Q),
          toName: Pe.name,
          reason: ht && (ht.note || ht.reason) || '重发失败'
        });
        console.log(`[switch] 重发到 ${Pe.name} 失败：${ht && (ht.note || ht.reason) || '?'} → 停止换号`);
        return false;
      }
      Ce.setLastSentAccount(Pe.id);
      try {
        L.getState().markAccountBusy(Pe.id);
      } catch {}
      if (ve.runtimeLeaseId) {
        rn(ve.runtimeLeaseId, 'quota-switched');
      }
      Ce.setNodeSwitch(me, {
        state: 'done',
        fromName: de(Q),
        toName: Pe.name,
        reason: Fe
      });
      console.log(`[switch] 已切换到 ${Pe.name} 并重发成功 → 继续监测新账号的回复`);
      await gt(Ye, Pe.id, me, {
        tried: T,
        maxSwitches: K - 1,
        payload: Y,
        runtimeLeaseId: rt
      });
      return true;
    };
    const ye = async Fe => {
      const W = await we(Fe);
      if (!W || !W.counts) {
        return false;
      }
      const Ce = Object.keys(W.counts);
      if (!Ce.length) {
        return false;
      }
      if ((W.counts['quota-exhausted'] || 0) > (lt['quota-exhausted'] || 0) && !xe && me) {
        G.add('quota-exhausted');
        L.getState().setNodeNotice(me, {
          level: 'warn',
          code: 'quota-exhausted',
          title: '今日免费次数用尽',
          text: W.samples['quota-exhausted'] || '今日视频生成免费次数用完了'
        });
        return await be(W.samples['quota-exhausted'] || '今日视频生成免费次数用完了', '额度用尽');
      }
      const Te = {
        error: 3,
        warn: 2,
        info: 1
      };
      let Ue = null;
      for (const Ye of Ce) {
        if (Ye === 'quota-exhausted' || G.has(Ye) || (W.counts[Ye] || 0) <= (lt[Ye] || 0)) {
          continue;
        }
        G.add(Ye);
        const Pe = Qh.find(rt => {
          return rt.code === Ye;
        });
        if (Pe && (!Ue || (Te[Pe.level] || 0) > (Te[Ue.rule.level] || 0))) {
          Ue = {
            rule: Pe,
            sample: W.samples[Ye]
          };
        }
      }
      if (Ue && me) {
        L.getState().setNodeNotice(me, {
          level: Ue.rule.level,
          code: Ue.rule.code,
          title: Ue.rule.title,
          text: (Ue.sample || '').trim() || Ue.rule.title
        });
        console.log(`[notice] 节点=${me} 命中回复提示「${Ue.rule.title}」：${Ue.sample || ''}`);
      }
      return false;
    };
    const Ne = async Fe => {
      if (Me) {
        return false;
      }
      const W = await Se(Fe);
      Me = true;
      if (!W || !W.hit || W.lowCount <= dt || !me) {
        return false;
      }
      const Ce = L.getState();
      let fe = '本次创作额度消耗较多，额度不足。';
      if (W.reason === 'consume' && W.consume != null) {
        fe = `本次创作消耗了 ${W.consume} 额度（≥ 阈值 ${yk}），额度已所剩不多。`;
      } else if (W.reason === 'remain' && W.remain != null) {
        fe = `剩余额度仅 ${W.remain}（≤ 阈值 ${vk}），额度不足。`;
      } else if (W.reason === 'explicit') {
        fe = `检测到「${W.sample}」，本次创作额度不足。`;
      }
      Ce.setNodeNotice(me, {
        level: 'warn',
        code: 'quota-low',
        title: '额度不足',
        text: fe
      });
      console.log(`[quota-usage] 节点=${me} 命中额度预警（${W.reason}，次数 ${W.lowCount} > 基线 ${dt}）：${fe} → 自动换号重发`);
      return await be(fe, '额度不足');
    };
    const $e = Date.now();
    let at = 0;
    for (console.log(`[watchSendReply] 账号=${Q} 开始后台监测（窗口 ${Math.round(180)}s · 每 ${2}s 轮询 · 节点=${me || '无'}）`); Date.now() - $e < 180000;) {
      await new Promise(Ce => {
        return setTimeout(Ce, 2000);
      });
      at += 1;
      const Fe = te(Q);
      if (Fe && Fe !== nt) {
        console.log(`[watchSendReply] 账号=${Q} webview 引用已更新 → 沿用新引用继续监测`);
        nt = Fe;
      }
      const W = await ae('detect-gen-ack');
      await $('detect-wait-time');
      if (await Ne('detect-quota-usage')) {
        return _e({
          ok: true,
          switched: true
        });
      }
      if (await ye('detect-reply-notice')) {
        return _e({
          ok: true,
          switched: true
        });
      }
      if (at % 15 === 0) {
        console.log(`[watchSendReply] 账号=${Q} 后台监测中…（已 ${Math.round((Date.now() - $e) / 1000)}s，未命中回复）`);
      }
      Le = Wd[Q] || 0;
      Ge = Math.max(Ge, Le);
      if (!!W && W.count > Ge) {
        Wd[Q] = W.count;
        console.log(`[watchSendReply] 账号=${Q} 探测到「${W.text || '视频生成好后，我会主动发送给你'}」→ 本次发送已生效（节点=${me || '无'}）`);
        if (!Re && me) {
          const Ce = Date.now();
          await new Promise(fe => {
            return setTimeout(fe, 2000);
          });
          while (Date.now() - Ce < 30000 && !(await $('detect-wait-time-catchup'))) {}
        }
        if (me) {
          Nt(nt, Q, me, {
            mediaType: 'video',
            ackedAt: Date.now()
          });
        }
        return _e({
          ok: true,
          acked: true,
          text: W.text
        });
      }
    }
    console.log(`[watchSendReply] 账号=${Q} 3 分钟内未探测到「已接单」回复（共 ${at} 次轮询，节点=${me || '无'}）`);
    return _e({
      ok: true,
      acked: false
    });
  }, [ze, Be, te, A, Nt]);
  g.useImperativeHandle(r, () => {
    return {
      sendPayload: async (ee, Q, me) => {
        var dt;
        var G;
        var xe;
        var Me;
        var Re;
        const ve = ee || o;
        const qe = L.getState().accounts.find($ => {
          return $.id === ve;
        });
        const tt = (qe == null ? undefined : qe.type) === 'dola';
        const Ae = (qe == null ? undefined : qe.type) === 'doubao';
        const nt = tt || Ae;
        if ((qe == null ? undefined : qe.type) === 'lovart') {
          return {
            ok: false,
            reason: 'unsupported',
            note: 'Lovart 账号暂不支持自动发送，请在后台页面手动操作'
          };
        }
        if (v.current.has(ve)) {
          return {
            ok: false,
            reason: 'busy',
            note: '该账号正在发送中，请稍候'
          };
        }
        const _e = await vr(ve, {
          jobId: me || `send:${Date.now()}`,
          purpose: 'generation',
          timeoutMs: 30000
        });
        if (!_e.ok) {
          return {
            ok: false,
            reason: _e.reason || 'runtime-load-failed',
            note: _e.note || `账号 ${ve} 的后台页面加载失败`
          };
        }
        const Z = _e.leaseId;
        const T = _e.webview || te(ve);
        if (!T) {
          rn(Z, 'webview-missing');
          return {
            ok: false,
            reason: 'no-webview',
            note: `账号 ${ve} 的后台视图未初始化`
          };
        }
        const K = A(ve);
        await new Promise($ => {
          requestAnimationFrame(() => {
            return requestAnimationFrame($);
          });
          setTimeout($, 300);
        });
        try {
          await T.executeJavaScript(`
          (function(){
            window.dispatchEvent(new Event('resize'));
            // 触发一次滚动唤醒可能的虚拟列表/懒加载组件
            var sc = document.scrollingElement || document.documentElement;
            if(sc){ sc.scrollTop += 1; sc.scrollTop -= 1; }
            return true;
          })()
        `);
        } catch {}
        const Y = '!!(document && document.body && document.body.innerHTML)';
        const de = 20000;
        const ae = Date.now();
        let we = u.current.get(ve) || false;
        if (!we) {
          let $ = false;
          while (Date.now() - ae < de) {
            try {
              if (await T.executeJavaScript(Y)) {
                we = true;
                u.current.set(ve, true);
                break;
              }
            } catch {}
            if (!$ && Date.now() - ae > 6000) {
              $ = true;
              try {
                T.reload();
              } catch {}
            }
            await new Promise(ie => {
              return setTimeout(ie, 500);
            });
          }
        }
        if (we) {
          try {
            await T.executeJavaScript("window.dispatchEvent(new Event('resize'))");
          } catch {}
          await new Promise($ => {
            return setTimeout($, 1500);
          });
        }
        if (!we) {
          K();
          rn(Z, 'page-not-ready');
          return {
            ok: false,
            reason: 'not-ready',
            note: `账号 ${ve} 的后台页面加载超时（20s），系统将按原队列策略重试`
          };
        }
        if (ve !== o) {
          a(ve);
        }
        try {
          await ze(T, zu, 'install-input-lock');
        } catch {}
        await ut(T, 'block');
        const Se = () => {
          try {
            if (T && T.style) {
              T.style.pointerEvents = '';
            }
          } catch {}
          ut(T, 'unlock');
        };
        try {
          if (T && T.style) {
            T.style.pointerEvents = 'none';
          }
        } catch {}
        let ge = null;
        let Le = false;
        try {
          Le = await Mt(T, qe == null ? undefined : qe.type, Q);
          if (Le) {
            const $ = Q && (Q.genParams || Q.params) || {};
            console.log(`[sendPayload] Dola 30s 强开就绪 账号=${ve} duration=${Number($.duration) || 0} model=seedance_v2.5`);
          }
        } catch {}
        const Ge = Q != null && !!Q.autoSend && (Q == null || !Q.imageParams) && (Array.isArray(Q == null ? undefined : Q.images) && Q.images.length > 0 || (dt = Q == null ? undefined : Q.genParams) != null && !!dt.model || (G = Q == null ? undefined : Q.genParams) != null && !!G.duration || (xe = Q == null ? undefined : Q.params) != null && !!xe.model || (Me = Q == null ? undefined : Q.params) != null && !!Me.duration || /视频生成|duration\s*=/i.test((Q == null ? undefined : Q.text) || ''));
        let He = null;
        let lt = null;
        let st = '';
        if (Ge) {
          try {
            st = ((Re = T.getURL) == null ? undefined : Re.call(T)) || '';
          } catch {}
          for (let $ = 0; $ < 2; $++) {
            if ($ > 0) {
              await new Promise(ye => {
                return setTimeout(ye, 800);
              });
              console.log(`[sendPayload] 账号=${ve} 基线获取重试第 ${$} 次…`);
            }
            He = await ze(T, A0, 'detect-gen-confirm-base');
            lt = await ze(T, Hd, 'detect-gen-submit-base');
            const ie = He && !He._execError && typeof He.count == 'number';
            const be = lt && !lt._execError && typeof lt.count == 'number';
            if (ie && be) {
              break;
            }
          }
          console.log(`[sendPayload] 账号=${ve} 基线获取结果 confirmBase=${(He == null ? undefined : He.count) ?? '?'}/${He != null && He._execError ? 'ERR' : 'ok'} submitBase=${(lt == null ? undefined : lt.count) ?? '?'}/${lt != null && lt._execError ? 'ERR' : 'ok'}`);
        }
        try {
          ge = await Be(T, ve, Q);
          if (ge && ge.ok && me) {
            const $ = L.getState().accounts.find(W => {
              return W.id === ve;
            });
            const ie = $ ? $.name : tt ? 'dola' : '豆包';
            let be = N0(T.getURL && T.getURL());
            if (!be) {
              const W = Date.now();
              await new Promise(Ce => {
                return setTimeout(Ce, 600);
              });
              be = N0(T.getURL && T.getURL());
              while (Date.now() - W < 4000 && !be) {}
            }
            const ye = Q && Q.params;
            const Ne = (L.getState().nodes.find(W => {
              return W.id === me;
            }) || {}).data || {};
            const $e = {
              text: Ne.text || '',
              aspectRatio: Ne.aspectRatio || null,
              duration: Ne.duration || null,
              model: Ne.model || null,
              sendAccount: Ne.sendAccount || null,
              styleIds: Array.isArray(Ne.styleIds) ? [...Ne.styleIds] : []
            };
            const at = Fc({
              accountId: ve,
              accountName: ie,
              params: ye ? {
                model: ye.model,
                duration: ye.duration,
                ratio: ye.aspectRatio
              } : null,
              prompt: (Q && Q.text ? String(Q.text) : '').slice(0, 2000),
              edit: $e,
              conversationId: be,
              status: 'pending'
            });
            const Fe = (L.getState().nodes.find(W => {
              return W.id === me;
            }) || {}).data || {};
            L.getState().updateNodeData(me, {
              _pendingAttempt: at,
              _pendingAttempts: {
                ...(Fe._pendingAttempts || {}),
                [ve]: at
              }
            });
          }
          return ge;
        } finally {
          Se();
          if (Le) {
            zt(T);
          }
          if (ge && !ge.ok && me) {
            const ie = L.getState().accounts.find(Ne => {
              return Ne.id === ve;
            });
            const be = Fc({
              accountId: ve,
              accountName: ie ? ie.name : tt ? 'dola' : '豆包',
              prompt: (Q && Q.text ? String(Q.text) : '').slice(0, 2000),
              status: 'failed',
              note: ge.note || ge.reason || ''
            });
            const ye = (L.getState().nodes.find(Ne => {
              return Ne.id === me;
            }) || {}).data || {};
            L.getState().updateNodeData(me, {
              _pendingAttempt: be,
              _pendingAttempts: {
                ...(ye._pendingAttempts || {}),
                [ve]: be
              }
            });
          }
          if (ge && ge.ok && !nt && L.getState().autoVideoDetect) {
            const ie = k.current.get(ve) || [];
            if (me) {
              ie.push({
                nodeId: me,
                sendTime: Date.now()
              });
            }
            if (ie.length > 0) {
              k.current.set(ve, ie);
            }
            console.log(`[sendPayload] 发送成功 账号=${ve}${me ? ` 节点=${me}` : ''} autoVideoDetect=${L.getState().autoVideoDetect} → 启动发送后检测`);
            it(ve, me || null);
          } else if (ge && ge.ok && nt) {
            const ie = L.getState().accounts.find(ye => {
              return ye.id === ve;
            });
            const be = (ie == null ? undefined : ie.name) || (tt ? 'dola' : '豆包');
            if (me) {
              const ye = C.current.get(ve) || [];
              ye.push({
                nodeId: me,
                accountId: ve,
                accountName: be,
                sentAt: Date.now(),
                satisfied: false
              });
              C.current.set(ve, ye);
              if (ye.length > 20) {
                ye.shift();
              }
              console.log(`[sendPayload] ${tt ? 'dola' : 'doubao'} 发送成功 账号=${ve} 节点=${me} → 已入 CDP 待归属队列（该账号当前 ${ye.length} 条）`);
            } else {
              console.log(`[sendPayload] ${tt ? 'dola' : 'doubao'} 发送成功 账号=${ve}（无 sourceNodeId，跳过 CDP 队列）`);
            }
          } else if (ge && !ge.ok) {
            console.log(`[sendPayload] 发送未成功 (${ge.reason || '?'})，不触发自动检测`);
          } else if (ge && ge.ok) {
            console.log(`[sendPayload] 发送成功但 autoVideoDetect=${L.getState().autoVideoDetect}，不触发自动检测`);
          }
          const $ = ge && ge.ok && ge.autoClicked && Ge;
          console.log(`[sendPayload] 自动确认判定 账号=${ve} shouldAutoConfirm=${$} ok=${ge == null ? undefined : ge.ok} autoClicked=${ge == null ? undefined : ge.autoClicked} wantsVideoConfirm=${Ge}`);
          if ($) {
            const ie = He && !He._execError && typeof He.count == 'number';
            const be = lt && !lt._execError && typeof lt.count == 'number';
            if (!ie || !be) {
              console.warn(`[autoConfirm] 账号=${ve} 发送前未取得有效回复基线（confirmBaseOk=${ie} submitBaseOk=${be}）→ 暂停自动确认，避免误发`);
              if (me) {
                L.getState().setNodeNotice(me, {
                  level: 'warn',
                  code: 'generation-confirm',
                  title: '后台等待生成确认',
                  text: '无法建立后台回复基线，请打开账号页面检查是否需要手动确认。'
                });
              }
            } else {
              console.log(`[sendPayload] 自动发送成功 账号=${ve} → 监测本轮生成确认（基线=${He.count}，租约=${Z}）`);
              kt(T, ve, me || null, {
                baselineCount: He.count,
                submitBaselineCount: lt.count,
                beforeUrl: st,
                ownText: Q.text || '',
                runtimeLeaseId: Z
              });
            }
          }
          if (ge && ge.ok) {
            gt(T, ve, me || null, {
              payload: Q,
              runtimeLeaseId: Z
            });
          } else {
            rn(Z, 'send-failed');
          }
          K();
        }
      },
      isReady: async ee => {
        const Q = ee || o;
        if (u.current.get(Q)) {
          return true;
        }
        const me = te(Q);
        if (!me) {
          return false;
        }
        try {
          const ve = await me.executeJavaScript('!!document.body');
          if (ve) {
            u.current.set(Q, true);
          }
          return ve;
        } catch {
          return false;
        }
      },
      runParamScript: wt,
      handleAutoSet: At,
      handleTest: _t,
      fetchWatermarkFree: ee => {
        return xt(ee, o);
      },
      resolveThreadAndFetch: async ee => {
        const Q = (ee || '').replace(/.*\/thread\//, '').replace(/\?.*/, '').trim();
        if (!Q) {
          return {
            ok: false,
            error: 'invalid-thread-input'
          };
        }
        const me = o;
        const ve = await vr(me, {
          jobId: `resolve-thread:${Q}`,
          purpose: 'result-pull',
          timeoutMs: 30000
        });
        if (!ve.ok) {
          return {
            ok: false,
            error: ve.reason,
            note: ve.note
          };
        }
        const qe = ve.webview || te(me);
        if (!qe) {
          rn(ve.leaseId, 'thread-pull-no-webview');
          return {
            ok: false,
            error: 'no-webview',
            note: `账号 ${me} 的后台视图未初始化`
          };
        }
        const tt = '!!(document && document.body && document.body.innerHTML)';
        let Ae = u.current.get(me) || false;
        if (!Ae) {
          const _e = Date.now();
          while (Date.now() - _e < 15000) {
            try {
              if (await qe.executeJavaScript(tt)) {
                Ae = true;
                u.current.set(me, true);
                break;
              }
            } catch {}
            await new Promise(Z => {
              return setTimeout(Z, 500);
            });
          }
        }
        if (!Ae) {
          rn(ve.leaseId, 'thread-pull-not-ready');
          return {
            ok: false,
            error: 'webview-not-ready',
            note: '豆包后台页面加载超时'
          };
        }
        let nt = false;
        try {
          const _e = qe.getURL && qe.getURL() || '';
          if (!/\/samantha\/aispace/.test(_e)) {
            nt = await es(qe, Bd);
            await new Promise(T => {
              return setTimeout(T, 1500);
            });
          }
          return (await qe.executeJavaScript(`(${gD})('${Q}')`)) || {
            ok: false,
            error: 'empty-response'
          };
        } catch (_e) {
          return {
            ok: false,
            error: (_e == null ? undefined : _e.message) || String(_e)
          };
        } finally {
          if (nt) {
            es(qe, La);
          }
          rn(ve.leaseId, 'thread-pull-finished');
        }
      },
      pullResult: async ee => {
        const Q = L.getState();
        const me = (Q.nodes || []).find(qe => {
          return qe.id === ee;
        });
        if (!me) {
          return {
            ok: false,
            reason: 'no-node'
          };
        }
        const ve = xk(me);
        if (!ve) {
          return {
            ok: false,
            reason: 'no-attempt'
          };
        }
        if (ve.vid) {
          const qe = ve.accountId || o;
          const tt = await xt(ve.vid, qe);
          if (tt && tt.ok && tt.url) {
            Q.updateNodeData(ee, {
              url: tt.url,
              width: tt.width ?? undefined,
              height: tt.height ?? undefined,
              duration: tt.duration ?? undefined,
              poster: tt.poster ?? undefined
            });
            Q.patchVideoAttempt(ee, ve.id, {
              status: 'success',
              url: tt.url,
              vid: ve.vid
            });
            try {
              Q.localizeNodeVideos(ee);
            } catch {}
            return {
              ok: true,
              url: tt.url
            };
          }
          return {
            ok: false,
            reason: 'fetch-failed',
            error: tt && tt.error,
            note: tt && tt.note
          };
        }
        if (ve.conversationId) {
          const qe = ve.accountId || o;
          const tt = await vr(qe, {
            jobId: `pull-result:${ee}`,
            purpose: 'result-recovery',
            timeoutMs: 30000
          });
          if (!tt.ok) {
            return {
              ok: false,
              reason: tt.reason,
              note: tt.note
            };
          }
          const Ae = tt.webview || te(qe);
          if (!Ae) {
            rn(tt.leaseId, 'result-recovery-no-webview');
            return {
              ok: false,
              reason: 'no-webview'
            };
          }
          const nt = k.current.get(qe) || [];
          nt.push({
            nodeId: ee,
            sendTime: ve && ve.at || Date.now(),
            pull: true
          });
          k.current.set(qe, nt);
          try {
            await es(Ae, `https://www.doubao.com/chat/${ve.conversationId}`);
          } catch {}
          it(qe, ee);
          return {
            ok: true,
            started: true,
            note: '已回到会话并启动检测'
          };
        }
        return {
          ok: false,
          reason: 'nothing-to-pull'
        };
      }
    };
  }, [o, a, te, Be, wt, At, _t, u, it, kt, gt, xt]);
  const Ke = s.find(ee => {
    return ee.id === o;
  }) || s[0];
  const Ct = `doubao-view${t ? ' dv-visible' : ' dv-hidden'}${!t && (R.length > 0 || d.length > 0) ? ' dv-send-overlay' : ''}`;
  return <div className={Ct}>
      {t && <div className={`dv-head-wrap${se ? ' collapsed' : ''}`}>
          <div className="dv-head-clip" style={pe ? {
        height: se ? 0 : pe
      } : undefined}>
            <div className="doubao-view-head" ref={V}>
              <div className="dv-title">
                {(Ke == null ? undefined : Ke.type) === 'lovart' ? 'Lovart 后台' : (Ke == null ? undefined : Ke.type) === 'dola' ? 'dola 对话后台' : (Ke == null ? undefined : Ke.type) === 'tapnow' ? 'Tapnow 后台' : (Ke == null ? undefined : Ke.type) === 'other' ? '自定义网站' : '豆包对话后台'}{' '}
                · {(Ke == null ? undefined : Ke.name) || '未选择账号'}
              </div>
              <div className="dv-actions">
                <button className="btn sm" onClick={() => {
              if ((Ke == null ? undefined : Ke.autoStart) !== true) {
                return;
              }
              const ee = te(o);
              if (ee) {
                ee.reload();
              }
            }} disabled={(Ke == null ? undefined : Ke.autoStart) !== true}>
                  刷新
                </button>
                <button className="btn sm" onClick={() => {
              var ee;
              var Q;
              if ((Q = (ee = window.api) == null ? undefined : ee.openExternal) != null) {
                Q.call(ee, (Ke == null ? undefined : Ke.type) === 'lovart' ? _p : (Ke == null ? undefined : Ke.type) === 'dola' ? nS : (Ke == null ? undefined : Ke.type) === 'tapnow' ? rS : (Ke == null ? undefined : Ke.type) === 'gpt' ? sS : (Ke == null ? undefined : Ke.type) === 'other' ? (Ke == null ? undefined : Ke.url) || 'about:blank' : La);
              }
            }}>
                  浏览器打开
                </button>
                {(Ke == null ? undefined : Ke.type) === 'dola' || (Ke == null ? undefined : Ke.type) === 'doubao' ? <button className="btn sm" onClick={() => {
              return Ie(ee => {
                return !ee;
              });
            }}>
                    无水印资源{he ? '' : `（${ce.length}）`}
                  </button> : null}
                <button className="btn sm primary" onClick={n}>
                  返回画布
                </button>
              </div>
            </div>
          </div>
          <button type="button" className="dv-head-toggle" title={se ? '展开顶部工具栏' : '收起顶部工具栏'} aria-label={se ? '展开顶部工具栏' : '收起顶部工具栏'} aria-expanded={!se} onClick={q}>
            {se ? '∨' : '∧'}
          </button>
        </div>}
      <div className="doubao-view-webviews" ref={w}>
        {h.map(ee => {
        return <_cmp__Component25 account={ee} isActive={t && ee.id === o && ee.autoStart === true} isForced={(R.includes(ee.id) || d.includes(ee.id)) && (!t || ee.id !== o || ee.autoStart !== true)} headCollapsed={se} onDomReady={X} onLoadFailed={re} onUnmount={Ee} key={ee.id} />;
      })}
        {c.length > 0 && Ke && Ke.autoStart !== true && (() => {
        const ee = UT(Ke.id);
        return <div className={`silent-overlay${ee ? ' has-snap' : ''}`}>
                {ee ? <img className="silent-snap" src={ee} alt="" draggable={false} /> : null}
                <div className="silent-mask" />
                <div className="silent-center">
                  <button type="button" className="silent-resume-btn" title="恢复该账号页面" aria-label="恢复该账号页面" onClick={() => {
              return Ve(Ke.id);
            }}>
                    <span className="silent-pause-icon" aria-hidden="true">
                      <i />
                      <i />
                    </span>
                  </button>
                  <div className="silent-tip">
                    「{Ke.name}」处于静默状态 · 页面已暂停（不占用内存 / CPU），点击上方按钮恢复
                  </div>
                </div>
              </div>;
      })()}
      </div>
      {c.length === 0 && <div className="doubao-empty-hint">请先在左侧添加并登录账号</div>}
      {t && c.length > 0 && (Ke == null ? undefined : Ke.type) !== 'lovart' && <_cmp_SD items={ce} open={he && ((Ke == null ? undefined : Ke.type) === 'dola' || (Ke == null ? undefined : Ke.type) === 'doubao')} onClose={() => {
      return Ie(false);
    }} />}
      {t && c.length > 0 && ((Ke == null ? undefined : Ke.type) === 'lovart' || (Ke == null ? undefined : Ke.type) === 'tapnow' || (Ke == null ? undefined : Ke.type) === 'other') && <_cmp__Component26 account={Ke} active={t} />}
    </div>;
});
export default _Component43;