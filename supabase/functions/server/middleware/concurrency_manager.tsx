/**
 * 并发管理器
 * 
 * 功能：
 * - 请求队列管理
 * - 并发限制
 * - 负载均衡
 * - 优先级队列
 * 
 * 目标：支持10万用户、1万并发
 */

// ==================== 配置 ====================

const CONCURRENCY_CONFIG = {
  // 全局并发限制
  MAX_CONCURRENT_REQUESTS: 10000, // 最大并发请求数
  MAX_REQUESTS_PER_SECOND: 5000, // 每秒最大请求数
  
  // 用户级别限制
  MAX_CONCURRENT_PER_USER: 10, // 单用户最大并发
  MAX_REQUESTS_PER_MINUTE_PER_USER: 100, // 单用户每分钟最大请求数
  
  // 任务类型限制
  MAX_VIDEO_GENERATION: 1000, // 同时生成视频的最大数量
  MAX_AI_REQUESTS: 2000, // 同时AI请求的最大数量
  MAX_DB_QUERIES: 5000, // 同时数据库查询的最大数量
  
  // 队列配置
  QUEUE_MAX_SIZE: 50000, // 队列最大长度
  QUEUE_TIMEOUT: 60000, // 队列超时（毫秒）
  
  // 优先级配置
  PRIORITY_LEVELS: {
    CRITICAL: 0, // 关键任务（用户登录、支付等）
    HIGH: 1, // 高优先级（视频生成）
    NORMAL: 2, // 普通（浏览、查询）
    LOW: 3, // 低优先级（后台任务）
  },
};

// ==================== 类型定义 ====================

interface QueueItem {
  id: string;
  handler: () => Promise<any>;
  priority: number;
  userId?: string;
  type: 'video' | 'ai' | 'db' | 'other';
  timestamp: number;
  resolve: (value: any) => void;
  reject: (error: Error) => void;
  timeout?: NodeJS.Timeout;
}

interface UserStats {
  concurrent: number;
  requestsInMinute: number;
  lastRequestTime: number;
  requestTimestamps: number[];
}

// ==================== 并发管理器 ====================

class ConcurrencyManager {
  // 全局队列
  private queue: QueueItem[] = [];
  
  // 活跃任务统计
  private activeRequests = 0;
  private activeByType: Map<string, number> = new Map();
  private activeByUser: Map<string, UserStats> = new Map();
  
  // 性能统计
  private stats = {
    totalRequests: 0,
    successfulRequests: 0,
    failedRequests: 0,
    queuedRequests: 0,
    rejectedRequests: 0,
    averageWaitTime: 0,
    averageProcessingTime: 0,
  };
  
  // 速率限制（令牌桶算法）
  private tokenBucket = {
    tokens: CONCURRENCY_CONFIG.MAX_REQUESTS_PER_SECOND,
    lastRefill: Date.now(),
  };

  /**
   * 提交任务到队列
   */
  async submit<T>(
    handler: () => Promise<T>,
    options: {
      priority?: number;
      userId?: string;
      type?: 'video' | 'ai' | 'db' | 'other';
      timeout?: number;
    } = {}
  ): Promise<T> {
    const {
      priority = CONCURRENCY_CONFIG.PRIORITY_LEVELS.NORMAL,
      userId,
      type = 'other',
      timeout = CONCURRENCY_CONFIG.QUEUE_TIMEOUT,
    } = options;

    // 检查队列容量
    if (this.queue.length >= CONCURRENCY_CONFIG.QUEUE_MAX_SIZE) {
      this.stats.rejectedRequests++;
      throw new Error('Queue is full, please try again later');
    }

    // 检查用户级别限制
    if (userId && !this.checkUserLimits(userId)) {
      this.stats.rejectedRequests++;
      throw new Error('User request limit exceeded');
    }

    // 检查类型限制
    if (!this.checkTypeLimits(type)) {
      this.stats.rejectedRequests++;
      throw new Error(`${type} generation limit exceeded`);
    }

    this.stats.totalRequests++;
    this.stats.queuedRequests++;

    return new Promise<T>((resolve, reject) => {
      const id = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const timestamp = Date.now();

      const item: QueueItem = {
        id,
        handler,
        priority,
        userId,
        type,
        timestamp,
        resolve,
        reject,
      };

      // 设置超时
      item.timeout = setTimeout(() => {
        this.removeFromQueue(id);
        this.stats.failedRequests++;
        reject(new Error('Request timeout'));
      }, timeout);

      // 插入队列（按优先级排序）
      this.insertToQueue(item);

      // 尝试处理队列
      this.processQueue();
    });
  }

