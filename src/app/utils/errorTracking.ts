/**
 * 错误追踪和日志系统
 * 
 * 功能：
 * - 全局错误捕获
 * - 错误分类和统计
 * - 错误上报
 * - 错误恢复建议
 * - 日志管理
 */

// ==================== 类型定义 ====================

export type ErrorLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal';
export type ErrorCategory = 'network' | 'api' | 'ui' | 'data' | 'system' | 'unknown';

interface ErrorInfo {
  id: string;
  timestamp: number;
  level: ErrorLevel;
  category: ErrorCategory;
  message: string;
  stack?: string;
  context?: Record<string, any>;
  userAgent: string;
  url: string;
  count: number;
}

interface ErrorStats {
  total: number;
  byLevel: Record<ErrorLevel, number>;
  byCategory: Record<ErrorCategory, number>;
  recent: ErrorInfo[];
}

// ==================== 错误追踪器 ====================

class ErrorTracker {
  private errors: ErrorInfo[] = [];
  private maxErrors: number = 100;
  private errorCounts: Map<string, number> = new Map();
  private listeners: Set<(error: ErrorInfo) => void> = new Set();
  private reportEndpoint: string | null = null;

  constructor() {
    this.setupGlobalHandlers();
  }

  /**
   * 设置全局错误处理器
   */
  private setupGlobalHandlers() {
    // 捕获未处理的错误
    window.addEventListener('error', (event) => {
      this.captureError({
        level: 'error',
        category: 'system',
        message: event.message,
        stack: event.error?.stack,
        context: {
          filename: event.filename,
          lineno: event.lineno,
          colno: event.colno,
        },
      });
    });

    // 捕获未处理的Promise拒绝
    window.addEventListener('unhandledrejection', (event) => {
      this.captureError({
        level: 'error',
        category: 'system',
        message: `Unhandled Promise Rejection: ${event.reason}`,
        stack: event.reason?.stack,
        context: {
          reason: event.reason,
        },
      });
    });

    console.log('[ErrorTracker] Global error handlers installed');
  }

  /**
   * 捕获错误
   */
  captureError(options: {
    level: ErrorLevel;
    category: ErrorCategory;
    message: string;
    stack?: string;
    context?: Record<string, any>;
  }): string {
    const { level, category, message, stack, context } = options;

    // 生成错误ID（基于消息和堆栈）
    const errorKey = `${message}:${stack?.split('\n')[0] || ''}`;
    const existingCount = this.errorCounts.get(errorKey) || 0;
    this.errorCounts.set(errorKey, existingCount + 1);

    const errorInfo: ErrorInfo = {
      id: this.generateErrorId(),
      timestamp: Date.now(),
      level,
      category,
      message,
      stack,
      context,
      userAgent: navigator.userAgent,
      url: window.location.href,
      count: existingCount + 1,
    };

    // 添加到错误列表
    this.errors.unshift(errorInfo);
    
    // 限制错误列表大小
    if (this.errors.length > this.maxErrors) {
      this.errors = this.errors.slice(0, this.maxErrors);
    }

    // 控制台输出
    this.logToConsole(errorInfo);

    // 通知监听器
    this.notifyListeners(errorInfo);

    // 上报到服务器（如果配置了）
    if (this.reportEndpoint) {
      this.reportError(errorInfo);
    }

    return errorInfo.id;
  }

