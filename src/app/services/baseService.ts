/**
 * 基础服务类
 * 
 * 为所有服务提供统一的API调用接口
 * 自动集成：
 * - 网络优化
 * - 错误处理
 * - 日志记录
 * - 类型安全
 */

import { apiClient, volcengineApiClient, aiApiClient, communityApiClient } from '@/app/utils/optimizedApiClient';
import type { ApiResponse } from '@/app/utils/optimizedApiClient';

// ==================== 基础服务配置 ====================

interface ServiceConfig {
  baseUrl?: string;
  timeout?: number;
  retries?: number;
  logRequests?: boolean;
  logResponses?: boolean;
}

// ==================== 基础服务类 ====================

export class BaseService {
  protected config: ServiceConfig;
  protected apiClient = apiClient;

  constructor(config: ServiceConfig = {}) {
    this.config = {
      logRequests: true,
      logResponses: true,
      ...config,
    };
  }

  /**
   * 发送GET请求
   */
  protected async get<T = any>(
    endpoint: string,
    options: {
      params?: Record<string, any>;
      timeout?: number;
      priority?: 'low' | 'auto' | 'high';
    } = {}
  ): Promise<ApiResponse<T>> {
    const { params, ...otherOptions } = options;
    
    // 构建查询字符串
    let url = endpoint;
    if (params) {
      const queryString = new URLSearchParams(
        Object.entries(params).reduce((acc, [key, value]) => {
          if (value !== undefined && value !== null) {
            acc[key] = String(value);
          }
          return acc;
        }, {} as Record<string, string>)
      ).toString();
      url = queryString ? `${endpoint}?${queryString}` : endpoint;
    }

    if (this.config.logRequests) {
      console.log(`[${this.constructor.name}] GET ${url}`);
    }

    const result = await this.apiClient.get<T>(url, otherOptions);

    if (this.config.logResponses) {
      console.log(`[${this.constructor.name}] Response:`, result.success ? '✅' : '❌');
    }

    return result;
  }

  /**
   * 发送POST请求
   */
  protected async post<T = any>(
    endpoint: string,
    data?: any,
    options: {
      timeout?: number;
      priority?: 'low' | 'auto' | 'high';
    } = {}
  ): Promise<ApiResponse<T>> {
    if (this.config.logRequests) {
      console.log(`[${this.constructor.name}] POST ${endpoint}`, data);
    }

    const result = await this.apiClient.post<T>(endpoint, data, options);

    if (this.config.logResponses) {
      console.log(`[${this.constructor.name}] Response:`, result.success ? '✅' : '❌');
    }

    return result;
  }

  /**
   * 发送PUT请求
   */
  protected async put<T = any>(
    endpoint: string,
    data?: any,
    options: {
      timeout?: number;
      priority?: 'low' | 'auto' | 'high';
    } = {}
  ): Promise<ApiResponse<T>> {
    if (this.config.logRequests) {
      console.log(`[${this.constructor.name}] PUT ${endpoint}`, data);
    }

    const result = await this.apiClient.put<T>(endpoint, data, options);

    if (this.config.logResponses) {
      console.log(`[${this.constructor.name}] Response:`, result.success ? '✅' : '❌');
    }

    return result;
  }

  /**
   * 发送DELETE请求
   */
  protected async delete<T = any>(
    endpoint: string,
    options: {
      timeout?: number;
      priority?: 'low' | 'auto' | 'high';
    } = {}
  ): Promise<ApiResponse<T>> {
    if (this.config.logRequests) {
      console.log(`[${this.constructor.name}] DELETE ${endpoint}`);
    }

    const result = await this.apiClient.delete<T>(endpoint, options);

    if (this.config.logResponses) {
      console.log(`[${this.constructor.name}] Response:`, result.success ? '✅' : '❌');
    }

    return result;
  }

  /**
   * 处理错误响应
   */
  protected handleError(error: any, context: string): never {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[${this.constructor.name}] Error in ${context}:`, message);
    throw new Error(`${context} failed: ${message}`);
  }

  /**
   * 确保响应成功
   */
  protected ensureSuccess<T>(result: ApiResponse<T>, context: string): T {
    if (!result.success) {
      throw new Error(`${context} failed: ${result.error || 'Unknown error'}`);
    }
    return result.data as T;
  }
}

// ==================== 专用服务基类 ====================

/**
 * 火山引擎服务基类
 */
export class VolcengineService extends BaseService {
  constructor() {
    super({
      timeout: 120000, // 2分钟
      logRequests: true,
      logResponses: true,
    });
    this.apiClient = volcengineApiClient;
  }
}

/**
 * AI生成服务基类
 */
export class AIService extends BaseService {
  constructor() {
    super({
      timeout: 60000, // 1分钟
      logRequests: true,
      logResponses: true,
    });
    this.apiClient = aiApiClient;
  }
}

/**
 * 社区服务基类
 */
export class CommunityService extends BaseService {
  constructor() {
    super({
      timeout: 30000, // 30秒
      logRequests: true,
      logResponses: true,
    });
    this.apiClient = communityApiClient;
  }
}

// ==================== 工具函数 ====================

/**
 * 创建取消token
 */
export function createCancelToken() {
  const controller = new AbortController();
  return {
    signal: controller.signal,
    cancel: () => controller.abort(),
  };
}

/**
 * 延迟执行
 */
export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 轮询直到条件满足
 */
export async function pollUntil<T>(
  fn: () => Promise<T>,
  condition: (data: T) => boolean,
  options: {
    interval?: number;
    maxAttempts?: number;
    timeout?: number;
  } = {}
): Promise<T> {
  const {
    interval = 2000,
    maxAttempts = 30,
    timeout = 60000,
  } = options;

  const startTime = Date.now();
  let attempts = 0;

  while (attempts < maxAttempts) {
    // 检查超时
    if (Date.now() - startTime > timeout) {
      throw new Error('Poll timeout exceeded');
    }

    const data = await fn();
    
    if (condition(data)) {
      return data;
    }

    attempts++;
    await delay(interval);
  }

  throw new Error('Max poll attempts exceeded');
}

/**
 * 批量请求（带并发控制）
 */
export async function batchRequest<T, R>(
  items: T[],
  handler: (item: T) => Promise<R>,
  options: {
    concurrent?: number;
    onProgress?: (completed: number, total: number) => void;
  } = {}
): Promise<R[]> {
  const { concurrent = 3, onProgress } = options;
  const results: R[] = [];
  const total = items.length;
  let completed = 0;

  // 分批处理
  for (let i = 0; i < items.length; i += concurrent) {
    const batch = items.slice(i, i + concurrent);
    const batchResults = await Promise.all(
      batch.map(item => handler(item))
    );
    results.push(...batchResults);
    
    completed += batch.length;
    if (onProgress) {
      onProgress(completed, total);
    }
  }

  return results;
}

/**
 * 重试包装器
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: {
    retries?: number;
    delay?: number;
    shouldRetry?: (error: any) => boolean;
  } = {}
): Promise<T> {
  const {
    retries = 3,
    delay: retryDelay = 1000,
    shouldRetry = () => true,
  } = options;

  let lastError: any;

  for (let i = 0; i <= retries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      
      if (i < retries && shouldRetry(error)) {
        await delay(retryDelay * (i + 1)); // 指数退避
        continue;
      }
      
      throw error;
    }
  }

  throw lastError;
}

console.log('[BaseService] ✅ Base service classes loaded');