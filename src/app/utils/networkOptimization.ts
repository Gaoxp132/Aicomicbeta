/**
 * 网络请求优化工具
 * 
 * 功能：
 * - 请求拦截器和响应拦截器
 * - 自动重试机制
 * - 请求取消和超时控制
 * - 请求去重
 * - 离线检测和队列
 * - 请求优先级管理
 * - 错误统一处理
 */

// ==================== 类型定义 ====================

export interface RequestConfig extends RequestInit {
  timeout?: number;
  retries?: number;
  retryDelay?: number;
  priority?: 'low' | 'auto' | 'high';
  cancelable?: boolean;
  dedupe?: boolean;
  offlineQueue?: boolean;
}

interface RequestInterceptor {
  onRequest?: (url: string, config: RequestConfig) => Promise<{ url: string; config: RequestConfig }> | { url: string; config: RequestConfig };
  onResponse?: (response: Response) => Promise<Response> | Response;
  onError?: (error: Error) => Promise<Error> | Error;
}

interface QueuedRequest {
  url: string;
  config: RequestConfig;
  resolve: (value: any) => void;
  reject: (reason: any) => void;
  timestamp: number;
  priority: 'low' | 'auto' | 'high';
}

// ==================== 请求管理器 ====================

class NetworkManager {
  private interceptors: RequestInterceptor[] = [];
  private pendingRequests = new Map<string, AbortController>();
  private offlineQueue: QueuedRequest[] = [];
  private isOnline = navigator.onLine;
  private maxConcurrent = 6; // 最大并发请求数
  private activeRequests = 0;
  private requestQueue: QueuedRequest[] = [];

  constructor() {
    this.setupOnlineListener();
  }

  /**
   * 添加拦截器
   */
  addInterceptor(interceptor: RequestInterceptor): () => void {
    this.interceptors.push(interceptor);
    return () => {
      const index = this.interceptors.indexOf(interceptor);
      if (index > -1) {
        this.interceptors.splice(index, 1);
      }
    };
  }

  /**
   * 执行请求拦截器
   */
  private async runRequestInterceptors(
    url: string,
    config: RequestConfig
  ): Promise<{ url: string; config: RequestConfig }> {
    let currentUrl = url;
    let currentConfig = config;

    for (const interceptor of this.interceptors) {
      if (interceptor.onRequest) {
        const result = await interceptor.onRequest(currentUrl, currentConfig);
        currentUrl = result.url;
        currentConfig = result.config;
      }
    }

    return { url: currentUrl, config: currentConfig };
  }

  /**
   * 执行响应拦截器
   */
  private async runResponseInterceptors(response: Response): Promise<Response> {
    let currentResponse = response;

    for (const interceptor of this.interceptors) {
      if (interceptor.onResponse) {
        currentResponse = await interceptor.onResponse(currentResponse);
      }
    }

    return currentResponse;
  }

  /**
   * 执行错误拦截器
   */
  private async runErrorInterceptors(error: Error): Promise<Error> {
    let currentError = error;

    for (const interceptor of this.interceptors) {
      if (interceptor.onError) {
        currentError = await interceptor.onError(currentError);
      }
    }

    return currentError;
  }

