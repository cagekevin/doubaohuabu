// TODO(全局, 无需 import): onClose, d, t, r, s, f, n, l, e, o, u, a, c, p, h
import { L, ul } from './shared.js';
import * as g from 'react';
export default function LP({
  onClose: e
}) {
  const t = L(d => {
    return d.proxyPool;
  });
  const n = L(d => {
    return d.setProxyPool;
  });
  const r = L(d => {
    return d.accounts;
  });
  const [s, o] = g.useState((t || []).join(`
`));
  const [a, l] = g.useState('');
  const c = r.filter(d => {
    return (d.type || 'doubao') === 'lovart';
  });
  const u = () => {
    const d = s.split(`
`).map(f => {
      return f.trim();
    }).filter(Boolean);
    n(d);
    l(d.length ? `✓ 已保存 ${d.length} 个出口，Lovart 账号已自动重新分配` : '✓ 已清空代理池，全部 Lovart 账号恢复直连');
  };
  return <div className="login-backdrop">
      <div className="login-modal proxy-pool-modal">
        <div className="login-head">
          <span className="login-title">Lovart 出口代理池</span>
          <div className="login-actions">
            <button className="btn sm ghost" onClick={e}>
              关闭
            </button>
          </div>
        </div>
        <div className="proxy-pool-body">
          <p className="proxy-pool-tip">
            每行一个代理（支持 <code>http://host:port</code> / <code>socks5://host:port</code> /{' '}
            <code>host:port</code>），留空则全部走直连。 保存后，
            <b>新增 Lovart 账号会自动按序循环分配不同出口 IP</b>，已登录账号也会立即重新分配 —— 对应
            Firefox 容器 + Mozilla VPN「每个容器独立 IP」的效果，站点无法用「同 IP
            多账号」判定关联。
          </p>
          <textarea className="proxy-pool-input" value={s} onChange={d => {
          return o(d.target.value);
        }} placeholder={`http://127.0.0.1:7890
socks5://127.0.0.1:1080
http://user:pass@proxy.example.com:8080`} rows={6} />
          <div className="proxy-pool-actions">
            <button className="btn primary sm" onClick={u}>
              保存并自动分配
            </button>
            <span className={`login-status ${a.startsWith('✓') ? 'feedback-ok' : ''}`}>{a}</span>
          </div>
          <div className="proxy-pool-assign">
            <div className="proxy-pool-assign-title">当前 Lovart 账号出口分配</div>
            {c.length === 0 ? <div className="account-empty">暂无 Lovart 账号</div> : <ul className="proxy-pool-list">
                {c.map((d, f) => {
              const p = t || [];
              const h = p.length ? p[f % p.length] : '';
              return <li key={d.id}>
                      <span className="pl-name">{d.name}</span>
                      <span className={`pl-net${h ? '' : ' direct'}`}>{h || '直连'}</span>
                    </li>;
            })}
              </ul>}
          </div>
        </div>
      </div>
    </div>;
}