// TODO(全局, 无需 import): json, e, t, n, r, o, s
export default function _Component32({
  json: e
}) {
  if (!e || typeof e != 'object') {
    return <pre className="mpp-pre">{typeof e == 'string' ? e : '(无结构化 JSON)'}</pre>;
  }
  const t = Object.entries(e);
  if (t.length) {
    return <div className="mpp-json">
        {t.map(([n, r]) => {
        return <div className="mpp-json-row" key={n}>
              <div className="mpp-json-key">{n}</div>
              <div className="mpp-json-val">
                {Array.isArray(r) ? r.map((s, o) => {
              return <div className="mpp-json-item" key={o}>
                          {s}
                        </div>;
            }) : String(r)}
              </div>
            </div>;
      })}
      </div>;
  } else {
    return <pre className="mpp-pre">(空)</pre>;
  }
}