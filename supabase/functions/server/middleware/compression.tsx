/**
 * 响应压缩中间件
 * 减少网络传输数据量，提升响应速度
 * 
 * 注意：不要读取response.body，它只能读取一次
 * 我们只添加HTTP头，实际压缩由Deno Deploy处理
 */

import type { Context } from "npm:hono";

/**
 * 压缩中间件 - 简化版
 * 只添加压缩提示头，不实际处理body
 */
export function compressionMiddleware() {
  return async (c: Context, next: () => Promise<void>) => {
    await next();
    
    const contentType = c.res.headers.get('content-type');
    
    // 只处理JSON响应
    if (contentType?.includes('application/json')) {
      // 添加压缩提示头，Deno Deploy会自动处理gzip压缩
      const headers = new Headers(c.res.headers);
      headers.set('X-Compress-Enabled', 'true');
      
      // 创建新响应保留原始body
      c.res = new Response(c.res.body, {
        status: c.res.status,
        statusText: c.res.statusText,
        headers,
      });
    }
  };
}

/**
 * 缓存控制中间件
 */
export function cacheControlMiddleware(maxAge: number = 300) {
  return async (c: Context, next: () => Promise<void>) => {
    await next();
    
    // 设置缓存头
    const headers = new Headers(c.res.headers);
    headers.set('Cache-Control', `public, max-age=${maxAge}`);
    headers.set('X-Cache-Max-Age', String(maxAge));
    
    // 创建新响应保留原始body
    c.res = new Response(c.res.body, {
      status: c.res.status,
      statusText: c.res.statusText,
      headers,
    });
  };
}

console.log('[Compression] ✅ Compression middleware initialized (header-only mode)');
