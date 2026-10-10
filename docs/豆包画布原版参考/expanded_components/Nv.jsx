// TODO(全局, 无需 import): MSApp, e, t, n, r, s
import * as _shared from "./shared.js";
var Nv = function (e) {
  if (typeof MSApp !== 'undefined' && MSApp.execUnsafeLocalFunction) {
    return function (t, n, r, s) {
      MSApp.execUnsafeLocalFunction(function () {
        return e(t, n, r, s);
      });
    };
  } else {
    return e;
  }
}(function (e, t) {
  if (e.namespaceURI !== 'http://www.w3.org/2000/svg' || 'innerHTML' in e) {
    e.innerHTML = t;
  } else {
    _shared.Vi = _shared.Vi || document.createElement('div');
    _shared.Vi.innerHTML = '<svg>' + t.valueOf().toString() + '</svg>';
    t = _shared.Vi.firstChild;
    while (e.firstChild) {
      e.removeChild(e.firstChild);
    }
    while (t.firstChild) {
      e.appendChild(t.firstChild);
    }
  }
});
export default Nv;