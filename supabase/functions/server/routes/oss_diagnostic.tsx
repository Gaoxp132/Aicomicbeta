/**
 * OSS诊断工具
 * 用于检查OSS配置和签名是否正确
 */

import type { Context } from "npm:hono";
import * as ossService from "../video/aliyun_oss.tsx";

/**
 * 测试OSS签名URL是否可访问
 * GET /oss/diagnostic/test-signature
 */
export async function testOSSSignature(c: Context) {
  try {
    const { url } = c.req.query();
    
    if (!url) {
      return c.json({
        success: false,
        error: 'URL参数必填',
      }, 400);
    }
    
    console.log('[OSS Diagnostic] Testing URL:', url);
    
    // 从URL中提取信息
    const urlObj = new URL(url);
    const hostParts = urlObj.hostname.split('.');
    const bucket = hostParts[0];
    const objectPath = urlObj.pathname.substring(1);
    
    console.log('[OSS Diagnostic] Bucket:', bucket);
    console.log('[OSS Diagnostic] Object path:', objectPath);
    
    // 生成新的签名URL
    const currentBucket = Deno.env.get('ALIYUN_OSS_BUCKET_NAME') || 'aicomic-awarelife';
    let signedUrl: string;
    
    if (bucket !== currentBucket) {
      signedUrl = await ossService.generateSignedUrlForBucket(objectPath, bucket, 3600);
    } else {
      signedUrl = await ossService.generateSignedUrl(objectPath, 3600);
    }
    
    console.log('[OSS Diagnostic] Generated signed URL:', signedUrl.substring(0, 150) + '...');
    
    // 尝试访问签名URL
    let accessTest = {
      success: false,
      statusCode: 0,
      error: '',
      headers: {} as Record<string, string>,
    };
    
    try {
      const testResponse = await fetch(signedUrl, {
        method: 'HEAD',
      });
      
      accessTest.success = testResponse.ok;
      accessTest.statusCode = testResponse.status;
      
      // 收集响应头
      testResponse.headers.forEach((value, key) => {
        accessTest.headers[key] = value;
      });
      
      console.log('[OSS Diagnostic] Access test status:', testResponse.status);
    } catch (error: any) {
      accessTest.error = error.message;
      console.error('[OSS Diagnostic] Access test failed:', error.message);
    }
    
    return c.json({
      success: true,
      data: {
        originalUrl: url,
        bucket,
        objectPath,
        signedUrl,
        accessTest,
        config: {
          accessKeyId: Deno.env.get('ALIYUN_OSS_ACCESS_KEY_ID')?.substring(0, 10) + '...',
          bucketName: Deno.env.get('ALIYUN_OSS_BUCKET_NAME'),
          region: Deno.env.get('ALIYUN_OSS_REGION'),
          endpoint: Deno.env.get('ALIYUN_OSS_ENDPOINT') || '(使用标准endpoint)',
        },
      },
    });
  } catch (error: any) {
    console.error('[OSS Diagnostic] Error:', error);
    return c.json({
      success: false,
      error: error.message || '诊断失败',
      stack: error.stack,
    }, 500);
  }
}

/**
 * 测试Bucket是否为公共读
 * GET /oss/diagnostic/check-bucket-acl
 */
export async function checkBucketACL(c: Context) {
  try {
    const bucketName = Deno.env.get('ALIYUN_OSS_BUCKET_NAME') || 'aicomic-awarelife';
    const region = Deno.env.get('ALIYUN_OSS_REGION') || 'cn-shenzhen';
    const accessKeyId = Deno.env.get('ALIYUN_OSS_ACCESS_KEY_ID');
    
    console.log('[OSS Diagnostic] Checking bucket ACL:', bucketName);
    
    // 构建OSS API请求URL
    const regionPart = region.startsWith('oss-') ? region : `oss-${region}`;
    const bucketUrl = `https://${bucketName}.${regionPart}.aliyuncs.com`;
    
    // 尝试访问bucket根路径（测试公共读权限）
    let publicReadTest = {
      success: false,
      statusCode: 0,
      error: '',
      isPublic: false,
    };
    
    try {
      const response = await fetch(bucketUrl, {
        method: 'HEAD',
      });
      
      publicReadTest.statusCode = response.status;
      publicReadTest.success = response.ok;
      
      // 如果返回200或403，说明bucket存在
      // 403可能表示bucket是私有的
      if (response.status === 200) {
        publicReadTest.isPublic = true;
      } else if (response.status === 403) {
        publicReadTest.isPublic = false;
        publicReadTest.error = 'Bucket存在但是私有的，需要签名访问';
      }
      
      console.log('[OSS Diagnostic] Public read test:', response.status);
    } catch (error: any) {
      publicReadTest.error = error.message;
      console.error('[OSS Diagnostic] Public read test failed:', error.message);
    }
    
    return c.json({
      success: true,
      data: {
        bucketName,
        region,
        bucketUrl,
        publicReadTest,
        recommendation: publicReadTest.isPublic 
          ? '✅ Bucket是公共读的，视频可以直接访问'
          : '⚠️ Bucket是私有的，需要使用签名URL访问。请检查签名算法是否正确。',
      },
    });
  } catch (error: any) {
    console.error('[OSS Diagnostic] Error:', error);
    return c.json({
      success: false,
      error: error.message || '检查失败',
    }, 500);
  }
}

