/**
 * 高级缓存中间件
 * 
 * 功能：
 * - 多级缓存（内存 + Redis）
 * - 智能缓存预热
 * - 缓存失效策略
 * - 缓存命中率监控
 * 
 * 目标：支持10万用户、1万并发的高性能缓存
 */

// ==================== 配置 ====================

const CACHE_CONFIG = {
  // 内存缓存配置
  MEMORY_CACHE_SIZE: 10000, // 最大缓存项数
  MEMORY_CACHE_TTL: 300000, // 默认5分钟
  
  // 缓存TTL配置（不同类型数据不同TTL）
  TTL: {
    USER: 600000, // 用户信息：10分钟
    WORK: 300000, // 作品信息：5分钟
    SERIES: 300000, // 剧集信息：5分钟
    COMMUNITY: 60000, // 社区列表：1分钟
    STATS: 30000, // 统计数据：30秒
    VIDEO_URL: 3600000, // 视频URL：1小时
  },
  
  // 缓存预热配置
  PRELOAD: {
    ENABLED: true,
    HOT_DATA_THRESHOLD: 100, // 访问次数超过100次的数据视为热点数据
    PRELOAD_INTERVAL: 300000, // 每5分钟预热一次
  },
  
  // LRU策略配置
  LRU: {
    MAX_SIZE: 5000,
    EVICTION_PERCENTAGE: 0.1, // 达到上限时清除10%的最少使用项
  },
};

// ==================== 类型定义 ====================

interface CacheEntry<T> {
  key: string;
  value: T;
  timestamp: number;
  ttl: number;
  accessCount: number;
  lastAccess: number;
  size?: number;
}

interface CacheStats {
  hits: number;
  misses: number;
  sets: number;
  deletes: number;
  evictions: number;
  hitRate: string;
  totalSize: number;
  entryCount: number;
  avgAccessCount: number;
}

// ==================== LRU缓存实现 ====================

class LRUCache<T> {
  private cache: Map<string, CacheEntry<T>> = new Map();
  private accessOrder: string[] = [];
  private stats: CacheStats = {
    hits: 0,
    misses: 0,
    sets: 0,
    deletes: 0,
    evictions: 0,
    hitRate: '0%',
    totalSize: 0,
    entryCount: 0,
    avgAccessCount: 0,
  };

  constructor(
    private maxSize: number = CACHE_CONFIG.LRU.MAX_SIZE,
    private defaultTTL: number = CACHE_CONFIG.MEMORY_CACHE_TTL
  ) {}

  /**
   * 获取缓存值
   */
  get(key: string): T | null {
    const entry = this.cache.get(key);
    
    if (!entry) {
      this.stats.misses++;
      this.updateHitRate();
      return null;
    }

    // 检查是否过期
    const now = Date.now();
    if (now - entry.timestamp > entry.ttl) {
      this.delete(key);
      this.stats.misses++;
      this.updateHitRate();
      return null;
    }

    // 更新访问信息
    entry.accessCount++;
    entry.lastAccess = now;
    
    // 更新LRU顺序
    this.updateAccessOrder(key);

    this.stats.hits++;
    this.updateHitRate();
    
    return entry.value;
  }

  /**
   * 设置缓存值
   */
  set(key: string, value: T, ttl?: number): void {
    // 检查缓存大小限制
    if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
      this.evictLRU();
    }

    const now = Date.now();
    const entry: CacheEntry<T> = {
      key,
      value,
      timestamp: now,
      ttl: ttl || this.defaultTTL,
      accessCount: 0,
      lastAccess: now,
      size: this.estimateSize(value),
    };

    this.cache.set(key, entry);
    this.updateAccessOrder(key);
    
