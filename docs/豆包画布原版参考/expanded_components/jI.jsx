// TODO(全局, 无需 import): color, strokeWidth, t, e, stroke, fill, n
const jI = ({
  color: e = 'none',
  strokeWidth: t = 1
}) => {
  const n = {
    strokeWidth: t,
    ...(e && {
      stroke: e,
      fill: e
    })
  };
  return <polyline className="arrowclosed" style={n} strokeLinecap="round" strokeLinejoin="round" points="-5,-4 0,0 -5,4 -5,-4" />;
};
export default jI;