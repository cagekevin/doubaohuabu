// TODO(全局, 无需 import): n, e
import { Qf } from './shared.js';
import * as t from 'react';
export default function wC(e) {
  return function () {
    var t = this.ownerDocument;
    var n = this.namespaceURI;
    if (n === Qf && t.documentElement.namespaceURI === Qf) {
      return t.createElement(e);
    } else {
      return t.createElementNS(n, e);
    }
  };
}