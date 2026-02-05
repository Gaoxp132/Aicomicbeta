/**
 * 性能监控中间件
 * 
 * 功能：
 * - 请求性能监控
 * - 慢请求检测
 * - 实时性能指标
 * - 性能分析报告
 * 
 * 目标：实时监控系统性能，支持10万用户、1万并发
 */

import type { Context, Next } from 'npm:hono@4';

// ==================== 配置 ====================

const MONITOR_CONFIG = {
  // 慢请求阈值（毫秒）
  SLOW_REQUEST_THRESHOLD: 1000, // 超过1秒视为慢请求
  VERY_SLOW_REQUEST_THRESHOLD: 3000, // 超过3秒视为严重慢请求
  
  // 性能指标收集
  METRICS: {
    ENABLED: true,
    SAMPLE_RATE: 1.0, // 采样率 1.0 = 100%
    BUFFER_SIZE: 1000, // 指标缓冲区大小
  },
  
  // 报告配置
  REPORT: {
    INTERVAL: 60000, // 每分钟生成报告
    TOP_N: 10, // 显示前N个最慢的端点
  },
};

// ==================== 类型定义 ====================

interface RequestMetrics {
  method: string;
  path: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  statusCode?: number;
  error?: string;
  userAgent?: string;
  userId?: string;
  dbQueries?: number;
  cacheHits?: number;
  cacheMisses?: number;
}

interface EndpointStats {
  path: string;
  totalRequests: number;
  successRequests: number;
  errorRequests: number;
  totalDuration: number;
  avgDuration: number;
  minDuration: number;
  maxDuration: number;
  p50Duration: number;
  p95Duration: number;
  p99Duration: number;
  slowRequests: number;
  verySlowRequests: number;
}

// ==================== 性能监控器 ====================

class PerformanceMonitor {
  private metrics: RequestMetrics[] = [];
  private endpointStats: Map<string, number[]> = new Map(); // path -> durations[]
  private recentSlowRequests: RequestMetrics[] = [];
  
  private globalStats = {
    totalRequests: 0,
    successRequests: 0,
    errorRequests: 0,
    totalDuration: 0,
    slowRequests: 0,
    verySlowRequests: 0,
  };

  /**
   * 记录请求指标
   */
  recordMetrics(metrics: RequestMetrics): void {
    // 检查采样率
    if (Math.random() > MONITOR_CONFIG.METRICS.SAMPLE_RATE) {
      return;
    }

    // 添加到缓冲区
    this.metrics.push(metrics);
    
    // 限制缓冲区大小
    if (this.metrics.length > MONITOR_CONFIG.METRICS.BUFFER_SIZE) {
      this.metrics.shift();
    }

    // 更新端点统计
    if (metrics.duration !== undefined) {
      const durations = this.endpointStats.get(metrics.path) || [];
      durations.push(metrics.duration);
      
      // 限制每个端点的历史数据量
      if (durations.length > 1000) {
        durations.shift();
      }
      
      this.endpointStats.set(metrics.path, durations);
    }

    // 更新全局统计
    this.globalStats.totalRequests++;
    
    if (metrics.statusCode && metrics.statusCode < 400) {
      this.globalStats.successRequests++;
    } else if (metrics.error) {
      this.globalStats.errorRequests++;
    }

    if (metrics.duration !== undefined) {
      this.globalStats.totalDuration += metrics.duration;

      // 检测慢请求
      if (metrics.duration > MONITOR_CONFIG.SLOW_REQUEST_THRESHOLD) {
        this.globalStats.slowRequests++;
        
        if (metrics.duration > MONITOR_CONFIG.VERY_SLOW_REQUEST_THRESHOLD) {
          this.globalStats.verySlowRequests++;
        }

        // 记录慢请求
        this.recentSlowRequests.push(metrics);
        if (this.recentSlowRequests.length > 100) {
          this.recentSlowRequests.shift();
        }

        // 输出警告
        console.warn(
          `[PerformanceMonitor] ⚠️ 慢请求: ${metrics.method} ${metrics.path} - ${metrics.duration}ms`
        );
      }
    }
  }

