/**
 * 全局错误边界（docs/11 §9.9）
 *
 * ⚠️ 错误边界**必须**是 class 组件 —— 这是 React 官方唯一的类组件例外。
 * ⚠️ 原则 6（错误透传）：捕获到的错误**原样展示**（含 stack），**不改写成"操作失败"**。
 */

import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  /** 出错的区域名（用于提示与日志） */
  area: string;
}

interface State {
  error: Error | null;
  info: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null, info: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // 原样记录，不做包装（原则 6）
    this.setState({ info });
    console.error(`[${this.props.area}] 渲染错误：`, error, info.componentStack);
  }

  private readonly reset = (): void => {
    this.setState({ error: null, info: null });
  };

  override render(): ReactNode {
    const { error, info } = this.state;
    if (!error) return this.props.children;

    return (
      <div style={{ padding: 24, fontFamily: 'var(--font-sans)' }}>
        <h2 style={{ margin: '0 0 8px', color: 'var(--color-danger)' }}>
          {this.props.area}渲染出错（已被错误边界捕获，未白屏）
        </h2>
        {/* ★ 原始错误原文，不改写 */}
        <pre
          style={{
            maxHeight: 240,
            overflow: 'auto',
            background: 'var(--color-surface-alt)',
            padding: 12,
            borderRadius: 'var(--radius-md)',
            fontSize: 'var(--font-size-sm)',
          }}
        >
          {error.message}
          {info?.componentStack ?? ''}
        </pre>
        <button type="button" onClick={this.reset}>
          重试渲染
        </button>
      </div>
    );
  }
}
