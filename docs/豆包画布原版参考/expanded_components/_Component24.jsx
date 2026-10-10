// TODO(全局, 无需 import): account, onClose, _, p, f, message, type, H, J, y, n, e, N, c, u, s, o, h, w, b, phase, found, total, done, ok, fail, seen, C, haveUrls, light, minSide, limit, onStatus, se, onItem, r, m, x, v, V, name, dataUrl, natW, natH, source, ke, a, E, l, gap, scale, t, S, D, j, z, I, A, M, R, width, k, display, F, P, O, U, d
import { L, wp, QT, Pu, t0, yl, Rd, Xt, ZT, eP, i, br } from './shared.js';
import * as g from 'react';
export default function _Component24({
  account: e,
  onClose: t
}) {
  const n = L(_ => {
    return _.lovartGalleries;
  });
  const r = L(_ => {
    return _.addLovartImages;
  });
  const s = L(_ => {
    return _.removeLovartImages;
  });
  const o = L(_ => {
    return _.clearLovartGallery;
  });
  const a = L(_ => {
    return _.nodes;
  });
  const l = L(_ => {
    return _.addMaterialsBatch;
  });
  const [c, u] = g.useState(() => {
    return new Set();
  });
  const [d, f] = g.useState(null);
  const p = g.useRef(null);
  const h = g.useCallback((_, H = 'ok', J = 3500) => {
    if (p.current) {
      clearTimeout(p.current);
    }
    f({
      message: _,
      type: H
    });
    p.current = setTimeout(() => {
      return f(null);
    }, J);
  }, []);
  const [m, w] = g.useState(false);
  const v = g.useRef(null);
  const [y, b] = g.useState(null);
  const x = !!y && y.phase !== 'done';
  const k = y && y.total > 0 ? Math.round((y.done || 0) / y.total * 100) : 0;
  const N = g.useMemo(() => {
    return [...(n && n[e.id] || [])].sort((H, J) => {
      return (J.addedAt || 0) - (H.addedAt || 0);
    });
  }, [n, e.id]);
  const C = g.useRef(new Set());
  const S = N.length;
  const E = c.size;
  const P = _ => {
    u(H => {
      const J = new Set(H);
      if (J.has(_)) {
        J.delete(_);
      } else {
        J.add(_);
      }
      return J;
    });
  };
  const j = () => {
    return u(new Set(N.map(_ => {
      return _.id;
    })));
  };
  const I = () => {
    return u(new Set());
  };
  const z = () => {
    u(_ => {
      const H = new Set();
      N.forEach(J => {
        if (!_.has(J.id)) {
          H.add(J.id);
        }
      });
      return H;
    });
  };
  const O = _ => {
    s(e.id, [_]);
    u(H => {
      if (!H.has(_)) {
        return H;
      }
      const J = new Set(H);
      J.delete(_);
      return J;
    });
  };
  const R = () => {
    if (N.length !== 0 && window.confirm(`确定清空「${e.name}」画廊的全部 ${N.length} 张图片？此操作不可撤销。`)) {
      o(e.id);
      u(new Set());
      h('已清空画廊', 'ok');
    }
  };
  const D = g.useCallback(async () => {
    if (!m && !x) {
      if (!window.api || typeof window.api.lovartFetchImages != 'function') {
        h('当前环境不支持页面扫描（需要在桌面应用中运行）', 'err', 5000);
        return;
      }
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
        const _ = await wp({
          account: e,
          seen: C.current,
          haveUrls: new Set(N.map(H => {
            return H.sourceUrl;
          }).filter(Boolean)),
          light: false,
          minSide: 200,
          limit: QT,
          onStatus: H => {
            b(J => {
              const se = J || {
                found: 0,
                total: 0,
                done: 0,
                ok: 0,
                fail: 0
              };
              if (H.phase === 'scanning') {
                return {
                  ...se,
                  phase: 'scanning'
                };
              } else if (H.phase === 'found') {
                return {
                  ...se,
                  phase: 'fetching',
                  total: H.candidates || 0
                };
              } else if (H.phase === 'working') {
                return {
                  ...se,
                  phase: 'fetching',
                  done: H.done || 0,
                  total: H.total || se.total,
                  ok: H.added || 0,
                  fail: H.failed || 0
                };
              } else if (H.phase === 'done') {
                return {
                  ...se,
                  phase: 'done',
                  done: H.done || 0,
                  total: H.total || se.total,
                  ok: H.added || 0,
                  fail: H.failed || 0
                };
              } else {
                return se;
              }
            });
          },
          onItem: H => {
            r(e.id, [H]);
          }
        });
        if (!_.ok) {
          b(null);
          if (_.error === 'not_open') {
            h(_.message || '没有找到该账号的 Lovart 页面', 'warn', 7000);
          } else if (_.error === 'busy') {
            h('上一次抓取还没结束，请稍候再试', 'warn', 4000);
          } else {
            h(_.message || _.error || '扫描失败', 'err', 6000);
          }
          return;
        }
        if (_.added > 0) {
          h(`已获取 ${_.added} 张原图${_.skipped ? `，跳过 ${_.skipped} 张占位/小图` : ''}${_.failed ? `，${_.failed} 张失败` : ''}`, _.failed ? 'warn' : 'ok', 5000);
        } else if (_.failed > 0) {
          const H = _.failures && _.failures[0] || {};
          h(`${_.failed} 张取值失败：${H.error || '未知原因'}（明细见诊断日志）`, 'err', 7000);
        } else if (_.skipped > 0) {
          h(`扫到的都是占位图/小图（已跳过 ${_.skipped} 张）。请确认 Lovart 页面上作品已经显示出来。`, 'warn', 6500);
        } else if (_.found > 0) {
          h(`扫到 ${_.found} 张，但都已在画廊中`, 'warn', 5000);
        } else {
          h('没扫到图片：请先在 Lovart 里进入作品页 / 画布并让图片显示出来；仍不行可点出新条上的「诊断」查看页面里到底有什么', 'warn', 8000);
        }
        setTimeout(() => {
          return b(null);
        }, 4000);
      } catch (_) {
        b(null);
        h(`扫描异常：${_ && _.message || '未知错误'}`, 'err', 6000);
      } finally {
        w(false);
      }
    }
  }, [e, m, x, N, r, h]);
  const A = () => {
    if (v.current) {
      v.current.click();
    }
  };
  const F = async _ => {
    const H = Array.from(_.target.files || []);
    _.target.value = '';
    if (H.length !== 0) {
      w(true);
      try {
        const se = (await Promise.all(H.map(Pu))).filter(V => {
          return V && V.dataUrl;
        }).map(V => {
          return {
            name: V.name || 'Lovart 图',
            dataUrl: V.dataUrl,
            natW: V.natW,
            natH: V.natH,
            source: 'import'
          };
        });
        const ke = r(e.id, se);
        if (ke > 0) {
          h(`已导入 ${ke} 张图片到画廊`, 'ok');
        } else {
          h('这些图片已在画廊中（重复跳过）', 'warn');
        }
      } catch (J) {
        h(`导入失败：${J && J.message ? J.message : '未知错误'}`, 'err');
      } finally {
        w(false);
      }
    }
  };
  const M = () => {
    const _ = a.filter(se => {
      return se.selected && se.type === 'material' && se.data && se.data.dataUrl;
    });
    if (_.length === 0) {
      h('画布上尚未选中任何素材节点（先在画布框选素材，再回到画廊点本按钮）', 'warn', 4500);
      return;
    }
    const H = _.map(se => {
      return {
        name: se.data && (se.data.label || se.data.name) || '素材节点',
        dataUrl: se.data.dataUrl,
        natW: se.data.natW || 0,
        natH: se.data.natH || 0,
        source: 'canvas-bookmark'
      };
    });
    const J = r(e.id, H);
    if (J > 0) {
      h(`已从画布加入收藏 ${J} 张`, 'ok');
    } else {
      h('这些素材已在画廊中（重复跳过）', 'warn');
    }
  };
  const U = async () => {
    if (E === 0 || m) {
      return;
    }
    const _ = N.filter(H => {
      return c.has(H.id);
    });
    for (const H of _) {
      if (!t0(H)) {
        continue;
      }
      const J = yl(H);
      const ke = [Rd(H.sizeBytes), J].filter(Boolean).join(' · ');
      if (!window.confirm(`「${H.name}」尺寸较大（${ke}）。
添加到画布会保持原始分辨率与画质，仅显示尺寸自动缩放，需要时再放大查看。

继续添加该图吗？
（点击「取消」将中止本次全部 ${E} 张的添加）`)) {
        return;
      }
    }
    w(true);
    try {
      const H = _.map(ke => {
        return {
          name: ke.name || 'Lovart 图',
          dataUrl: ke.dataUrl,
          natW: ke.natW || 0,
          natH: ke.natH || 0
        };
      });
      const J = l(H, {
        gap: 24,
        scale: 1
      });
      const se = H.length - (Array.isArray(J) ? J.length : 0);
      if (se > 0) {
        h(`已添加 ${J.length} 张，${se} 张失败（数据无效）`, 'warn', 4500);
      } else {
        h(`已添加 ${J.length} 张到画布（无损，居中网格布局）`, 'ok');
      }
      u(new Set());
    } catch (H) {
      h(`添加失败：${H && H.message ? H.message : '未知错误'}`, 'err', 4500);
    } finally {
      w(false);
    }
  };
  return <div className="login-backdrop" onClick={t}>
      <div className="lovart-gallery" onClick={_ => {
      return _.stopPropagation();
    }}>
        <div className="lovart-gallery-head">
          <span className="lovart-gallery-title">📷 Lovart 画廊 · {e.name}</span>
          <span className="lovart-gallery-sub">
            已选 <b className="lovart-gallery-selcount">{E}</b> / 共 {S} 张 · 在 Lovart
            后台打开该账号并加载出图片后，点「扫描 Lovart 页面」即可抓取
          </span>
          <div className="lovart-gallery-actions">
            <button className="btn sm primary" onClick={D} disabled={m || x} title="在当前账号的 Lovart 页面里扫描已加载的图片（含历史图片），并带账号登录态取回原图">
              {y && y.phase === 'scanning' ? '扫描中…' : y && y.phase === 'fetching' ? `获取原图 ${y.done}/${y.total}` : '🔍 扫描 Lovart 页面'}
            </button>
            <span className="lovart-gallery-sep" />
            <button className="btn sm ghost" onClick={j} disabled={S === 0 || E === S} title="全选">
              全选
            </button>
            <button className="btn sm ghost" onClick={z} disabled={S === 0} title="反选">
              反选
            </button>
            <button className="btn sm ghost" onClick={I} disabled={E === 0} title="清空选择">
              清空选择
            </button>
            <span className="lovart-gallery-sep" />
            <button className="btn sm" onClick={A} disabled={m} title="从磁盘导入图片">
              导入图片
            </button>
            <button className="btn sm" onClick={M} disabled={m} title="把画布上当前选中的素材节点加入此画廊">
              从画布收藏
            </button>
            <button className="btn sm danger" onClick={R} disabled={m || S === 0} title="清空此画廊全部图片">
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
              {y.phase === 'scanning' && '正在读取 Lovart 页面已加载的图片…'}
              {y.phase === 'fetching' && `正在取回原图 ${y.done}/${y.total}（成功 ${y.ok}，失败 ${y.fail}）`}
              {y.phase === 'done' && `完成：获取 ${y.ok} 张${y.fail ? `，失败 ${y.fail} 张` : ''}`}
            </span>
          </div>}
        <input ref={v} type="file" accept="image/*" multiple={true} style={{
        display: 'none'
      }} onChange={F} />
        <div className="lovart-gallery-body">
          {N.length === 0 ? <div className="lovart-gallery-empty">
              <div className="lovart-gallery-empty-icon">🖼️</div>
              <div className="lovart-gallery-empty-title">画廊为空</div>
              <div className="lovart-gallery-empty-desc">
                1. 先在「豆包后台」切到该 Lovart 账号，进入你的作品 / 画布页，让图片显示出来
                <br />
                2. 回到这里点「🔍 扫描 Lovart 页面」，会自动取回页面上已加载的图片原图
                <br />
                3. 也可以点「从画布收藏」回收画布素材，或「导入图片」从磁盘导入
              </div>
              <button className="btn primary sm" onClick={D} disabled={m || x}>
                扫描 Lovart 页面
              </button>
            </div> : <div className="lovart-gallery-grid">
              {N.map(_ => {
            const H = c.has(_.id);
            const J = t0(_);
            return <div className={`lovart-card ${H ? 'selected' : ''}`} onClick={se => {
              if (!se.target.closest('.lovart-card-check') && !se.target.closest('.lovart-card-del')) {
                P(_.id);
              }
            }} key={_.id}>
                    <div className="lovart-card-check">
                      <input type="checkbox" checked={H} onChange={() => {
                  return P(_.id);
                }} onClick={se => {
                  return se.stopPropagation();
                }} />
                    </div>
                    <div className="lovart-card-thumb-wrap">
                      <img src={Xt(_.dataUrl, 320)} alt={_.name} className="lovart-card-thumb" loading="lazy" />
                      {J && <span className="lovart-card-badge" title={`尺寸较大：${Rd(_.sizeBytes)} ${yl(_)}。添加时会有确认提示。`}>
                          ⚠ 大图
                        </span>}
                    </div>
                    <div className="lovart-card-meta">
                      <div className="lovart-card-name" title={_.sourceUrl || _.name}>
                        {_.name}
                      </div>
                      <div className="lovart-card-info">
                        <span>{Rd(_.sizeBytes)}</span>
                        {yl(_) && <span>{yl(_)}</span>}
                        <span>{ZT(_.addedAt)}</span>
                      </div>
                      {_.sourceUrl && <div className="lovart-card-src" title={_.sourceUrl}>
                          来自 {eP(_.sourceUrl)}
                        </div>}
                    </div>
                    <button className="lovart-card-del" title="从画廊中移除" onClick={se => {
                se.stopPropagation();
                O(_.id);
              }}>
                      ✕
                    </button>
                  </div>;
          })}
            </div>}
        </div>
        <div className="lovart-gallery-foot">
          <div className="lovart-gallery-foot-hint">
            添加后会以「居中网格」展开在画布，原始分辨率保留不变；显示尺寸自动缩到 ≤ 260px 长边。
          </div>
          <div className="lovart-gallery-foot-actions">
            <button className="btn sm ghost" onClick={t} disabled={m}>
              取消
            </button>
            <button className="btn primary sm" onClick={U} disabled={m || E === 0} title={E === 0 ? '先在画廊中勾选要添加的图片' : `添加 ${E} 张到画布`}>
              {m ? '添加中…' : `添加到画布 (${E})`}
            </button>
          </div>
        </div>
        {d && <div className={`lovart-gallery-toast lovart-gallery-toast-${d.type}`}>{d.message}</div>}
      </div>
    </div>;
}