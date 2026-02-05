/**
 * 优化的API客户端
 * 
 * 功能：
 * - 统一的API请求接口
 * - 自动使用networkOptimization的优化fetch
 * - 请求/响应拦截
 * - 错误处理
 * - 类型安全
 */

import { optimizedFetch } from './networkOptimization';
import { projectId, publicAnonKey } from '/utils/supabase/info';

// ==================== 类型定义 ====================

interface ApiClientConfig {
  baseUrl?: string;
  timeout?: number;
  retries?: number;
  headers?: Record<string, string>;
  priority?: 'low' | 'auto' | 'high';
  offlineQueue?: boolean;
}

interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

// ==================== 优化的API客户端类 ====================

class OptimizedApiClient {
  private config: ApiClientConfig;

  constructor(config: ApiClientConfig = {}) {
    this.config = {
      baseUrl: `https://${projectId}.supabase.co/functions/v1/make-server-fc31472c`,
      timeout: 120000, // 增加到120秒，支持视频合并、签名生成等耗时操作
      retries: 3,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${publicAnonKey}`,
      },
      priority: 'auto',
      offlineQueue: true,
      ...config,
    };
  }

  /**
   * GET请求
   */
  async get<T = any>(
    endpoint: string,
    options: Partial<ApiClientConfig> = {}
  ): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      method: 'GET',
      ...options,
    });
  }

  /**
   * POST请求
   */
  async post<T = any>(
    endpoint: string,
    data?: any,
    options: Partial<ApiClientConfig> = {}
  ): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
      ...options,
    });
  }

  /**
   * PUT请求
   */
  async put<T = any>(
    endpoint: string,
    data?: any,
    options: Partial<ApiClientConfig> = {}
  ): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      method: 'PUT',
      body: data ? JSON.stringify(data) : undefined,
      ...options,
    });
  }

  /**
   * DELETE请求
   */
  async delete<T = any>(
    endpoint: string,
    options: Partial<ApiClientConfig> = {}
  ): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      method: 'DELETE',
      ...options,
    });
  }

  /**
   * PATCH请求
   */
  async patch<T = any>(
    endpoint: string,
    data?: any,
    options: Partial<ApiClientConfig> = {}
  ): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      method: 'PATCH',
      body: data ? JSON.stringify(data) : undefined,
      ...options,
    });
  }

  /**
   * 核心请求方法
   */
  private async request<T = any>(
    endpoint: string,
    options: Partial<ApiClientConfig & RequestInit> = {}
  ): Promise<ApiResponse<T>> {
    const url = `${options.baseUrl || this.config.baseUrl}${endpoint}`;
    
    const mergedHeaders = {
      ...this.config.headers,
      ...options.headers,
    };

    const timeout = options.timeout || this.config.timeout;
    const retries = options.retries ?? this.config.retries;
    const priority = options.priority || this.config.priority;
    const offlineQueue = options.offlineQueue ?? this.config.offlineQueue;

    try {
      const response = await optimizedFetch(url, {
        ...options,
        headers: mergedHeaders,
        timeout,
        retries,
        priority,
        offlineQueue,
        dedupe: false, // 禁用去重，避免Duplicate request错误
      });

      if (!response.ok) {
        const errorText = await response.text();
        let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
        
        try {
          const errorJson = JSON.parse(errorText);
          errorMessage = errorJson.error || errorJson.message || errorMessage;
        } catch {
          errorMessage = errorText || errorMessage;
        }

        return {
          success: false,
          error: errorMessage,
        };
      }

      const contentType = response.headers.get('content-type');
      let data: T;

      if (contentType && contentType.includes('application/json')) {
        data = await response.json();
      } else {
        data = await response.text() as any;
      }

      return {
        success: true,
        data,
      };
    } catch (error) {
      // 静默处理Duplicate request错误
      if (error instanceof Error && error.message === 'Duplicate request') {
        console.log(`[OptimizedApiClient] Skipping duplicate request to ${endpoint}`);
        return {
          success: false,
          error: 'Duplicate request - skipped',
        };
      }
      
      console.error(`[OptimizedApiClient] Request error:`, error);
      
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * 设置基础URL
   */
  setBaseUrl(baseUrl: string): void {
    this.config.baseUrl = baseUrl;
  }

  /**
   * 设置默认headers
   */
  setHeaders(headers: Record<string, string>): void {
    this.config.headers = {
      ...this.config.headers,
      ...headers,
    };
  }

  /**
   * 设置认证token
   */
  setAuthToken(token: string): void {
    this.config.headers = {
      ...this.config.headers,
      'Authorization': `Bearer ${token}`,
    };
  }

  /**
   * 移除认证token
   */
  removeAuthToken(): void {
    if (this.config.headers) {
      delete this.config.headers['Authorization'];
    }
  }
}

// ==================== 导出实例 ====================

/**
 * 默认API客户端实例
 */
export const apiClient = new OptimizedApiClient();

/**
 * 社区API客户端实例
 */
export const communityApiClient = new OptimizedApiClient({
  baseUrl: `https://${projectId}.supabase.co/functions/v1/make-server-fc31472c`,
  timeout: 60000, // 增加到60秒
  retries: 2,
  priority: 'auto',
});

/**
 * 火山引擎API客户端实例
 */
export const volcengineApiClient = new OptimizedApiClient({
  baseUrl: `https://${projectId}.supabase.co/functions/v1/make-server-fc31472c`,
  timeout: 120000, // 2分钟
  retries: 3,
  priority: 'high',
});

/**
 * AI生成API客户端实例
 */
export const aiApiClient = new OptimizedApiClient({
  baseUrl: `https://${projectId}.supabase.co/functions/v1/make-server-fc31472c`,
  timeout: 60000, // 1分钟
  retries: 3,
  priority: 'high',
});

/**
 * 创建自定义API客户端
 */
export function createApiClient(config: ApiClientConfig): OptimizedApiClient {
  return new OptimizedApiClient(config);
}

// ==================== 工具函数 ====================

/**
 * 构建查询字符串
 */
export function buildQueryString(params: Record<string, any>): string {
  const searchParams = new URLSearchParams();
  
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      searchParams.append(key, String(value));
    }
  });

  const queryString = searchParams.toString();
  return queryString ? `?${queryString}` : '';
}

/**
 * 获取API URL
 */
export function getApiUrl(endpoint: string): string {
  return `https://${projectId}.supabase.co/functions/v1/make-server-fc31472c${endpoint}`;
}

/**
 * 获取默认headers
 */
export function getDefaultHeaders(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${publicAnonKey}`,
  };
}

// ==================== 类型导出 ====================

export type { ApiClientConfig, ApiResponse };

console.log('[OptimizedApiClient] ✅ Optimized API client loaded');