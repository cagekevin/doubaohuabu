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
  },
});
