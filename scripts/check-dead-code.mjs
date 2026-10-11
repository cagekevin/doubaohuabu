#!/usr/bin/env node
/**
 * 死代码闸（knip）—— 治 TD-16-22：原 `find-dead` 把「测试引用」与 `index.` 文件当引用
 * ⇒ **生产死代码系统性漏检**。本闸用 knip（主工程 devDependency）给出可信口径。
 *
 * 【为什么原 `find-dead` 不可信】它把 **测试引用** 也算作消费者 ⇒ 一个「只被 tests 引用」的
 *   导出（真死代码）会被判活；且它**跳过 `index.` 文件** ⇒ 死 barrel 全漏。
 *
 * 【官方三禁 + 唯一正道】（knip.dev「Production Mode」；本仓沿用 maomao 的实测结论）
 *   三种"用 ignore / entry / project 排除测试文件"的写法**全部无效**（只隐藏报告、测试照样算消费者），
 *   ✅ 唯一正道 = `knip --production`。逐条取证见下方 knip 调用处的行注释。
 *
 * 【机制：基线「永不复涨」】存量死代码（基线内）不阻塞、可逐步清偿；**基线外新增 = 闸红**。
 *   防回潮，而不是逼一次清空存量（全量门禁弊大于利）。
 *   基线内条目消失会提示"可移除"（stale，仅告警，保持基线诚实而不制造摩擦）。
 *
 * 【禁止】新增死代码一律**先删**；但两类**不是死代码**（不该删、也不该塞基线）→ 走下方唯一豁免通道。
 *
 * 【★时机】新增 / 替换功能时**必然**会报出两类"零消费"：① 本次新写、尚未接线的实现；
 *   ② 被替代、新实现刚接上的旧实现。二者都是**替换动作的过渡态**，不是本闸要治的死代码。
 *   ⇒ **先把功能写完、跑通，再同批清偿**（新实现接上 + 旧实现删除 ⇒ 本闸自然不报「基线外新增」）。
 *   ⛔ **禁止**为让本闸变绿而**删掉本次新写的代码 / 退回被替代的老实现** —— 那等于闸凌驾正确性。
 *
 * 【★唯一的合法豁免通道：`@public 跨边界消费者：<路径>`】
 *   两类例外：① 消费者在 knip **分析边界外**（`scripts/**` 闸脚本、`electron/**` → 见 knip.json 的 B 组 ignore）；
 *            ② 有意保留的公开导出（跨模块契约）。
 *   它们的**唯一**正确出口 = 在**声明处**打 JSDoc 标记（**不是**塞基线，**也不是**放宽 knip.json 的 ignore）：
 *       /**
 *        * @public 跨边界消费者：scripts/check-node-types.mjs
 *        * /
 *   为什么写在声明处：豁免跟着**声明**走（文件改名/移动不失配）且**带理由**；基线条目按
 *     `<路径>::<类别>::<名字>` 记账，改名即失配、且不带任何理由 → 它只配装"待清偿债务"，不配装"永久豁免"。
 *   为什么必须机器核验：凭"豁免"两字放行 = 闸自己生产假账。本文件 `checkPublicExemptions()`
 *     强制三条件：① 句式在　② 消费者**路径存在**　③ 该文件**真含这个符号名** ——
 *     ③ 专门堵「随手贴 @public 洗白」。
 *
 * 【★删 re-export 前必须顺链查到底】本仓有多层 re-export（`core/rules/index.ts` · `core/model/index.ts` ·
 *   `stable/model/index.ts` 等）。只删链尾会让死代码**上移一层**（knip 转而报中游）= 打地鼠。
 *   正确动作：`node scripts/mv-sync-refs.mjs refs <file>` 顺消费者查到底，一次清干净。
 *
 * 【★改：`--update-baseline` 加「不许涨」守卫】原实现无条件重生成 ⇒ "过闸"最便宜的动作就是它
 *   （一条命令 = 把违规洗成"存量"），而正道（删死代码 / 加豁免 + 理由）更贵 ⇒ 违反「闸的成本守恒」：
 *   **闸会生产它本要禁止的行为**。现改为：**当前存在"基线外新增"（= 回归）时拒绝写盘**（exit 1），
 *   除非显式 `--allow-new`（仅供"整体重生成确实必要"的场合，如 knip 版本跃迁；届时打印新增清单供 review）。
 *
 * 【★改：`--update-baseline` 不再抹掉手写的 `_comment`】`_comment` 是人写的**留痕**，不是生成物 ——
 *   工具不替调用方写叙事，也不许销毁它。现改为：**原样继承**既有 `_comment`；仅当文件里没有时才落默认文本。
 *
 * 【★闸的申诉口 · 三问】
 *   Q1 守什么：**结构偏好闸** —— 死代码是"待清偿债务"，不是物理契约。
 *   Q2 何时该改：① 清偿/改名后跑 `--update-baseline` **移除已消失项**（正途）；
 *               ② knip 版本跃迁等"整体重生成确实必要" → `--allow-new`（会打印新增清单供 review）。
 *               **禁止**用 `--allow-new` 把回归洗成存量 —— 已有「不许涨」守卫拦着。
 *   Q3 怎么改：**先 `refs` 取证，再按序选一条**（禁跳步）：
 *               ① **删**（首选；真死代码）—— 先 refs 顺链查到底，别只删链尾；
 *               ② **声明处打 `@public 跨边界消费者：<路径>`**（消费者在分析边界外 / 有意保留的公开导出）——
 *                  受元层校验（句式 + 路径存在 + 真含符号名）；
 *               ③ **改 `knip.json` 的边界**（前提是 ignore 分组的**理由本身变了**；**不许**为了消红而放宽
 *                  —— 放宽 ignore 是致盲，会让更多真导出被误判）。
 *               基线只能靠**清偿**而缩小，不靠重生成而放大。
 *
 * 用法：
 *   node scripts/check-dead-code.mjs                    # 校验（新增死代码 → 退出码 1）
 *   node scripts/check-dead-code.mjs --update-baseline  # 清偿/改名后重生成（**有新增则拒绝**；须 review diff）
 *   node scripts/check-dead-code.mjs --update-baseline --allow-new   # 显式放行（打印本次新增 N 条）
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, relative } from 'node:path';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const BASELINE_PATH = fileURLToPath(new URL('./dead-code-baseline.json', import.meta.url));
/** 显式放行"基线外新增"（默认禁止 —— 见文件头【★改：不许涨】） */
const ALLOW_NEW = process.argv.includes('--allow-new');
/** 基线文件**首次生成**时用的 `_comment`；已存在则原样继承（见文件头【★改：不再抹掉手写的 `_comment`】） */
const DEFAULT_COMMENT =
  '死代码闸基线（scripts/check-dead-code.mjs 消费）。基线内=存量（不阻塞，可逐步清偿）；基线外新增=闸红。重生成：node scripts/check-dead-code.mjs --update-baseline';
