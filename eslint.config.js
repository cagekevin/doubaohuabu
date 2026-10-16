import globals from 'globals';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

/**
 * 冻结契约字符串（§6.5 原则 5）—— 只允许出现在 `src/stable/contracts/`。
 * ⚠️ 提成常量：flat config 对**同名规则**是「后者覆盖前者」而非合并 ⇒ 多个块要各自带上
 *    这批选择器，否则先设的块会被后设的块**静默覆盖**（实测过）。
 */
const SSOT_KEY_SELECTORS = [
  {
    selector: 'Literal[value=/^doubao-[a-z0-9-]+$/]',
    message: '原则5：冻结契约字符串只能出现在 stable/contracts/（keys.ts / schemas.ts）',
  },
  {
    selector: 'Literal[value="imggen_recurring_assets_v1"]',
    message: '原则5：冻结契约字符串只能出现在 stable/contracts/',
  },
  {
    // ★ `access_token` 是 20 键里**另一个非 `doubao-` 前缀**的键 —— 不单列它就在守卫外
    //   （曾让 `adapters/site/tapnow/scripts.ts` 的注入脚本写死第二份，已收口到 `LS_ACCESS_TOKEN`）。
    selector: 'Literal[value="access_token"]',
    message: '原则5：冻结契约字符串只能出现在 stable/contracts/',
  },
];

/**
 * ESLint flat config
 *
 * 依据：docs/11-架构与契约定稿.md
 *   §9.1  机器强制（StrictMode + eslint-plugin-react-hooks）
 *   §5.3  slice 规模约束
 *   §6.5  职责归位八原则
 */
