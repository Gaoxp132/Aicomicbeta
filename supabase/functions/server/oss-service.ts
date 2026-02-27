/**
 * OSS服务模块 - 阿里云OSS文件上传
 * v6.0.77
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
 * @returns { url, transferred }；如果 OSS 未配置或上传失败，返回原始 URL
 */
export async function transferFileToOSS(
  sourceUrl: string,
  objectKey: string,
  fallbackContentType = 'video/mp4'
): Promise<{ url: string; transferred: boolean }> {
  if (!isOSSConfigured()) {
    console.warn('[OSS] Not configured, skipping transfer');
    return { url: sourceUrl, transferred: false };
  }

  // 已经在 OSS 上的不重复转存
  if (sourceUrl.includes('.aliyuncs.com')) {
    return { url: sourceUrl, transferred: true };
  }

  console.log(`[OSS] Downloading from: ${sourceUrl.substring(0, 100)}...`);
  try {
    const resp = await fetchWithTimeout(sourceUrl, {}, 120000);
    if (!resp.ok) throw new Error(`Download failed: HTTP ${resp.status}`);
    const buf = await resp.arrayBuffer();
    const ct = resp.headers.get('content-type') || fallbackContentType;
    console.log(`[OSS] Downloaded ${(buf.byteLength / 1024 / 1024).toFixed(2)} MB, uploading to ${objectKey}`);
    const ossUrl = await uploadToOSS(objectKey, buf, ct);
    console.log(`[OSS] Transferred to OSS: ${ossUrl}`);
    return { url: ossUrl, transferred: true };
  } catch (err: any) {
    console.error(`[OSS] Transfer failed for ${objectKey}: ${err.message}`);
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