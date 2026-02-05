/**
 * 统一API客户端
 * 所有API请求的统一入口
 */

import { getApiUrl } from '../constants/api';
import { publicAnonKey } from '/utils/supabase/info';

/**
 * 标准API响应接口
 */
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}

/**
 * API请求配置
 */
interface ApiRequestOptions extends RequestInit {
  timeout?: number;
  maxRetries?: number;
}

/**
 * 带重试的增强fetch - 与火山引擎API相同的强化机制
 * @param url 请求URL
 * @param options 请求选项
 * @param timeout 超时时间（毫秒），默认60秒
 * @param maxRetries 最大重试次数，默认2次
 */
async function fetchWithRetry(
  url: string,
  options: RequestInit,
  timeout: number = 60000,
  maxRetries: number = 2
): Promise<Response> {
  const retryDelays = [2000, 5000]; // 更短的延迟
  let lastError: Error | null = null;
  let consecutiveFailures = 0;

  // 只在第一次请求时打印详细日志
  const isFirstRequest = !url.includes('/status') && !url.includes('/poll');
  if (isFirstRequest) {
    console.log(`[API] 🚀 Request: ${url.substring(0, 100)}`);
  }

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      if (attempt > 0 && isFirstRequest) {
        console.log(`[API] 🔄 Retry ${attempt + 1}/${maxRetries}`);
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        console.log(`[API] ⏰ Request timeout after ${timeout}ms`);
        controller.abort(new Error(`Request timeout after ${timeout}ms`));
      }, timeout);

      try {
        const response = await fetch(url, {
          ...options,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);
        
        // 只在第一次成功时打印日志（轮询请求不打印）
        if (attempt === 0 && isFirstRequest) {
          console.log(`[API] ✅ Success (${response.status})`);
        }
        
        consecutiveFailures = 0;
        return response;
      } catch (fetchError: any) {
        clearTimeout(timeoutId);
        throw fetchError;
      }
    } catch (error: any) {
      lastError = error;
      consecutiveFailures++;

      // 检查错误类型
      const isAbortError = error.name === 'AbortError';
      const isNetworkError = error.name === 'TypeError' && error.message === 'Failed to fetch';

      if (isAbortError) {
        const timeoutError = new Error(`Request timeout (${timeout / 1000}s)`);
        timeoutError.name = 'TimeoutError';
        lastError = timeoutError;
      } else if (isNetworkError) {
        // 🔧 只在最后一次重试失败时记录网络错误，且不是轮询请求
        if (attempt === maxRetries - 1 && isFirstRequest) {
          console.warn(`[API] ❌ Network error after ${maxRetries} attempts`);
        }
        // 静默处理轮询请求的网络错误
      } else {
        // 其他错误只在第一次或最后一次记录
        if ((attempt === 0 || attempt === maxRetries - 1) && isFirstRequest) {
          console.warn(`[API] ⚠️ Error: ${error.message}`);
        }
      }

      // 如果不是最后一次重试，等待后重试
      if (attempt < maxRetries - 1) {
        const delay = retryDelays[attempt] || 5000;
        if (attempt === 0 && isFirstRequest) {
          console.log(`[API] ⏳ Waiting ${delay / 1000}s before retry...`);
        }
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  // 只在非轮询请求失败时记录最终失败
  if (consecutiveFailures >= maxRetries && isFirstRequest) {
    console.error(`[API] ❌ All ${maxRetries} attempts failed`);
  }
  throw lastError || new Error('Request failed');
}

/**
 * 执行API请求 - 增强版，使用与火山引擎API相同的超时和重试策略
 */
export async function apiRequest<T = any>(
  endpoint: string,
  options: ApiRequestOptions = {}
): Promise<ApiResponse<T>> {
  // 🔥 优化配置：30秒超时 + 3次重试（更合理的配置）
  const { timeout = 30000, maxRetries = 3, ...fetchOptions } = options;

  try {
    const url = endpoint.startsWith('http') ? endpoint : getApiUrl(endpoint);
    
    // 🔥 只在第一次请求时打印详细日志
    const isFirstRequest = !endpoint.includes('/status') && !endpoint.includes('/poll');
    if (isFirstRequest) {
      console.log(`[API] 📡 请求: ${options.method || 'GET'} ${endpoint}`, {
        timeout: `${timeout / 1000}秒`,
        maxRetries: `${maxRetries}次`,
        hasBody: !!fetchOptions.body,
      });
    }

    // 使用增强的fetchWithRetry
    const response = await fetchWithRetry(
      url,
      {
        ...fetchOptions,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${publicAnonKey}`,
          ...fetchOptions.headers,
        },
      },
      timeout,
      maxRetries
    );

    if (!response.ok) {
      const errorText = await response.text();
      if (isFirstRequest) {
        console.error(`[API] 请求失败 (${response.status}):`, errorText);
      }

      return {
        success: false,
        error: `HTTP ${response.status}: ${errorText || response.statusText}`,
      };
    }

    const data = await response.json();
    if (isFirstRequest) {
      console.log(`[API] ✅ 响应成功:`, endpoint);
    }

    // 🔧 如果响应体本身就包含success字段，直接返回它
    // 避免双层嵌套：{ success: true, data: { success: true, data: [...] } }
    if (typeof data === 'object' && data !== null && 'success' in data) {
      return data;
    }

    // 否则包装响应
    return {
      success: true,
      data,
    };
  } catch (error: any) {
    // 🔥 静默处理轮询请求的错误
    const isFirstRequest = !endpoint.includes('/status') && !endpoint.includes('/poll');
    
    // 🔥 对于系列详情请求，也静默处理（用户可能查看离线缓存）
    const isSeriesDetailRequest = endpoint.includes('/series/series-');
    
    if (isFirstRequest && !isSeriesDetailRequest) {
      console.error(`[API] ❌ 请求最终失败:`, {
        endpoint,
        error: error.message,
        name: error.name,
        timeout: `${timeout / 1000}秒`,
      });
    }

    if (error.name === 'TimeoutError') {
      return {
        success: false,
        error: error.message,
      };
    }

    // TypeError: Failed to fetch 通常意味着服务器不可达
    // 🔥 只在首次非系列详情请求时显示详细错误
    if (error.message === 'Failed to fetch' && isFirstRequest && !isSeriesDetailRequest) {
      console.error('❌ Edge Function未响应 - 可能原因：');
      console.error('   1. Edge Function还没有部署到Supabase');
      console.error('   2. Edge Function部署时名称不正确');
      console.error('   3. 网络连接问题');
      console.error('');
      console.error('📖 查看部署指南：DEPLOY_EDGE_FUNCTION.md');
      console.error('🧪 运行测试页面：打开 EDGE_FUNCTION_CHECK.html');
      console.error('');

      return {
        success: false,
        error: 'Edge Function未连接。请先部署Edge Function，查看 DEPLOY_EDGE_FUNCTION.md',
      };
    }

    // 🔥 对于系列详情请求，返回静默错误
    if (isSeriesDetailRequest) {
      return {
        success: false,
        error: 'offline', // 特殊错误码，表示离线状态
      };
    }

    return {
      success: false,
      error: error.message || '网络请求失败',
    };
  }
}

/**
 * GET 请求
 */
export async function apiGet<T = any>(endpoint: string, options?: ApiRequestOptions): Promise<ApiResponse<T>> {
  return apiRequest<T>(endpoint, {
    ...options,
    method: 'GET',
  });
}

/**
 * POST 请求
 */
export async function apiPost<T = any>(
  endpoint: string,
  data?: any,
  options?: ApiRequestOptions
): Promise<ApiResponse<T>> {
  return apiRequest<T>(endpoint, {
    ...options,
    method: 'POST',
    body: data ? JSON.stringify(data) : undefined,
  });
}

/**
 * PUT 请求
 */
export async function apiPut<T = any>(
  endpoint: string,
  data?: any,
  options?: ApiRequestOptions
): Promise<ApiResponse<T>> {
  return apiRequest<T>(endpoint, {
    ...options,
    method: 'PUT',
    body: data ? JSON.stringify(data) : undefined,
  });
}

/**
 * DELETE 请求
 */
export async function apiDelete<T = any>(
  endpoint: string,
  data?: any,
  options?: ApiRequestOptions
): Promise<ApiResponse<T>> {
  return apiRequest<T>(endpoint, {
    ...options,
    method: 'DELETE',
    body: data ? JSON.stringify(data) : undefined,
  });
}