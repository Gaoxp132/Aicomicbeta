/**
 * OSS服务模块 - 阿里云OSS文件上传
 * v6.0.138: 新增 ensureOSSCors() 自动配置CORS + generatePresignedGetUrl() 预签名下载
 */

import { fetchWithTimeout } from "./utils.ts";

const OSS_ACCESS_KEY_ID = Deno.env.get('ALIYUN_OSS_ACCESS_KEY_ID') || '';
const OSS_ACCESS_KEY_SECRET = Deno.env.get('ALIYUN_OSS_ACCESS_KEY_SECRET') || '';
const OSS_BUCKET = Deno.env.get('ALIYUN_OSS_BUCKET_NAME') || '';
// v5.5.1: 标准化 OSS_REGION — 确保始终带 oss- 前缀
const _rawOssRegion = Deno.env.get('ALIYUN_OSS_REGION') || 'oss-cn-beijing';
const OSS_REGION = _rawOssRegion.startsWith('oss-') ? _rawOssRegion : `oss-${_rawOssRegion}`;

export function isOSSConfigured(): boolean {
  return !!(OSS_ACCESS_KEY_ID && OSS_ACCESS_KEY_SECRET && OSS_BUCKET && OSS_REGION);
}

/**
 * 使用 OSS REST API + HMAC-SHA1 签名上传文件到阿里云 OSS
 */
export async function uploadToOSS(objectKey: string, data: ArrayBuffer, contentType: string): Promise<string> {
  const date = new Date().toUTCString();
  const resource = `/${OSS_BUCKET}/${objectKey}`;

  // OSS V1 签名: VERB + "\n" + Content-MD5 + "\n" + Content-Type + "\n" + Date + "\n" + CanonicalizedResource
  const stringToSign = `PUT\n\n${contentType}\n${date}\n${resource}`;

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(OSS_ACCESS_KEY_SECRET),
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign']
  );
  const sigBytes = await crypto.subtle.sign('HMAC', key, encoder.encode(stringToSign));
  const sigBase64 = btoa(String.fromCharCode(...new Uint8Array(sigBytes)));

  const endpoint = `https://${OSS_BUCKET}.${OSS_REGION}.aliyuncs.com/${objectKey}`;
  const resp = await fetch(endpoint, {
    method: 'PUT',
    headers: {
      'Date': date,
      'Authorization': `OSS ${OSS_ACCESS_KEY_ID}:${sigBase64}`,
      'Content-Type': contentType,
    },
    body: data,
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`OSS upload failed (${resp.status}): ${errText.substring(0, 300)}`);
  }

  return endpoint;
}

/**
 * 从远程 URL 下载文件并转存到阿里云 OSS
 * v6.0.160: 新增 refreshUrlFn 可选回调——下载403时自动刷新TOS URL并重试
 * @param refreshUrlFn 可选：当下载返回403时调用此函数获取新鲜URL，返回null表示无法刷新
 * @returns { url, transferred }；如果 OSS 未配置或上传失败，返回原始 URL（或刷新后的URL）
 */
