const fs = require('fs');
const d1 = 'C:/Users/xinye/Downloads/豆包画布逆向/inputs/pipeline_step/expanded_components';
const d2 = 'C:/Users/xinye/Downloads/豆包画布逆向/inputs/pipeline_step/project/src/expanded_components';
function bugCount(d) {
  let n = 0; const files = [];
  for (const f of fs.readdirSync(d)) {
    if (!/\.(js|jsx)$/.test(f)) continue;
    if (fs.readFileSync(d + '/' + f, 'utf8').includes('[native code]')) { n++; files.push(f); }
  }
  return { n, files };
}
const b1 = bugCount(d1), b2 = bugCount(d2);
console.log('目录1 [native code] bug 文件数:', b1.n, '→', b1.files.slice(0, 30).join(', '));
console.log('目录2 [native code] bug 文件数:', b2.n);
// 也统计 _cmp_ 前缀情况
const prefix = (d) => {
  let n = 0;
  for (const f of fs.readdirSync(d)) {
    if (!/\.jsx$/.test(f)) continue;
    if (fs.readFileSync(d + '/' + f, 'utf8').includes('_cmp_')) n++;
  }
  return n;
};
console.log('目录1 含 _cmp_ 的文件:', prefix(d1), '| 目录2 含 _cmp_ 的文件:', prefix(d2));