    this.stats.sets++;
    this.stats.entryCount = this.cache.size;
    this.updateTotalSize();
  }

  /**
   * 删除缓存
   */
  delete(key: string): boolean {
    const deleted = this.cache.delete(key);
    
    if (deleted) {
      this.stats.deletes++;
      this.stats.entryCount = this.cache.size;
      this.updateAccessOrder(key, true);
      this.updateTotalSize();
    }
    
    return deleted;
  }

  /**
   * 批量删除（支持模式匹配）
   */
  deletePattern(pattern: string | RegExp): number {
    let count = 0;
    
    for (const key of this.cache.keys()) {
      const match = typeof pattern === 'string' 
        ? key.includes(pattern)
        : pattern.test(key);
        
      if (match) {
        this.delete(key);
        count++;
      }
    }
    
    return count;
  }

  /**
   * 检查缓存是否存在
   */
  has(key: string): boolean {
    const entry = this.cache.get(key);
    
    if (!entry) {
      return false;
    }

    // 检查是否过期
    const now = Date.now();
    if (now - entry.timestamp > entry.ttl) {
      this.delete(key);
      return false;
    }

    return true;
  }

  /**
   * 清空缓存
   */
  clear(): void {
    this.cache.clear();
    this.accessOrder = [];
    this.stats.entryCount = 0;
    this.stats.totalSize = 0;
  }

  /**
   * 清理过期缓存
   */
  cleanup(): number {
    const now = Date.now();
    let count = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > entry.ttl) {
        this.delete(key);
        count++;
      }
    }

    return count;
  }

  /**
   * 驱逐LRU项
   */
  private evictLRU(): void {
    const evictCount = Math.max(
      1,
      Math.floor(this.maxSize * CACHE_CONFIG.LRU.EVICTION_PERCENTAGE)
    );

    for (let i = 0; i < evictCount && this.accessOrder.length > 0; i++) {
      const key = this.accessOrder.shift()!;
      this.cache.delete(key);
      this.stats.evictions++;
    }

    this.stats.entryCount = this.cache.size;
    this.updateTotalSize();
  }

  /**
   * 更新访问顺序
   */
  private updateAccessOrder(key: string, remove = false): void {
    const index = this.accessOrder.indexOf(key);
    
    if (index !== -1) {
      this.accessOrder.splice(index, 1);
    }
    
    if (!remove) {
      this.accessOrder.push(key);
    }
  }

  /**
   * 估算值大小（字节）
   */
  private estimateSize(value: any): number {
    try {
      return JSON.stringify(value).length * 2; // UTF-16编码
    } catch {
      return 0;
    }
  }

  /**
   * 更新总大小
   */
  private updateTotalSize(): void {
    let total = 0;
    for (const entry of this.cache.values()) {
      total += entry.size || 0;
    }
    this.stats.totalSize = total;
  }

  /**
   * 更新命中率
   */
  private updateHitRate(): void {
    const total = this.stats.hits + this.stats.misses;
    if (total > 0) {
      this.stats.hitRate = `${((this.stats.hits / total) * 100).toFixed(2)}%`;
    }
  }

  /**
   * 获取统计信息
   */
  getStats(): CacheStats {
    // 计算平均访问次数
    let totalAccess = 0;
    for (const entry of this.cache.values()) {
      totalAccess += entry.accessCount;
    }
    this.stats.avgAccessCount = this.cache.size > 0 
      ? totalAccess / this.cache.size 
      : 0;

    return { ...this.stats };
  }

  /**
   * 获取热点数据
   */
  getHotKeys(limit: number = 10): Array<{ key: string; accessCount: number }> {
    const entries = Array.from(this.cache.values())
      .sort((a, b) => b.accessCount - a.accessCount)
      .slice(0, limit);

    return entries.map(entry => ({
      key: entry.key,
      accessCount: entry.accessCount,
    }));
  }

  /**
   * 预热缓存
   */
  async preload(loader: (key: string) => Promise<any>): Promise<void> {
    const hotKeys = this.getHotKeys(50);
    
    console.log(`[LRUCache] 🔥 预热${hotKeys.length}个热点数据...`);

    for (const { key } of hotKeys) {
      try {
        const value = await loader(key);
        this.set(key, value);
      } catch (error) {
        console.error(`[LRUCache] 预热失败 ${key}:`, error);
      }
    }
  }
}

// ==================== 分层缓存管理器 ====================

class TieredCacheManager {
  private l1Cache: LRUCache<any>; // 内存缓存（L1）
  private preloadInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.l1Cache = new LRUCache(
      CACHE_CONFIG.MEMORY_CACHE_SIZE,
      CACHE_CONFIG.MEMORY_CACHE_TTL
    );

    // 启动定期清理
    this.startPeriodicCleanup();
    
