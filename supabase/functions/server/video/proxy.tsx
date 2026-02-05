// 视频代理服务 - 用于绕过过期的签名URL
import type { Context } from "npm:hono";

/**
 * 代理视频请求
 * 当视频URL签名过期时，通过服务器代理请求
 */
export async function proxyVideo(c: Context) {
  try {
    const originalUrl = c.req.query("url");
    
    if (!originalUrl) {
      return c.json({ error: "Missing url parameter" }, 400);
    }
    
    console.log('[Proxy] Proxying video request:', originalUrl);
    
    // 尝试直接请求原始URL（即使签名过期）
    // 有些CDN可能仍然允许访问
    const response = await fetch(originalUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; VideoProxy/1.0)',
      },
    });
    
    console.log('[Proxy] Response status:', response.status);
    console.log('[Proxy] Response headers:', Object.fromEntries(response.headers.entries()));
    
    if (!response.ok) {
      console.error('[Proxy] Failed to fetch video:', response.status, response.statusText);
      
      // 尝试无签名的公开URL
      const publicUrl = tryPublicUrl(originalUrl);
      if (publicUrl !== originalUrl) {
        console.log('[Proxy] Trying public URL:', publicUrl);
        const publicResponse = await fetch(publicUrl);
        
        if (publicResponse.ok) {
          console.log('[Proxy] Public URL works!');
          // 将视频流返回给客户端
          return new Response(publicResponse.body, {
            headers: {
              'Content-Type': publicResponse.headers.get('Content-Type') || 'video/mp4',
              'Content-Length': publicResponse.headers.get('Content-Length') || '',
              'Accept-Ranges': 'bytes',
              'Cache-Control': 'public, max-age=3600',
            },
          });
        }
      }
      
      return c.json({ 
        error: "Failed to fetch video",
        status: response.status,
        message: "视频URL已过期且无法访问，请重新生成视频"
      }, response.status);
    }
    
    // 将视频流返回给客户端
    return new Response(response.body, {
      headers: {
        'Content-Type': response.headers.get('Content-Type') || 'video/mp4',
        'Content-Length': response.headers.get('Content-Length') || '',
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch (error: any) {
    console.error('[Proxy] Error:', error);
    return c.json({ 
      error: "Proxy failed",
      message: error.message,
    }, 500);
  }
}

/**
 * 尝试将签名URL转换为公开URL
 */
function tryPublicUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    // 移除所有TOS签名参数
    urlObj.searchParams.delete('X-Tos-Algorithm');
    urlObj.searchParams.delete('X-Tos-Credential');
    urlObj.searchParams.delete('X-Tos-Date');
    urlObj.searchParams.delete('X-Tos-Expires');
    urlObj.searchParams.delete('X-Tos-Signature');
    urlObj.searchParams.delete('X-Tos-SignedHeaders');
    
    return urlObj.toString();
  } catch (error) {
    return url;
  }
}
