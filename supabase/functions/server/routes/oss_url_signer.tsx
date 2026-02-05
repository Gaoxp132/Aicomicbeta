/**
 * OSS URL签名路由
 * 为阿里云OSS的URL生成签名URL，用于访问私有bucket的资源
 * 如果bucket是公共读的，则返回不带签名的干净URL
 */

import type { Context } from "npm:hono@4.0.2";
import * as ossService from "../video/aliyun_oss.tsx";

/**
 * 从URL中移除所有OSS签名参数，返回干净的公开URL
 */
function cleanOSSUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    // 移除所有OSS签名相关参数
    const paramsToRemove = ['OSSAccessKeyId', 'Expires', 'Signature', 'security-token'];
    
    paramsToRemove.forEach(param => {
      urlObj.searchParams.delete(param);
    });
    
    // 移除所有 x-oss- 开头的参数
    Array.from(urlObj.searchParams.keys()).forEach(key => {
      if (key.startsWith('x-oss-')) {
        urlObj.searchParams.delete(key);
      }
    });
    
    return urlObj.toString();
  } catch (error) {
    console.error('[OSS Clean URL] Failed to clean URL:', error);
    return url;
  }
}

/**
 * 检查bucket是否为公共读
 */
async function isBucketPublicRead(): Promise<boolean> {
  try {
    const bucketName = Deno.env.get('ALIYUN_OSS_BUCKET_NAME');
    const accessKeyId = Deno.env.get('ALIYUN_OSS_ACCESS_KEY_ID');
    const accessKeySecret = Deno.env.get('ALIYUN_OSS_ACCESS_KEY_SECRET');
    const region = Deno.env.get('ALIYUN_OSS_REGION') || 'cn-shenzhen';
    
    if (!bucketName || !accessKeyId || !accessKeySecret) {
      return false;
    }
    
    // 构建OSS API请求
    const regionPart = region.startsWith('oss-') ? region : `oss-${region}`;
    const host = `${bucketName}.${regionPart}.aliyuncs.com`;
    const url = `https://${host}/?acl`;
    
    // 生成签名
    const date = new Date().toUTCString();
    const resource = `/${bucketName}/?acl`;
    const stringToSign = `GET\\n\\n\\n${date}\\n${resource}`;
    
    // HMAC-SHA1签名
    const encoder = new TextEncoder();
    const keyData = encoder.encode(accessKeySecret);
    const messageData = encoder.encode(stringToSign);
    
    const key = await crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'HMAC', hash: 'SHA-1' },
      false,
      ['sign']
    );
    
    const signature = await crypto.subtle.sign('HMAC', key, messageData);
    const signatureArray = new Uint8Array(signature);
    
    // Base64编码
    const base64Sig = btoa(String.fromCharCode(...signatureArray));
    
    // 🆕 添加超时控制（20秒）
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 20000); // 🔥 增加到20秒超时
    
    try {
      // 发送请求
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Host': host,
          'Date': date,
          'Authorization': `OSS ${accessKeyId}:${base64Sig}`,
        },
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      
      if (response.ok) {
        const responseText = await response.text();
        const aclMatch = responseText.match(/<Grant>(.*?)<\/Grant>/);
        const acl = aclMatch ? aclMatch[1] : '';
        
        console.log('[OSS Sign] Bucket ACL:', acl);
        return acl === 'public-read';
      }
      
      // 🆕 如果请求失败，假设是公开的（降级策略）
      console.warn('[OSS Sign] Failed to check ACL, response status:', response.status);
      console.warn('[OSS Sign] Assuming bucket is PUBLIC-READ (fallback strategy)');
      return true;
    } catch (fetchError: any) {
      clearTimeout(timeoutId);
      if (fetchError.name === 'AbortError') {
        console.error('[OSS Sign] ACL check timeout after 20s'); // 🔥 更新日志
      } else {
        console.error('[OSS Sign] ACL check fetch error:', fetchError.message);
      }
      // 🆕 超时或错误时，假设是公开的（降级策略）
      console.warn('[OSS Sign] Assuming bucket is PUBLIC-READ (fallback strategy)');
      return true;
    }
  } catch (error) {
    console.error('[OSS Sign] Failed to check bucket ACL:', error);
    // 🆕 发生错误时，假设是公开的（降级策略）
    console.warn('[OSS Sign] Assuming bucket is PUBLIC-READ (fallback strategy)');
    return true;
  }
}

// 缓存bucket ACL状态（避免每次请求都检查）
let bucketACLCache: { isPublic: boolean; timestamp: number } | null = null;
const CACHE_TTL = 300000; // 🔥 缓存5分钟（从1分钟增加到5分钟）

/**
 * 获取bucket ACL状态（带缓存）
 */
