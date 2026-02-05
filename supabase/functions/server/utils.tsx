// 工具函数模块

import type { Hono } from "npm:hono";

/**
 * 路由注册辅助函数 - 同时注册带函数名前缀和不带前缀的路由
 * 用于解决 Supabase Edge Functions 路径前缀问题
 */
export function createDualRouteRegistrar(app: Hono) {
  const FUNCTION_PREFIX = "/make-server-fc31472c";
  
  return (method: 'get' | 'post' | 'put' | 'delete', path: string, handler: any) => {
    // 注册不带前缀的路由
    (app as any)[method](path, handler);
    // 注册带函数名前缀的路由
    (app as any)[method](`${FUNCTION_PREFIX}${path}`, handler);
  };
}

/**
 * 创建带超时的AbortController和信号
 * @param timeoutMs 超时时间（毫秒），默认180秒（增加到3分钟）
 * @returns { signal, timeoutId } 返回信号和超时ID，用于清理
 */
export function createTimeoutSignal(timeoutMs: number = 180000): { signal: AbortSignal; timeoutId: number } {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort(new Error(`Request timeout after ${timeoutMs}ms`));
  }, timeoutMs);
  
  return {
    signal: controller.signal,
    timeoutId,
  };
}

/**
 * 带重试机制的fetch包装函数
 * @param url 请求URL
 * @param options fetch选项
 * @param timeoutMs 超时时间（毫秒），默认300秒（5分钟，适合跨境请求）
 * @param maxRetries 最大重试次数，默认5次
 * @param retryDelays 每次重试的延迟时间数组（毫秒）
 */
export async function fetchWithRetry(
  url: string,
  options: RequestInit = {},
  timeoutMs: number = 300000,
  maxRetries: number = 5,
  retryDelays: number[] = [3000, 5000, 10000, 15000, 20000]
): Promise<Response> {
  let lastError: Error | null = null;
  
  // 🔧 检测是否是跨境API调用（火山引擎中国区域）
  const isCrossRegionCall = url.includes('ark.cn-beijing.volces.com');
  if (isCrossRegionCall) {
    console.log(`[Fetch] 🌏 Cross-region API call detected`);
    // ⚙️ 新策略：首次尝试用短超时快速失败，如果成功则后续用长超时
    // 这样可以快速发现连接问题，避免浪费时间
    maxRetries = Math.min(maxRetries, 2); // 最多重试2次（共3次尝试）
    retryDelays = [2000, 5000]; // 2秒、5秒
    // ⏱️ 首次尝试用30秒超时（如果30秒都连不上，说明网络有严重问题）
    if (timeoutMs === 300000) {
      timeoutMs = 30000; // 30秒超时（快速失败）
    }
    console.log(`[Fetch] ⚙️ Quick-fail strategy: timeout=${timeoutMs/1000}s, retries=${maxRetries}, total=${timeoutMs * (maxRetries + 1) / 1000}s`);
  }
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[Fetch] 🌐 Attempt ${attempt}/${maxRetries} for ${url.substring(0, 60)}...`);
      const attemptStartTime = Date.now();
      
      const response = await fetchWithTimeout(url, options, timeoutMs);
      
      const attemptDuration = Date.now() - attemptStartTime;
      console.log(`[Fetch] ✅ Success on attempt ${attempt} (took ${attemptDuration}ms)`);
      return response;
    } catch (error: any) {
      lastError = error;
      
      // 判断是否是网络连接错误
      const isNetworkError = 
        error.message?.includes('Connection timed out') ||
        error.message?.includes('tcp connect error') ||
        error.message?.includes('ETIMEDOUT') ||
        error.message?.includes('ECONNREFUSED') ||
        error.message?.includes('ENOTFOUND') ||
        error.message?.includes('Network error') ||
        error.message?.includes('Request timeout') ||
        error.name === 'TimeoutError';
      
      // 🔍 增强TCP连接超时的识别
      const isTcpTimeout = 
        error.message?.includes('tcp connect error') ||
        error.message?.includes('Connection timed out (os error 110)') ||
        error.message?.includes('client error (Connect)');
      
      if (isTcpTimeout) {
        console.error(`[Fetch] ❌ Network error:`, {
          url: url.substring(0, 80) + '...',
          error: error.message,
          name: error.name,
          errorType: 'TCP_TIMEOUT',
        });
        
        // ⚠️ TCP超时时立即停止重试，避免消耗资源
        if (isCrossRegionCall) {
          console.error(`[Fetch] 🚫 TCP timeout on cross-region call - aborting retries to save resources`);
          const enhancedError = new Error(
            `TCP连接超时: 无法建立到火山引擎API的连接。Supabase Edge Function可能无法访问中国大陆的服务器。建议使用数据库缓存或手动刷新。原始错误: ${error.message}`
          );
          enhancedError.name = 'NetworkError';
          (enhancedError as any).isNetworkError = true;
          (enhancedError as any).originalError = error;
          throw enhancedError;
        }
      } else {
        console.error(`[Fetch] ❌ Attempt ${attempt}/${maxRetries} failed:`, {
          url: url.substring(0, 80) + '...',
          error: error.message,
          errorType: error.name,
          isNetworkError,
          willRetry: attempt < maxRetries && isNetworkError,
        });
      }
      
      // 如果不是网络错误，或者已经是最后一次尝试，直接抛出错误
      if (!isNetworkError || attempt === maxRetries) {
        console.error(`[Fetch] 🚫 All retry attempts exhausted or non-retryable error`);
        throw error;
      }
      
      // 使用配置的延迟时间，如果超出数组长度则使用最后一个值
      const delayIndex = Math.min(attempt - 1, retryDelays.length - 1);
      const waitTime = retryDelays[delayIndex];
      
      console.log(`[Fetch] ⏳ Waiting ${waitTime}ms before retry ${attempt + 1}...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  }
  
  // 如果所有重试都失败了
  throw lastError || new Error('All retry attempts failed');
}