export async function transferFileToOSS(
  sourceUrl: string,
  objectKey: string,
  fallbackContentType = 'video/mp4',
  refreshUrlFn?: () => Promise<string | null>
): Promise<{ url: string; transferred: boolean }> {
  if (!isOSSConfigured()) {
    console.warn('[OSS] Not configured, skipping transfer');
    return { url: sourceUrl, transferred: false };
  }

  // 已经在 OSS 上的不重复转存
  if (sourceUrl.includes('.aliyuncs.com')) {
    return { url: sourceUrl, transferred: true };
  }

  // v6.0.160: 内部下载+上传逻辑，支持URL刷新后重试
  async function downloadAndUpload(url: string): Promise<{ url: string; transferred: boolean }> {
    const resp = await fetchWithTimeout(url, {}, 120000);
    if (!resp.ok) throw new Error(`Download failed: HTTP ${resp.status}`);
    const buf = await resp.arrayBuffer();
    const ct = resp.headers.get('content-type') || fallbackContentType;
    console.log(`[OSS] Downloaded ${(buf.byteLength / 1024 / 1024).toFixed(2)} MB, uploading to ${objectKey}`);
    const ossUrl = await uploadToOSS(objectKey, buf, ct);
    console.log(`[OSS] Transferred to OSS: ${ossUrl}`);
    return { url: ossUrl, transferred: true };
  }

  console.log(`[OSS] Downloading from: ${sourceUrl.substring(0, 100)}...`);
  try {
    return await downloadAndUpload(sourceUrl);
  } catch (err: any) {
    // v6.0.160/173: 403通常是TOS签名URL过期——如果有refreshUrlFn，尝试获取新鲜URL重试
    const is403 = err.message?.includes('HTTP 403');
    const isTosUrl = sourceUrl.includes('volces.com') || sourceUrl.includes('tos-cn') || sourceUrl.includes('volcengineapi.com');
    // v6.0.173: 只要有refreshUrlFn且是403就尝试刷新（不限TOS域名，避免遗漏新域名格式）
    if (is403 && refreshUrlFn) {
      console.log(`[OSS] TOS URL expired (403) for ${objectKey}, attempting URL refresh...`);
      try {
        const freshUrl = await refreshUrlFn();
        if (freshUrl && freshUrl !== sourceUrl && freshUrl.startsWith('http')) {
          console.log(`[OSS] Got fresh URL, retrying download for ${objectKey}...`);
          try {
            const result = await downloadAndUpload(freshUrl);
            return result;
          } catch (retryErr: any) {
            console.error(`[OSS] Retry with fresh URL also failed for ${objectKey}: ${retryErr.message}`);
            return { url: freshUrl, transferred: false };
          }
        } else {
          console.warn(`[OSS] URL refresh returned no usable URL for ${objectKey}`);
        }
      } catch (refreshErr: any) {
        console.warn(`[OSS] URL refresh failed for ${objectKey}: ${refreshErr.message}`);
      }
    }
    console.error(`[OSS] Transfer failed for ${objectKey}: ${err.message}${is403 && isTosUrl ? ' (TOS URL expired)' : ''}`);
    return { url: sourceUrl, transferred: false };
  }
}

/**
 * 生成 OSS 预签名 PUT URL（供浏览器直传，无需经由 Edge Function 中转）
 * v6.0.126: 支持前端直接上传合并后的完整集视频到 OSS
 */
export async function generatePresignedPutUrl(
  objectKey: string,
  contentType: string = 'video/mp4',
  expiresIn: number = 7200
): Promise<string> {
  if (!isOSSConfigured()) {
    throw new Error('OSS未配置，无法生成上传URL');
  }
  const expires = Math.floor(Date.now() / 1000) + expiresIn;
  const resource = `/${OSS_BUCKET}/${objectKey}`;
  // OSS V1预签名：PUT + Content-Type + Expires + Resource（无Content-MD5）
  const stringToSign = `PUT\n\n${contentType}\n${expires}\n${resource}`;

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(OSS_ACCESS_KEY_SECRET),
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign']
  );
  const sigBytes = await crypto.subtle.sign('HMAC', key, encoder.encode(stringToSign));
  const signature = btoa(String.fromCharCode(...new Uint8Array(sigBytes)));

  const endpoint = `https://${OSS_BUCKET}.${OSS_REGION}.aliyuncs.com/${objectKey}`;
  const params = new URLSearchParams({
    OSSAccessKeyId: OSS_ACCESS_KEY_ID,
    Expires: String(expires),
    Signature: signature,
  });
  return `${endpoint}?${params.toString()}`;
}

/**
 * 生成 OSS 预签名 GET URL（供浏览器跨域下载视频）
 * v6.0.138: CORS 配置生效前的兜底方案——预签名URL自带鉴权，不依赖桶公开读权限
 */
export async function generatePresignedGetUrl(
  objectKey: string,
  expiresIn: number = 7200
): Promise<string> {
  if (!isOSSConfigured()) {
    throw new Error('OSS未配置，无法生成下载URL');
  }
  const expires = Math.floor(Date.now() / 1000) + expiresIn;
  const resource = `/${OSS_BUCKET}/${objectKey}`;
  const stringToSign = `GET\n\n\n${expires}\n${resource}`;

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(OSS_ACCESS_KEY_SECRET),
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign']
  );
  const sigBytes = await crypto.subtle.sign('HMAC', key, encoder.encode(stringToSign));
  const signature = btoa(String.fromCharCode(...new Uint8Array(sigBytes)));

  const endpoint = `https://${OSS_BUCKET}.${OSS_REGION}.aliyuncs.com/${objectKey}`;
  const params = new URLSearchParams({
    OSSAccessKeyId: OSS_ACCESS_KEY_ID,
    Expires: String(expires),
    Signature: signature,
  });
  return `${endpoint}?${params.toString()}`;
}

