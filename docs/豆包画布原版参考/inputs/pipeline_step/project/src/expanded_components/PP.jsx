// TODO(全局, 无需 import): onClose, h, r, t, n, m, l, o, y, ok, cookies, x, name, type, status, partition, addedAt, fpSalt, fingerprint, b, exportedAt, accounts, w, v, e, a, color, u, d, f, s, p, c
import { L, id } from './shared.js';
import * as g from 'react';
import { version } from 'react';
export default function PP({
  onClose: e
}) {
  const t = L(h => {
    return h.accounts;
  });
  const [n, r] = g.useState(new Set());
  const [s, o] = g.useState(false);
  const [a, l] = g.useState('');
  g.useEffect(() => {
    r(new Set(t.map(h => {
      return h.id;
    })));
  }, [t]);
  const c = h => {
    const m = new Set(n);
    if (m.has(h)) {
      m.delete(h);
    } else {
      m.add(h);
    }
    r(m);
  };
  const u = () => {
    return r(new Set(t.map(h => {
      return h.id;
    })));
  };
  const d = () => {
    return r(new Set());
  };
  const f = async () => {
    if (!window.api) {
      l('当前环境不支持导出');
      return;
    }
    const h = t.filter(m => {
      return n.has(m.id);
    });
    if (h.length === 0) {
      l('请至少选择一个账号');
      return;
    }
    o(true);
    l('正在导出账号数据…');
    try {
      const m = [];
      for (const y of h) {
        l(`正在导出 ${y.name}…`);
        let b = {
          ok: false,
          cookies: []
        };
        try {
          b = await window.api.exportAccountCookies(y.partition);
        } catch (x) {
          console.warn(`获取 ${y.name} 的 cookie 失败:`, x);
        }
        m.push({
          id: y.id,
          name: y.name,
          type: y.type || 'doubao',
          status: y.status,
          partition: y.partition,
          addedAt: y.addedAt,
          fpSalt: y.fpSalt || 0,
          fingerprint: y.fingerprint || null,
          cookies: b.ok ? b.cookies : []
        });
      }
      const w = JSON.stringify({
        version: 1,
        exportedAt: new Date().toISOString(),
        accounts: m
      }, null, 2);
      const v = await window.api.saveAccountsFile(w);
      if (v && v.ok) {
        l(`✓ 已导出 ${m.length} 个账号`);
        setTimeout(() => {
          return e();
        }, 1200);
      } else {
        l((v == null ? undefined : v.error) || '保存取消');
        o(false);
      }
    } catch (m) {
      l('导出失败: ' + (m.message || m));
      o(false);
    }
  };
  const p = t.filter(h => {
    return (h.status || '已登录') === '已登录';
  });
  return <div className="login-backdrop">
      <div className="login-modal export-modal">
        <div className="login-head">
          <span className="login-title">导出账号</span>
          <div className="login-actions">
            <span className={`login-status ${a.startsWith('✓') ? 'feedback-ok' : ''}`} style={{
            color: a.startsWith('✓') ? '#065f46' : undefined
          }}>
              {a}
            </span>
            <button className="btn sm ghost" onClick={u}>
              全选
            </button>
            <button className="btn sm ghost" onClick={d}>
              取消全选
            </button>
            <button className="btn primary sm" onClick={f} disabled={s}>
              {s ? '导出中…' : `导出选中 (${n.size})`}
            </button>
            <button className="btn sm ghost" onClick={e} disabled={s}>
              关闭
            </button>
          </div>
        </div>
        <div className="export-body">
          {p.length === 0 && <div className="account-empty">暂无已登录账号</div>}
          {p.map(h => {
          var m;
          return <label className={`account-row export-row ${n.has(h.id) ? 'active' : ''}`} key={h.id}>
                <input type="checkbox" className="export-check" checked={n.has(h.id)} onChange={() => {
              return c(h.id);
            }} />
                <div className="account-avatar">
                  {h.type === 'other' ? '其' : ((m = (h.name || '豆').match(/\d+/)) == null ? undefined : m[0]) || (h.name || '豆').slice(0, 1)}
                </div>
                <div className="account-meta">
                  <div className="account-name">{h.name}</div>
                </div>
              </label>;
        })}
        </div>
      </div>
    </div>;
}