  /**
   * 检查用户限制
   */
  private checkUserLimits(userId: string): boolean {
    const now = Date.now();
    let userStats = this.activeByUser.get(userId);

    if (!userStats) {
      userStats = {
        concurrent: 0,
        requestsInMinute: 0,
        lastRequestTime: now,
        requestTimestamps: [],
      };
      this.activeByUser.set(userId, userStats);
    }

    // 清理过期的时间戳
    userStats.requestTimestamps = userStats.requestTimestamps.filter(
      ts => now - ts < 60000
    );

    // 检查并发限制
    if (userStats.concurrent >= CONCURRENCY_CONFIG.MAX_CONCURRENT_PER_USER) {
      return false;
    }

    // 检查速率限制
    if (userStats.requestTimestamps.length >= CONCURRENCY_CONFIG.MAX_REQUESTS_PER_MINUTE_PER_USER) {
      return false;
    }

    return true;
  }

  /**
   * 检查类型限制
   */
  private checkTypeLimits(type: string): boolean {
    const active = this.activeByType.get(type) || 0;

    switch (type) {
      case 'video':
        return active < CONCURRENCY_CONFIG.MAX_VIDEO_GENERATION;
      case 'ai':
        return active < CONCURRENCY_CONFIG.MAX_AI_REQUESTS;
      case 'db':
        return active < CONCURRENCY_CONFIG.MAX_DB_QUERIES;
      default:
        return true;
    }
  }

  /**
   * 检查速率限制（令牌桶算法）
   */
  private checkRateLimit(): boolean {
    const now = Date.now();
    const timePassed = now - this.tokenBucket.lastRefill;
    
    // 补充令牌
    if (timePassed >= 1000) {
      this.tokenBucket.tokens = CONCURRENCY_CONFIG.MAX_REQUESTS_PER_SECOND;
      this.tokenBucket.lastRefill = now;
    }

    // 检查是否有可用令牌
    if (this.tokenBucket.tokens > 0) {
      this.tokenBucket.tokens--;
      return true;
    }

    return false;
  }

  /**
   * 插入到队列（按优先级）
   */
  private insertToQueue(item: QueueItem): void {
    // 找到第一个优先级更低的位置
    let insertIndex = this.queue.findIndex(
      queueItem => queueItem.priority > item.priority
    );

    if (insertIndex === -1) {
      insertIndex = this.queue.length;
    }

    this.queue.splice(insertIndex, 0, item);
  }

  /**
   * 从队列中移除
   */
  private removeFromQueue(id: string): void {
    const index = this.queue.findIndex(item => item.id === id);
    if (index !== -1) {
      const item = this.queue[index];
      if (item.timeout) {
        clearTimeout(item.timeout);
      }
      this.queue.splice(index, 1);
      this.stats.queuedRequests--;
    }
  }

  /**
   * 处理队列
   */
  private async processQueue(): Promise<void> {
    // 检查全局并发限制
    if (this.activeRequests >= CONCURRENCY_CONFIG.MAX_CONCURRENT_REQUESTS) {
      return;
    }

    // 检查速率限制
    if (!this.checkRateLimit()) {
      return;
    }

    // 从队列取出第一个任务
    const item = this.queue.shift();
    if (!item) {
      return;
    }

    this.stats.queuedRequests--;

    // 清除超时计时器
    if (item.timeout) {
      clearTimeout(item.timeout);
    }

    // 更新统计
    this.activeRequests++;
    this.activeByType.set(
      item.type,
      (this.activeByType.get(item.type) || 0) + 1
    );

    if (item.userId) {
      const userStats = this.activeByUser.get(item.userId)!;
      userStats.concurrent++;
      userStats.requestTimestamps.push(Date.now());
    }

    // 计算等待时间
    const waitTime = Date.now() - item.timestamp;
    this.stats.averageWaitTime =
      (this.stats.averageWaitTime * this.stats.successfulRequests + waitTime) /
      (this.stats.successfulRequests + 1);

    // 执行任务
    const startTime = Date.now();
    try {
      const result = await item.handler();
      this.stats.successfulRequests++;
      item.resolve(result);
    } catch (error) {
      this.stats.failedRequests++;
      item.reject(error as Error);
    } finally {
      // 更新统计
      const processingTime = Date.now() - startTime;
      this.stats.averageProcessingTime =
        (this.stats.averageProcessingTime * (this.stats.successfulRequests - 1) +
          processingTime) /
        this.stats.successfulRequests;

      this.activeRequests--;
      this.activeByType.set(
        item.type,
        (this.activeByType.get(item.type) || 0) - 1
      );

      if (item.userId) {
        const userStats = this.activeByUser.get(item.userId);
        if (userStats) {
          userStats.concurrent--;
        }
      }

      // 尝试处理下一个任务
      setImmediate(() => this.processQueue());
    }
  }

