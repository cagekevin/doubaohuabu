// TODO(全局, 无需 import): onClose, type, t, o, s, a, l, c, u, ne, v, E, q, U, _, S, ce, partition, j, containerId, P, proxy, H, oe, N, x, fingerprint, y, n, e, r, p, w, url, status, addedAt, J, I, A, R, se, d, De, he, pe, C, m, h, f, V, k, b, errorCode, errorDescription, validatedURL, M, code, description, F, O, z, ke, D
import { CP, NP, EP, jP, SP, L, zc, id, br } from "./shared.js";
import * as g from 'react';
export default function $P({
  onClose: e,
  type: t = 'doubao'
}) {
  const n = g.useRef(null);
  const r = g.useRef(false);
  const s = t === 'dola';
  const o = t === 'lovart';
  const a = t === 'tapnow';
  const l = t === 'gpt';
  const c = t === 'other';
  const [u, d] = g.useState('');
  const [f, p] = g.useState('');
  const h = o ? CP : s ? NP : a ? EP : l ? jP : c ? u.trim() || 'about:blank' : SP;
  const m = o ? 'Lovart' : s ? 'dola' : a ? 'Tapnow' : l ? 'GPT' : c ? '自定义网站' : '豆包';
  const w = L(ne => {
    return ne.addAccount;
  });
  const [v] = g.useState(() => {
    return `acc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  });
  const [y] = g.useState(() => {
    return zc(`${v}#0`);
  });
  const [b, x] = g.useState(null);
  const [k, N] = g.useState(null);
  const [C, S] = g.useState(false);
  const [E] = g.useState(() => {
    return `d_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  });
  const P = E;
  const j = `persist:${o ? 'lovart' : s ? 'dola' : a ? 'tapnow' : l ? 'gpt' : c ? 'other' : 'doubao'}_${E}`;
  const [I, z] = g.useState('');
  const [O, R] = g.useState(false);
  const [D, A] = g.useState('');
  const [F, M] = g.useState(null);
  const U = L(ne => {
    return ne.proxyPool;
  });
  const _ = L(ne => {
    return ne.accounts.filter(q => {
      return (q.type || 'doubao') === 'lovart';
    }).length;
  });
  const H = o && U && U.length ? U[_ % U.length] : '';
  g.useEffect(() => {
    let ne = false;
    const q = () => {
      if (!ne) {
        S(true);
      }
    };
    if (o) {
      const ce = window.api && window.api.ensureLovartContainer;
      if (ce) {
        ce({
          id: v,
          partition: j,
          containerId: P,
          proxy: H
        }).then(oe => {
          if (!ne && !!oe && !!oe.ok) {
            N(oe.userAgent);
            x(oe.preloadUrl || null);
          }
        }).catch(oe => {
          console.error('[LoginModal] ensureLovartContainer failed:', oe && oe.message || oe);
        }).finally(q);
      } else {
        console.warn('[LoginModal] ensureLovartContainer not available');
        q();
      }
    } else {
      window.api.ensureFingerprint({
        id: v,
        partition: j,
        fingerprint: y
      }).then(ce => {
        if (!ne && ce && ce.ok) {
          x(ce.preloadUrl);
        }
      }).catch(() => {}).finally(q);
    }
    return () => {
      ne = true;
    };
  }, [v, j, y, o]);
  const J = g.useCallback(() => {
    try {
      const ne = n.current;
      if (ne) {
        ne.src = 'about:blank';
      }
    } catch {}
    setTimeout(() => {
      return e();
    }, 1500);
  }, [e]);
  const se = g.useCallback(() => {
    if (!r.current) {
      if (c) {
        const ne = u.trim();
        if (!ne) {
          p('请先输入要打开的网址');
          return;
        }
        r.current = true;
        let q = ne;
        if (!/^https?:\/\//i.test(q)) {
          q = `https://${q}`;
        }
        w({
          id: v,
          type: t,
          partition: j,
          url: q,
          status: '已登录',
          addedAt: Date.now()
        });
        J();
        return;
      }
      r.current = true;
      if (o) {
        w({
          id: v,
          type: t,
          partition: j,
          containerId: P,
          ...(o ? {
            proxy: H
          } : {}),
          status: '已登录',
          addedAt: Date.now()
        });
        J();
        return;
      }
      w({
        id: v,
        type: t,
        partition: j,
        containerId: o ? P : undefined,
        ...(o ? {
          proxy: H
        } : {}),
        fingerprint: y,
        status: '已登录',
        addedAt: Date.now()
      });
      J();
    }
  }, [w, J, j, t, v, y, P, o, c, u]);
  const ke = g.useCallback(() => {
    const ne = n.current;
    let q = I.trim();
    if (!q || !ne) {
      A('请先粘贴验证链接');
      return;
    }
    if (!/^https?:\/\//i.test(q)) {
      q = `https://${q}`;
    }
    R(true);
    A('正在打开验证链接…');
    const ce = () => {
      ne.removeEventListener('did-navigate', ce);
      ne.removeEventListener('did-navigate-in-page', ce);
      setTimeout(() => {
        A('验证通过，已保存登录状态');
        R(false);
        se();
      }, 1500);
    };
    ne.addEventListener('did-navigate', ce);
    ne.addEventListener('did-navigate-in-page', ce);
    try {
      ne.src = q;
    } catch {
      R(false);
      A('打开链接失败');
    }
  }, [I, se]);
  const V = g.useCallback(() => {
    let ne = u.trim();
    if (!ne) {
      p('请先输入要打开的网址');
      return;
    }
    if (!/^https?:\/\//i.test(ne)) {
      ne = `https://${ne}`;
    }
    p('');
    d(ne);
  }, [u]);
  const pe = g.useCallback(async () => {
    if (c) {
      return;
    }
    const ne = n.current;
    if (!ne || !ne.getWebContents) {
      return;
    }
    let q;
    try {
      q = ne.getWebContents();
    } catch {
      return;
    }
    if (!q) {
      return;
    }
    const ce = ne.src || '';
    const oe = /(login|passport|sso|account|auth|oauth)/i.test(ce);
    let he = false;
    try {
      he = (await q.session.cookies.get({})).some(De => {
        return /(session|sid|token|uid|ac_|passport|tt_|user|access_token)/i.test(De.name);
      });
    } catch {}
    if (!oe && he) {
      se();
    }
  }, [se]);
  g.useEffect(() => {
    const ne = n.current;
    if (!ne) {
      return;
    }
    const q = () => {
      return setTimeout(pe, 700);
    };
    const ce = () => {
      return setTimeout(pe, 900);
    };
    ne.addEventListener('did-navigate', q);
    ne.addEventListener('did-navigate-in-page', q);
    ne.addEventListener('dom-ready', ce);
    const oe = setInterval(pe, 2000);
    return () => {
      ne.removeEventListener('did-navigate', q);
      ne.removeEventListener('did-navigate-in-page', q);
      ne.removeEventListener('dom-ready', ce);
      clearInterval(oe);
    };
  }, [pe, C]);
  return <div className="login-backdrop">
      <div className="login-modal">
        <div className="login-head">
          <span className="login-title">{c ? '打开自定义网站' : `登录${m}账号`}</span>
          <div className="login-actions">
            {!a && <button className="btn sm" disabled={c && !u.trim()} onClick={() => {
            var ne;
            return ((ne = window.api) == null ? undefined : ne.openExternal) && window.api.openExternal(c && u.trim() || h);
          }}>
                在浏览器打开
              </button>}
            {!a && <button className="btn primary sm" onClick={se}>
                {c ? '保存' : '完成登录'}
              </button>}
            <button className="btn sm ghost" onClick={e}>
              关闭
            </button>
          </div>
        </div>
        {c && <div className="login-verify-row">
            <input className="login-verify-input" type="text" placeholder="输入网址，如 www.bing.com 或 https://example.com" value={u} onChange={ne => {
          d(ne.target.value);
          if (f) {
            p('');
          }
        }} onKeyDown={ne => {
          if (ne.key === 'Enter') {
            V();
          }
        }} />
            <button className="btn sm primary" onClick={V} disabled={!u.trim()}>
              进入
            </button>
            {f && <span className="login-verify-msg">{f}</span>}
          </div>}
        {C && !F && <webview ref={n} src={h} partition={j} useragent={o ? k || undefined : y ? y.userAgent : undefined} preload={b || undefined} webpreferences={o ? 'nodeIntegration=0,contextIsolation=1,enableRemoteModule=0,allowRunningInsecureContent=0,webSecurity=1' : undefined} allowpopups="true" className="login-webview" onLoadCommit={ne => {
        const {
          errorCode: q,
          errorDescription: ce,
          validatedURL: oe
        } = ne.nativeEvent || {};
        if (q && q !== 0) {
          console.error('[LoginModal] webview load failed:', q, ce, oe);
          M({
            code: q,
            description: ce,
            url: oe
          });
        }
      }} onDomReady={() => {
        M(null);
      }} />}
        {F && <div className="login-load-error">
            <div className="login-load-error-title">页面无法在应用内加载</div>
            <div className="login-load-error-desc">
              错误码 {F.code}：{F.description || '未知错误'}
              <br />
              部分站点会检测 Electron 内嵌视图并阻止渲染。请点击「在浏览器打开」完成登录。
            </div>
            <button className="btn primary" onClick={() => {
          var ne;
          return ((ne = window.api) == null ? undefined : ne.openExternal) && window.api.openExternal(h);
        }}>
              在浏览器打开
            </button>
          </div>}
        {a && <div className="login-verify-row">
            <input className="login-verify-input" type="text" placeholder="粘贴邮箱里的验证链接（https://…），确认后自动登录" value={I} disabled={O} onChange={ne => {
          return z(ne.target.value);
        }} onKeyDown={ne => {
          if (ne.key === 'Enter') {
            ke();
          }
        }} />
            <button className="btn sm primary" onClick={ke} disabled={O || !I.trim()}>
              {O ? '验证中…' : '确认进入'}
            </button>
            {D && <span className="login-verify-msg">{D}</span>}
          </div>}
      </div>
    </div>;
}