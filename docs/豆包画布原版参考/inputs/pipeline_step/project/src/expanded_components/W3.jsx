// TODO(全局, 无需 import): onActivated, initialStatus, t, S, r, E, o, e, u, f, m, n, a, h, status, expireAt, machineCode, l, s, x, k, N, b, C, marginTop, w, v, y, p, c, d
import { Zd, H3 } from './shared.js';
import * as g from 'react';
export default function W3({
  onActivated: e,
  initialStatus: t
}) {
  const [n, r] = g.useState('');
  const [s, o] = g.useState(t || null);
  const [a, l] = g.useState('');
  const [c, u] = g.useState('');
  const [d, f] = g.useState('');
  const [p, h] = g.useState(false);
  const m = g.useCallback(async () => {
    try {
      const S = await window.api.getMachineCode();
      if (S && S.ok) {
        r(S.machineCode);
      }
      const E = await window.api.getLicenseStatus();
      if (E && E.ok) {
        o(E);
        if (E.status === 'ok' && e) {
          e();
        }
      }
    } catch (S) {
      u('获取授权信息失败：' + ((S == null ? undefined : S.message) || S));
      f('err');
    }
  }, [e]);
  g.useEffect(() => {
    m();
  }, [m]);
  const w = async () => {
    if (n) {
      try {
        await window.api.copyTextToClipboard(n);
        u('机器码已复制到剪贴板');
        f('ok');
      } catch {
        u('复制失败，请手动选择复制');
        f('err');
      }
    }
  };
  const v = async () => {
    if (n) {
      try {
        const S = await window.api.exportMachineCode(n);
        if (S && S.ok) {
          u('机器码已导出：' + S.path);
          f('ok');
        } else {
          u((S == null ? undefined : S.error) || '导出已取消');
          f('err');
        }
      } catch (S) {
        u('导出失败：' + ((S == null ? undefined : S.message) || S));
        f('err');
      }
    }
  };
  const y = async () => {
    const S = a.trim();
    if (!S) {
      u('请输入激活码');
      f('err');
      return;
    }
    h(true);
    u('');
    try {
      const E = await window.api.activateWithCode(S);
      if (E && E.ok && E.status === 'ok') {
        o({
          status: 'ok',
          expireAt: E.expireAt,
          machineCode: n
        });
        u(`激活成功，有效期至 ${Zd(E.expireAt)}`);
        f('ok');
        l('');
        setTimeout(() => {
          return e && e();
        }, 600);
      } else if (E && E.status === 'tampered') {
        u('拒绝激活：检测到系统时间异常（' + (E.tamperReason || '时间篡改') + '）。请恢复正确的系统时间后重试。');
        f('err');
        m();
      } else if (E && E.status === 'used') {
        u('激活失败：该激活码已被使用，无法重复激活。每个激活码仅可成功激活一次，请使用新的激活码。');
        f('err');
        m();
      } else {
        u('激活失败：' + ((E == null ? undefined : E.error) || '未知错误'));
        f('err');
      }
    } catch (E) {
      u('激活失败：' + ((E == null ? undefined : E.message) || E));
      f('err');
    } finally {
      h(false);
    }
  };
  const b = s && s.status === 'ok';
  const x = s && s.status === 'expired';
  const k = s && s.status === 'invalid';
  const N = s && s.status === 'tampered';
  const C = x || k || N;
  return <div className="license-screen">
      <div className="license-card">
        <div className="license-top">
          <img src="./icons/icon-128.png" alt="豆包画布" className="license-logo" />
          <div className="license-brand">豆包画布</div>
        </div>
        <div className="license-sub">软件授权激活</div>
        {b && <div className="license-banner ok">
            <span className="lb-icon">✓</span>
            <div>
              <div className="lb-title">已激活</div>
              <div className="lb-desc">
                有效期至 {Zd(s.expireAt)}（{H3(s.expireAt)}）
              </div>
            </div>
          </div>}
        {x && <div className="license-banner warn">
            <span className="lb-icon">⏱</span>
            <div>
              <div className="lb-title">授权已过期</div>
              <div className="lb-desc">已于 {Zd(s.expireAt)} 到期，请重新激活以继续使用</div>
            </div>
          </div>}
        {k && <div className="license-banner err">
            <span className="lb-icon">✕</span>
            <div>
              <div className="lb-title">授权无效</div>
              <div className="lb-desc">
                {(s == null ? undefined : s.reason) || '授权文件异常，请重新激活'}
              </div>
            </div>
          </div>}
        {N && <div className="license-banner err">
            <span className="lb-icon">⚠</span>
            <div>
              <div className="lb-title">检测到系统时间篡改</div>
              <div className="lb-desc">
                系统时间被回拨或发生异常跳变，已拒绝激活与验证（安全告警）。请恢复正确的系统时间后点击「重新检测」。
              </div>
            </div>
          </div>}
        {C && <button className="btn ghost block" onClick={m} style={{
        marginTop: 12
      }}>
            重新检测授权状态
          </button>}
        <div className="license-section">
          <div className="license-label">本机机器码（发送给开发者以获取激活码）</div>
          <div className="machine-code-box">
            <code className="machine-code-text">{n || '正在生成…'}</code>
            <div className="machine-code-actions">
              <button className="btn sm" onClick={w} disabled={!n}>
                复制
              </button>
              <button className="btn sm ghost" onClick={v} disabled={!n}>
                导出文件
              </button>
            </div>
          </div>
          <div className="license-hint">
            机器码由本机硬件信息离线生成，与设备绑定。请将它提供给开发者，获取对应时长的激活码。
          </div>
        </div>
        <div className="license-section">
          <div className="license-label">输入激活码</div>
          <textarea className="license-input" placeholder="粘贴开发者提供的激活码" value={a} onChange={S => {
          return l(S.target.value);
        }} onKeyDown={S => {
          if (S.key === 'Enter' && (S.metaKey || S.ctrlKey)) {
            y();
          }
        }} spellCheck={false} />
          <button className="btn primary block lg" onClick={y} disabled={p}>
            {p ? '验证中…' : b ? '重新激活' : '激活'}
          </button>
        </div>
        {c && <div className={`license-msg ${d}`}>{c}</div>}
        <div className="license-foot">
          <span>激活状态已安全保存在本机，支持离线验证。</span>
        </div>
      </div>
    </div>;
}