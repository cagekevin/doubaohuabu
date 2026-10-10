// TODO(全局, 无需 import): onClear, onClose, l, r, s, d, c, u, n, a, e, t, o
import { L, zk, Jl } from "./shared.js";
import * as g from 'react';
export default function DP({
  history: e = [],
  onClear: t,
  onClose: n
}) {
  const r = L(l => {
    return l.accounts;
  });
  const s = g.useMemo(() => {
    return zk(r);
  }, [r]);
  const o = g.useCallback(() => {
    const l = s.pairs.length === 0 ? ['未检测到任何指纹重合配对 ✓'] : s.pairs.map(d => {
      return `${d.level === 'critical' ? '🔴' : '🟡'} ${d.a} ⇄ ${d.b}：重合 ${d.matched.length}/${Jl.length} 维 [${d.matched.join('、')}]`;
    });
    const c = s.dimDistinct.map(d => {
      return `  ${d.label}: ${d.distinct} 个不同值${d.distinct <= 1 ? ' （无隔离力）' : ''}`;
    }).join(`
`);
    const u = `跨账号指纹关联扫描
扫描账号: ${s.withFpCount} 个（${s.noFp} 个无指纹记录已跳过）
比对配对: ${s.totalPairs} 对
🔴 完全关联(全维重合): ${s.critical} 对
🟡 高度相似(≥70%重合): ${s.warn} 对

维度分布（不同值数量，越少越容易被关联）:
${c}

问题配对:
${l.join(`
`)}`;
    if (window.api && window.api.copyTextToClipboard) {
      window.api.copyTextToClipboard(u);
    }
  }, [s]);
  const a = s.critical === 0 && s.warn === 0;
  return <div className="login-backdrop" onClick={n}>
      <div className="linkscan-modal" onClick={l => {
      return l.stopPropagation();
    }}>
        <div className="linkscan-head">
          <span className="linkscan-title">🔗 跨账号指纹关联扫描</span>
          <button className="btn sm ghost" onClick={n}>
            关闭
          </button>
        </div>
        <div className="linkscan-sub">
          把 {s.withFpCount} 个带指纹的账号两两比对（共 {s.totalPairs} 对）
          {s.noFp > 0 && `，跳过 ${s.noFp} 个无指纹记录账号`}。
          基于账号存储指纹向量；如需逐项实测请用单账号 🔍 自检。
        </div>
        {(() => {
        const l = r.filter(c => {
          return c.type === 'lovart';
        }).length;
        if (l < 2) {
          return null;
        } else {
          return <div className="linkscan-sub linkscan-sub-warn">
                ⚠ Lovart 账号共 {l} 个：已按 Firefox Multi-Account Containers
                思路为每个账号建立独立容器（独立 cookie/storage/cache/service worker，剥离高熵
                Client Hints）。 但 Lovart 使用「纯净会话」过 Turnstile，<b>同机同真实设备指纹</b>{' '}
                仍可被站点关联 —— 建议：① 不要多个 Lovart 账号同时在线；②
                必要时在不同网络/设备登录不同账号。
              </div>;
        }
      })()}
        <div className={`linkscan-verdict ${a ? 'ok' : s.critical > 0 ? 'crit' : 'warn'}`}>
          {a ? '✓ 未发现任何指纹重合配对，全部账号相互隔离' : `⚠ 发现 ${s.critical} 对完全关联 + ${s.warn} 对高度相似，存在账号关联风险`}
        </div>
        {s.pairs.length > 0 && <div className="linkscan-table">
            <div className="linkscan-row linkscan-row-h">
              <span>账号 A</span>
              <span>账号 B</span>
              <span>重合维度</span>
              <span>风险</span>
            </div>
            {s.pairs.map((l, c) => {
          return <div className={`linkscan-row ${l.level}`} key={c}>
                  <span className="linkscan-name">{l.a}</span>
                  <span className="linkscan-name">{l.b}</span>
                  <span className="linkscan-matched">{l.matched.join('、')}</span>
                  <span className="linkscan-level">
                    {l.level === 'critical' ? '🔴 完全关联' : '🟡 高度相似'}
                  </span>
                </div>;
        })}
          </div>}
        <div className="linkscan-dist">
          <div className="linkscan-dist-title">维度分布（不同值越少越易被关联）</div>
          <div className="linkscan-dist-grid">
            {s.dimDistinct.map((l, c) => {
            return <div className={`linkscan-dist-cell ${l.distinct <= 1 ? 'weak' : ''}`} key={c}>
                  <span className="linkscan-dist-label">{l.label}</span>
                  <span className="linkscan-dist-val">{l.distinct} 种</span>
                </div>;
          })}
          </div>
        </div>
        <div className="linkscan-history">
          <div className="linkscan-dist-title">
            隔离体检历史（最近 {e.length} 次，按风险签名自动去重）
            {e.length > 0 && <button className="linkscan-clear" onClick={t}>
                清空
              </button>}
          </div>
          {e.length === 0 ? <div className="linkscan-hist-empty">
              暂无记录。账号或指纹发生变化且隔离状态改变时，会自动留档。
            </div> : <div className="linkscan-hist-list">
              {e.slice(0, 20).map((l, c) => {
            return <div className={`linkscan-hist-row ${l.critical > 0 ? 'crit' : l.warn > 0 ? 'warn' : 'ok'}`} key={c}>
                    <span className="linkscan-hist-time">{new Date(l.ts).toLocaleString()}</span>
                    <span className="linkscan-hist-sum">
                      {l.critical > 0 ? `🔴 ${l.critical} 对完全关联` : l.warn > 0 ? `🟡 ${l.warn} 对高度相似` : '✅ 全部隔离'}{' '}
                      · {l.total} 账号 / {l.totalPairs} 对
                    </span>
                  </div>;
          })}
            </div>}
        </div>
        <div className="linkscan-actions">
          <button className="btn sm" onClick={o}>
            复制报告
          </button>
        </div>
      </div>
    </div>;
}