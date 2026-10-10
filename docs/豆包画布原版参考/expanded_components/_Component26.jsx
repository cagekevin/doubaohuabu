// TODO(全局, 无需 import): account, active, le, n, p, te, phase, message, N, S, C, j, P, type, X, y, e, c, m, r, re, v, Ee, _accId, _accName, _accType, O, D, F, U, je, _, dataUrl, name, thumbDataUrl, J, a, natW, natH, autoPlace, gap, b, k, I, H, x, it, timerId, thumbPromise, R, A, src, ke, se, Ve, o, ce, Je, seen, haveUrls, haveHashes, ze, light, minSide, limit, allowedScopes, skipNonCanvas, saveDiag, onStatus, onItem, s, maxCanvases, canvasId, useDom, ut, Qe, q, d, l, acc, phashArr, autoCount, idleRounds, stamp, lastStamp, jitter, stop, timer, et, ct, wt, t, u, f, z, Ie, oe, De, pe, V, ne, w, he, h, E, M, left
import _cmp_S0 from './S0.jsx';
import { L, Ep, x0, zd, y0, v0, Fd, w0, Ud, Yl, ho, JR, mo, jp, k0, b0, eD, Jy, o0, h0, wp, xp, NR, tD, qR, KR, YR, XR, QR, KT, xl, m0, dP, tS, Xt, nD } from './shared.js';
import * as g from 'react';
export default function _Component26({
  account: e,
  active: t
}) {
  const n = L(le => {
    return le.accounts;
  });
  const r = L(le => {
    return le.lovartGalleries;
  });
  const s = L(le => {
    return le.addLovartImages;
  });
  const o = L(le => {
    return le.removeLovartImages;
  });
  const a = L(le => {
    return le.addMaterialsBatch;
  });
  const l = g.useMemo(() => {
    return (n || []).filter(Ep);
  }, [n]);
  const c = g.useMemo(() => {
    return (n || []).filter(x0);
  }, [n]);
  const [u, d] = g.useState(() => {
    return zd(y0, '0') === '1';
  });
  const [f, p] = g.useState(() => {
    return zd(v0, '0') === '1';
  });
  const h = g.useCallback(() => {
    p(le => {
      const te = !le;
      Fd(v0, te ? '1' : '0');
      return te;
    });
  }, []);
  const [m, w] = g.useState(() => {
    return zd(w0, '0') === '1';
  });
  const [v, y] = g.useState('');
  const b = g.useRef(new Set());
  const [x, k] = g.useState(0);
  const [N, C] = g.useState({
    phase: 'idle',
    message: '待机'
  });
  const S = g.useRef(N);
  S.current = N;
  g.useCallback(le => {
    const te = S.current;
    if (!te || te.phase !== le.phase || te.message !== le.message) {
      C(le);
    }
  }, []);
  const [E, P] = g.useState(null);
  const j = g.useRef(null);
  const I = g.useCallback((le, te = 'ok', X = 3200) => {
    if (j.current) {
      clearTimeout(j.current);
    }
    P({
      message: le,
      type: te
    });
    j.current = setTimeout(() => {
      return P(null);
    }, X);
  }, []);
  g.useEffect(() => {
    return () => {
      if (j.current) {
        clearTimeout(j.current);
      }
    };
  }, []);
  g.useEffect(() => {
    let le = false;
    y('');
    if (e && Ud(e)) {
      Yl(e).then(te => {
        if (!le) {
          y(te || '');
        }
      }).catch(() => {
        if (!le) {
          y('');
        }
      });
    }
    return () => {
      le = true;
    };
  }, [e == null ? undefined : e.id]);
  const z = g.useMemo(() => {
    const le = [];
    const te = e && e.id;
    for (const X of c) {
      if (m && te && X.id !== te) {
        continue;
      }
      const re = r && r[X.id] || [];
      for (const Ee of re) {
        if (m && te) {
          if (Ud(X)) {
            if (v && Ee.canvasId !== v) {
              continue;
            }
          } else if (ho(X) && Ee.scope && Ee.scope !== 'canvas') {
            continue;
          }
        }
        le.push({
          ...Ee,
          _accId: X.id,
          _accName: X.name,
          _accType: X.type
        });
      }
    }
    le.sort((X, re) => {
      return (re.addedAt || 0) - (X.addedAt || 0);
    });
    return le.slice(0, JR);
  }, [r, c, m, e, v]);
  const O = g.useRef(null);
  const R = g.useRef(false);
  const D = g.useRef(false);
  const A = g.useRef(false);
  const F = g.useRef(false);
  const [M, U] = g.useState(null);
  const _ = g.useRef(new Map());
  const H = g.useCallback(() => {
    try {
      const le = document.querySelector('.doubao-view-webviews');
      if (le) {
        le.classList.remove('nip-drop-active');
      }
    } catch {}
  }, []);
  const J = g.useCallback(() => {
    if (O.current && O.current.timerId) {
      clearTimeout(O.current.timerId);
    }
    O.current = null;
  }, []);
  const se = g.useCallback(async le => {
    if (D.current) {
      return;
    }
    D.current = true;
    F.current = true;
    U(null);
    try {
      const je = document.querySelector('.doubao-view-webviews');
      if (je) {
        je.classList.add('nip-drop-active');
      }
    } catch {}
    const te = mo(le);
    const X = _.current.get(te);
    let re = typeof X == 'string' && X.startsWith('data:') ? X : null;
    const Ee = O.current;
    if (!re && Ee && Ee.thumbPromise) {
      try {
        re = await Ee.thumbPromise;
      } catch {}
    }
    if (!re) {
      try {
        re = await _cmp_S0(le.dataUrl, jp);
        if (typeof re == 'string' && re.startsWith('data:')) {
          _.current.set(te, re);
        }
      } catch {}
    }
    try {
      if (window.api && typeof window.api.startFileDrag == 'function') {
        window.api.startFileDrag({
          dataUrl: le.dataUrl,
          name: le.name || 'image',
          thumbDataUrl: re || le.dataUrl
        });
      }
    } catch {}
    J();
  }, [J]);
  const ke = g.useCallback(le => {
    if (k0(le)) {
      const X = [b0(le.sizeBytes), le.natW && le.natH ? `${le.natW}×${le.natH}` : ''].filter(Boolean).join(' · ');
      if (!window.confirm(`「${le.name}」尺寸较大（${X}）。
发送到画布会保持原始分辨率与画质，仅显示尺寸自动缩放。

继续发送吗？`)) {
        return false;
      }
    }
    const te = a([{
      name: le.name,
      dataUrl: le.dataUrl,
      natW: le.natW || 0,
      natH: le.natH || 0
    }], {
      autoPlace: true,
      gap: 24
    });
    if (Array.isArray(te) && te.length > 0) {
      b.current.add(mo(le));
      k(X => {
        return X + 1;
      });
      I(`已发送到画布 · ${le.name}`, 'ok', 2600);
      return true;
    } else {
      I('发送失败：图片数据无效', 'err');
      return false;
    }
  }, [a, I]);
  const V = g.useCallback((le, te) => {
    if (le.button !== 0) {
      return;
    }
    le.preventDefault();
    F.current = false;
    H();
    if (O.current && O.current.timerId) {
      clearTimeout(O.current.timerId);
    }
    const X = mo(te);
    const re = typeof _.current.get(X) == 'string' ? _.current.get(X) : null;
    const Ee = re ? Promise.resolve(re) : _cmp_S0(te.dataUrl, jp).then(je => {
      if (typeof je == 'string' && je.startsWith('data:')) {
        _.current.set(X, je);
      }
      return je;
    });
    O.current = {
      x: le.clientX,
      y: le.clientY,
      it: te,
      timerId: null,
      thumbPromise: Ee
    };
    R.current = true;
    D.current = false;
    A.current = false;
    U({
      x: le.clientX,
      y: le.clientY,
      src: re || te.dataUrl,
      name: te.name
    });
    try {
      const je = document.querySelector('.doubao-view-webviews');
      if (je) {
        je.classList.add('nip-drop-active');
      }
    } catch {}
  }, []);
  const pe = g.useCallback(le => {
    if (F.current) {
      F.current = false;
      return false;
    } else {
      ke(le);
      return true;
    }
  }, [ke]);
  g.useEffect(() => {
    const le = X => {
      const re = O.current;
      if (re && R.current && !D.current) {
        const Ee = X.clientX - re.x;
        const je = X.clientY - re.y;
        if (Math.hypot(Ee, je) > eD) {
          A.current = true;
          se(re.it);
        } else {
          U(Ve => {
            return Ve && {
              ...Ve,
              x: X.clientX,
              y: X.clientY
            };
          });
        }
      }
    };
    const te = () => {
      if (!O.current) {
        if (D.current) {
          D.current = false;
          F.current = true;
          U(null);
          H();
        }
        return;
      }
      J();
      if (D.current) {
        D.current = false;
        F.current = true;
        U(null);
        H();
        return;
      }
      if (R.current) {
        R.current = false;
        U(null);
        H();
        F.current = A.current;
        return;
      }
    };
    window.addEventListener('mousemove', le);
    window.addEventListener('mouseup', te);
    return () => {
      window.removeEventListener('mousemove', le);
      window.removeEventListener('mouseup', te);
    };
  }, []);
  const ne = g.useCallback(le => {
    o(le._accId, [le.id]);
    b.current.delete(mo(le));
    I('已从列表移除（不影响画布）', 'ok', 2000);
  }, [o, I]);
  const [q, ce] = g.useState(false);
  const oe = g.useCallback(async () => {
    if (!q) {
      if (Jy() || o0()) {
        I('正在抓取中，请稍候', 'warn', 2000);
        return;
      }
      ce(true);
      try {
        const le = x0(e) ? [e] : c;
        if (le.length === 0) {
          I('没有可抓取的账号', 'warn', 2600);
          return;
        }
        let te = 0;
        let X = 0;
        for (const re of le) {
          const Ee = L.getState();
          const je = Ee.lovartGalleries && Ee.lovartGalleries[re.id] || [];
          const Ve = new Set(je.map(Je => {
            return Je.sourceUrl;
          }).filter(Boolean));
          const ze = h0(je);
          let Qe;
          if (ho(re)) {
            Qe = await wp({
              account: re,
              seen: new Set(),
              haveUrls: Ve,
              haveHashes: ze,
              light: false,
              minSide: 96,
              limit: 20,
              allowedScopes: ['canvas'],
              skipNonCanvas: false,
              saveDiag: true,
              onStatus: C,
              onItem: Je => {
                return s(re.id, [Je]);
              }
            });
          } else if (Ud(re)) {
            const Je = await Yl(re);
            if (!Je) {
              I(`Tapnow「${re.name}」未打开画布页，已跳过`, 'warn', 4000);
              continue;
            }
            Qe = await xp({
              account: re,
              seen: new Set(),
              haveUrls: Ve,
              haveHashes: ze,
              limit: 60,
              maxCanvases: 1,
              canvasId: Je,
              useDom: true,
              onStatus: C,
              onItem: ut => {
                return s(re.id, [ut]);
              }
            });
          } else {
            Qe = await NR({
              account: re,
              seen: new Set(),
              haveUrls: Ve,
              haveHashes: ze,
              limit: 20,
              minSide: 96,
              onStatus: C,
              onItem: Je => {
                return s(re.id, [Je]);
              }
            });
          }
          te += Qe && Qe.added || 0;
          X += Qe && Qe.failed || 0;
        }
        if (te > 0) {
          I(`已抓取 ${te} 张新图${X ? `，${X} 张失败` : ''}`, 'ok', 4500);
        } else if (X > 0) {
          I(`${X} 张取值失败`, 'err', 6000);
        } else {
          I('没有新的图（页面上的图都已在列表里）', 'warn', 4000);
        }
      } finally {
        ce(false);
      }
    }
  }, [e, q, c, s, I]);
  const he = () => {
    const le = !u;
    d(le);
    Fd(y0, le ? '1' : '0');
    I(le ? '已开启全账号自动抓取' : '已暂停自动抓取', 'ok', 2000);
  };
  g.useEffect(() => {
    if (!t || !u || l.length === 0) {
      return;
    }
    const le = new Map();
    for (const je of l) {
      if (je.autoStart === true) {
        le.set(je.id, {
          acc: je,
          seen: new Set(),
          phashArr: [],
          autoCount: 0,
          idleRounds: 0,
          stamp: {
            lastStamp: ''
          },
          jitter: tD(je.id),
          stop: false,
          timer: null
        });
      }
    }
    const te = je => {
      if (ho(je)) {
        return qR;
      } else {
        return KR;
      }
    };
    const X = je => {
      if (ho(je)) {
        return YR;
      } else {
        return XR;
      }
    };
    const re = (je, Ve) => {
      if (!je.stop) {
        je.timer = setTimeout(() => {
          return Ee(je);
        }, Ve + je.jitter);
      }
    };
    const Ee = async je => {
      const {
        acc: Ve
      } = je;
      if (je.stop) {
        return;
      }
      if (document.hidden) {
        re(je, te(Ve));
        return;
      }
      if (ho(Ve) ? Jy() : o0()) {
        re(je, te(Ve));
        return;
      }
      if (je.autoCount >= QR) {
        re(je, X(Ve));
        return;
      }
      const ze = L.getState();
      const Qe = ze.lovartGalleries && ze.lovartGalleries[Ve.id] || [];
      const Je = new Set(Qe.map(et => {
        return et.sourceUrl;
      }).filter(Boolean));
      const ut = h0(Qe);
      ut.phash = je.phashArr;
      try {
        if (ho(Ve)) {
          const et = await KT({
            account: Ve,
            seen: je.seen,
            haveUrls: Je,
            minSide: 96,
            allowedScopes: ['canvas'],
            skipNonCanvas: true
          });
          if (je.stop) {
            return;
          }
          if (!et.ok) {
            re(je, te(Ve));
            return;
          }
          if (!et.urls || et.urls.length === 0) {
            je.idleRounds += 1;
            re(je, je.idleRounds >= xl ? X(Ve) : te(Ve));
            return;
          }
          je.idleRounds = 0;
          await wp({
            account: Ve,
            seen: je.seen,
            haveUrls: Je,
            haveHashes: ut,
            light: true,
            minSide: 96,
            limit: m0,
            allowedScopes: ['canvas'],
            skipNonCanvas: true,
            onItem: ct => {
              je.autoCount += 1;
              s(Ve.id, [ct]);
            }
          });
        } else {
          const et = await Yl(Ve);
          if (je.stop) {
            return;
          }
          if (!et) {
            je.idleRounds = Math.max(je.idleRounds, xl - 1);
            re(je, X(Ve));
            return;
          }
          const ct = await dP(Ve, Je, je.stamp, et);
          if (je.stop) {
            return;
          }
          if (!ct.ok) {
            je.idleRounds += 1;
            re(je, je.idleRounds >= xl ? X(Ve) : te(Ve));
            return;
          }
          if (ct.idle || !ct.newUrls || ct.newUrls.length === 0) {
            je.idleRounds += 1;
            re(je, je.idleRounds >= xl ? X(Ve) : te(Ve));
            return;
          }
          je.idleRounds = 0;
          await xp({
            account: Ve,
            seen: je.seen,
            haveUrls: Je,
            haveHashes: ut,
            light: true,
            limit: m0,
            maxCanvases: 1,
            canvasId: et,
            useDom: false,
            onItem: wt => {
              je.autoCount += 1;
              s(Ve.id, [wt]);
            }
          });
        }
      } catch {}
      re(je, te(Ve));
    };
    for (const je of le.values()) {
      je.timer = setTimeout(() => {
        return Ee(je);
      }, 700 + je.jitter);
    }
    return () => {
      for (const je of le.values()) {
        je.stop = true;
        if (je.timer) {
          clearTimeout(je.timer);
        }
      }
    };
  }, [t, u, l, s]);
  g.useEffect(() => {
    return () => {
      return H();
    };
  }, [H]);
  const Ie = N.phase === 'error' || N.phase === 'warn' ? 'warn' : N.phase === 'ok' ? 'ok' : '';
  const De = Ep(e) ? '⟳ 立即抓取' : tS(e) ? '⟳ 抓取本页图' : c.length > 1 ? '⟳ 抓取全部' : '⟳ 立即抓取';
  return <div className={`nip-wrap${f ? ' collapsed' : ''}`}>
      <div className="nip-panel-clip">
        <div className="dv-lovart-strip nip-panel">
          <div className="dvl-head">
            <div className="dvl-title">
              出新图<span className="dvl-count">{z.length}</span>
              {u && <span className="dvl-live" title="自动值守中：Lovart / Tapnow 出新图会自动出现，无需手动抓取" />}
              {c.length > 0 && <span className="nip-agg-head" title="聚合自以下账号">
                  聚合 {c.length} 个账号
                </span>}
            </div>
            <div className={`dvl-status ${Ie}`} title={N.message || ''}>
              <span className={`dvl-spin${N.phase === 'scanning' || N.phase === 'working' ? '' : ' dvl-spin-idle'}`} />
              <span className="dvl-status-text">
                {N.phase === 'scanning' ? '正在读取页面…' : N.phase === 'working' ? N.message || '抓取中…' : N.message || '待机'}
              </span>
            </div>
          </div>
          <div className="nip-fold-body">
            <div className="dvl-body">
              {z.length === 0 ? <div className="dvl-empty">
                  <button className="btn sm" onClick={oe} disabled={q}>
                    {De}
                  </button>
                </div> : <div className="dvl-thumbs">
                  {z.map(le => {
                const te = b.current.has(mo(le));
                const X = (le.addedAt || 0) >= Date.now() - 3600000;
                return <div className={`dvl-thumb${te ? ' sent' : ''} nip-src-${le._accType || 'unk'}`} key={mo(le)}>
                        <button type="button" className="dvl-thumb-btn" onClick={() => {
                    return pe(le);
                  }} onMouseDown={re => {
                    return V(re, le);
                  }} title={`点击发送到画布；长按拖拽可放入后台页面（Lovart / Tapnow / 其他网站）：${le.name}${le.natW && le.natH ? `（${le.natW}×${le.natH}）` : ''}
来自：${le._accName || le._accId || ''}`}>
                          <img src={Xt(le.dataUrl, 320)} alt={le.name} loading="lazy" decoding="async" draggable={false} />
                          <span className="dvl-thumb-overlay">＋ 发送到画布 · 长按可拖入</span>
                          {X && !te && <span className="dvl-badge-new">NEW</span>}
                          {te && <span className="dvl-badge-sent">✓ 已发送</span>}
                          {k0(le) && <span className="dvl-badge-big" title="尺寸较大，发送前会确认">
                              ⚠
                            </span>}
                          <span className={`nip-source-tag nip-tag-${le._accType}`}>
                            {le._accType === 'lovart' ? 'L' : le._accType === 'tapnow' ? 'T' : '网'}
                          </span>
                        </button>
                        <button type="button" className="dvl-thumb-del" title="从列表移除（不影响画布）" onClick={re => {
                    re.stopPropagation();
                    ne(le);
                  }}>
                          ✕
                        </button>
                        <div className="dvl-thumb-meta" title={`${le.name}${le.sourceUrl ? `
来自 ${nD(le.sourceUrl)}` : ''}
账号：${le._accName || le._accId || ''}`}>
                          {le.natW && le.natH ? `${le.natW}×${le.natH}` : b0(le.sizeBytes)}
                        </div>
                      </div>;
              })}
                </div>}
            </div>
            <div className="dvl-right">
              <div className="dvl-right-col">
                <button type="button" className={`btn sm ghost${m ? ' active' : ''}`} onClick={() => {
                const le = !m;
                w(le);
                Fd(w0, le ? '1' : '0');
                I(le ? '已切换：只显示当前账号画布图片' : '已切换：显示全部账号画布图片', 'ok', 1800);
              }} title={m ? '当前仅显示当前账号画布图片，点击显示全部账号' : '当前显示全部账号图片，点击仅显示当前账号画布'}>
                  {m ? '● 只留本画布' : '只留本画布'}
                </button>
                <button type="button" className="btn sm" onClick={oe} disabled={q} title="立即抓取（当前活跃账号 / 全部 Lovart+Tanpnow）">
                  {q ? '抓取中…' : De}
                </button>
                <button type="button" className="btn sm ghost dvl-auto-btn" onClick={he} title={u ? '当前对全部 Lovart / Tapnow 账号每数秒自动抓取新图，点击暂停' : '已暂停自动抓取，点击恢复'}>
                  <span className={`dvl-dot${u ? ' on' : ''}`} />
                  {u ? '自动抓取中' : '已暂停'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
      <button type="button" className="nip-fold-toggle" title={f ? '展开出新图面板' : '收起出新图面板'} onClick={h}>
        {f ? '∨' : '∧'}
      </button>
      {E && <div className={`dvl-toast dvl-toast-${E.type}`}>{E.message}</div>}
      {M && <div className="nip-ghost" style={{
      left: M.x + 12,
      top: M.y + 12
    }}>
          <img src={M.src} alt={M.name} draggable={false} />
          <span className="nip-ghost-tip">拖入当前页面</span>
        </div>}
    </div>;
}