/**
 * v6.0.138: 自动配置 OSS 桶 CORS 规则（幂等）
 * 允许浏览器直接 GET/HEAD 桶内对象（视频直连下载必需）
 * 调用 PutBucketCors REST API: https://help.aliyun.com/document_detail/31903.html
 */
let _corsConfigured = false;
let _corsFailedPermanently = false; // v6.0.139: cache permanent failures (AccessDenied, InvalidAccessKeyId) to stop log spam
let _corsFailMessage = '';

// v6.0.139: allow manual reset after fixing AK permissions in Aliyun console
export function resetOSSCorsCache(): void {
  _corsConfigured = false;
  _corsFailedPermanently = false;
  _corsFailMessage = '';
  console.log('[OSS-CORS] Cache reset — next call will retry PutBucketCors');
}

export async function ensureOSSCors(): Promise<{ success: boolean; message: string }> {
  if (_corsConfigured) return { success: true, message: 'already configured (cached)' };
  if (_corsFailedPermanently) return { success: false, message: `permanently failed (cached): ${_corsFailMessage}` };
  if (!isOSSConfigured()) return { success: false, message: 'OSS not configured' };

  const corsXml = `<?xml version="1.0" encoding="UTF-8"?>
<CORSConfiguration>
  <CORSRule>
    <AllowedOrigin>*</AllowedOrigin>
    <AllowedMethod>GET</AllowedMethod>
    <AllowedMethod>HEAD</AllowedMethod>
    <AllowedMethod>PUT</AllowedMethod>
    <AllowedHeader>*</AllowedHeader>
    <ExposeHeader>Content-Length</ExposeHeader>
    <ExposeHeader>Content-Type</ExposeHeader>
    <ExposeHeader>ETag</ExposeHeader>
    <MaxAgeSeconds>3600</MaxAgeSeconds>
  </CORSRule>
</CORSConfiguration>`;

  const date = new Date().toUTCString();
  const resource = `/${OSS_BUCKET}/?cors`;
  // PutBucketCors 签名: PUT + \n + Content-MD5(empty) + \n + content-type + \n + date + \n + resource
  const stringToSign = `PUT\n\napplication/xml\n${date}\n${resource}`;

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(OSS_ACCESS_KEY_SECRET),
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign']
  );
  const sigBytes = await crypto.subtle.sign('HMAC', key, encoder.encode(stringToSign));
  const sigBase64 = btoa(String.fromCharCode(...new Uint8Array(sigBytes)));

  const endpoint = `https://${OSS_BUCKET}.${OSS_REGION}.aliyuncs.com/?cors`;
  try {
    const resp = await fetch(endpoint, {
      method: 'PUT',
      headers: {
        'Date': date,
        'Authorization': `OSS ${OSS_ACCESS_KEY_ID}:${sigBase64}`,
        'Content-Type': 'application/xml',
      },
      body: corsXml,
    });
    if (resp.ok) {
      _corsConfigured = true;
      console.log(`[OSS-CORS] ✅ CORS rules configured successfully for bucket ${OSS_BUCKET}`);
      return { success: true, message: `CORS configured for ${OSS_BUCKET}` };
    } else {
      const errText = await resp.text();
      // v6.0.139: permanent errors — don't retry on AccessDenied / InvalidAccessKeyId / NoSuchBucket
      const isPermanent = /AccessDenied|InvalidAccessKeyId|NoSuchBucket|SignatureDoesNotMatch/.test(errText);
      if (isPermanent) {
        _corsFailedPermanently = true;
        _corsFailMessage = `PutBucketCors HTTP ${resp.status}: ${errText.substring(0, 200)}`;
        console.error(`[OSS-CORS] ❌ PutBucketCors PERMANENT failure (${resp.status}), will NOT retry: ${errText.substring(0, 300)}`);
      } else {
        console.error(`[OSS-CORS] ❌ PutBucketCors failed (${resp.status}), will retry next call: ${errText.substring(0, 300)}`);
      }
      return { success: false, message: `PutBucketCors HTTP ${resp.status}: ${errText.substring(0, 200)}` };
    }
  } catch (err: any) {
    console.error(`[OSS-CORS] ❌ PutBucketCors exception: ${err.message}`);
    return { success: false, message: err.message };
  }
}