async function getBucketACLCached(): Promise<boolean> {
  const now = Date.now();
  
  // 🔥 FIX: 检查环境变量，是否跳过 ACL 检查
  const skipACLCheck = Deno.env.get('OSS_SKIP_ACL_CHECK') === 'true';
  if (skipACLCheck) {
    console.log('[OSS Sign] ⚡ OSS_SKIP_ACL_CHECK=true, assuming bucket is PUBLIC-READ (no ACL check)');
    // 直接返回 true，假设 bucket 是公共读的
    return true;
  }
  
  if (bucketACLCache && (now - bucketACLCache.timestamp) < CACHE_TTL) {
    console.log('[OSS Sign] Using cached ACL status:', bucketACLCache.isPublic); // 🔥 添加日志
    return bucketACLCache.isPublic;
  }
  
  console.log('[OSS Sign] Fetching fresh ACL status...'); // 🔥 添加日志
  
  // 🔥 FIX: 使用 Promise.race 和更短的超时（5秒），超时直接返回 true
  try {
    const isPublic = await Promise.race([
      isBucketPublicRead(),
      new Promise<boolean>((resolve) => 
        setTimeout(() => {
          console.warn('[OSS Sign] ⚠️ ACL check taking too long (5s), assuming PUBLIC-READ');
          resolve(true); // 超时时假设是公共读的
        }, 5000)
      )
    ]);
    
    bucketACLCache = { isPublic, timestamp: now };
    console.log('[OSS Sign] Cached ACL status:', isPublic, 'for', CACHE_TTL / 1000, 'seconds'); // 🔥 添加日志
    
    return isPublic;
  } catch (error) {
    console.error('[OSS Sign] ⚠️ ACL check error:', error);
    // 错误时也假设是公共读的
    console.warn('[OSS Sign] Assuming bucket is PUBLIC-READ due to error');
    return true;
  }
}

// 🆕 启动时预热ACL缓存（后台执行，不阻塞启动）
// 🔥 FIX: 只在没有设置跳过标志时才预热
if (Deno.env.get('OSS_SKIP_ACL_CHECK') !== 'true') {
  setTimeout(async () => {
    try {
      console.log('[OSS Sign] 🔄 Warming up ACL cache in background...');
      await getBucketACLCached();
      console.log('[OSS Sign] ✅ ACL cache warmed up successfully');
    } catch (error) {
      console.error('[OSS Sign] ⚠️ ACL cache warmup failed:', error);
      // 忽略错误，不影响启动
    }
  }, 2000); // 启动后2秒开始预热
} else {
  console.log('[OSS Sign] ⚡ ACL check is DISABLED (OSS_SKIP_ACL_CHECK=true), assuming all buckets are PUBLIC-READ');
}

/**
 * 清除ACL缓存（用于强制刷新）
 */
export function clearACLCache(c: Context) {
  console.log('[OSS Sign] Clearing ACL cache');
  bucketACLCache = null;
  
  return c.json({
    success: true,
    message: 'ACL缓存已清除',
  });
}

/**
 * 为OSS URL生成签名URL（或返回公开URL）
 * POST /oss/sign-url
 * Body: { url: string, expiresIn?: number }
 */
export async function signOSSUrl(c: Context) {
  try {
    const body = await c.req.json();
    const { url, expiresIn = 3600 } = body;  // 默认1小时过期
    
    if (!url) {
      return c.json({
        success: false,
        error: 'URL参数必填',
      }, 400);
    }
    
    console.log('[OSS Sign] Signing URL:', url.substring(0, 100) + '...');
    console.log('[OSS Sign] Expires in:', expiresIn, 'seconds');
    
    // 🆕 首先检查bucket是否为公共读
    const isPublicRead = await getBucketACLCached();
    
    if (isPublicRead) {
      console.log('[OSS Sign] ✅ Bucket is public-read, returning clean URL without signature');
      const cleanUrl = cleanOSSUrl(url);
      
      return c.json({
        success: true,
        data: {
          originalUrl: url,
          signedUrl: cleanUrl,
          expiresIn: null, // 公开URL永不过期
          expiresAt: null,
          isPublicRead: true,
          note: 'Bucket是公共读的，无需签名即可访问',
        },
      });
    }
    
    console.log('[OSS Sign] Bucket is private, generating signed URL');
    
    // 从URL中提取bucket和object path
    // URL格式: https://bucketname.oss-cn-shenzhen.aliyuncs.com/path/to/file.mp4
    const urlObj = new URL(url);
    const hostParts = urlObj.hostname.split('.');
    const urlBucket = hostParts[0];  // 从URL中提取的bucket名称
    const objectPath = urlObj.pathname.substring(1);  // 移除开头的 /
    
    console.log('[OSS Sign] URL Bucket:', urlBucket);
    console.log('[OSS Sign] Object path:', objectPath);
    
    // 🔧 关键修复：检测URL中的bucket是否与当前配置一致
    const currentBucket = Deno.env.get('ALIYUN_OSS_BUCKET_NAME') || 'aicomic-awarelife';
    
    let signedUrl: string;
    let isLegacy = false;
    
    if (urlBucket !== currentBucket) {
      console.warn(`[OSS Sign] ⚠️ Bucket mismatch detected!`);
      console.warn(`[OSS Sign]    URL bucket: ${urlBucket}`);
      console.warn(`[OSS Sign]    Current bucket: ${currentBucket}`);
      console.warn(`[OSS Sign]    Using URL's bucket for signing...`);
      
      // 🎯 使用URL中指定的bucket生成签名
      signedUrl = await ossService.generateSignedUrlForBucket(objectPath, urlBucket, expiresIn);
      isLegacy = true;
    } else {
      // 使用默认bucket生成签名
      signedUrl = await ossService.generateSignedUrl(objectPath, expiresIn);
    }
    
    console.log('[OSS Sign] ✅ Signed URL generated successfully');
    
    const response: any = {
      success: true,
      data: {
        originalUrl: url,
        signedUrl,
        expiresIn,
        expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
      },
    };
    
    // 添加Legacy警告
    if (isLegacy) {
      response.data.warning = `此视频存储在旧bucket (${urlBucket}) 中，建议迁移到新bucket (${currentBucket})`;
      response.data.isLegacy = true;
      response.data.urlBucket = urlBucket;
      response.data.currentBucket = currentBucket;
    }
    
    return c.json(response);
  } catch (error: any) {
    console.error('[OSS Sign] ❌ Error:', error);
    return c.json({
      success: false,
      error: error.message || '生成签名URL失败',
    }, 500);
  }
}

