/**
 * OSS Bucket配置工具
 * 用于配置Bucket为公共读，解决403签名问题
 */

import type { Context } from "npm:hono";
import { encode as base64Encode } from "https://deno.land/std@0.177.0/encoding/base64.ts";

/**
 * 设置Bucket的CORS配置
 * POST /oss/setup-cors
 */
export async function setupBucketCORS(c: Context) {
  try {
    const bucketName = Deno.env.get('ALIYUN_OSS_BUCKET_NAME');
    const accessKeyId = Deno.env.get('ALIYUN_OSS_ACCESS_KEY_ID');
    const accessKeySecret = Deno.env.get('ALIYUN_OSS_ACCESS_KEY_SECRET');
    const region = Deno.env.get('ALIYUN_OSS_REGION') || 'cn-shenzhen';
    
    if (!bucketName || !accessKeyId || !accessKeySecret) {
      return c.json({
        success: false,
        error: 'OSS配置不完整',
      }, 400);
    }
    
    console.log('[OSS CORS] Setting CORS for bucket:', bucketName);
    
    // 构建OSS API请求
    const regionPart = region.startsWith('oss-') ? region : `oss-${region}`;
    const host = `${bucketName}.${regionPart}.aliyuncs.com`;
    const url = `https://${host}/?cors`;
    
    // 构建CORS配置XML
    const corsXml = `<?xml version="1.0" encoding="UTF-8"?>
<CORSConfiguration>
  <CORSRule>
    <AllowedOrigin>*</AllowedOrigin>
    <AllowedMethod>GET</AllowedMethod>
    <AllowedMethod>HEAD</AllowedMethod>
    <AllowedMethod>PUT</AllowedMethod>
    <AllowedMethod>POST</AllowedMethod>
    <AllowedMethod>DELETE</AllowedMethod>
    <AllowedHeader>*</AllowedHeader>
    <ExposeHeader>Content-Length</ExposeHeader>
    <ExposeHeader>Content-Range</ExposeHeader>
    <ExposeHeader>Content-Type</ExposeHeader>
    <ExposeHeader>ETag</ExposeHeader>
    <MaxAgeSeconds>3600</MaxAgeSeconds>
  </CORSRule>
</CORSConfiguration>`;
    
    // 生成签名
    const date = new Date().toUTCString();
    const contentType = 'application/xml';
    const resource = `/${bucketName}/?cors`;
    
    const stringToSign = `PUT\n\n${contentType}\n${date}\n${resource}`;
    
    console.log('[OSS CORS] String to sign:', stringToSign);
    
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
    const base64Sig = base64Encode(signatureArray);
    
    // 发送请求
    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        'Host': host,
        'Date': date,
        'Content-Type': contentType,
        'Authorization': `OSS ${accessKeyId}:${base64Sig}`,
      },
      body: corsXml,
    });
    
    const responseText = await response.text();
    
    if (response.ok) {
      console.log('[OSS CORS] ✅ CORS configuration updated');
      return c.json({
        success: true,
        message: 'CORS配置已成功设置',
        data: {
          bucketName,
          allowedOrigins: ['*'],
          allowedMethods: ['GET', 'HEAD', 'PUT', 'POST', 'DELETE'],
          note: '视频播放所需的CORS头已配置，请等待1-2分钟生效',
        },
      });
    } else {
      console.error('[OSS CORS] ❌ Failed to update CORS:', response.status, responseText);
      return c.json({
        success: false,
        error: `设置失败: ${response.status}`,
        details: responseText,
      }, response.status);
    }
  } catch (error: any) {
    console.error('[OSS CORS] ❌ Error:', error);
    return c.json({
      success: false,
      error: error.message || '设置失败',
      stack: error.stack,
    }, 500);
  }
}

/**
 * 设置Bucket为公共读
 * PUT /oss/bucket/set-public-read
 */
