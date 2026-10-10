// TODO(全局, 无需 import): _, e, J, H, N, C, E, P, pe, se, ne, I, ce, item, onMove, ke, onUp, V, dataUrl, name, w, h, z, a, alert, k, x, favorite, t, d, natW, natH, p, m, f, s, R, u, D, A, F, c, y, S, j, b, o, v, M, U, r, l, n, left, O
import { L, TT, id, Ky, Pu, ql, Xt, br } from './shared.js';
import * as g from 'react';
export default function RT() {
  const e = L(_ => {
    return _.library;
  });
  const t = L(_ => {
    return _.addToLibrary;
  });
  const n = L(_ => {
    return _.removeFromLibrary;
  });
  const r = L(_ => {
    return _.toggleFavorite;
  });
  const s = L(_ => {
    return _.renameLibrary;
  });
  const o = L(_ => {
    return _.reorderLibrary;
  });
  const a = L(_ => {
    return _.replaceLibrary;
  });
  const l = L(_ => {
    return _.getLibraryRefCount;
  });
  const c = g.useMemo(() => {
    const _ = e.filter(J => {
      return J.favorite;
    });
    const H = e.filter(J => {
      return !J.favorite;
    });
    return [..._, ...H];
  }, [e]);
  const [u, d] = g.useState(false);
  const [f, p] = g.useState(null);
  const [h, m] = g.useState('');
  const [w, v] = g.useState(null);
  const [y, b] = g.useState(null);
  const [x, k] = g.useState(null);
  const N = g.useRef(null);
  const C = g.useRef(false);
  const [S, E] = g.useState(null);
  const P = () => {
    const _ = N.current;
    if (_) {
      if (_.timerId) {
        clearTimeout(_.timerId);
      }
      window.removeEventListener('mousemove', _.onMove);
      window.removeEventListener('mouseup', _.onUp);
    }
    N.current = null;
    C.current = false;
    E(null);
    try {
      const H = document.querySelector('.doubao-view-webviews');
      if (H) {
        H.classList.remove('nip-drop-active');
      }
    } catch {}
  };
  const j = (_, H) => {
    if (_.button !== 0 || _.target && _.target.closest && _.target.closest('button, input')) {
      return;
    }
    if (N.current) {
      P();
    }
    const J = _.clientX;
    const se = _.clientY;
    C.current = true;
    E(H.id);
    const ke = pe => {
      const ne = N.current;
      if (!ne) {
        return;
      }
      if (Math.hypot(pe.clientX - J, pe.clientY - se) > TT) {
        const ce = ne.item;
        P();
        I(ce);
      }
    };
    const V = () => {
      return P();
    };
    N.current = {
      item: H,
      onMove: ke,
      onUp: V
    };
    window.addEventListener('mousemove', ke);
    window.addEventListener('mouseup', V);
  };
  const I = _ => {
    try {
      const H = document.querySelector('.doubao-view-webviews');
      if (H) {
        H.classList.add('nip-drop-active');
      }
    } catch {}
    try {
      if (window.api && typeof window.api.startFileDrag == 'function') {
        window.api.startFileDrag({
          dataUrl: _.dataUrl,
          name: _.name || 'image'
        });
      }
    } catch {}
  };
  const z = _ => {
    return new Promise(H => {
      const J = new Image();
      J.onload = () => {
        return H({
          w: J.naturalWidth || 0,
          h: J.naturalHeight || 0
        });
      };
      J.onerror = () => {
        return H({
          w: 0,
          h: 0
        });
      };
      J.src = _;
    });
  };
  const O = async _ => {
    if (!window.api) {
      return;
    }
    const H = await window.api.importFiles();
    if (!H || !H.length) {
      return;
    }
    const J = H[0];
    const {
      w: se,
      h: ke
    } = await z(J.dataUrl);
    const V = a(_.id, {
      dataUrl: J.dataUrl,
      w: se,
      h: ke
    });
    if (!V || !V.ok) {
      alert('替换素材失败：' + (V && V.error || '未知错误'));
    }
  };
  g.useEffect(() => {
    if (!x) {
      return;
    }
    const _ = () => {
      return k(null);
    };
    const H = se => {
      if (se.key === 'Escape') {
        k(null);
      }
    };
    const J = se => {
      if (!se.target || !se.target.closest || !se.target.closest('.lib-row')) {
        k(null);
      }
    };
    window.addEventListener('click', _);
    window.addEventListener('keydown', H);
    window.addEventListener('contextmenu', J);
    return () => {
      window.removeEventListener('click', _);
      window.removeEventListener('keydown', H);
      window.removeEventListener('contextmenu', J);
    };
  }, [x]);
  const R = async () => {
    if (!window.api) {
      return;
    }
    const _ = await window.api.importFiles();
    if (!!_ && !!_.length) {
      for (const H of _) {
        const J = {
          id: Ky(),
          name: H.name,
          dataUrl: H.dataUrl,
          favorite: false
        };
        const se = new Image();
        se.onload = () => {
          return t([{
            ...J,
            w: se.naturalWidth,
            h: se.naturalHeight
          }]);
        };
        se.onerror = () => {
          return t([J]);
        };
        se.src = H.dataUrl;
      }
    }
  };
  const D = _ => {
    _.preventDefault();
    _.dataTransfer.dropEffect = 'copy';
    d(true);
  };
  const A = _ => {
    if (_.currentTarget === _.target) {
      d(false);
    }
  };
  const F = async _ => {
    _.preventDefault();
    d(false);
    const H = Array.from(_.dataTransfer.files || []).filter(J => {
      return (J.type || '').startsWith('image/');
    });
    for (const J of H) {
      const {
        name: se,
        dataUrl: ke,
        natW: V,
        natH: pe
      } = await Pu(J);
      t([{
        id: Ky(),
        name: se,
        dataUrl: ke,
        w: V,
        h: pe,
        favorite: false
      }]);
    }
  };
  const M = _ => {
    p(_.id);
    m(_.name);
  };
  const U = () => {
    if (f) {
      s(f, (h || '').trim() || '未命名');
    }
    p(null);
  };
  return <div className="library-panel">
      <div className="library-head">
        <span className="library-title">资源库</span>
        <div className="library-head-actions">
          <button className="btn primary sm" onClick={R}>
            ＋ 添加
          </button>
        </div>
      </div>
      <div className={`library-list ${u ? 'drag-over' : ''}`} onDragOver={D} onDragLeave={A} onDrop={F}>
        {e.length === 0 && <div className="library-empty">
            拖入图片
            <br />
            或点击「添加」
          </div>}
        {c.map(_ => {
        return <div data-lib-id={_.id} className={`lib-row ${w === _.id ? 'dragging' : ''} ${y === _.id && w && w !== _.id ? 'drag-over-row' : ''} ${S === _.id ? 'lib-armed' : ''}`} draggable={false} onMouseDown={H => {
          return j(H, _);
        }} onDragOver={H => {
          if (H.dataTransfer.types.includes(ql)) {
            H.preventDefault();
            H.dataTransfer.dropEffect = 'move';
            if (w && w !== _.id) {
              b(_.id);
            }
          }
        }} onDrop={H => {
          if (H.dataTransfer.types.includes(ql)) {
            H.preventDefault();
            H.stopPropagation();
            const J = H.dataTransfer.getData(ql);
            if (J && J !== _.id) {
              o(J, _.id);
            }
            v(null);
            b(null);
          }
        }} onDragEnd={() => {
          v(null);
          b(null);
        }} onContextMenu={H => {
          H.preventDefault();
          k({
            id: _.id,
            x: H.clientX,
            y: H.clientY
          });
        }} key={_.id}>
              <img className="lib-thumb" src={Xt(_.dataUrl, 240)} alt="" draggable={false} loading="lazy" decoding="async" />
              <div className="lib-name" title="双击重命名" onDoubleClick={() => {
            return M(_);
          }}>
                {f === _.id ? <input className="lib-name-input" value={h} autoFocus={true} onChange={H => {
              return m(H.target.value);
            }} onBlur={U} onMouseDown={H => {
              return H.stopPropagation();
            }} onKeyDown={H => {
              if (H.key === 'Enter') {
                U();
              } else if (H.key === 'Escape') {
                p(null);
              }
            }} /> : _.name}
              </div>
              <button className={`lib-icon ${_.favorite ? 'fav' : ''}`} title={_.favorite ? '取消收藏' : '收藏'} onClick={() => {
            return r(_.id);
          }}>
                {_.favorite ? '★' : '☆'}
              </button>
              <button className="lib-icon del" title="删除" onClick={() => {
            const H = l ? l(_.id) : 0;
            if (!(H > 0) || !!window.confirm(`「${_.name}」在画布上仍有 ${H} 处引用，删除后这些节点的图片将失效。
确认删除吗？`)) {
              n(_.id);
            }
          }}>
                ✕
              </button>
            </div>;
      })}
      </div>
      {e.length > 0 && <div className="library-tip">
          拖拽素材到画布生成节点 · 长按拖入后台页面 · 列表内拖动调整顺序
        </div>}
      {x && <div className="node-ctx-menu" style={{
      left: x.x,
      top: x.y
    }} onClick={_ => {
      return _.stopPropagation();
    }}>
          <div className="ctx-menu-item" onClick={() => {
        const _ = e.find(H => {
          return H.id === x.id;
        });
        k(null);
        if (_) {
          O(_);
        }
      }}>
            替换素材
          </div>
        </div>}
    </div>;
}