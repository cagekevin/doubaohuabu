// TODO(全局, 无需 import): data, selected, V, e, r, s, t, l, c, f, d, dataUrl, u, h, x, y, pe, o, v, k, left, q, N, ne, viewUrl, name, extensions, oe, ce, label, onClick, j, R, A, nodeId, imageUrl, U, instruction, _, z, J, H, D, n, m, w, C, aspectRatio, p, P, imgRef, I, se, b, E, S, a, F, M, O, ke
import { id, L, Hu, gS, yS, pt, Xt, on, QL, JL, Mn } from './shared.js';
import * as g from 'react';
import * as i from 'react';
export default function ZL({
  id: e,
  data: t,
  selected: n
}) {
  const r = L(V => {
    return V.nodes;
  });
  const s = L(V => {
    return V.edges;
  });
  const o = L(V => {
    return V.openImageGenPanel;
  });
  const a = g.useMemo(() => {
    return Hu(e, r, s);
  }, [e, r, s]);
  const l = t || {};
  const c = Array.isArray(l.results) ? l.results : [];
  const u = c.length > 0 || !!l.resultUrl;
  const d = l.viewUrl && c.some(V => {
    return V.dataUrl === l.viewUrl;
  }) ? l.viewUrl : l.resultUrl || c[0] && c[0].dataUrl || null;
  const f = l.aspectRatio || '1:1';
  const p = f === '9:16' ? '9 / 16' : f === '16:9' ? '16 / 9' : f === '4:3' ? '4 / 3' : f === '3:4' ? '3 / 4' : '1 / 1';
  g.useEffect(() => {
    if (!!u && !!d && l.dataUrl !== d) {
      try {
        L.getState().updateNodeData(e, {
          dataUrl: d
        });
      } catch {}
    }
  }, [e, u, d]);
  const h = g.useRef(null);
  const m = V => {
    h.current = {
      x: V.clientX,
      y: V.clientY
    };
  };
  const w = V => {
    const pe = h.current;
    h.current = null;
    if (!pe || !(Math.abs(V.clientX - pe.x) + Math.abs(V.clientY - pe.y) > 6)) {
      o(e);
    }
  };
  const [v, y] = g.useState(false);
  const [b, x] = g.useState(null);
  const k = g.useRef(null);
  const N = g.useRef(null);
  const C = V => {
    V.stopPropagation();
    if (v) {
      y(false);
      return;
    }
    const pe = k.current && k.current.getBoundingClientRect();
    if (pe) {
      const q = Math.max(8, Math.min(pe.left, window.innerWidth - 264 - 8));
      x({
        left: q,
        top: pe.bottom + 8
      });
    }
    y(true);
  };
  g.useEffect(() => {
    if (!v) {
      return;
    }
    const V = pe => {
      const ne = k.current && k.current.contains(pe.target);
      const q = N.current && N.current.contains(pe.target);
      if (!ne && !q) {
        y(false);
      }
    };
    document.addEventListener('mousedown', V);
    return () => {
      return document.removeEventListener('mousedown', V);
    };
  }, [v]);
  const S = V => {
    try {
      const pe = new Date(V);
      const ne = q => {
        return String(q).padStart(2, '0');
      };
      return `${ne(pe.getMonth() + 1)}-${ne(pe.getDate())} ${ne(pe.getHours())}:${ne(pe.getMinutes())}`;
    } catch {
      return '';
    }
  };
  const E = g.useCallback((V, pe) => {
    pe.stopPropagation();
    L.getState().updateNodeData(e, {
      viewUrl: V,
      dataUrl: V
    });
    y(false);
  }, [e]);
  const P = g.useCallback(async () => {
    const V = d;
    if (!V) {
      return;
    }
    const pe = L.getState();
    const ne = `文生图_${Date.now()}.png`;
    const q = window.api || {};
    try {
      let ce = '';
      if (q.downloadFileAs) {
        const oe = await q.downloadFileAs(V, ne, [{
          name: '图片文件',
          extensions: ['png']
        }]);
        if (oe && oe.canceled) {
          return;
        }
        if (!oe || !oe.ok) {
          pe.showToast('下载失败：' + (oe && oe.error || '未知错误'), 'warn', 5000);
          return;
        }
        ce = oe.path || '';
      } else if (q.downloadFile) {
        const oe = await q.downloadFile(V, ne);
        if (!oe || !oe.ok) {
          pe.showToast('下载失败：' + (oe && oe.error || '未知错误'), 'warn', 5000);
          return;
        }
        ce = oe.path || ne;
      } else {
        const oe = document.createElement('a');
        oe.href = V;
        oe.download = ne;
        document.body.appendChild(oe);
        oe.click();
        oe.remove();
        pe.showToast(`已下载：${ne}`, 'success', 6000);
        return;
      }
      pe.showToast(`已下载到：${ce || ne}`, 'success', 9000, ce && q.revealPath ? {
        label: '在文件夹中显示',
        onClick: () => {
          return q.revealPath(ce);
        }
      } : null);
    } catch (ce) {
      pe.showToast('下载失败：' + (ce && ce.message || '未知错误'), 'warn', 5000);
    }
  }, [d]);
  const j = l.analyzePrompt || null;
  const I = !!j && j.status === 'analyzing';
  const z = !!j && j.status === 'revising';
  const O = !!j && j.status === 'done';
  const R = !!j && (j.status === 'analyzing' || j.status === 'revising' || j.status === 'done' && (!!j.zh_prompt || !!j.en_prompt || !!j.json_prompt || !!j.raw));
  const [D, A] = g.useState(true);
  const [F, M] = g.useState('zh');
  const [U, _] = g.useState('');
  const H = g.useRef(null);
  const J = g.useRef(null);
  const se = g.useCallback(() => {
    if (d) {
      if (R) {
        A(true);
        return;
      }
      A(true);
      gS({
        nodeId: e,
        imageUrl: d
      });
    }
  }, [e, d, R]);
  const ke = g.useCallback(() => {
    const V = U.trim();
    if (!!V && !z) {
      yS({
        nodeId: e,
        instruction: V
      }).then(pe => {
        if (pe && pe.ok) {
          _('');
        }
      });
    }
  }, [e, U, z]);
  g.useEffect(() => {
    if (!D || !j) {
      return;
    }
    const V = pe => {
      const ne = pe.target;
      if ((!J.current || !J.current.contains(ne)) && (!H.current || !H.current.contains(ne))) {
        A(false);
      }
    };
    document.addEventListener('mousedown', V, true);
    return () => {
      return document.removeEventListener('mousedown', V, true);
    };
  }, [D, j]);
  return <i.Fragment>
      <div ref={H} className={`genvideo-node imggen-node${n ? ' is-selected' : ''}`} onPointerDown={m} onClick={w} title="点击卡片打开文生图面板（填提示词与参数，出图直接展示在这里）">
        <Mn type="target" position={pt.Left} />
        <Mn type="source" position={pt.Right} />
        <div className="gv-head">
          <span className="gv-dot ig-dot" />
          <span className="gv-title">文生图</span>
          {l.label && l.label !== '文生图' ? <span className="gv-label">{l.label}</span> : null}
          <span className="gv-head-grow" />
          {l.apiJob && l.apiJob.status && l.apiJob.status !== 'done' ? <span className="ig-chip-status">
              API {l.apiJob.status === 'failed' ? '失败' : '进行中'}
            </span> : null}
          {c.length > 0 ? <button ref={k} type="button" className={`gv-hist-btn nodrag${v ? ' is-open' : ''}`} title="历史版本：查看 / 切换历次生成的图片" onPointerDown={V => {
          return V.stopPropagation();
        }} onClick={C}>
              历史 {c.length}
            </button> : null}
        </div>
        <div className="gv-stage" style={{
        aspectRatio: p
      }}>
          {l.generating ? <div className="gv-waiting" aria-label="正在生成">
              <div className="gvw-dots">
                <span />
                <span />
                <span />
              </div>
              <div className="gvw-text">
                {u ? '正在生成新的一张…' : '正在生成 · 出图后展示在这里'}
              </div>
            </div> : null}
          {u ? <img className="gv-video ig-img" src={Xt(d, 720)} alt="" draggable={false} loading="lazy" decoding="async" key={d || 'img'} /> : <div className="gv-preview-empty">
              <div className="gv-preview-title">文生图 · 在下方输入提示词</div>
              <div className="gv-preview-sub">点击卡片打开生成面板，出图直接展示在这里</div>
            </div>}
          {u ? <button type="button" className="gv-dl nodrag" title="下载这张图" aria-label="下载" onPointerDown={V => {
          return V.stopPropagation();
        }} onClick={V => {
          V.stopPropagation();
          P();
        }}>
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 3v12" />
                <path d="m7 11 5 5 5-5" />
                <path d="M4 20h16" />
              </svg>
            </button> : null}
          {u && !l.generating ? <div className="mat-float-actions nodrag nopan">
              <button type="button" className="mat-edit-float" title="编辑图片（遮脸 / 裁剪）" onMouseDown={V => {
            return V.stopPropagation();
          }} onClick={V => {
            V.stopPropagation();
            L.getState().openImageEditor({
              nodeId: e,
              imgRef: d,
              label: l.label || '文生图'
            });
          }}>
                <svg width="11" height="11" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M4 20h4L18 10l-4-4L4 16v4z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
                  <path d="M14 6l4 4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
                <span>编辑图片</span>
              </button>
              <button type="button" className="mat-analyze-float" title="用后台空闲豆包 / Dola 账号反推图片提示词" disabled={I} onMouseDown={V => {
            return V.stopPropagation();
          }} onClick={V => {
            V.stopPropagation();
            se();
          }}>
                {I ? <span>分析中…</span> : <i.Fragment>
                    <svg width="11" height="11" viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M12 3v3m0 12v3m9-9h-3M6 12H3m13.5-6.5L14 9m-4 6l-2.5 2.5m11 0L14 15m-4-6L7.5 6.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                      <circle cx="12" cy="12" r="3.2" fill="none" stroke="currentColor" strokeWidth="2" />
                    </svg>
                    <span>分析提示词</span>
                  </i.Fragment>}
              </button>
            </div> : null}
          {v && c.length > 0 ? on.createPortal(<div className="gv-hist-pop" ref={N} style={b ? {
          left: b.left,
          top: b.top
        } : undefined} onMouseDown={V => {
          return V.stopPropagation();
        }} onClick={V => {
          return V.stopPropagation();
        }}>
                  <div className="gv-hist-title">历史版本 · 共 {c.length} 张</div>
                  {c.map((V, pe) => {
            const ne = V.dataUrl === d;
            return <button type="button" className={`gv-hist-item${ne ? ' is-sel' : ''}`} title={`切换到这张（#${pe + 1}）`} onClick={q => {
              return E(V.dataUrl, q);
            }} key={V.dataUrl}>
                        <img className="gv-hist-thumb" src={Xt(V.dataUrl, 120)} alt="" />
                        <span className="gv-hist-meta">
                          <span className="gv-hist-row">
                            #{pe + 1} · {S(V.ts)} · {V.accountName || '—'}
                          </span>
                          <span className="gv-hist-row">{V.ratio || '自动'}</span>
                          <span className="gv-hist-prompt">
                            {V.prompt ? V.prompt.slice(0, 24) : '（无提示词）'}
                          </span>
                        </span>
                      </button>;
          })}
                </div>, document.body) : null}
        </div>
        <div className="gv-meta">
          已连接 {a.length} 个输入 · {QL[l.channel] || '豆包后台'} · {f}
          {c.length ? ` · 已出 ${c.length} 张` : ''}
        </div>
      </div>
      {j && D ? <div ref={J} className="mat-prompt-pop nodrag nopan nowheel">
          <div className="mpp-head">
            <span className={`mpp-badge mpp-${j.status}`}>
              {j.status === 'analyzing' || j.status === 'revising' ? '生成中' : j.status === 'done' ? j.ok ? '完成' : '原文' : '失败'}
            </span>
            <span className="mpp-title">AI 提示词{j.accountName ? ` · ${j.accountName}` : ''}</span>
            <button type="button" className="mpp-close" title="收起" onClick={() => {
          return A(false);
        }}>
              ×
            </button>
          </div>
          <div className="mpp-body" key={`${j.status}-${j.at || ''}`}>
            {j.status === 'error' ? <div className="mpp-error">{j.error}</div> : j.status === 'analyzing' || j.status === 'revising' ? <div className="mpp-wait">
                <div className="mpp-wait-row">
                  <span className="mpp-spinner" aria-hidden="true" />
                  <span className="mpp-wait-text">{j.phase || '正在分析，请稍候…'}</span>
                </div>
                <div className="mpp-shimmer">
                  <span />
                  <span />
                  <span />
                </div>
              </div> : <i.Fragment>
                <div className="mpp-tabs">
                  <button className={F === 'zh' ? 'on' : ''} onClick={() => {
              return M('zh');
            }}>
                    中文
                  </button>
                  <button className={F === 'en' ? 'on' : ''} onClick={() => {
              return M('en');
            }}>
                    英文
                  </button>
                  <button className={F === 'json' ? 'on' : ''} onClick={() => {
              return M('json');
            }}>
                    JSON
                  </button>
                  <span className="mpp-tabs-gap" />
                  <button type="button" className="mpp-copy" title={`复制${F === 'zh' ? '中文' : F === 'en' ? '英文' : 'JSON'}`} onMouseDown={V => {
              return V.stopPropagation();
            }} onClick={V => {
              V.stopPropagation();
              const pe = F === 'zh' ? j.zh_prompt : F === 'en' ? j.en_prompt : j.json_prompt ? JSON.stringify(j.json_prompt, null, 2) : '';
              JL(pe);
            }}>
                    <svg width="10" height="10" viewBox="0 0 24 24" aria-hidden="true">
                      <rect x="9" y="9" width="11" height="11" rx="2" fill="none" stroke="currentColor" strokeWidth="2" />
                      <path d="M5 15V5a2 2 0 0 1 2-2h10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                    <span>复制</span>
                  </button>
                </div>
                <div className="mpp-content" key={F}>
                  {F === 'zh' && <pre className="mpp-pre">{j.zh_prompt || ''}</pre>}
                  {F === 'en' && <pre className="mpp-pre">{j.en_prompt || ''}</pre>}
                  {F === 'json' && <pre className="mpp-pre">
                      {j.json_prompt && typeof j.json_prompt == 'object' ? Object.entries(j.json_prompt).map(([V, pe]) => {
                return `${V}: ${Array.isArray(pe) ? pe.join('；') : pe}`;
              }).join(`
`) : j.json_prompt || '(无结构化 JSON)'}
                    </pre>}
                </div>
                {j.error ? <div className="mpp-error">{j.error}</div> : null}
              </i.Fragment>}
          </div>
          {O ? <div className="mpp-revise">
              <input type="text" className="mpp-revise-input" placeholder="想怎么改？如：改成夜景、换成俯拍镜头…" value={U} disabled={z} onMouseDown={V => {
          return V.stopPropagation();
        }} onChange={V => {
          return _(V.target.value);
        }} onKeyDown={V => {
          if (V.key === 'Enter') {
            ke();
          }
        }} />
              <button type="button" className="mpp-revise-btn" disabled={z || !U.trim()} onMouseDown={V => {
          return V.stopPropagation();
        }} onClick={V => {
          V.stopPropagation();
          ke();
        }}>
                {z ? <span className="mpp-spinner mpp-spinner-sm" aria-hidden="true" /> : '调整'}
              </button>
            </div> : null}
        </div> : null}
    </i.Fragment>;
}