/**
 * 安全的性能监控中间件
 * 不读取或修改响应体，只记录指标
 */

import type { Context, Next } from "npm:hono";

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

  startRequest(): void {
    this.concurrent++;
    if (this.concurrent > this.maxConcurrent) {
      this.maxConcurrent = this.concurrent;
    }
  }

  endRequest(route: string, duration: number, error: boolean = false): void {
    this.concurrent--;
    this.requestCount++;
    this.totalDuration += duration;

    if (error) {
      this.errors++;
    }

    if (duration > 1000) { // 1秒阈值
      this.slowQueries++;
      console.warn(`[Performance] 🐌 Slow query: ${route} took ${duration}ms`);
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
        limit: 10000,
        utilization: ((this.maxConcurrent / 10000) * 100).toFixed(2) + '%',
      },
      topSlowRoutes,
    };
  }

  reset(): void {
    this.requestCount = 0;
    this.totalDuration = 0;
    this.slowQueries = 0;
    this.errors = 0;
    this.maxConcurrent = Math.max(this.concurrent, 0);
    this.routeMetrics.clear();
  }
}

export const globalMetrics = new PerformanceMetrics();

// 定期报告（每5分钟）
setInterval(() => {
  const stats = globalMetrics.getStats();
  if (stats.requests.total > 0) {
    console.log('[Performance] 📊 Report:');
    console.log('[Performance]   Requests:', stats.requests.total);
    console.log('[Performance]   Avg Duration:', stats.performance.avgDuration);
    console.log('[Performance]   Error Rate:', stats.requests.errorRate);
    console.log('[Performance]   Slow Query Rate:', stats.requests.slowQueryRate);
    console.log('[Performance]   Max Concurrent:', stats.concurrency.max);
  }
  
  // 每小时重置
  const now = new Date();
  if (now.getMinutes() === 0) {
    globalMetrics.reset();
  }
}, 5 * 60 * 1000);

/**
 * 安全的性能监控中间件
 * 只记录指标，不修改响应
 */
export function safePerformanceMiddleware() {
  return async (c: Context, next: Next) => {
    const startTime = Date.now();
    const route = c.req.path;
    let hasError = false;

    globalMetrics.startRequest();

    try {
      await next();
      
      if (c.res.status >= 400) {
        hasError = true;
      }
    } catch (error) {
      hasError = true;
      throw error;
    } finally {
      const duration = Date.now() - startTime;
      globalMetrics.endRequest(route, duration, hasError);
      
      // 只添加响应头，不修改body
      c.header('X-Response-Time', `${duration}ms`);
    }
  };
}

export function getPerformanceMetrics() {
  return {
    performance: globalMetrics.getStats(),
    timestamp: new Date().toISOString(),
  };
}

console.log('[SafePerformance] ✅ Safe performance middleware initialized');
console.log('[SafePerformance] 🎯 Target: 100,000 users, 10,000 concurrent');