/**
 * 测试签名算法的多种变体
 * POST /oss/diagnostic/test-signature-variants
 */
export async function testSignatureVariants(c: Context) {
  try {
    const body = await c.req.json();
    const { objectPath } = body;
    
    if (!objectPath) {
      return c.json({
        success: false,
        error: 'objectPath参数必填',
      }, 400);
    }
    
    console.log('[OSS Diagnostic] Testing signature variants for:', objectPath);
    
    const config = {
      accessKeyId: Deno.env.get('ALIYUN_OSS_ACCESS_KEY_ID') || '',
      accessKeySecret: Deno.env.get('ALIYUN_OSS_ACCESS_KEY_SECRET') || '',
      bucketName: Deno.env.get('ALIYUN_OSS_BUCKET_NAME') || 'aicomic-awarelife',
      region: Deno.env.get('ALIYUN_OSS_REGION') || 'cn-shenzhen',
    };
    
    const cleanPath = objectPath.startsWith('/') ? objectPath.substring(1) : objectPath;
    const expires = Math.floor(Date.now() / 1000) + 3600;
    
    // 测试不同的签名方法
    const variants = [
      {
        name: '标准签名（当前使用）',
        resource: `/${config.bucketName}/${cleanPath}`,
        headers: {},
      },
      {
        name: '带查询参数的resource',
        resource: `/${config.bucketName}/${cleanPath}?OSSAccessKeyId=${config.accessKeyId}&Expires=${expires}`,
        headers: {},
      },
      {
        name: '不带bucket的resource',
        resource: `/${cleanPath}`,
        headers: {},
      },
    ];
    
    const results = [];
    
    for (const variant of variants) {
      try {
        // 构建签名字符串
        const stringToSign = `GET\n\n\n${expires}\n${variant.resource}`;
        
        console.log('[OSS Diagnostic] Testing variant:', variant.name);
        console.log('[OSS Diagnostic] String to sign:', stringToSign);
        
        // 生成签名
        const encoder = new TextEncoder();
        const keyData = encoder.encode(config.accessKeySecret);
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
        
        // 转base64
        const base64Sig = btoa(String.fromCharCode(...signatureArray));
        
        // 构建URL
        const regionPart = config.region.startsWith('oss-') ? config.region : `oss-${config.region}`;
        const baseUrl = `https://${config.bucketName}.${regionPart}.aliyuncs.com/${cleanPath}`;
        const signedUrl = `${baseUrl}?OSSAccessKeyId=${encodeURIComponent(config.accessKeyId)}&Expires=${expires}&Signature=${encodeURIComponent(base64Sig)}`;
        
        // 测试访问
        const testResponse = await fetch(signedUrl, { method: 'HEAD' });
        
        results.push({
          variant: variant.name,
          stringToSign,
          signature: base64Sig.substring(0, 20) + '...',
          url: signedUrl.substring(0, 150) + '...',
          statusCode: testResponse.status,
          success: testResponse.ok,
        });
        
        console.log('[OSS Diagnostic] Variant result:', variant.name, testResponse.status);
      } catch (error: any) {
        results.push({
          variant: variant.name,
          error: error.message,
          success: false,
        });
      }
    }
    
    return c.json({
      success: true,
      data: {
        objectPath,
        results,
        recommendation: results.find(r => r.success) 
          ? '✅ 找到可用的签名方法！' 
          : '❌ 所有签名方法都失败了。请检查：\n1. AccessKeySecret是否正确\n2. Bucket权限配置\n3. 时钟是否同步',
      },
    });
  } catch (error: any) {
    console.error('[OSS Diagnostic] Error:', error);
    return c.json({
      success: false,
      error: error.message || '测试失败',
      stack: error.stack,
    }, 500);
  }
}
