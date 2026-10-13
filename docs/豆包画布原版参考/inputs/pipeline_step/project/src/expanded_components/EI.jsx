// TODO(全局, 无需 import): color, strokeWidth, t, e, stroke, n
const EI = ({
  color: e = 'none',
  strokeWidth: t = 1
}) => {
  const n = {
    strokeWidth: t,
    ...(e && {
      stroke: e
    })
  };
  return <polyline className="arrow" style={n} strokeLinecap="round" fill="none" strokeLinejoin="round" points="-5,-4 0,0 -5,4" />;
};
export default EI;