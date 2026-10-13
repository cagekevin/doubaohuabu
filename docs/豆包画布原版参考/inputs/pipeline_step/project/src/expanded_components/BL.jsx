// TODO(全局, 无需 import): data, selected, t, updateNode, setNodes, setCenter, y, Be, A, I, o, v, r, e, f, V, se, pe, ke, ne, label, ee, U, H, it, Nt, gt, w, Ke, kt, Ct, xt, zoom, duration, m, Q, _, prompt, model, ratio, styleId, anchorNodeId, De, c, u, h, me, width, height, style, ce, le, he, X, At, Ve, Ee, je, re, Ie, oe, n, J, Qe, ze, a, l, M, Je, C, S, P, x, b, N, E, Rt, z, O, D, F, R, d, ct, p, s, ut, et, k, j, wt, q, _t, zt, left, Mt
import _cmp__Component28 from './_Component28.jsx';
import _cmp__Component30 from './_Component30.jsx';
import { id, Kr, lR, uR, dR, tm, F$, L, fR, IT, qy, cR, Rk, z$, qd, zL, FL } from './shared.js';
import * as g from 'react';
import * as i from 'react';
export default function BL({
  id: e,
  data: t,
  selected: n
}) {
  const r = t && t.url || '';
  const s = t && t.vid || '';
  const o = t && t.label || '视频';
  const a = t && t.accountName || '';
  const l = t && t.duration;
  const c = t && t.width;
  const u = t && t.height;
  const d = t && t.poster || '';
  const [f, p] = g.useState(false);
  const {
    updateNode: h,
    setNodes: m,
    setCenter: w
  } = Kr();
  const v = g.useRef(null);
  const y = lR({
    data: t
  });
  const b = uR(y);
  const x = dR(y);
  const k = tm({
    data: t
  });
  const N = F$({
    data: t
  });
  const [C, S] = g.useState(false);
  const [E, P] = g.useState(false);
  const [j, I] = g.useState('');
  const [z, O] = g.useState(false);
  const [R, D] = g.useState('');
  const A = L(Be => {
    return Be.nodes;
  });
  const F = L(Be => {
    return Be.pullResultFn;
  });
  const M = fR({
    data: t
  }, A);
  const U = t && (t.sourceNodeId || t.gridAnchor) || '';
  const _ = L(Be => {
    return Be.addTextNodeFromRecipe;
  });
  const H = g.useCallback(Be => {
    I(Be);
    setTimeout(() => {
      return I('');
    }, 2200);
  }, []);
  const [J, se] = g.useState(false);
  const [ke, V] = g.useState(o);
  const pe = g.useRef(null);
  const ne = L(Be => {
    return Be.updateNodeData;
  });
  const [q, ce] = g.useState(false);
  const [oe, he] = g.useState(0);
  const [Ie, De] = g.useState(0);
  const le = g.useRef(null);
  const [te, X] = g.useState(false);
  const [re, Ee] = g.useState(false);
  const [je, Ve] = g.useState('');
  g.useEffect(() => {
    const Be = v.current;
    if (Be && r && !f) {
      IT(e, Be);
    } else {
      qy(e);
    }
    return () => {
      return qy(e);
    };
  }, [e, r, f]);
  const ze = g.useCallback(Be => {
    Be.stopPropagation();
    V(o);
    se(true);
    requestAnimationFrame(() => {
      if (pe.current) {
        pe.current.focus();
        pe.current.select();
      }
    });
  }, [o]);
  const Qe = g.useCallback(() => {
    const Be = ke.trim();
    if (Be && Be !== o) {
      ne(e, {
        label: Be
      });
    }
    se(false);
  }, [ke, o, e, ne]);
  const Je = g.useCallback(Be => {
    var Nt;
    var gt;
    var Ke;
    var Ct;
    Be.stopPropagation();
    if (!U) {
      return;
    }
    const it = (L.getState().nodes || []).find(ee => {
      return ee.id === U;
    });
    if (!it) {
      H('源节点已不存在');
      return;
    }
    const kt = it.width || ((Nt = it.measured) == null ? undefined : Nt.width) || 440;
    const xt = it.height || ((gt = it.measured) == null ? undefined : gt.height) || 300;
    w((((Ke = it.position) == null ? undefined : Ke.x) || 0) + kt / 2, (((Ct = it.position) == null ? undefined : Ct.y) || 0) + xt / 2, {
      zoom: 0.8,
      duration: 420
    });
    m(ee => {
      return ee.map(Q => {
        return {
          ...Q,
          selected: Q.id === U
        };
      });
    });
  }, [U, w, m, H]);
  const ut = g.useCallback(async Be => {
    Be.stopPropagation();
    if (!y) {
      return;
    }
    const it = [y.prompt || ''];
    const kt = [];
    if (y.model) {
      kt.push(`模型 ${y.model}`);
    }
    if (y.duration) {
      kt.push(`时长 ${y.duration}s`);
    }
    if (y.ratio) {
      kt.push(`比例 ${y.ratio}`);
    }
    if (kt.length) {
      it.push(`（${kt.join(' / ')}）`);
    }
    const xt = it.join('');
    try {
      await navigator.clipboard.writeText(xt);
      H('配方已复制');
    } catch {
      H('复制失败，请手动选择文本');
    }
  }, [y, H]);
  const et = g.useCallback(Be => {
    Be.stopPropagation();
    if (!y) {
      H('该视频没有配方，无法重跑');
      return;
    }
    const it = cR(y);
    const kt = _({
      prompt: it.prompt,
      model: it.model,
      duration: it.duration,
      ratio: it.ratio,
      styleId: it.styleId,
      anchorNodeId: e
    });
    H(kt ? '已按配方新建文本框' : '新建失败');
  }, [y, _, e, H]);
  const ct = g.useCallback(Be => {
    const it = Be.currentTarget;
    const kt = it.videoWidth;
    const xt = it.videoHeight;
    De(it.duration || 0);
    if (!kt || !xt) {
      return;
    }
    const Nt = kt / xt;
    const gt = c && u ? c / u : null;
    if (gt != null && Math.abs(gt - Nt) < 0.02) {
      return;
    }
    const Ke = 320;
    const Ct = 460;
    let ee = Ke;
    let Q = Math.round(ee / Nt);
    if (Q > Ct) {
      Q = Ct;
      ee = Math.round(Ct * Nt);
    }
    if (ee > Ct) {
      ee = Ct;
      Q = Math.round(Ct / Nt);
    }
    h(e, me => {
      return {
        ...me,
        width: ee,
        height: Q,
        style: {
          ...(me.style || {}),
          width: ee,
          height: Q
        },
        data: {
          ...me.data,
          width: kt,
          height: xt
        }
      };
    });
  }, [e, h, c, u]);
  const wt = g.useCallback(() => {
    const Be = v.current;
    if (Be) {
      if (Be.paused) {
        Be.play().then(() => {
          return ce(true);
        }).catch(() => {});
      } else {
        Be.pause();
        ce(false);
      }
    }
  }, []);
  const At = g.useCallback(Be => {
    const it = v.current;
    const kt = le.current;
    if (!it || !kt || !it.duration) {
      return;
    }
    const xt = kt.getBoundingClientRect();
    if (!xt.width) {
      return;
    }
    let Nt = (Be - xt.left) / xt.width;
    Nt = Math.max(0, Math.min(1, Nt));
    const gt = Nt * it.duration;
    try {
      it.currentTime = gt;
    } catch {}
    he(gt);
  }, []);
  const _t = g.useCallback(Be => {
    Be.stopPropagation();
    X(true);
    At(Be.clientX);
    const it = xt => {
      return At(xt.clientX);
    };
    const kt = () => {
      X(false);
      window.removeEventListener('pointermove', it);
      window.removeEventListener('pointerup', kt);
    };
    window.addEventListener('pointermove', it);
    window.addEventListener('pointerup', kt);
  }, [At]);
  const Mt = g.useCallback(async () => {
    if (!re) {
      if (!window.api || !window.api.captureRect) {
        Ve('截图需在 Electron 环境中运行');
        setTimeout(() => {
          return Ve('');
        }, 2600);
        return;
      }
      Ee(true);
      Ve('');
      try {
        if (!(await Rk(e))) {
          Ve('截图失败，请确认视频在可见区域');
        }
      } catch (Be) {
        Ve('截图失败：' + (Be && Be.message ? Be.message : '未知错误'));
      } finally {
        Ee(false);
        if (je) {
          setTimeout(() => {
            return Ve('');
          }, 2600);
        }
      }
    }
  }, [e, re, je]);
  const zt = Ie > 0 ? Math.max(0, Math.min(100, oe / Ie * 100)) : 0;
  const Rt = z$({
    data: t
  });
  return <i.Fragment>
      <div className={`video-node ${n ? 'selected' : ''}`}>
        <_cmp__Component28 minWidth={200} minHeight={170} isVisible={n} lineClassName="r-line" handleClassName="r-handle" />
        <div className="node-head">
          <span className="dot video-dot" />
          {J ? <input ref={pe} className="video-rename-input nodrag nopan nowheel" value={ke} onChange={Be => {
          return V(Be.target.value);
        }} onBlur={Qe} onKeyDown={Be => {
          if (Be.key === 'Enter') {
            Qe();
          }
          if (Be.key === 'Escape') {
            se(false);
            Be.preventDefault();
          }
        }} onMouseDown={Be => {
          return Be.stopPropagation();
        }} /> : <span className="video-node-title" onDoubleClick={ze} title="双击重命名">
              {o}
            </span>}
          {a && <span className="video-node-account">{a}</span>}
          {l ? <span className="video-node-dur">{qd(l)}</span> : null}
          {c && u ? <span className="video-node-res">
              {c}×{u}
            </span> : null}
        </div>
        <div className="vn-provenance nodrag nopan" onPointerDown={Be => {
        return Be.stopPropagation();
      }}>
          {M ? <button className="vn-src-chip" onClick={Je} title={`来自：${M}（点击定位到源节点）`}>
              <span className="vn-src-ico">↩</span>
              <span className="vn-src-text">来自：{M}</span>
            </button> : null}
          {y ? <button className={`vn-recipe-chip${C ? ' on' : ''}`} onClick={Be => {
          Be.stopPropagation();
          S(it => {
            return !it;
          });
          P(false);
        }} title={x || '查看生成配方'}>
              <span className="vn-recipe-ico">≡</span>
              <span className="vn-recipe-text">{b || '查看配方'}</span>
            </button> : <span className="vn-norecipe" title="该视频没有记录生成配方（多为旧版本产出或手动添加）">
              无配方
            </span>}
          {N.total > 1 ? <button className={`vn-hist-chip${E ? ' on' : ''}`} onClick={Be => {
          Be.stopPropagation();
          P(it => {
            return !it;
          });
          S(false);
        }} title={`出片记录：共 ${N.total} 次`}>
              ×{N.total}
            </button> : null}
          {Rt ? <button type="button" className={`vn-pull-chip${z ? ' pulling' : ''}`} disabled={!F || z} title="该次生成已记录会话/视频 id，可回到豆包拉取结果（不重发、不扣额度）" onClick={async Be => {
          Be.stopPropagation();
          if (!F) {
            H('拉取通道未就绪');
            return;
          }
          O(true);
          D('');
          try {
            const it = await F(e);
            if (it && it.ok) {
              H('已拉取到结果');
            } else {
              D(it && (it.error || it.note) ? `${it.error || it.note}` : '拉取失败');
            }
          } catch (it) {
            D(it && it.message ? it.message : '拉取失败');
          } finally {
            O(false);
            if (R) {
              setTimeout(() => {
                return D('');
              }, 3200);
            }
          }
        }}>
              {z ? '拉取中…' : '可拉取'}
            </button> : null}
          {R ? <span className="vn-pull-err">{R}</span> : null}
        </div>
        <div className="video-node-body">
          {r && !f ? <video ref={v} className="video-node-video" src={r} poster={d || undefined} preload="metadata" playsInline={true} onLoadedMetadata={ct} onPlay={() => {
          return ce(true);
        }} onPause={() => {
          return ce(false);
        }} onTimeUpdate={Be => {
          if (!te) {
            he(Be.currentTarget.currentTime);
          }
        }} onEnded={() => {
          return ce(false);
        }} onError={() => {
          return p(true);
        }} /> : <div className="video-node-fallback">
              <div className="vnf-icon">▶</div>
              <div className="vnf-text">视频加载失败</div>
              {s && <div className="vnf-vid">{s}</div>}
            </div>}
          {C && y ? <div className="vn-panel nodrag nopan nowheel" onPointerDown={Be => {
          return Be.stopPropagation();
        }}>
              <div className="vn-panel-head">
                <span>生成配方</span>
                <button className="vn-panel-close" onClick={Be => {
              Be.stopPropagation();
              S(false);
            }}>
                  ✕
                </button>
              </div>
              <div className="vn-panel-body">
                <div className="vn-prompt">{y.prompt || '（无提示词）'}</div>
                <div className="vn-specs">
                  {y.model ? <span className="vn-spec">模型 {y.model}</span> : null}
                  {y.duration ? <span className="vn-spec">{y.duration}s</span> : null}
                  {y.ratio ? <span className="vn-spec">{y.ratio}</span> : null}
                  {y.styleName ? <span className="vn-spec">{y.styleName}</span> : null}
                  {(y.images || []).length ? <span className="vn-spec">参考图×{y.images.length}</span> : null}
                  {(y.textRefs || []).length ? <span className="vn-spec">引用文本×{y.textRefs.length}</span> : null}
                  {y.accountName ? <span className="vn-spec">{y.accountName}</span> : null}
                </div>
                {(y.images || []).length ? <div className="vn-imgs">
                    {(y.images || []).map((Be, it) => {
                return <span className="vn-img-tag" key={`${Be.label}-${it}`}>
                          {Be.label}
                        </span>;
              })}
                  </div> : null}
              </div>
              <div className="vn-panel-foot">
                <button className="vn-act" onClick={ut}>
                  复制配方
                </button>
                <button className="vn-act primary" onClick={et}>
                  按配方重跑
                </button>
              </div>
            </div> : null}
          {E && k.length ? <div className="vn-panel nodrag nopan nowheel" onPointerDown={Be => {
          return Be.stopPropagation();
        }}>
              <div className="vn-panel-head">
                <span>出片记录（{k.length}）</span>
                <button className="vn-panel-close" onClick={Be => {
              Be.stopPropagation();
              P(false);
            }}>
                  ✕
                </button>
              </div>
              <div className="vn-panel-body">
                {k.slice().reverse().map(Be => {
              return <div className={`vn-attempt ${Be.status || ''}`} key={Be.id}>
                        <span className="vn-at-time">{zL(Be.at)}</span>
                        <span className="vn-at-acc">{Be.accountName || '—'}</span>
                        <span className="vn-at-status">{FL[Be.status] || Be.status || ''}</span>
                        {Be.note ? <span className="vn-at-note">{Be.note}</span> : null}
                      </div>;
            })}
              </div>
            </div> : null}
          {j ? <div className="vn-flash">{j}</div> : null}
        </div>
        {r && !f && <div className="video-controls nodrag nopan nowheel" onPointerDown={Be => {
        return Be.stopPropagation();
      }}>
            <button className="vt-btn" onClick={wt} title={q ? '暂停' : '播放'}>
              {q ? '❚❚' : '▶'}
            </button>
            <div className="video-timeline" ref={le} onPointerDown={_t} title="点击或拖动选择时间点">
              <div className="vt-fill" style={{
            width: `${zt}%`
          }} />
              <div className="vt-knob" style={{
            left: `${zt}%`
          }} />
            </div>
            <span className="vt-time">
              {qd(oe)} / {qd(Ie || l || 0)}
            </span>
            <button className={`vt-btn vt-shot${re ? ' busy' : ''}`} onClick={Mt} disabled={re} title="截取当前画面为图片素材（快捷键 S）">
              {re ? '…' : '📷'}
            </button>
          </div>}
        {je && <div className="video-shot-err">{je}</div>}
      </div>
      <_cmp__Component30 />
    </i.Fragment>;
}