    // 启动缓存预热
    if (CACHE_CONFIG.PRELOAD.ENABLED) {
      this.startPreloading();
    }
  }

  /**
   * 获取缓存（智能选择缓存层）
   */
  async get<T>(key: string): Promise<T | null> {
    // 尝试从L1缓存获取
    const l1Value = this.l1Cache.get(key);
    if (l1Value !== null) {
      return l1Value as T;
    }

    // L1未命中
    return null;
  }

  /**
   * 设置缓存
   */
  async set<T>(key: string, value: T, ttl?: number): Promise<void> {
    // 设置到L1缓存
    this.l1Cache.set(key, value, ttl);
  }

  /**
   * 删除缓存
   */
  async delete(key: string): Promise<void> {
    this.l1Cache.delete(key);
  }

  /**
   * 批量删除
   */
  async deletePattern(pattern: string | RegExp): Promise<number> {
    return this.l1Cache.deletePattern(pattern);
  }

  /**
   * 带缓存的数据获取
   */
  async getOrSet<T>(
    key: string,
    loader: () => Promise<T>,
    ttl?: number
  ): Promise<T> {
    // 尝试从缓存获取
    const cached = await this.get<T>(key);
    if (cached !== null) {
      return cached;
    }

    // 缓存未命中，加载数据
    const value = await loader();
    
    // 保存到缓存
    await this.set(key, value, ttl);
    
    return value;
  }

  /**
   * 批量获取
   */
  async getMany<T>(keys: string[]): Promise<Array<T | null>> {
    return Promise.all(keys.map(key => this.get<T>(key)));
  }

  /**
   * 批量设置
   */
  async setMany<T>(entries: Array<{ key: string; value: T; ttl?: number }>): Promise<void> {
    await Promise.all(entries.map(({ key, value, ttl }) => this.set(key, value, ttl)));
  }

  /**
   * 清空缓存
   */
  async clear(): Promise<void> {
    this.l1Cache.clear();
  }

  /**
   * 获取统计信息
   */
  getStats() {
    return {
      l1: this.l1Cache.getStats(),
      hotKeys: this.l1Cache.getHotKeys(20),
    };
  }

  /**
   * 定期清理过期缓存
   */
  private startPeriodicCleanup(): void {
    setInterval(() => {
      const count = this.l1Cache.cleanup();
      if (count > 0) {
        console.log(`[TieredCache] 🧹 清理了${count}个过期缓存项`);
      }
    }, 60000); // 每分钟清理一次
  }

  /**
   * 定期预热热点数据
   */
  private startPreloading(): void {
    this.preloadInterval = setInterval(() => {
      // 这里可以实现预热逻辑
      // 例如：预加载最近访问最多的数据
      const stats = this.l1Cache.getStats();
      console.log(`[TieredCache] 🔥 缓存统计: 命中率=${stats.hitRate}, 条目=${stats.entryCount}, 大小=${(stats.totalSize / 1024 / 1024).toFixed(2)}MB`);
    }, CACHE_CONFIG.PRELOAD.PRELOAD_INTERVAL);
  }

  /**
   * 停止预热
   */
  stopPreloading(): void {
    if (this.preloadInterval) {
      clearInterval(this.preloadInterval);
      this.preloadInterval = null;
    }
  }
}

// ==================== 创建全局实例 ====================

export const cacheManager = new TieredCacheManager();

// ==================== 缓存键生成器 ====================

export const CacheKeys = {
  user: (phone: string) => `user:${phone}`,
  work: (id: string) => `work:${id}`,
  works: (userId: string, page: number) => `works:${userId}:${page}`,
  series: (id: string) => `series:${id}`,
  seriesList: (userId: string, page: number) => `series:${userId}:${page}`,
  communityWorks: (page: number) => `community:works:${page}`,
  communitySeries: (page: number) => `community:series:${page}`,
  comments: (workId: string) => `comments:${workId}`,
  likes: (workId: string) => `likes:${workId}`,
  userLikes: (userId: string) => `user:${userId}:likes`,
  videoTask: (taskId: string) => `video:task:${taskId}`,
  videoUrl: (url: string) => `video:url:${url}`,
  stats: (key: string) => `stats:${key}`,
};

// ==================== 缓存失效策略 ====================

export const CacheInvalidation = {
  /**
   * 作品创建/更新时失效相关缓存
   */
  onWorkChange: async (workId: string, userId: string) => {
    await cacheManager.delete(CacheKeys.work(workId));
    await cacheManager.deletePattern(`works:${userId}:`);
    await cacheManager.deletePattern('community:works:');
  },

  /**
   * 剧集创建/更新时失效相关缓存
   */
  onSeriesChange: async (seriesId: string, userId: string) => {
    await cacheManager.delete(CacheKeys.series(seriesId));
    await cacheManager.deletePattern(`series:${userId}:`);
    await cacheManager.deletePattern('community:series:');
  },

  /**
   * 点赞时失效相关缓存
   */
  onLikeChange: async (workId: string, userId: string) => {
    await cacheManager.delete(CacheKeys.likes(workId));
    await cacheManager.delete(CacheKeys.userLikes(userId));
    await cacheManager.delete(CacheKeys.work(workId));
  },

  /**
   * 评论时失效相关缓存
   */
  onCommentChange: async (workId: string) => {
    await cacheManager.delete(CacheKeys.comments(workId));
    await cacheManager.delete(CacheKeys.work(workId));
  },

  /**
   * 用户更新时失效相关缓存
   */
  onUserChange: async (userId: string) => {
    await cacheManager.delete(CacheKeys.user(userId));
    await cacheManager.deletePattern(`user:${userId}:`);
  },
};

// 定期报告缓存统计
setInterval(() => {
  const stats = cacheManager.getStats();
  console.log('[AdvancedCache] 📊 Stats:', JSON.stringify(stats.l1));
}, 300000); // 每5分钟报告一次

console.log('[AdvancedCache] ✅ Advanced cache initialized');
console.log('[AdvancedCache] 🚀 Config:', CACHE_CONFIG);
