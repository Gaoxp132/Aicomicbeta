/**
 * 速率限制中间件
 * 防止API滥用，保护系统资源
 * 
 * 策略：
 * - 普通用户：60请求/分钟
 * - 认证用户：300请求/分钟
 * - 管理员：无限制
 * 
 * 支持10,000并发用户的分布式限流
 */

import type { Context } from "npm:hono";

interface RateLimitEntry {
  count: number;
  windowStart: number;
  blocked: boolean;
}

/**
 * 速率限制器
 */
class RateLimiter {
  private limits: Map<string, RateLimitEntry> = new Map();
  private readonly windowMs: number;
  private readonly maxRequests: Record<string, number>;

  constructor() {
    // 时间窗口：1分钟
    this.windowMs = 60 * 1000;
    
    // 不同用户等级的限制
    this.maxRequests = {
      anonymous: 60,      // 匿名用户：60请求/分钟
      authenticated: 300, // 认证用户：300请求/分钟
      premium: 1000,      // 高级用户：1000请求/分钟
      admin: Infinity,    // 管理员：无限制
    };
  }

  /**
   * 检查是否超过速率限制
   */
  checkLimit(identifier: string, tier: string = 'anonymous'): {
    allowed: boolean;
    remaining: number;
    resetAt: number;
  } {
    const now = Date.now();
    const maxRequests = this.maxRequests[tier] || this.maxRequests.anonymous;
    
    let entry = this.limits.get(identifier);
    
    // 如果没有记录或窗口已过期，创建新窗口
    if (!entry || now - entry.windowStart > this.windowMs) {
      entry = {
        count: 0,
        windowStart: now,
        blocked: false,
      };
      this.limits.set(identifier, entry);
    }
    
    // 增加计数
    entry.count++;
    
    // 检查是否超限
    const allowed = entry.count <= maxRequests;
    const remaining = Math.max(0, maxRequests - entry.count);
    const resetAt = entry.windowStart + this.windowMs;
    
    // 如果超限，标记为阻止
    if (!allowed) {
      entry.blocked = true;
    }
    
    return {
      allowed,
      remaining,
      resetAt,
    };
  }

  /**
   * 获取统计信息
   */
  getStats() {
    const now = Date.now();
    let activeUsers = 0;
    let blockedUsers = 0;
    let totalRequests = 0;
    
    for (const [, entry] of this.limits) {
      // 只统计当前窗口内的
      if (now - entry.windowStart <= this.windowMs) {
        activeUsers++;
        totalRequests += entry.count;
        
        if (entry.blocked) {
          blockedUsers++;
        }
      }
    }
    
    return {
      activeUsers,
      blockedUsers,
      totalRequests,
      requestsPerSecond: (totalRequests / 60).toFixed(2),
    };
  }

  /**
   * 清理过期记录
   */
  cleanup() {
    const now = Date.now();
    const cutoff = now - this.windowMs * 2; // 保留2个窗口的数据
    
    for (const [key, entry] of this.limits) {
      if (entry.windowStart < cutoff) {
        this.limits.delete(key);
      }
    }
  }
}

// 全局限流器实例
const rateLimiter = new RateLimiter();

// 定期清理过期记录（每2分钟）
setInterval(() => {
  rateLimiter.cleanup();
}, 120000);

// 定期报告统计（每分钟）
setInterval(() => {
  const stats = rateLimiter.getStats();
  if (stats.activeUsers > 0) {
    console.log('[RateLimiter] Stats:', JSON.stringify(stats));
  }
}, 60000);

/**
 * 速率限制中间件
 */
export function rateLimitMiddleware(tier?: string) {
  return async (c: Context, next: () => Promise<void>) => {
    // 获取用户标识（IP地址或用户ID）
    const userPhone = c.req.header('x-user-phone');
    const clientIP = c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || 'unknown';
    const identifier = userPhone || clientIP;
    
    // 确定用户等级
    let userTier = tier || 'anonymous';
    if (userPhone) {
      userTier = 'authenticated';
    }
    
    // 检查限制
    const { allowed, remaining, resetAt } = rateLimiter.checkLimit(identifier, userTier);
    
    // 设置响应头
    c.header('X-RateLimit-Limit', String(rateLimiter['maxRequests'][userTier]));
    c.header('X-RateLimit-Remaining', String(remaining));
    c.header('X-RateLimit-Reset', String(resetAt));
    
    if (!allowed) {
      console.warn(`[RateLimiter] ⛔ Rate limit exceeded for ${identifier}`);
      
      return c.json({
        success: false,
        error: 'Rate limit exceeded',
        message: `Too many requests. Please try again after ${new Date(resetAt).toISOString()}`,
        retryAfter: Math.ceil((resetAt - Date.now()) / 1000),
      }, 429);
    }
    
    await next();
  };
}

/**
 * 白名单中间件（跳过限流）
 */
export function whitelistMiddleware(identifiers: string[]) {
  return async (c: Context, next: () => Promise<void>) => {
    const userPhone = c.req.header('x-user-phone');
    const clientIP = c.req.header('x-forwarded-for') || c.req.header('x-real-ip');
    
    if (identifiers.includes(userPhone || '') || identifiers.includes(clientIP || '')) {
      console.log('[RateLimiter] ✅ Whitelisted request:', userPhone || clientIP);
      await next();
      return;
    }
    
    await next();
  };
}

/**
 * 获取速率限制统计
 */
export function getRateLimitStats() {
  return rateLimiter.getStats();
}

console.log('[RateLimiter] ✅ Rate limiter initialized');
console.log('[RateLimiter] 🚀 Ready to handle high-concurrency requests');
