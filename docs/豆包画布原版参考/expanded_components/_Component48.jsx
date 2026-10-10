// TODO(全局, 无需 import): v, y, x, b, N, o, d, p, t, r, k, w, status, reason, m, e, u, n, h, c, s, a, f, l
import _cmp_W3 from './W3.jsx';
import _cmp_Z0 from './Z0.jsx';
import _cmp__Component11 from './_Component11.jsx';
import _cmp_OP from './OP.jsx';
import _cmp__Component42 from './_Component42.jsx';
import _cmp__Component43 from './_Component43.jsx';
import _cmp_RT from './RT.jsx';
import _cmp_Z3_1 from './Z3_1.jsx';
import _cmp__Component45 from './_Component45.jsx';
import _cmp__Component46 from './_Component46.jsx';
import _cmp__Component47 from './_Component47.jsx';
import { L, FP, _Component44 } from './shared.js';
import * as g from 'react';
import * as i from 'react';
export default function _Component48() {
  const e = L(v => {
    return v.started;
  });
  const t = L(v => {
    return v.accounts;
  });
  L(v => {
    return v.lastSentAccountId;
  });
  const n = L(v => {
    return v.activeDoubaoAccountId;
  });
  const r = L(v => {
    return v.setActiveDoubaoAccount;
  });
  g.useEffect(() => {
    const v = y => {
      if (!y.metaKey && !y.ctrlKey) {
        return;
      }
      const b = y.key.toLowerCase();
      const x = y.target;
      if (x && (x.isContentEditable || x.tagName === 'INPUT' || x.tagName === 'TEXTAREA') || b !== 'z' && b !== 'y') {
        return;
      }
      y.preventDefault();
      const N = L.getState();
      if (b === 'y' || b === 'z' && y.shiftKey) {
        N.redo();
      } else {
        N.undo();
      }
    };
    window.addEventListener('keydown', v);
    return () => {
      return window.removeEventListener('keydown', v);
    };
  }, []);
  const s = g.useRef(null);
  const [o, a] = g.useState(false);
  const [l, c] = g.useState(false);
  g.useEffect(() => {
    try {
      L.getState().loadApiSetup();
    } catch {}
    if (!!window.api && typeof window.api.onApiJobEvent == 'function') {
      return window.api.onApiJobEvent(v => {
        try {
          L.getState().applyApiJobEvent(v);
        } catch {}
      });
    }
  }, []);
  const [u, d] = g.useState(true);
  const [f, p] = g.useState(false);
  g.useEffect(() => {
    if (o) {
      d(false);
      p(true);
    } else {
      d(true);
      p(false);
    }
  }, [o]);
  g.useEffect(() => {
    if (!L.getState().activeDoubaoAccountId) {
      const y = t.find(b => {
        return (b.status || '已登录') === '已登录';
      });
      if (y) {
        r(y.id);
      }
    }
  }, []);
  g.useEffect(() => {
    const v = setTimeout(() => {
      try {
        L.getState().backfillLocalVideos();
      } catch {}
    }, 5000);
    return () => {
      return clearTimeout(v);
    };
  }, []);
  const h = g.useCallback(v => {
    r(v);
  }, [r]);
  const [m, w] = g.useState(null);
  g.useEffect(() => {
    let v = true;
    const y = () => {
      var x;
      if ((x = window.api) == null) {
        return undefined;
      } else {
        return x.getLicenseStatus().then(k => {
          if (v) {
            if (k && k.ok) {
              w(k);
            } else {
              w({
                status: 'invalid',
                reason: '授权状态获取失败'
              });
            }
          }
        }).catch(() => {
          return v && w({
            status: 'invalid',
            reason: '授权状态获取失败'
          });
        });
      }
    };
    y();
    const b = setInterval(y, 60000);
    return () => {
      v = false;
      clearInterval(b);
    };
  }, []);
  if (m === null) {
    return <div className="app-loading">正在校验授权…</div>;
  } else if (m.status !== 'ok') {
    return <_cmp_W3 initialStatus={m} onActivated={() => {
      return w({
        status: 'ok'
      });
    }} />;
  } else if (e) {
    return <i.Fragment>
        <_cmp_Z0 />
        <div className="app">
          <_cmp__Component11>
            <div className="main-area">
              <div className={`side left-side${u ? ' collapsed' : ''}`}>
                <div className="side-clip">
                  <_cmp_OP activeAccountId={n} onSelectAccount={h} />
                  <div className="side-api-col">
                    <button className="side-api-btn" onClick={() => {
                    return c(true);
                  }} title="对接第三方图像 / 视频生成服务（API 密钥与参数）">
                      <span className="side-api-icon">⚡</span>API 服务
                    </button>
                  </div>
                </div>
                <button className="side-toggle" title={u ? '展开账号栏' : '收起账号栏'} onClick={() => {
                return d(v => {
                  return !v;
                });
              }}>
                  {u ? '»' : '«'}
                </button>
              </div>
              <div className="center-stage">
                <FP>
                  <_cmp__Component42 doubaoViewRef={s} onOpenDoubaoView={() => {
                  return a(true);
                }} dvHidden={o} />
                </FP>
                <_cmp__Component43 ref={s} visible={o} onClose={() => {
                return a(false);
              }} />
              </div>
              <div className={`side right-side${f ? ' collapsed' : ''}`}>
                <button className="side-toggle" title={f ? '展开资源栏' : '收起资源栏'} onClick={() => {
                return p(v => {
                  return !v;
                });
              }}>
                  {f ? '«' : '»'}
                </button>
                <div className="side-clip">
                  <div className="right-rail">
                    <_cmp_RT />
                  </div>
                </div>
              </div>
            </div>
            <_Component44 doubaoViewRef={s} />
            <_cmp_Z3_1 />
            <_cmp__Component45 />
            {l && <_cmp__Component46 onClose={() => {
            return c(false);
          }} />}
          </_cmp__Component11>
        </div>
      </i.Fragment>;
  } else {
    return <i.Fragment>
        <_cmp_Z0 />
        <_cmp__Component47 />
      </i.Fragment>;
  }
}