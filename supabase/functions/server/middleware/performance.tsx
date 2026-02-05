/**
 * 性能监控中间件 - 生产环境优化
 * 支持10万用户，1万并发
 * 
 * 功能：
 * - 请求时间监控
 * - 慢查询检测
 * - 并发控制
 * - 请求限流
 * - 性能统计
 */

import type { Context, Next } from "npm:hono";

// ==================== 性能配置 ====================

interface PerformanceConfig {
  slowQueryThreshold: number;    // 慢查询阈值（毫秒）
  maxConcurrent: number;         // 最大并发数
  enableMetrics: boolean;        // 是否启用指标
  sampleRate: number;            // 采样率（0-1）
}

const DEFAULT_CONFIG: PerformanceConfig = {
  slowQueryThreshold: 1000,      // 1秒
  maxConcurrent: 10000,          // 1万并发
  enableMetrics: true,
  sampleRate: 0.1,               // 10%采样
};

// ==================== 性能指标 ====================

class PerformanceMetrics {
  private requestCount = 0;
  private totalDuration = 0;
  private slowQueries = 0;
  private errors = 0;
  private concurrent = 0;
  private maxConcurrent = 0;
  private routeMetrics: Map<string, {
    count: number;
    totalTime: number;
    minTime: number;
    maxTime: number;
    errors: number;
  }> = new Map();

  /**
   * 记录请求开始
   */
  startRequest(): void {
    this.concurrent++;
    if (this.concurrent > this.maxConcurrent) {
      this.maxConcurrent = this.concurrent;
    }
  }

  /**
   * 记录请求结束
   */
  endRequest(route: string, duration: number, error: boolean = false): void {
    this.concurrent--;
    this.requestCount++;
    this.totalDuration += duration;

    if (error) {
      this.errors++;
    }

    if (duration > DEFAULT_CONFIG.slowQueryThreshold) {
      this.slowQueries++;
      console.warn(`[Performance] 🐌 Slow query detected: ${route} took ${duration}ms`);
    }

    // 更新路由指标
    const routeKey = route || 'unknown';
    const metric = this.routeMetrics.get(routeKey) || {
      count: 0,
      totalTime: 0,
      minTime: Infinity,
      maxTime: 0,
      errors: 0,
    };

    metric.count++;
    metric.totalTime += duration;
    metric.minTime = Math.min(metric.minTime, duration);
    metric.maxTime = Math.max(metric.maxTime, duration);
    if (error) metric.errors++;

    this.routeMetrics.set(routeKey, metric);
  }

  /**
   * 获取统计信息
   */
  getStats() {
    const avgDuration = this.requestCount > 0 
      ? (this.totalDuration / this.requestCount).toFixed(2)
      : '0';

    const errorRate = this.requestCount > 0
      ? ((this.errors / this.requestCount) * 100).toFixed(2)
      : '0';

    const slowQueryRate = this.requestCount > 0
      ? ((this.slowQueries / this.requestCount) * 100).toFixed(2)
      : '0';

    // 获取最慢的5个路由
    const topSlowRoutes = Array.from(this.routeMetrics.entries())
      .map(([route, metric]) => ({
        route,
        avgTime: (metric.totalTime / metric.count).toFixed(2),
        maxTime: metric.maxTime,
        count: metric.count,
        errorRate: ((metric.errors / metric.count) * 100).toFixed(2),
      }))
      .sort((a, b) => parseFloat(b.avgTime) - parseFloat(a.avgTime))
      .slice(0, 5);

    return {
      requests: {
        total: this.requestCount,
        errors: this.errors,
        errorRate: errorRate + '%',
        slowQueries: this.slowQueries,
        slowQueryRate: slowQueryRate + '%',
      },
      performance: {
        avgDuration: avgDuration + 'ms',
        totalDuration: this.totalDuration + 'ms',
      },
      concurrency: {
        current: this.concurrent,
        max: this.maxConcurrent,
        limit: DEFAULT_CONFIG.maxConcurrent,
        utilization: ((this.maxConcurrent / DEFAULT_CONFIG.maxConcurrent) * 100).toFixed(2) + '%',
      },
      topSlowRoutes,
    };
  }

