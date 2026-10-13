// TODO(全局, 无需 import): activeAccountId, onSelectAccount, W, n, o, r, s, Ce, Ue, fe, yt, p, spoofed, uadPlatform, platform, languages, screen, tz, cores, Pe, rt, ht, ot, Te, $t, mt, pageSource, page, net, Ye, setMsg, oe, max, thumbH, trackH, xt, Nt, qe, Ke, a, ve, Ct, ee, Q, gt, Ae, nt, me, T, Z, message, type, X, _t, Ve, Mt, groupId, groupName, color, accounts, Y, Ie, De, t, it, x, y, ge, Be, N, K, Ee, je, re, ze, Je, Qe, b, confirm, et, wt, ct, d, name, Me, Re, autoStart, C, te, _, used, done, idle, bt, $n, Qn, Yr, uo, B, v, status, pa, partition, addedAt, fpSalt, fingerprint, url, at, l, e, we, Se, background, ut, At, xe, G, h, f, $, pe, u, c, kt, ae, Ge, R, marginBottom, $e, M, ke, q, he, ce, U, He, tt, transform, de, le, zt, Rt, be, st, lt, dt, k, ie, ye, Ne, Fe, S, E, j, P, O, A, z, I, D, F, V, se, m, w, ne, left, Le, _e
import _cmp_RP from "./RP.jsx";
import _cmp_TP from "./TP.jsx";
import _cmp_$P from "./$P.jsx";
import _cmp_PP from "./PP.jsx";
import _cmp__Component23 from "./_Component23.jsx";
import _cmp__Component24 from "./_Component24.jsx";
import _cmp_DP from "./DP.jsx";
import _cmp_LP from "./LP.jsx";
import { L, zk, AP, ua, gl, Yy, id, MP, _P, on } from "./shared.js";
import * as g from 'react';
export default function OP({
  activeAccountId: e,
  onSelectAccount: t
}) {
  const n = L(W => {
    return W.accounts;
  });
  const r = L(W => {
    return W.recordScan;
  });
  const s = g.useMemo(() => {
    return zk(n);
  }, [n]);
  const o = g.useRef(null);
  g.useEffect(() => {
    if (!(n.length < 2)) {
      if (o.current) {
        clearTimeout(o.current);
      }
      o.current = setTimeout(() => {
        return r(s);
      }, 1500);
      return () => {
        if (o.current) {
          clearTimeout(o.current);
        }
      };
    }
  }, [s, n.length, r]);
  const a = L(W => {
    return W.groups;
  });
  const l = L(W => {
    return W.lovartGalleries;
  });
  const c = L(W => {
    return W.removeAccount;
  });
  const u = L(W => {
    return W.clearLovartAccountCache;
  });
  const d = L(W => {
    return W.updateAccount;
  });
  const f = L(W => {
    return W.regenerateFingerprint;
  });
  const p = (W, Ce, fe = 2500) => {
    return Promise.race([W.executeJavaScript(Ce, false), new Promise((Te, Ue) => {
      return setTimeout(() => {
        return Ue(new Error('webview_exec_timeout'));
      }, fe);
    })]);
  };
  const h = async W => {
    var Ce;
    var fe;
    var Te;
    var Ue;
    var Ye;
    try {
      let Pe = null;
      let rt = 'live';
      try {
        const yt = document.querySelector(`webview[data-account-id="${W.id}"]`);
        if (yt && typeof yt.executeJavaScript == 'function') {
          Pe = await p(yt, AP, 2500);
        }
      } catch {
        Pe = null;
      }
      if (!Pe && W.fingerprint) {
        const yt = W.fingerprint;
        Pe = {
          spoofed: false,
          ua: yt.userAgent || '',
          uadPlatform: yt.userAgentData && yt.userAgentData.platform || yt.platform || '',
          platform: yt.platform || '',
          languages: Array.isArray(yt.languages) ? yt.languages.join(',') : yt.language || '',
          screen: yt.screen ? `${yt.screen.width}x${yt.screen.height}@${yt.screen.pixelRatio || 1}` : '',
          tz: yt.timezone || '',
          cores: yt.hardwareConcurrency || '',
          gl: yt.webgl ? String(yt.webgl.renderer || yt.webgl.vendor || '') : ''
        };
        rt = 'configured';
      }
      let ot = null;
      try {
        if ((Ce = window.api) != null && Ce.fpNetDiag) {
          ot = await window.api.fpNetDiag(W.partition);
        } else {
          ot = null;
        }
      } catch {
        ot = null;
      }
      const ht = (String((Pe == null ? undefined : Pe.ua) || '').match(/Chrome\/(\d+)/) || [])[1] || '?';
      const $t = [`伪装 ${Pe ? rt === 'configured' ? '配置未生效(页未打开)' : Pe.spoofed ? '✓生效' : '✗未生效(preload未加载)' : '页面未加载'}`, `UA ${(Pe == null ? undefined : Pe.uadPlatform) || (Pe == null ? undefined : Pe.platform) || '?'} Chrome/${ht}`, `屏 ${(Pe == null ? undefined : Pe.screen) || '?'}`, `语言 ${((Pe == null ? undefined : Pe.languages) || '?').split(',')[0] || '?'}`, `时区 ${(Pe == null ? undefined : Pe.tz) || '?'}`, `出口 ${ot != null && ot.ok ? ot.proxy || 'DIRECT' : '未知'}`, `引擎 ${(ot == null ? undefined : ot.engineChrome) || '?'}`];
      const mt = Pe != null && !!Pe.spoofed;
      if ((Te = (fe = L.getState()).showToast) != null) {
        Te.call(fe, `指纹诊断「${W.name}」：${$t.join(' · ')}`, mt ? 'success' : 'warn');
      }
      console.log('[指纹诊断]', W.name, {
        pageSource: rt,
        page: Pe,
        net: ot
      });
    } catch (Pe) {
      console.error('[指纹诊断失败]', W.name, Pe);
      if ((Ye = (Ue = L.getState()).showToast) != null) {
        Ye.call(Ue, `指纹诊断失败：${Pe && Pe.message || Pe}`, 'error');
      }
    }
  };
  const m = L(W => {
    return W.scanHistory;
  });
  const w = L(W => {
    return W.clearScanHistory;
  });
  const v = L(W => {
    return W.addAccount;
  });
  L(W => {
    return W.proxyPool;
  });
  L(W => {
    return W.setProxyPool;
  });
  const y = L(W => {
    return W.addGroup;
  });
  const b = L(W => {
    return W.renameGroup;
  });
  const x = L(W => {
    return W.deleteGroup;
  });
  const k = L(W => {
    return W.setGroupColor;
  });
  const N = L(W => {
    return W.moveAccountsToGroup;
  });
  const C = L(W => {
    return W.setGroupAutoStart;
  });
  const S = L(W => {
    return W.snap;
  });
  const E = L(W => {
    return W.setSnap;
  });
  const P = L(W => {
    return W.clear;
  });
  const j = L(W => {
    return W.showStartup;
  });
  const [I, z] = g.useState(false);
  const [O, R] = g.useState(false);
  const [D, A] = g.useState('doubao');
  const [F, M] = g.useState(false);
  const [U, _] = g.useState('');
  const [H, J] = g.useState(null);
  const [se, ke] = g.useState(false);
  const [V, pe] = g.useState(null);
  const [ne, q] = g.useState(false);
  const [ce, oe] = g.useState(false);
  const he = async () => {
    var W;
    if (!ce) {
      if ((W = window.api) == null || !W.clearBrowserCache) {
        setMsg('当前环境不支持清理缓存（需重启应用后重试）');
        setTimeout(() => {
          return setMsg('');
        }, 2500);
        return;
      }
      if (window.confirm(`将清理全部账号页面的浏览器缓存（可释放数 GB 空间）。
登录态不受影响，账号不会掉线；清理后页面首次打开会稍慢。

确定继续？`)) {
        oe(true);
        try {
          const Ce = await window.api.clearBrowserCache();
          if (Ce && Ce.ok) {
            setMsg(`✓ 已清理 ${Ce.cleared} 个缓存目录${Ce.failed ? `（${Ce.failed} 个被占用，下次启动会自动清理）` : ''}`);
          } else {
            setMsg(`清理失败：${Ce && Ce.error || '未知错误'}`);
          }
        } catch (Ce) {
          setMsg(`清理失败：${Ce && Ce.message ? Ce.message : Ce}`);
        } finally {
          oe(false);
          setTimeout(() => {
            return setMsg('');
          }, 4000);
        }
      }
    }
  };
  const [Ie, De] = g.useState(new Set());
  const [le, te] = g.useState(null);
  const [X, re] = g.useState(false);
  const [Ee, je] = g.useState('');
  const [Ve, ze] = g.useState(null);
  const [Qe, Je] = g.useState('');
  const [ut, et] = g.useState(null);
  const [ct, wt] = g.useState('');
  const At = g.useRef(null);
  const _t = g.useRef(null);
  const Mt = g.useRef(null);
  const [zt, Rt] = g.useState(null);
  const [Be, it] = g.useState(null);
  const kt = g.useRef(null);
  const xt = g.useRef(null);
  const Nt = g.useRef(null);
  const [gt, Ke] = g.useState(0);
  const Ct = g.useRef(false);
  const ee = g.useRef(0);
  const Q = g.useRef(0);
  const me = g.useRef(null);
  const [ve, qe] = g.useState({
    max: 0,
    thumbH: 0,
    trackH: 0
  });
  g.useEffect(() => {
    const W = xt.current;
    if (!W) {
      return;
    }
    const Ce = () => {
      var ot;
      const Te = W.clientHeight;
      const Ue = W.scrollHeight || ((ot = Nt.current) == null ? undefined : ot.offsetHeight) || 0;
      const Ye = Math.max(0, Ue - Te);
      const Pe = Te;
      const rt = Ye > 0 ? Math.max(30, Te / Ue * Te) : 0;
      qe({
        max: Ye,
        thumbH: rt,
        trackH: Pe
      });
      Ke(ht => {
        return Math.min(ht, Ye);
      });
    };
    Ce();
    const fe = new ResizeObserver(Ce);
    fe.observe(W);
    if (Nt.current) {
      fe.observe(Nt.current);
    }
    return () => {
      return fe.disconnect();
    };
  }, [n.length, a.length]);
  const tt = g.useCallback(W => {
    W.preventDefault();
    W.stopPropagation();
    const Ce = W.deltaY || W.deltaX || 0;
    Ke(fe => {
      const Te = fe + Ce;
      const {
        max: Ue
      } = ve;
      return Math.max(0, Math.min(Te, Ue));
    });
  }, [ve.max]);
  g.useCallback(W => {
    W.preventDefault();
    W.stopPropagation();
    Ct.current = true;
    ee.current = W.clientY;
    Q.current = gt;
    document.addEventListener('mousemove', Ae);
    document.addEventListener('mouseup', nt);
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'grabbing';
  }, [gt]);
  const Ae = g.useCallback(W => {
    if (!Ct.current) {
      return;
    }
    const Ce = W.clientY - ee.current;
    const {
      max: fe,
      thumbH: Te,
      trackH: Ue
    } = ve;
    const Ye = fe > 0 && Ue > Te ? fe / (Ue - Te) : 0;
    const Pe = Q.current + Ce * Ye;
    Ke(Math.max(0, Math.min(Pe, fe)));
  }, [ve]);
  const nt = g.useCallback(() => {
    Ct.current = false;
    document.removeEventListener('mousemove', Ae);
    document.removeEventListener('mouseup', nt);
    document.body.style.userSelect = '';
    document.body.style.cursor = '';
  }, [Ae]);
  g.useCallback(W => {
    if (W.target !== W.currentTarget && W.target !== me.current) {
      return;
    }
    const Ce = W.currentTarget.getBoundingClientRect();
    const fe = W.clientY - Ce.top;
    const {
      max: Te,
      thumbH: Ue,
      trackH: Ye
    } = ve;
    const Pe = Te > 0 ? gt / Te * (Ye - Ue) : 0;
    const rt = fe < Pe + Ue / 2 ? gt - Ye * 0.8 : gt + Ye * 0.8;
    Ke(Math.max(0, Math.min(rt, Te)));
  }, [ve, gt]);
  const [_e, Z] = g.useState(null);
  const T = g.useRef(null);
  const K = g.useCallback((W, Ce = 'ok') => {
    if (T.current) {
      clearTimeout(T.current);
    }
    Z({
      message: W,
      type: Ce
    });
    T.current = setTimeout(() => {
      return Z(null);
    }, 2500);
  }, []);
  g.useEffect(() => {
    if (X && _t.current) {
      _t.current.focus();
    }
  }, [X]);
  g.useEffect(() => {
    if (Ve && Mt.current) {
      Mt.current.focus();
      Mt.current.select();
    }
  }, [Ve]);
  const Y = g.useMemo(() => {
    const W = new Map();
    W.set(null, []);
    for (const Ce of a) {
      W.set(Ce.id, []);
    }
    for (const Ce of n) {
      const fe = Ce.groupId || null;
      if (!W.has(fe)) {
        W.set(fe, []);
      }
      W.get(fe).push(Ce);
    }
    return W;
  }, [n, a]);
  const de = g.useMemo(() => {
    const W = [];
    for (const fe of a) {
      W.push({
        groupId: fe.id,
        groupName: fe.name,
        color: fe.color || null,
        accounts: Y.get(fe.id) || []
      });
    }
    const Ce = Y.get(null) || [];
    if (Ce.length > 0) {
      W.push({
        groupId: null,
        groupName: '未分组',
        accounts: Ce
      });
    }
    return W;
  }, [a, Y]);
  const ae = Ie.size;
  const we = g.useCallback((W, Ce) => {
    if (W.ctrlKey || W.metaKey) {
      W.preventDefault();
      const fe = new Set(Ie);
      if (fe.has(Ce.id)) {
        fe.delete(Ce.id);
      } else {
        fe.add(Ce.id);
      }
      De(fe);
    } else if (t) {
      t(Ce.id);
    }
  }, [Ie, t]);
  const Se = g.useCallback((W, Ce) => {
    W.preventDefault();
    W.stopPropagation();
    if (!Ie.has(Ce.id)) {
      De(new Set([Ce.id]));
    }
    it({
      x: W.clientX,
      y: W.clientY
    });
  }, [Ie]);
  const ge = g.useCallback(() => {
    it(null);
  }, []);
  g.useEffect(() => {
    if (!Be) {
      return;
    }
    const W = () => {
      return ge();
    };
    const Ce = fe => {
      if (fe.key === 'Escape') {
        ge();
      }
    };
    document.addEventListener('click', W);
    document.addEventListener('keydown', Ce);
    return () => {
      document.removeEventListener('click', W);
      document.removeEventListener('keydown', Ce);
    };
  }, [Be, ge]);
  const Le = g.useCallback(W => {
    var fe;
    const Ce = [...Ie];
    if (Ce.length === 0) {
      ge();
      return;
    }
    try {
      N(Ce, W);
      const Te = W ? ((fe = a.find(Ue => {
        return Ue.id === W;
      })) == null ? undefined : fe.name) || '指定分组' : '未分组';
      K(`已将 ${Ce.length} 个账号移至「${Te}」`, 'ok');
    } catch (Te) {
      K(`移动失败：${Te.message || '未知错误'}`, 'err');
    }
    De(new Set());
    ge();
  }, [Ie, a, N, ge, K]);
  const Ge = g.useCallback(() => {
    return De(new Set());
  }, []);
  const He = () => {
    const W = Ee.trim();
    if (W) {
      y(W);
      je('');
      re(false);
    }
  };
  const lt = W => {
    const Ce = W && (W.groupId || W.id) || null;
    if (Ce) {
      ze(Ce);
      Je(W.groupName || W.name || '');
    }
  };
  const st = () => {
    if (Ve && Qe.trim()) {
      b(Ve, Qe.trim());
    }
    ze(null);
    Je('');
  };
  const dt = W => {
    if (confirm('确定删除此分组？分组内的账号将移至「未分组」。')) {
      x(W);
      const Ce = new Set((Y.get(W) || []).map(Te => {
        return Te.id;
      }));
      const fe = new Set(Ie);
      for (const Te of Ce) {
        fe.delete(Te);
      }
      De(fe);
    }
  };
  const G = W => {
    et(W.id);
    wt(W.name || '');
  };
  const xe = W => {
    const Ce = (ct || '').trim();
    if (Ce) {
      d(W, {
        name: Ce
      });
    }
    et(null);
    wt('');
  };
  const Me = g.useRef(new Map());
  const Re = W => {
    const Ce = Me.current;
    Ce.set(W, (Ce.get(W) || 0) + 1);
    return Ce.get(W);
  };
  const $ = W => {
    if (W.autoStart !== true) {
      Re(W.id);
      d(W.id, {
        autoStart: true
      });
      return;
    }
    const fe = Re(W.id);
    Yy(W.id).finally(() => {
      if (Me.current.get(W.id) === fe) {
        d(W.id, {
          autoStart: false
        });
      }
    });
  };
  const ie = W => {
    const Ce = Y.get(W || null) || [];
    if (Ce.length === 0) {
      return;
    }
    if (Ce.every(Te => {
      return Te.autoStart === true;
    })) {
      const Te = new Map();
      for (const Ue of Ce) {
        Te.set(Ue.id, Re(Ue.id));
      }
      Promise.all(Ce.map(Ue => {
        return Yy(Ue.id);
      })).catch(() => {}).finally(() => {
        if (Ce.every(Ye => {
          return Me.current.get(Ye.id) === Te.get(Ye.id);
        })) {
          C(W || null, false);
        }
      });
      return;
    }
    for (const Te of Ce) {
      Re(Te.id);
    }
    C(W || null, true);
  };
  const be = W => {
    te(Ce => {
      if (Ce === W) {
        return null;
      } else {
        return W;
      }
    });
  };
  const ye = W => {
    const Ce = Y.get(W) || [];
    const fe = new Set(Ie);
    for (const Te of Ce) {
      fe.add(Te.id);
    }
    De(fe);
  };
  const Ne = W => {
    const Ce = Y.get(W) || [];
    const fe = new Set(Ie);
    for (const Te of Ce) {
      fe.delete(Te.id);
    }
    De(fe);
  };
  const $e = g.useCallback(async () => {
    if (!window.api) {
      _('当前环境不支持导入');
      return;
    }
    _('正在打开文件…');
    try {
      const W = await window.api.loadAccountsFile();
      if (!W) {
        _('');
        return;
      }
      let Ce;
      try {
        Ce = JSON.parse(W);
      } catch {
        _('文件格式错误');
        setTimeout(() => {
          return _('');
        }, 3000);
        return;
      }
      const fe = Ce.accounts || (Array.isArray(Ce) ? Ce : []);
      if (fe.length === 0) {
        _('文件中无账号数据');
        setTimeout(() => {
          return _('');
        }, 3000);
        return;
      }
      const Te = new Set(n.map(mt => {
        return mt.id;
      }));
      const Ue = new Set(n.map(mt => {
        return mt.partition;
      }).filter(Boolean));
      const Ye = new Set(n.map(mt => {
        return mt.name;
      }));
      const Pe = {
        used: '已登录',
        done: '已登录',
        idle: '已登录'
      };
      let rt = 0;
      let ot = 0;
      let ht = 0;
      const bt = Date.now().toString(36);
      for (let mt = 0; mt < fe.length; mt++) {
        const yt = fe[mt];
        const $n = yt.id || `acc_${bt}_${mt}`;
        const Yr = yt.partition || `persist:import_${$n}`;
        const Qn = yt.name || '豆包00';
        const pa = Pe[yt.status] || yt.status || '已登录';
        if (Te.has($n)) {
          ot++;
          continue;
        }
        if (Ye.has(Qn)) {
          ot++;
          continue;
        }
        if (Ue.has(Yr)) {
          ot++;
          continue;
        }
        const uo = yt.cookies || [];
        if (uo.length > 0) {
          try {
            _(`正在恢复 ${Qn} 的登录态…`);
            const B = await window.api.importAccountCookies(Yr, uo);
            if (B && B.ok) {
              ht += B.restored || 0;
            }
          } catch (B) {
            console.warn(`恢复 ${Qn} 的 cookie 失败:`, B);
          }
        }
        v({
          id: $n,
          name: Qn,
          type: ['dola', 'lovart', 'tapnow', 'gpt', 'other'].includes(yt.type) ? yt.type : 'doubao',
          status: pa,
          partition: Yr,
          addedAt: yt.addedAt || Date.now(),
          groupId: yt.groupId || null,
          fpSalt: yt.fpSalt || 0,
          fingerprint: yt.fingerprint || undefined,
          ...(yt.type === 'other' ? {
            url: yt.url || ''
          } : {})
        });
        Te.add($n);
        Ye.add(Qn);
        Ue.add(Yr);
        rt++;
      }
      const $t = [`✓ 导入 ${rt} 个账号`];
      if (ot > 0) {
        $t.push(`跳过 ${ot} 个（已存在）`);
      }
      if (ht > 0) {
        $t.push(`恢复 ${ht} 个登录凭证`);
      }
      _($t.join('，'));
      setTimeout(() => {
        return _('');
      }, 5000);
    } catch (W) {
      _('导入失败: ' + (W.message || W));
      setTimeout(() => {
        return _('');
      }, 3000);
    }
  }, [n, v, _]);
  const at = g.useMemo(() => {
    const W = {};
    for (const Ce of a) {
      W[Ce.id] = Ce.color || null;
    }
    return W;
  }, [a]);
  const Fe = W => {
    var rt;
    const Ce = at[W.groupId] || null;
    const fe = W.type === 'lovart' || W.type === 'tapnow';
    const Te = W.type === 'tapnow' ? 'Tapnow' : 'Lovart';
    const Ye = (fe && l && l[W.id] || []).length;
    const Pe = Ye > 0;
    return <div className={`account-row${W.id === e ? ' active' : ''}${Ie.has(W.id) ? ' checked' : ''}`} onClick={ot => {
      return we(ot, W);
    }} onContextMenu={ot => {
      return Se(ot, W);
    }} title={Ie.has(W.id) ? `${W.id === e ? '当前选中 + 后台' : '已选中'}（右键可移动到分组）` : '点击选择账号（关闭时不加载页面）；Ctrl+点击多选；右键移动到分组'} key={W.id}>
        <div className="account-row-body">
          <div className="account-avatar" style={Ce ? {
          background: Ce,
          color: MP(Ce)
        } : undefined}>
            {W.type === 'other' ? '其' : ((rt = (W.name || '豆').match(/\d+/)) == null ? undefined : rt[0]) || (W.name || '豆').slice(0, 1)}
          </div>
          <div className="account-meta">
            <div className="account-name">
              {ut === W.id ? <input ref={At} className="account-rename-input" value={ct} onChange={ot => {
              return wt(ot.target.value);
            }} onClick={ot => {
              return ot.stopPropagation();
            }} onKeyDown={ot => {
              if (ot.key === 'Enter') {
                xe(W.id);
              }
              if (ot.key === 'Escape') {
                et(null);
                wt('');
              }
            }} onBlur={() => {
              return xe(W.id);
            }} autoFocus={true} /> : <span className="account-name-text" onDoubleClick={ot => {
              ot.stopPropagation();
              G(W);
            }} title="双击重命名该账号">
                  {W.name}
                </span>}
            </div>
          </div>
        </div>
        {_P && <button className="lib-icon fp-diag" title="指纹诊断：查看该账号页面实际生效的指纹身份与真实出口网络（排查「网络环境较差」风控误判用）" onClick={ot => {
        ot.stopPropagation();
        h(W);
      }}>
            🔍
          </button>}
        <button className="lib-icon fp-regen" title="重新生成该账号浏览器指纹（生成后后台以全新身份出现）" onClick={ot => {
        ot.stopPropagation();
        if (window.confirm(`确认为「${W.name}」重新生成浏览器指纹？
生成后该账号将以全新虚拟身份出现，原指纹失效。`)) {
          f(W.id);
        }
      }}>
          ↻
        </button>
        <button className={`autostart-switch${W.autoStart === true ? ' on' : ''}`} role="switch" aria-checked={W.autoStart === true} style={W.autoStart === true && Ce ? {
        background: Ce
      } : undefined} title={W.autoStart === true ? '本会话保持开启（下次启动仍默认关闭）— 点击恢复按需模式' : '按需模式：任务需要时自动加载，完成后释放 — 点击可在本会话保持开启'} onClick={ot => {
        ot.stopPropagation();
        $(W);
      }}>
          <span className="autostart-knob" />
        </button>
        {fe && <button className={`lib-icon lovart-gallery-btn${Pe ? ' has-gallery' : ''}`} title={Pe ? `打开「${W.name}」的 ${Te} 画廊（当前 ${Ye} 张）` : `打开「${W.name}」的 ${Te} 画廊（暂无图片：进去后点「扫描」即可抓取）`} onClick={ot => {
        ot.stopPropagation();
        pe(W);
      }}>
            📷
          </button>}
        {W.type === 'lovart' && <button className="lib-icon" title="清空该 Lovart 账号缓存（退出异常登录态，随后可重新登录）" onClick={async ot => {
        ot.stopPropagation();
        if (window.confirm(`确认为「${W.name}」清空 Lovart 账号缓存？
将退出当前登录态并清除本地画廊，随后可重新登录。`)) {
          try {
            const ht = await u(W.id);
            if (ht && ht.ok) {
              setMsg(`✓ 已清空「${W.name}」的 Lovart 缓存，可重新登录`);
            } else {
              setMsg('清空失败：账号不存在');
            }
          } catch (ht) {
            setMsg('清空失败：' + (ht && ht.message ? ht.message : String(ht)));
          }
          setTimeout(() => {
            return setMsg('');
          }, 3000);
        }
      }}>
            🧹
          </button>}
        <button className="lib-icon del" title="移除账号（同时清理该账号的数据）" onClick={async ot => {
        var ht;
        ot.stopPropagation();
        if (W.partition && (ht = window.api) != null && ht.clearAccountSession) {
          try {
            await window.api.clearAccountSession(W.partition);
          } catch {}
        }
        c(W.id);
      }}>
          ✕
        </button>
      </div>;
  };
  return <div className="account-panel" ref={kt}>
      {ae > 0 && <div className="panel-head">
          <button className="btn sm ghost" onClick={Ge} title="取消所有选中">
            取消 {ae} 个选中
          </button>
        </div>}
      <div className="account-actions">
        <button className="btn primary block" onClick={() => {
        return R(true);
      }} style={{
        marginBottom: 6
      }}>
          ＋ 添加账号
        </button>
        <div className="account-tool-row">
          <button className="btn sm ghost" onClick={$e} title="从备份文件导入豆包账号（含登录状态）">
            导入
          </button>
          <button className="btn sm ghost" onClick={() => {
          return M(true);
        }} disabled={n.filter(W => {
          return (W.status || '已登录') === '已登录';
        }).length === 0} title="导出已登录账号（含登录凭证）">
            导出
          </button>
          <button className="btn sm ghost" onClick={() => {
          return ke(true);
        }} disabled={n.length < 2} title="跨账号指纹关联扫描：比对全部账号的指纹向量，自动标出完全重合或高度相似的配对">
            🔗 关联扫描
          </button>
          <button className="btn sm ghost" onClick={() => {
          return q(true);
        }} title="配置 Lovart 出口代理池：每个 Lovart 账号自动分配一个独立出口 IP（对应 Firefox 容器 + Mozilla VPN 的「每容器独立 IP」），仅需在此配置一次，无需每次登录手动设置">
            🌐 出口代理
          </button>
          <button className="btn sm ghost" onClick={he} disabled={ce} title="清理各账号页面的浏览器缓存（Cache / Code Cache 等），可释放数 GB 磁盘空间；登录态不受影响，账号不会掉线">
            {ce ? '🧹 清理中…' : '🧹 清理缓存'}
          </button>
        </div>
        {n.length >= 2 && <button className={`fp-health ${s.critical > 0 ? 'crit' : s.warn > 0 ? 'warn' : 'ok'}`} onClick={() => {
        return ke(true);
      }} title="实时隔离体检：点击查看跨账号指纹关联扫描详情">
            {s.critical > 0 ? `🔴 隔离风险：${s.critical} 对完全关联` : s.warn > 0 ? `🟡 隔离提示：${s.warn} 对高度相似` : '✅ 隔离体检：全部账号相互隔离'}
          </button>}
        {U && <div className={`account-import-msg ${U.startsWith('✓') ? 'import-ok' : 'import-err'}`}>
            {U}
          </div>}
        <div className="group-toolbar">
          {X ? <div className="group-input-row">
              <input ref={_t} className="group-name-input" placeholder="输入分组名称" value={Ee} onChange={W => {
            return je(W.target.value);
          }} onKeyDown={W => {
            if (W.key === 'Enter') {
              He();
            }
            if (W.key === 'Escape') {
              re(false);
              je('');
            }
          }} />
              <button className="btn primary sm" onClick={He}>
                确定
              </button>
              <button className="btn sm ghost" onClick={() => {
            re(false);
            je('');
          }}>
                取消
              </button>
            </div> : <button className="btn sm ghost" onClick={() => {
          return re(true);
        }}>
              ＋ 新建分组
            </button>}
        </div>
      </div>
      <div className="groups-scroll-wrap" ref={xt} onWheel={tt}>
        <div className="groups-inner" ref={Nt} style={{
        transform: `translateY(-${gt}px)`
      }}>
          {de.map(W => {
          const Ce = W.groupId || '__ungrouped__';
          const fe = !W.groupId;
          return <g.Fragment key={Ce}>
                {fe && <div className="ungrouped-divider" title="以下为未分组账号">
                    <span className="ungrouped-divider-line" />
                    <span className="ungrouped-divider-text">未分组</span>
                    <span className="ungrouped-divider-line" />
                  </div>}
                <_cmp_RP section={W} isCollapsed={fe ? false : le !== Ce} active={zt === Ce} onSelect={Te => {
              return Rt(Te);
            }} onToggleCollapse={fe ? () => {} : () => {
              return be(Ce);
            }} editingGroupId={Ve} renameValue={Qe} renameInputRef={Mt} onRenameChange={Te => {
              return Je(Te);
            }} onRenameConfirm={st} onStartRename={Te => {
              return lt(Te);
            }} onDeleteGroup={() => {
              return dt(W.groupId);
            }} onSetColor={k} onToggleAutoStart={() => {
              return ie(W.groupId);
            }} onSelectAll={() => {
              return ye(W.groupId);
            }} onDeselectAll={() => {
              return Ne(W.groupId);
            }} renderAccountRow={Fe} key={Ce} />
              </g.Fragment>;
        })}
        </div>
      </div>
      <div className="panel-foot">
        <label className="snap-toggle" title="开启后节点移动自动吸附到网格线">
          <input type="checkbox" checked={S} onChange={W => {
          return E(W.target.checked);
        }} />
          网格吸附
        </label>
        <button className="btn sm ghost block" onClick={j}>
          返回首页
        </button>
        <button className="btn sm danger block" onClick={() => {
        if (confirm('确定清空当前画布？此操作不可撤销。')) {
          P();
        }
      }}>
          清空画布
        </button>
      </div>
      {O && on.createPortal(<_cmp_TP onPick={W => {
      A(W);
      R(false);
      z(true);
    }} onClose={() => {
      return R(false);
    }} />, document.body)}
      {I && on.createPortal(<_cmp_$P type={D} onClose={() => {
      return z(false);
    }} />, document.body)}
      {F && on.createPortal(<_cmp_PP onClose={() => {
      return M(false);
    }} />, document.body)}
      {V && on.createPortal(V.type === 'tapnow' ? <_cmp__Component23 account={V} onClose={() => {
      return pe(null);
    }} /> : <_cmp__Component24 account={V} onClose={() => {
      return pe(null);
    }} />, document.body)}
      {se && on.createPortal(<_cmp_DP history={m} onClear={w} onClose={() => {
      return ke(false);
    }} />, document.body)}
      {ne && on.createPortal(<_cmp_LP onClose={() => {
      return q(false);
    }} />, document.body)}
      {Be && <div className="ctx-menu" style={{
      left: Be.x,
      top: Be.y
    }} onClick={W => {
      return W.stopPropagation();
    }}>
          <div className="ctx-menu-title">
            移动到…<span className="ctx-menu-count">{ae} 个账号</span>
          </div>
          {a.map(W => {
        return <div className="ctx-menu-item" onClick={() => {
          return Le(W.id);
        }} key={W.id}>
                {W.name}
              </div>;
      })}
          <div className="ctx-menu-sep" />
          <div className="ctx-menu-item ungroup" onClick={() => {
        return Le(null);
      }}>
            移出分组（未分组）
          </div>
        </div>}
      {_e && <div className={`ctx-toast ${_e.type === 'err' ? 'ctx-toast-err' : ''}`}>{_e.message}</div>}
    </div>;
}