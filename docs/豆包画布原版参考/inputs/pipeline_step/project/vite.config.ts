import { defineConfig, transformWithEsbuild } from 'vite';

// 最小验证配置：只关心「还原出的源码能不能构建」
export default defineConfig({
  esbuild: { jsx: 'automatic' },
  base: './',
  plugins: [
    {
      // 混淆产物常把 JSX 写在 .js 里，强制按 jsx 解析
      name: 'force-jsx-for-js',
      enforce: 'pre',
      async transform(code, id) {
        if (id.endsWith('.js') && !id.includes('node_modules')) {
          return await transformWithEsbuild(code, id, { loader: 'jsx', jsx: 'automatic' });
        }
        return null;
      },
    },
  ],
  build: { outDir: 'dist', emptyOutDir: true, target: 'esnext', minify: false },
});