  /**
   * 获取端点统计
   */
  getEndpointStats(path: string): EndpointStats | null {
    const durations = this.endpointStats.get(path);
    
    if (!durations || durations.length === 0) {
      return null;
    }

    // 排序用于计算百分位数
    const sorted = [...durations].sort((a, b) => a - b);
    const total = sorted.reduce((sum, d) => sum + d, 0);
    const count = sorted.length;

    return {
      path,
      totalRequests: count,
      successRequests: count, // 简化统计
      errorRequests: 0,
      totalDuration: total,
      avgDuration: total / count,
      minDuration: sorted[0],
      maxDuration: sorted[count - 1],
      p50Duration: sorted[Math.floor(count * 0.5)],
      p95Duration: sorted[Math.floor(count * 0.95)],
      p99Duration: sorted[Math.floor(count * 0.99)],
      slowRequests: sorted.filter(d => d > MONITOR_CONFIG.SLOW_REQUEST_THRESHOLD).length,
      verySlowRequests: sorted.filter(d => d > MONITOR_CONFIG.VERY_SLOW_REQUEST_THRESHOLD).length,
    };
  }

  /**
   * 获取所有端点统计
   */
  getAllEndpointStats(): EndpointStats[] {
    const stats: EndpointStats[] = [];
    
    for (const path of this.endpointStats.keys()) {
      const stat = this.getEndpointStats(path);
      if (stat) {
        stats.push(stat);
      }
    }

    // 按平均响应时间降序排序
    return stats.sort((a, b) => b.avgDuration - a.avgDuration);
  }

  /**
   * 获取全局统计
   */
  getGlobalStats() {
    const avgDuration = this.globalStats.totalRequests > 0
      ? this.globalStats.totalDuration / this.globalStats.totalRequests
      : 0;

    const successRate = this.globalStats.totalRequests > 0
      ? (this.globalStats.successRequests / this.globalStats.totalRequests * 100).toFixed(2)
      : '0';

    return {
      ...this.globalStats,
      avgDuration: Math.round(avgDuration),
      successRate: `${successRate}%`,
      slowRequestRate: this.globalStats.totalRequests > 0
        ? `${(this.globalStats.slowRequests / this.globalStats.totalRequests * 100).toFixed(2)}%`
        : '0%',
    };
  }

  /**
   * 获取最近的慢请求
   */
  getRecentSlowRequests(limit: number = 10): RequestMetrics[] {
    return this.recentSlowRequests
      .slice(-limit)
      .sort((a, b) => (b.duration || 0) - (a.duration || 0));
  }

  /**
   * 生成性能报告
   */
  generateReport(): string {
    const globalStats = this.getGlobalStats();
    const endpointStats = this.getAllEndpointStats().slice(0, MONITOR_CONFIG.REPORT.TOP_N);
    const slowRequests = this.getRecentSlowRequests(5);

    let report = '\n';
    report += '==========================================\n';
    report += '           性能监控报告\n';
    report += '==========================================\n\n';

    // 全局统计
    report += '【全局统计】\n';
    report += `  总请求数: ${globalStats.totalRequests}\n`;
    report += `  成功请求: ${globalStats.successRequests}\n`;
    report += `  失败请求: ${globalStats.errorRequests}\n`;
    report += `  平均响应时间: ${globalStats.avgDuration}ms\n`;
    report += `  成功率: ${globalStats.successRate}\n`;
    report += `  慢请求数: ${globalStats.slowRequests} (${globalStats.slowRequestRate})\n`;
    report += `  严重慢请求: ${globalStats.verySlowRequests}\n\n`;

    // 端点统计
    if (endpointStats.length > 0) {
      report += `【最慢的${endpointStats.length}个端点】\n`;
      endpointStats.forEach((stat, index) => {
        report += `  ${index + 1}. ${stat.path}\n`;
        report += `     请求数: ${stat.totalRequests}, 平均: ${Math.round(stat.avgDuration)}ms, P95: ${Math.round(stat.p95Duration)}ms, P99: ${Math.round(stat.p99Duration)}ms\n`;
        report += `     最小: ${Math.round(stat.minDuration)}ms, 最大: ${Math.round(stat.maxDuration)}ms\n`;
        report += `     慢请求: ${stat.slowRequests}, 严重慢请求: ${stat.verySlowRequests}\n`;
      });
      report += '\n';
    }

    // 最近的慢请求
    if (slowRequests.length > 0) {
      report += '【最近的慢请求】\n';
      slowRequests.forEach((req, index) => {
        report += `  ${index + 1}. ${req.method} ${req.path} - ${req.duration}ms\n`;
        if (req.error) {
          report += `     错误: ${req.error}\n`;
        }
      });
      report += '\n';
    }

    report += '==========================================\n';

    return report;
  }