  /**
   * 重置统计
   */
  reset(): void {
    this.requestCount = 0;
    this.totalDuration = 0;
    this.slowQueries = 0;
    this.errors = 0;
    this.maxConcurrent = Math.max(this.concurrent, 0);
    this.routeMetrics.clear();
  }
}

// ==================== 全局指标实例 ====================

export const globalMetrics = new PerformanceMetrics();

// 定期输出性能报告（每5分钟）
setInterval(() => {
  const stats = globalMetrics.getStats();
  console.log('[Performance] 📊 Performance Report:');
  console.log('[Performance]   Requests:', stats.requests.total);
  console.log('[Performance]   Avg Duration:', stats.performance.avgDuration);
  console.log('[Performance]   Error Rate:', stats.requests.errorRate);
  console.log('[Performance]   Slow Query Rate:', stats.requests.slowQueryRate);
  console.log('[Performance]   Max Concurrent:', stats.concurrency.max);
  console.log('[Performance]   Concurrency Utilization:', stats.concurrency.utilization);
  
  if (stats.topSlowRoutes.length > 0) {
    console.log('[Performance]   Top Slow Routes:');
    stats.topSlowRoutes.forEach((route, i) => {
      console.log(`[Performance]     ${i + 1}. ${route.route}: ${route.avgTime}ms (max: ${route.maxTime}ms, count: ${route.count})`);
    });
  }
  
  // 每小时重置一次统计
  const now = new Date();
  if (now.getMinutes() === 0) {
    globalMetrics.reset();
    console.log('[Performance] 🔄 Metrics reset (hourly)');
  }
}, 5 * 60 * 1000);

// ==================== 性能监控中间件 ====================

/**
 * 请求性能监控
 */
export function performanceMiddleware() {
  return async (c: Context, next: Next) => {
    const startTime = Date.now();
    const route = c.req.path;
    let hasError = false;

    globalMetrics.startRequest();

    try {
      await next();
      
      // 检查响应状态
      if (c.res.status >= 400) {
        hasError = true;
      }
    } catch (error) {
      hasError = true;
      throw error;
    } finally {
      const duration = Date.now() - startTime;
      globalMetrics.endRequest(route, duration, hasError);

      // 添加性能头（不读取响应体）
      const headers = new Headers(c.res.headers);
      headers.set('X-Response-Time', `${duration}ms`);
      
      // 创建新响应保留原始body
      c.res = new Response(c.res.body, {
        status: c.res.status,
        statusText: c.res.statusText,
        headers,
      });
    }
  };
}

// ==================== 并发控制 ====================

class ConcurrencyLimiter {
  private current = 0;
  private max: number;
  private queue: Array<() => void> = [];
  private rejected = 0;

  constructor(max: number) {
    this.max = max;
  }

  async acquire(): Promise<void> {
    if (this.current < this.max) {
      this.current++;
      return Promise.resolve();
    }

    // 达到限制，加入队列等待
    return new Promise((resolve) => {
      this.queue.push(resolve);
    });
  }

  release(): void {
    this.current--;
    
    // 处理队列中的请求
    const next = this.queue.shift();
    if (next) {
      this.current++;
      next();
    }
  }

  getStats() {
    return {
      current: this.current,
      max: this.max,
      queued: this.queue.length,
      rejected: this.rejected,
      utilization: ((this.current / this.max) * 100).toFixed(2) + '%',
    };
  }
}

export const globalLimiter = new ConcurrencyLimiter(10000); // 1万并发

/**
 * 并发限制中间件
 */