/** 与 knip 输出对齐的 issue 类别（knip --reporter json 的 issues[].{files,exports,...}） */
const KINDS = [
  'files',
  'exports',
  'types',
  'dependencies',
  'unlisted',
  'unresolved',
  'enumMembers',
  'binaries',
];
const UPDATE = process.argv.includes('--update-baseline');

/**
 * 裁决路径 —— **唯一真源**（UPDATE 拒绝 与 新增死代码报错**共用**，防两处文案各写一份而漂移）。
 * 它回答的是本闸最大的空白：闸只告诉"你违规了"，没说"**怎么判断该删还是该留**"。
 */
const ADJUDICATION =
  '\n裁决路径（按序，别跳步）：\n' +
  '   0. 先分清时机：报的是「本次新写、尚未接线」的新实现、或「刚被替代」的旧实现 ⇒ 那是**过渡态**，\n' +
  '        先把功能写完、跑通再**同批清偿**；\n' +
  '        ⛔ 不许为过闸删掉本次新写的代码 / 退回被替代的老实现（闸不许凌驾正确性）。\n' +
  '   1. 取证：node scripts/mv-sync-refs.mjs refs <file>\n' +
  '        ← 它看得见 knip 看不见的：字符串引用、scripts/ 侧消费\n' +
  '   2. 判死 → 删。⚠️ 先顺链查到底：本仓有多层 re-export 链（core/rules/index.ts 等），\n' +
  '        只删链尾会把死代码**上移一层**（knip 转而报中游）= 打地鼠，下次跑闸反而更红\n' +
  '   3. 判活、但消费者在 knip 分析边界外（scripts 与 electron 下的闸脚本）→ 在**声明处**加：\n' +
  '        @public 跨边界消费者：<具体路径>   （路径须存在且真含该符号名，本闸会核验）\n' +
  '   4. 有意保留的公开导出 → 同第 3 步。\n' +
  '   ⛔ 禁止：放宽 knip.json 的 ignore（= 致盲更多真导出）· --update-baseline 塞基线（= 把闸弄瞎）';

