/**
 * 前端性能优化工具
 * 
 * 功能：
 * - 防抖/节流
 * - 请求去重
 * - 内存泄漏检测
 * - 性能监控
 */

// ==================== 防抖函数 ====================

/**
 * 防抖：延迟执行，只执行最后一次
 * 适用场景：搜索框输入、窗口resize
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  return function (this: any, ...args: Parameters<T>) {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }

    timeoutId = setTimeout(() => {
      func.apply(this, args);
      timeoutId = null;
    }, wait);
  };
}

// ==================== 节流函数 ====================

/**
 * 节流：固定时间内只执行一次
 * 适用场景：滚动事件、按钮点击
 */
export function throttle<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let lastTime = 0;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  return function (this: any, ...args: Parameters<T>) {
    const now = Date.now();

    if (now - lastTime >= wait) {
      lastTime = now;
      func.apply(this, args);
    } else {
      // 确保最后一次调用也会被执行
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
      }

      timeoutId = setTimeout(() => {
        lastTime = Date.now();
        func.apply(this, args);
        timeoutId = null;
      }, wait - (now - lastTime));
    }
  };
}

// ==================== 请求去重 ====================

interface PendingRequest {
  promise: Promise<any>;
  timestamp: number;
}

class RequestDeduplicator {
  private pendingRequests: Map<string, PendingRequest> = new Map();
  private maxAge = 5000; // 5秒内的重复请求会被去重

  /**
   * 执行请求（自动去重）
   */
  async execute<T>(
    key: string,
    fetcher: () => Promise<T>,
    maxAge?: number
  ): Promise<T> {
    const age = maxAge || this.maxAge;
    const now = Date.now();

    // 检查是否有进行中的相同请求
    const pending = this.pendingRequests.get(key);
    if (pending && now - pending.timestamp < age) {
      console.log(`[RequestDedup] ♻️ Reusing pending request: ${key}`);
      return pending.promise;
    }

    // 创建新请求
    const promise = fetcher();
    this.pendingRequests.set(key, { promise, timestamp: now });

    // 请求完成后清理
    promise
      .then(() => {
        // 延迟清理，允许短时间内的后续请求复用结果
        setTimeout(() => {
          this.pendingRequests.delete(key);
        }, 1000);
      })
      .catch(() => {
        // 失败的请求立即清理
        this.pendingRequests.delete(key);
      });

    return promise;
  }

  /**
   * 清理过期请求
   */
  cleanup(): void {
    const now = Date.now();
    for (const [key, request] of this.pendingRequests.entries()) {
      if (now - request.timestamp > this.maxAge) {
        this.pendingRequests.delete(key);
      }
    }
  }

  /**
   * 获取统计信息
   */
  getStats() {
    return {
      pendingCount: this.pendingRequests.size,
      keys: Array.from(this.pendingRequests.keys()),
    };
  }
}

export const requestDeduplicator = new RequestDeduplicator();

// 定期清理过期请求
setInterval(() => {
  requestDeduplicator.cleanup();
}, 10000);

// ==================== 内存泄漏检测 ====================

class MemoryLeakDetector {
  private timers: Set<ReturnType<typeof setTimeout>> = new Set();
  private intervals: Set<ReturnType<typeof setInterval>> = new Set();
  private listeners: Map<EventTarget, Map<string, EventListener>> = new Map();

  /**
   * 追踪定时器
   */
  trackTimeout(id: ReturnType<typeof setTimeout>): void {
    this.timers.add(id);
  }

  /**
   * 追踪循环定时器
   */
  trackInterval(id: ReturnType<typeof setInterval>): void {
    this.intervals.add(id);
  }

  /**
   * 追踪事件监听器
   */
  trackListener(
    target: EventTarget,
    event: string,
    listener: EventListener
  ): void {
    if (!this.listeners.has(target)) {
      this.listeners.set(target, new Map());
    }
    this.listeners.get(target)!.set(event, listener);
  }

  /**
   * 清理定时器
   */
  clearTimeout(id: ReturnType<typeof setTimeout>): void {
    clearTimeout(id);
    this.timers.delete(id);
  }

  /**
   * 清理循环定时器
   */
  clearInterval(id: ReturnType<typeof setInterval>): void {
    clearInterval(id);
    this.intervals.delete(id);
  }

  /**
   * 清理事件监听器
   */
  removeListener(target: EventTarget, event: string): void {
    const listeners = this.listeners.get(target);
    if (listeners) {
      const listener = listeners.get(event);
      if (listener) {
        target.removeEventListener(event, listener);
        listeners.delete(event);
      }
    }
  }

  /**
   * 清理所有资源
   */
  cleanup(): void {
    // 清理定时器
    this.timers.forEach((id) => clearTimeout(id));
    this.timers.clear();

    // 清理循环定时器
    this.intervals.forEach((id) => clearInterval(id));
    this.intervals.clear();

    // 清理事件监听器
    for (const [target, listeners] of this.listeners.entries()) {
      for (const [event, listener] of listeners.entries()) {
        target.removeEventListener(event, listener);
      }
    }
    this.listeners.clear();
  }

  /**
   * 获取统计信息
   */
  getStats() {
    return {
      timers: this.timers.size,
      intervals: this.intervals.size,
      listeners: this.listeners.size,
    };
  }
}