/**
 * 带超时的fetch包装函数
 * @param url 请求URL
 * @param options fetch选项
 * @param timeoutMs 超时时间（毫秒），默认180秒（增加到3分钟）
 */
export async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs: number = 180000
): Promise<Response> {
  const { signal, timeoutId } = createTimeoutSignal(timeoutMs);
  
  try {
    // 🔍 添加DNS解析检查（仅记录，不阻塞请求）
    try {
      const urlObj = new URL(url);
      console.log(`[Fetch] 🌐 Connecting to: ${urlObj.hostname}`);
      console.log(`[Fetch] ⏱️  Timeout: ${timeoutMs}ms (${timeoutMs/1000}s)`);
    } catch (urlError) {
      console.warn('[Fetch] Failed to parse URL for logging:', url);
    }
    
    const response = await fetch(url, {
      ...options,
      signal,
    });
    clearTimeout(timeoutId);
    console.log(`[Fetch] ✅ Response received: ${response.status}`);
    return response;
  } catch (error: any) {
    clearTimeout(timeoutId);
    
    // 改进错误处理
    if (error.name === 'AbortError') {
      const timeoutError = new Error(`Request timeout after ${timeoutMs}ms: ${url}`);
      timeoutError.name = 'TimeoutError';
      console.error('[Fetch] ⏰ Timeout:', {
        url: url.substring(0, 100),
        timeout: `${timeoutMs}ms`,
        error: error.message
      });
      throw timeoutError;
    }
    
    // 🔍 详细的网络错误分析
    const errorMessage = error.message || '';
    const isTCPTimeout = errorMessage.includes('Connection timed out') || 
                         errorMessage.includes('os error 110');
    const isTCPRefused = errorMessage.includes('Connection refused') || 
                         errorMessage.includes('ECONNREFUSED');
    const isDNSError = errorMessage.includes('ENOTFOUND') || 
                       errorMessage.includes('getaddrinfo');
    const isSSLError = errorMessage.includes('SSL') || 
                       errorMessage.includes('certificate');
    
    console.error('[Fetch] ❌ Network error:', {
      url: url.substring(0, 100),
      error: errorMessage,
      name: error.name,
      errorType: isTCPTimeout ? 'TCP_TIMEOUT' : 
                 isTCPRefused ? 'TCP_REFUSED' : 
                 isDNSError ? 'DNS_ERROR' : 
                 isSSLError ? 'SSL_ERROR' : 'UNKNOWN',
    });
    
    // 🚨 针对TCP连接超时的特殊处理
    if (isTCPTimeout) {
      const enhancedError = new Error(
        `TCP连接超时: 无法建立到远程服务器的连接。` +
        `这可能是由于: 1) 网络防火墙限制 2) 服务器地理位置限制 3) DNS解析问题。` +
        `原始错误: ${errorMessage}`
      );
      enhancedError.name = 'NetworkError';
      throw enhancedError;
    }
    
    throw error;
  }
}

// 辅助函数：转换时间戳（支持Unix时间戳秒和ISO格式）
export function convertTimestamp(timestamp: any): string {
  if (!timestamp) return new Date().toISOString();
  
  // 如果是数字（Unix时间戳秒）
  if (typeof timestamp === 'number') {
    return new Date(timestamp * 1000).toISOString();
  }
  
  // 如果是字符串
  if (typeof timestamp === 'string') {
    // 检查是否是纯数字字符串（Unix时间戳秒）
    if (/^\d+$/.test(timestamp)) {
      return new Date(parseInt(timestamp) * 1000).toISOString();
    }
    // 否则假设是ISO格式或其他可解析格式
    return new Date(timestamp).toISOString();
  }
  
  return new Date().toISOString();
}