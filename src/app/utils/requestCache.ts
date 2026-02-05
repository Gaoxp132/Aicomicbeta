/**
 * 请求缓存和去重工具
 * 
 * 功能：
 * 1. 防止重复请求
 * 2. 缓存API响应
 * 3. 自动失效过期缓存
 */

// 缓存存储
const cache = new Map<string, { data: any; timestamp: number; promise?: Promise<any> }>();

// 默认缓存时间（毫秒）
const DEFAULT_CACHE_TIME = 5 * 60 * 1000; // 5分钟

// 正在进行的请求（用于请求去重）
const pendingRequests = new Map<string, Promise<any>>();

/**
 * 生成缓存键
 */
function getCacheKey(url: string, params?: Record<string, any>): string {
  if (!params) return url;
  const sortedParams = Object.keys(params)
    .sort()
    .map(key => `${key}=${JSON.stringify(params[key])}`)
    .join('&');
  return `${url}?${sortedParams}`;
}

/**
 * 检查缓存是否有效
 */
function isCacheValid(timestamp: number, maxAge: number): boolean {
  return Date.now() - timestamp < maxAge;
}

/**
 * 带缓存的请求函数
 * 
 * @param url - 请求URL
 * @param options - fetch选项
 * @param cacheTime - 缓存时间（毫秒），0表示不缓存
 * @param params - 请求参数（用于生成缓存键）
 */
export async function cachedFetch<T = any>(
  url: string,
  options: RequestInit = {},
  cacheTime: number = DEFAULT_CACHE_TIME,
  params?: Record<string, any>
): Promise<T> {
  const cacheKey = getCacheKey(url, params);
  
  // 如果不需要缓存，直接请求
  if (cacheTime === 0) {
    const response = await fetch(url, options);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return response.json();
  }
  
  // 检查缓存
  const cached = cache.get(cacheKey);
  if (cached && isCacheValid(cached.timestamp, cacheTime)) {
    console.log(`[Cache] ✅ Hit: ${cacheKey}`);
    return cached.data;
  }
  
  // 检查是否有相同的请求正在进行（请求去重）
  const pending = pendingRequests.get(cacheKey);
  if (pending) {
    console.log(`[Cache] 🔄 Deduplicating request: ${cacheKey}`);
    return pending;
  }
  
  // 创建新请求
  console.log(`[Cache] 🌐 Fetching: ${cacheKey}`);
  const requestPromise = fetch(url, options)
    .then(async (response) => {
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      
      // 存入缓存
      cache.set(cacheKey, {
        data,
        timestamp: Date.now(),
      });
      
      // 移除pending标记
      pendingRequests.delete(cacheKey);
      
      return data;
    })
    .catch((error) => {
      // 请求失败也要移除pending标记
      pendingRequests.delete(cacheKey);
      throw error;
    });
  
  // 标记为pending
  pendingRequests.set(cacheKey, requestPromise);
  
  return requestPromise;
}

/**
 * 清除指定缓存
 */
export function clearCache(url: string, params?: Record<string, any>): void {
  const cacheKey = getCacheKey(url, params);
  cache.delete(cacheKey);
  console.log(`[Cache] 🗑️ Cleared: ${cacheKey}`);
}

/**
 * 清除所有缓存
 */
export function clearAllCache(): void {
  cache.clear();
  console.log('[Cache] 🗑️ Cleared all cache');
}

/**
 * 清除过期缓存
 */
export function clearExpiredCache(maxAge: number = DEFAULT_CACHE_TIME): number {
  let cleared = 0;
  const now = Date.now();
  
  for (const [key, value] of cache.entries()) {
    if (!isCacheValid(value.timestamp, maxAge)) {
      cache.delete(key);
      cleared++;
    }
  }
  
  if (cleared > 0) {
    console.log(`[Cache] 🗑️ Cleared ${cleared} expired entries`);
  }
  
  return cleared;
}

/**
 * 预加载数据到缓存
 */
export function prefetchCache<T = any>(
  url: string,
  options: RequestInit = {},
  params?: Record<string, any>
): Promise<T> {
  return cachedFetch<T>(url, options, DEFAULT_CACHE_TIME, params);
}

/**
 * 获取缓存统计
 */
export function getCacheStats() {
  return {
    size: cache.size,
    pendingRequests: pendingRequests.size,
    entries: Array.from(cache.keys()),
  };
}

// 定期清理过期缓存（每5分钟）
if (typeof window !== 'undefined') {
  setInterval(() => {
    clearExpiredCache();
  }, 5 * 60 * 1000);
}
