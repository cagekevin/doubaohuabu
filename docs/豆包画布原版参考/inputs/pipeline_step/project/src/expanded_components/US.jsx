// TODO(全局, 无需 import): open, selectedIds, onToggle, onUseNone, onClose, D, name, prefix, cover, w, y, A, d, x, b, o, k, p, f, e, h, a, l, c, m, M, F, s, P, E, r, u, t, n, background, S, v, left, N, C, z, R, display, O, I, j
import _cmp_J3 from './J3.jsx';
import { L, cx, cy, q0 } from './shared.js';
import * as g from 'react';
export default function US({
  open: e,
  selectedIds: t = [],
  onToggle: n,
  onUseNone: r,
  onClose: s
}) {
  const o = L(D => {
    return D.styles;
  }) || [];
  const a = L(D => {
    return D.addStyle;
  });
  const l = L(D => {
    return D.updateStyle;
  });
  const c = L(D => {
    return D.removeStyle;
  });
  const u = L(D => {
    return D.resetStyles;
  });
  const [d, f] = g.useState(null);
  const [p, h] = g.useState({
    name: '',
    prefix: '',
    cover: null
  });
  const m = g.useRef(null);
  const w = g.useRef(null);
  const [v, y] = g.useState(null);
  const b = g.useCallback(() => {
    const D = w.current;
    if (!D) {
      return;
    }
    const A = D.getBoundingClientRect();
    y({
      cx: A.left + A.width / 2,
      cy: A.top + A.height / 2
    });
  }, []);
  const x = d !== null;
  g.useEffect(() => {
    if (x) {
      b();
      window.addEventListener('resize', b);
      return () => {
        return window.removeEventListener('resize', b);
      };
    }
  }, [x, b]);
  const k = d && d !== 'new' && o.find(D => {
    return D.id === d;
  }) || null;
  const N = d === 'new' ? '新建风格' : `编辑：${k && k.name || p.name || '未命名风格'}`;
  const C = p.cover || null;
  g.useEffect(() => {
    if (!e) {
      f(null);
    }
  }, [e]);
  g.useEffect(() => {
    if (d && d !== 'new' && !o.some(D => {
      return D.id === d;
    })) {
      f(null);
    }
  }, [o, d]);
  if (!e) {
    return null;
  }
  const S = D => {
    f(D.id);
    h({
      name: D.name || '',
      prefix: D.prefix || '',
      cover: D.cover || null
    });
  };
  const E = () => {
    f('new');
    h({
      name: '',
      prefix: '',
      cover: null
    });
  };
  const P = () => {
    return f(null);
  };
  const j = () => {
    const D = (p.name || '').trim() || '未命名风格';
    const A = (p.prefix || '').trim().replace(/[，,]\s*$/, '') + '，';
    if (d === 'new') {
      a({
        name: D,
        prefix: A,
        cover: p.cover || null
      });
    } else if (d) {
      l(d, {
        name: D,
        prefix: A,
        cover: p.cover || null
      });
    }
    f(null);
  };
  const I = () => {
    if (d && d !== 'new' && window.confirm(`确定删除风格「${k && k.name || ''}」？`)) {
      c(d);
    }
    f(null);
  };
  const z = () => {
    return m.current && m.current.click();
  };
  const O = async D => {
    const A = D.target.files && D.target.files[0];
    D.target.value = '';
    if (A) {
      try {
        const F = await _cmp_J3(A);
        h(M => {
          return {
            ...M,
            cover: F
          };
        });
      } catch (F) {
        console.warn('[style-lib] 封面解析失败:', F && F.message);
      }
    }
  };
  const R = () => {
    return h(D => {
      return {
        ...D,
        cover: null
      };
    });
  };
  return <div className="style-lib-layer" onMouseDown={s}>
      <div ref={w} className="style-lib-modal" onMouseDown={D => {
      return D.stopPropagation();
    }}>
        <div className="slm-head">
          <span className="slm-title">风格库</span>
          <button className="slm-close" onClick={s} title="关闭">
            ✕
          </button>
        </div>
        <div className="slm-tabs">
          <button type="button" className={`slm-tab${d === 'new' ? ' is-active' : ''}`} onClick={() => {
          if (d === 'new') {
            return P();
          } else {
            return E();
          }
        }}>
            新建风格
          </button>
          <button type="button" className="slm-tab" onClick={() => {
          return r && r();
        }}>
            不使用风格
          </button>
          <button type="button" className="slm-tab" onClick={() => {
          return u();
        }}>
            恢复默认
          </button>
          <span className="slm-hint">点击卡片选用并关闭 ·「不使用风格」则不传风格</span>
        </div>
        <div className="slm-body">
          <div className="slm-grid-wrap">
            {o.length === 0 ? <div className="slm-empty">
                风格库为空。点「新建风格」添加，或点「恢复默认」载入内置风格集。
              </div> : <div className="slm-grid">
                {o.map(D => {
              const A = t.includes(D.id);
              return <div className={`slm-card${A ? ' is-active' : ''}`} key={D.id}>
                      <button type="button" className="slm-card-pick" title={`${A ? '取消选用' : '选用'}「${D.name}」并关闭`} onClick={() => {
                  if (n) {
                    n(D.id);
                  }
                  if (s) {
                    s();
                  }
                }}>
                        <span className="slm-cover" style={D.cover ? undefined : {
                    background: q0(D.name)
                  }}>
                          {D.cover ? <img src={D.cover} alt="" /> : <span className="slm-cover-glyph">{(D.name || '风').slice(0, 1)}</span>}
                          {A ? <span className="slm-check">✓</span> : null}
                        </span>
                        <span className="slm-name" title={D.name}>
                          {D.name}
                        </span>
                      </button>
                      <div className="slm-card-actions">
                        <button className="slm-mini" onClick={() => {
                    return S(D);
                  }}>
                          编辑
                        </button>
                        <button className="slm-mini danger" onClick={() => {
                    return c(D.id);
                  }}>
                          删除
                        </button>
                      </div>
                    </div>;
            })}
              </div>}
          </div>
        </div>
      </div>
      {x && <div className="style-lib-edit-layer" onMouseDown={D => {
      D.stopPropagation();
      P();
    }}>
          <div className="style-lib-edit-page" style={v ? {
        left: v.cx,
        top: v.cy
      } : undefined} onMouseDown={D => {
        return D.stopPropagation();
      }}>
            <div className="slep-head">
              <span className="slep-title" title={N}>
                {N}
              </span>
              <button className="slm-close" onClick={P} title="关闭编辑">
                ✕
              </button>
            </div>
            <div className="slep-body">
              <div className="slm-edit-cover" style={C ? undefined : {
            background: q0(d === 'new' ? p.name : k && k.name)
          }}>
                {C ? <img src={C} alt="" /> : <span className="slm-cover-glyph">{(p.name || '风').slice(0, 1)}</span>}
              </div>
              <div className="slm-edit-cover-actions">
                <button type="button" className="btn sm" onClick={z}>
                  上传封面
                </button>
                {C ? <button type="button" className="btn sm" onClick={R}>
                    清除封面
                  </button> : null}
                <input ref={m} type="file" accept="image/*" style={{
              display: 'none'
            }} onChange={O} />
              </div>
              <label className="slm-field-label">名称</label>
              <input className="slm-input" placeholder="风格名称，如：国风二次元" value={p.name} onChange={D => {
            return h(A => {
              return {
                ...A,
                name: D.target.value
              };
            });
          }} />
              <label className="slm-field-label">提示词（会注入生成）</label>
              <textarea className="slm-textarea" rows={4} placeholder="发送时注入到账号对话框的修饰文字，如：国风二次元插画风格，工笔线条，青绿山水配色，" value={p.prefix} onChange={D => {
            return h(A => {
              return {
                ...A,
                prefix: D.target.value
              };
            });
          }} />
            </div>
            <div className="slep-foot">
              {d !== 'new' ? <button type="button" className="btn sm danger" onClick={I}>
                  删除
                </button> : <span />}
              <div className="slep-foot-right">
                <button type="button" className="btn sm" onClick={P}>
                  取消
                </button>
                <button type="button" className="btn primary sm" onClick={j}>
                  保存
                </button>
              </div>
            </div>
          </div>
        </div>}
    </div>;
}