const { webcrack } = require('webcrack');
const fs = require('fs');
async function main() {
  const code = fs.readFileSync('./_pipeline_step/original.js', 'utf8');
  console.log('输入大小:', code.length, '字符');
  try {
    const result = await webcrack(code);
    console.log('返回类型:', typeof result);
    console.log('返回 keys:', Object.keys(result || {}));
    if (typeof result === 'string') {
      fs.writeFileSync('./_pipeline_step/webcracked.js', result);
    } else if (result.code) {
      fs.writeFileSync('./_pipeline_step/webcracked.js', result.code);
    }
    console.log('成功');
  } catch(e) {
    console.log('失败:', e.message);
  }
}
main();