export async function setBucketPublicRead(c: Context) {
  try {
    const bucketName = Deno.env.get('ALIYUN_OSS_BUCKET_NAME');
    const accessKeyId = Deno.env.get('ALIYUN_OSS_ACCESS_KEY_ID');
    const accessKeySecret = Deno.env.get('ALIYUN_OSS_ACCESS_KEY_SECRET');
    const region = Deno.env.get('ALIYUN_OSS_REGION') || 'cn-shenzhen';
    
    if (!bucketName || !accessKeyId || !accessKeySecret) {
      return c.json({
        success: false,
        error: 'OSS配置不完整',
      }, 400);
    }
    
    console.log('[OSS Config] Setting bucket to public-read:', bucketName);
    
    // 构建OSS API请求
    const regionPart = region.startsWith('oss-') ? region : `oss-${region}`;
    const host = `${bucketName}.${regionPart}.aliyuncs.com`;
    const url = `https://${host}/?acl`;
    
    // 构建请求体（设置为公共读）
    const aclXml = `<?xml version="1.0" encoding="UTF-8"?>
<AccessControlPolicy>
  <AccessControlList>
    <Grant>public-read</Grant>
  </AccessControlList>
</AccessControlPolicy>`;
    
    // 生成签名
    const date = new Date().toUTCString();
    const contentType = 'application/xml';
    const resource = `/${bucketName}/?acl`;
    
    const stringToSign = `PUT\n\n${contentType}\n${date}\n${resource}`;
    
    console.log('[OSS Config] String to sign:', stringToSign);
    
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
    const base64Sig = base64Encode(signatureArray);
    
    // 发送请求
    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        'Host': host,
        'Date': date,
        'Content-Type': contentType,
        'Authorization': `OSS ${accessKeyId}:${base64Sig}`,
      },
      body: aclXml,
    });
    
    const responseText = await response.text();
    
    if (response.ok) {
      console.log('[OSS Config] ✅ Bucket ACL updated to public-read');
      return c.json({
        success: true,
        message: 'Bucket已设置为公共读',
        data: {
          bucketName,
          acl: 'public-read',
          note: '现在可以直接访问视频URL，无需签名',
        },
      });
    } else {
      console.error('[OSS Config] ❌ Failed to update ACL:', response.status, responseText);
      return c.json({
        success: false,
        error: `设置失败: ${response.status}`,
        details: responseText,
      }, response.status);
    }
  } catch (error: any) {
    console.error('[OSS Config] ❌ Error:', error);
    return c.json({
      success: false,
      error: error.message || '设置失败',
      stack: error.stack,
    }, 500);
  }
}

/**
 * 获取Bucket当前ACL
 * GET /oss/bucket/get-acl
 */
export async function getBucketACL(c: Context) {
  try {
    const bucketName = Deno.env.get('ALIYUN_OSS_BUCKET_NAME');
    const accessKeyId = Deno.env.get('ALIYUN_OSS_ACCESS_KEY_ID');
    const accessKeySecret = Deno.env.get('ALIYUN_OSS_ACCESS_KEY_SECRET');
    const region = Deno.env.get('ALIYUN_OSS_REGION') || 'cn-shenzhen';
    
    if (!bucketName || !accessKeyId || !accessKeySecret) {
      return c.json({
        success: false,
        error: 'OSS配置不完整',
      }, 400);
    }
    
    console.log('[OSS Config] Getting bucket ACL:', bucketName);
    
    // 构建OSS API请求
    const regionPart = region.startsWith('oss-') ? region : `oss-${region}`;
    const host = `${bucketName}.${regionPart}.aliyuncs.com`;
    const url = `https://${host}/?acl`;
    
    // 生成签名
    const date = new Date().toUTCString();
    const resource = `/${bucketName}/?acl`;
    
    const stringToSign = `GET\n\n\n${date}\n${resource}`;
    
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
    const base64Sig = base64Encode(signatureArray);
    
    // 发送请求
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Host': host,
        'Date': date,
        'Authorization': `OSS ${accessKeyId}:${base64Sig}`,
      },
    });
    
    const responseText = await response.text();
    
    if (response.ok) {
      console.log('[OSS Config] ✅ Got bucket ACL');
      
      // 解析XML响应
      const aclMatch = responseText.match(/<Grant>(.*?)<\/Grant>/);
      const acl = aclMatch ? aclMatch[1] : 'unknown';
      
      return c.json({
        success: true,
        data: {
          bucketName,
          acl,
          rawResponse: responseText,
          recommendation: acl === 'public-read' 
            ? '✅ Bucket是公共读的，视频可以直接访问'
            : `⚠️ Bucket当前ACL是"${acl}"，建议设置为public-read以避免签名问题`,
        },
      });
    } else {
      console.error('[OSS Config] ❌ Failed to get ACL:', response.status, responseText);
      return c.json({
        success: false,
        error: `获取失败: ${response.status}`,
        details: responseText,
      }, response.status);
    }
  } catch (error: any) {
    console.error('[OSS Config] ❌ Error:', error);
    return c.json({
      success: false,
      error: error.message || '获取失败',
      stack: error.stack,
    }, 500);
  }
}