if (!existsSync(join(ROOT, 'node_modules', 'knip'))) {
  console.error('❌ 未找到主工程依赖 knip（devDependencies）。请先 `npm install`。');
  process.exit(1);
}
const knipVersion = JSON.parse(
  readFileSync(join(ROOT, 'node_modules', 'knip', 'package.json'), 'utf8'),
).version;

let raw = '';
try {
  // 【★「仅测试引用」必须用 `--production` 才判得出来】（knip.dev「Production Mode」）
  //   官方点名的三种**错误**做法，实测均无效：
  //     ① ignore 加测试文件 glob   → 只隐藏报告，测试照样算消费者；
  //     ② entry 里用 `!` 排除测试   → 无效：测试由插件注入为 entry，覆盖不掉；
  //     ③ project 里用 `!` 排除测试 → 无效：同上（它们本身就是 entry）。
  //   ✅ 唯一正道 = `--production`（测试/dev 文件不是生产入口 ⇒ 其引用不再算「已使用」）。
  // 【★提速：`--cache`】官方：缓存文件分析结果，连续运行提速 10–40%（以 mtime+size 判有效）。
  //   ⚠️ 已知限制：新增的 `.gitignore` 条目不会被自动感知 —— 变化时清 `node_modules/.cache/knip`。
  raw = execFileSync(
    'npx knip --config knip.json --production --cache --reporter json --no-exit-code',
    {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: true,
      maxBuffer: 64 * 1024 * 1024,
    },
  );
} catch (e) {
  console.error('❌ knip 执行失败：' + (e.stderr || e.message));
  process.exit(1);
}

// 基数自检（防「扫 0 却绿灯」）：knip 正常会打印 JSON 报告（即便 0 issue 也非空）；
// 输出为空 = 未真正扫描 src（或 knip 静默退出）→ 此处静默通过 = 最危险的失效，拒绝放行。
if (raw.trim().length === 0) {
  console.error('❌ knip 无任何输出（未真正扫描 src，扫 0 却绿灯）→ 拒绝放行');
  process.exit(1);
}

/** knip JSON → 稳定可比标识集合（`<file>::<kind>::<name>`；不含行号，位置漂移不误判） */
function collect(text) {
  const json = JSON.parse(text);
  const items = [];
  for (const it of json.issues || []) {
    for (const kind of KINDS) {
      for (const entry of it[kind] || []) {
        const name =
          entry && typeof entry === 'object'
            ? (entry.name ?? entry.symbol ?? JSON.stringify(entry))
            : String(entry);
        items.push(`${it.file}::${kind}::${name}`);
      }
    }
  }
  return [...new Set(items)].sort();
}

