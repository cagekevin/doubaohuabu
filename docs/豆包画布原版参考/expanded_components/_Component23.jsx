// TODO(全局, 无需 import): account, onClose, te, p, f, message, type, X, re, y, n, e, S, N, C, P, j, I, R, D, M, U, h, Ee, c, u, s, A, o, w, b, phase, found, total, done, ok, fail, seen, O, haveUrls, limit, maxCanvases, canvasId, useDom, onStatus, je, note, onItem, r, m, x, v, Ve, name, dataUrl, natW, natH, source, a, l, gap, scale, J, De, t, H, ce, ke, pe, V, oe, Ie, q, width, k, display, he, z, E, se, F, ne, le, _, d
import { L, Dd, ao, Yl, xp, bP, Pu, i0, vl, ja, Xt, l0, br } from './shared.js';
import * as g from 'react';
import * as i from 'react';
export default function _Component23({
  account: e,
  onClose: t
}) {
  const n = L(te => {
    return te.lovartGalleries;
  });
  const r = L(te => {
    return te.addLovartImages;
  });
  const s = L(te => {
    return te.removeLovartImages;
  });
  const o = L(te => {
    return te.clearLovartGallery;
  });
  const a = L(te => {
    return te.nodes;
  });
  const l = L(te => {
    return te.addMaterialsBatch;
  });
  const [c, u] = g.useState(() => {
    return new Set();
  });
  const [d, f] = g.useState(null);
  const p = g.useRef(null);
  const h = g.useCallback((te, X = 'ok', re = 3500) => {
    if (p.current) {
      clearTimeout(p.current);
    }
    f({
      message: te,
      type: X
    });
    p.current = setTimeout(() => {
      return f(null);
    }, re);
  }, []);
  const [m, w] = g.useState(false);
  const v = g.useRef(null);
  const [y, b] = g.useState(null);
  const x = !!y && y.phase !== 'done';
  const k = y && y.total > 0 ? Math.round((y.done || 0) / y.total * 100) : 0;
  const N = g.useMemo(() => {
    return [...(n && n[e.id] || [])].sort((X, re) => {
      return (re.addedAt || 0) - (X.addedAt || 0);
    });
  }, [n, e.id]);
  const [C, S] = g.useState(Dd);
  g.useEffect(() => {
    S(Dd);
  }, [e.id, N.length === 0]);
  const E = g.useMemo(() => {
    return N.slice(0, C);
  }, [N, C]);
  const P = N.length > C;
  const j = g.useRef(null);
  const I = g.useCallback(() => {
    if (P) {
      S(te => {
        return te + Dd;
      });
    }
  }, [P]);
  const z = g.useCallback(() => {
    const te = j.current;
    if (te && te.scrollTop + te.clientHeight >= te.scrollHeight - 240) {
      I();
    }
  }, [I]);
  const O = g.useRef(new Set());
  const [R, D] = g.useState(-1);
  const A = R >= 0 && N[R] || null;
  const F = g.useCallback(te => {
    const X = N.findIndex(re => {
      return re.id === te;
    });
    if (X >= 0) {
      D(X);
    }
  }, [N]);
  const M = g.useCallback(() => {
    return D(-1);
  }, []);
  const U = g.useCallback(te => {
    D(X => {
      if (X < 0 || N.length === 0) {
        return X;
      } else {
        return (X + te + N.length) % N.length;
      }
    });
  }, [N.length]);
  g.useEffect(() => {
    if (R < 0) {
      return;
    }
    const te = X => {
      if (X.key === 'Escape') {
        M();
      } else if (X.key === 'ArrowLeft') {
        U(-1);
      } else if (X.key === 'ArrowRight') {
        U(1);
      }
    };
    window.addEventListener('keydown', te);
    return () => {
      return window.removeEventListener('keydown', te);
    };
  }, [R, M, U]);
  const _ = g.useCallback(te => {
    if (!te) {
      return;
    }
    const X = te.sourceUrl || '';
    if (!X) {
      h('这条没有记录来源地址（可能是从磁盘导入的）', 'warn', 4000);
      return;
    }
    const re = ao(X);
    try {
      if (window.api && typeof window.api.openExternal == 'function') {
        window.api.openExternal(re);
        h('已在浏览器打开原始图片', 'ok', 2500);
      } else {
        window.open(re, '_blank');
      }
    } catch (Ee) {
      h(`打开失败：${Ee && Ee.message || '未知错误'}`, 'err', 4000);
    }
  }, [h]);
  const H = N.length;
  const J = c.size;
  const se = te => {
    u(X => {
      const re = new Set(X);
      if (re.has(te)) {
        re.delete(te);
      } else {
        re.add(te);
      }
      return re;
    });
  };
  const ke = () => {
    return u(new Set(N.map(te => {
      return te.id;
    })));
  };
  const V = () => {
    return u(new Set());
  };
  const pe = () => {
    u(te => {
      const X = new Set();
      N.forEach(re => {
        if (!te.has(re.id)) {
          X.add(re.id);
        }
      });
      return X;
    });
  };
  const ne = te => {
    s(e.id, [te]);
    u(X => {
      if (!X.has(te)) {
        return X;
      }
      const re = new Set(X);
      re.delete(te);
      return re;
    });
    if (A && A.id === te) {
      D(-1);
    }
  };
  const q = () => {
    if (N.length !== 0 && window.confirm(`确定清空「${e.name}」画廊的全部 ${N.length} 张图片？此操作不可撤销。`)) {
      o(e.id);
      u(new Set());
      D(-1);
      h('已清空画廊', 'ok');
    }
  };
  const ce = g.useCallback(async () => {
    if (!m && !x) {
      w(true);
      b({
        phase: 'scanning',
        found: 0,
        total: 0,
        done: 0,
        ok: 0,
        fail: 0
      });
      try {
        const te = await Yl(e);
        if (!te) {
          b(null);
          h('请先在 Tapnow 里打开要扫描的画布页（/canvas/…），只抓当前画布', 'warn', 6500);
          return;
        }
        const X = await xp({
          account: e,
          seen: O.current,
          haveUrls: new Set(N.map(re => {
            return re.sourceUrl;
          }).filter(Boolean)),
          limit: bP,
          maxCanvases: 1,
          canvasId: te,
          useDom: true,
          onStatus: re => {
            b(Ee => {
              const je = Ee || {
                found: 0,
                total: 0,
                done: 0,
                ok: 0,
                fail: 0
              };
              if (re.phase === 'scanning') {
                return {
                  ...je,
                  phase: 'scanning',
                  note: re.message || ''
                };
              } else if (re.phase === 'found') {
                return {
                  ...je,
                  phase: 'scanning',
                  total: re.candidates || 0,
                  note: re.message || ''
                };
              } else if (re.phase === 'working') {
                return {
                  ...je,
                  phase: 'fetching',
                  done: re.done || 0,
                  total: re.total || je.total,
                  ok: re.added || 0,
                  fail: re.failed || 0,
                  note: re.message || ''
                };
              } else if (re.phase === 'done') {
                return {
                  ...je,
                  phase: 'done',
                  done: re.done || 0,
                  total: re.total || je.total,
                  ok: re.added || 0,
                  fail: re.failed || 0,
                  note: re.message || ''
                };
              } else {
                return je;
              }
            });
          },
          onItem: re => {
            r(e.id, [re]);
          }
        });
        if (!X.ok) {
          b(null);
          if (X.error === 'not_open') {
            h(X.message || '没有找到该账号的 Tapnow 页面，请先在左侧选中这个账号', 'warn', 7000);
          } else if (X.error === 'http_401' || X.error === 'http_403') {
            h('登录态已失效：请在该账号的 Tapnow 页面重新登录后再扫描', 'err', 7000);
          } else {
            h(X.message || X.error || '抓取失败', 'err', 6000);
          }
          return;
        }
        if (X.added > 0) {
          h(`已获取 ${X.added} 张原图${X.skipped ? `，跳过 ${X.skipped} 张无效图` : ''}${X.failed ? `，${X.failed} 张失败` : ''}`, X.failed ? 'warn' : 'ok', 5000);
        } else if (X.failed > 0) {
          const re = X.failures && X.failures[0] || {};
          h(`${X.failed} 张取值失败：${re.error || '未知原因'}`, 'err', 7000);
        } else {
          h(X.message || '没有新的图片（画布上的图都已在画廊里）', 'warn', 6000);
        }
        setTimeout(() => {
          return b(null);
        }, 4000);
      } catch (te) {
        b(null);
        h(`抓取异常：${te && te.message || '未知错误'}`, 'err', 6000);
      } finally {
        w(false);
      }
    }
  }, [e, m, x, N, r, h]);
  const oe = () => {
    if (v.current) {
      v.current.click();
    }
  };
  const he = async te => {
    const X = Array.from(te.target.files || []);
    te.target.value = '';
    if (X.length !== 0) {
      w(true);
      try {
        const Ee = (await Promise.all(X.map(Pu))).filter(Ve => {
          return Ve && Ve.dataUrl;
        }).map(Ve => {
          return {
            name: Ve.name || 'Tapnow 图',
            dataUrl: Ve.dataUrl,
            natW: Ve.natW,
            natH: Ve.natH,
            source: 'import'
          };
        });
        const je = r(e.id, Ee);
        if (je > 0) {
          h(`已导入 ${je} 张图片到画廊`, 'ok');
        } else {
          h('这些图片已在画廊中（重复跳过）', 'warn');
        }
      } catch (re) {
        h(`导入失败：${re && re.message ? re.message : '未知错误'}`, 'err');
      } finally {
        w(false);
      }
    }
  };
  const Ie = () => {
    const te = a.filter(Ee => {
      return Ee.selected && Ee.type === 'material' && Ee.data && Ee.data.dataUrl;
    });
    if (te.length === 0) {
      h('画布上尚未选中任何素材节点（先在画布框选素材，再回到画廊点本按钮）', 'warn', 4500);
      return;
    }
    const X = te.map(Ee => {
      return {
        name: Ee.data && (Ee.data.label || Ee.data.name) || '素材节点',
        dataUrl: Ee.data.dataUrl,
        natW: Ee.data.natW || 0,
        natH: Ee.data.natH || 0,
        source: 'canvas-bookmark'
      };
    });
    const re = r(e.id, X);
    if (re > 0) {
      h(`已从画布加入收藏 ${re} 张`, 'ok');
    } else {
      h('这些素材已在画廊中（重复跳过）', 'warn');
    }
  };
  const De = g.useCallback(async te => {
    if (!!te && te.length !== 0) {
      for (const X of te) {
        if (!i0(X)) {
          continue;
        }
        const re = [vl(X.sizeBytes), ja(X)].filter(Boolean).join(' · ');
        if (!window.confirm(`「${X.name}」尺寸较大（${re}）。
添加到画布会保持原始分辨率与画质，仅显示尺寸自动缩放。

继续添加该图吗？（点击「取消」将中止本次添加）`)) {
          return;
        }
      }
      w(true);
      try {
        const X = te.map(je => {
          return {
            name: je.name || 'Tapnow 图',
            dataUrl: je.dataUrl,
            natW: je.natW || 0,
            natH: je.natH || 0
          };
        });
        const re = l(X, {
          gap: 24,
          scale: 1
        });
        const Ee = X.length - (Array.isArray(re) ? re.length : 0);
        if (Ee > 0) {
          h(`已添加 ${re.length} 张，${Ee} 张失败（数据无效）`, 'warn', 4500);
        } else {
          h(`已添加 ${re.length} 张到画布（无损，居中网格布局）`, 'ok');
        }
      } catch (X) {
        h(`添加失败：${X && X.message ? X.message : '未知错误'}`, 'err', 4500);
      } finally {
        w(false);
      }
    }
  }, [l, h]);
  const le = () => {
    if (J === 0 || m) {
      return;
    }
    const te = N.filter(X => {
      return c.has(X.id);
    });
    De(te).then(() => {
      return u(new Set());
    });
  };
  return <div className="login-backdrop" onClick={t}>
      <div className="lovart-gallery" onClick={te => {
      return te.stopPropagation();
    }}>
        <div className="lovart-gallery-head">
          <span className="lovart-gallery-title">🎨 Tapnow 画廊 · {e.name}</span>
          <span className="lovart-gallery-sub">
            已选 <b className="lovart-gallery-selcount">{J}</b> / 共 {H} 张 · 点「扫描 Tapnow
            画布」读取<b>当前打开画布</b>节点里的图片；点缩略图可预览大图
          </span>
          <div className="lovart-gallery-actions">
            <button className="btn sm primary" onClick={ce} disabled={m || x} title="通过 Tapnow 内部接口读取画布列表与节点，取回其中的原图">
              {y && y.phase === 'scanning' ? '读取画布中…' : y && y.phase === 'fetching' ? `获取原图 ${y.done}/${y.total}` : '🔍 扫描 Tapnow 画布'}
            </button>
            <span className="lovart-gallery-sep" />
            <button className="btn sm ghost" onClick={ke} disabled={H === 0 || J === H}>
              全选
            </button>
            <button className="btn sm ghost" onClick={pe} disabled={H === 0}>
              反选
            </button>
            <button className="btn sm ghost" onClick={V} disabled={J === 0}>
              清空选择
            </button>
            <span className="lovart-gallery-sep" />
            <button className="btn sm" onClick={oe} disabled={m} title="从磁盘导入图片">
              导入图片
            </button>
            <button className="btn sm" onClick={Ie} disabled={m} title="把画布上当前选中的素材节点加入此画廊">
              从画布收藏
            </button>
            <button className="btn sm danger" onClick={q} disabled={m || H === 0}>
              清空画廊
            </button>
            <button className="btn sm ghost" onClick={t}>
              关闭
            </button>
          </div>
        </div>
        {y && <div className={`lovart-gallery-progress lovart-gallery-progress-${y.phase}`}>
            <div className="lovart-gallery-progress-bar">
              <i style={{
            width: `${y.phase === 'scanning' ? 12 : k}%`
          }} />
            </div>
            <span className="lovart-gallery-progress-text">
              {y.phase === 'scanning' && (y.note || '正在读取 Tapnow 画布列表…')}
              {y.phase === 'fetching' && `正在取回原图 ${y.done}/${y.total}（成功 ${y.ok}，失败 ${y.fail}）`}
              {y.phase === 'done' && `完成：获取 ${y.ok} 张${y.fail ? `，失败 ${y.fail} 张` : ''}`}
            </span>
          </div>}
        <input ref={v} type="file" accept="image/*" multiple={true} style={{
        display: 'none'
      }} onChange={he} />
        <div className="lovart-gallery-body" ref={j} onScroll={z}>
          {N.length === 0 ? <div className="lovart-gallery-empty">
              <div className="lovart-gallery-empty-icon">🖼️</div>
              <div className="lovart-gallery-empty-title">画廊为空</div>
              <div className="lovart-gallery-empty-desc">
                1. 在左侧选中这个 Tapnow 账号，确保它的页面已经加载出来（无需停在某张画布上）
                <br />
                2. 点「🔍 扫描 Tapnow 画布」，会读取该账号的画布列表与节点，取回其中的原图
                <br />
                3. 也可以点「从画布收藏」回收画布素材，或「导入图片」从磁盘导入
              </div>
              <button className="btn primary sm" onClick={ce} disabled={m || x}>
                扫描 Tapnow 画布
              </button>
            </div> : <i.Fragment>
              <div className="lovart-gallery-grid">
                {E.map(te => {
              const X = c.has(te.id);
              const re = i0(te);
              return <div className={`lovart-card ${X ? 'selected' : ''}`} onClick={Ee => {
                if (!Ee.target.closest('.lovart-card-check') && !Ee.target.closest('.lovart-card-del') && !Ee.target.closest('.lovart-card-preview')) {
                  se(te.id);
                }
              }} key={te.id}>
                      <div className="lovart-card-check">
                        <input type="checkbox" checked={X} onChange={() => {
                    return se(te.id);
                  }} onClick={Ee => {
                    return Ee.stopPropagation();
                  }} />
                      </div>
                      <div className="lovart-card-thumb-wrap" onDoubleClick={() => {
                  return F(te.id);
                }}>
                        <img src={Xt(te.dataUrl, 320)} alt={te.name} className="lovart-card-thumb" loading="lazy" />
                        {re && <span className="lovart-card-badge" title={`尺寸较大：${vl(te.sizeBytes)} ${ja(te)}`}>
                            ⚠ 大图
                          </span>}
                        <button className="lovart-card-preview" title="预览大图（也可双击缩略图）" onClick={Ee => {
                    Ee.stopPropagation();
                    F(te.id);
                  }}>
                          ⤢
                        </button>
                      </div>
                      <div className="lovart-card-meta">
                        <div className="lovart-card-name" title={te.canvasName || te.name}>
                          {te.name}
                        </div>
                        <div className="lovart-card-info">
                          <span>{vl(te.sizeBytes)}</span>
                          {ja(te) && <span>{ja(te)}</span>}
                          <span>{l0(te.addedAt)}</span>
                        </div>
                      </div>
                      <button className="lovart-card-del" title="从画廊中移除" onClick={Ee => {
                  Ee.stopPropagation();
                  ne(te.id);
                }}>
                        ✕
                      </button>
                    </div>;
            })}
              </div>
              {P && <div className="lovart-gallery-more">
                  <button className="btn sm ghost" onClick={I} disabled={m}>
                    加载更多（已显示 {E.length} / {N.length}）
                  </button>
                </div>}
            </i.Fragment>}
        </div>
        <div className="lovart-gallery-foot">
          <div className="lovart-gallery-foot-hint">
            添加后会以「居中网格」展开在画布，原始分辨率保留不变；显示尺寸自动缩到 ≤ 260px 长边。
          </div>
          <div className="lovart-gallery-foot-actions">
            <button className="btn sm ghost" onClick={t} disabled={m}>
              取消
            </button>
            <button className="btn primary sm" onClick={le} disabled={m || J === 0} title={J === 0 ? '先在画廊中勾选要添加的图片' : `添加 ${J} 张到画布`}>
              {m ? '添加中…' : `添加到画布 (${J})`}
            </button>
          </div>
        </div>
        {A && <div className="tg-lightbox" onClick={M}>
            <div className="tg-lightbox-inner" onClick={te => {
          return te.stopPropagation();
        }}>
              <div className="tg-lightbox-head">
                <span className="tg-lightbox-title" title={A.name}>
                  {A.name}
                </span>
                <span className="tg-lightbox-meta">
                  {ja(A)} · {vl(A.sizeBytes)} · {l0(A.addedAt)}
                  {` · ${R + 1}/${N.length}`}
                </span>
                <button className="tg-lightbox-close" onClick={M} title="关闭（Esc）">
                  ✕
                </button>
              </div>
              <div className="tg-lightbox-stage">
                <button className="tg-lightbox-nav prev" onClick={() => {
              return U(-1);
            }} title="上一张（←）">
                  ‹
                </button>
                <img src={A.dataUrl} alt={A.name} className="tg-lightbox-img" />
                <button className="tg-lightbox-nav next" onClick={() => {
              return U(1);
            }} title="下一张（→）">
                  ›
                </button>
              </div>
              <div className="tg-lightbox-foot">
                <button className="btn sm ghost" onClick={() => {
              return se(A.id);
            }}>
                  {c.has(A.id) ? '取消勾选' : '勾选此图'}
                </button>
                <button className="btn sm" onClick={() => {
              return De([A]);
            }} disabled={m}>
                  添加到画布
                </button>
                <button className="btn sm primary" onClick={() => {
              return _(A);
            }} disabled={!A.sourceUrl} title={A.sourceUrl ? `在浏览器打开：${ao(A.sourceUrl)}` : '没有记录来源地址'}>
                  打开原始图片
                </button>
                <button className="btn sm ghost" onClick={() => {
              return ne(A.id);
            }}>
                  从画廊移除
                </button>
              </div>
            </div>
          </div>}
        {d && <div className={`lovart-gallery-toast lovart-gallery-toast-${d.type}`}>{d.message}</div>}
      </div>
    </div>;
}