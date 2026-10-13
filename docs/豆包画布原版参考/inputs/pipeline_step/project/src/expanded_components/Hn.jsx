// TODO(全局, 无需 import): name, e, flex, t
import * as i from 'react';
const Hn = ({
  name: e
}) => {
  const t = (() => {
    switch (e) {
      case 'group':
        {
          return <i.Fragment>
            <rect x="2.5" y="3" width="9" height="9" rx="2" />
            <rect x="6.5" y="7" width="9" height="9" rx="2" />
          </i.Fragment>;
        }
      case 'ungroup':
        {
          return <i.Fragment>
            <rect x="2" y="2" width="7" height="7" rx="1.8" />
            <rect x="9" y="9" width="7" height="7" rx="1.8" />
          </i.Fragment>;
        }
      case 'grid':
      case 'smart':
        {
          return <i.Fragment>
            <rect x="2.5" y="2.5" width="4.5" height="4.5" rx="1" />
            <rect x="9" y="2.5" width="4.5" height="4.5" rx="1" />
            <rect x="2.5" y="9" width="4.5" height="4.5" rx="1" />
            <rect x="9" y="9" width="4.5" height="4.5" rx="1" />
          </i.Fragment>;
        }
      case 'left':
        {
          return <i.Fragment>
            <line x1="3" y1="3" x2="3" y2="13" />
            <line x1="6" y1="5" x2="13" y2="5" />
            <line x1="6" y1="8" x2="13" y2="8" />
            <line x1="6" y1="11" x2="13" y2="11" />
          </i.Fragment>;
        }
      case 'right':
        {
          return <i.Fragment>
            <line x1="13" y1="3" x2="13" y2="13" />
            <line x1="3" y1="5" x2="10" y2="5" />
            <line x1="3" y1="8" x2="10" y2="8" />
            <line x1="3" y1="11" x2="10" y2="11" />
          </i.Fragment>;
        }
      case 'hcenter':
        {
          return <i.Fragment>
            <line x1="8" y1="3" x2="8" y2="13" />
            <line x1="3" y1="5" x2="13" y2="5" />
            <line x1="3" y1="8" x2="13" y2="8" />
            <line x1="3" y1="11" x2="13" y2="11" />
          </i.Fragment>;
        }
      case 'hdist':
        {
          return <i.Fragment>
            <line x1="3" y1="3" x2="3" y2="13" />
            <line x1="8" y1="3" x2="8" y2="13" />
            <line x1="13" y1="3" x2="13" y2="13" />
          </i.Fragment>;
        }
      case 'top':
        {
          return <i.Fragment>
            <line x1="3" y1="3" x2="13" y2="3" />
            <line x1="5" y1="6" x2="5" y2="13" />
            <line x1="8" y1="6" x2="8" y2="13" />
            <line x1="11" y1="6" x2="11" y2="13" />
          </i.Fragment>;
        }
      case 'bottom':
        {
          return <i.Fragment>
            <line x1="3" y1="13" x2="13" y2="13" />
            <line x1="5" y1="3" x2="5" y2="10" />
            <line x1="8" y1="3" x2="8" y2="10" />
            <line x1="11" y1="3" x2="11" y2="10" />
          </i.Fragment>;
        }
      case 'vcenter':
        {
          return <i.Fragment>
            <line x1="3" y1="8" x2="13" y2="8" />
            <line x1="5" y1="3" x2="5" y2="13" />
            <line x1="8" y1="3" x2="8" y2="13" />
            <line x1="11" y1="3" x2="11" y2="13" />
          </i.Fragment>;
        }
      case 'vdist':
        {
          return <i.Fragment>
            <line x1="3" y1="3" x2="13" y2="3" />
            <line x1="3" y1="8" x2="13" y2="8" />
            <line x1="3" y1="13" x2="13" y2="13" />
          </i.Fragment>;
        }
      default:
        {
          return <i.Fragment>
            <rect x="2.5" y="2.5" width="4.5" height="4.5" rx="1" />
            <rect x="9" y="2.5" width="4.5" height="4.5" rx="1" />
            <rect x="2.5" y="9" width="4.5" height="4.5" rx="1" />
            <rect x="9" y="9" width="4.5" height="4.5" rx="1" />
          </i.Fragment>;
        }
    }
  })();
  return <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{
    flex: '0 0 auto'
  }}>
      {t}
    </svg>;
};
export default Hn;