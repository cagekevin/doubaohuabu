// TODO(全局, 无需 import): data, selected, t, r, o, U, u, h, w, nodeId, e, imageUrl, b, instruction, _, x, f, N, H, k, m, E, a, naturalWidth, naturalHeight, D, se, J, P, O, z, j, I, c, l, label, name, n, M, F, s, A, R, imgRef, d, C, v, y, p, S
import _cmp__Component28 from './_Component28.jsx';
import _cmp__Component30 from './_Component30.jsx';
import _cmp__Component31 from './_Component31.jsx';
import _cmp__Component32 from './_Component32.jsx';
import { id, Xt, L, gS, yS, cL, _Component29 } from './shared.js';
import * as g from 'react';
import * as i from 'react';
export default function fL({
  id: e,
  data: t,
  selected: n
}) {
  const r = t && t.dataUrl || '';
  const s = g.useMemo(() => {
    return Xt(r, 480);
  }, [r]);
  const o = t && t.label || '';
  const a = o && o !== 'undefined' ? o : '素材';
  const l = L(U => {
    return U.updateNodeData;
  });
  const c = L(U => {
    return U.renameMaterialNode;
  });
  const u = t && t.analyzePrompt || null;
  const d = !!u && u.status === 'analyzing';
  const f = !!u && u.status === 'revising';
  const p = !!u && u.status === 'done';
  const h = !!u && (u.status === 'analyzing' || u.status === 'revising' || u.status === 'done' && (!!u.zh_prompt || !!u.en_prompt || !!u.json_prompt || !!u.raw));
  const [m, w] = g.useState(true);
  const [v, y] = g.useState('zh');
  const [b, x] = g.useState('');
  const k = g.useRef(null);
  const N = g.useRef(null);
  const C = g.useCallback(() => {
    if (r) {
      if (h) {
        w(true);
        return;
      }
      w(true);
      gS({
        nodeId: e,
        imageUrl: r
      });
    }
  }, [e, r, h]);
  const S = g.useCallback(() => {
    const U = b.trim();
    if (!!U && !f) {
      yS({
        nodeId: e,
        instruction: U
      }).then(_ => {
        if (_ && _.ok) {
          x('');
        }
      });
    }
  }, [e, b, f]);
  const E = !!u;
  g.useEffect(() => {
    if (!m || !E) {
      return;
    }
    const U = _ => {
      const H = _.target;
      if ((!N.current || !N.current.contains(H)) && (!k.current || !k.current.contains(H))) {
        w(false);
      }
    };
    document.addEventListener('mousedown', U, true);
    return () => {
      return document.removeEventListener('mousedown', U, true);
    };
  }, [m, E]);
  const [P, j] = g.useState(false);
  const [I, z] = g.useState(a);
  const O = g.useRef(null);
  const [R, D] = g.useState({
    w: 0,
    h: 0
  });
  const A = g.useCallback(U => {
    const _ = U.currentTarget;
    if (!_ || !_.naturalWidth || !_.naturalHeight) {
      return;
    }
    const {
      naturalWidth: H,
      naturalHeight: J
    } = _;
    D(se => {
      if (se.w === H && se.h === J) {
        return se;
      } else {
        return {
          w: H,
          h: J
        };
      }
    });
  }, []);
  g.useEffect(() => {
    if (P && O.current) {
      O.current.focus();
      O.current.select();
    }
  }, [P]);
  const F = g.useCallback(U => {
    if (U) {
      U.stopPropagation();
    }
    z(a);
    j(true);
  }, [a]);
  const M = g.useCallback(() => {
    const U = I.trim();
    if (U && U !== a) {
      if (typeof c == 'function') {
        c(e, U);
      } else {
        l(e, {
          label: U,
          name: U
        });
      }
    }
    j(false);
  }, [I, a, e, l, c]);
  return <i.Fragment>
      <div ref={k} className={`material-node ${n ? 'selected' : ''}`}>
        <_cmp__Component28 minWidth={140} minHeight={100} isVisible={n} lineClassName="r-line" handleClassName="r-handle" />
        <div className="node-head">
          <span className="dot material-dot" />
          {P ? <input ref={O} className="video-rename-input nodrag nopan nowheel" value={I} onChange={U => {
          return z(U.target.value);
        }} onBlur={M} onKeyDown={U => {
          if (U.key === 'Enter') {
            M();
          }
          if (U.key === 'Escape') {
            j(false);
            U.preventDefault();
          }
        }} onMouseDown={U => {
          return U.stopPropagation();
        }} onClick={U => {
          return U.stopPropagation();
        }} onDoubleClick={U => {
          return U.stopPropagation();
        }} /> : <span className="material-node-title" onDoubleClick={F} title="双击重命名">
              素材 · {a}
            </span>}
        </div>
        <div className="material-img-wrap">
          {r ? <div className="material-img-inner">
              <img src={s} alt={a} draggable={false} loading="lazy" decoding="async" onLoad={A} />
              <_Component29 nodeId={e} src={r} natW={R.w || t && t.natW || 0} natH={R.h || t && t.natH || 0} label={a} />
            </div> : <div className="material-placeholder">暂无图片</div>}
          {r ? <div className="mat-float-actions nodrag nopan">
              <button type="button" className="mat-edit-float" title="编辑图片（遮脸 / 裁剪）" onMouseDown={U => {
            return U.stopPropagation();
          }} onClick={U => {
            U.stopPropagation();
            L.getState().openImageEditor({
              nodeId: e,
              imgRef: r,
              label: a
            });
          }}>
                <svg width="11" height="11" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M4 20h4L18 10l-4-4L4 16v4z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
                  <path d="M14 6l4 4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
                <span>编辑图片</span>
              </button>
              <button type="button" className="mat-analyze-float" title="用后台空闲豆包 / Dola 账号反推图片提示词" disabled={d} onMouseDown={U => {
            return U.stopPropagation();
          }} onClick={U => {
            U.stopPropagation();
            C();
          }}>
                {d ? <span>分析中…</span> : <i.Fragment>
                    <svg width="11" height="11" viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M12 3v3m0 12v3m9-9h-3M6 12H3m13.5-6.5L14 9m-4 6l-2.5 2.5m11 0L14 15m-4-6L7.5 6.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                      <circle cx="12" cy="12" r="3.2" fill="none" stroke="currentColor" strokeWidth="2" />
                    </svg>
                    <span>分析提示词</span>
                  </i.Fragment>}
              </button>
            </div> : null}
        </div>
      </div>
      <_cmp__Component30 />
      {u && m ? <div ref={N} className="mat-prompt-pop nodrag nopan nowheel">
          <div className="mpp-head">
            <span className={`mpp-badge mpp-${u.status}`}>
              {u.status === 'analyzing' || u.status === 'revising' ? '生成中' : u.status === 'done' ? u.ok ? '完成' : '原文' : '失败'}
            </span>
            <span className="mpp-title">AI 提示词{u.accountName ? ` · ${u.accountName}` : ''}</span>
            <button type="button" className="mpp-close" title="收起" onClick={() => {
          return w(false);
        }}>
              ×
            </button>
          </div>
          <div className="mpp-body" key={`${u.status}-${u.at || ''}`}>
            {u.status === 'error' ? <div className="mpp-error">{u.error}</div> : u.status === 'analyzing' || u.status === 'revising' ? <_cmp__Component31 ap={u} /> : <i.Fragment>
                <div className="mpp-tabs">
                  <button className={v === 'zh' ? 'on' : ''} onClick={() => {
              return y('zh');
            }}>
                    中文
                  </button>
                  <button className={v === 'en' ? 'on' : ''} onClick={() => {
              return y('en');
            }}>
                    英文
                  </button>
                  <button className={v === 'json' ? 'on' : ''} onClick={() => {
              return y('json');
            }}>
                    JSON
                  </button>
                  <span className="mpp-tabs-gap" />
                  <button type="button" className="mpp-copy" title={`复制${v === 'zh' ? '中文' : v === 'en' ? '英文' : 'JSON'}`} onMouseDown={U => {
              return U.stopPropagation();
            }} onClick={U => {
              U.stopPropagation();
              const _ = v === 'zh' ? u.zh_prompt : v === 'en' ? u.en_prompt : u.json_prompt ? JSON.stringify(u.json_prompt, null, 2) : '';
              cL(_);
            }}>
                    <svg width="10" height="10" viewBox="0 0 24 24" aria-hidden="true">
                      <rect x="9" y="9" width="11" height="11" rx="2" fill="none" stroke="currentColor" strokeWidth="2" />
                      <path d="M5 15V5a2 2 0 0 1 2-2h10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                    <span>复制</span>
                  </button>
                </div>
                <div className="mpp-content" key={v}>
                  {v === 'zh' && <pre className="mpp-pre">{u.zh_prompt || ''}</pre>}
                  {v === 'en' && <pre className="mpp-pre">{u.en_prompt || ''}</pre>}
                  {v === 'json' && <_cmp__Component32 json={u.json_prompt} />}
                </div>
                {u.error ? <div className="mpp-error">{u.error}</div> : null}
              </i.Fragment>}
          </div>
          {p ? <div className="mpp-revise">
              <input type="text" className="mpp-revise-input" placeholder="想怎么改？如：改成夜景、换成俯拍镜头…" value={b} disabled={f} onMouseDown={U => {
          return U.stopPropagation();
        }} onChange={U => {
          return x(U.target.value);
        }} onKeyDown={U => {
          if (U.key === 'Enter') {
            S();
          }
        }} />
              <button type="button" className="mpp-revise-btn" disabled={f || !b.trim()} onMouseDown={U => {
          return U.stopPropagation();
        }} onClick={U => {
          U.stopPropagation();
          S();
        }}>
                {f ? <span className="mpp-spinner mpp-spinner-sm" aria-hidden="true" /> : '调整'}
              </button>
            </div> : null}
        </div> : null}
    </i.Fragment>;
}