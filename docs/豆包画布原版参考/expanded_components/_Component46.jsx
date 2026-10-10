// TODO(全局, 无需 import): onClose, S, P, E, s, v, image, video, o, u, t, n, baseUrl, j, model, params, keyInput, secretInput, _dirty, c, f, z, I, a, k, h, w, ok, message, enabled, e, r, l, imageProviderId, videoProviderId, fallbackProviderId, concurrency, y, m, C, b, O, x, R, d, p, N
import { L } from './shared.js';
import * as g from 'react';
export default function _Component46({
  onClose: e
}) {
  const t = L(S => {
    return S.apiProvidersMeta;
  });
  const n = L(S => {
    return S.apiConfigs;
  });
  const r = L(S => {
    return S.apiSetup;
  });
  const s = L(S => {
    return S.apiUsage;
  });
  const o = L(S => {
    return S.loadApiSetup;
  });
  const a = L(S => {
    return S.refreshApiConfig;
  });
  const l = L(S => {
    return S.saveApiSetup;
  });
  const [c, u] = g.useState({});
  const [d, f] = g.useState(false);
  const [p, h] = g.useState(null);
  const [m, w] = g.useState({});
  const v = (() => {
    const S = new Date();
    const E = P => {
      return String(P).padStart(2, '0');
    };
    return `${S.getFullYear()}-${E(S.getMonth() + 1)}-${E(S.getDate())}`;
  })();
  const y = s && s[v] || {
    image: 0,
    video: 0
  };
  g.useEffect(() => {
    o();
  }, [o]);
  g.useEffect(() => {
    u(S => {
      const E = {
        ...S
      };
      for (const P of t) {
        const j = n[P.id] || {};
        if (!E[P.id] || !E[P.id]._dirty) {
          E[P.id] = {
            baseUrl: j.baseUrl || '',
            model: j.model || '',
            params: {
              ...(j.params || {})
            },
            keyInput: '',
            secretInput: '',
            ...(E[P.id] || {})
          };
        }
      }
      return E;
    });
  }, [t, n]);
  const b = g.useCallback((S, E) => {
    u(P => {
      return {
        ...P,
        [S]: {
          ...P[S],
          ...E,
          _dirty: true
        }
      };
    });
  }, []);
  const x = g.useCallback((S, E, P) => {
    u(j => {
      return {
        ...j,
        [S]: {
          ...j[S],
          params: {
            ...(j[S].params || {}),
            [E]: P
          },
          _dirty: true
        }
      };
    });
  }, []);
  const k = g.useCallback(async S => {
    const E = c[S.id] || {};
    f(true);
    try {
      if (window.api && typeof window.api.apiConfigSet == 'function') {
        await window.api.apiConfigSet(S.id, {
          baseUrl: E.baseUrl || '',
          model: E.model || '',
          params: E.params || {}
        });
      }
      const P = String(E.keyInput || '').trim();
      let j = '';
      if (P && window.api && typeof window.api.apiConfigSetKey == 'function') {
        const z = await window.api.apiConfigSetKey(S.id, P);
        if (z && z.ok) {
          j = '，密钥已保存';
        } else {
          j = `，密钥保存失败：${z && z.error || '?'}`;
        }
      }
      const I = String(E.secretInput || '').trim();
      if (I && window.api && typeof window.api.apiConfigSetSecret == 'function') {
        const z = await window.api.apiConfigSetSecret(S.id, I);
        if (z && z.ok) {
          j += '，Secret 已保存';
        } else {
          j += `，Secret 保存失败：${z && z.error || '?'}`;
        }
      }
      await a();
      u(z => {
        return {
          ...z,
          [S.id]: {
            ...z[S.id],
            keyInput: '',
            secretInput: '',
            _dirty: false
          }
        };
      });
      L.getState().showToast(`「${S.name}」配置已保存${j}`, 'success');
    } catch (P) {
      L.getState().showToast(`保存失败：${P && P.message || P}`, 'error');
    } finally {
      f(false);
    }
  }, [c, a]);
  const N = g.useCallback(async S => {
    await k(S);
    h(S.id);
    try {
      const E = await window.api.apiConfigTest(S.id);
      w(P => {
        return {
          ...P,
          [S.id]: E || {
            ok: false,
            message: '无响应'
          }
        };
      });
    } catch (E) {
      w(P => {
        return {
          ...P,
          [S.id]: {
            ok: false,
            message: E && E.message || String(E)
          }
        };
      });
    } finally {
      h(null);
    }
  }, [k]);
  const C = g.useCallback(async S => {
    const E = n[S.id] || {};
    if (window.api && typeof window.api.apiConfigSet == 'function') {
      await window.api.apiConfigSet(S.id, {
        enabled: E.enabled === false
      });
      await a();
    }
  }, [n, a]);
  g.useEffect(() => {
    const S = E => {
      if (E.key === 'Escape') {
        e();
      }
    };
    window.addEventListener('keydown', S);
    return () => {
      return window.removeEventListener('keydown', S);
    };
  }, [e]);
  return <div className="modal-overlay" onMouseDown={e}>
      <div className="api-settings" onMouseDown={S => {
      return S.stopPropagation();
    }}>
        <div className="api-settings-head">
          <span className="api-settings-title">API 服务</span>
          <span className="api-settings-sub">
            对接第三方图像 / 视频生成服务；密钥经系统安全存储加密，明文不落盘、不显示
          </span>
          <button className="gp-close" onClick={e} title="关闭（Esc）">
            ✕
          </button>
        </div>
        <div className="api-settings-body">
          <div className="api-channel-config">
            <div className="api-section-title">通道配置</div>
            <div className="api-row">
              <span className="api-row-label">图片通道</span>
              <select className="api-input" value={r.imageProviderId || ''} onChange={S => {
              return l({
                imageProviderId: S.target.value || null
              });
            }}>
                <option value="">自动（首个可用）</option>
                {(t || []).filter(S => {
                return (S.capabilities || []).includes('image');
              }).map(S => {
                const E = n[S.id] || {};
                const P = E.enabled !== false && E.hasKey;
                return <option value={S.id} disabled={!P} key={S.id}>
                        {S.name}
                        {P ? '' : '（未启用/无密钥）'}
                      </option>;
              })}
              </select>
            </div>
            <div className="api-row">
              <span className="api-row-label">视频通道</span>
              <select className="api-input" value={r.videoProviderId || ''} onChange={S => {
              return l({
                videoProviderId: S.target.value || null
              });
            }}>
                <option value="">自动（首个可用）</option>
                {(t || []).filter(S => {
                return (S.capabilities || []).includes('video');
              }).map(S => {
                const E = n[S.id] || {};
                const P = E.enabled !== false && E.hasKey;
                return <option value={S.id} disabled={!P} key={S.id}>
                        {S.name}
                        {P ? '' : '（未启用/无密钥）'}
                      </option>;
              })}
              </select>
            </div>
            <div className="api-row">
              <span className="api-row-label">兜底服务商</span>
              <select className="api-input" value={r.fallbackProviderId || ''} onChange={S => {
              return l({
                fallbackProviderId: S.target.value || null
              });
            }}>
                <option value="">不兜底（主服务商失败即失败）</option>
                {(t || []).map(S => {
                const E = n[S.id] || {};
                const P = E.enabled !== false && E.hasKey;
                return <option value={S.id} disabled={!P} key={S.id}>
                      {S.name}
                      {P ? '' : '（未启用/无密钥）'}
                    </option>;
              })}
              </select>
            </div>
            <div className="api-row">
              <span className="api-row-label">队列并发数</span>
              <input className="api-input" type="number" min="1" max="20" value={r.concurrency || 3} onChange={S => {
              const E = Number(S.target.value);
              if (Number.isFinite(E)) {
                l({
                  concurrency: E
                });
              }
            }} />
            </div>
            <div className="api-usage">
              今日额度：图片 <b>{y.image || 0}</b> · 视频 <b>{y.video || 0}</b>
            </div>
          </div>
          {t.length === 0 ? <div className="api-settings-empty">正在加载服务商列表…（主进程未就绪时为空）</div> : t.map(S => {
          const E = n[S.id] || {};
          const P = c[S.id] || {};
          const j = m[S.id];
          return <div className="api-card" key={S.id}>
                  <div className="api-card-head">
                    <label className="api-enable" title="停用后生成面板不再显示该服务商">
                      <input type="checkbox" checked={E.enabled !== false} onChange={() => {
                  return C(S);
                }} />
                      <span className="api-card-name">{S.name}</span>
                    </label>
                    <span className="api-caps">
                      {(S.capabilities || []).map(I => {
                  if (I === 'video') {
                    return '视频';
                  } else {
                    return '图片';
                  }
                }).join(' · ')}
                    </span>
                  </div>
                  <div className="api-row">
                    <span className="api-row-label">接口地址</span>
                    <input className="api-input" placeholder={S.defaults && S.defaults.baseUrl || 'https://…'} value={P.baseUrl || ''} onChange={I => {
                return b(S.id, {
                  baseUrl: I.target.value
                });
              }} />
                  </div>
                  <div className="api-row">
                    <span className="api-row-label">API 密钥</span>
                    {E.hasKey ? <div className="api-key-hint-row">
                        <span className="api-key-hint">{E.keyHint}</span>
                        <input className="api-input" type="password" placeholder="输入新密钥以更换" value={P.keyInput || ''} onChange={I => {
                  return b(S.id, {
                    keyInput: I.target.value
                  });
                }} />
                      </div> : <input className="api-input" type="password" placeholder="粘贴服务商控制台生成的 API Key" value={P.keyInput || ''} onChange={I => {
                return b(S.id, {
                  keyInput: I.target.value
                });
              }} />}
                  </div>
                  <div className="api-row">
                    <span className="api-row-label">Secret Key</span>
                    <div className="api-key-hint-row">
                      <input className="api-input" type="password" placeholder="（可选）部分服务商需要的二次密钥" value={P.secretInput || ''} onChange={I => {
                  return b(S.id, {
                    secretInput: I.target.value
                  });
                }} />
                      {E.hasSecret && <span className="api-key-hint">已保存</span>}
                    </div>
                  </div>
                  {(S.paramSchema || []).map(I => {
              return <div className="api-row" key={I.key}>
                        <span className="api-row-label">{I.label}</span>
                        {I.type === 'select' ? <select className="api-input" value={String((P.params || {})[I.key] ?? I.default ?? '')} onChange={z => {
                  const O = z.target.value;
                  const R = Number(O);
                  x(S.id, I.key, O !== '' && !Number.isNaN(R) && String(R) === O ? R : O);
                }}>
                            {(I.options || []).map(z => {
                    return <option value={String(z.value)} key={String(z.value)}>
                                  {z.label}
                                </option>;
                  })}
                          </select> : <input className="api-input" type={I.type === 'number' ? 'number' : 'text'} value={String((P.params || {})[I.key] ?? I.default ?? '')} onChange={z => {
                  return x(S.id, I.key, z.target.value);
                }} />}
                      </div>;
            })}
                  <div className="api-card-foot">
                    <button className="btn sm primary" disabled={d} onClick={() => {
                return k(S);
              }}>
                      保存
                    </button>
                    <button className="btn sm" disabled={p === S.id} onClick={() => {
                return N(S);
              }} title="先保存草稿，再向服务商发一次鉴权探测请求">
                      {p === S.id ? '测试中…' : '测试连接'}
                    </button>
                    {j && <span className={`api-test-result ${j.ok ? 'ok' : 'bad'}`}>{j.message}</span>}
                  </div>
                </div>;
        })}
        </div>
      </div>
    </div>;
}