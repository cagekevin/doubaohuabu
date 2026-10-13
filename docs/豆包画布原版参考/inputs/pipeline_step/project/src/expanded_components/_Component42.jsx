// TODO(全局, 无需 import): doubaoViewRef, onOpenDoubaoView, dvHidden, B, screenToFlowPosition, getNode, fitView, getZoom, getNodesBounds, r, U, ue, _, F, M, We, vt, Dt, left, Oe, St, Ze, transform, J, ke, he, Ie, De, oe, ce, q, x, b, X, Qe, ut, ct, _t, At, Ee, Ve, projectId, projectName, storagePath, knownStoragePaths, path, name, project, N, je, it, Lt, cn, Ar, Es, xt, Nt, gt, Q, re, Ct, Ke, ee, k, me, S, C, t, o, y, a, D, padding, duration, fitViewAction, nodes, maxZoom, R, He, nt, mode, sourceId, targetId, edgeId, v, O, fromType, flowPos, sourceIds, Ge, selectedIds, Ae, w, h, lt, u, source, d, type, selected, f, Z, be, ie, Ne, $e, $, p, _e, m, position, size, hasSelection, de, nodeId, nodeType, fe, Y, pe, ge, we, edges, ae, Se, $t, V, bt, A, yt, dataUrl, natW, natH, mt, $n, K, text, BS, n, Fe, Yr, Qn, pa, uo, l, c, Re, Me, G, st, dt, W, Ce, hideAttribution, xe, T, s, se, le, H, qe, ve, zt, ze, wt, Mt, et, Je, Rt, Be, kt, tt, E, P, j, ye, at, Ye, Pe, Te, rt, Ue, Le, ht, ot, ne, te, z, I
import _cmp__Component37 from './_Component37.jsx';
import _cmp_L3 from './L3.jsx';
import _cmp_Hn from './Hn.jsx';
import _cmp_DT from './DT.jsx';
import _cmp__Component40 from './_Component40.jsx';
import { L, Kr, Tu, id, Vl, pO, Rk, ql, Pu, n$, dO, fO, Bs, na, zr, uT, Na, _Component39, _Component36, NM, F3, _Component41, _Component38 } from './shared.js';
import * as g from 'react';
import * as i from 'react';
export default function _Component42({
  doubaoViewRef: e,
  onOpenDoubaoView: t,
  dvHidden: n
}) {
  const r = L(B => {
    return B.nodes;
  });
  const s = L(B => {
    return B.toast;
  });
  const o = L(B => {
    return B.edges;
  });
  const a = L(B => {
    return B.library;
  });
  const l = L(B => {
    return B.onNodesChange;
  });
  const c = L(B => {
    return B.onEdgesChange;
  });
  const u = L(B => {
    return B.addText;
  });
  const d = L(B => {
    return B.addGenVideo;
  });
  const f = L(B => {
    return B.addGenImage;
  });
  const p = L(B => {
    return B.addAccountNode;
  });
  const h = L(B => {
    return B.addDownloadNode;
  });
  const m = L(B => {
    return B.ensureMaterialNode;
  });
  const w = L(B => {
    return B.addConnection;
  });
  const v = L(B => {
    return B.removeEdge;
  });
  const y = L(B => {
    return B.snap;
  });
  const b = L(B => {
    return B.activeId;
  });
  const x = L(B => {
    return B.projects;
  });
  const k = L(B => {
    return B.renameProject;
  });
  const N = L(B => {
    return B.setProjectStoragePath;
  });
  const C = L(B => {
    return B.accounts;
  });
  const S = L(B => {
    return B.lastSentAccountId;
  });
  const E = L(B => {
    return B.backendErrors;
  });
  L(B => {
    return B.addBackendError;
  });
  const P = L(B => {
    return B.dismissBackendError;
  });
  const j = L(B => {
    return B.clearAllBackendErrors;
  });
  const I = L(B => {
    return B.presets;
  });
  const z = L(B => {
    return B.splitPresetPicker;
  });
  const {
    screenToFlowPosition: O,
    getNode: R,
    fitView: D,
    getZoom: A,
    getNodesBounds: F
  } = Kr();
  const M = Tu();
  const U = g.useMemo(() => {
    return r.filter(B => {
      return B.selected;
    });
  }, [r]);
  const _ = U.filter(B => {
    return B.type !== 'group';
  }).length;
  const H = g.useMemo(() => {
    const B = U.map(ue => {
      if (ue.parentId) {
        return ue.parentId;
      } else {
        return null;
      }
    });
    if (!B.length || !B[0]) {
      return null;
    } else if (B.every(ue => {
      return ue === B[0];
    })) {
      return B[0];
    } else {
      return null;
    }
  }, [U]);
  const J = _ >= 2 || !!H;
  const se = g.useMemo(() => {
    if (!J || U.length === 0) {
      return null;
    }
    try {
      const B = F(U);
      const ue = M.zoom;
      const Oe = (B.x + B.width / 2) * ue + M.x;
      const We = B.y * ue + M.y;
      const Ze = (B.y + B.height) * ue + M.y;
      const vt = 40;
      const Dt = 10;
      const St = We - vt - Dt >= 6;
      return {
        left: Oe,
        top: St ? We - Dt : Ze + Dt,
        transform: St ? 'translate(-50%, -100%)' : 'translate(-50%, 0)'
      };
    } catch {
      return null;
    }
  }, [J, U, M]);
  const ke = g.useRef(0);
  const V = g.useRef(0);
  const pe = g.useCallback(() => {
    ke.current = Date.now();
  }, []);
  const [ne, q] = g.useState('');
  const ce = L(B => {
    return B.splitKeywordModal;
  });
  const [oe, he] = g.useState(false);
  const Ie = g.useRef(null);
  const De = g.useRef(null);
  const le = g.useCallback(B => {
    L.getState().arrangeNodes(B);
    he(false);
  }, []);
  g.useEffect(() => {
    if (!oe) {
      return;
    }
    const B = Oe => {
      if ((!Ie.current || !Ie.current.contains(Oe.target)) && (!De.current || !De.current.contains(Oe.target))) {
        he(false);
      }
    };
    const ue = Oe => {
      if (Oe.key === 'Escape') {
        he(false);
      }
    };
    document.addEventListener('mousedown', B);
    document.addEventListener('keydown', ue);
    return () => {
      document.removeEventListener('mousedown', B);
      document.removeEventListener('keydown', ue);
    };
  }, [oe]);
  const te = g.useCallback(B => {
    const ue = L.getState();
    const Oe = ce == null ? undefined : ce.sourceNodeId;
    if (!Oe) {
      return;
    }
    if ((ue.presets || []).filter(Ze => {
      return Ze && Ze.kind === 'graph';
    }).length > 0) {
      ue.openSplitPresetPicker(Oe, B);
    } else {
      ue.splitDirect(Oe, B);
    }
    ue.closeSplitKeywordModal();
    q('');
  }, [ce]);
  const X = x.find(B => {
    return B.id === b;
  }) || null;
  const re = (X == null ? undefined : X.name) || '未命名项目';
  const Ee = (X == null ? undefined : X.storagePath) || '';
  const [je, Ve] = g.useState(false);
  const [ze, Qe] = g.useState(null);
  const [Je, ut] = g.useState(0);
  const [et, ct] = g.useState(false);
  const [wt, At] = g.useState(false);
  const _t = g.useRef(0);
  const Mt = B => {
    if (B == null) {
      return '';
    }
    const ue = Number(B);
    if (!Number.isFinite(ue) || ue < 0) {
      return '';
    }
    if (ue < 1024) {
      return `${ue} B`;
    }
    const Oe = ue / 1024;
    if (Oe < 1024) {
      return `${Oe < 10 ? Oe.toFixed(2) : Oe < 100 ? Oe.toFixed(1) : Math.round(Oe)} KB`;
    }
    const We = Oe / 1024;
    if (We < 1024) {
      return `${We < 10 ? We.toFixed(2) : We < 100 ? We.toFixed(1) : Math.round(We)} MB`;
    }
    const Ze = We / 1024;
    return `${Ze < 10 ? Ze.toFixed(2) : Ze.toFixed(1)} GB`;
  };
  g.useEffect(() => {
    var We;
    if (!Ee || (We = window.api) == null || !We.getProjectStorageSize) {
      Qe(null);
      ut(0);
      ct(false);
      return;
    }
    const B = ++_t.current;
    const ue = Ze => {
      if (Ze) {
        At(true);
      }
      window.api.getProjectStorageSize(Ee).then(vt => {
        if (B === _t.current) {
          if (vt && vt.ok) {
            Qe(vt.bytes || 0);
            ut(vt.files || 0);
            ct(!!vt.partial);
          } else {
            Qe(null);
            ut(0);
            ct(false);
          }
        }
      }).catch(() => {
        if (B === _t.current) {
          Qe(null);
          ut(0);
          ct(false);
        }
      }).finally(() => {
        if (B === _t.current) {
          At(false);
        }
      });
    };
    ue(true);
    const Oe = setInterval(() => {
      return ue(false);
    }, 30000);
    return () => {
      return clearInterval(Oe);
    };
  }, [Ee]);
  const zt = g.useCallback(async B => {
    var ue;
    var Oe;
    if ((ue = B == null ? undefined : B.stopPropagation) != null) {
      ue.call(B);
    }
    if (!!b && !je && (Oe = window.api) != null && !!Oe.pickProjectStorage) {
      Ve(true);
      try {
        L.getState().flushPersist();
        const We = L.getState().projects.find(St => {
          return St.id === b;
        });
        if (!We) {
          return;
        }
        const Ze = await window.api.pickProjectStorage({
          projectId: We.id,
          projectName: We.name,
          storagePath: We.storagePath || '',
          knownStoragePaths: L.getState().projects.map(St => {
            return {
              path: St.storagePath,
              name: St.name
            };
          }).filter(St => {
            return St.path;
          }),
          project: We
        });
        if (!Ze || Ze.canceled) {
          return;
        }
        if (!Ze.ok || !Ze.path) {
          L.getState().showToast(`保存路径设置失败：${(Ze == null ? undefined : Ze.error) || '未知错误'}`, 'error', 5000);
          return;
        }
        N(b, Ze.path);
        const vt = Ze.migrated || {};
        const Dt = vt.images || vt.videos ? `，已归档 ${vt.images || 0} 张图片、${vt.videos || 0} 个视频` : '';
        L.getState().showToast(`项目保存路径已设置${Dt}`, 'success', 4200);
      } catch (We) {
        L.getState().showToast(`保存路径设置失败：${(We == null ? undefined : We.message) || We}`, 'error', 5000);
      } finally {
        Ve(false);
      }
    }
  }, [b, je, N]);
  const Rt = g.useCallback(async B => {
    var Oe;
    var We;
    if ((Oe = B == null ? undefined : B.stopPropagation) != null) {
      Oe.call(B);
    }
    if (!Ee || (We = window.api) == null || !We.revealProjectStorage) {
      return;
    }
    const ue = await window.api.revealProjectStorage(Ee);
    if (ue && ue.ok === false) {
      L.getState().showToast(`无法打开项目目录：${ue.error || '路径不可用'}`, 'error', 4200);
    }
  }, [Ee]);
  const [Be, it] = g.useState(null);
  g.useEffect(() => {
    let B = true;
    const ue = () => {
      var We;
      if ((We = window.api) == null) {
        return undefined;
      } else {
        return We.getLicenseStatus().then(Ze => {
          if (B) {
            it(Ze && Ze.ok && Ze.status === 'ok' ? Ze : null);
          }
        }).catch(() => {
          return B && it(null);
        });
      }
    };
    ue();
    const Oe = setInterval(ue, 60000);
    return () => {
      B = false;
      clearInterval(Oe);
    };
  }, []);
  const kt = B => {
    if (!B || B >= 253402271999000) {
      return '永久授权';
    }
    const ue = Date.now();
    const Oe = B - ue;
    if (Oe <= 0) {
      return '已过期';
    }
    const We = Math.floor(Oe / 86400000);
    const Ze = Math.floor(Oe % 86400000 / 3600000);
    if (We > 365) {
      return '永久授权';
    }
    if (We > 0) {
      return `剩余 ${We} 天 ${Ze} 时`;
    }
    const vt = Math.floor(Oe % 3600000 / 60000);
    if (Ze > 0) {
      return `剩余 ${Ze} 时 ${vt} 分`;
    } else {
      return `剩余 ${vt} 分`;
    }
  };
  const xt = L(B => {
    return B.soundEnabled;
  });
  const Nt = g.useRef(0);
  const gt = g.useCallback(() => {
    try {
      const B = new (window.AudioContext || window.webkitAudioContext)();
      const ue = B.currentTime;
      const Oe = [523.25, 659.25, 783.99];
      const We = 0.1;
      Oe.forEach((St, cn) => {
        const Lt = B.createOscillator();
        const Ar = B.createGain();
        Lt.type = 'sine';
        Lt.frequency.value = St;
        const Es = ue + cn * We;
        Ar.gain.setValueAtTime(0.0001, Es);
        Ar.gain.exponentialRampToValueAtTime(0.25, Es + 0.015);
        Ar.gain.exponentialRampToValueAtTime(0.001, Es + 0.42);
        Lt.connect(Ar).connect(B.destination);
        Lt.start(Es);
        Lt.stop(Es + 0.45);
      });
      const Ze = B.createOscillator();
      const vt = B.createGain();
      Ze.type = 'sine';
      Ze.frequency.value = 1046.5;
      const Dt = ue + Oe.length * We;
      vt.gain.setValueAtTime(0.0001, Dt);
      vt.gain.exponentialRampToValueAtTime(0.18, Dt + 0.01);
      vt.gain.exponentialRampToValueAtTime(0.001, Dt + 0.5);
      Ze.connect(vt).connect(B.destination);
      Ze.start(Dt);
      Ze.stop(Dt + 0.55);
      setTimeout(() => {
        try {
          B.close();
        } catch {}
      }, 1500);
    } catch {}
  }, []);
  g.useEffect(() => {
    const B = r.filter(ue => {
      return ue.type === 'video';
    }).length;
    if (xt && B > Nt.current) {
      gt();
    }
    Nt.current = B;
  }, [r, xt, gt]);
  const [Ke, Ct] = g.useState(false);
  const [ee, Q] = g.useState('');
  const me = g.useRef(null);
  const ve = () => {
    Q(re);
    Ct(true);
  };
  const qe = g.useCallback(() => {
    if (Ke && ee.trim()) {
      k(b, ee.trim());
    }
    Ct(false);
  }, [Ke, ee, k, b]);
  g.useEffect(() => {
    if (Ke && me.current) {
      me.current.focus();
      me.current.select();
    }
  }, [Ke]);
  const tt = () => {
    var ue;
    if (!L.getState().activeDoubaoAccountId) {
      const Oe = S && C.find(We => {
        return We.id === S;
      }) ? S : ((ue = C.find(We => {
        return (We.status || '已登录') === '已登录';
      })) == null ? undefined : ue.id) || null;
      if (Oe) {
        L.getState().setActiveDoubaoAccount(Oe);
      }
    }
    t();
  };
  const [Ae, nt] = g.useState(null);
  const [_e, Z] = g.useState(null);
  const [T, K] = g.useState(false);
  const [Y, de] = g.useState(null);
  const [ae, we] = g.useState(null);
  const [Se, ge] = g.useState('');
  const Le = L(B => {
    return B.imageEditor;
  });
  const Ge = g.useRef(null);
  const He = g.useRef(null);
  g.useEffect(() => {
    L.getState().schedulePersist();
  }, [r, o, y, b, a]);
  g.useEffect(() => {
    const B = () => {
      return L.getState().flushPersist();
    };
    window.addEventListener('beforeunload', B);
    return () => {
      return window.removeEventListener('beforeunload', B);
    };
  }, []);
  g.useEffect(() => {
    if (!b) {
      return;
    }
    const B = setTimeout(() => {
      try {
        D({
          padding: 0.25,
          duration: 250
        });
      } catch {}
    }, 150);
    return () => {
      return clearTimeout(B);
    };
  }, [b, D]);
  g.useEffect(() => {
    L.setState({
      fitViewAction: B => {
        if (!!B && B.length !== 0) {
          setTimeout(() => {
            try {
              D({
                nodes: B.map(ue => {
                  return {
                    id: ue
                  };
                }),
                padding: 0.2,
                duration: 400,
                maxZoom: 1
              });
            } catch {}
          }, 80);
        }
      }
    });
    return () => {
      return L.setState({
        fitViewAction: null
      });
    };
  }, [D]);
  const lt = (B, ue, Oe) => {
    const We = R(B);
    const Ze = R(ue);
    if (!We || !Ze) {
      return {
        x: 0,
        y: 0
      };
    }
    const vt = We.position.x + (We.width || 200) / 2;
    const Dt = We.position.y + (We.height || 180) / 2;
    const St = Ze.position.x + (Ze.width || 200) / 2;
    const cn = Ze.position.y + (Ze.height || 180) / 2;
    return {
      x: (vt + St) / 2 - Oe.w / 2,
      y: (Dt + cn) / 2 - Oe.h / 2
    };
  };
  const st = g.useCallback((B, ue) => {
    if (He.current) {
      clearTimeout(He.current);
    }
    He.current = setTimeout(() => {
      nt({
        x: B.clientX,
        y: B.clientY,
        mode: 'edge',
        sourceId: ue.source,
        targetId: ue.target,
        edgeId: ue.id
      });
    }, 220);
  }, []);
  const dt = g.useCallback((B, ue) => {
    if (He.current) {
      clearTimeout(He.current);
      He.current = null;
    }
    nt(null);
    v(ue.id);
  }, [v]);
  const G = g.useCallback((B, ue) => {
    var St;
    if (ue.isValid) {
      return;
    }
    const Oe = ue.fromNode;
    const We = ((St = ue.fromHandle) == null ? undefined : St.type) || 'source';
    if (!Oe) {
      return;
    }
    const Ze = B.clientX;
    const vt = B.clientY;
    const Dt = O({
      x: Ze,
      y: vt
    });
    nt({
      x: Ze,
      y: vt,
      sourceId: Oe.id,
      fromType: We,
      flowPos: Dt
    });
  }, [O]);
  const xe = g.useCallback((B, ue) => {
    const Oe = O({
      x: ue.x,
      y: ue.y
    });
    nt({
      x: ue.x,
      y: ue.y,
      flowPos: Oe,
      mode: 'group',
      sourceIds: B
    });
  }, [O]);
  const Me = g.useCallback((B, ue) => {
    const Oe = L.getState().nodes.filter(We => {
      return We.selected;
    }).map(We => {
      return We.id;
    });
    Ge.current = {
      sourceId: ue.nodeId,
      selectedIds: Oe
    };
  }, []);
  const Re = g.useCallback(B => {
    if (!B || !B.source || !B.target || B.source === B.target) {
      return;
    }
    const ue = Ge.current;
    const Oe = L.getState().nodes;
    if (ue && ue.selectedIds.length > 1) {
      const We = B.target && B.target !== B.source ? B.target : B.source;
      const Ze = ue.selectedIds.filter(vt => {
        const Dt = Oe.find(St => {
          return St.id === vt;
        });
        return Dt && Dt.type === 'material' && vt !== We;
      });
      if (Ze.length > 1 && We) {
        L.getState().connectBatch(Ze, We);
        Ge.current = null;
        return;
      }
    }
    L.getState().onConnect(B);
    Ge.current = null;
  }, []);
  const $ = () => {
    if (!Ae) {
      return null;
    }
    let B = null;
    if (Ae.mode === 'edge') {
      const ue = {
        w: 280,
        h: 150
      };
      const Oe = lt(Ae.sourceId, Ae.targetId, ue);
      B = u(Oe);
      v(Ae.edgeId);
      w({
        source: Ae.sourceId,
        target: B
      });
      w({
        source: B,
        target: Ae.targetId
      });
    } else if (Ae.sourceIds && Ae.sourceIds.length > 0) {
      const ue = {
        w: 280,
        h: 150
      };
      const Oe = {
        x: Ae.flowPos.x - ue.w / 2,
        y: Ae.flowPos.y - ue.h / 2
      };
      B = u(Oe);
      L.getState().connectManyToTarget(Ae.sourceIds, B);
    } else {
      const ue = {
        w: 280,
        h: 150
      };
      const Oe = {
        x: Ae.flowPos.x - ue.w / 2,
        y: Ae.flowPos.y - ue.h / 2
      };
      B = u(Oe);
      const We = Ae.fromType === 'source' ? {
        source: Ae.sourceId,
        target: B
      } : {
        source: B,
        target: Ae.sourceId
      };
      w(We);
    }
    nt(null);
    return B;
  };
  const ie = () => {
    if (!Ae) {
      return null;
    }
    let B = null;
    if (Ae.mode === 'edge') {
      const ue = {
        w: 380,
        h: 240
      };
      const Oe = lt(Ae.sourceId, Ae.targetId, ue);
      B = d(Oe);
      v(Ae.edgeId);
      w({
        source: Ae.sourceId,
        target: B
      });
      w({
        source: B,
        target: Ae.targetId
      });
    } else if (Ae.sourceIds && Ae.sourceIds.length > 0) {
      const ue = {
        w: 380,
        h: 240
      };
      const Oe = {
        x: Ae.flowPos.x - ue.w / 2,
        y: Ae.flowPos.y - ue.h / 2
      };
      B = d(Oe);
      L.getState().connectManyToTarget(Ae.sourceIds, B);
    } else {
      const ue = {
        w: 380,
        h: 240
      };
      const Oe = {
        x: Ae.flowPos.x - ue.w / 2,
        y: Ae.flowPos.y - ue.h / 2
      };
      B = d(Oe);
      const We = Ae.fromType === 'source' ? {
        source: Ae.sourceId,
        target: B
      } : {
        source: B,
        target: Ae.sourceId
      };
      w(We);
    }
    nt(null);
    if (B) {
      const ue = L.getState();
      ue.onNodesChange(ue.nodes.map(Oe => {
        return {
          type: 'select',
          id: Oe.id,
          selected: Oe.id === B
        };
      }));
      L.getState().openGeneratePanel(B);
    }
    return B;
  };
  const be = () => {
    if (!Ae) {
      return null;
    }
    let B = null;
    const ue = {
      w: 380,
      h: 300
    };
    if (Ae.mode === 'edge') {
      const Oe = lt(Ae.sourceId, Ae.targetId, ue);
      B = f(Oe);
      v(Ae.edgeId);
      w({
        source: Ae.sourceId,
        target: B
      });
      w({
        source: B,
        target: Ae.targetId
      });
    } else if (Ae.sourceIds && Ae.sourceIds.length > 0) {
      const Oe = {
        x: Ae.flowPos.x - ue.w / 2,
        y: Ae.flowPos.y - ue.h / 2
      };
      B = f(Oe);
      L.getState().connectManyToTarget(Ae.sourceIds, B);
    } else {
      const Oe = {
        x: Ae.flowPos.x - ue.w / 2,
        y: Ae.flowPos.y - ue.h / 2
      };
      B = f(Oe);
      const We = Ae.fromType === 'source' ? {
        source: Ae.sourceId,
        target: B
      } : {
        source: B,
        target: Ae.sourceId
      };
      w(We);
    }
    nt(null);
    if (B) {
      const Oe = L.getState();
      Oe.onNodesChange(Oe.nodes.map(We => {
        return {
          type: 'select',
          id: We.id,
          selected: We.id === B
        };
      }));
      Oe.openImageGenPanel(B);
    }
    return B;
  };
  const ye = B => {
    if (Ae) {
      if (B === 'material') {
        Z({
          ...Ae
        });
        nt(null);
        return;
      }
      if (B === 'image') {
        be();
        return;
      }
      if (B === 'video') {
        ie();
        return;
      }
      if (B === 'account') {
        Ne();
        return;
      }
      if (B === 'download') {
        $e();
        return;
      }
      $();
    }
  };
  const Ne = () => {
    if (Ae) {
      if (Ae.mode === 'edge') {
        const B = {
          w: 420,
          h: 220
        };
        const ue = lt(Ae.sourceId, Ae.targetId, B);
        const Oe = p(ue);
        v(Ae.edgeId);
        w({
          source: Ae.sourceId,
          target: Oe
        });
        w({
          source: Oe,
          target: Ae.targetId
        });
      } else if (Ae.sourceIds && Ae.sourceIds.length > 0) {
        const B = {
          w: 420,
          h: 220
        };
        const ue = {
          x: Ae.flowPos.x - B.w / 2,
          y: Ae.flowPos.y - B.h / 2
        };
        const Oe = p(ue);
        L.getState().connectManyToTarget(Ae.sourceIds, Oe);
      } else {
        const B = {
          w: 420,
          h: 220
        };
        const ue = {
          x: Ae.flowPos.x - B.w / 2,
          y: Ae.flowPos.y - B.h / 2
        };
        const Oe = p(ue);
        const We = Ae.fromType === 'source' ? {
          source: Ae.sourceId,
          target: Oe
        } : {
          source: Oe,
          target: Ae.sourceId
        };
        w(We);
      }
      nt(null);
    }
  };
  const $e = () => {
    if (Ae) {
      if (Ae.mode === 'edge') {
        const B = {
          w: 280,
          h: 200
        };
        const ue = lt(Ae.sourceId, Ae.targetId, B);
        const Oe = h(ue);
        v(Ae.edgeId);
        w({
          source: Ae.sourceId,
          target: Oe
        });
        w({
          source: Oe,
          target: Ae.targetId
        });
      } else if (Ae.sourceIds && Ae.sourceIds.length > 0) {
        const B = {
          w: 280,
          h: 200
        };
        const ue = {
          x: Ae.flowPos.x - B.w / 2,
          y: Ae.flowPos.y - B.h / 2
        };
        const Oe = h(ue);
        L.getState().connectManyToTarget(Ae.sourceIds, Oe);
      } else {
        const B = {
          w: 280,
          h: 200
        };
        const ue = {
          x: Ae.flowPos.x - B.w / 2,
          y: Ae.flowPos.y - B.h / 2
        };
        const Oe = h(ue);
        const We = Ae.fromType === 'source' ? {
          source: Ae.sourceId,
          target: Oe
        } : {
          source: Oe,
          target: Ae.sourceId
        };
        w(We);
      }
      nt(null);
    }
  };
  const at = B => {
    const ue = _e;
    if (!ue) {
      return;
    }
    if (ue.mode === 'replace' && ue.nodeId) {
      L.getState().replaceMaterialWithLib(ue.nodeId, B);
      Z(null);
      return;
    }
    const Oe = Vl(B.w || 200, B.h || 160);
    let We;
    if (ue.mode === 'edge') {
      We = lt(ue.sourceId, ue.targetId, Oe);
    } else {
      We = {
        x: ue.flowPos.x - Oe.w / 2,
        y: ue.flowPos.y - Oe.h / 2
      };
    }
    const Ze = m(B.id, {
      position: We,
      size: Oe
    });
    const vt = Ze.id;
    if (!vt) {
      Z(null);
      return;
    }
    if (Ze.reused) {
      L.getState().showToast(`「${B.name}」已在画布上，已复用并移到落点`, 'info', 2800);
    }
    if (ue.mode === 'edge') {
      v(ue.edgeId);
      w({
        source: ue.sourceId,
        target: vt
      });
      w({
        source: vt,
        target: ue.targetId
      });
    } else if (ue.sourceIds && ue.sourceIds.length > 0) {
      L.getState().connectManyToTarget(ue.sourceIds, vt);
    } else {
      const Dt = ue.fromType === 'source' ? {
        source: ue.sourceId,
        target: vt
      } : {
        source: vt,
        target: ue.sourceId
      };
      w(Dt);
    }
    Z(null);
  };
  const Fe = g.useCallback(B => {
    if (!B.target.classList || !B.target.classList.contains('react-flow__pane')) {
      return;
    }
    const ue = O({
      x: B.clientX,
      y: B.clientY
    });
    u(ue);
  }, [O, u]);
  const W = g.useCallback(B => {
    B.preventDefault();
    if (B.target.closest && B.target.closest('.react-flow__node')) {
      return;
    }
    const Oe = L.getState().nodes.some(Ze => {
      return Ze.selected;
    });
    const We = O({
      x: B.clientX,
      y: B.clientY
    });
    nt({
      x: B.clientX,
      y: B.clientY,
      flowPos: We,
      mode: 'context',
      hasSelection: Oe
    });
  }, [O]);
  const Ce = g.useCallback((B, ue) => {
    B.preventDefault();
    B.stopPropagation();
    const Oe = L.getState();
    if (!ue.selected) {
      if (Oe.nodes.filter(Ze => {
        return Ze.selected;
      }).length < 2) {
        Oe.onNodesChange(Oe.nodes.map(Ze => {
          return {
            type: 'select',
            id: Ze.id,
            selected: Ze.id === ue.id
          };
        }));
      }
    }
    de({
      x: B.clientX,
      y: B.clientY,
      nodeId: ue.id,
      nodeType: ue.type
    });
  }, []);
  const fe = g.useCallback(() => {
    de(null);
  }, []);
  g.useEffect(() => {
    if (!Y) {
      return;
    }
    const B = () => {
      return fe();
    };
    const ue = Oe => {
      if (Oe.key === 'Escape') {
        fe();
      }
    };
    document.addEventListener('click', B);
    document.addEventListener('keydown', ue);
    return () => {
      document.removeEventListener('click', B);
      document.removeEventListener('keydown', ue);
    };
  }, [Y, fe]);
  const Te = g.useCallback(() => {
    pe();
    L.getState().copyNodes();
    fe();
  }, [fe, pe]);
  const Ue = g.useCallback(() => {
    const B = L.getState();
    if (!B.clipboard) {
      fe();
      return;
    }
    const ue = O({
      x: Y.x,
      y: Y.y
    });
    B.pasteNodes(ue);
    fe();
  }, [fe, O, Y]);
  const Ye = g.useCallback(() => {
    if (!Y) {
      fe();
      return;
    }
    Z({
      mode: 'replace',
      nodeId: Y.nodeId
    });
    fe();
  }, [fe, Y]);
  const Pe = g.useCallback(async () => {
    if (!Y) {
      fe();
      return;
    }
    const B = L.getState().nodes.find(Oe => {
      return Oe.id === Y.nodeId;
    });
    const ue = B && B.data && B.data.dataUrl;
    fe();
    if (!!ue && !!/^img:\/\//i.test(ue) && !!window.api && typeof window.api.showInFolder == 'function') {
      try {
        await window.api.showInFolder(ue);
      } catch {}
    }
  }, [fe, Y]);
  const rt = g.useCallback(() => {
    const B = L.getState();
    const ue = B.nodes.filter(We => {
      return We.selected;
    });
    if (ue.length === 0) {
      fe();
      return;
    }
    let Oe = [];
    if (ue.length > 1) {
      const We = new Set(ue.map(Ze => {
        return Ze.id;
      }));
      Oe = B.edges.filter(Ze => {
        return We.has(Ze.source) && We.has(Ze.target);
      });
    }
    ge('');
    we({
      nodes: structuredClone(ue),
      edges: structuredClone(Oe)
    });
    fe();
  }, [fe]);
  const ot = g.useCallback(() => {
    if (ae) {
      L.getState().addNodePreset({
        name: Se,
        nodes: ae.nodes,
        edges: ae.edges
      });
      we(null);
      ge('');
    }
  }, [ae, Se]);
  const ht = g.useCallback(() => {
    we(null);
    ge('');
  }, []);
  const bt = g.useRef(null);
  const $t = g.useRef({
    x: 0,
    y: 0
  });
  g.useEffect(() => {
    const B = ue => {
      $t.current = {
        x: ue.clientX,
        y: ue.clientY
      };
    };
    window.addEventListener('mousemove', B);
    return () => {
      return window.removeEventListener('mousemove', B);
    };
  }, []);
  g.useEffect(() => {
    const B = () => {
      V.current = Date.now();
    };
    window.addEventListener('blur', B);
    const ue = window.api && typeof window.api.onClipboardImageChanged == 'function' ? window.api.onClipboardImageChanged(B) : null;
    return () => {
      window.removeEventListener('blur', B);
      if (ue) {
        ue();
      }
    };
  }, []);
  const mt = g.useCallback(() => {
    const B = bt.current;
    const ue = B ? B.getBoundingClientRect() : null;
    const Oe = ue ? {
      x: ue.left + ue.width / 2,
      y: ue.top + ue.height / 2
    } : null;
    const {
      x: We,
      y: Ze
    } = $t.current;
    if (!!ue && ue.width > 0 && !!We && !!Ze && We >= ue.left && We <= ue.right && Ze >= ue.top && Ze <= ue.bottom) {
      return O({
        x: We,
        y: Ze
      });
    } else if (Oe) {
      return O(Oe);
    } else {
      return {
        x: 0,
        y: 0
      };
    }
  }, [O]);
  const yt = g.useCallback((B, ue) => {
    if (!B.length) {
      return;
    }
    const Oe = {
      x: ue.x - B[0].size.w / 2,
      y: ue.y - B[0].size.h / 2
    };
    L.getState().addMaterialFromDrop(B, Oe, {
      x: 24,
      y: 24
    });
  }, []);
  const $n = g.useCallback(async B => {
    if (!window.api || typeof window.api.readClipboardImage != 'function') {
      return false;
    }
    let ue = null;
    try {
      ue = await window.api.readClipboardImage();
    } catch {
      return false;
    }
    if (!ue || !ue.ok || !ue.dataUrl) {
      return false;
    }
    const Oe = ue.w || 200;
    const We = ue.h || 160;
    const Ze = pO(Oe, We, bt.current, A());
    const vt = new Date();
    const Dt = String(vt.getHours()).padStart(2, '0');
    const St = String(vt.getMinutes()).padStart(2, '0');
    const cn = String(vt.getSeconds()).padStart(2, '0');
    const Lt = ue.name && String(ue.name).replace(/\.[^.]+$/, '').slice(0, 40) || `粘贴图片 ${Dt}:${St}:${cn}`;
    yt([{
      name: Lt,
      dataUrl: ue.dataUrl,
      natW: Oe,
      natH: We,
      size: Ze
    }], B);
    return true;
  }, [yt, A]);
  g.useEffect(() => {
    const B = ue => {
      const Oe = ue.target;
      if (Oe && (Oe.isContentEditable || Oe.tagName === 'INPUT' || Oe.tagName === 'TEXTAREA')) {
        return;
      }
      const Ze = ue.key.toLowerCase();
      if (Ze === 's' && !ue.metaKey && !ue.ctrlKey && !ue.altKey) {
        const Dt = L.getState().nodes.filter(St => {
          return St.selected && St.type === 'video';
        }).map(St => {
          return St.id;
        });
        if (Dt.length) {
          ue.preventDefault();
          Dt.forEach(St => {
            return Rk(St).catch(() => {});
          });
        }
        return;
      }
      if (ue.metaKey || ue.ctrlKey) {
        if (Ze === 'c') {
          ue.preventDefault();
          ue.stopPropagation();
          pe();
          L.getState().copyNodes();
          return;
        }
        if (Ze === 'v') {
          ue.preventDefault();
          ue.stopPropagation();
          const vt = mt();
          if (!!L.getState().clipboard && V.current < ke.current) {
            L.getState().pasteNodes(vt);
            return;
          }
          $n(vt).then(St => {
            if (!St && L.getState().clipboard) {
              L.getState().pasteNodes(vt);
            }
          });
          return;
        }
      }
    };
    window.addEventListener('keydown', B);
    return () => {
      return window.removeEventListener('keydown', B);
    };
  }, [O, pe, mt, $n]);
  const Yr = g.useCallback(B => {
    B.preventDefault();
    B.dataTransfer.dropEffect = 'copy';
    K(true);
  }, []);
  const Qn = g.useCallback(B => {
    if (B.currentTarget === B.target) {
      K(false);
    }
  }, []);
  const pa = g.useCallback(async B => {
    B.preventDefault();
    K(false);
    const ue = B.dataTransfer.getData(ql);
    if (ue) {
      const St = L.getState().library.find(cn => {
        return cn.id === ue;
      });
      if (St) {
        const cn = O({
          x: B.clientX,
          y: B.clientY
        });
        const Lt = Vl(St.w, St.h);
        if (m(ue, {
          position: cn,
          size: Lt
        }).reused) {
          L.getState().showToast(`「${St.name}」已在画布上，已移到落点（同一素材不重复创建）`, 'info', 2800);
        }
        return;
      }
    }
    const Oe = Array.from(B.dataTransfer.files || []);
    const We = Oe.filter(St => {
      return (St.type || '').startsWith('image/');
    });
    const Ze = Oe.filter(St => {
      return (St.type || '') === 'text/markdown' || /\.(md|markdown)$/i.test(St.name || '');
    });
    if (!We.length && !Ze.length) {
      return;
    }
    const vt = O({
      x: B.clientX,
      y: B.clientY
    });
    const Dt = {
      x: 24,
      y: 24
    };
    if (We.length) {
      const cn = (await Promise.all(We.map(Lt => {
        return Pu(Lt);
      }))).filter(Lt => {
        return Lt && Lt.dataUrl;
      }).map(Lt => {
        return {
          name: Lt.name,
          dataUrl: Lt.dataUrl,
          natW: Lt.natW,
          natH: Lt.natH,
          size: Vl(Lt.natW, Lt.natH)
        };
      });
      if (cn.length) {
        const Lt = {
          x: vt.x - cn[0].size.w / 2,
          y: vt.y - cn[0].size.h / 2
        };
        L.getState().addMaterialFromDrop(cn, Lt, Dt);
      }
    }
    if (Ze.length) {
      const St = await Promise.all(Ze.map(async Lt => {
        return {
          name: (Lt.name || '').replace(/\.[^.]+$/, ''),
          text: await n$(Lt)
        };
      }));
      const cn = {
        x: vt.x - 140,
        y: vt.y - 75
      };
      St.forEach((Lt, Ar) => {
        const Es = {
          x: cn.x + Ar * Dt.x,
          y: cn.y + Ar * Dt.y
        };
        const BS = u(Es, Lt.name || 'Markdown');
        L.getState().updateNodeData(BS, {
          text: Lt.text
        });
      });
    }
  }, [O, m, u]);
  const uo = g.useCallback(B => {
    if (B.target.closest && B.target.closest('.react-flow__node') || B.target.closest && (B.target.closest('.node-ctx-menu') || B.target.closest('.create-panel'))) {
      return;
    }
    B.preventDefault();
    const Oe = L.getState().nodes.some(Ze => {
      return Ze.selected;
    });
    const We = O({
      x: B.clientX,
      y: B.clientY
    });
    nt({
      x: B.clientX,
      y: B.clientY,
      flowPos: We,
      mode: 'context',
      hasSelection: Oe
    });
  }, [O]);
  return <div ref={bt} className={`canvas-wrap${n ? ' canvas-hidden' : ''}`} onDoubleClick={Fe} onDragOver={Yr} onDragLeave={Qn} onDrop={pa} onContextMenu={uo}>
      <_Component39 nodes={r} edges={o} onNodesChange={l} onEdgesChange={c} onConnect={Re} onConnectStart={Me} onConnectEnd={G} onEdgeClick={st} onEdgeDoubleClick={dt} onPaneContextMenu={W} onNodeContextMenu={Ce} nodeTypes={dO} edgeTypes={fO} defaultEdgeType="interactive" colorMode="light" minZoom={0.1} maxZoom={4} snapToGrid={y} snapGrid={[Bs, Bs]} selectionOnDrag={false} panOnDrag={true} selectionMode={na.Partial} zoomOnDoubleClick={false} connectionRadius={60} deleteKeyCode={['Backspace', 'Delete']} multiSelectionKeyCode={['Shift', 'Meta']} onlyRenderVisibleElements={true} fitView={true} fitViewOptions={{
      padding: 0.25,
      duration: 250
    }} proOptions={{
      hideAttribution: false
    }}>
        <_Component36 variant={zr.Lines} gap={Bs} size={1} color={`rgba(226, 230, 236, ${uT})`} />
        <NM showInteractive={false} />
        <OM pannable={true} zoomable={true} nodeColor={B => {
        if (B.type === 'material') {
          return '#a5b4fc';
        } else {
          if (B.type === 'account') {
            return '#34d399';
          } else {
            return '#fcd34d';
          }
        }
      }} nodeStrokeColor="#94a3b8" maskColor="rgba(148,163,184,0.15)" />
        <_cmp__Component37 onGroupConnectEnd={xe} />
        <_Component38 />
      </_Component39>
      {T && <div className="drop-hint">松开鼠标，将图片 / Markdown 文件添加到画布</div>}
      {r.length === 0 && !Ae && !_e && <div className="canvas-empty-hint">
          <div className="canvas-empty-icon">✦</div>
          <div className="canvas-empty-title">画布为空</div>
          <div className="canvas-empty-desc">双击画布创建文本框，或从右侧资源库拖入素材</div>
        </div>}
      <_cmp_L3 />
      <F3 />
      {s ? <div className={`app-toast app-toast-${s.type || 'info'}${s.action ? ' has-action' : ''}`} onClick={() => {
      return L.getState().clearToast();
    }}>
          <span className="app-toast-msg">{s.msg}</span>
          {s.action && s.action.label ? <button type="button" className="app-toast-action" onClick={B => {
        B.stopPropagation();
        try {
          if (s.action.onClick) {
            s.action.onClick();
          }
        } catch {}
        L.getState().clearToast();
      }}>
              {s.action.label}
            </button> : null}
        </div> : null}
      {J && se && <div className="canvas-sel-toolbar nodrag nopan" style={se}>
          <span className="sel-toolbar-count">已选 {U.length}</span>
          <button type="button" className="sel-toolbar-btn is-primary" disabled={_ < 2} title={_ < 2 ? '至少选中 2 个非组节点才能打组' : '把所选节点归入一个组（类文件夹）'} onClick={() => {
        return L.getState().groupSelectedNodes();
      }}>
            <_cmp_Hn name="group" /> 打组
          </button>
          <div className="sel-arrange-wrap">
            <button ref={Ie} type="button" className="sel-toolbar-btn" disabled={_ < 2} title={_ < 2 ? '至少选中 2 个非组节点才能整齐排列' : '整齐排列所选节点：对齐 / 等间距 / 智能网格'} onClick={B => {
          B.stopPropagation();
          he(ue => {
            return !ue;
          });
        }}>
              <_cmp_Hn name="grid" /> 整齐排列
            </button>
            {oe && _ >= 2 && <div className="sel-arrange-menu nodrag nopan" ref={De} role="menu">
                <button className="sel-arrange-item is-primary" role="menuitem" onClick={() => {
            return le('smart');
          }}>
                  <_cmp_Hn name="smart" /> 智能整齐排列（网格）
                </button>
                <div className="sel-arrange-sep" />
                <div className="sel-arrange-head">水平</div>
                <button className="sel-arrange-item" role="menuitem" onClick={() => {
            return le('left');
          }}>
                  <_cmp_Hn name="left" /> 左对齐
                </button>
                <button className="sel-arrange-item" role="menuitem" onClick={() => {
            return le('hcenter');
          }}>
                  <_cmp_Hn name="hcenter" /> 水平居中
                </button>
                <button className="sel-arrange-item" role="menuitem" onClick={() => {
            return le('right');
          }}>
                  <_cmp_Hn name="right" /> 右对齐
                </button>
                <button className="sel-arrange-item" role="menuitem" onClick={() => {
            return le('hdist');
          }}>
                  <_cmp_Hn name="hdist" /> 水平等间距
                </button>
                <div className="sel-arrange-head">垂直</div>
                <button className="sel-arrange-item" role="menuitem" onClick={() => {
            return le('top');
          }}>
                  <_cmp_Hn name="top" /> 顶对齐
                </button>
                <button className="sel-arrange-item" role="menuitem" onClick={() => {
            return le('vcenter');
          }}>
                  <_cmp_Hn name="vcenter" /> 垂直居中
                </button>
                <button className="sel-arrange-item" role="menuitem" onClick={() => {
            return le('bottom');
          }}>
                  <_cmp_Hn name="bottom" /> 底对齐
                </button>
                <button className="sel-arrange-item" role="menuitem" onClick={() => {
            return le('vdist');
          }}>
                  <_cmp_Hn name="vdist" /> 垂直等间距
                </button>
              </div>}
          </div>
          {H && <button type="button" className="sel-toolbar-btn" title="取消组：释放组内节点，仅删除组容器" onClick={() => {
        return L.getState().ungroupNodes(H);
      }}>
              <_cmp_Hn name="ungroup" /> 取消组
            </button>}
        </div>}
      <div className="canvas-topbar">
        <div className="topbar-project-name">
          {Ke ? <input ref={me} className="topbar-project-input" value={ee} onChange={B => {
          return Q(B.target.value);
        }} onBlur={qe} onKeyDown={B => {
          if (B.key === 'Enter') {
            qe();
          } else if (B.key === 'Escape') {
            Ct(false);
          }
        }} onMouseDown={B => {
          return B.stopPropagation();
        }} /> : <span className="topbar-project-label" title="双击重命名项目" onDoubleClick={B => {
          B.stopPropagation();
          ve();
        }}>
              {re}
            </span>}
        </div>
        <div className={`topbar-project-storage${Ee ? ' configured' : ''}`}>
          <button type="button" className="topbar-storage-main" onClick={zt} disabled={je} title={(() => {
          if (!Ee) {
            return '设置当前项目保存路径；工程、数据、操作记录、缓存、图片和视频会分类保存';
          }
          const B = ze == null ? wt ? '占用空间：统计中…' : '占用空间：—' : `占用空间：${Mt(ze)}${et ? '（仍在统计）' : ''}（${Je} 个文件）`;
          return `当前项目保存路径：${Ee}
${B}
点击可更改；工程、数据、操作记录、缓存、图片和视频会分类保存`;
        })()}>
            <svg className="topbar-storage-icon" viewBox="0 0 20 20" aria-hidden="true">
              <path d="M2.8 5.2c0-.9.7-1.6 1.6-1.6h4l1.6 1.8h5.6c.9 0 1.6.7 1.6 1.6v7.6c0 .9-.7 1.6-1.6 1.6H4.4c-.9 0-1.6-.7-1.6-1.6V5.2Z" />
            </svg>
            <span className="topbar-storage-label">
              {je ? '正在选择…' : Ee ? ze == null ? wt ? '统计占用…' : '占用 —' : `${Mt(ze)}${et ? '…' : ''}` : '设置保存路径'}
            </span>
          </button>
          {Ee && <button type="button" className="topbar-storage-reveal" onClick={Rt} title="打开项目保存目录" aria-label="打开项目保存目录">
              ↗
            </button>}
        </div>
        {Be && <span className={`topbar-license${Be.expireAt && Be.expireAt - Date.now() < 604800000 ? ' expiring' : ''}`}>
            {Be.expireAt ? kt(Be.expireAt) : '已激活'}
          </span>}
        <button className="topbar-toggle" onClick={tt} title="查看账号节点发送后的豆包对话">
          <span className="topbar-icon">▦</span>豆包后台
        </button>
      </div>
      {E && E.length > 0 && <div className="error-banner-container">
          {E.map(B => {
        return <div className={`error-banner error-${B.type || 'other'}`} key={B.id}>
                <div className="error-banner-icon">
                  {B.type === 'copyright' ? '⚠️' : B.type === 'quota' ? '💰' : B.type === 'generation_failed' ? '❌' : B.type === 'network' ? '🌐' : B.type === 'auth' ? '🔑' : '⚡'}
                </div>
                <div className="error-banner-body">
                  <div className="error-banner-type">
                    {B.type === 'copyright' ? '版权限制' : B.type === 'quota' ? '额度不足' : B.type === 'generation_failed' ? '生成失败' : B.type === 'network' ? '网络异常' : B.type === 'auth' ? '认证问题' : '后台异常'}
                    {B.accountName && <span className="error-banner-account"> · {B.accountName}</span>}
                  </div>
                  <div className="error-banner-msg">{B.message}</div>
                </div>
                <button className="error-banner-close" onClick={() => {
            return P(B.id);
          }} title="关闭此提示">
                  ✕
                </button>
              </div>;
      })}
          {E.length > 1 && <button className="error-banner-clearall" onClick={j}>
              全部清除
            </button>}
        </div>}
      {Ae && <i.Fragment>
          <div className="panel-backdrop" onMouseDown={() => {
        return nt(null);
      }} />
          <div className="create-panel" style={{
        left: Ae.x,
        top: Ae.y
      }}>
            <div className="create-panel-title">
              {Ae.sourceIds && Ae.sourceIds.length > 1 ? '引用所选节点生成' : '引用该节点生成'}
            </div>
            <button className="create-option" onClick={() => {
          return ye('image');
        }} title="文生图：先在画布建一张卡片，点卡片填提示词与参数，出图直接展示在卡片上">
              <span className="co-ico" aria-hidden="true">
                <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2.5" y="3.5" width="15" height="13" rx="2.5" />
                  <circle cx="7.2" cy="8" r="1.6" />
                  <path d="M17 12.5l-3.6-4.2-3.2 3.9-1.6 1.9H17v-1.6z" />
                </svg>
              </span>
              <span className="co-label">文生图</span>
            </button>
            <button className="create-option" onClick={() => {
          return ye('video');
        }}>
              <span className="co-ico" aria-hidden="true">
                <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2.5" y="4" width="15" height="12" rx="2.5" />
                  <path d="M8.4 7.6v4.8L12.6 10 8.4 7.6z" fill="currentColor" stroke="none" />
                </svg>
              </span>
              <span className="co-label">文生视频</span>
            </button>
            <button className="create-option" onClick={() => {
          return ye('text');
        }}>
              <span className="co-ico" aria-hidden="true">
                <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="4" y1="5" x2="16" y2="5" />
                  <line x1="10" y1="5" x2="10" y2="15.5" />
                </svg>
              </span>
              <span className="co-label">文字</span>
            </button>
          </div>
        </i.Fragment>}
      {_e && <_cmp_DT info={_e} onSelect={at} onCancel={() => {
      return Z(null);
    }} />}
      <_cmp__Component40 />
      {Y && <div className="node-ctx-menu" style={{
      left: Y.x,
      top: Y.y
    }} onClick={B => {
      return B.stopPropagation();
    }}>
          <div className="ctx-menu-item" onClick={() => {
        L.getState().arrangeSelectedNodes();
        fe();
      }}>
            自动排列（整理所选节点）
          </div>
          {Y.nodeType === 'material' && <div className="ctx-menu-item" onClick={Ye}>
              更换素材
            </div>}
          {Y.nodeType === 'material' && <div className={`ctx-menu-item${(() => {
        const B = L.getState().nodes.find(Oe => {
          return Oe.id === Y.nodeId;
        });
        const ue = B && B.data && B.data.dataUrl;
        if (ue && /^img:\/\//i.test(ue)) {
          return '';
        } else {
          return ' disabled';
        }
      })()}`} onClick={Pe} title="在 Finder 中显示图片文件">
              打开文件所在位置
            </div>}
          <div className="ctx-menu-item" onClick={Te}>
            复制 Ctrl+C
          </div>
          <div className="ctx-menu-item" onClick={rt}>
            保存为节点预设
          </div>
          <div className={`ctx-menu-item${L.getState().clipboard ? '' : ' disabled'}`} onClick={() => {
        if (L.getState().clipboard) {
          Ue();
        }
      }}>
            粘贴 Ctrl+V
          </div>
        </div>}
      {Le && <_Component41 imgRef={Le.imgRef} label={Le.label} onClose={() => {
      return L.getState().closeImageEditor();
    }} onSaved={(B, ue) => {
      const Oe = Le.nodeId;
      const We = L.getState();
      We.closeImageEditor();
      if (!B) {
        return;
      }
      const Ze = (We.nodes || []).find(vt => {
        return vt.id === Oe;
      });
      if (Ze && Ze.type === 'imggen') {
        We.replaceImageGenImage(Oe, B, ue || {});
      } else {
        We.replaceMaterialImage(Oe, B, ue || {});
      }
    }} />}
      {ae && <div className="modal-overlay" onClick={ht}>
          <div className="modal-box" onClick={B => {
        return B.stopPropagation();
      }}>
            <div className="modal-title">保存为节点预设</div>
            <div className="modal-sub">
              已选中 {ae.nodes.length} 个节点
              {ae.edges.length > 0 && `，含 ${ae.edges.length} 条连线`}
            </div>
            <input className="modal-input" autoFocus={true} placeholder="请输入节点预设名称" value={Se} onChange={B => {
          return ge(B.target.value);
        }} onKeyDown={B => {
          if (B.key === 'Enter') {
            ot();
          }
          if (B.key === 'Escape') {
            ht();
          }
        }} />
            <div className="modal-actions">
              <button className="btn primary sm" onClick={ot}>
                保存
              </button>
              <button className="btn sm ghost" onClick={ht}>
                取消
              </button>
            </div>
          </div>
        </div>}
      {ce && <div className="modal-overlay" onClick={() => {
      return L.getState().closeSplitKeywordModal();
    }}>
          <div className="modal-box" onClick={B => {
        return B.stopPropagation();
      }}>
            <div className="modal-title">按关键词拆分</div>
            <div className="modal-sub">
              输入关键词（多个用逗号 / 空格 / 换行分隔）。每个<b>出现关键词的行</b>
              将作为新片段的起点， 系统按原文顺序把文本切成多个文本框，<b>前置内容不丢失</b>、
              <b>顺序保持不变</b>。
              关键词大小写不敏感；建议用能唯一标识每个片段起始的词（如「场景」「分镜」「提示词组」），
              避免使用正文中频繁出现的词以免过度切分。
            </div>
            <textarea className="split-keyword-input" placeholder="例如：场景, 分镜, 提示词组" value={ne} autoFocus={true} onChange={B => {
          return q(B.target.value);
        }} onKeyDown={B => {
          if (B.key === 'Enter' && (B.metaKey || B.ctrlKey)) {
            B.preventDefault();
            te(Na(ne));
          }
        }} />
            <div className="modal-actions split-keyword-actions">
              <button className="btn sm ghost" onClick={() => {
            L.getState().closeSplitKeywordModal();
            q('');
          }}>
                取消
              </button>
              <button className="btn sm" onClick={() => {
            return te(Na(ne).length ? Na(ne) : ['提示词组', '分镜', '镜头', '场景', 'Prompt']);
          }} title="未输入关键词时，使用默认关键词（提示词组/分镜/镜头/场景/Prompt）拆分">
                用默认关键词
              </button>
              <button className="btn sm primary" disabled={!Na(ne).length} onClick={() => {
            return te(Na(ne));
          }}>
                按关键词拆分
              </button>
            </div>
          </div>
        </div>}
      {z && <div className="modal-overlay" onClick={() => {
      return L.getState().closeSplitPresetPicker();
    }}>
          <div className="modal-box" onClick={B => {
        return B.stopPropagation();
      }}>
            <div className="modal-title">拆分并套用节点预设</div>
            <div className="modal-sub">
              选中一个预设：将用拆分结果替换该预设的第一个节点，其余节点与连线保持不变
              {z.keywords && z.keywords.length > 0 && <span className="split-preset-kw">（当前关键词：{z.keywords.join(' / ')}）</span>}
            </div>
            <div className="split-preset-list">
              {(I || []).filter(B => {
            return B && B.kind === 'graph';
          }).map(B => {
            const ue = B.nodes || [];
            const Oe = B.edges || [];
            return <button className="split-preset-item" onClick={() => {
              const We = L.getState().splitApplyPreset(z.sourceNodeId, B.id, z.keywords);
              if (We && We.ok) {
                L.getState().closeSplitPresetPicker();
              }
            }} key={B.id}>
                      <span className="split-preset-name">{B.name}</span>
                      <span className="split-preset-meta">
                        {ue.length} 节点 · {Oe.length} 连线
                      </span>
                    </button>;
          })}
            </div>
            <button className="split-preset-item split-preset-direct" onClick={() => {
          L.getState().splitDirect(z.sourceNodeId, z.keywords);
          L.getState().closeSplitPresetPicker();
        }}>
              <span className="split-preset-name">直接拆分（不使用预设）</span>
              <span className="split-preset-meta">
                {z.keywords && z.keywords.length ? '按自定义关键词拆成多个文本框' : '按关键词+数字拆成多个文本框'}
              </span>
            </button>
            <div className="modal-actions">
              <button className="btn sm ghost" onClick={() => {
            return L.getState().closeSplitPresetPicker();
          }}>
                取消
              </button>
            </div>
          </div>
        </div>}
    </div>;
}