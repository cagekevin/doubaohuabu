// TODO(全局, 无需 import): A, e, m, a, n, F, r, N, k, M, C, l, w, c, u, startX, startY, origX, origY, h, moved, U, f, o, _, d, H, v, s, p, left, right, bottom, z, O, R, t, y, width, D, text, cls, ke, I, se, x, b, E, P, j
import { L, U3, I3, Wk, WP, eS, B0, _3, j3, A3, P3, id, H0, Qd, Pp, O3, tc, E3, C3, VP, GP } from './shared.js';
import * as g from 'react';
import * as i from 'react';
export default function z3() {
  const e = L(A => {
    return A.sendQueue;
  });
  const t = L(A => {
    return A.accountConcurrency;
  });
  const n = L(A => {
    return A.queueProgress;
  });
  const r = L(A => {
    return A.nodes;
  });
  const [s, o] = g.useState(false);
  const [a, l] = g.useState(0);
  const c = g.useRef(null);
  const u = g.useRef(null);
  const [d, f] = g.useState(() => {
    return U3();
  });
  const [p, h] = g.useState(false);
  const m = g.useMemo(() => {
    return e && e.items || [];
  }, [e]);
  const w = !!e && !!e.paused;
  const v = g.useMemo(() => {
    return I3();
  }, [m, a]);
  const y = g.useMemo(() => {
    return Wk();
  }, [m, a]);
  const [b, x] = g.useState(() => {
    return WP();
  });
  const k = g.useCallback(A => {
    const F = n || {};
    return F[eS(A.nodeId, A.accountId)] || F[A.nodeId] || null;
  }, [n]);
  const N = g.useMemo(() => {
    const A = {};
    (r || []).forEach(F => {
      A[F.id] = F;
    });
    return A;
  }, [r]);
  const C = m.some(A => {
    const F = N[A.nodeId];
    if (!F || F.type !== 'genvideo' || A.status !== 'success') {
      return false;
    }
    const M = B0(A, F, k(A));
    return M.cls === 'generating' || M.cls === 'queued' || M.cls === 'unknown';
  });
  if ((m.some(A => {
    return A.status === 'sending';
  }) || C) && !s) {
    setTimeout(() => {
      return l(A => {
        return (A + 1) % 100000;
      });
    }, 1000);
  }
  const E = g.useCallback(() => {
    if (w) {
      _3();
    } else {
      j3();
    }
  }, [w]);
  const P = g.useCallback(() => {
    return A3();
  }, []);
  const j = g.useCallback(() => {
    return P3();
  }, []);
  const I = g.useCallback(A => {
    if (A) {
      try {
        const F = L.getState();
        if (typeof F.fitViewAction == 'function') {
          F.fitViewAction([A]);
        }
      } catch {}
    }
  }, []);
  const z = g.useCallback(A => {
    if (A.button != null && A.button !== 0) {
      return;
    }
    const F = c.current;
    if (!F) {
      return;
    }
    const M = F.getBoundingClientRect();
    u.current = {
      startX: A.clientX,
      startY: A.clientY,
      origX: M.left,
      origY: M.top,
      w: M.width,
      h: M.height,
      id: A.pointerId,
      moved: false
    };
    try {
      A.currentTarget.setPointerCapture(A.pointerId);
    } catch {}
  }, []);
  const O = g.useCallback(A => {
    const F = u.current;
    if (!F) {
      return;
    }
    const M = A.clientX - F.startX;
    const U = A.clientY - F.startY;
    if (!F.moved) {
      if (Math.abs(M) < H0 && Math.abs(U) < H0) {
        return;
      }
      F.moved = true;
      h(true);
    }
    f(Qd(F.origX + M, F.origY + U, F.w, F.h));
    if (A.cancelable) {
      A.preventDefault();
    }
  }, []);
  const R = g.useCallback(A => {
    const F = u.current;
    u.current = null;
    if (!F) {
      return;
    }
    try {
      A.currentTarget.releasePointerCapture(F.id);
    } catch {}
    if (!F.moved) {
      o(U => {
        return !U;
      });
      return;
    }
    h(false);
    const M = c.current;
    if (M) {
      const U = M.getBoundingClientRect();
      const _ = Qd(U.left, U.top, U.width, U.height);
      f(_);
      try {
        localStorage.setItem(Pp, JSON.stringify(_));
      } catch {}
    }
  }, []);
  g.useEffect(() => {
    if (!m.length) {
      return;
    }
    const A = () => {
      const F = c.current;
      if (!F) {
        return;
      }
      const M = F.getBoundingClientRect();
      const U = d ? d.x : M.left;
      const _ = d ? d.y : M.top;
      const H = Qd(U, _, M.width, M.height);
      if (H.x !== U || H.y !== _) {
        f(H);
        try {
          localStorage.setItem(Pp, JSON.stringify(H));
        } catch {}
      }
    };
    A();
    if (typeof window !== 'undefined' && !!window.addEventListener) {
      window.addEventListener('resize', A);
      return () => {
        return window.removeEventListener('resize', A);
      };
    }
  }, [d, m.length]);
  if (!m.length) {
    return null;
  }
  const D = v.success + v.failed + v.cancelled;
  return <div ref={c} className={`sq-panel${s ? ' collapsed' : ''}${p ? ' dragging' : ''}`} style={d ? {
    left: d.x,
    top: d.y,
    right: 'auto',
    bottom: 'auto'
  } : undefined}>
      <div className="sq-head" onPointerDown={z} onPointerMove={O} onPointerUp={R} onPointerCancel={R} title="拖动可移动面板位置">
        <span className="sq-title">发送队列</span>
        <span className="sq-conc" title={`每账号并发上限 ${t || 1}：同一账号同一时刻只处理一个任务`}>
          ≤{t || 1}/号
        </span>
        <span className="sq-statusline">
          {v.sending} 运行 / {v.waiting} 等待 · 账号 {y.idle}/{y.total} 空闲
          {y.idle === 0 && v.waiting ? ' · 等待空闲账号' : ''}
          {w ? ' · 已暂停' : ''}
        </span>
        <span className="sq-chevron">{s ? '▲' : '▼'}</span>
      </div>
      {!s && <i.Fragment>
          <div className="sq-bar">
            <div className="sq-progress">
              <div className="sq-progress-fill" style={{
            width: `${v.total ? D / v.total * 100 : 0}%`
          }} />
            </div>
          </div>
          <div className="sq-list">
            {m.map((A, F) => {
          const M = O3[A.status] || {
            text: A.status,
            cls: ''
          };
          const U = A.status === 'waiting' || A.status === 'sending';
          const _ = A.status === 'failed' || A.status === 'cancelled';
          const H = N[A.nodeId];
          const se = !!H && H.type === 'genvideo' ? B0(A, H, k(A)) : null;
          const ke = !!H && !!H.data && (!!H.data.resultUrl || !!H.data.resultPoster);
          return <div className={`sq-item ${M.cls}`} key={A.id}>
                  <div className="sq-top">
                    <span className="sq-idx">{F + 1}</span>
                    <span className="sq-name" title={A.name || A.nodeId}>
                      {A.name || A.nodeId}
                    </span>
                    {A.accountName ? <span className="sq-acc">{A.accountName}</span> : <span className="sq-acc pending">待分配</span>}
                    <span className={`sq-status ${M.cls}`}>
                      {M.text}
                      {(A.attempt || 0) > 1 ? <span className="sq-attempt">· 第{A.attempt}次</span> : null}
                      {A.startedAt && (A.status === 'sending' || A.finishedAt) ? ` ${tc(A.startedAt, A.finishedAt)}` : ''}
                    </span>
                    {A.note ? <span className="sq-note" title={A.note}>
                        {A.note}
                      </span> : null}
                    <span className="sq-acts">
                      {ke ? <button className="sq-btn ok" onClick={() => {
                  return I(A.nodeId);
                }} title="定位到画布上的出片结果">
                          查看
                        </button> : null}
                      {_ ? <button className="sq-btn" onClick={() => {
                  return E3(A.id);
                }} title="重新入队">
                          重跑
                        </button> : null}
                      {U ? <button className="sq-btn" onClick={() => {
                  return C3(A.id);
                }} title="取消这一条">
                          取消
                        </button> : null}
                    </span>
                  </div>
                  {se ? <div className="sq-genrow">
                      <span className="sq-gen-label">成片</span>
                      <span className={`sq-gen ${se.cls}`}>{se.text}</span>
                      {se.wait ? <span className="sq-gen-wait">{se.wait}</span> : null}
                      {se.note ? <span className="sq-gen-note" title={se.note}>
                          {se.note}
                        </span> : null}
                    </div> : null}
                </div>;
        })}
          </div>
          <div className="sq-foot">
            <button className="sq-btn" onClick={() => {
          return x(VP(b === 'round-robin' ? 'least-load' : 'round-robin'));
        }} title="账号选取策略：顺序轮转（每个账号轮流）/ 按负载（派发条数最少的优先）">
              选号：{GP(b)}
            </button>
            <button className="sq-btn" onClick={E}>
              {w ? '继续' : '暂停'}
            </button>
            <button className="sq-btn" onClick={P} disabled={!D}>
              清除已完成
            </button>
            <button className="sq-btn danger" onClick={j} disabled={!v.waiting && !v.sending}>
              全部停止
            </button>
          </div>
        </i.Fragment>}
    </div>;
}