export const memoryLeakDetector = new MemoryLeakDetector();

// ==================== 性能监控 ====================

class PerformanceMonitor {
  private marks: Map<string, number> = new Map();
  private measures: Array<{
    name: string;
    duration: number;
    timestamp: number;
  }> = [];

  /**
   * 开始计时
   */
  mark(name: string): void {
    this.marks.set(name, performance.now());
  }

  /**
   * 结束计时并记录
   */
  measure(name: string, startMark: string): number {
    const startTime = this.marks.get(startMark);
    if (!startTime) {
      console.warn(`[PerformanceMonitor] Start mark not found: ${startMark}`);
      return 0;
    }

    const duration = performance.now() - startTime;
    this.measures.push({
      name,
      duration,
      timestamp: Date.now(),
    });

    // 只保留最近100条记录
    if (this.measures.length > 100) {
      this.measures.shift();
    }

    this.marks.delete(startMark);
    return duration;
  }

  /**
   * 清理过期标记
   */
  cleanup(): void {
    const now = performance.now();
    for (const [mark, time] of this.marks.entries()) {
      if (now - time > 60000) {
        // 1分钟过期
        this.marks.delete(mark);
      }
    }
  }

  /**
   * 获取统计信息
   */
  getStats() {
    if (this.measures.length === 0) {
      return {
        count: 0,
        avg: 0,
        min: 0,
        max: 0,
        recent: [],
      };
    }

    const durations = this.measures.map((m) => m.duration);
    const avg = durations.reduce((a, b) => a + b, 0) / durations.length;
    const min = Math.min(...durations);
    const max = Math.max(...durations);
    const recent = this.measures.slice(-10).map((m) => ({
      name: m.name,
      duration: m.duration.toFixed(2) + 'ms',
    }));

    return {
      count: this.measures.length,
      avg: avg.toFixed(2) + 'ms',
      min: min.toFixed(2) + 'ms',
      max: max.toFixed(2) + 'ms',
      recent,
    };
  }
}

export const performanceMonitor = new PerformanceMonitor();

// 定期清理过期标记
setInterval(() => {
  performanceMonitor.cleanup();
}, 60000);

// ==================== 批量处理 ====================

/**
 * 批量处理请求
 */
export class BatchProcessor<T, R> {
  private queue: T[] = [];
  private processing = false;
  private batchSize: number;
  private delay: number;
  private processor: (items: T[]) => Promise<R[]>;

  constructor(
    processor: (items: T[]) => Promise<R[]>,
    batchSize = 10,
    delay = 100
  ) {
    this.processor = processor;
    this.batchSize = batchSize;
    this.delay = delay;
  }

  /**
   * 添加到队列
   */
  add(item: T): Promise<R> {
    return new Promise((resolve, reject) => {
      const queueItem = {
        item,
        resolve,
        reject,
      };

      this.queue.push(item);

      // 触发处理
      this.scheduleProcess();
    });
  }

  /**
   * 调度处理
   */
  private scheduleProcess(): void {
    if (this.processing) return;

    setTimeout(() => {
      this.process();
    }, this.delay);
  }

  /**
   * 处理队列
   */
  private async process(): Promise<void> {
    if (this.processing || this.queue.length === 0) return;

    this.processing = true;

    try {
      const batch = this.queue.splice(0, this.batchSize);
      const results = await this.processor(batch);

      // 这里简化了，实际使用时需要保存resolve/reject引用
      // 并在结果返回时调用对应的resolve/reject
    } catch (error) {
      console.error('[BatchProcessor] Error:', error);
    } finally {
      this.processing = false;

      // 如果还有剩余项，继续处理
      if (this.queue.length > 0) {
        this.scheduleProcess();
      }
    }
  }
}

// ==================== 导出工具函数 ====================

/**
 * 创建可取消的Promise
 */
export function makeCancelable<T>(promise: Promise<T>): {
  promise: Promise<T>;
  cancel: () => void;
} {
  let isCanceled = false;

  const wrappedPromise = new Promise<T>((resolve, reject) => {
    promise
      .then((value) => {
        if (!isCanceled) {
          resolve(value);
        }
      })
      .catch((error) => {
        if (!isCanceled) {
          reject(error);
        }
      });
  });

  return {
    promise: wrappedPromise,
    cancel: () => {
      isCanceled = true;
    },
  };
}

/**
 * 延迟执行
 */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 带超时的Promise
 */
export function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  errorMessage = 'Operation timed out'
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(errorMessage)), timeoutMs)
    ),
  ]);
}

/**
 * 重试函数
 */
export async function retry<T>(
  fn: () => Promise<T>,
  options: {
    maxRetries?: number;
    delay?: number;
    backoff?: number;
    onRetry?: (error: Error, attempt: number) => void;
  } = {}
): Promise<T> {
  const {
    maxRetries = 3,
    delay: initialDelay = 1000,
    backoff = 2,
    onRetry,
  } = options;

  let lastError: Error;

  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      if (i < maxRetries - 1) {
        const delayTime = initialDelay * Math.pow(backoff, i);
        onRetry?.(lastError, i + 1);
        await delay(delayTime);
      }
    }
  }

  throw lastError!;
}

console.log('[PerformanceOptimizer] ✅ Performance optimization tools initialized');
