// TODO(全局, 无需 import): m, e, w, o, v, alert, l, u, a, s, c, t, d, n, p, h, confirm, r, f
import { L, UP } from './shared.js';
import * as g from 'react';
export default function _Component47() {
  const e = L(m => {
    return m.projects;
  });
  const t = L(m => {
    return m.createProject;
  });
  const n = L(m => {
    return m.openProject;
  });
  const r = L(m => {
    return m.deleteProject;
  });
  const s = L(m => {
    return m.renameProject;
  });
  const o = L(m => {
    return m.importProject;
  });
  const [a, l] = g.useState(null);
  const [c, u] = g.useState('');
  const d = [...e].sort((m, w) => {
    return w.updatedAt - m.updatedAt;
  });
  const f = async () => {
    if (!window.api) {
      return;
    }
    const m = await window.api.loadFile();
    if (m) {
      try {
        const w = JSON.parse(m);
        const v = w.data || w;
        o(v, w.name || '导入的项目');
      } catch {
        alert('项目文件解析失败');
      }
    }
  };
  const p = m => {
    l(m.id);
    u(m.name);
  };
  const h = () => {
    if (a) {
      s(a, c);
    }
    l(null);
  };
  return <div className="startup">
      <div className="startup-card">
        <div className="startup-top">
          <img src="./icons/icon-128.png" alt="豆包画布" className="startup-logo" />
          <div className="startup-brand">豆包画布</div>
        </div>
        <div className="startup-sub">无限画布 · 素材连线 · 智能创作</div>
        <button className="btn primary block lg" onClick={() => {
        return t();
      }}>
          ＋ 新建项目
        </button>
        <div className="startup-divider">
          <span>打开历史项目</span>
        </div>
        <div className="startup-projects">
          {d.length === 0 && <div className="startup-empty">暂无历史项目，点击上方新建一个吧</div>}
          {d.map(m => {
          return <div className="startup-proj" onClick={() => {
            return n(m.id);
          }} key={m.id}>
                <div className="startup-proj-main" onDoubleClick={w => {
              w.stopPropagation();
              p(m);
            }}>
                  {a === m.id ? <input className="startup-proj-input" value={c} autoFocus={true} onClick={w => {
                return w.stopPropagation();
              }} onChange={w => {
                return u(w.target.value);
              }} onBlur={h} onKeyDown={w => {
                if (w.key === 'Enter') {
                  h();
                } else if (w.key === 'Escape') {
                  l(null);
                }
              }} /> : <span className="startup-proj-name">{m.name}</span>}
                  <span className="startup-proj-time">{UP(m.updatedAt)}</span>
                </div>
                <button className="lib-icon del" title="删除项目" onClick={w => {
              w.stopPropagation();
              if (confirm(`删除项目「${m.name}」？此操作不可撤销。`)) {
                r(m.id);
              }
            }}>
                  ✕
                </button>
              </div>;
        })}
        </div>
        <button className="btn ghost block import-btn" onClick={f}>
          导入项目文件（.json）
        </button>
      </div>
    </div>;
}