/**
 * ── 元层校验：`@public` 豁免必须「可核验」（堵假豁免）────────────────
 * 【为什么需要】`@public` 是唯一合法豁免通道。若闸只认"有 @public 就放行"，它就退化成一张随便贴的
 *   通行证；而「贴一个词」比「删代码 / 顺链取证」便宜得多 ⇒ 假豁免必然泛滥。故升级为三条件：
 *     ① 句式：必须带「跨边界消费者：」—— 不接受"公共 API / 有意保留"这类**无坐标**理由。
 *     ② 路径：给出的消费者文件**必须存在**。
 *     ③ 事实：该文件里**必须真的出现这个符号名** —— 让"随手贴 @public 洗白"当场红。
 * 【fail-loud 自检】文本里有 @public 却结构化解析到 0 个声明 → 判校验器失效、拒绝"静默 0 违规"。
 */
const PUBLIC_SENTENCE = '跨边界消费者：';
const SRC_DIR = join(ROOT, 'src');
/** 块注释 + 紧随其后的**具名**导出声明（`export const/function/class/interface/type/enum ...`） */
const RE_PUBLIC_DECL =
  /\/\*\*([\s\S]*?)\*\/\s*export\s+(?:declare\s+)?(?:async\s+)?(?:const|let|var|function|class|interface|type|enum)\s+([A-Za-z_$][\w$]*)/;

/** 递归收集 src 下 .ts/.tsx（豁免标记只允许出现在 src 的声明处） */
function walkTs(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walkTs(p, out);
    else if (/\.(ts|tsx)$/.test(e.name)) out.push(p);
  }
  return out;
}

function checkPublicExemptions() {
  const violations = [];
  let parsed = 0;
  let rawHits = 0;
  for (const abs of walkTs(SRC_DIR)) {
    const text = readFileSync(abs, 'utf8');
    rawHits += (text.match(/@public\b/g) || []).length;
    const re = new RegExp(RE_PUBLIC_DECL.source, 'g');
    let m;
    while ((m = re.exec(text))) {
      const doc = m[1];
      const name = m[2];
      if (!/@public\b/.test(doc)) continue;
      parsed++;
      const rel = relative(ROOT, abs).replace(/\\/g, '/');
      const at = doc.indexOf(PUBLIC_SENTENCE);
      if (at < 0) {
        violations.push(
          `${rel} → ${name}：@public 缺「${PUBLIC_SENTENCE}<路径>」句式` +
            '（"公共 API / 有意保留"这类无坐标理由无法核验，不予放行）',
        );
        continue;
      }
      const pm = doc
        .slice(at + PUBLIC_SENTENCE.length)
        .match(/([\w./-]+\.(?:mjs|cjs|jsx?|tsx?|json))/);
      if (!pm) {
        violations.push(`${rel} → ${name}：未解析到消费者文件路径`);
        continue;
      }
      const consumerRel = pm[1];
      const consumerAbs = join(ROOT, consumerRel);
      if (!existsSync(consumerAbs)) {
        violations.push(`${rel} → ${name}：消费者路径不存在 → ${consumerRel}`);
        continue;
      }
      if (!readFileSync(consumerAbs, 'utf8').includes(name)) {
        violations.push(
          `${rel} → ${name}：${consumerRel} 内找不到符号名「${name}」→ 豁免与事实不符（假豁免）`,
        );
      }
    }
  }
  if (rawHits > 0 && parsed === 0) {
    violations.push(
      `自检失败：src 文本里有 ${rawHits} 处 @public，但结构化解析到 0 个导出声明` +
        ' → 校验器正则失效，拒绝"静默 0 违规"',
    );
  }
  return { violations, parsed, rawHits };
}

const current = collect(raw);

