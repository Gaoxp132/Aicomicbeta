/**
 * 视频URL诊断工具
 * 检查视频URL的可访问性、格式等
 */

import type { Context } from "npm:hono";

/**
 * 诊断视频URL
 * GET /diagnostic/video-url?url=<video-url>
 */
export async function diagnoseVideoUrl(c: Context) {
  try {
    const url = c.req.query('url');
    
    if (!url) {
      return c.json({
        success: false,
        error: 'url参数必填',
      }, 400);
    }
    
    console.log('[Video URL Diagnostic] Testing URL:', url);
    
    const diagnostic: any = {
      url,
      timestamp: new Date().toISOString(),
      tests: {},
    };
    
    // Test 1: HEAD请求
    try {
      console.log('[Video URL Diagnostic] Test 1: HEAD request...');
      const headResponse = await fetch(url, {
        method: 'HEAD',
      });
      
      diagnostic.tests.head = {
        success: headResponse.ok,
        status: headResponse.status,
        statusText: headResponse.statusText,
        headers: {
          contentType: headResponse.headers.get('content-type'),
          contentLength: headResponse.headers.get('content-length'),
          acceptRanges: headResponse.headers.get('accept-ranges'),
          accessControlAllowOrigin: headResponse.headers.get('access-control-allow-origin'),
        },
      };
      
      console.log('[Video URL Diagnostic] HEAD result:', headResponse.status, headResponse.statusText);
    } catch (error: any) {
      diagnostic.tests.head = {
        success: false,
        error: error.message,
      };
      console.error('[Video URL Diagnostic] HEAD failed:', error.message);
    }
    
    // Test 2: GET请求（前1KB）
    try {
      console.log('[Video URL Diagnostic] Test 2: GET request (first 1KB)...');
      const getResponse = await fetch(url, {
        method: 'GET',
        headers: {
          'Range': 'bytes=0-1023',
        },
      });
      
      diagnostic.tests.get = {
        success: getResponse.ok || getResponse.status === 206,
        status: getResponse.status,
        statusText: getResponse.statusText,
        headers: {
          contentType: getResponse.headers.get('content-type'),
          contentRange: getResponse.headers.get('content-range'),
          contentLength: getResponse.headers.get('content-length'),
        },
      };
      
      // 读取前几个字节检查文件签名
      if (getResponse.ok || getResponse.status === 206) {
        const buffer = await getResponse.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        const signature = Array.from(bytes.slice(0, 8)).map(b => b.toString(16).padStart(2, '0')).join(' ');
        
        diagnostic.tests.get.signature = signature;
        diagnostic.tests.get.bytesReceived = bytes.length;
        
        // 检查是否是MP4文件
        // MP4文件通常以 'ftyp' box开始（在偏移4处）
        const ftypCheck = bytes.length >= 8 && 
                          bytes[4] === 0x66 && // 'f'
                          bytes[5] === 0x74 && // 't'
                          bytes[6] === 0x79 && // 'y'
                          bytes[7] === 0x70;   // 'p'
        
        diagnostic.tests.get.looksLikeMp4 = ftypCheck;
        
        console.log('[Video URL Diagnostic] File signature:', signature);
        console.log('[Video URL Diagnostic] Looks like MP4:', ftypCheck);
      }
    } catch (error: any) {
      diagnostic.tests.get = {
        success: false,
        error: error.message,
      };
      console.error('[Video URL Diagnostic] GET failed:', error.message);
    }
    
    // Test 3: 不带Range的GET请求
    try {
      console.log('[Video URL Diagnostic] Test 3: GET request (no range)...');
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      
      const getNoRangeResponse = await fetch(url, {
        method: 'GET',
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      
      diagnostic.tests.getNoRange = {
        success: getNoRangeResponse.ok,
        status: getNoRangeResponse.status,
        statusText: getNoRangeResponse.statusText,
        headers: {
          contentType: getNoRangeResponse.headers.get('content-type'),
          contentLength: getNoRangeResponse.headers.get('content-length'),
        },
      };
      
      console.log('[Video URL Diagnostic] GET (no range) result:', getNoRangeResponse.status);
      
      // 只读取响应头，不读取body
      // 关闭连接
    } catch (error: any) {
      if (error.name === 'AbortError') {
        diagnostic.tests.getNoRange = {
          success: false,
          error: 'Request timeout after 5s (expected for large files)',
          note: 'This is normal - we aborted after getting headers',
        };
      } else {
        diagnostic.tests.getNoRange = {
          success: false,
          error: error.message,
        };
      }
      console.error('[Video URL Diagnostic] GET (no range) error:', error.message);
    }
    
    // 分析结果
    const headOk = diagnostic.tests.head?.success;
    const getOk = diagnostic.tests.get?.success;
    const getNoRangeOk = diagnostic.tests.getNoRange?.success;
    const looksLikeMp4 = diagnostic.tests.get?.looksLikeMp4;
    const hasCorrectContentType = diagnostic.tests.get?.headers?.contentType?.includes('video');
    
    diagnostic.summary = {
      accessible: headOk || getOk || getNoRangeOk,
      validVideoFile: looksLikeMp4 && hasCorrectContentType,
      supportsRangeRequests: diagnostic.tests.head?.headers?.acceptRanges === 'bytes',
      hasCorsHeaders: !!diagnostic.tests.head?.headers?.accessControlAllowOrigin,
    };
    
    diagnostic.recommendations = [];
    
    if (!diagnostic.summary.accessible) {
      diagnostic.recommendations.push('❌ 视频文件无法访问 - 检查URL是否正确或文件是否存在');
    }
    
    if (!diagnostic.summary.validVideoFile) {
      diagnostic.recommendations.push('❌ 文件不是有效的MP4视频 - 可能已损坏或格式不正确');
    }
    
    if (!diagnostic.summary.supportsRangeRequests) {
      diagnostic.recommendations.push('⚠️ 服务器不支持Range请求 - 可能影响视频拖拽功能');
    }
    
    if (!diagnostic.summary.hasCorsHeaders) {
      diagnostic.recommendations.push('⚠️ 缺少CORS头 - 可能导致浏览器跨域访问失败');
    }
    
    if (diagnostic.recommendations.length === 0) {
      diagnostic.recommendations.push('✅ 视频URL看起来正常');
    }
    
    console.log('[Video URL Diagnostic] Summary:', diagnostic.summary);
    console.log('[Video URL Diagnostic] Recommendations:', diagnostic.recommendations);
    
    return c.json({
      success: true,
      data: diagnostic,
    });
    
  } catch (error: any) {
    console.error('[Video URL Diagnostic] Error:', error);
    return c.json({
      success: false,
      error: error.message,
    }, 500);
  }
}

/**
 * 批量诊断视频URLs
 * POST /diagnostic/video-urls
 * Body: { urls: string[] }
 */
export async function diagnoseVideoUrls(c: Context) {
  try {
    const body = await c.req.json();
    const { urls } = body;
    
    if (!urls || !Array.isArray(urls)) {
      return c.json({
        success: false,
        error: 'urls参数必须是数组',
      }, 400);
    }
    
    console.log('[Video URLs Diagnostic] Testing', urls.length, 'URLs...');
    
    const results = await Promise.all(
      urls.map(async (url, index) => {
        console.log(`[Video URLs Diagnostic] Testing URL ${index + 1}/${urls.length}...`);
        
        try {
          // 简化版诊断：只测试HEAD
          const headResponse = await fetch(url, {
            method: 'HEAD',
          });
          
          return {
            url,
            success: headResponse.ok,
            status: headResponse.status,
            statusText: headResponse.statusText,
            contentType: headResponse.headers.get('content-type'),
            contentLength: headResponse.headers.get('content-length'),
          };
        } catch (error: any) {
          return {
            url,
            success: false,
            error: error.message,
          };
        }
      })
    );
    
    const successCount = results.filter(r => r.success).length;
    const failedCount = urls.length - successCount;
    
    console.log('[Video URLs Diagnostic] Results:', successCount, 'success,', failedCount, 'failed');
    
    return c.json({
      success: true,
      data: {
        results,
        total: urls.length,
        successCount,
        failedCount,
      },
    });
    
  } catch (error: any) {
    console.error('[Video URLs Diagnostic] Error:', error);
    return c.json({
      success: false,
      error: error.message,
    }, 500);
  }
}
