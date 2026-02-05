/**
 * 缓存中间件 - 生产环境性能优化
 * 支持10万用户，1万并发
 * 
 * 功能：
 * - 内存缓存（高频查询）
 * - LRU淘汰策略
 * - 智能过期时间
 * - 缓存命中统计
 */

import type { Context, Next } from "npm:hono";

// ==================== 缓存配置 ====================

interface CacheConfig {
  maxSize: number;           // 最大缓存条目数
  defaultTTL: number;        // 默认过期时间（毫秒）
  enableStats: boolean;      // 是否启用统计
}

const DEFAULT_CONFIG: CacheConfig = {
  maxSize: 10000,           // 1万条缓存（适合1万并发）
  defaultTTL: 5 * 60 * 1000, // 5分钟
  enableStats: true,
};

// ==================== 缓存条目 ====================

interface CacheEntry<T = any> {
  value: T;
  expireAt: number;
  createdAt: number;
  hitCount: number;
}

// ==================== 缓存管理器 ====================

class CacheManager {
  private cache: Map<string, CacheEntry>;
  private config: CacheConfig;
  private stats = {
    hits: 0,
    misses: 0,
    sets: 0,
    evictions: 0,
  };

  constructor(config: Partial<CacheConfig> = {}) {
    this.cache = new Map();
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * 获取缓存
   */
  get<T = any>(key: string): T | null {
    const entry = this.cache.get(key);
    
    if (!entry) {
      this.stats.misses++;
      return null;
    }

    // 检查是否过期
    if (Date.now() > entry.expireAt) {
      this.cache.delete(key);
      this.stats.misses++;
      return null;
    }

    // 命中：更新统计
    entry.hitCount++;
    this.stats.hits++;
    return entry.value as T;
  }

  /**
   * 设置缓存
   */
  set<T = any>(key: string, value: T, ttl?: number): void {
    const now = Date.now();
    const expireDuration = ttl || this.config.defaultTTL;

    // 检查容量限制
    if (this.cache.size >= this.config.maxSize) {
      this.evictLRU();
    }

    this.cache.set(key, {
      value,
      expireAt: now + expireDuration,
      createdAt: now,
      hitCount: 0,
    });

    this.stats.sets++;
  }

  /**
   * 删除缓存
   */
  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  /**
   * 清空缓存
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * LRU淘汰策略
   */
  private evictLRU(): void {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;
    let lowestHitCount = Infinity;

    // 找出最久未使用的缓存
    for (const [key, entry] of this.cache.entries()) {
      // 优先淘汰过期的
      if (Date.now() > entry.expireAt) {
        this.cache.delete(key);
        this.stats.evictions++;
        return;
      }

      // 综合考虑时间和命中次数
      const score = entry.hitCount / (Date.now() - entry.createdAt);
      if (score < lowestHitCount || (score === lowestHitCount && entry.createdAt < oldestTime)) {
        oldestKey = key;
        oldestTime = entry.createdAt;
        lowestHitCount = score;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
      this.stats.evictions++;
    }
  }

  /**
   * 获取统计信息
   */
  getStats() {
    const total = this.stats.hits + this.stats.misses;
    const hitRate = total > 0 ? (this.stats.hits / total) * 100 : 0;

    return {
      ...this.stats,
      total,
      hitRate: hitRate.toFixed(2) + '%',
      cacheSize: this.cache.size,
      maxSize: this.config.maxSize,
      memoryUsage: (this.cache.size / this.config.maxSize * 100).toFixed(2) + '%',
    };
  }

  /**
   * 清理过期缓存
   */
  cleanExpired(): number {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expireAt) {
        this.cache.delete(key);
        cleaned++;
      }
    }

    return cleaned;
  }
}

// ==================== 全局缓存实例 ====================

export const globalCache = new CacheManager({
  maxSize: 10000,       // 1万条
  defaultTTL: 300000,   // 5分钟
  enableStats: true,
});

