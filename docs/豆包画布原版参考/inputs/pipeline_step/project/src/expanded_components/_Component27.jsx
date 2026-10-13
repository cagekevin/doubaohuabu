// TODO(全局, 无需 import): src, n, t, a, isFinite, l, e, o, s, r
import * as g from 'react';
export default function _Component27({
  src: e
}) {
  const t = g.useRef(null);
  const n = g.useRef(false);
  const [r, s] = g.useState(false);
  const o = g.useCallback(() => {
    if (n.current) {
      return;
    }
    const a = t.current;
    if (a) {
      try {
        const l = a.duration;
        if (typeof l != 'number' || !isFinite(l) || l <= 0) {
          return;
        }
        n.current = true;
        if (l > 0.15) {
          a.currentTime = 0.1;
        } else {
          a.currentTime = 0;
        }
        a.pause();
      } catch {}
    }
  }, []);
  return <video ref={t} className="dmp-thumb" src={e} controls={true} playsInline={true} preload="metadata" onLoadedMetadata={o} onLoadedData={o} onError={() => {
    return s(true);
  }} title={r ? '视频加载失败，可点「原链接」查看' : ''} />;
}