export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'coverage/**',
      // ── 以下**不是**重写范围，排除出 lint ──
      // electron = 后端 CommonJS（**不是**"逆向工程副本的镜像"：`site-hosts.js` 为本仓独有、
      //   `main.js`/`preload.js` 与 `逆向工程/electron/` 的 md5 均不等 ⇒ 它是本仓**在维护的代码**）。
      //   不进 lint 的理由是**技术性的**：它是无 TS 的 CommonJS，套 TS 规则集整体误报
      //   （`--no-ignore` 实测大量 `no-require-imports`/`no-unused-vars`）。
      //   ⇒ 它的契约面（IPC 频道 / `window.api` 方法面）**不设机器守卫**，靠人工比对
      //   （工具 `scripts/extract-host-api.cjs`）—— 见 `AGENTS.md` §九「禁区速查」。
      //   ⚠️ 迁移期收窄为**只 ignore 未转的 `.js`**（后端 TS 迁移的 D-9 / 弯路 W10）：
      //      把 TS 规则套在无类型的 CommonJS 上会**成片误报** ⇒ 会被误读成"electron 代码太差" ⇒ 降档。
      //      已转的 `.ts` 由下面的 electron 块接管。
      'electron/**/*.js',
      'electron/dist/**', // ★ 后端产物（tsc emit）
      'build/**', // ★ 声明层产物（build:shared）
      'public/**', // ★ 第三方静态资源（mediapipe：wasm 加载器 + .tflite 模型），非重写范围
      'docs/**', // 设计文档（Markdown + 少量脚本）
      '.codebuddy/**', // 工作区命令/技能
      // ★ 本地临时验证脚本（Playwright 截图 / 探针）与**打补丁工作区**，均未追踪、非交付物。
      // ⚠️ 用 `.tmp*/**` 而不是 `.tmp/**` —— 原来只匹配 `.tmp/` 一个目录名，
      //    `.tmp-patch/`（内含 electron 的 CommonJS `main.js` 副本）照旧被扫 ⇒
      //    成片 `no-require-imports` 报错，把"仓库 lint 红"记在应用代码头上（`C35` 时踩到）。
      '.tmp*/**',
      '*.log',
    ],
  },

  ...tseslint.configs.recommended,
  reactHooks.configs.flat.recommended,

  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2023,
      globals: { ...globals.browser },
    },
    rules: {
      // ── §6.5 原则 6：错误透传 —— 禁吞错 ──
      // 载体**只有标准 `no-empty` 一份**（默认即 `allowEmptyCatch:false`；零维护、**无豁免逃逸口**）。
      // ⚠️ 不给"零语句 catch"另挂自造规则：它必须开一个"标个理由就放行"的出口，而那种出口
      //    **无法校验理由**（闸只认 token，不认内容）⇒ 等于把「处理错误」降级成「写一句话」，
      //    正是「合法通过成本 ≈ 0 ⇒ 形同虚设」。修法只有一条：**去处理它**。
      'no-empty': 'error',

      // ── §5.3 slice 规模约束 ──
      // ★ 2026-10-11 关闭（用户裁定）：行数是"**代理指标**"、不是"好设计的度量" ——
      //   它对「纯数据/文案表」（constants/*Text.ts）与「逻辑文件」用**同一把尺**，
      //   逼出"为拆而拆"（text.ts → sendPanelText → newImagesText → projectStorageText 四片链，
      //   每拆一次多一个文件 + 一层 re-export 间接）。
      //   ⇒ 规模约束改由**人工 review** 把关（docs/11 §5.3 的「单 slice 建议 ≤300 行」仍生效）。
      //   ⚠️ 要恢复：把下行改回 ['error', { max: 400, skipBlankLines: true, skipComments: true }]
      //      （并同步 AGENTS.md §三 / docs/11 §5.3 措辞）。
      'max-lines': 'off',

      // ── 类型纪律 ──
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],

      // ── 未使用变量：`_` 前缀表示「有意不用」（如 mock 的占位参数）──
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
    },
  },

  {
    // ── Node 工具脚本（.cjs）──
    files: ['**/*.cjs'],
    languageOptions: { sourceType: 'commonjs', globals: { ...globals.node } },
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },

  {
    // ── Node 治理 CLI（.mjs）：adr / debt / arch-index / extract-detours / mv-sync-refs ──
    // 它们是**仓库治理工具**（从 maomao 移植，已实测可跑），不是应用源码：
    // 不适用 §6.5 原则 7/8 与应用的类型纪律；未用变量多为工具内部的历史常量/解构占位。
    // ⚠️ 动它们前先确认 `node scripts/<tool>.mjs` 仍可跑（它们是审计链的入口）。
    files: ['scripts/**/*.mjs'],
    languageOptions: { sourceType: 'module', globals: { ...globals.node } },
    rules: { '@typescript-eslint/no-unused-vars': 'off' },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // 以下块 = 从已退役的 grep 型不变量闸（scripts/check-invariants.cjs，2026-10-11 删）
  // **迁来**的判据。为什么迁：grep 是**行级文本匹配**，系统性漏别名 / 多行 / 形态
  // （TD-14-1 · 14-2 · 04-4 · 16-9 · 16-33 全是它）；eslint 是 **AST 级**、零误报。
  // **判据不变，载体换成可靠的**。
  //
  // ⚠️ ESLint flat config 对**同名规则**是「后者覆盖前者」而非合并 ⇒ 多个块若都对同一
  //    文件设 `no-restricted-syntax`，**只有最后一个生效**（实测：ports 块被后面的全仓块
  //    覆盖 ⇒ 规则静默失效）。故此处**按目录切分、files 互不重叠**；重叠处用
  //    `SSOT_KEY_SELECTORS` 常量把选择器带上，避免静默丢覆盖。
  //
  // 未能迁的（按「闸越少越好、只留非常可靠的」**丢弃**）：
  //   · 原则3 ports-type-only —— 会打到 `export const X = [...] as const` 这个**合法 TS 形态**
  //     （TD-04-4），逼人为过闸改写法 ⇒ 正是「为闸加 if」，弃；
  //   · 原则5 ssot-color / W12 死宿主方法 / 原则8 Escape·aria-modal —— 主观或启发式，弃。
  // ═══════════════════════════════════════════════════════════════════════════

  {
    // ── §6.5 原则 4：纯的归 core（core 不得接触宿主 / 时间 / 随机 / 存储）──
    // ⚠️ 排除 core/ports —— 端口**就是**用来声明这些能力的（方法名里必然出现 setTimeout）
    files: ['src/core/**/*.{ts,tsx}'],
    ignores: ['src/core/ports/**', '**/tests/**'],
    rules: {
      'no-restricted-globals': [
        'error',
        { name: 'window', message: '原则4：core 不得接触宿主（经端口注入）' },
        { name: 'document', message: '原则4：core 不得接触宿主（经端口注入）' },
        { name: 'localStorage', message: '原则4：core 不得接触存储（经端口注入）' },
        { name: 'sessionStorage', message: '原则4：core 不得接触存储（经端口注入）' },
        { name: 'setTimeout', message: '原则4：core 不得自管时序（经 ClockPort 注入）' },
        { name: 'setInterval', message: '原则4：core 不得自管时序（经 ClockPort 注入）' },
      ],
      'no-restricted-properties': [
        'error',
        { object: 'Date', property: 'now', message: '原则4：core 不得读时间（经 ClockPort 注入）' },
        { object: 'Math', property: 'random', message: '原则4：core 不得用随机（注入）' },
      ],
    },
  },

  {
    // ── §6.5 原则 5（冻结契约字符串）+ TD-05-1（不得直调 window.api）──
    // 除冻结契约目录、宿主实现（electron adapter 是 window.api 的唯一合法处）、
    // usecases（另设块）与测试外，全仓适用。
    files: ['src/**/*.{ts,tsx}'],
    ignores: [
      'src/stable/contracts/**',
      'src/adapters/host/electron/**',
      'src/core/usecases/**',
      '**/tests/**',
    ],
    rules: {
      'no-restricted-syntax': [
        'error',
        ...SSOT_KEY_SELECTORS,
        {
          selector: "MemberExpression[object.name='window'][property.name='api']",
          message: 'TD-05-1：不得直调 window.api —— 宿主能力必须经注入的 HostPort',
        },
      ],
    },
  },

  {
    // ── §6.5 原则 6（usecases 不得自造 message）+ TD-05-1（不得直调 window.api）──
    // ⚠️ 本块**覆盖**上面全仓块（flat config 覆盖语义）⇒ **必须重带上面块的两条**：
    //    ① `SSOT_KEY_SELECTORS`；② `window.api` 选择器（`TD-14-4`：此前只带了 ①，
    //    于是「全仓适用」的声明在 usecases 目录**不成立** —— 声索 > 覆盖，正是母体 M2）。
    files: ['src/core/usecases/**/*.ts'],
    ignores: ['**/tests/**'],
    rules: {
      'no-restricted-syntax': [
        'error',
        ...SSOT_KEY_SELECTORS,
        {
          selector: "MemberExpression[object.name='window'][property.name='api']",
          message: 'TD-05-1：不得直调 window.api —— 宿主能力必须经注入的 HostPort',
        },
        {
          selector: "Property[key.name='message'] > Literal",
          message: '原则6：usecases 不得自造 message 字面量（只能转发 e.message / 上游 Result）',
        },
        {
          // ★ **`err(reason, message)` 的位置参数** —— 上面那条只拦**对象属性**
          //   （`{message: '…'}` / `err({message: '…'})`），而 `core/model/result.ts` 的
          //   `err(reason, message, cause?)` 是**位置参数** ⇒ `err('kind', '自造文案')` 此前**漏检**。
          //   `:nth-child(2)` = 第 2 个实参（⚠️ esquery 的 children **不含 `callee`** ⇒ 实参从 1 数起）。
          //   ⚠️ 只拦 `Literal`（`e.message` / 上游 Result 是 MemberExpression / CallExpression ⇒ 放行）。
          selector: "CallExpression[callee.name='err'] > Literal:nth-child(2)",
          message: '原则6：usecases 不得自造 message 字面量（只能转发 e.message / 上游 Result）',
        },
      ],
    },
  },

  {
    // ── §6.5 原则 7：测试边界 —— ui/ 与 adapters/ 下不得有测试文件（避免假守卫）──
    files: [
      'src/ui/**/*.{test,spec}.{ts,tsx}',
      'src/adapters/**/*.{test,spec}.{ts,tsx}',
    ],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'Program',
          message:
            '原则7（docs/11 §6.5）：ui/ 与 adapters/ 下不得有测试文件。UI 用端到端冒烟验（W15），不要写组件测试（假守卫）。',
        },
      ],
    },
  },

  {
    // ═══════════════════════════════════════════════════════════════════════════
    // 后端（宿主壳 · `electron/**`）—— **类型安全层**（`docs/plan/后端TS迁移/README.md` §6 S0-4）
    //   · 为什么单独一块：它必须 **type-aware**（写出的 `any` 只占少数，最大来源是**收到** `any`）；
    //   · ⛔ 只匹配 `electron/**/*.ts`：未转的 `.js` 由顶层 ignores 排除（D-9 / 弯路 W10）；
    //   · 风格层两条已按 B0-a 实测关掉（只在"与源逐字等价"的写法上报 ⇒ 噪声）；
    //     ⚠️ 类型安全轴**一条未动**（`no-unnecessary-condition` 之类留在默认档，它同批抓到过真冗余）。
    // ═══════════════════════════════════════════════════════════════════════════
    files: ['electron/**/*.ts'],
    languageOptions: {
      globals: { ...globals.node },
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // ── 类型安全层：**不可去**（只许换载体，不许去掉）──
      '@typescript-eslint/no-unsafe-assignment': 'error',
      '@typescript-eslint/no-unsafe-member-access': 'error',
      '@typescript-eslint/no-unsafe-call': 'error',
      '@typescript-eslint/no-unsafe-return': 'error',
      '@typescript-eslint/no-unsafe-argument': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/consistent-type-assertions': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      'no-empty': 'error',

      // ★ 「`@shared` 只许类型导入」—— **本条是那条保证的唯一载体**：
      //   `electron/tsconfig.json` 必须关 `verbatimModuleSyntax`（TS1295/1287 实测）
      //   ⇒ tsconfig 侧已经没了这条保证，只剩这里。它漏接不是"变松"，是**判据静默消失**
      //   （`@shared` 的任何 runtime 值都会被后端打进产物）。⇒ 与 `no-unsafe-*` 同级。
      //   ⚠️ 必须用 `@typescript-eslint` 版：核心版没有 `allowTypeImports`。
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@shared',
              allowTypeImports: true,
              message: '后端只许**类型**导入 @shared（共享物是类型契约，不是后端的运行时依赖）',
            },
          ],
          patterns: [
            {
              group: ['@shared/*'],
              allowTypeImports: true,
              message: '@shared/* 只许**类型**导入（verbatimModuleSyntax 关闭后，这条规则是该判据的唯一载体）',
            },
          ],
        },
      ],
      // 后端不是渲染层：宿主能力走 electron 的 API，不得碰 DOM 全局
      'no-restricted-globals': [
        'error',
        { name: 'window', message: '后端不得碰 window（宿主能力走 electron 的 API）' },
        { name: 'document', message: '后端不得碰 document（宿主能力走 electron 的 API）' },
      ],

      // ── 风格层（B0-a 实测噪声）⇒ 关；类型安全轴不动 ──
      '@typescript-eslint/restrict-template-expressions': 'off',
      '@typescript-eslint/no-base-to-string': 'off',
    },
  },
);
