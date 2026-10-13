// TODO(全局, 无需 import): t, r, e, n, s, o, wasMultiple, l, value, c, lanes, firstContext
import _cmp_Nv from "./Nv.jsx";
import { rh, hn, _n, dc, Xo, Ht, jn, yn, fh, Zi, Jf, Hf, dh, Os, ui, Kw, Xe, Nr, br, li, Bt, Pa, vm, xm, gf, Qi, Qa, Wi, wm, bm, uc, Sv, is, qw, yf, df, Kt, hf, Ev, Za, Bp, bs, Lo, Yw, Ln, Gt, Wt, Dn, pw, Ko, Nh, ai, ih, xa, vc, Ft, Jt, Qo, Sh, Pn } from "./shared.js";
import * as _shared from "./shared.js";
import * as a from 'react';
export default function YN(e, t, n) {
  var r = t.pendingProps;
  rh(t);
  switch (t.tag) {
    case 2:
    case 16:
    case 15:
    case 0:
    case 11:
    case 7:
    case 8:
    case 12:
    case 9:
    case 14:
      {
        hn(t);
        return null;
      }
    case 1:
      {
        if (_n(t.type)) {
          dc();
        }
        hn(t);
        return null;
      }
    case 3:
      {
        r = t.stateNode;
        Xo();
        Ht(jn);
        Ht(yn);
        fh();
        if (r.pendingContext) {
          r.context = r.pendingContext;
          r.pendingContext = null;
        }
        if (e === null || e.child === null) {
          if (Zi(t)) {
            t.flags |= 4;
          } else if (e !== null && (!e.memoizedState.isDehydrated || !!(t.flags & 256))) {
            t.flags |= 1024;
            if (_shared.rr !== null) {
              Jf(_shared.rr);
              _shared.rr = null;
            }
          }
        }
        Hf(e, t);
        hn(t);
        return null;
      }
    case 5:
      {
        dh(t);
        var s = Os(ui.current);
        n = t.type;
        if (e !== null && t.stateNode != null) {
          Kw(e, t, n, r, s);
          if (e.ref !== t.ref) {
            t.flags |= 512;
            t.flags |= 2097152;
          }
        } else {
          if (!r) {
            if (t.stateNode === null) {
              throw Error(Xe(166));
            }
            hn(t);
            return null;
          }
          e = Os(Nr.current);
          if (Zi(t)) {
            r = t.stateNode;
            n = t.type;
            var o = t.memoizedProps;
            r[br] = t;
            r[li] = o;
            e = (t.mode & 1) !== 0;
            switch (n) {
              case 'dialog':
                {
                  Bt('cancel', r);
                  Bt('close', r);
                  break;
                }
              case 'iframe':
              case 'object':
              case 'embed':
                {
                  Bt('load', r);
                  break;
                }
              case 'video':
              case 'audio':
                {
                  for (s = 0; s < Pa.length; s++) {
                    Bt(Pa[s], r);
                  }
                  break;
                }
              case 'source':
                {
                  Bt('error', r);
                  break;
                }
              case 'img':
              case 'image':
              case 'link':
                {
                  Bt('error', r);
                  Bt('load', r);
                  break;
                }
              case 'details':
                {
                  Bt('toggle', r);
                  break;
                }
              case 'input':
                {
                  vm(r, o);
                  Bt('invalid', r);
                  break;
                }
              case 'select':
                {
                  r._wrapperState = {
                    wasMultiple: !!o.multiple
                  };
                  Bt('invalid', r);
                  break;
                }
              case 'textarea':
                {
                  xm(r, o);
                  Bt('invalid', r);
                }
            }
            gf(n, o);
            s = null;
            for (var a in o) {
              if (o.hasOwnProperty(a)) {
                var l = o[a];
                if (a === 'children') {
                  if (typeof l == 'string') {
                    if (r.textContent !== l) {
                      if (o.suppressHydrationWarning !== true) {
                        Qi(r.textContent, l, e);
                      }
                      s = ['children', l];
                    }
                  } else if (typeof l == 'number' && r.textContent !== '' + l) {
                    if (o.suppressHydrationWarning !== true) {
                      Qi(r.textContent, l, e);
                    }
                    s = ['children', '' + l];
                  }
                } else if (Qa.hasOwnProperty(a) && l != null && a === 'onScroll') {
                  Bt('scroll', r);
                }
              }
            }
            switch (n) {
              case 'input':
                {
                  Wi(r);
                  wm(r, o, true);
                  break;
                }
              case 'textarea':
                {
                  Wi(r);
                  bm(r);
                  break;
                }
              case 'select':
              case 'option':
                {
                  break;
                }
              default:
                {
                  if (typeof o.onClick == 'function') {
                    r.onclick = uc;
                  }
                }
            }
            r = s;
            t.updateQueue = r;
            if (r !== null) {
              t.flags |= 4;
            }
          } else {
            if (s.nodeType === 9) {
              a = s;
            } else {
              a = s.ownerDocument;
            }
            if (e === 'http://www.w3.org/1999/xhtml') {
              e = Sv(n);
            }
            if (e === 'http://www.w3.org/1999/xhtml') {
              if (n === 'script') {
                e = a.createElement('div');
                e.innerHTML = '<script></script>';
                e = e.removeChild(e.firstChild);
              } else if (typeof r.is == 'string') {
                e = a.createElement(n, {
                  is: r.is
                });
              } else {
                e = a.createElement(n);
                if (n === 'select') {
                  a = e;
                  if (r.multiple) {
                    a.multiple = true;
                  } else if (r.size) {
                    a.size = r.size;
                  }
                }
              }
            } else {
              e = a.createElementNS(e, n);
            }
            e[br] = t;
            e[li] = r;
            qw(e, t, false, false);
            t.stateNode = e;
            e: {
              a = yf(n, r);
              switch (n) {
                case 'dialog':
                  {
                    Bt('cancel', e);
                    Bt('close', e);
                    s = r;
                    break;
                  }
                case 'iframe':
                case 'object':
                case 'embed':
                  {
                    Bt('load', e);
                    s = r;
                    break;
                  }
                case 'video':
                case 'audio':
                  {
                    for (s = 0; s < Pa.length; s++) {
                      Bt(Pa[s], e);
                    }
                    s = r;
                    break;
                  }
                case 'source':
                  {
                    Bt('error', e);
                    s = r;
                    break;
                  }
                case 'img':
                case 'image':
                case 'link':
                  {
                    Bt('error', e);
                    Bt('load', e);
                    s = r;
                    break;
                  }
                case 'details':
                  {
                    Bt('toggle', e);
                    s = r;
                    break;
                  }
                case 'input':
                  {
                    vm(e, r);
                    s = df(e, r);
                    Bt('invalid', e);
                    break;
                  }
                case 'option':
                  {
                    s = r;
                    break;
                  }
                case 'select':
                  {
                    e._wrapperState = {
                      wasMultiple: !!r.multiple
                    };
                    s = Kt({}, r, {
                      value: undefined
                    });
                    Bt('invalid', e);
                    break;
                  }
                case 'textarea':
                  {
                    xm(e, r);
                    s = hf(e, r);
                    Bt('invalid', e);
                    break;
                  }
                default:
                  {
                    s = r;
                  }
              }
              gf(n, s);
              l = s;
              for (o in l) {
                if (l.hasOwnProperty(o)) {
                  var c = l[o];
                  if (o === 'style') {
                    Ev(e, c);
                  } else if (o === 'dangerouslySetInnerHTML') {
                    if (c) {
                      c = c.__html;
                    } else {
                      c = undefined;
                    }
                    if (c != null) {
                      _cmp_Nv(e, c);
                    }
                  } else if (o === 'children') {
                    if (typeof c == 'string') {
                      if (n !== 'textarea' || c !== '') {
                        Za(e, c);
                      }
                    } else if (typeof c == 'number') {
                      Za(e, '' + c);
                    }
                  } else if (o !== 'suppressContentEditableWarning' && o !== 'suppressHydrationWarning' && o !== 'autoFocus') {
                    if (Qa.hasOwnProperty(o)) {
                      if (c != null && o === 'onScroll') {
                        Bt('scroll', e);
                      }
                    } else if (c != null) {
                      Bp(e, o, c, a);
                    }
                  }
                }
              }
              switch (n) {
                case 'input':
                  {
                    Wi(e);
                    wm(e, r, false);
                    break;
                  }
                case 'textarea':
                  {
                    Wi(e);
                    bm(e);
                    break;
                  }
                case 'option':
                  {
                    if (r.value != null) {
                      e.setAttribute('value', '' + bs(r.value));
                    }
                    break;
                  }
                case 'select':
                  {
                    e.multiple = !!r.multiple;
                    o = r.value;
                    if (o != null) {
                      Lo(e, !!r.multiple, o, false);
                    } else if (r.defaultValue != null) {
                      Lo(e, !!r.multiple, r.defaultValue, true);
                    }
                    break;
                  }
                default:
                  {
                    if (typeof s.onClick == 'function') {
                      e.onclick = uc;
                    }
                  }
              }
              switch (n) {
                case 'button':
                case 'input':
                case 'select':
                case 'textarea':
                  {
                    r = !!r.autoFocus;
                    break e;
                  }
                case 'img':
                  {
                    r = true;
                    break e;
                  }
                default:
                  {
                    r = false;
                  }
              }
            }
            if (r) {
              t.flags |= 4;
            }
          }
          if (t.ref !== null) {
            t.flags |= 512;
            t.flags |= 2097152;
          }
        }
        hn(t);
        return null;
      }
    case 6:
      {
        if (e && t.stateNode != null) {
          Yw(e, t, e.memoizedProps, r);
        } else {
          if (typeof r != 'string' && t.stateNode === null) {
            throw Error(Xe(166));
          }
          n = Os(ui.current);
          Os(Nr.current);
          if (Zi(t)) {
            r = t.stateNode;
            n = t.memoizedProps;
            r[br] = t;
            e = Ln;
            if ((o = r.nodeValue !== n) && e !== null) {
              switch (e.tag) {
                case 3:
                  {
                    Qi(r.nodeValue, n, (e.mode & 1) !== 0);
                    break;
                  }
                case 5:
                  {
                    if (e.memoizedProps.suppressHydrationWarning !== true) {
                      Qi(r.nodeValue, n, (e.mode & 1) !== 0);
                    }
                  }
              }
            }
            if (o) {
              t.flags |= 4;
            }
          } else {
            r = (n.nodeType === 9 ? n : n.ownerDocument).createTextNode(r);
            r[br] = t;
            t.stateNode = r;
          }
        }
        hn(t);
        return null;
      }
    case 13:
      {
        Ht(Gt);
        r = t.memoizedState;
        if (e === null || e.memoizedState !== null && e.memoizedState.dehydrated !== null) {
          if (Wt && Dn !== null && t.mode & 1 && !(t.flags & 128)) {
            pw();
            Ko();
            t.flags |= 98560;
            o = false;
          } else {
            o = Zi(t);
            if (r !== null && r.dehydrated !== null) {
              if (e === null) {
                if (!o) {
                  throw Error(Xe(318));
                }
                o = t.memoizedState;
                if (o !== null) {
                  o = o.dehydrated;
                } else {
                  o = null;
                }
                if (!o) {
                  throw Error(Xe(317));
                }
                o[br] = t;
              } else {
                Ko();
                if (!(t.flags & 128)) {
                  t.memoizedState = null;
                }
                t.flags |= 4;
              }
              hn(t);
              o = false;
            } else {
              if (_shared.rr !== null) {
                Jf(_shared.rr);
                _shared.rr = null;
              }
              o = true;
            }
          }
          if (!o) {
            if (t.flags & 65536) {
              return t;
            } else {
              return null;
            }
          }
        }
        if (t.flags & 128) {
          t.lanes = n;
          return t;
        } else {
          r = r !== null;
          if (r !== (e !== null && e.memoizedState !== null) && r) {
            t.child.flags |= 8192;
            if (t.mode & 1) {
              if (e === null || Gt.current & 1) {
                if (_shared.nn === 0) {
                  _shared.nn = 3;
                }
              } else {
                Nh();
              }
            }
          }
          if (t.updateQueue !== null) {
            t.flags |= 4;
          }
          hn(t);
          return null;
        }
      }
    case 4:
      {
        Xo();
        Hf(e, t);
        if (e === null) {
          ai(t.stateNode.containerInfo);
        }
        hn(t);
        return null;
      }
    case 10:
      {
        ih(t.type._context);
        hn(t);
        return null;
      }
    case 17:
      {
        if (_n(t.type)) {
          dc();
        }
        hn(t);
        return null;
      }
    case 19:
      {
        Ht(Gt);
        o = t.memoizedState;
        if (o === null) {
          hn(t);
          return null;
        }
        r = (t.flags & 128) !== 0;
        a = o.rendering;
        if (a === null) {
          if (r) {
            xa(o, false);
          } else {
            if (_shared.nn !== 0 || e !== null && e.flags & 128) {
              for (e = t.child; e !== null;) {
                a = vc(e);
                if (a !== null) {
                  t.flags |= 128;
                  xa(o, false);
                  r = a.updateQueue;
                  if (r !== null) {
                    t.updateQueue = r;
                    t.flags |= 4;
                  }
                  t.subtreeFlags = 0;
                  r = n;
                  n = t.child;
                  while (n !== null) {
                    o = n;
                    e = r;
                    o.flags &= 14680066;
                    a = o.alternate;
                    if (a === null) {
                      o.childLanes = 0;
                      o.lanes = e;
                      o.child = null;
                      o.subtreeFlags = 0;
                      o.memoizedProps = null;
                      o.memoizedState = null;
                      o.updateQueue = null;
                      o.dependencies = null;
                      o.stateNode = null;
                    } else {
                      o.childLanes = a.childLanes;
                      o.lanes = a.lanes;
                      o.child = a.child;
                      o.subtreeFlags = 0;
                      o.deletions = null;
                      o.memoizedProps = a.memoizedProps;
                      o.memoizedState = a.memoizedState;
                      o.updateQueue = a.updateQueue;
                      o.type = a.type;
                      e = a.dependencies;
                      if (e === null) {
                        o.dependencies = null;
                      } else {
                        o.dependencies = {
                          lanes: e.lanes,
                          firstContext: e.firstContext
                        };
                      }
                    }
                    n = n.sibling;
                  }
                  Ft(Gt, Gt.current & 1 | 2);
                  return t.child;
                }
                e = e.sibling;
              }
            }
            if (o.tail !== null && Jt() > Qo) {
              t.flags |= 128;
              r = true;
              xa(o, false);
              t.lanes = 4194304;
            }
          }
        } else {
          if (!r) {
            e = vc(a);
            if (e !== null) {
              t.flags |= 128;
              r = true;
              n = e.updateQueue;
              if (n !== null) {
                t.updateQueue = n;
                t.flags |= 4;
              }
              xa(o, true);
              if (o.tail === null && o.tailMode === 'hidden' && !a.alternate && !Wt) {
                hn(t);
                return null;
              }
            } else if (Jt() * 2 - o.renderingStartTime > Qo && n !== 1073741824) {
              t.flags |= 128;
              r = true;
              xa(o, false);
              t.lanes = 4194304;
            }
          }
          if (o.isBackwards) {
            a.sibling = t.child;
            t.child = a;
          } else {
            n = o.last;
            if (n !== null) {
              n.sibling = a;
            } else {
              t.child = a;
            }
            o.last = a;
          }
        }
        if (o.tail !== null) {
          t = o.tail;
          o.rendering = t;
          o.tail = t.sibling;
          o.renderingStartTime = Jt();
          t.sibling = null;
          n = Gt.current;
          Ft(Gt, r ? n & 1 | 2 : n & 1);
          return t;
        } else {
          hn(t);
          return null;
        }
      }
    case 22:
    case 23:
      {
        Sh();
        r = t.memoizedState !== null;
        if (e !== null && e.memoizedState !== null !== r) {
          t.flags |= 8192;
        }
        if (r && t.mode & 1) {
          if (Pn & 1073741824) {
            hn(t);
            if (t.subtreeFlags & 6) {
              t.flags |= 8192;
            }
          }
        } else {
          hn(t);
        }
        return null;
      }
    case 24:
      {
        return null;
      }
    case 25:
      {
        return null;
      }
  }
  throw Error(Xe(156, t.tag));
}