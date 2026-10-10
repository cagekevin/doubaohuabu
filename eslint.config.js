import globals from 'globals';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

/**
 * ESLint flat config
 *
 * 依据：docs/11-架构与契约定稿.md
 *   §9.1  机器强制（StrictMode + eslint-plugin-react-hooks）
 *   §5.3  slice 规模约束
 *   §6.5  职责归位七原则
 */
export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'coverage/**',
      // ── 以下**不是**重写范围，排除出 lint ──
      'electron/**', // 冻结的后端（与 逆向工程/electron 同一份，MD5 一致）
      'docs/**', // 设计文档（Markdown + 少量脚本）
      '.codebuddy/**', // 工作区命令/技能
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
      // ── §6.5 原则 6：错误透传 —— 禁止吞错 ──
      'no-empty': ['error', { allowEmptyCatch: false }],

      // ── §5.3 slice 规模约束 ──
      'max-lines': ['error', { max: 400, skipBlankLines: true, skipComments: true }],

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
);
