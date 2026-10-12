#!/usr/bin/env node
/**
 * 从原应用的 leveldb 提取 localStorage 真值（W2 / W14 的 golden sample）
 *
 * 依据：docs/11 §十二（数据契约的真实样本背书）
 *   - Chromium 的 Local Storage leveldb：条目键形如 `_<origin>\x00\x01<key>`
 *   - 值：首字节 0x00 = UTF-16LE，0x01 = Latin-1/UTF-8，其后是字符串字节
 *
 * ⚠️ **只读原件**：先把 leveldb **拷到 fixtures 下**再打开（打开会写 LOG/LOCK，不能碰原件）
 *
 * 用法：node scripts/extract-real-sample.cjs
 */
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { ClassicLevel } = require('classic-level');

const USER_DATA = path.join(os.homedir(), 'AppData', 'Roaming', 'doubao-canvas');
const OUT_DIR = path.resolve(__dirname, '..', 'tests', 'fixtures', 'real-sample');
const TMP_DIR = path.join(OUT_DIR, '_leveldb-copy');

/** 我们关心的键（`stable/contracts/keys.ts` 的 20 个） */
const WANTED = [
  'doubao-projects',
  'doubao-accounts',
  'doubao-account-groups',
  'doubao-presets',
  'doubao-styles',
  'doubao-canvas-defaults',
  'doubao-lovart-galleries',
  'doubao-scan-history',
  'doubao-proxy-pool',
  'doubao-auto-video-detect',
  'doubao-face-mask-opts',
  'doubao-account-pool-strategy',
  'doubao-sendqueue-pos-v2',
  'imggen_recurring_assets_v1',
  'doubao-canvas',
  'access_token',
  'doubao-newimages-autocap',
  'doubao-newimages-current-only',
  'doubao-newimages-folded',
  'doubao-view-head-collapsed',
];

/** 找所有 leveldb 目录（主 + 各 partition） */
function findLevelDbs(root) {
  const out = [];
  const main = path.join(root, 'Local Storage', 'leveldb');
  if (fs.existsSync(main)) out.push({ label: 'main', dir: main });
  const parts = path.join(root, 'Partitions');
  if (fs.existsSync(parts)) {
    for (const d of fs.readdirSync(parts)) {
      const p = path.join(parts, d, 'Local Storage', 'leveldb');
      if (fs.existsSync(p)) out.push({ label: d, dir: p });
    }
  }
  return out;
}

/** 解码 Chromium localStorage 的值 */
function decodeValue(buf) {
  if (!buf || buf.length === 0) return null;
  const tag = buf[0];
  if (tag === 0x00) {
    // UTF-16LE（跳过首字节，去掉末尾可能的 0x00 0x00）
    let end = buf.length;
    if (end >= 3 && buf[end - 1] === 0x00 && buf[end - 2] === 0x00) end -= 2;
    return buf.subarray(1, end).toString('utf16le');
  }
  if (tag === 0x01) {
    return buf.subarray(1).toString('utf8');
  }
  // 无 tag：直接按 UTF-8 解
  return buf.toString('utf8');
}

/** 从 leveldb 键里剥出 localStorage 键名（`_<origin>\x00\x01<key>`） */
function parseLsKey(keyBuf) {
  const s = keyBuf.toString('latin1');
  const i = s.indexOf('\u0000\u0001');
  return i >= 0 ? s.slice(i + 2) : s;
}

(async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const found = {};
  const dbs = findLevelDbs(USER_DATA);
  console.log(`发现 ${dbs.length} 个 leveldb 目录\n`);

  for (const { label, dir } of dbs) {
    // 拷到 fixtures 下再打开（不动原件）；每次用新目录，避免删除操作
    const copy = path.join(TMP_DIR, `${label}-${Date.now()}`);
    fs.mkdirSync(copy, { recursive: true });
    fs.cpSync(dir, copy, { recursive: true });

    // ⚠️ 必须用 buffer 编码：默认的 utf8 会先把原始字节解坏（值是 UTF-16LE/tag 前缀）
    const db = new ClassicLevel(copy, {
      createIfMissing: false,
      keyEncoding: 'buffer',
      valueEncoding: 'buffer',
    });
    try {
      await db.open();
    } catch (e) {
      console.log(`  ⚠️ ${label} 打开失败：${e.message}`);
      continue;
    }

    let scanned = 0;
    for await (const [k, v] of db.iterator()) {
      scanned++;
      const name = parseLsKey(k);
      if (!WANTED.includes(name)) continue;
      const val = decodeValue(v);
      if (val && val.length > 0 && !found[name]) {
        found[name] = { value: val, from: label };
      }
    }
    await db.close();
    console.log(`  ${label}: 扫描 ${scanned} 条`);
  }

  // ── 写出 ──
  const summary = [];
  for (const key of WANTED) {
    const hit = found[key];
    if (hit) {
      fs.writeFileSync(path.join(OUT_DIR, `${key}.txt`), hit.value, 'utf8');
      summary.push(`✅ ${key.padEnd(32)} ${String(hit.value.length).padStart(8)} 字符`);
    } else {
      summary.push(`❌ ${key.padEnd(32)} 未找到`);
    }
  }

  const backup = path.join(USER_DATA, 'projects-autobackup.json');
  if (fs.existsSync(backup)) {
    fs.copyFileSync(backup, path.join(OUT_DIR, 'projects-autobackup.json'));
    summary.push(`\n✅ projects-autobackup.json（${fs.statSync(backup).size} 字节）`);
  }

  console.log('\n════════ 提取结果 ════════\n');
  console.log(summary.join('\n'));
  console.log(`\n命中：${Object.keys(found).length} / ${WANTED.length}`);
  console.log(`输出：${OUT_DIR}`);
})().catch((e) => {
  console.error('提取失败：', e);
  process.exit(1);
});