  /**
   * 优化的fetch请求
   */
  async fetch(url: string, config: RequestConfig = {}): Promise<Response> {
    const {
      timeout = 60000, // 增加到60秒默认超时
      retries = 3,
      retryDelay = 1000,
      priority = 'auto',
      cancelable = true,
      dedupe = true,
      offlineQueue = true,
      ...fetchConfig
    } = config;

    // 检查是否离线
    if (!this.isOnline && offlineQueue) {
      return this.queueOfflineRequest(url, config);
    }

    // 请求去重（可选）
    if (dedupe) {
      const requestKey = this.getRequestKey(url, fetchConfig);
      if (this.pendingRequests.has(requestKey)) {
        console.log(`[Network] 🔄 Deduping request: ${url}`);
        // 返回正在进行的请求而不是抛出错误
        const controller = this.pendingRequests.get(requestKey);
        if (controller) {
          // 不抛出错误，而是等待现有请求完成
          return new Promise((resolve, reject) => {
            // 为现有请求创建一个等待队列
            const checkInterval = setInterval(() => {
              if (!this.pendingRequests.has(requestKey)) {
                clearInterval(checkInterval);
                // 重新执行请求（此时原始请求已完成）
                this.fetch(url, config).then(resolve).catch(reject);
              }
            }, 100);
            
            // 5秒超时
            setTimeout(() => {
              clearInterval(checkInterval);
              reject(new Error('Dedupe timeout'));
            }, 5000);
          });
        }
      }
    }

    // 执行请求拦截器
    const { url: finalUrl, config: finalConfig } = await this.runRequestInterceptors(url, {
      ...fetchConfig,
      timeout,
      retries,
      retryDelay,
      priority,
    });

    // 优先级队列控制
    if (this.activeRequests >= this.maxConcurrent) {
      return this.queueRequest(finalUrl, finalConfig, priority);
    }

    // 执行请求
    return this.executeRequest(finalUrl, finalConfig, retries, retryDelay, timeout, cancelable);
  }

