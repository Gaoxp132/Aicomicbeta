/**
 * OSS视频代理
 * 用于代理OSS私有bucket的视频请求，绕过CORS和签名问题
 */

import type { Context } from "npm:hono";
import * as ossService from "../video/aliyun_oss.tsx";

/**
 * 代理OSS视频请求
 * GET /oss/proxy?url=<oss-url>
 */
export async function proxyOSSVideo(c: Context) {
  try {
    const url = c.req.query('url');
    
    if (!url) {
      return c.json({
        success: false,
        error: 'url参数必填',
      }, 400);
    }
    
    console.log('[OSS Proxy] Proxying request for:', url.substring(0, 100) + '...');
    
    // 从URL中提取object path
    const urlObj = new URL(url);
    const objectPath = urlObj.pathname.substring(1);
    
    console.log('[OSS Proxy] Object path:', objectPath);
    
    // 生成签名URL
    const signedUrl = await ossService.generateSignedUrl(objectPath, 3600);
    console.log('[OSS Proxy] Signed URL:', signedUrl.substring(0, 200) + '...');
    
    // 从OSS获取视频
    const ossResponse = await fetch(signedUrl);
    
    if (!ossResponse.ok) {
      const errorText = await ossResponse.text();
      console.error('[OSS Proxy] OSS request failed:', ossResponse.status, errorText);
      
      return c.json({
        success: false,
        error: `OSS请求失败: ${ossResponse.status} ${ossResponse.statusText}`,
        details: errorText,
      }, ossResponse.status);
    }
    
    console.log('[OSS Proxy] ✅ Got video from OSS, streaming to client...');
    
    // 获取内容类型和长度
    const contentType = ossResponse.headers.get('content-type') || 'video/mp4';
    const contentLength = ossResponse.headers.get('content-length');
    
    // 设置响应头
    const headers = new Headers({
      'Content-Type': contentType,
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
      'Access-Control-Allow-Headers': 'Range, Content-Type',
      'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Accept-Ranges',
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'public, max-age=3600',
    });
    
    if (contentLength) {
      headers.set('Content-Length', contentLength);
    }
    
    // 支持Range请求（用于视频seek）
    const range = c.req.header('range');
    if (range) {
      console.log('[OSS Proxy] Range request:', range);
      
      // 重新请求OSS带Range头
      const rangedResponse = await fetch(signedUrl, {
        headers: { 'Range': range },
      });
      
      if (rangedResponse.ok || rangedResponse.status === 206) {
        const rangedHeaders = new Headers(headers);
        rangedHeaders.set('Content-Range', rangedResponse.headers.get('content-range') || '');
        rangedHeaders.set('Content-Length', rangedResponse.headers.get('content-length') || '');
        
        return new Response(rangedResponse.body, {
          status: 206,
          headers: rangedHeaders,
        });
      }
    }
    
    // 流式传输视频
    return new Response(ossResponse.body, {
      status: 200,
      headers,
    });
  } catch (error: any) {
    console.error('[OSS Proxy] ❌ Error:', error);
    return c.json({
      success: false,
      error: error.message || 'OSS代理失败',
    }, 500);
  }
}
