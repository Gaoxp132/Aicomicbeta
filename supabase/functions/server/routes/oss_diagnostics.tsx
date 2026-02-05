/**
 * OSS访问诊断工具
 * 测试OSS URL是否可访问，并提供详细诊断信息
 */

import type { Context } from "npm:hono";
import * as ossService from "../video/aliyun_oss.tsx";

/**
 * 测试OSS访问
 * POST /oss/test-access
 * Body: { url: string }
 */
export async function testOSSAccess(c: Context) {
  try {
    const body = await c.req.json();
    const { url } = body;
    
    if (!url) {
      return c.json({
        success: false,
        error: 'url参数必填',
      }, 400);
    }
    
    console.log('[OSS Diagnostic] Testing access for:', url);
    
    const result: any = {
      originalUrl: url,
      timestamp: new Date().toISOString(),
    };
    
    // 🔍 解析URL
    try {
      const urlObj = new URL(url);
      result.parsedUrl = {
        protocol: urlObj.protocol,
        host: urlObj.host,
        pathname: urlObj.pathname,
      };
      
      // 提取object path
      const objectPath = urlObj.pathname.substring(1); // 去掉前导的/
      result.objectPath = objectPath;
      
      console.log('[OSS Diagnostic] 📍 Object path:', objectPath);
      
      // 🔍 检查环境变量
      const hasAccessKeyId = !!Deno.env.get('ALIYUN_OSS_ACCESS_KEY_ID');
      const hasAccessKeySecret = !!Deno.env.get('ALIYUN_OSS_ACCESS_KEY_SECRET');
      const bucketName = Deno.env.get('ALIYUN_OSS_BUCKET_NAME');
      const region = Deno.env.get('ALIYUN_OSS_REGION');
      
      result.config = {
        hasAccessKeyId,
        hasAccessKeySecret,
        bucketName,
        region,
        configValid: hasAccessKeyId && hasAccessKeySecret && !!bucketName,
      };
      
      console.log('[OSS Diagnostic] 🔑 Config check:', result.config);
      
      if (!result.config.configValid) {
        result.recommendation = '❌ OSS配置不完整！请检查环境变量：ALIYUN_OSS_ACCESS_KEY_ID, ALIYUN_OSS_ACCESS_KEY_SECRET, ALIYUN_OSS_BUCKET_NAME';
        return c.json({ success: false, data: result });
      }
      
      // 🔍 生成签名URL
      console.log('[OSS Diagnostic] 🔐 Generating signed URL...');
      const signedUrl = await ossService.generateSignedUrl(objectPath, 60); // 60秒过期
      result.signedUrl = signedUrl.substring(0, 200) + '...'; // 截断以避免日志过长
      result.signedUrlLength = signedUrl.length;
      
      console.log('[OSS Diagnostic] ✅ Signed URL generated');
      
      // 🔍 测试HEAD请求
      console.log('[OSS Diagnostic] 📡 Testing HEAD request...');
      try {
        const headResponse = await fetch(signedUrl, { 
          method: 'HEAD',
          signal: AbortSignal.timeout(10000), // 10秒超时
        });
        
        result.headTest = {
          success: headResponse.ok,
          status: headResponse.status,
          statusText: headResponse.statusText,
          headers: Object.fromEntries(headResponse.headers.entries()),
        };
        
        console.log('[OSS Diagnostic] HEAD result:', headResponse.status, headResponse.statusText);
        
        if (!headResponse.ok) {
          // 读取错误响应体
          const errorText = await headResponse.text().catch(() => '(无法读取错误信息)');
          result.headTest.errorBody = errorText;
          console.error('[OSS Diagnostic] HEAD failed:', errorText);
        }
      } catch (headError: any) {
        result.headTest = {
          success: false,
          error: headError.message,
        };
        console.error('[OSS Diagnostic] HEAD request error:', headError.message);
      }
      
      // 🔍 测试GET请求（只读取前1KB）
      console.log('[OSS Diagnostic] 📡 Testing GET request (first 1KB)...');
      try {
        const getResponse = await fetch(signedUrl, {
          headers: { 'Range': 'bytes=0-1023' }, // 只读取前1KB
          signal: AbortSignal.timeout(10000),
        });
        
        result.getTest = {
          success: getResponse.ok || getResponse.status === 206,
          status: getResponse.status,
          statusText: getResponse.statusText,
          contentLength: getResponse.headers.get('content-length'),
          contentType: getResponse.headers.get('content-type'),
          contentRange: getResponse.headers.get('content-range'),
          acceptRanges: getResponse.headers.get('accept-ranges'),
        };
        
        console.log('[OSS Diagnostic] GET result:', getResponse.status, getResponse.statusText);
        
        if (!getResponse.ok && getResponse.status !== 206) {
          const errorText = await getResponse.text().catch(() => '(无法读取错误信息)');
          result.getTest.errorBody = errorText;
          console.error('[OSS Diagnostic] GET failed:', errorText);
        }
      } catch (getError: any) {
        result.getTest = {
          success: false,
          error: getError.message,
        };
        console.error('[OSS Diagnostic] GET request error:', getError.message);
      }
      
      // 🎯 生成建议
      if (result.headTest?.success || result.getTest?.success) {
        result.recommendation = '✅ OSS访问正常！视频应该可以播放。';
      } else if (result.headTest?.status === 401 || result.getTest?.status === 401) {
        result.recommendation = '❌ OSS签名验证失败（401）！请检查：\n' +
          '1. AccessKeyId 和 AccessKeySecret 是否正确\n' +
          '2. Bucket名称是否正确\n' +
          '3. Region是否正确\n' +
          '4. 系统时间是否准确（时间偏差会导致签名失败）';
      } else if (result.headTest?.status === 403 || result.getTest?.status === 403) {
        result.recommendation = '❌ OSS访问被拒绝（403）！请检查：\n' +
          '1. Bucket权限设置\n' +
          '2. AccessKey是否有读取权限\n' +
          '3. RAM策略配置';
      } else if (result.headTest?.status === 404 || result.getTest?.status === 404) {
        result.recommendation = '❌ 文件不存在（404）！请检查：\n' +
          '1. 文件路径是否正确\n' +
          '2. 文件是否已上传到OSS\n' +
          '3. Bucket名称是否正确';
      } else {
        result.recommendation = '⚠️ OSS访问异常！请查看详细错误信息。';
      }
      
    } catch (parseError: any) {
      console.error('[OSS Diagnostic] URL parsing error:', parseError);
      result.error = parseError.message;
      result.recommendation = '❌ URL格式错误或处理失败：' + parseError.message;
    }
    
    return c.json({
      success: true,
      data: result,
    });
    
  } catch (error: any) {
    console.error('[OSS Diagnostic] ❌ Diagnostic failed:', error);
    return c.json({
      success: false,
      error: error.message || 'OSS诊断失败',
    }, 500);
  }
}