  /**
   * 执行实际请求
   */
  private async executeRequest(
    url: string,
    config: RequestConfig,
    retries: number,
    retryDelay: number,
    timeout: number,
    cancelable: boolean
  ): Promise<Response> {
    this.activeRequests++;
    const requestKey = this.getRequestKey(url, config);
    const controller = new AbortController();

    if (cancelable) {
      this.pendingRequests.set(requestKey, controller);
    }

    // 超时控制
    const timeoutId = setTimeout(() => {
      console.log(`[Network] ⏰ Request timeout after ${timeout}ms: ${url}`);
      controller.abort(new Error(`Request timeout after ${timeout}ms`));
    }, timeout);

    try {
      const response = await fetch(url, {
        ...config,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // 执行响应拦截器
      const finalResponse = await this.runResponseInterceptors(response);

      // 如果响应失败且有重试次数，进行重试
      if (!finalResponse.ok && retries > 0) {
        console.warn(`[Network] ⚠️ Request failed, retrying... (${retries} retries left)`);
        await this.delay(retryDelay);
        return this.executeRequest(url, config, retries - 1, retryDelay * 2, timeout, cancelable);
      }

      return finalResponse;
    } catch (error) {
      clearTimeout(timeoutId);

      // 执行错误拦截器
      const finalError = await this.runErrorInterceptors(error as Error);

      // 超时错误重试
      if (error instanceof Error && error.name === 'AbortError' && retries > 0) {
        console.warn(`[Network] ⏱️ Request timeout, retrying... (${retries} retries left)`);
        await this.delay(retryDelay);
        return this.executeRequest(url, config, retries - 1, retryDelay * 2, timeout, cancelable);
      }

      throw finalError;
    } finally {
      this.activeRequests--;
      if (cancelable) {
        this.pendingRequests.delete(requestKey);
      }
      this.processQueue();
    }
  }

  /**
   * 取消请求
   */
  cancelRequest(url: string, config?: RequestConfig): void {
    const requestKey = this.getRequestKey(url, config || {});
    const controller = this.pendingRequests.get(requestKey);
    if (controller) {
      controller.abort();
      this.pendingRequests.delete(requestKey);
      console.log(`[Network] ❌ Request cancelled: ${url}`);
    }
  }

  /**
   * 取消所有请求
   */
  cancelAllRequests(): void {
    this.pendingRequests.forEach((controller, key) => {
      controller.abort();
      console.log(`[Network] ❌ Request cancelled: ${key}`);
    });
    this.pendingRequests.clear();
  }

  /**
   * 队列离线请求
   */
  private queueOfflineRequest(url: string, config: RequestConfig): Promise<Response> {
    console.log(`[Network] 📴 Queuing offline request: ${url}`);
    
    return new Promise((resolve, reject) => {
      this.offlineQueue.push({
        url,
        config,
        resolve,
        reject,
        timestamp: Date.now(),
        priority: config.priority || 'auto',
      });
    });
  }

  /**
   * 队列请求（并发控制）
   */
  private queueRequest(url: string, config: RequestConfig, priority: 'low' | 'auto' | 'high'): Promise<Response> {
    return new Promise((resolve, reject) => {
      this.requestQueue.push({
        url,
        config,
        resolve,
        reject,
        timestamp: Date.now(),
        priority,
      });
      // 按优先级排序
      this.requestQueue.sort((a, b) => {
        const priorityMap = { high: 3, auto: 2, low: 1 };
        return priorityMap[b.priority] - priorityMap[a.priority];
      });
    });
  }

  /**
   * 处理队列
   */
  private async processQueue(): Promise<void> {
    if (this.activeRequests >= this.maxConcurrent || this.requestQueue.length === 0) {
      return;
    }

    const request = this.requestQueue.shift();
    if (request) {
      try {
        const response = await this.executeRequest(
          request.url,
          request.config,
          request.config.retries || 3,
          request.config.retryDelay || 1000,
          request.config.timeout || 30000,
          request.config.cancelable !== false
        );
        request.resolve(response);
      } catch (error) {
        request.reject(error);
      }
    }
  }

  /**
   * 处理离线队列
   */
  private async processOfflineQueue(): Promise<void> {
    console.log(`[Network] 🌐 Processing ${this.offlineQueue.length} offline requests`);
    
    const queue = [...this.offlineQueue];
    this.offlineQueue = [];

    for (const request of queue) {
      try {
        const response = await this.fetch(request.url, request.config);
        request.resolve(response);
      } catch (error) {
        request.reject(error);
      }
    }
  }

  /**
   * 设置在线状态监听
   */
  private setupOnlineListener(): void {
    window.addEventListener('online', () => {
      console.log('[Network] 🌐 Back online');
      this.isOnline = true;
      this.processOfflineQueue();
    });

    window.addEventListener('offline', () => {
      console.log('[Network] 📴 Gone offline');
      this.isOnline = false;
    });
  }

  /**
   * 获取请求唯一键
   */
  private getRequestKey(url: string, config: RequestConfig): string {
    const method = config.method || 'GET';
    const body = config.body ? JSON.stringify(config.body) : '';
    return `${method}:${url}:${body}`;
  }

  /**
   * 延迟函数
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * 获取统计信息
   */
  getStats() {
    return {
      pendingRequests: this.pendingRequests.size,
      offlineQueue: this.offlineQueue.length,
      requestQueue: this.requestQueue.length,
      activeRequests: this.activeRequests,
      isOnline: this.isOnline,
    };
  }
}

// ==================== 单例实例 ====================

const networkManager = new NetworkManager();

// ==================== 导出函数 ====================

/**
 * 优化的fetch函数
 */
export async function optimizedFetch(url: string, config?: RequestConfig): Promise<Response> {
  return networkManager.fetch(url, config);
}

/**
 * 取消请求
 */
export function cancelRequest(url: string, config?: RequestConfig): void {
  networkManager.cancelRequest(url, config);
}

/**
 * 取消所有请求
 */
export function cancelAllRequests(): void {
  networkManager.cancelAllRequests();
}

/**
 * 添加拦截器
 */
export function addInterceptor(interceptor: RequestInterceptor): () => void {
  return networkManager.addInterceptor(interceptor);
}

/**
 * 获取网络统计
 */
export function getNetworkStats() {
  return networkManager.getStats();
}

// ==================== 预设拦截器 ====================

/**
 * 日志拦截器
 */
export const loggerInterceptor: RequestInterceptor = {
  onRequest: (url, config) => {
    console.log(`[Network] 📤 ${config.method || 'GET'} ${url}`);
    return { url, config };
  },
  onResponse: (response) => {
    console.log(`[Network] 📥 ${response.status} ${response.url}`);
    return response;
  },
  onError: (error) => {
    console.error(`[Network] ❌ ${error.message}`);
    return error;
  },
};

/**
 * 认证拦截器
 */
export function createAuthInterceptor(getToken: () => string | null): RequestInterceptor {
  return {
    onRequest: (url, config) => {
      const token = getToken();
      if (token) {
        config.headers = {
          ...config.headers,
          Authorization: `Bearer ${token}`,
        };
      }
      return { url, config };
    },
  };
}

/**
 * 错误重试拦截器
 */
export const retryInterceptor: RequestInterceptor = {
  onError: async (error) => {
    if (error.message.includes('timeout')) {
      console.log('[Network] ⏱️ Request timeout, will retry...');
    } else if (error.message.includes('Failed to fetch')) {
      console.log('[Network] 🌐 Network error, will retry...');
    }
    return error;
  },
};

/**
 * 性能监控拦截器
 */
export const performanceInterceptor: RequestInterceptor = {
  onRequest: (url, config) => {
    (config as any).__startTime = performance.now();
    return { url, config };
  },
  onResponse: (response) => {
    const startTime = (response as any).__startTime;
    if (startTime) {
      const duration = performance.now() - startTime;
      console.log(`[Network] ⏱️ Request took ${duration.toFixed(2)}ms`);
    }
    return response;
  },
};

// ==================== 工具函数 ====================

/**
 * 批量请求
 */
export async function batchRequest<T>(
  requests: Array<{ url: string; config?: RequestConfig }>,
  options: {
    concurrent?: number;
    onProgress?: (completed: number, total: number) => void;
  } = {}
): Promise<T[]> {
  const { concurrent = 3, onProgress } = options;
  const results: T[] = [];
  let completed = 0;

  for (let i = 0; i < requests.length; i += concurrent) {
    const batch = requests.slice(i, i + concurrent);
    const batchResults = await Promise.all(
      batch.map(async (req) => {
        const response = await optimizedFetch(req.url, req.config);
        const data = await response.json();
        completed++;
        onProgress?.(completed, requests.length);
        return data;
      })
    );
    results.push(...batchResults);
  }

  return results;
}

/**
 * 轮询请求
 */
export async function pollRequest<T>(
  url: string,
  options: {
    interval?: number;
    maxAttempts?: number;
    condition?: (data: T) => boolean;
    config?: RequestConfig;
  } = {}
): Promise<T> {
  const { interval = 2000, maxAttempts = 30, condition, config } = options;
  let attempts = 0;

  while (attempts < maxAttempts) {
    const response = await optimizedFetch(url, config);
    const data: T = await response.json();

    if (!condition || condition(data)) {
      return data;
    }

    attempts++;
    await new Promise((resolve) => setTimeout(resolve, interval));
  }

  throw new Error('Polling timeout: max attempts reached');
}

/**
 * 预加载资源
 */
export async function prefetchResource(url: string, config?: RequestConfig): Promise<void> {
  try {
    await optimizedFetch(url, { ...config, priority: 'low' });
    console.log(`[Network] ✅ Prefetched: ${url}`);
  } catch (error) {
    console.warn(`[Network] ⚠️ Prefetch failed: ${url}`, error);
  }
}

/**
 * 批量预加载
 */
export async function prefetchBatch(urls: string[], config?: RequestConfig): Promise<void> {
  await Promise.allSettled(urls.map((url) => prefetchResource(url, config)));
  console.log(`[Network] ✅ Prefetched ${urls.length} resources`);
}

console.log('[NetworkOptimization] ✅ Network optimization utilities initialized');