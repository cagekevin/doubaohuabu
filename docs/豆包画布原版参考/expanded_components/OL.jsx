// TODO(全局, 无需 import): data, selected, V, s, r, d, q, ce, u, pe, ordered, group, accounts, ungrouped, f, m, h, block, a, o, e, accountId, l, w, ne, y, I, he, Ie, De, le, te, X, ze, re, Ee, je, Ve, et, Qe, Je, ut, oe, b, status, msg, k, C, N, z, A, F, O, P, left, width, t, _, c, S, x, account, materials, texts, params, aspectRatio, duration, model, autoSend, E, onProgress, R, v, background, color, n, M, U, J, H, j, position, gridTemplateColumns, p, borderColor, ke, se
import _cmp__Component28 from './_Component28.jsx';
import { id, L, AL, Ru, RL, O0, $L, Bu, pt, LL, on, Mn } from './shared.js';
import * as g from 'react';
import * as i from 'react';
export default function OL({
  id: e,
  data: t,
  selected: n
}) {
  const r = L(V => {
    return V.accounts;
  });
  const s = L(V => {
    return V.groups;
  });
  const o = L(V => {
    return V.updateNodeData;
  });
  const [a, l] = g.useState(false);
  const c = g.useMemo(() => {
    return Object.fromEntries(s.map(V => {
      return [V.id, V.color || null];
    }));
  }, [s]);
  const u = g.useMemo(() => {
    return Object.fromEntries(s.map(V => {
      return [V.id, V];
    }));
  }, [s]);
  const d = g.useMemo(() => {
    return r.filter(V => {
      return (V.status || '已登录') === '已登录';
    });
  }, [r]);
  const f = g.useMemo(() => {
    const V = new Map();
    const pe = [];
    for (const q of d) {
      const ce = q.groupId;
      if (ce && u[ce]) {
        if (!V.has(ce)) {
          V.set(ce, []);
        }
        V.get(ce).push(q);
      } else {
        pe.push(q);
      }
    }
    return {
      ordered: s.filter(q => {
        return V.has(q.id);
      }).map(q => {
        return {
          group: q,
          accounts: V.get(q.id)
        };
      }),
      ungrouped: pe
    };
  }, [d, s, u]);
  const p = g.useMemo(() => {
    const V = d.length;
    if (V <= 6) {
      return 2;
    } else if (V <= 15) {
      return 3;
    } else {
      return 4;
    }
  }, [d.length]);
  const h = g.useMemo(() => {
    const V = [];
    f.ordered.forEach(({
      accounts: pe
    }) => {
      return V.push(...pe);
    });
    V.push(...f.ungrouped);
    return V;
  }, [f]);
  const m = g.useState(0);
  const w = m[1];
  const v = g.useMemo(() => {
    return new Map(h.map((V, pe) => {
      return [V.id, pe];
    }));
  }, [h]);
  g.useEffect(() => {
    if (!a) {
      return;
    }
    const V = document.querySelector(`.foot-menu-grid [data-index="${m[0]}"]`);
    if (V) {
      V.scrollIntoView({
        block: 'nearest'
      });
    }
  }, [m[0], a]);
  const y = g.useCallback(V => {
    o(e, {
      accountId: V
    });
    l(false);
  }, [e, o]);
  g.useCallback(V => {
    const pe = h.length - 1;
    if (V.key === 'ArrowDown') {
      V.preventDefault();
      w(ne => {
        return Math.min(ne + 1, pe);
      });
    } else if (V.key === 'ArrowUp') {
      V.preventDefault();
      w(ne => {
        return Math.max(ne - 1, 0);
      });
    } else if (V.key === 'Enter' && h[m[0]]) {
      V.preventDefault();
      y(h[m[0]].id);
      l(false);
      I(null);
    } else if (V.key === 'Escape') {
      l(false);
      I(null);
    }
  }, [h, m[0], y]);
  const b = L(AL(V => {
    const pe = new Map(V.nodes.map(he => {
      return [he.id, he];
    }));
    const ne = new Set();
    const q = [e];
    while (q.length) {
      const he = q.pop();
      V.edges.forEach(Ie => {
        if (Ie.target === he && !ne.has(Ie.source)) {
          ne.add(Ie.source);
          q.push(Ie.source);
        }
      });
    }
    const ce = [];
    ne.forEach(he => {
      var De;
      var le;
      var te;
      var X;
      var re;
      var Ee;
      var je;
      var Ve;
      const Ie = pe.get(he);
      if (Ie) {
        if (Ie.type === 'material') {
          ce.push(`M:${he}:${((De = Ie.data) == null ? undefined : De.label) || ((le = Ie.data) == null ? undefined : le.name) || ''}:${(((te = Ie.data) == null ? undefined : te.dataUrl) || '').slice(0, 40)}`);
        } else if (Ie.type === 'text') {
          const ze = ((X = Ie.data) == null ? undefined : X.text) || '';
          ce.push(`T:${he}:${ze.slice(0, 300)}:${(re = Ie.data) == null ? undefined : re.aspectRatio}:${(Ee = Ie.data) == null ? undefined : Ee.duration}:${(je = Ie.data) == null ? undefined : je.model}:${(((Ve = Ie.data) == null ? undefined : Ve.materialIds) || []).join(',')}`);
          Ru(ze).forEach(Qe => {
            const Je = V.library.find(et => {
              return et.id === Qe.id;
            });
            const ut = Je ? `${Qe.id}:${(Je.dataUrl || '').slice(0, 40)}` : `${Qe.id}:MISSING`;
            ce.push(`REF:${ut}`);
          });
        }
      }
    });
    const oe = V.edges.filter(he => {
      return ne.has(he.source) && ne.has(he.target);
    }).map(he => {
      return `${he.source}->${he.target}`;
    }).sort();
    return [...ce.sort(), ...oe];
  }));
  const x = g.useMemo(() => {
    return RL(L.getState(), e);
  }, [b, e]);
  const k = L(V => {
    var pe;
    if ((pe = V.nodeSendStates) == null) {
      return undefined;
    } else {
      return pe[e];
    }
  }) || {
    status: 'idle',
    msg: ''
  };
  const N = L(V => {
    return V.setNodeSendState;
  });
  const C = L(V => {
    return V.clearNodeSendState;
  });
  const S = g.useCallback(V => {
    const pe = typeof V == 'function' ? V(k) : V;
    if (!pe || pe.status === 'idle' || !pe.msg) {
      C(e);
    } else {
      N(e, {
        status: pe.status,
        msg: pe.msg
      });
    }
  }, [e, k, N, C]);
  const E = g.useRef(null);
  const P = g.useRef(null);
  const [j, I] = g.useState(null);
  const z = L(V => {
    var pe;
    return ((pe = V.nodeTimers) == null ? undefined : pe[e]) ?? null;
  });
  L(V => {
    return V.setNodeTimer;
  });
  const O = L(V => {
    return V.removeNodeTimer;
  });
  const R = L(V => {
    return V.setNodePendingTimer;
  });
  L(V => {
    return V.removeNodePendingTimer;
  });
  L(V => {
    var pe;
    return ((pe = V.nodePendingTimers) == null ? undefined : pe[e]) ?? null;
  });
  const [D, A] = g.useState(0);
  const F = L(V => {
    return O0(V, e);
  });
  g.useEffect(() => {
    if (z == null) {
      return;
    }
    const V = () => {
      return A(ne => {
        return ne + 1 & 1073741823;
      });
    };
    V();
    const pe = setInterval(V, 250);
    return () => {
      return clearInterval(pe);
    };
  }, [z]);
  g.useEffect(() => {
    if (F && z != null) {
      O(e);
    }
  }, [F, z, e, O]);
  const M = z != null ? Date.now() - z : 0;
  g.useEffect(() => {
    if (!a) {
      return;
    }
    const V = () => {
      l(false);
      I(null);
    };
    document.addEventListener('mousedown', V);
    return () => {
      return document.removeEventListener('mousedown', V);
    };
  }, [a]);
  const U = g.useCallback(V => {
    V.stopPropagation();
    if (a) {
      l(false);
      I(null);
      return;
    }
    if (P.current) {
      const pe = P.current.getBoundingClientRect();
      I({
        top: pe.bottom + 4,
        left: pe.left,
        width: Math.max(pe.width, 120)
      });
    }
    l(true);
  }, [a]);
  const _ = r.find(V => {
    return V.id === t.accountId;
  });
  const H = _ ? _.name : '选择账号';
  const J = _ && c[_.groupId] || null;
  const se = g.useCallback(async () => {
    const V = r.find(ne => {
      return ne.id === t.accountId;
    });
    if (!V) {
      S({
        status: 'err',
        msg: '请先选择账号'
      });
      return;
    }
    if (x.total === 0) {
      S({
        status: 'err',
        msg: '未连接文本框或素材'
      });
      return;
    }
    const pe = $L({
      account: V,
      materials: x.materials,
      texts: x.texts,
      params: {
        aspectRatio: x.params.aspectRatio || t.aspectRatio || null,
        duration: x.params.duration ?? t.duration ?? null,
        model: x.params.model || t.model || null
      },
      autoSend: !!t.autoSend
    });
    pe.sourceNodeId = e;
    S({
      status: 'sending',
      msg: '正在同步参数并填入…'
    });
    if (E.current) {
      clearTimeout(E.current);
    }
    try {
      const ne = await Bu(pe, {
        onProgress: q => {
          if (q.type === 'retry') {
            S({
              status: 'sending',
              msg: '重试中…'
            });
          }
        }
      });
      if (ne && ne.ok) {
        const q = ne.precheck && !ne.precheck.pass ? ne.precheckIssue || '发送前校验未通过' : null;
        const ce = [];
        if (x.texts.length) {
          ce.push('文本已填');
        }
        if (ne.imagesAttached != null) {
          ce.push(`图片 ${ne.imagesAttached}/${ne.imagesTotal ?? x.materials.length}`);
        }
        const oe = !!t.autoSend && ne.autoClicked;
        if (oe) {
          ce.push('已自动发送');
        }
        const he = ce.length ? ce.join(' · ') + (oe ? '' : '（仅填入，未发送）') : '已填入（仅填入，未发送）';
        S(q ? {
          status: 'err',
          msg: `${he}；⚠ ${q}（请人工核对后发送）`
        } : {
          status: 'ok',
          msg: he
        });
        L.getState().setLastSentAccount(V.id);
        if (!O0(L.getState(), e)) {
          R(e, Date.now());
        }
      } else {
        S({
          status: 'err',
          msg: (ne == null ? undefined : ne.note) || '填入失败'
        });
      }
    } catch (ne) {
      S({
        status: 'err',
        msg: (ne == null ? undefined : ne.message) || '发送异常'
      });
    } finally {
      if (E.current) {
        clearTimeout(E.current);
      }
      E.current = setTimeout(() => {
        var q;
        const ne = (q = L.getState().nodeSendStates) == null ? undefined : q[e];
        if (ne && ne.status === 'ok') {
          L.getState().clearNodeSendState(e);
        }
      }, 4000);
    }
  }, [r, t.accountId, t.aspectRatio, t.duration, t.model, t.autoSend, x]);
  const ke = V => {
    const pe = c[V.groupId] || null;
    const ne = V.id === t.accountId;
    const q = v.get(V.id) ?? -1;
    const ce = q === m[0];
    return <div data-index={q} className={`foot-menu-item foot-menu-grid-cell ${ne ? 'active' : ''} ${ce ? 'keyboard-active' : ''}`} onClick={() => {
      return y(V.id);
    }} onMouseEnter={() => {
      return w(q);
    }} title={V.name} key={V.id}>
        <span className="grp-tint-dot" style={pe ? {
        background: pe
      } : undefined} />
        <span className="grid-cell-name" style={pe && !ne ? {
        color: pe
      } : undefined}>
          {V.name}
        </span>
      </div>;
  };
  return <div className={`account-node ${n ? 'selected' : ''}`}>
      <_cmp__Component28 minWidth={340} minHeight={200} isVisible={n} lineClassName="r-line" handleClassName="r-handle" />
      <Mn type="target" position={pt.Left} />
      <Mn type="source" position={pt.Right} />
      <div className="node-head">
        <span className="dot account-dot" />
        发送节点
        {!F && z != null && <span className={`timer-inline${M >= 600000 ? ' timer-red' : M >= 300000 ? ' timer-yellow' : ''}`} title={M >= 600000 ? '已超过 10 分钟，生成时间较长' : M >= 300000 ? '已超过 5 分钟' : '自上次成功发送起累计的经过时间'}>
            {LL(M)}
          </span>}
        <label className="auto-send-toggle" title="开启后，填入内容+参数后将自动点击发送按钮" onMouseDown={V => {
        return V.stopPropagation();
      }}>
          <input type="checkbox" checked={!!t.autoSend} onChange={V => {
          return o(e, {
            autoSend: V.target.checked
          });
        }} />
          <span className="auto-send-slider" />
        </label>
      </div>
      <div className="account-body nodrag nopan" onMouseDown={V => {
      return V.stopPropagation();
    }}>
        <div className="account-top-row">
          <div className="foot-dropdown">
            <button ref={P} className="foot-btn foot-btn-account" onClick={U}>
              <span className="account-selector-label" style={J ? {
              color: J
            } : undefined}>
                <span className="grp-tint-dot" style={J ? {
                background: J
              } : undefined} />
                {H}
              </span>
              <span className={`account-dropdown-arrow${a ? ' open' : ''}`} />
            </button>
            {a && j && on.createPortal(<div className="foot-menu foot-menu-portal nodrag nopan nowheel" style={{
            position: 'fixed',
            top: j.top,
            left: j.left,
            width: Math.max(j.width * 2.6, 340)
          }} onMouseDown={V => {
            return V.stopPropagation();
          }}>
                  <div className="foot-menu-grid" style={{
              gridTemplateColumns: `repeat(${p}, 1fr)`
            }}>
                    <div className={`foot-menu-item foot-menu-grid-header ${t.accountId ? '' : 'active'}`} onClick={() => {
                return y(null);
              }}>
                      未选择
                    </div>
                    {f.ordered.map(({
                group: V,
                accounts: pe
              }) => {
                const ne = V.color || null;
                return <g.Fragment key={V.id}>
                          <div className="foot-menu-group-header" style={{
                    borderColor: ne || 'var(--border)'
                  }}>
                            {ne && <span className="grp-tint-dot" style={{
                      background: ne
                    }} />}
                            <span className="grid-group-name">{V.name}</span>
                            <span className="grid-group-count">{pe.length}</span>
                          </div>
                          {pe.map(q => {
                    return ke(q);
                  })}
                        </g.Fragment>;
              })}
                    {f.ungrouped.length > 0 && <i.Fragment>
                        <div className="foot-menu-group-header" style={{
                  borderColor: 'var(--border)'
                }}>
                          <span className="grid-group-name">未分组</span>
                          <span className="grid-group-count">{f.ungrouped.length}</span>
                        </div>
                        {f.ungrouped.map(V => {
                  return ke(V);
                })}
                      </i.Fragment>}
                    {d.length === 0 && <div className="ref-empty foot-menu-grid-empty">
                        请先在左侧面板添加并登录账号
                      </div>}
                  </div>
                </div>, document.body)}
          </div>
          <button className={`account-send-btn${k.status === 'sending' ? ' sending' : k.status === 'ok' ? ' success' : k.status === 'err' ? ' error' : ''}`} onClick={V => {
          V.stopPropagation();
          se();
        }} disabled={k.status === 'sending'} title="同步比例/时长/模型，并把文本框与素材填入所选账号对话框（不触发发送）">
            {k.status === 'sending' ? <i.Fragment>
                <span className="send-spinner">⟳</span>发送中…
              </i.Fragment> : <i.Fragment>
                <span className="send-icon">↑</span>发送
              </i.Fragment>}
          </button>
        </div>
        {k.status && k.status !== 'idle' && <div className={`account-feedback ${k.status === 'ok' ? 'feedback-ok' : k.status === 'err' ? 'feedback-err' : 'feedback-pending'}`}>
            <span className="account-feedback-msg">{k.msg}</span>
            {k.status === 'err' && <button type="button" className="account-feedback-close" title="关闭提示" onClick={V => {
          V.stopPropagation();
          if (E.current) {
            clearTimeout(E.current);
          }
          C(e);
        }}>
                ×
              </button>}
          </div>}
        {x.total > 0 && <div className="account-summary">
            已链接 {x.materials.length} 张素材 · {x.texts.length} 个文本框
          </div>}
      </div>
    </div>;
}