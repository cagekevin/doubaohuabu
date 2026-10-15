/**
 * compare-inout-probe.cjs —— **E2 探针**（跑在 Electron 主进程里）
 *
 * 为什么需要它：E1（纯 Node）覆盖不到"要真 Electron 才活得起来"的函数
 * （`electron.net` / `app.getPath` / `safeStorage` / `session` …）；那些必须真起进程。
 *
 * ★ **安全第一**：起进程后**第一件事**就是把 `userData`（以及 `sessionData`）指到**调用方给的临时目录** ——
 *   被测模块里有会读写授权文件 / 落盘配置的（`license` / `api/config-store`），
 *   ⛔ 绝不允许它们碰用户的真实数据。
 *
 * 它**不比较**：只把每一次调用的事实（成功值 / 抛出的类型与消息）序列化打印成一行 `__E2__ {json}`；
 * 比较由父进程 `compare-inout.mjs --engine=electron` 做（两侧用**同一个**序列化器 ⇒ 可比）。
 *
 * 用法（由父进程 spawn，不手跑）：electron <本文件> <job.json>
 *   job.json = { oldRoot, newRoot, userData, jobs: [{ id, side, mod, fn, args }] }
 * 退出码：0 正常跑完（哪怕有 job 失败 —— 失败也是"事实"，交由父进程比）。
 */
const fs = require('node:fs');
const path = require('node:path');

const jobPath = process.argv[2];
if (!jobPath) {
  console.error('❌ 缺 job.json 路径');
  process.exit(2);
}
const job = JSON.parse(fs.readFileSync(jobPath, 'utf8'));

/** 序列化：与父进程的 normalize 同口径（函数比 name/arity、undefined 显式、循环注明） */
function ser(v, seen = new Set()) {
  if (v === undefined) return { t: 'undefined' };
  if (v === null) return { t: 'null' };
  const ty = typeof v;
  if (ty === 'string' || ty === 'number' || ty === 'boolean') return { t: ty, v };
  if (ty === 'function') return { t: 'function', name: v.name, arity: v.length };
  if (ty === 'symbol' || ty === 'bigint') return { t: ty, v: String(v) };
  if (ty !== 'object') return { t: ty };
  if (seen.has(v)) return { t: 'cycle' };
  seen.add(v);
  if (Array.isArray(v)) return { t: 'array', v: v.map((x) => ser(x, seen)) };
  if (v instanceof Error) return { t: 'error', name: v.name, message: v.message };
  if (v instanceof Map) return { t: 'map', v: [...v.entries()].map(([k, x]) => [ser(k, seen), ser(x, seen)]) };
  if (v instanceof Set) return { t: 'set', v: [...v].map((x) => ser(x, seen)) };
  const keys = Object.keys(v).sort();
  return { t: 'object', v: keys.map((k) => [k, ser(v[k], seen)]) };
}

/**
 * ⚠️ **同步写**（不走 `process.stdout` 的管道缓冲）：实测 `app.exit(0)` 会把还没 flush 的行掐掉
 * ⇒ 现象是"后几条用例的结果行凭空消失"，极易被误读成"探针死了/那一例卡住"。同步写就没这个口子。
 */
const emit = (obj) => {
  try {
    fs.writeSync(1, '__E2__ ' + JSON.stringify(obj) + '\n');
  } catch {
    /* 关掉了 stdout 就没办法了 —— 但那是父进程的事 */
  }
};

/**
 * 形参里的"**函数标记**"⇒ 真函数（JSON 传不了函数 ⇒ 用一个小约定）：
 *   `{ $fn: 'net.fetch' }`         —— 生产路径：主进程的 `net.fetch`（注入栈的常态）
 *   `{ $fn: '__throwingFetch' }`   —— 模拟**网络层失败**（测 `requestJsonWithFallback` 的换栈分支）
 * ⛔ 只认这两个名字；别的名字原样返回（宁可测到"类型不对"，也不静默替换成别的东西）。
 */
function resolveArg(a) {
  if (a && typeof a === 'object' && typeof a.$fn === 'string') {
    if (a.$fn === 'net.fetch') {
      const { net } = require('electron');
      return net.fetch.bind(net);
    }
    if (a.$fn === '__throwingFetch') {
      return async () => {
        throw new Error('probe: simulated fetch failure');
      };
    }
    return a;
  }
  if (Array.isArray(a)) return a.map(resolveArg);
  return a;
}

async function main() {
  // ★★★ 安全：先改 userData，再 require 任何被测模块
  const { app } = require('electron');
  if (job.userData) {
    fs.mkdirSync(job.userData, { recursive: true });
    app.setPath('userData', job.userData);
    try {
      app.setPath('sessionData', job.userData);
    } catch {
      /* 某些版本无 sessionData 路径名 —— 忽略即可 */
    }
  }

  await app.whenReady();

  const cache = new Map();
  const load = (root, mod) => {
    const key = root + '|' + mod;
    if (cache.has(key)) return cache.get(key);
    const p = path.join(root, mod);
    const m = require(p);
    cache.set(key, m);
    return m;
  };

  for (const j of job.jobs) {
    let out;
    try {
      const m = load(j.side === 'old' ? job.oldRoot : job.newRoot, j.mod);
      const fn = m[j.fn];
      if (typeof fn !== 'function') {
        out = { id: j.id, ok: false, value: { t: 'missing', v: typeof fn } };
      } else {
        // eslint-disable-next-line no-await-in-loop -- 探针按序跑（顺序本身也是事实）
        const r = await fn(...(j.args || []).map(resolveArg));
        out = { id: j.id, ok: true, value: ser(r) };
      }
    } catch (e) {
      out = { id: j.id, ok: false, value: { t: 'throw', name: e && e.name, message: String((e && e.message) || e) } };
    }
    emit(out);
  }

  app.exit(0);
}

main().catch((e) => {
  emit({ id: '__fatal__', ok: false, value: { t: 'fatal', message: String((e && e.message) || e) } });
  process.exit(1);
});
