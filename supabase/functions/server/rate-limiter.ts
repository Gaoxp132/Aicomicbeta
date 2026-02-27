/**
 * 速率限制模块
 * v6.0.77
 */

import type { RateLimitResult } from "./types.ts";

export function createRateLimiter(maxRequests: number, windowMs: number = 60_000) {
  const map = new Map<string, number[]>();
  
  return {
    check(key: string): RateLimitResult {
      const now = Date.now();
      const timestamps = (map.get(key) || []).filter(t => now - t < windowMs);
      
      if (timestamps.length >= maxRequests) {
        const retryAfter = Math.ceil((timestamps[0] + windowMs - now) / 1000);
        return { allowed: false, remaining: 0, retryAfter };
      }
      
      timestamps.push(now);
      map.set(key, timestamps);
      
      // 清理过期条目
      if (map.size > 500) {
        for (const [k, ts] of map) {
          if (ts.every(t => now - t > windowMs)) map.delete(k);
        }
      }
      
      return { allowed: true, remaining: maxRequests - timestamps.length };
    },
  };
}

// 预定义的限流器
export const rateLimiters = {
  upload:        createRateLimiter(5, 60_000),   // 上传: 5次/分钟
  generate:      createRateLimiter(10, 60_000),  // 视频生成: 10次/分钟
  createSeries:  createRateLimiter(3, 60_000),   // 创建系列: 3次/分钟
  aiGenerate:    createRateLimiter(5, 60_000),   // AI文本生成: 5次/分钟
  comment:       createRateLimiter(20, 60_000),  // 评论: 20次/分钟
};