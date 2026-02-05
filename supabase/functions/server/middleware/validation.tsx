/**
 * 输入验证中间件
 * 提供通用的输入验证、请求去重和限流功能
 */

import type { Context, Next } from "npm:hono";

// ==================== 请求去重 ====================

const pendingRequests = new Map<string, Promise<any>>();

/**
 * 请求去重中间件
 * 防止重复的请求同时执行，提升性能
 */
export function requestDeduplication() {
  return async (c: Context, next: Next) => {
    const method = c.req.method;
    
    // 只对GET请求进行去重
    if (method !== 'GET') {
      return next();
    }
    
    const requestKey = `${method}:${c.req.url}`;
    
    // 检查是否有相同的请求正在处理
    if (pendingRequests.has(requestKey)) {
      console.log(`[RequestDedup] ⏭️ Reusing pending request: ${requestKey}`);
      const result = await pendingRequests.get(requestKey);
      return c.json(result);
    }
    
    // 创建新的请求Promise
    const requestPromise = (async () => {
      try {
        await next();
        return c.res;
      } finally {
        // 请求完成后清理
        pendingRequests.delete(requestKey);
      }
    })();
    
    pendingRequests.set(requestKey, requestPromise);
    
    return requestPromise;
  };
}

// ==================== 输入验证 ====================

/**
 * 验证手机号格式
 */
export function validatePhoneNumber(phone: string): boolean {
  if (!phone) return false;
  // 中国手机号：11位数字
  return /^1[3-9]\d{9}$/.test(phone);
}

/**
 * 验证ID格式（UUID或自定义格式）
 */
export function validateId(id: string): boolean {
  if (!id) return false;
  // UUID格式或自定义series-/episode-格式
  return /^[a-f0-9-]+$/i.test(id) || /^(series|episode|storyboard|comment)-[a-z0-9-]+$/i.test(id);
}

/**
 * 验证分页参数
 */
export function validatePagination(page: string, limit: string): { page: number; limit: number; offset: number } | null {
  const pageNum = parseInt(page);
  const pageSize = parseInt(limit);
  
  if (isNaN(pageNum) || isNaN(pageSize) || pageNum < 1 || pageSize < 1 || pageSize > 100) {
    return null;
  }
  
  return {
    page: pageNum,
    limit: pageSize,
    offset: (pageNum - 1) * pageSize,
  };
}

/**
 * 清理和验证文本输入
 */
export function sanitizeText(text: string, maxLength: number = 1000): string | null {
  if (!text || typeof text !== 'string') return null;
  
  // 移除前后空格
  const cleaned = text.trim();
  
  if (cleaned.length === 0 || cleaned.length > maxLength) {
    return null;
  }
  
  // 基本XSS防护：移除潜在的HTML标签
  const sanitized = cleaned.replace(/<[^>]*>/g, '');
  
  return sanitized;
}

// ==================== 验证中间件 ====================

/**
 * 验证手机号参数
 */
export function requirePhoneNumber() {
  return async (c: Context, next: Next) => {
    const body = await c.req.json().catch(() => ({}));
    const userPhone = body.userPhone || c.req.query('userPhone');
    
    if (!userPhone || !validatePhoneNumber(userPhone)) {
      return c.json({
        success: false,
        error: '无效的手机号',
        message: '请提供有效的11位中国手机号',
      }, 400);
    }
    
    // 将验证后的手机号存储到context中
    c.set('userPhone', userPhone);
    
    return next();
  };
}

/**
 * 验证seriesId参数
 */
export function requireSeriesId() {
  return async (c: Context, next: Next) => {
    const seriesId = c.req.param('seriesId');
    
    if (!seriesId || !validateId(seriesId)) {
      return c.json({
        success: false,
        error: '无效的漫剧ID',
      }, 400);
    }
    
    c.set('seriesId', seriesId);
    
    return next();
  };
}

// ==================== 限流 ====================

const rateLimitStore = new Map<string, { count: number; resetTime: number }>();

/**
 * 简单的限流中间件
 * @param maxRequests 时间窗口内最大请求数
 * @param windowMs 时间窗口（毫秒）
 */
export function rateLimit(maxRequests: number = 100, windowMs: number = 60000) {
  return async (c: Context, next: Next) => {
    const ip = c.req.header('x-forwarded-for') || c.req.header('cf-connecting-ip') || 'unknown';
    const key = `ratelimit:${ip}`;
    const now = Date.now();
    
    let record = rateLimitStore.get(key);
    
    // 如果记录过期，重置
    if (!record || record.resetTime < now) {
      record = {
        count: 0,
        resetTime: now + windowMs,
      };
      rateLimitStore.set(key, record);
    }
    
    // 检查是否超过限制
    if (record.count >= maxRequests) {
      const retryAfter = Math.ceil((record.resetTime - now) / 1000);
      console.warn(`[RateLimit] ⚠️ Rate limit exceeded for ${ip}`);
      return c.json({
        success: false,
        error: '请求过于频繁',
        message: `请在${retryAfter}秒后重试`,
        retryAfter,
      }, 429);
    }
    
    // 增加计数
    record.count++;
    
    return next();
  };
}

// ==================== 定期清理 ====================

// 每5分钟清理过期的限流记录
setInterval(() => {
  const now = Date.now();
  let cleaned = 0;
  
  for (const [key, record] of rateLimitStore.entries()) {
    if (record.resetTime < now) {
      rateLimitStore.delete(key);
      cleaned++;
    }
  }
  
  if (cleaned > 0) {
    console.log(`[RateLimit] 🧹 Cleaned ${cleaned} expired records`);
  }
}, 5 * 60 * 1000);

// 每1分钟清理超时的待处理请求（防止内存泄漏）
setInterval(() => {
  const count = pendingRequests.size;
  if (count > 100) {
    console.warn(`[RequestDedup] ⚠️ Too many pending requests: ${count}, clearing...`);
    pendingRequests.clear();
  }
}, 60 * 1000);
