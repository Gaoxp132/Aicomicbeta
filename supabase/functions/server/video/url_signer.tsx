// 火山引擎TOS URL签名工具
import { HmacSha256 } from "https://deno.land/std@0.177.0/hash/sha256.ts";

/**
 * 从火山引擎视频URL中提取bucket、region和key
 */
function parseVolcengineUrl(url: string): { bucket: string; region: string; key: string; endpoint: string } | null {
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname;
    
    // 格式: {bucket}.tos-{region}.volces.com
    const match = hostname.match(/^(.+)\.tos-(.+)\.volces\.com$/);
    if (!match) {
      console.error('[URL Signer] Invalid hostname format:', hostname);
      return null;
    }
    
    const bucket = match[1];
    const region = match[2];
    const key = urlObj.pathname.substring(1); // 移除开头的 /
    const endpoint = `https://${hostname}`;
    
    console.log('[URL Signer] Parsed URL:', { bucket, region, key, endpoint });
    return { bucket, region, key, endpoint };
  } catch (error: any) {
    console.error('[URL Signer] Failed to parse URL:', error.message);
    return null;
  }
}

/**
 * 生成新的签名URL（使用query string authentication）
 * 参考：https://www.volcengine.com/docs/6349/71229
 */
export function generateSignedUrl(originalUrl: string, expiresInSeconds: number = 86400): string | null {
  try {
    const parsed = parseVolcengineUrl(originalUrl);
    if (!parsed) {
      return null;
    }
    
    const { bucket, region, key, endpoint } = parsed;
    
    // 获取当前时间（ISO 8601格式）
    const now = new Date();
    const dateString = now.toISOString().replace(/[:\-]|\.\d{3}/g, '').substring(0, 15) + 'Z';
    
    // 构建新的URL（不包含签名）
    const baseUrl = `${endpoint}/${key}`;
    
    // 由于我们没有TOS的AccessKey和SecretKey，只有API Key
    // 我们无法自己生成TOS签名
    // 所以这个方法行不通
    
    console.error('[URL Signer] Cannot generate TOS signature without TOS credentials');
    console.error('[URL Signer] VOLCENGINE_API_KEY is for API access, not TOS signing');
    
    return null;
  } catch (error: any) {
    console.error('[URL Signer] Error generating signed URL:', error.message);
    return null;
  }
}

/**
 * 检查URL是否过期
 */
export function isUrlExpired(url: string): boolean {
  try {
    const urlObj = new URL(url);
    const expiresParam = urlObj.searchParams.get('X-Tos-Expires');
    const dateParam = urlObj.searchParams.get('X-Tos-Date');
    
    if (!expiresParam || !dateParam) {
      console.warn('[URL Signer] Missing expiration parameters');
      return true;
    }
    
    // 解析日期: 20260107T145406Z
    const year = parseInt(dateParam.substring(0, 4));
    const month = parseInt(dateParam.substring(4, 6)) - 1;
    const day = parseInt(dateParam.substring(6, 8));
    const hour = parseInt(dateParam.substring(9, 11));
    const minute = parseInt(dateParam.substring(11, 13));
    const second = parseInt(dateParam.substring(13, 15));
    
    const signedDate = new Date(Date.UTC(year, month, day, hour, minute, second));
    const expiryDate = new Date(signedDate.getTime() + parseInt(expiresParam) * 1000);
    const now = new Date();
    
    const isExpired = now > expiryDate;
    
    if (isExpired) {
      console.log('[URL Signer] URL expired:', {
        signedAt: signedDate.toISOString(),
        expiresAt: expiryDate.toISOString(),
        now: now.toISOString(),
      });
    }
    
    return isExpired;
  } catch (error: any) {
    console.error('[URL Signer] Error checking expiration:', error.message);
    return true;
  }
}

/**
 * 尝试将签名URL转换为公开URL（移除签名参数）
 * 注意：只有当bucket配置为公开读取时才有效
 */
export function tryPublicUrl(url: string): string {
  try {
    const parsed = parseVolcengineUrl(url);
    if (!parsed) {
      return url;
    }
    
    const { endpoint, key } = parsed;
    const publicUrl = `${endpoint}/${key}`;
    
    console.log('[URL Signer] Generated public URL (may not work if bucket is private):', publicUrl);
    return publicUrl;
  } catch (error: any) {
    console.error('[URL Signer] Error generating public URL:', error.message);
    return url;
  }
}