export function concurrencyLimitMiddleware() {
  return async (c: Context, next: Next) => {
    await globalLimiter.acquire();
    
    try {
      await next();
    } finally {
      globalLimiter.release();
    }
  };
}

// ==================== 请求限流 ====================

class RateLimiter {
  private requests: Map<string, number[]> = new Map();
  private windowMs: number;
  private maxRequests: number;

  constructor(windowMs: number, maxRequests: number) {
    this.windowMs = windowMs;
    this.maxRequests = maxRequests;
  }

  /**
   * 检查是否超过限流
   */
  isRateLimited(key: string): boolean {
    const now = Date.now();
    const windowStart = now - this.windowMs;

    // 获取该key的请求记录
    const timestamps = this.requests.get(key) || [];
    
    // 过滤掉过期的请求
    const validTimestamps = timestamps.filter(t => t > windowStart);
    
    // 检查是否超过限制
    if (validTimestamps.length >= this.maxRequests) {
      return true;
    }

    // 添加当前请求
    validTimestamps.push(now);
    this.requests.set(key, validTimestamps);

    return false;
  }

  /**
   * 清理过期数据
   */
  cleanup(): void {
    const now = Date.now();
    const windowStart = now - this.windowMs;

    for (const [key, timestamps] of this.requests.entries()) {
      const valid = timestamps.filter(t => t > windowStart);
      if (valid.length === 0) {
        this.requests.delete(key);
      } else {
        this.requests.set(key, valid);
      }
    }
  }

  getStats() {
    return {
      keys: this.requests.size,
      windowMs: this.windowMs,
      maxRequests: this.maxRequests,
    };
  }
}

// IP限流：每分钟100个请求
export const ipRateLimiter = new RateLimiter(60 * 1000, 100);

// 用户限流：每分钟50个请求
export const userRateLimiter = new RateLimiter(60 * 1000, 50);

// 定期清理限流器（每5分钟）
setInterval(() => {
  ipRateLimiter.cleanup();
  userRateLimiter.cleanup();
  console.log('[RateLimiter] 🧹 Cleaned up expired rate limit entries');
}, 5 * 60 * 1000);

/**
 * IP限流中间件
 */
export function ipRateLimitMiddleware() {
  return async (c: Context, next: Next) => {
    const ip = c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || 'unknown';
    
    if (ipRateLimiter.isRateLimited(ip)) {
      console.warn(`[RateLimiter] ⛔ IP rate limited: ${ip}`);
      return c.json({
        success: false,
        error: 'Too many requests',
        message: '请求过于频繁，请稍后再试',
        retryAfter: 60,
      }, 429);
    }

    await next();
  };
}

/**
 * 用户限流中间件
 */
export function userRateLimitMiddleware() {
  return async (c: Context, next: Next) => {
    const phone = c.req.query('phone') || c.req.header('x-user-phone') || 'anonymous';
    
    if (userRateLimiter.isRateLimited(phone)) {
      console.warn(`[RateLimiter] ⛔ User rate limited: ${phone}`);
      return c.json({
        success: false,
        error: 'Too many requests',
        message: '操作过于频繁，请稍后再试',
        retryAfter: 60,
      }, 429);
    }

    await next();
  };
}

// ==================== 健康检查端点 ====================

/**
 * 获取所有性能指标
 */
export function getPerformanceMetrics() {
  return {
    performance: globalMetrics.getStats(),
    concurrency: globalLimiter.getStats(),
    rateLimits: {
      ip: ipRateLimiter.getStats(),
      user: userRateLimiter.getStats(),
    },
    timestamp: new Date().toISOString(),
  };
}

console.log('[Performance] ✅ Performance middleware initialized');
console.log('[Performance] 🎯 Max concurrent requests: 10,000');
console.log('[Performance] ⏱️ Slow query threshold: 1000ms');
console.log('[Performance] 🚦 Rate limits configured');
console.log('[Performance] 💪 Ready for 100K users, 10K concurrent');