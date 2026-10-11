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
    //    hostEnv.gpuCache · media/faceDetect 单例 · lib/captureRegistry · core/usecases/sendQueue 批量闩。
    //    新增模块级可变状态前，先清理再依赖本开关。
    isolate: false,
  },
});
