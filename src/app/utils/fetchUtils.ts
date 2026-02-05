/**
 * Fetch工具函数
 * 提供带重试、超时和错误处理的fetch功能
 */

/**
 * 测试后端连通性
 */
export async function testBackendConnection(baseUrl: string): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10秒超时
    
    const response = await fetch(`${baseUrl}/test`, {
      method: 'GET',
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);
    return response.ok;
  } catch (error) {
    // 减少日志噪音
    return false;
  }
}

/**
 * 带重试的fetch
 */
export async function fetchWithRetry(
  url: string, 
  options: RequestInit, 
  maxRetries: number = 3,
  retryDelay: number = 2000,
  timeout: number = 120000 // 默认120秒
): Promise<Response> {
  let lastError: Error | null = null;
  
  console.log(`[Fetch] 🚀 Starting request to ${url.substring(0, 80)}...`);
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      if (i > 0) {
        console.log(`[Fetch] 🔄 Retry ${i + 1}/${maxRetries}`);
      }
      
      // 创建超时控制器
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        console.log(`[Fetch] ⏰ Request timeout after ${timeout}ms`);
        controller.abort(new Error(`Request timeout after ${timeout}ms`));
      }, timeout);
      
      try {
        const response = await fetch(url, {
          ...options,
          signal: controller.signal,
        });
        
        clearTimeout(timeoutId);
        console.log(`[Fetch] ✅ Success (${response.status})`);
        return response;
      } catch (fetchError: any) {
        clearTimeout(timeoutId);
        throw fetchError;
      }
    } catch (error: any) {
      lastError = error;
      
      // 检查错误类型
      const isAbortError = error.name === 'AbortError';
      const isNetworkError = error.name === 'TypeError' && error.message === 'Failed to fetch';
      
      if (isAbortError) {
        console.warn(`[Fetch] ⏰ Request timeout after ${timeout / 1000}s`);
        lastError = new Error(`Request timeout (${timeout/1000}s), server may be starting up`);
        lastError.name = 'TimeoutError';
      } else if (isNetworkError) {
        // 只在最后一次重试时打印错误
        if (i === maxRetries - 1) {
          console.warn('[Fetch] 🔌 Network error - cannot reach server');
        }
      } else {
        console.warn(`[Fetch] ⚠️ Error: ${error.message}`);
      }
      
      // 如果不是最后一次重试，等待后重试
      if (i < maxRetries - 1) {
        const delay = retryDelay * (i + 1); // 递增延迟
        console.log(`[Fetch] ⏳ Waiting ${delay}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  throw lastError || new Error('All fetch attempts failed');
}

/**
 * 健壮的API调用封装
 */
export async function robustFetch(
  url: string,
  options: RequestInit,
  config?: {
    maxRetries?: number;
    retryDelay?: number;
    timeout?: number;
    testEndpoint?: string;
  }
): Promise<Response> {
  const {
    maxRetries = 3,
    retryDelay = 2000,
    timeout = 120000, // 默认120秒
    testEndpoint,
  } = config || {};
  
  try {
    return await fetchWithRetry(url, options, maxRetries, retryDelay, timeout);
  } catch (error: any) {
    console.error('[Robust Fetch] All attempts failed:', error.message);
    
    // 如果是超时错误，直接抛出友好的错误信息
    if (error.name === 'TimeoutError') {
      throw error;
    }
    
    // 如果是网络错误且提供了测试端点，测试后端连通性
    if (error.name === 'TypeError' && error.message === 'Failed to fetch' && testEndpoint) {
      const isBackendAvailable = await testBackendConnection(testEndpoint);
      
      if (!isBackendAvailable) {
        const networkError = new Error('Backend service temporarily unavailable, please try again later');
        networkError.name = 'NetworkError';
        throw networkError;
      }
      
      const networkError = new Error('Network connection failed, please check your network settings');
      networkError.name = 'NetworkError';
      throw networkError;
    }
    
    throw error;
  }
}