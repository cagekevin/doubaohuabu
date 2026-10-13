// TODO(全局, 无需 import): items, open, onClose, docked, w, v, y, o, l, t, e, m, s, u, alert, r, d, f, a, p, h, c, n, b, x
import _cmp__Component27 from './_Component27.jsx';
import * as g from 'react';
export default function SD({
  items: e,
  open: t,
  onClose: n,
  docked: r
}) {
  const [s, o] = g.useState('');
  const [a, l] = g.useState(false);
  const [c, u] = g.useState(false);
  g.useEffect(() => {
    if (!t) {
      return;
    }
    let m = false;
    (async () => {
      var w;
      var v;
      try {
        const y = await ((v = (w = window.api) == null ? undefined : w.getDownloadSettings) == null ? undefined : v.call(w));
        if (!m && y && y.ok) {
          o(y.path || '');
          l(!!y.configured);
        }
      } catch {}
    })();
    return () => {
      m = true;
    };
  }, [t]);
  if (!t) {
    return null;
  }
  const d = e.filter(m => {
    return m.type === 'image';
  });
  const f = e.filter(m => {
    return m.type === 'video';
  });
  const p = s ? s.length <= 40 ? s : s.slice(0, 18) + '…' + s.slice(-20) : '';
  const h = async () => {
    var m;
    var w;
    u(true);
    try {
      const v = await ((w = (m = window.api) == null ? undefined : m.pickDownloadPath) == null ? undefined : w.call(m));
      if (v && v.ok) {
        o(v.path);
        l(true);
      } else if (v && !v.canceled && v.error) {
        alert(`❌ 设置路径失败：${v.error}`);
      }
    } catch (v) {
      alert(`❌ 设置路径异常：${v && v.message ? v.message : String(v)}`);
    } finally {
      u(false);
    }
  };
  return <div className={`dola-media-panel${r ? ' docked' : ''}`}>
      <div className="dmp-head">
        <span className="dmp-title">无水印资源</span>
        <span className="dmp-count">
          图 {d.length} · 视频 {f.length}
        </span>
        {r && <div className="dmp-path-row dmp-path-inline" title={s}>
            <span className="dmp-path-label">下载到：</span>
            <span className={`dmp-path ${a ? 'is-configured' : 'is-default'}`}>
              {p || '(加载中…)'}
              {a ? null : <span className="dmp-path-tag">系统默认</span>}
            </span>
            <button className="btn xs ghost" onClick={h} disabled={c}>
              {c ? '设置中…' : '更改'}
            </button>
          </div>}
        <div className="dmp-actions">
          <button className="btn xs" onClick={() => {
          var m;
          var w;
          if ((w = (m = window.api) == null ? undefined : m.clearDolaMedia) == null) {
            return undefined;
          } else {
            return w.call(m);
          }
        }}>
            清空
          </button>
          <button className="btn xs" onClick={n}>
            {r ? '收起' : '关闭'}
          </button>
        </div>
      </div>
      {!r && <div className="dmp-path-row" title={s}>
          <span className="dmp-path-label">下载到：</span>
          <span className={`dmp-path ${a ? 'is-configured' : 'is-default'}`}>
            {p || '(加载中…)'}
            {a ? null : <span className="dmp-path-tag">系统默认</span>}
          </span>
          <button className="btn xs ghost" onClick={h} disabled={c}>
            {c ? '设置中…' : '更改'}
          </button>
        </div>}
      <div className="dmp-body">
        {e.length === 0 && <div className="dmp-empty">
            暂无。在 dola / 豆包 对话中生成或查看内容后，本面板会自动捕获无水印图片与视频。
          </div>}
        {e.map((m, w) => {
        return <div className="dmp-item" key={w}>
              <div className="dmp-thumb-wrap">
                {m.type === 'image' ? <img className="dmp-thumb" src={m.url} alt="" loading="lazy" /> : <_cmp__Component27 src={m.url} />}
              </div>
              <div className="dmp-meta">
                <span className="dmp-type">{m.type === 'image' ? '图片' : '视频'}</span>
                <a className="dmp-link" href={m.url} onClick={v => {
              var y;
              var b;
              v.preventDefault();
              if ((b = (y = window.api) == null ? undefined : y.openExternal) != null) {
                b.call(y, m.url);
              }
            }}>
                  原链接
                </a>
              </div>
              <div>
                <button className="btn xs primary" onClick={async () => {
              var y;
              var b;
              const v = document.activeElement;
              if (v) {
                v.textContent = '下载中…';
                v.disabled = true;
              }
              try {
                const x = await ((b = (y = window.api) == null ? undefined : y.downloadDolaMedia) == null ? undefined : b.call(y, m.url, m.type));
                console.log('[dola-media] 下载结果:', JSON.stringify(x));
                if (x && x.ok) {
                  alert(`✅ 已下载到：${x.path}
大小：${Math.round((x.size || 0) / 1024)}KB`);
                } else {
                  alert(`❌ 下载失败：${x && x.error ? x.error : '未知错误'}`);
                }
              } catch (x) {
                console.error('[dola-media] 下载异常:', x);
                alert(`❌ 下载异常：${x && x.message ? x.message : String(x)}`);
              } finally {
                if (v) {
                  v.textContent = '下载';
                  v.disabled = false;
                }
              }
            }}>
                  下载
                </button>
              </div>
            </div>;
      })}
      </div>
    </div>;
}