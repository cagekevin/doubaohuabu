// TODO(全局, 无需 import): data, selected, X, getNode, e, r, s, t, d, re, Ee, h, a, Ve, je, doubao, dola, lovart, tapnow, other, o, b, x, y, l, N, S, z, w, R, O, M, ze, Qe, T, Y, de, K, once, Z, auto, Je, ut, zt, ct, wt, At, it, Rt, Be, _t, Mt, head, current, tail, c, gt, Ct, ee, ve, qe, Ke, tt, me, Ae, name, Nt, dataUrl, kt, nt, _e, source, extensions, label, onClick, V, ne, q, he, oe, left, Ie, le, n, k, De, aspectRatio, v, m, p, P, j, _, H, I, C, E, A, D, ke, U, J, F, width, u, f, se, ce, pe, te
import _cmp_bk from './bk.jsx';
import { id, L, Kr, Hu, pt, Xt, io, on, Mn } from './shared.js';
import * as g from 'react';
export default function YL({
  id: e,
  data: t,
  selected: n
}) {
  const r = L(X => {
    return X.nodes;
  });
  const s = L(X => {
    return X.edges;
  });
  const o = L(X => {
    return X.accounts;
  });
  const a = L(X => {
    return X.groups;
  });
  const l = L(X => {
    return X.openGeneratePanel;
  });
  const {
    getNode: c
  } = Kr();
  const u = g.useMemo(() => {
    return Hu(e, r, s);
  }, [e, r, s]);
  const d = t || {};
  const f = d.model || 'seedance-2.0-mini';
  const p = L(X => {
    var re;
    var Ee;
    if (((Ee = (re = X.nodeNotices) == null ? undefined : re[e]) == null ? undefined : Ee.code) === 'generation-confirm') {
      return X.nodeNotices[e];
    } else {
      return null;
    }
  });
  const h = !!d.resultUrl || !!d.resultPoster;
  const m = (() => {
    if (d.apiJob && ['queued', 'submitting', 'running'].includes(d.apiJob.status)) {
      return true;
    }
    const X = [];
    if (d._pendingAttempt && d._pendingAttempt.status === 'pending') {
      X.push(d._pendingAttempt);
    }
    if (d._pendingAttempts) {
      for (const re of Object.values(d._pendingAttempts)) {
        if (re && re.status === 'pending') {
          X.push(re);
        }
      }
    }
    if (h && d.resultAt) {
      return X.some(re => {
        return re.at && re.at > d.resultAt && Date.now() - re.at < 1800000;
      });
    } else {
      return X.some(re => {
        return re.at && Date.now() - re.at < 1800000;
      });
    }
  })();
  const w = d.duration || 5;
  const v = (() => {
    const X = d.aspectRatio || '16:9';
    if (X === '9:16') {
      return '9 / 16';
    } else if (X === '1:1') {
      return '1 / 1';
    } else {
      return '16 / 9';
    }
  })();
  const y = g.useMemo(() => {
    const X = d.sendAccount;
    if (!X || X === 'auto') {
      return '全部账号（自动）';
    }
    if (typeof X == 'string' && X.startsWith('auto:group:')) {
      const Ee = X.slice(11);
      if (Ee === 'ungrouped') {
        return '未分组（自动）';
      }
      const je = (a || []).find(Ve => {
        return Ve.id === Ee;
      });
      return `${je && je.name || '分组'}（自动）`;
    }
    if (typeof X == 'string' && X.startsWith('auto:')) {
      return `${{
        doubao: '豆包',
        dola: 'Dola',
        lovart: 'Lovart',
        tapnow: 'Tapnow',
        other: '其他'
      }[X.slice(5)] || X.slice(5)}账号（自动）`;
    }
    const re = (o || []).find(Ee => {
      return Ee.id === X;
    });
    if (re) {
      return re.name;
    } else {
      return '豆包账号（自动）';
    }
  }, [d.sendAccount, o, a]);
  const b = g.useRef(null);
  const x = X => {
    b.current = {
      x: X.clientX,
      y: X.clientY
    };
  };
  const k = X => {
    const re = b.current;
    b.current = null;
    if (!re || !(Math.abs(X.clientX - re.x) + Math.abs(X.clientY - re.y) > 6)) {
      l(e);
    }
  };
  const N = g.useRef(null);
  const [C, S] = g.useState(false);
  const E = async X => {
    X.stopPropagation();
    const re = N.current;
    if (!re) {
      console.warn('[GenVideoNode] 播放按钮点击时 videoRef 为 null');
      return;
    }
    if (re.error) {
      console.warn('[GenVideoNode] 视频加载失败 code=', re.error.code, 'message=', re.error.message);
    }
    if (re.paused) {
      try {
        if (re.readyState < 2) {
          re.load();
        }
        await re.play();
      } catch (Ee) {
        console.warn('[GenVideoNode] play() 失败:', Ee == null ? undefined : Ee.name, Ee == null ? undefined : Ee.message);
        if (!re.muted) {
          try {
            re.muted = true;
            await re.play();
            re.muted = false;
          } catch {}
        }
      }
    } else {
      re.pause();
    }
  };
  const P = () => {
    return S(true);
  };
  const j = () => {
    return S(false);
  };
  const I = X => {
    var Ee;
    var je;
    const re = X.currentTarget;
    console.warn('[GenVideoNode] 视频加载错误 src=', re.src, 'code=', (Ee = re.error) == null ? undefined : Ee.code, 'msg=', (je = re.error) == null ? undefined : je.message);
  };
  const [z, O] = g.useState(0);
  const R = h && Number.isFinite(z) && z > 0 ? z : w;
  const D = Number.isFinite(R) ? Number.isInteger(R) ? String(R) : R.toFixed(1) : String(w);
  const A = h && Number.isFinite(z) && z > 0;
  const [F, M] = g.useState(0);
  const U = g.useRef(false);
  const _ = X => {
    const re = X.currentTarget;
    const Ee = Number.isFinite(re.duration) ? re.duration : 0;
    O(Ee);
    M(re.currentTime || 0);
  };
  const H = X => {
    return M(X.currentTarget.currentTime || 0);
  };
  const J = g.useCallback(X => {
    const re = N.current;
    const Ee = X.currentTarget;
    if (!re || !Ee) {
      return;
    }
    const je = Ee.getBoundingClientRect();
    if (!je.width) {
      return;
    }
    const Ve = Math.min(1, Math.max(0, (X.clientX - je.left) / je.width));
    const ze = Number.isFinite(re.duration) && re.duration > 0 ? re.duration : z;
    if (!ze) {
      return;
    }
    const Qe = Ve * ze;
    try {
      re.currentTime = Qe;
    } catch {}
    M(Qe);
  }, [z]);
  const se = g.useCallback(async X => {
    const re = N.current;
    const Ee = L.getState();
    if (!re) {
      return;
    }
    const je = Number.isFinite(re.duration) && re.duration > 0 ? re.duration : z;
    const Ve = X === 'head' ? 0 : X === 'tail' ? Math.max(0, je - 0.05) : re.currentTime;
    let ze = null;
    try {
      const Qe = re.currentSrc || re.src || d.resultUrl;
      if (!Qe) {
        throw new Error('无视频地址');
      }
      ze = document.createElement('video');
      ze.crossOrigin = 'anonymous';
      ze.muted = true;
      ze.playsInline = true;
      ze.preload = 'auto';
      await new Promise((Z, T) => {
        const K = setTimeout(() => {
          return T(new Error('取帧超时'));
        }, 8000);
        ze.addEventListener('loadedmetadata', () => {
          try {
            const Y = Number.isFinite(ze.duration) && ze.duration > 0 ? ze.duration : je;
            const de = Math.min(Ve, Math.max(0, Y - 0.05));
            ze.currentTime = Math.max(0, de);
          } catch (Y) {
            clearTimeout(K);
            T(Y);
          }
        }, {
          once: true
        });
        ze.addEventListener('seeked', () => {
          clearTimeout(K);
          Z();
        }, {
          once: true
        });
        ze.addEventListener('error', () => {
          clearTimeout(K);
          T(new Error('视频加载失败'));
        }, {
          once: true
        });
        ze.src = Qe;
        try {
          ze.load();
        } catch (Y) {
          clearTimeout(K);
          T(Y);
        }
      });
      const Je = ze.videoWidth;
      const ut = ze.videoHeight;
      if (!Je || !ut) {
        throw new Error('视频尺寸未就绪');
      }
      const ct = {
        '16:9': 16 / 9,
        '9:16': 9 / 16,
        '1:1': 1,
        '3:4': 3 / 4,
        '4:3': 4 / 3,
        '21:9': 21 / 9,
        auto: 16 / 9
      }[d.aspectRatio] || 16 / 9;
      let wt = Je;
      let At = ut;
      let _t = 0;
      let Mt = 0;
      const zt = Je / ut;
      if (zt > ct) {
        wt = ut * ct;
        _t = (Je - wt) / 2;
      } else if (zt < ct) {
        At = Je / ct;
        Mt = (ut - At) / 2;
      }
      const Rt = Math.max(2, Math.round(wt));
      const Be = Math.max(2, Math.round(At));
      const it = document.createElement('canvas');
      it.width = Rt;
      it.height = Be;
      it.getContext('2d').drawImage(ze, _t, Mt, wt, At, 0, 0, Rt, Be);
      const kt = it.toDataURL('image/jpeg', 0.92);
      const Nt = {
        head: '视频首帧',
        current: '视频当前帧',
        tail: '视频尾帧'
      }[X] || '视频当前帧';
      const gt = c(e) || {};
      const Ke = gt.position || {
        x: 0,
        y: 0
      };
      const Ct = gt.measured && gt.measured.width || gt.width || 380;
      const ee = Math.max(220, Ct - 24);
      const me = {
        w: ee,
        h: Math.round(54 + (ee - 18) / ct)
      };
      const ve = Z => {
        const T = Ee.nodes.find(K => {
          return K.id === Z;
        });
        return !!T && T.type === 'material';
      };
      const qe = (Ee.edges || []).filter(Z => {
        return Z.source === e && ve(Z.target);
      }).length;
      const tt = Math.floor(qe / 3);
      const Ae = qe % 3;
      const nt = {
        x: Ke.x + Ct + 60 + tt * (me.w + 40),
        y: Ke.y + Ae * (me.h + 24)
      };
      const _e = Ee.addMaterial({
        name: Nt,
        dataUrl: kt
      }, nt, me);
      if (_e) {
        Ee.addConnection({
          source: e,
          target: _e
        });
      }
      Ee.showToast(`已把「${Nt}」放到画布作参考图`, 'info');
    } catch (Qe) {
      Ee.showToast('截帧失败：' + ((Qe == null ? undefined : Qe.message) || '未知错误'), 'warn');
    } finally {
      if (ze) {
        try {
          ze.removeAttribute('src');
          try {
            ze.load();
          } catch {}
        } catch {}
      }
    }
  }, [e, z, c, d.aspectRatio, d.resultUrl]);
  const ke = g.useCallback(async () => {
    const X = !!d.resultUrl;
    const re = d.resultUrl || d.resultPoster;
    if (!re) {
      return;
    }
    const Ee = L.getState();
    const je = X ? 'mp4' : 'png';
    const Ve = `${d.label && d.label !== '文生视频' ? d.label : '文生视频'}_${Date.now()}.${je}`;
    const ze = window.api || {};
    try {
      let Qe = '';
      if (ze.downloadFileAs) {
        const Je = await ze.downloadFileAs(re, Ve, [{
          name: X ? '视频文件' : '图片文件',
          extensions: [je]
        }]);
        if (Je && Je.canceled) {
          return;
        }
        if (!Je || !Je.ok) {
          Ee.showToast('下载失败：' + (Je && Je.error || '未知错误'), 'warn', 5000);
          return;
        }
        Qe = Je.path || '';
      } else if (ze.downloadFile) {
        const Je = await ze.downloadFile(re, Ve);
        if (!Je || !Je.ok) {
          Ee.showToast('下载失败：' + (Je && Je.error || '未知错误'), 'warn', 5000);
          return;
        }
        Qe = Je.path || Ve;
      } else {
        const Je = document.createElement('a');
        Je.href = re;
        Je.download = Ve;
        document.body.appendChild(Je);
        Je.click();
        Je.remove();
        Ee.showToast(`已下载：${Ve}`, 'success', 6000);
        return;
      }
      Ee.showToast(`已下载到：${Qe || Ve}`, 'success', 9000, Qe && ze.revealPath ? {
        label: '在文件夹中显示',
        onClick: () => {
          return ze.revealPath(Qe);
        }
      } : null);
    } catch (Qe) {
      Ee.showToast('下载失败：' + ((Qe == null ? undefined : Qe.message) || '未知错误'), 'warn', 5000);
    }
  }, [d.resultUrl, d.resultPoster, d.label]);
  const V = d.genHistory && Array.isArray(d.genHistory.attempts) ? d.genHistory.attempts : [];
  const pe = typeof d.selVer == 'number' && d.selVer >= 0 && d.selVer < V.length ? d.selVer : V.length - 1;
  const [ne, q] = g.useState(false);
  const [ce, oe] = g.useState(null);
  const he = g.useRef(null);
  const Ie = g.useRef(null);
  const De = X => {
    X.stopPropagation();
    if (ne) {
      q(false);
      return;
    }
    const re = he.current && he.current.getBoundingClientRect();
    if (re) {
      const je = Math.max(8, Math.min(re.left, window.innerWidth - 264 - 8));
      oe({
        left: je,
        top: re.bottom + 8
      });
    }
    q(true);
  };
  g.useEffect(() => {
    if (!ne) {
      return;
    }
    const X = re => {
      const Ee = he.current && he.current.contains(re.target);
      const je = Ie.current && Ie.current.contains(re.target);
      if (!Ee && !je) {
        q(false);
      }
    };
    document.addEventListener('mousedown', X);
    return () => {
      return document.removeEventListener('mousedown', X);
    };
  }, [ne]);
  const le = g.useRef(new Set());
  g.useEffect(() => {
    if (!ne) {
      return;
    }
    const X = L.getState().nodes.find(Ee => {
      return Ee.id === e;
    });
    (X && X.data && X.data.genHistory && Array.isArray(X.data.genHistory.attempts) ? X.data.genHistory.attempts : []).forEach(Ee => {
      if (Ee.url && !Ee.poster && !le.current.has(Ee.url)) {
        le.current.add(Ee.url);
        _cmp_bk(Ee.url).then(je => {
          if (je) {
            try {
              L.getState().setGenvideoVersionPoster(e, Ee.id, je);
            } catch {}
          }
        }).catch(() => {});
      }
    });
  }, [ne, e, V]);
  const te = X => {
    try {
      const re = new Date(X);
      const Ee = je => {
        return String(je).padStart(2, '0');
      };
      return `${Ee(re.getMonth() + 1)}-${Ee(re.getDate())} ${Ee(re.getHours())}:${Ee(re.getMinutes())}`;
    } catch {
      return '';
    }
  };
  return <div className={`genvideo-node${n ? ' is-selected' : ''}`} onPointerDown={x} onClick={k} title="点击卡片（除正中播放按钮 / 时间线 / 下载 / 三帧按钮外）打开生成面板；正中按钮内联播放暂停；时间线拖动定位当前帧；↧ 下载结果；卡片下方三帧按钮把对应画面落到画布作参考图">
      <Mn type="target" position={pt.Left} />
      <Mn type="source" position={pt.Right} />
      <div className="gv-head">
        <span className="gv-dot" />
        <span className="gv-title">文生视频</span>
        {d.label && d.label !== '文生视频' ? <span className="gv-label">{d.label}</span> : null}
        <span className="gv-head-grow" />
        {V.length > 0 ? <button ref={he} type="button" className={`gv-hist-btn nodrag${ne ? ' is-open' : ''}`} title="历史版本：查看 / 切换历次生成的视频" onPointerDown={X => {
        return X.stopPropagation();
      }} onClick={De}>
            历史 {V.length}
          </button> : null}
      </div>
      <div className="gv-stage" style={{
      aspectRatio: v
    }}>
        {m ? <div className="gv-waiting" aria-label={p ? '等待后台确认' : '正在生成'} title={(p == null ? undefined : p.text) || undefined}>
            <div className="gvw-dots">
              <span />
              <span />
              <span />
            </div>
            <div className="gvw-text">
              {p ? p.level === 'warn' ? '后台待确认 · 请到账号页面查看' : '正在确认后台生成…' : h ? '正在生成新的一条…' : '正在生成 · 出片后展示在这里'}
            </div>
          </div> : null}
        {h ? d.resultUrl ? <video ref={N} className="gv-video" src={d.resultUrl} poster={d.resultPoster ? Xt(d.resultPoster, 480) : undefined} playsInline={true} preload="metadata" crossOrigin="anonymous" draggable={false} onPlay={P} onPause={j} onLoadedMetadata={_} onTimeUpdate={H} onError={I} key={d.resultUrl || 'video'} /> : d.resultPoster ? <img className="gv-video" src={Xt(d.resultPoster, 480)} alt="" draggable={false} loading="lazy" decoding="async" key={d.resultPoster || 'poster'} /> : <div className="gv-media-fallback">视频已生成</div> : <div className="gv-preview-empty">
            <div className="gv-preview-title">文生视频 · 在下方输入提示词</div>
            <div className="gv-preview-sub">点击卡片打开生成面板，出片直接展示在这里</div>
          </div>}
        {h && d.resultUrl ? <span className={`gv-play${C ? ' is-playing' : ''}`} role="button" tabIndex={0} aria-label={C ? '暂停' : '播放'} onClick={E} onKeyDown={X => {
        if (X.key === 'Enter' || X.key === ' ') {
          X.preventDefault();
          E(X);
        }
      }}>
            {C ? '❚❚' : '▶'}
          </span> : null}
        {h && d.resultUrl && A ? <span className="gv-dur-badge" aria-label={`真实时长 ${D} 秒`}>
            {D}s
          </span> : null}
        {h ? <button type="button" className="gv-dl nodrag" title="下载" aria-label="下载" onPointerDown={X => {
        return X.stopPropagation();
      }} onClick={X => {
        X.stopPropagation();
        ke();
      }}>
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3v12" />
              <path d="m7 11 5 5 5-5" />
              <path d="M4 20h16" />
            </svg>
          </button> : null}
        {h && d.resultUrl ? <div className="gv-tl nodrag" onPointerDown={X => {
        X.stopPropagation();
        U.current = true;
        try {
          X.currentTarget.setPointerCapture(X.pointerId);
        } catch {}
        J(X);
      }} onPointerMove={X => {
        if (U.current) {
          J(X);
        }
      }} onPointerUp={X => {
        U.current = false;
        X.stopPropagation();
      }} onPointerCancel={() => {
        U.current = false;
      }} onClick={X => {
        return X.stopPropagation();
      }}>
            {(() => {
          const X = z ? Math.min(100, Math.max(0, F / z * 100)) : 0;
          return <div className="gv-tl-track">
                  <div className="gv-tl-fill" style={{
              width: `${X}%`
            }} />
                  <span className="gv-tl-knob" style={{
              left: `${X}%`
            }} />
                </div>;
        })()}
          </div> : null}
      </div>
      <div className="gv-meta">
        已连接 {u.length} 个输入 · {y} · {io(f)} ·{' '}
        <span className={A ? 'gv-dur gv-dur-real' : 'gv-dur'}>{D}s</span>
      </div>
      {d.apiJob && d.apiJob.status && d.apiJob.status !== 'done' ? <div className={`gv-apijob gv-apijob-${d.apiJob.status}`} title="API 通道任务状态">
          {d.apiJob.status === 'queued' ? '⏳ API 排队中' : d.apiJob.status === 'submitting' ? '⏳ API 提交中' : d.apiJob.status === 'running' ? `🎬 API 生成中${typeof d.apiJob.progress == 'number' ? ` ${d.apiJob.progress}%` : '…'}` : d.apiJob.status === 'downloading' ? '⬇️ API 结果接收中' : d.apiJob.status === 'failed' ? `⚠️ API 失败：${d.apiJob.error && d.apiJob.error.message || '未知错误'}` : d.apiJob.status === 'cancelled' ? '⏹ API 任务已取消' : ''}
        </div> : null}
      {h && d.resultUrl ? <div className="gv-frame-actions nodrag" onMouseDown={X => {
      return X.stopPropagation();
    }} onClick={X => {
      return X.stopPropagation();
    }}>
          <button type="button" className="gv-frame-btn" onClick={() => {
        return se('head');
      }}>
            头帧→画布参考图
          </button>
          <button type="button" className="gv-frame-btn" onClick={() => {
        return se('current');
      }}>
            当前帧→画布参考图
          </button>
          <button type="button" className="gv-frame-btn" onClick={() => {
        return se('tail');
      }}>
            尾帧→画布参考图
          </button>
        </div> : null}
      {ne && V.length > 0 ? on.createPortal(<div className="gv-hist-pop" ref={Ie} style={ce ? {
      left: ce.left,
      top: ce.top
    } : undefined} onMouseDown={X => {
      return X.stopPropagation();
    }} onClick={X => {
      return X.stopPropagation();
    }}>
              <div className="gv-hist-title">历史版本 · 共 {V.length} 版</div>
              {V.map((X, re) => {
        const Ee = X.params && X.params.ratio || '自动';
        const je = X.duration || X.params && X.params.duration || '—';
        const Ve = io(X.params && X.params.model || '');
        const ze = re === pe;
        const Qe = !X.url;
        return <button type="button" className={`gv-hist-item${ze ? ' is-sel' : ''}${Qe ? ' is-disabled' : ''}`} title={Qe ? '该版本未出片（无视频）' : `切换到版本 #${re + 1}`} disabled={Qe} onClick={() => {
          L.getState().selectVersion(e, re);
          q(false);
        }} key={X.id || re}>
                    {X.poster ? <img className="gv-hist-thumb" src={Xt(X.poster, 120)} alt="" /> : <span className={`gv-hist-thumb${Qe ? ' is-empty' : ''}`}>
                        {Qe ? '无片' : '▶'}
                      </span>}
                    <span className="gv-hist-meta">
                      <span className="gv-hist-row">
                        #{re + 1} · {te(X.at)} · {X.accountName || '—'}
                      </span>
                      <span className="gv-hist-row">
                        {Ee} · {je}s · {Ve}
                      </span>
                      <span className="gv-hist-prompt">
                        {X.prompt ? X.prompt.slice(0, 24) : '（无提示词）'}
                      </span>
                    </span>
                  </button>;
      })}
            </div>, document.body) : null}
    </div>;
}