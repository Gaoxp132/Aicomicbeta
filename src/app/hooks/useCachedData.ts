/**
 * 智能数据缓存Hook
 * 避免频繁重复请求，只在必要时重新加载
 */

import { useState, useCallback, useRef, useEffect } from 'react';

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  version: number;
}

interface CacheOptions {
  /** 缓存有效期（毫秒），默认5分钟 */
  ttl?: number;
  /** 是否在组件挂载时自动加载，默认false */
  autoLoad?: boolean;
  /** 缓存键，用于区分不同的数据源 */
  cacheKey: string;
}

// 全局缓存存储
const globalCache = new Map<string, CacheEntry<any>>();

// 数据版本管理（用于手动失效缓存）
const dataVersions = new Map<string, number>();

/**
 * 使用缓存的数据Hook
 * @param fetchFn 数据获取函数
 * @param options 缓存选项
 */
export function useCachedData<T>(
  fetchFn: () => Promise<T>,
  options: CacheOptions
) {
  const { ttl = 5 * 60 * 1000, autoLoad = false, cacheKey } = options;
  
  const [data, setData] = useState<T | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  
  const isMountedRef = useRef(true);
  const isLoadingRef = useRef(false);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  /**
   * 检查缓存是否有效
   */
  const isCacheValid = useCallback(() => {
    const cached = globalCache.get(cacheKey);
    if (!cached) return false;

    const now = Date.now();
    const age = now - cached.timestamp;
    const currentVersion = dataVersions.get(cacheKey) || 0;

    // 检查是否过期或版本不匹配
    const isExpired = age > ttl;
    const isOutdated = cached.version !== currentVersion;

    if (isExpired || isOutdated) {
      console.log(`[useCachedData] Cache invalid for ${cacheKey}:`, {
        isExpired,
        isOutdated,
        age: `${(age / 1000).toFixed(1)}s`,
        ttl: `${(ttl / 1000).toFixed(1)}s`,
      });
      return false;
    }

    return true;
  }, [cacheKey, ttl]);

  /**
   * 从缓存加载数据
   */
  const loadFromCache = useCallback(() => {
    const cached = globalCache.get(cacheKey);
    if (cached && isCacheValid()) {
      console.log(`[useCachedData] ✅ Using cached data for ${cacheKey}`);
      setData(cached.data);
      setLastUpdated(cached.timestamp);
      return true;
    }
    return false;
  }, [cacheKey, isCacheValid]);

  /**
   * 加载数据（优先从缓存）
   */
  const load = useCallback(
    async (forceRefresh = false) => {
      // 防止重复加载
      if (isLoadingRef.current) {
        console.log(`[useCachedData] ⏸️ Already loading ${cacheKey}, skipping`);
        return;
      }

      // 如果不强制刷新，先尝试从缓存加载
      if (!forceRefresh && loadFromCache()) {
        return;
      }

      console.log(`[useCachedData] 🔄 Fetching fresh data for ${cacheKey}`, {
        forceRefresh,
      });

      isLoadingRef.current = true;
      setIsLoading(true);
      setError(null);

      try {
        const result = await fetchFn();

        if (!isMountedRef.current) {
          console.log(`[useCachedData] Component unmounted, discarding result for ${cacheKey}`);
          return;
        }

        const now = Date.now();
        const currentVersion = dataVersions.get(cacheKey) || 0;

        // 更新缓存
        globalCache.set(cacheKey, {
          data: result,
          timestamp: now,
          version: currentVersion,
        });

        setData(result);
        setLastUpdated(now);
        setError(null);

        console.log(`[useCachedData] ✅ Data loaded and cached for ${cacheKey}`);
      } catch (err: any) {
        console.error(`[useCachedData] ❌ Error loading ${cacheKey}:`, err);
        
        if (!isMountedRef.current) return;

        setError(err.message || '加载失败');
        
        // 如果加载失败，尝试使用过期的缓存
        const cached = globalCache.get(cacheKey);
        if (cached) {
          console.log(`[useCachedData] ⚠️ Using stale cache for ${cacheKey}`);
          setData(cached.data);
          setLastUpdated(cached.timestamp);
        }
      } finally {
        if (isMountedRef.current) {
          setIsLoading(false);
        }
        isLoadingRef.current = false;
      }
    },
    [cacheKey, fetchFn, loadFromCache]
  );

  /**
   * 刷新数据（强制重新加载）
   */
  const refresh = useCallback(() => {
    console.log(`[useCachedData] 🔄 Manual refresh for ${cacheKey}`);
    return load(true);
  }, [load, cacheKey]);

  /**
   * 清除缓存
   */
  const clearCache = useCallback(() => {
    console.log(`[useCachedData] 🗑️ Clearing cache for ${cacheKey}`);
    globalCache.delete(cacheKey);
    setData(null);
    setLastUpdated(null);
  }, [cacheKey]);

  /**
   * 手动更新数据（例如乐观更新）
   */
  const setDataManually = useCallback(
    (newData: T) => {
      const now = Date.now();
      const currentVersion = dataVersions.get(cacheKey) || 0;

      globalCache.set(cacheKey, {
        data: newData,
        timestamp: now,
        version: currentVersion,
      });

      setData(newData);
      setLastUpdated(now);
    },
    [cacheKey]
  );

  // 自动加载（仅在组件首次挂载且设置了autoLoad时）
  useEffect(() => {
    if (autoLoad) {
      load();
    }
  }, []); // 空依赖数组，只执行一次

  return {
    data,
    isLoading,
    error,
    lastUpdated,
    load,
    refresh,
    clearCache,
    setData: setDataManually,
    isCacheValid: isCacheValid(),
  };
}

/**
 * 手动使缓存失效（增加版本号）
 * 用于在数据更新后通知所有使用该缓存的组件重新加载
 */
export function invalidateCache(cacheKey: string) {
  console.log(`[useCachedData] 🔄 Invalidating cache for ${cacheKey}`);
  const currentVersion = dataVersions.get(cacheKey) || 0;
  dataVersions.set(cacheKey, currentVersion + 1);
}

/**
 * 清除所有缓存
 */
export function clearAllCache() {
  console.log('[useCachedData] 🗑️ Clearing all cache');
  globalCache.clear();
  dataVersions.clear();
}

/**
 * 获取缓存统计信息
 */
export function getCacheStats() {
  const stats = {
    totalEntries: globalCache.size,
    entries: [] as Array<{
      key: string;
      age: number;
      version: number;
    }>,
  };

  const now = Date.now();
  globalCache.forEach((entry, key) => {
    stats.entries.push({
      key,
      age: now - entry.timestamp,
      version: entry.version,
    });
  });

  return stats;
}
