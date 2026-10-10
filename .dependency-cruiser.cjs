/**
 * dependency-cruiser 规则
 *
 * 依据：docs/11-架构与契约定稿.md §3.1（约束怎么打）
 *   - 层级方向 + 环检测（全局）
 *   - 入口点边界**只打在 adapters/site**（volatile 隔离）—— 审计 A1 的「选择性强化」
 *
 * 分层（L0 最底层）：
 *   L0 lib / constants / styles
 *   L1 stable
 *   L2 core
 *   L3 adapters
 *   L4 state
 *   L5 ui
 *   L6 bootstrap（唯一可依赖全部）
 *
 * @type {import('dependency-cruiser').IConfiguration}
 */
module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'error',
      comment: '禁止依赖环',
      from: {},
      to: { circular: true },
    },

    // ── 层级方向（禁反向）──
    {
      name: 'stable-no-upward',
      severity: 'error',
      comment: '§6.5 原则：stable 是冻结契约，不得依赖任何上层',
      from: { path: '^src/stable' },
      to: { path: '^src/(core|adapters|state|ui|bootstrap)' },
    },
    {
      name: 'core-no-upward',
      severity: 'error',
      comment: '§6.5 原则 1/3/4：core 不得依赖 adapters/state/ui/bootstrap',
      from: { path: '^src/core' },
      to: { path: '^src/(adapters|state|ui|bootstrap)' },
    },
    {
      name: 'adapters-no-upward',
      severity: 'error',
      comment: '§6.5 原则 1/2：adapters 不得依赖 state/ui/bootstrap（不得写 store）',
      from: { path: '^src/adapters' },
      to: { path: '^src/(state|ui|bootstrap)' },
    },
    {
      name: 'state-no-upward',
      severity: 'error',
      comment: '§6.5：state 不得依赖 ui/bootstrap',
      from: { path: '^src/state' },
      to: { path: '^src/(ui|bootstrap)' },
    },
    {
      name: 'state-no-adapters',
      severity: 'error',
      comment:
        '§3.2：state 不得 import adapters —— 端口由 bootstrap/container 注入（Provider 是唯一知道实现的地方）',
      from: { path: '^src/state' },
      to: { path: '^src/adapters' },
    },
    {
      name: 'foundation-no-upward',
      severity: 'error',
      comment: 'lib / constants / styles 是最底层，不得依赖任何上层',
      from: { path: '^src/(lib|constants|styles)' },
      to: { path: '^src/(stable|core|adapters|state|ui|bootstrap)' },
    },

    // ── 铁律 2：ui 不得直接调宿主 ──
    {
      name: 'ui-no-adapters',
      severity: 'error',
      comment: '铁律 2：ui 不得直接依赖 adapters（必须经 state → usecases → ports）',
      from: { path: '^src/ui' },
      to: { path: '^src/adapters' },
    },

    // ── ★ 入口点边界（选择性强化：只打 volatile 层）──
    {
      name: 'site-adapters-private',
      severity: 'error',
      comment:
        'volatile 隔离（§3.1 第 4 条）：站点选择器**不得泄进 core / state / ui / stable**。' +
        '只允许 adapters 内部与 bootstrap（唯一的接线点）依赖它',
      // ⚠️ 例外：bootstrap 是**组合根**，它必须能 new 出站点适配器；
      //    禁止的是「领域/编排/UI 直接依赖 volatile」——那才是隔离被破坏
      from: { pathNot: '^src/(adapters|bootstrap)' },
      to: { path: '^src/adapters/site' },
    },

    // ── core 是纯领域，不得依赖 UI 框架 ──
    {
      name: 'core-no-react',
      severity: 'error',
      comment: '§6.5 原则 4：core 是纯领域，不得依赖 react / react-dom / @xyflow',
      from: { path: '^src/core' },
      to: { path: 'node_modules/(react|react-dom|@xyflow)' },
    },
  ],

  options: {
    doNotFollow: { path: 'node_modules' },
    tsPreCompilationDeps: true, // 让 type-only import 也被看见
    tsConfig: { fileName: 'tsconfig.json' },
    exclude: { path: '(\\.test\\.ts$|/tests/)' },
    reporterOptions: {
      dot: { collapsePattern: 'node_modules/[^/]+' },
      archi: { collapsePattern: '^(src/[^/]+|node_modules/[^/]+)' },
    },
  },
};
