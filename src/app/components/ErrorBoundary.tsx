/**
 * 错误边界组件
 * 
 * 功能：
 * - 捕获子组件错误
 * - 显示友好的错误界面
 * - 错误日志记录
 * - 自动恢复机制
 */

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertCircle, RefreshCw, Home } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  resetKeys?: Array<string | number>;
  FallbackComponent?: React.ComponentType<FallbackProps>;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  errorCount: number;
}

export interface FallbackProps {
  error: Error | null;
  errorInfo: ErrorInfo | null;
  resetError: () => void;
}

/**
 * 默认错误回退组件
 */
function DefaultFallback({ error, errorInfo, resetError }: FallbackProps) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-950 via-purple-950 to-slate-950 p-4">
      <div className="max-w-2xl w-full bg-slate-900/80 backdrop-blur-sm rounded-2xl border border-slate-700 p-8">
        <div className="flex items-center gap-4 mb-6">
          <div className="p-3 bg-red-500/20 rounded-full">
            <AlertCircle className="w-8 h-8 text-red-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white mb-1">
              哎呀，出错了！
            </h1>
            <p className="text-slate-400">
              应用遇到了一个意外错误
            </p>
          </div>
        </div>

        <div className="space-y-4 mb-6">
          <div className="bg-slate-800/50 rounded-lg p-4">
            <h3 className="text-sm font-semibold text-slate-300 mb-2">错误信息：</h3>
            <p className="text-sm text-red-400 font-mono">
              {error?.message || '未知错误'}
            </p>
          </div>

          {import.meta.env.DEV && errorInfo && (
            <details className="bg-slate-800/50 rounded-lg p-4">
              <summary className="text-sm font-semibold text-slate-300 cursor-pointer mb-2">
                详细堆栈信息（开发模式）
              </summary>
              <pre className="text-xs text-slate-400 overflow-x-auto mt-2">
                {errorInfo.componentStack}
              </pre>
            </details>
          )}
        </div>

        <div className="flex gap-3">
          <button
            onClick={resetError}
            className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-purple-600 hover:bg-purple-500 text-white rounded-lg font-medium transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            重试
          </button>
          <button
            onClick={() => window.location.href = '/'}
            className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-medium transition-colors"
          >
            <Home className="w-4 h-4" />
            返回首页
          </button>
        </div>

        <p className="text-xs text-slate-500 text-center mt-6">
          如果问题持续存在，请联系技术支持
        </p>
      </div>
    </div>
  );
}

/**
 * 错误边界组件
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      errorCount: 0,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // 记录错误
    console.error('[ErrorBoundary] Caught error:', error.message, errorInfo.componentStack?.slice(0, 200));

    // 更新状态
    this.setState((prevState) => ({
      errorInfo,
      errorCount: prevState.errorCount + 1,
    }));

    // 调用自定义错误处理
    this.props.onError?.(error, errorInfo);

    // 发送错误到监控服务（可选）
    this.logErrorToService(error, errorInfo);
  }

  componentDidUpdate(prevProps: Props) {
    // 当resetKeys改变时，重置错误状态
    if (
      this.state.hasError &&
      prevProps.resetKeys !== this.props.resetKeys
    ) {
      this.resetError();
    }
  }

  /**
   * 重置错误状态
   */
  resetError = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
  };

  /**
   * 发送错误到监控服务
   */
  logErrorToService(error: Error, errorInfo: ErrorInfo) {
    try {
      // 这里可以集成错误监控服务，如：Sentry, LogRocket等
      const errorData = {
        message: error.message,
        stack: error.stack,
        componentStack: errorInfo.componentStack,
        timestamp: new Date().toISOString(),
        userAgent: navigator.userAgent,
        url: window.location.href,
      };

      console.error('[ErrorBoundary] Error data:', JSON.stringify({ message: errorData.message, url: errorData.url }));

      // 示例：发送到后端
      // fetch('/api/log-error', {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify(errorData),
      // }).catch(console.error);
    } catch (loggingError) {
      // Failed to log, ignore
    }
  }

  render() {
    if (this.state.hasError) {
      // 使用自定义回退组件或默认组件
      const FallbackComponent = this.props.FallbackComponent || DefaultFallback;

      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <FallbackComponent
          error={this.state.error}
          errorInfo={this.state.errorInfo}
          resetError={this.resetError}
        />
      );
    }

    return this.props.children;
  }
}