  /**
   * 重置统计
   */
  reset(): void {
    this.metrics = [];
    this.endpointStats.clear();
    this.recentSlowRequests = [];
    this.globalStats = {
      totalRequests: 0,
      successRequests: 0,
      errorRequests: 0,
      totalDuration: 0,
      slowRequests: 0,
      verySlowRequests: 0,
    };
  }
}

// 创建全局实例
export const performanceMonitor = new PerformanceMonitor();

// ==================== Hono中间件 ====================

/**
 * 性能监控中间件
 */
export function performanceMiddleware() {
  return async (c: Context, next: Next) => {
    const startTime = Date.now();
    const path = c.req.path;
    const method = c.req.method;

    const metrics: RequestMetrics = {
      method,
      path,
      startTime,
      userAgent: c.req.header('user-agent'),
    };

    try {
      await next();
      
      metrics.statusCode = c.res.status;
    } catch (error: any) {
      metrics.error = error.message || 'Unknown error';
      metrics.statusCode = 500;
      throw error;
    } finally {
      metrics.endTime = Date.now();
      metrics.duration = metrics.endTime - startTime;

      // 记录指标
      performanceMonitor.recordMetrics(metrics);
    }
  };
}

/**
 * 性能报告端点
 */
export function getPerformanceReport(c: Context) {
  const report = performanceMonitor.generateReport();
  const globalStats = performanceMonitor.getGlobalStats();
  const endpointStats = performanceMonitor.getAllEndpointStats().slice(0, 20);
  const slowRequests = performanceMonitor.getRecentSlowRequests(20);

  return c.json({
    success: true,
    data: {
      global: globalStats,
      endpoints: endpointStats,
      slowRequests,
      reportText: report,
    },
  });
}

// ==================== 自动报告 ====================

// 定期生成性能报告
setInterval(() => {
  const stats = performanceMonitor.getGlobalStats();
  
  // 只在有请求时生成报告
  if (stats.totalRequests > 0) {
    const report = performanceMonitor.generateReport();
    console.log(report);
  }
}, MONITOR_CONFIG.REPORT.INTERVAL);

// ==================== 辅助函数 ====================

/**
 * 性能计时器
 */
export class PerformanceTimer {
  private startTime: number;
  private checkpoints: Map<string, number> = new Map();

  constructor() {
    this.startTime = Date.now();
  }

  /**
   * 设置检查点
   */
  checkpoint(name: string): void {
    this.checkpoints.set(name, Date.now());
  }

  /**
   * 获取从开始到现在的时间
   */
  elapsed(): number {
    return Date.now() - this.startTime;
  }

  /**
   * 获取两个检查点之间的时间
   */
  between(from: string, to: string): number {
    const fromTime = this.checkpoints.get(from) || this.startTime;
    const toTime = this.checkpoints.get(to) || Date.now();
    return toTime - fromTime;
  }

  /**
   * 获取所有检查点的时间
   */
  getAllCheckpoints(): Record<string, number> {
    const result: Record<string, number> = {};
    let prevTime = this.startTime;

    for (const [name, time] of this.checkpoints) {
      result[name] = time - prevTime;
      prevTime = time;
    }

    return result;
  }

  /**
   * 输出性能报告
   */
  report(label: string): void {
    const total = this.elapsed();
    const checkpoints = this.getAllCheckpoints();

    console.log(`[Performance] ${label}: ${total}ms`);
    for (const [name, duration] of Object.entries(checkpoints)) {
      const percentage = ((duration / total) * 100).toFixed(1);
      console.log(`  - ${name}: ${duration}ms (${percentage}%)`);
    }
  }
}

/**
 * 性能装饰器（用于函数）
 */
export function measurePerformance(label: string) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      const startTime = Date.now();
      
      try {
        const result = await originalMethod.apply(this, args);
        const duration = Date.now() - startTime;
        
        if (duration > MONITOR_CONFIG.SLOW_REQUEST_THRESHOLD) {
          console.warn(`[Performance] ⚠️ 慢操作: ${label} - ${duration}ms`);
        }
        
        return result;
      } catch (error) {
        const duration = Date.now() - startTime;
        console.error(`[Performance] ❌ 错误: ${label} - ${duration}ms`, error);
        throw error;
      }
    };

    return descriptor;
  };
}

console.log('[PerformanceMonitor] ✅ Performance monitor initialized');
console.log('[PerformanceMonitor] 🚀 Config:', MONITOR_CONFIG);