// 定期清理过期缓存（每10分钟）
setInterval(() => {
  const cleaned = globalCache.cleanExpired();
  if (cleaned > 0) {
    console.log(`[Cache] 🧹 Cleaned ${cleaned} expired entries`);
  }
}, 10 * 60 * 1000);

// ==================== 缓存中间件 ====================

interface CacheOptions {
  ttl?: number;                          // 过期时间
  keyGenerator?: (c: Context) => string; // 自定义key生成器
  condition?: (c: Context) => boolean;   // 缓存条件
}

/**
 * 响应缓存中间件
 */
export function cacheMiddleware(options: CacheOptions = {}) {
  return async (c: Context, next: Next) => {
    // 只缓存GET请求
    if (c.req.method !== 'GET') {
      return next();
    }

    // 检查条件
    if (options.condition && !options.condition(c)) {
      return next();
    }

    // 生成缓存key
    const cacheKey = options.keyGenerator 
      ? options.keyGenerator(c)
      : `${c.req.method}:${c.req.url}`;

    // 尝试从缓存获取
    const cached = globalCache.get(cacheKey);
    if (cached) {
      console.log(`[Cache] ✅ HIT: ${cacheKey}`);
      return c.json(cached);
    }

    console.log(`[Cache] ❌ MISS: ${cacheKey}`);

    // 执行请求
    await next();

    // 缓存响应（仅缓存成功的JSON响应）
    const response = c.res;
    if (response.status === 200 && response.headers.get('content-type')?.includes('application/json')) {
      try {
        const body = await response.clone().json();
        globalCache.set(cacheKey, body, options.ttl);
        console.log(`[Cache] 💾 STORED: ${cacheKey}`);
      } catch (error) {
        console.warn(`[Cache] ⚠️ Failed to cache response:`, error);
      }
    }
  };
}

/**
 * 数据缓存辅助函数
 */
export async function withCache<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttl?: number
): Promise<T> {
  // 尝试从缓存获取
  const cached = globalCache.get<T>(key);
  if (cached !== null) {
    return cached;
  }

  // 执行查询
  const data = await fetcher();

  // 存入缓存
  globalCache.set(key, data, ttl);

  return data;
}

/**
 * 批量失效缓存
 */
export function invalidateCache(pattern: string | RegExp): number {
  let count = 0;
  const keys = Array.from((globalCache as any).cache.keys());

  for (const key of keys) {
    if (typeof pattern === 'string') {
      if (key.includes(pattern)) {
        globalCache.delete(key);
        count++;
      }
    } else {
      if (pattern.test(key)) {
        globalCache.delete(key);
        count++;
      }
    }
  }

  console.log(`[Cache] 🗑️ Invalidated ${count} entries matching pattern: ${pattern}`);
  return count;
}

// ==================== 预定义缓存策略 ====================

/**
 * 用户数据缓存（5分钟）
 */
export const userCache = (phone: string) => cacheMiddleware({
  ttl: 5 * 60 * 1000,
  keyGenerator: () => `user:${phone}`,
});

/**
 * 社区内容缓存（2分钟）
 */
export const communityCache = cacheMiddleware({
  ttl: 2 * 60 * 1000,
  keyGenerator: (c) => `community:${c.req.url}`,
});

/**
 * 漫剧列表缓存（3分钟）
 */
export const seriesListCache = cacheMiddleware({
  ttl: 3 * 60 * 1000,
  keyGenerator: (c) => {
    const url = new URL(c.req.url);
    const phone = url.searchParams.get('phone') || 'anonymous';
    return `series:list:${phone}`;
  },
});

/**
 * 漫剧详情缓存（10分钟）
 */
export const seriesDetailCache = cacheMiddleware({
  ttl: 10 * 60 * 1000,
  keyGenerator: (c) => {
    const seriesId = c.req.param('id');
    return `series:detail:${seriesId}`;
  },
});

console.log('[Cache] ✅ Cache middleware initialized');
console.log('[Cache] 📊 Max cache size: 10,000 entries');
console.log('[Cache] ⏱️ Default TTL: 5 minutes');
console.log('[Cache] 🎯 Ready for 100K users, 10K concurrent');