  /**
   * 生成错误ID
   */
  private generateErrorId(): string {
    return `err_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 输出到控制台
   */
  private logToConsole(error: ErrorInfo) {
    const emoji = this.getLevelEmoji(error.level);
    const timestamp = new Date(error.timestamp).toISOString();
    
    const logMethod = error.level === 'fatal' || error.level === 'error' 
      ? 'error' 
      : error.level === 'warn' 
      ? 'warn' 
      : 'log';

    console[logMethod](
      `${emoji} [${error.level.toUpperCase()}] [${error.category}] ${timestamp}`,
      '\n', error.message
    );

    if (error.stack && error.level !== 'info' && error.level !== 'debug') {
      console.groupCollapsed('Stack Trace');
      console.log(error.stack);
      console.groupEnd();
    }

    if (error.context && Object.keys(error.context).length > 0) {
      console.groupCollapsed('Context');
      console.log(error.context);
      console.groupEnd();
    }

    if (error.count > 1) {
      console.log(`↑ This error has occurred ${error.count} times`);
    }
  }

  /**
   * 获取级别对应的emoji
   */
  private getLevelEmoji(level: ErrorLevel): string {
    const emojis: Record<ErrorLevel, string> = {
      debug: '🔍',
      info: 'ℹ️',
      warn: '⚠️',
      error: '❌',
      fatal: '💀',
    };
    return emojis[level];
  }

  /**
   * 通知监听器
   */
  private notifyListeners(error: ErrorInfo) {
    this.listeners.forEach(listener => {
      try {
        listener(error);
      } catch (e) {
        console.error('[ErrorTracker] Listener error:', e);
      }
    });
  }

  /**
   * 上报错误到服务器
   */
  private async reportError(error: ErrorInfo) {
    if (!this.reportEndpoint) return;

    try {
      await fetch(this.reportEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(error),
      });
    } catch (e) {
      console.error('[ErrorTracker] Failed to report error:', e);
    }
  }

  /**
   * 添加错误监听器
   */
  addListener(listener: (error: ErrorInfo) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * 获取错误统计
   */
  getStats(): ErrorStats {
    const stats: ErrorStats = {
      total: this.errors.length,
      byLevel: {
        debug: 0,
        info: 0,
        warn: 0,
        error: 0,
        fatal: 0,
      },
      byCategory: {
        network: 0,
        api: 0,
        ui: 0,
        data: 0,
        system: 0,
        unknown: 0,
      },
      recent: this.errors.slice(0, 10),
    };

    this.errors.forEach(error => {
      stats.byLevel[error.level]++;
      stats.byCategory[error.category]++;
    });

    return stats;
  }

  /**
   * 获取所有错误
   */
  getAllErrors(): ErrorInfo[] {
    return [...this.errors];
  }

  /**
   * 清除错误
   */
  clearErrors() {
    this.errors = [];
    this.errorCounts.clear();
    console.log('[ErrorTracker] All errors cleared');
  }

  /**
   * 设置上报端点
   */
  setReportEndpoint(endpoint: string | null) {
    this.reportEndpoint = endpoint;
  }

  /**
   * 设置最大错误数
   */
  setMaxErrors(max: number) {
    this.maxErrors = max;
  }
}

// ==================== 日志管理器 ====================

class Logger {
  private prefix: string;
  private enabled: boolean = true;

  constructor(prefix: string = '') {
    this.prefix = prefix;
  }

  /**
   * Debug日志
   */
  debug(message: string, ...args: any[]) {
    if (!this.enabled || process.env.NODE_ENV === 'production') return;
    
    console.log(`🔍 [${this.prefix}] ${message}`, ...args);
    
    errorTracker.captureError({
      level: 'debug',
      category: 'system',
      message: `${this.prefix}: ${message}`,
      context: { args },
    });
  }

  /**
   * Info日志
   */
  info(message: string, ...args: any[]) {
    if (!this.enabled) return;
    
    console.log(`ℹ️ [${this.prefix}] ${message}`, ...args);
    
    errorTracker.captureError({
      level: 'info',
      category: 'system',
      message: `${this.prefix}: ${message}`,
      context: { args },
    });
  }

  /**
   * Warning日志
   */
  warn(message: string, ...args: any[]) {
    if (!this.enabled) return;
    
    console.warn(`⚠️ [${this.prefix}] ${message}`, ...args);
    
    errorTracker.captureError({
      level: 'warn',
      category: 'system',
      message: `${this.prefix}: ${message}`,
      context: { args },
    });
  }

  /**
   * Error日志
   */
  error(message: string, error?: Error, context?: Record<string, any>) {
    if (!this.enabled) return;
    
    console.error(`❌ [${this.prefix}] ${message}`, error, context);
    
    errorTracker.captureError({
      level: 'error',
      category: 'system',
      message: `${this.prefix}: ${message}`,
      stack: error?.stack,
      context: { ...context, error: error?.message },
    });
  }

  /**
   * Fatal日志
   */
  fatal(message: string, error?: Error, context?: Record<string, any>) {
    console.error(`💀 [${this.prefix}] FATAL: ${message}`, error, context);
    
    errorTracker.captureError({
      level: 'fatal',
      category: 'system',
      message: `${this.prefix}: ${message}`,
      stack: error?.stack,
      context: { ...context, error: error?.message },
    });
  }

  /**
   * 启用/禁用日志
   */
  setEnabled(enabled: boolean) {
    this.enabled = enabled;
  }

  /**
   * 创建子日志器
   */
  child(suffix: string): Logger {
    return new Logger(`${this.prefix}${suffix ? `:${suffix}` : ''}`);
  }
}

// ==================== 导出 ====================

export const errorTracker = new ErrorTracker();

/**
 * 创建日志器
 */
export function createLogger(prefix: string): Logger {
  return new Logger(prefix);
}

/**
 * 便捷函数：捕获网络错误
 */
export function captureNetworkError(message: string, context?: Record<string, any>) {
  return errorTracker.captureError({
    level: 'error',
    category: 'network',
    message,
    context,
  });
}

/**
 * 便捷函数：捕获API错误
 */
export function captureAPIError(message: string, context?: Record<string, any>) {
  return errorTracker.captureError({
    level: 'error',
    category: 'api',
    message,
    context,
  });
}

/**
 * 便捷函数：捕获UI错误
 */
export function captureUIError(message: string, context?: Record<string, any>) {
  return errorTracker.captureError({
    level: 'error',
    category: 'ui',
    message,
    context,
  });
}

/**
 * 便捷函数：捕获数据错误
 */
export function captureDataError(message: string, context?: Record<string, any>) {
  return errorTracker.captureError({
    level: 'error',
    category: 'data',
    message,
    context,
  });
}

/**
 * 获取错误统计
 */
export function getErrorStats(): ErrorStats {
  return errorTracker.getStats();
}

/**
 * 清除所有错误
 */
export function clearAllErrors() {
  errorTracker.clearErrors();
}

console.log('[ErrorTracking] ✅ Error tracking system loaded');
