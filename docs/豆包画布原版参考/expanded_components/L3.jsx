// TODO(全局, 无需 import): S, getNodesBounds, e, r, R, n, t, E, P, I, left, j, O, z, transform, m, h, resolve, d, c, status, msg, p, a, nodeIds, onNodeState, onDecision, shouldAbort, onSummary, nodeId, name, replace, sendOne, l, o, s, y, b, x, k, N, C, w, width, u, v, f
import { L, Tu, Kr, Xd, Yd, Jd, R3, w3, $p, x3, $S, TS, PS, D3 } from './shared.js';
import * as g from 'react';
import * as i from 'react';
export default function L3() {
  const e = L(S => {
    return S.nodes;
  });
  const t = Tu();
  const {
    getNodesBounds: n
  } = Kr();
  const r = g.useMemo(() => {
    return e.filter(S => {
      return S.selected && (S.type === 'text' || S.type === 'genvideo');
    }).map(S => {
      return S.id;
    });
  }, [e]);
  const s = g.useMemo(() => {
    if (r.length < 2) {
      return null;
    }
    const S = e.filter(R => {
      return R.selected;
    });
    if (S.length < 2) {
      return null;
    }
    let E;
    try {
      E = n(S);
    } catch {
      return null;
    }
    if (!E) {
      return null;
    }
    const P = t.zoom || 1;
    const j = (E.x + E.width / 2) * P + t.x;
    const I = E.y * P + t.y;
    const z = (E.y + E.height) * P + t.y;
    const O = I - Xd - Yd - Jd >= R3;
    return {
      left: j,
      top: O ? I - Xd - Yd - Jd : z + Xd + Yd + Jd,
      transform: O ? 'translate(-50%, -100%)' : 'translate(-50%, 0)'
    };
  }, [e, r, t, n]);
  const [o, a] = g.useState('idle');
  const [l, c] = g.useState([]);
  const [u, d] = g.useState(null);
  const [f, p] = g.useState(null);
  const h = g.useRef(null);
  const m = g.useRef(false);
  const w = g.useCallback(() => {
    m.current = true;
    if (h.current) {
      const {
        resolve: S
      } = h.current;
      h.current = null;
      d(null);
      S('abort');
    }
  }, []);
  const v = g.useCallback(S => {
    if (h.current) {
      const {
        resolve: E
      } = h.current;
      h.current = null;
      d(null);
      E(S);
    }
  }, []);
  const y = g.useCallback(() => {
    if (w3()) {
      return;
    }
    const S = new Set(r);
    const E = L.getState();
    const P = $p(E.nodes).filter(j => {
      return S.has(j.nodeId);
    });
    if (!(P.length < 2)) {
      m.current = false;
      c(P.map(j => {
        return {
          ...j,
          status: 'waiting',
          msg: '等待中'
        };
      }));
      p(null);
      d(null);
      a('running');
      x3({
        nodeIds: [...S],
        onNodeState: j => {
          c(I => {
            return I.map(z => {
              if (z.nodeId === j.nodeId) {
                return {
                  ...z,
                  ...j
                };
              } else {
                return z;
              }
            });
          });
        },
        onDecision: j => {
          return new Promise(I => {
            if (m.current) {
              I('abort');
              return;
            }
            h.current = {
              resolve: I
            };
            d(j);
          });
        },
        shouldAbort: () => {
          return m.current;
        },
        onSummary: j => {
          p(j);
          a('done');
          d(null);
          h.current = null;
        }
      });
    }
  }, [r]);
  const b = g.useCallback(() => {
    const S = new Set(r);
    const E = L.getState();
    const P = $p(E.nodes).filter(j => {
      return S.has(j.nodeId);
    });
    if (!(P.length < 2)) {
      $S(P.map(j => {
        return {
          nodeId: j.nodeId,
          name: j.name
        };
      }), {
        replace: true
      });
      TS({
        sendOne: PS()
      });
    }
  }, [r]);
  const x = l.filter(S => {
    return ['success', 'error', 'skipped'].includes(S.status);
  }).length;
  const k = l.filter(S => {
    return S.status === 'success';
  }).length;
  const N = l.filter(S => {
    return S.status === 'error';
  }).length;
  const C = l.filter(S => {
    return S.status === 'skipped';
  }).length;
  if (!s && o === 'idle') {
    return null;
  } else {
    return <i.Fragment>
        {s && o === 'idle' && <div className="bs-trigger-group nodrag nopan" style={{
        left: s.left,
        top: s.top,
        transform: s.transform
      }}>
            <button type="button" className="bs-trigger" onClick={y} title={`按位置顺序（先上后下、同行先左后右）批量发送这 ${r.length} 个节点（文本框 / 文生视频）`}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M4 12h10" />
                <path d="M10 8l4 4-4 4" />
                <path d="M18 5v14" />
              </svg>
              批量发送 · {r.length}
            </button>
            <button type="button" className="bs-trigger bs-trigger-queue" onClick={b} title="加入右下角发送队列：可暂停 / 取消单条 / 失败重跑，适合大批量">
              加入队列
            </button>
          </div>}
        {o !== 'idle' && <div className="bs-backdrop" onMouseDown={S => {
        return S.stopPropagation();
      }}>
            <div className="bs-card">
              <div className="bs-head">
                <div className="bs-title">
                  {o === 'running' ? `批量发送中 · ${x}/${l.length}` : `批量发送完成 · 成功 ${k} · 失败 ${N}${C ? ` · 跳过 ${C}` : ''}`}
                </div>
                {o === 'running' ? <button type="button" className="btn sm bs-abort" onClick={w}>
                    全部中止
                  </button> : <button type="button" className="btn sm" onClick={() => {
              return a('idle');
            }}>
                    关闭
                  </button>}
              </div>
              {o === 'running' && <div className="bs-progress">
                  <div className="bs-progress-bar" style={{
              width: `${l.length ? x / l.length * 100 : 0}%`
            }} />
                </div>}
              <div className="bs-list">
                {l.map((S, E) => {
              return <div className={`bs-item bs-${S.status}`} key={S.nodeId}>
                      <span className="bs-idx">{E + 1}.</span>
                      <span className="bs-name" title={S.name}>
                        {S.name}
                      </span>
                      <span className={`bs-chip bs-chip-${S.status}`}>
                        {D3[S.status] || S.status}
                      </span>
                      <span className="bs-msg" title={S.msg || ''}>
                        {S.msg || ''}
                      </span>
                    </div>;
            })}
              </div>
              {o === 'running' && u && <div className="bs-decision">
                  <div className="bs-decision-msg">
                    「{u.name}」发送失败：{u.msg}
                    {u.remaining > 0 ? `（还有 ${u.remaining} 个节点未发送）` : '（已是最后一个节点）'}
                  </div>
                  <div className="bs-decision-actions">
                    {u.remaining > 0 && <button type="button" className="btn sm primary" onClick={() => {
                return v('continue');
              }}>
                        继续发送后续 {u.remaining} 个
                      </button>}
                    <button type="button" className="btn sm bs-abort" onClick={() => {
                return v('abort');
              }}>
                      立即中止
                    </button>
                    {u.remaining === 0 && <span className="bs-decision-hint">已是最后一个节点，无需决策</span>}
                  </div>
                </div>}
              {o === 'done' && f && <div className="bs-summary">
                  {f.aborted ? <div className="bs-summary-note">本次批量已被中止，后续节点未发送。</div> : null}
                  <div className="bs-summary-note">
                    执行顺序为节点位置顺序（先上后下、同行先左后右）；账号发成功后保持占用，失败已自动释放。
                  </div>
                </div>}
            </div>
          </div>}
      </i.Fragment>;
  }
}