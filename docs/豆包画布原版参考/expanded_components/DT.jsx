// TODO(全局, 无需 import): info, onSelect, onCancel, o, l, t, name, a, dataUrl, w, h, n, e, r, s
import { L, Xt } from './shared.js';
export default function DT({
  info: e,
  onSelect: t,
  onCancel: n
}) {
  const r = L(o => {
    return o.library;
  });
  const s = async () => {
    var l;
    if ((l = window.api) == null || !l.importFiles) {
      return;
    }
    const o = await window.api.importFiles();
    if (!o || !o.length) {
      return;
    }
    const a = o[0];
    t({
      name: a.name,
      dataUrl: a.dataUrl,
      w: 400,
      h: 300
    });
  };
  return <div className="panel-backdrop" onMouseDown={n}>
      <div className="lib-picker" onMouseDown={o => {
      return o.stopPropagation();
    }}>
        <div className="lib-picker-title">
          {(e == null ? undefined : e.mode) === 'replace' ? '从资源库选择素材进行更换' : '选择素材节点绑定的素材'}
        </div>
        {r.length === 0 ? <div className="lib-picker-empty">资源库为空，请先从右侧资源库或文件添加素材。</div> : <div className="lib-picker-grid">
            {r.map(o => {
          return <button className="lib-pick-item" title={o.name} onClick={() => {
            return t(o);
          }} key={o.id}>
                  <img src={Xt(o.dataUrl, 240)} alt="" />
                  <span>{o.name}</span>
                </button>;
        })}
          </div>}
        <div className="lib-picker-foot">
          <button className="btn sm" onClick={s}>
            从文件选择
          </button>
          <button className="btn sm ghost" onClick={n}>
            取消
          </button>
        </div>
      </div>
    </div>;
}