// ── 元层：@public 豁免可核验（独立于 knip 结果；重生成基线同样拦 —— 不许用重生成绕过）──
const pub = checkPublicExemptions();
if (pub.violations.length) {
  console.error(`\n❌ @public 豁免校验未过（${pub.violations.length} 条）：`);
  for (const v of pub.violations) console.error('   ✖ ' + v);
  console.error(
    '\n修法：豁免必须写在**声明处**且可核验，格式：\n' +
      '   @public 跨边界消费者：<真实存在的消费者文件路径>\n' +
      '   且该文件里要**真的出现这个符号名**（这条专门堵"随手贴 @public 洗白"）。\n' +
      '   若该符号其实已无消费者 → 删掉它，别贴标记。',
  );
  process.exit(1);
}

if (UPDATE) {
  // ── 「闸的成本守恒」守卫：有"基线外新增"= 回归 → 拒绝写盘，把绕行成本抬回正道之上 ──
  const priorRaw = existsSync(BASELINE_PATH)
    ? JSON.parse(readFileSync(BASELINE_PATH, 'utf8'))
    : {};
  const prior = priorRaw.items ?? [];
  const priorSet = new Set(prior);
  const newOnes = current.filter((x) => !priorSet.has(x));
  if (newOnes.length && !ALLOW_NEW) {
    console.error(
      `\n❌ 拒绝重生成基线：当前有 ${newOnes.length} 条**基线外新增**（这是回归，不是存量）：`,
    );
    for (const x of newOnes.slice(0, 10)) console.error('   + ' + x);
    if (newOnes.length > 10) console.error(`   … 另 ${newOnes.length - 10} 条`);
    console.error(ADJUDICATION);
    console.error(
      '\n（仅当"整体重生成确实必要"，如 knip 版本跃迁 → 显式加 `--allow-new` 并 review 上面的新增清单。）',
    );
    process.exit(1);
  }
  if (newOnes.length)
    console.log(`⚠️  --allow-new 已放行 ${newOnes.length} 条基线外新增（请确认它们不是回归）`);
  const out = {
    // `_comment` 是**人手写的留痕**（手改理由 / 禁令提醒），不是生成物 ⇒ 原样继承；
    // 仅当文件里没有时才落默认文本（见文件头【★改：不再抹掉手写的 `_comment`】）。
    _comment: priorRaw._comment || DEFAULT_COMMENT,
    knipVersion,
    count: current.length,
    items: current,
  };
  writeFileSync(BASELINE_PATH, JSON.stringify(out, null, 2) + '\n');
  console.log(
    `✅ 基线已重生成：${current.length} 条（knip ${knipVersion}）→ scripts/dead-code-baseline.json`,
  );
  console.log(
    '   请 review diff：若含"新增"，说明把回归也塞进了基线（应改代码或加 knip.json 豁免）。',
  );
  process.exit(0);
}

const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'));
const baseSet = new Set(baseline.items);
const curSet = new Set(current);
const added = current.filter((x) => !baseSet.has(x));
const removed = baseline.items.filter((x) => !curSet.has(x));

console.log('🔒 死代码闸（knip · TD-16-22）');
console.log(
  `   knip ${knipVersion} ｜ 基线存量 ${baseline.items.length} 条 ｜ 当前 ${current.length} 条`,
);
console.log(`   @public 豁免 ${pub.parsed} 处（句式 + 路径存在 + 真含符号名，三项已核验 ✅）`);

if (removed.length) {
  console.log(
    `\n💡 基线内 ${removed.length} 条已消失（已清偿/改名）→ 可跑 --update-baseline 移除：`,
  );
  for (const x of removed.slice(0, 8)) console.log('   - ' + x);
  if (removed.length > 8) console.log(`   … 另 ${removed.length - 8} 条`);
}

if (added.length) {
  console.error(`\n❌ 新增死代码 ${added.length} 条（基线外）：`);
  for (const x of added) console.error('   + ' + x);
  console.error(ADJUDICATION);
  process.exit(1);
}
console.log('   ✅ 无新增死代码（基线内存量属待清偿，未阻塞）');
