/**
 * 入口（docs/11 §二 bootstrap）
 *
 * ⚠️ 机器强制（docs/11 §9.1）：**必须**用 `<StrictMode>` 包裹
 *    —— 官方原话 "We strongly recommend using Strict Mode alongside React's ESLint plugin"
 *    —— 它会**双调用**渲染与 Effect，暴露副作用 bug（本项目大量轮询/订阅/持久化）
 */

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

// 样式加载顺序（docs/11 §2.1）：官方 → SSOT → 主题
import '@xyflow/react/dist/style.css';
import '@/styles/tokens.css';
import '@/styles/reset.css';
import '@/styles/theme.css';

import { createContainer } from './container';
import { StoreProvider, useStore } from '@/state';
import { AppShell } from '@/ui/shell/AppShell';
import { ErrorBoundary } from '@/ui/shell/ErrorBoundary';
import { StartPage } from '@/ui/pages/StartPage';
import { CanvasHost } from '@/ui/canvas/CanvasHost';

/** 根组件：按 `started` 切换启动页 / 画布外壳 */
function Root() {
  const started = useStore((s) => s.started);

  if (!started) {
    return <StartPage />;
  }

  return <AppShell canvas={<CanvasHost />} />;
}

const container = createContainer();

// 启动加载 + 5 条迁移（M1）；迁移日志原样打印，不吞（原则 6）
const hydrated = container.hydrate();
if (hydrated.notes.length > 0) console.info('[hydrate]', hydrated.notes.join('\n'));

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('#root 不存在');

createRoot(rootEl).render(
  <StrictMode>
    {/* 全局错误边界（docs/11 §9.9 的第一级） */}
    <ErrorBoundary area="应用">
      <StoreProvider store={container.store} gen={container.gen}>
        <Root />
      </StoreProvider>
    </ErrorBoundary>
  </StrictMode>,
);