/**
 * 批量签名OSS URLs
 * POST /oss/sign-urls
 * Body: { urls: string[], expiresIn?: number }
 */
export async function signOSSUrls(c: Context) {
  try {
    const body = await c.req.json();
    const { urls, expiresIn = 3600 } = body;
    
    if (!urls || !Array.isArray(urls)) {
      return c.json({
        success: false,
        error: 'urls参数必须是数组',
      }, 400);
    }
    
    console.log('[OSS Sign Batch] Signing', urls.length, 'URLs');
    
    // 🆕 检查bucket是否为公共读
    const isPublicRead = await getBucketACLCached();
    
    if (isPublicRead) {
      console.log('[OSS Sign Batch] ✅ Bucket is public-read, returning clean URLs without signature');
      
      const results = urls.map(url => ({
        originalUrl: url,
        signedUrl: cleanOSSUrl(url),
        success: true,
        isPublicRead: true,
      }));
      
      return c.json({
        success: true,
        data: {
          results,
          total: urls.length,
          successCount: urls.length,
          failedCount: 0,
          isPublicRead: true,
          note: 'Bucket是公共读的，无需签名即可访问',
        },
      });
    }
    
    console.log('[OSS Sign Batch] Bucket is private, generating signed URLs');
    
    const currentBucket = Deno.env.get('ALIYUN_OSS_BUCKET_NAME') || 'aicomic-awarelife';
    
    const results = await Promise.all(
      urls.map(async (url) => {
        try {
          const urlObj = new URL(url);
          const hostParts = urlObj.hostname.split('.');
          const urlBucket = hostParts[0];
          const objectPath = urlObj.pathname.substring(1);
          
          let signedUrl: string;
          let isLegacy = false;
          
          // 🔧 根据bucket选择签名方法
          if (urlBucket !== currentBucket) {
            console.log(`[OSS Sign Batch] Using legacy bucket (${urlBucket}) for URL:`, url.substring(0, 80) + '...');
            signedUrl = await ossService.generateSignedUrlForBucket(objectPath, urlBucket, expiresIn);
            isLegacy = true;
          } else {
            signedUrl = await ossService.generateSignedUrl(objectPath, expiresIn);
          }
          
          return {
            originalUrl: url,
            signedUrl,
            success: true,
            isLegacy,
            urlBucket: isLegacy ? urlBucket : undefined,
          };
        } catch (error: any) {
          console.error('[OSS Sign Batch] Failed to sign URL:', url, error.message);
          return {
            originalUrl: url,
            error: error.message,
            success: false,
          };
        }
      })
    );
    
    const successCount = results.filter(r => r.success).length;
    const legacyCount = results.filter(r => r.isLegacy).length;
    
    console.log('[OSS Sign Batch] ✅ Signed', successCount, '/', urls.length, 'URLs');
    if (legacyCount > 0) {
      console.log('[OSS Sign Batch] ⚠️', legacyCount, 'URLs from legacy bucket');
    }
    
    return c.json({
      success: true,
      data: {
        results,
        total: urls.length,
        successCount,
        failedCount: urls.length - successCount,
        legacyCount,
        expiresIn,
        expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
      },
    });
  } catch (error: any) {
    console.error('[OSS Sign Batch] ❌ Error:', error);
    return c.json({
      success: false,
      error: error.message || '批量签名失败',
    }, 500);
  }
}