// TODO(全局, 无需 import): data, selected, w, s, v, e, r, y, t, l, o, u, f, b, a, N, C, S, E, status, size, path, error, x, c, d, n, p, h, m
import _cmp__Component28 from './_Component28.jsx';
import _cmp__Component30 from './_Component30.jsx';
import { id, L, Kd } from './shared.js';
import * as g from 'react';
import * as i from 'react';
export default function WL({
  id: e,
  data: t,
  selected: n
}) {
  const r = L(w => {
    return w.nodes;
  });
  const s = L(w => {
    return w.edges;
  });
  const o = g.useMemo(() => {
    return s.filter(v => {
      return v.target === e;
    }).map(v => {
      return r.find(y => {
        return y.id === v.source;
      });
    }).filter(v => {
      var y;
      return v && v.type === 'video' && ((y = v.data) == null ? undefined : y.url);
    });
  }, [r, s, e]);
  const [a, l] = g.useState((t == null ? undefined : t.folder) || '');
  const [c, u] = g.useState(false);
  const [d, f] = g.useState({});
  const p = g.useCallback(async () => {
    try {
      const w = await window.api.selectFolder();
      if (w) {
        l(w);
      }
    } catch {}
  }, []);
  const h = g.useCallback(async () => {
    var w;
    var v;
    if (!!a && !c && o.length !== 0) {
      u(true);
      f({});
      for (const y of o) {
        f(b => {
          return {
            ...b,
            [y.id]: 'downloading'
          };
        });
        try {
          const N = `${(((w = y.data) == null ? undefined : w.label) || ((v = y.data) == null ? undefined : v.vid) || 'video').replace(/[^a-zA-Z0-9_\u4e00-\u9fa5\-]/g, '_').slice(0, 60)}.mp4`;
          const C = `${a}/${N}`;
          const S = await window.api.downloadFile(y.data.url, C);
          if (S != null && S.ok) {
            f(E => {
              return {
                ...E,
                [y.id]: {
                  status: 'ok',
                  size: S.size,
                  path: S.path
                }
              };
            });
          } else {
            f(E => {
              return {
                ...E,
                [y.id]: {
                  status: 'err',
                  error: (S == null ? undefined : S.error) || '未知错误'
                }
              };
            });
          }
        } catch (b) {
          f(x => {
            return {
              ...x,
              [y.id]: {
                status: 'err',
                error: (b == null ? undefined : b.message) || String(b)
              }
            };
          });
        }
        await new Promise(b => {
          return setTimeout(b, 300);
        });
      }
      u(false);
    }
  }, [a, c, o]);
  const m = Object.values(d).filter(w => {
    return w.status === 'ok';
  }).reduce((w, v) => {
    return w + (v.size || 0);
  }, 0);
  return <i.Fragment>
      <div className={`download-node ${n ? 'selected' : ''}`}>
        <_cmp__Component28 minWidth={260} minHeight={140} isVisible={n} lineClassName="r-line" handleClassName="r-handle" />
        <div className="node-head">
          <span className="dot download-dot" />
          <span className="dn-title">下载节点</span>
          {o.length > 0 && <span className="dn-count">{o.length}</span>}
        </div>
        <div className="dn-body nodrag nopan">
          <div className="dn-folder-row">
            <span className="dn-folder-label">目录：</span>
            <span className="dn-folder-path" title={a || '未选择'}>
              {a ? a.replace(/^.*[\\/]/, '') : '未选择'}
            </span>
            <button className="dn-btn" onClick={p}>
              选择…
            </button>
          </div>
          {o.length > 0 && <div className="dn-video-list">
              {o.map(w => {
            var b;
            const v = d[w.id];
            const y = ((b = w.data) == null ? undefined : b.label) || '视频';
            return <div className={`dn-item ${(v == null ? undefined : v.status) || ''}`} key={w.id}>
                    <span className="dn-item-name" title={y}>
                      {y}
                    </span>
                    {(v == null ? undefined : v.status) === 'downloading' && <span className="dn-item-status dn-downloading">⬇</span>}
                    {(v == null ? undefined : v.status) === 'ok' && <span className="dn-item-status dn-ok" title={`${Kd(v.size)} · ${v.path}`}>
                        ✓ {Kd(v.size)}
                      </span>}
                    {(v == null ? undefined : v.status) === 'err' && <span className="dn-item-status dn-err" title={v.error}>
                        ✗
                      </span>}
                  </div>;
          })}
            </div>}
          {o.length === 0 && <div className="dn-empty">从视频节点连线至此处以批量下载</div>}
          <div className="dn-action-row">
            <button className={`dn-btn dn-btn-download${c ? ' downloading' : ''}`} onClick={h} disabled={!a || c || o.length === 0}>
              {c ? '下载中…' : `全部下载 (${o.length})`}
            </button>
            {m > 0 && <span className="dn-total-size">已下载 {Kd(m)}</span>}
          </div>
        </div>
      </div>
      <_cmp__Component30 source={false} />
    </i.Fragment>;
}