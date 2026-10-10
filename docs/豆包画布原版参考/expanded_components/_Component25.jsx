// TODO(全局, 无需 import): account, isActive, isForced, onDomReady, onLoadFailed, onUnmount, headCollapsed, l, A, u, e, status, P, I, F, M, p, t, y, m, v, b, partition, proxy, k, fingerprint, U, c, f, se, r, _, H, ke, V, ne, pe, q, ce, he, oe, J, s, o, C, error, message, accountId, url, alreadyOpen, E, x, n, visibility, a, height, j, N, z, O, S, R, d, w, h
import { id, c0, _p, L, I0, xD, nS, rS, sS, La } from './shared.js';
import * as g from 'react';
import * as i from 'react';
export default function _Component25({
  account: e,
  isActive: t,
  isForced: n,
  onDomReady: r,
  onLoadFailed: s,
  onUnmount: o,
  headCollapsed: a
}) {
  const l = g.useRef(null);
  const [c, u] = g.useState(null);
  const d = g.useCallback(A => {
    l.current = A;
    u(A);
  }, []);
  const f = g.useRef(false);
  const p = e.type === 'lovart';
  const [h, m] = g.useState(null);
  const [w, v] = g.useState(null);
  const [y, b] = g.useState(false);
  const [x, k] = g.useState(null);
  const [N, C] = g.useState({
    status: 'idle'
  });
  const [S, E] = g.useState(null);
  const P = g.useRef(null);
  const [j, I] = g.useState(0);
  g.useEffect(() => {
    const A = P.current;
    if (!A) {
      return;
    }
    const F = () => {
      return I(A.offsetHeight);
    };
    F();
    if (typeof ResizeObserver === 'undefined') {
      return;
    }
    const M = new ResizeObserver(F);
    M.observe(A);
    return () => {
      return M.disconnect();
    };
  }, [p, t, y]);
  g.useEffect(() => {
    let A = false;
    m(null);
    v(null);
    b(false);
    if (p) {
      window.api.ensureLovartContainer({
        id: e.id,
        partition: e.partition,
        proxy: e.proxy || ''
      }).then(F => {
        if (!A) {
          if (F && F.ok) {
            v(F.userAgent);
            m(F.preloadUrl || null);
          }
          k(e.fingerprint);
          b(true);
        }
      }).catch(() => {
        if (!A) {
          k(e.fingerprint);
          b(true);
        }
      });
    } else if (e.fingerprint) {
      window.api.ensureFingerprint({
        id: e.id,
        partition: e.partition,
        fingerprint: e.fingerprint
      }).then(F => {
        var M;
        if (!A) {
          if (F && F.ok) {
            m(F.preloadUrl);
            try {
              const U = e.fingerprint;
              console.log(`[fingerprint] 已为账号 ${e.id} 写入 preload：hostOS=${U.hostOS} platform=${U.platform} chrome=${(M = String(U.userAgent).match(/Chrome\/(\d+)/)) == null ? undefined : M[1]} webgl=${U.webgl && U.webgl.renderer}`);
            } catch {}
          }
          k(e.fingerprint);
          b(true);
        }
      }).catch(() => {
        if (!A) {
          k(e.fingerprint);
          b(true);
        }
      });
    } else {
      b(true);
    }
    return () => {
      A = true;
    };
  }, [e.id, e.fingerprint, e.partition, e.proxy, p]);
  g.useLayoutEffect(() => {
    const A = c;
    if (!A) {
      return;
    }
    const F = () => {
      var se;
      var ke;
      var V;
      var pe;
      var ne;
      f.current = true;
      let _ = null;
      try {
        _ = ((se = A.getWebContentsId) == null ? undefined : se.call(A)) || null;
      } catch {}
      if (r) {
        r(e.id, _);
      }
      if (!p) {
        try {
          A.executeJavaScript(c0);
        } catch {}
      }
      let H = '';
      try {
        H = A.getURL() || '';
      } catch {}
      if ((e.type === 'dola' || e.type === 'doubao' || /(^|\.)dola\.com|(^|\.)doubao\.com/i.test(H)) && _) {
        try {
          if ((ne = (V = (ke = window.api) == null ? undefined : ke.attachDolaDebugger) == null ? undefined : (pe = V.call(ke, _)).catch) != null) {
            ne.call(pe, () => {});
          }
          setTimeout(() => {
            var q;
            var ce;
            var oe;
            var he;
            if ((he = (ce = (q = window.api) == null ? undefined : q.injectDolaDurationMain) == null ? undefined : (oe = ce.call(q, _)).catch) != null) {
              he.call(oe, () => {});
            }
          }, 600);
        } catch {}
      }
    };
    const M = () => {
      var _;
      var H;
      var J;
      var se;
      if (!p) {
        try {
          A.executeJavaScript(c0);
        } catch {}
      }
      try {
        let ke = '';
        try {
          ke = A.getURL() || '';
        } catch {}
        if ((e.type === 'dola' || e.type === 'doubao' || /(^|\.)dola\.com|(^|\.)doubao\.com/i.test(ke)) && typeof A.getWebContentsId == 'function') {
          const pe = A.getWebContentsId();
          if (pe) {
            if ((se = (H = (_ = window.api) == null ? undefined : _.injectDolaDurationMain) == null ? undefined : (J = H.call(_, pe)).catch) != null) {
              se.call(J, () => {});
            }
          }
        }
      } catch {}
    };
    const U = _ => {
      if (_ && Number(_.errorCode) === -3) {
        return;
      }
      const H = _ && (_.errorDescription || _.validatedURL) || '后台页面加载失败';
      f.current = false;
      if (s) {
        s(e.id, H);
      }
    };
    A.addEventListener('dom-ready', F);
    A.addEventListener('did-navigate', M);
    A.addEventListener('did-fail-load', U);
    return () => {
      A.removeEventListener('dom-ready', F);
      A.removeEventListener('did-navigate', M);
      A.removeEventListener('did-fail-load', U);
      if (l.current !== A || !A.isConnected) {
        f.current = false;
        if (o) {
          o(e.id);
        }
      }
    };
  }, [c, e.id, e.type, p, r, s, o]);
  const z = g.useCallback(async () => {
    var A;
    C({
      status: 'opening'
    });
    try {
      if ((A = window.api) == null || !A.ensureLovartChrome) {
        C({
          status: 'error',
          error: 'no-api',
          message: '当前环境不支持真实 Chrome 集成（IPC 未就绪）'
        });
        return;
      }
      const F = await window.api.ensureLovartChrome({
        accountId: e.id,
        url: _p,
        proxy: e.proxy || ''
      });
      if (!F) {
        C({
          status: 'error',
          error: 'empty-result',
          message: '主进程未返回结果'
        });
        return;
      }
      if (F.ok) {
        C({
          status: 'open',
          alreadyOpen: !!F.alreadyOpen
        });
      } else {
        C({
          status: 'error',
          error: F.error || 'unknown',
          message: F.message || ''
        });
      }
    } catch (F) {
      C({
        status: 'error',
        error: 'exception',
        message: F && F.message || String(F)
      });
    }
  }, [e.id, e.proxy]);
  const O = g.useCallback(async () => {
    var A;
    var F;
    var M;
    var U;
    E({
      status: 'syncing'
    });
    try {
      if ((A = window.api) == null || !A.syncLovartSession) {
        E({
          status: 'error',
          message: 'IPC 未就绪，请重启应用'
        });
        return;
      }
      const _ = await window.api.syncLovartSession({
        accountId: e.id,
        partition: e.partition || 'persist:lovart'
      });
      if (!_) {
        E({
          status: 'error',
          message: '主进程未返回结果'
        });
        return;
      }
      if (_.ok) {
        E(null);
        try {
          if ((M = (F = L.getState()).showToast) != null) {
            M.call(F, `已同步 ${_.count || 0}/${_.total || 0} 个 cookie，画布内窗口已刷新`, 'success');
          }
        } catch {}
        try {
          if ((U = l.current) != null) {
            U.reload();
          }
        } catch {}
      } else {
        E({
          status: 'error',
          message: _.message || _.error || '同步失败'
        });
      }
    } catch (_) {
      E({
        status: 'error',
        message: _ && _.message || String(_)
      });
    }
  }, [e.id, e.partition]);
  const R = g.useCallback(async () => {
    var A;
    var F;
    try {
      await ((F = (A = window.api) == null ? undefined : A.closeLovartChrome) == null ? undefined : F.call(A, {
        accountId: e.id
      }));
    } catch {}
    C({
      status: 'idle'
    });
    E(null);
  }, [e.id]);
  g.useEffect(() => {
    var A;
    var F;
    if (t && r && f.current) {
      let M = null;
      try {
        M = ((F = (A = l.current) == null ? undefined : A.getWebContentsId) == null ? undefined : F.call(A)) || null;
      } catch {}
      r(e.id, M);
    }
  }, [t, e.id, r]);
  const D = !e.fingerprint || x === e.fingerprint;
  if (!y || !D) {
    return <div data-account-id={e.id} className={`doubao-view-webview${I0(t, n)}`} style={{
      visibility: 'hidden'
    }} />;
  } else {
    return <i.Fragment>
        {p && t ? <div className={`lsb-clip${a ? ' collapsed' : ''}`} style={a ? {
        height: 0
      } : j ? {
        height: j
      } : undefined}>
            <div className="lovart-session-bar" ref={P} data-account-id={e.id}>
              <span className="lsb-hint">
                {N.status === 'open' ? N.alreadyOpen ? '真实 Chrome 已开 · 登录后点「同步会话到画布」' : '真实 Chrome 已打开 · 请在里面登录 Lovart' : N.status === 'opening' ? '正在打开真实 Chrome…' : N.status === 'error' ? '打开真实 Chrome 失败' : 'Lovart 未登录 · 请先在真实 Chrome 里登录'}
              </span>
              <div className="lsb-actions">
                <button type="button" className="lsb-btn" onClick={z} disabled={N.status === 'opening' || N.status === 'open'}>
                  在真实 Chrome 登录
                </button>
                <button type="button" className="lsb-btn lsb-primary" onClick={O} disabled={(S == null ? undefined : S.status) === 'syncing'}>
                  {(S == null ? undefined : S.status) === 'syncing' ? '同步中…' : '同步会话到画布'}
                </button>
                <button type="button" className="lsb-btn" onClick={R} disabled={N.status !== 'open'}>
                  关闭 Chrome
                </button>
              </div>
              {(S == null ? undefined : S.status) === 'error' ? <span className="lsb-status lsb-err">同步失败：{S.message}</span> : null}
              {N.status === 'error' ? <span className="lsb-status lsb-err">{xD[N.error] || N.message || '打开失败'}</span> : null}
            </div>
          </div> : null}
        <webview ref={d} data-account-id={e.id} src={e.type === 'lovart' ? _p : e.type === 'dola' ? nS : e.type === 'tapnow' ? rS : e.type === 'gpt' ? sS : e.type === 'other' ? e.url || 'about:blank' : La} partition={e.partition || (e.type === 'lovart' ? 'persist:lovart' : e.type === 'dola' ? 'persist:dola' : e.type === 'tapnow' ? 'persist:tapnow' : e.type === 'gpt' ? 'persist:gpt' : e.type === 'other' ? 'persist:other' : 'persist:doubao')} useragent={p ? w || undefined : e.fingerprint ? e.fingerprint.userAgent : undefined} preload={h || undefined} webpreferences={p ? 'nodeIntegration=0,contextIsolation=1,enableRemoteModule=0,allowRunningInsecureContent=0,webSecurity=1' : undefined} allowpopups="true" className={`doubao-view-webview${I0(t, n)}`} key={`wv-${e.id}-${e.fpSalt ?? 0}`} />
      </i.Fragment>;
  }
}