  /**
   * 获取统计信息
   */
  getStats() {
    return {
      ...this.stats,
      activeRequests: this.activeRequests,
      queueLength: this.queue.length,
      activeByType: Object.fromEntries(this.activeByType),
      totalUsers: this.activeByUser.size,
      queueUtilization: `${((this.queue.length / CONCURRENCY_CONFIG.QUEUE_MAX_SIZE) * 100).toFixed(2)}%`,
      concurrencyUtilization: `${((this.activeRequests / CONCURRENCY_CONFIG.MAX_CONCURRENT_REQUESTS) * 100).toFixed(2)}%`,
    };
  }

  /**
   * 清空队列
   */
  async drain(): Promise<void> {
    // 拒绝所有等待的任务
    for (const item of this.queue) {
      if (item.timeout) {
        clearTimeout(item.timeout);
      }
      item.reject(new Error('Queue is being drained'));
    }
    this.queue = [];
    this.stats.queuedRequests = 0;
  }
}

// 创建全局实例
export const concurrencyManager = new ConcurrencyManager();

// 定期清理用户统计
setInterval(() => {
  const now = Date.now();
  for (const [userId, stats] of (concurrencyManager as any).activeByUser.entries()) {
    // 清理60秒内无活动的用户
    if (stats.concurrent === 0 && now - stats.lastRequestTime > 60000) {
      (concurrencyManager as any).activeByUser.delete(userId);
    }
  }
}, 30000); // 每30秒清理一次

// 定期报告统计信息
setInterval(() => {
  const stats = concurrencyManager.getStats();
  if (stats.activeRequests > 0 || stats.queueLength > 0) {
    console.log('[ConcurrencyManager] Stats:', JSON.stringify(stats));
  }
}, 60000); // 每分钟报告一次

// ==================== 辅助函数 ====================

/**
 * 批量提交任务
 */
export async function submitBatch<T>(
  handlers: Array<() => Promise<T>>,
  options: {
    priority?: number;
    userId?: string;
    type?: 'video' | 'ai' | 'db' | 'other';
    concurrency?: number;
  } = {}
): Promise<T[]> {
  const { concurrency = 10, ...taskOptions } = options;
  const results: T[] = [];
  
  // 分批执行
  for (let i = 0; i < handlers.length; i += concurrency) {
    const batch = handlers.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map(handler => concurrencyManager.submit(handler, taskOptions))
    );
    results.push(...batchResults);
  }
  
  return results;
}

/**
 * 带重试的任务提交
 */
export async function submitWithRetry<T>(
  handler: () => Promise<T>,
  options: {
    priority?: number;
    userId?: string;
    type?: 'video' | 'ai' | 'db' | 'other';
    maxRetries?: number;
    retryDelay?: number;
  } = {}
): Promise<T> {
  const { maxRetries = 3, retryDelay = 1000, ...taskOptions } = options;
  
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await concurrencyManager.submit(handler, taskOptions);
    } catch (error) {
      lastError = error as Error;
      
      if (attempt < maxRetries) {
        // 指数退避
        const delay = retryDelay * Math.pow(2, attempt);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  throw lastError;
}

console.log('[ConcurrencyManager] ✅ Concurrency manager initialized');
console.log('[ConcurrencyManager] 🚀 Config:', CONCURRENCY_CONFIG);
