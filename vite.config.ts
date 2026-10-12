import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export default defineConfig({
  plugins: [react()],
  // Electron 加载 dist/index.html，必须相对路径
  base: './',
  resolve: {
    alias: { '@': resolve(import.meta.dirname, 'src') },
    // React 单实例
    dedupe: ['react', 'react-dom'],
  },
  server: { port: 5175, open: false },
  css: {
    modules: {
      /**
       * ★ 显式锁定 CSS Modules 命名约定（P7）：
       *   `localsConvention: 'camelCase'` = 类名**原名 + camelCase 双导出**。
       *
       *   为什么必须是 `camelCase`、不能是 `camelCaseOnly` / `dashesOnly`：
       *   - 多数组件用 `styles.videoPanelClose` 这类 camelCase 点访问；
       *   - **另有 6 处方括号动态访问 snake_case 类名**：
       *     `styles[`st_${status}`]`（AccountNode / BatchSendPanel / SendQueuePanel）、
       *     `styles[msgKind]`（ActivatePage）、`styles[`handle${h}`]`（ImageEditor）。
       *     这些键**依赖原名导出**。改 `camelCaseOnly` 会把 `st_ok` 变成 `stOk` ⇒
       *     `styles['st_ok']` 变 `undefined` ⇒ **没样式、不报错**（静默失效）。
       *
       *   ⚠️ 改动本配置前先跑 `npx vite build` 确认无 CssSyntaxError 且 6 处动态键仍命中。
       */
      localsConvention: 'camelCase',
    },
  },
  build: {
    outDir: 'dist',
    // ⚠️ 本机环境的安全护栏会拦截 `fs.rmSync`（Vite 清空 outDir 时调用）
    //    → 设为 false，避免构建被拦。代价：旧哈希文件会累积，需要时手工清理 dist/
    emptyOutDir: false,
    target: 'esnext',
    sourcemap: true,
  },
  test: {
    // 原则 7：只测纯逻辑，不测 UI（见 docs/11 §6.5）
    environment: 'node',
    include: ['src/**/tests/**/*.test.ts'],
    globals: false,
    // 复用 worker 跨文件（省去「每文件一个 worker」的 spawn + env 开销）。
    // ⚠️ 前提：生产代码里**不得有跨文件共享的模块级可变状态**。
    //    已清理：mock/api（jobSeq）· doubao/index（sentSessions）的工厂级状态。
    //    有意保留（进程级资源 / 互斥，且不被 ≥2 个测试文件触达）：
    //    adapters/host/shared/env.gpuCache · media/faceDetect 单例 · lib/captureRegistry · core/usecases/sendQueue 批量闩 ·
    //    **lib/log 的级别闩（TD-16-108）**：进程级设置，`src/lib/tests/log.test.ts` 每例后 `resetLevel()` 复位。
    //    新增模块级可变状态前，先清理再依赖本开关。
    isolate: false,
  },
});
