/**
 * OSS Bucket配置检查器
 * 专门检查bucket名称是否正确设置为 aicomic-awarelife
 */

import type { Context } from "npm:hono";

/**
 * 检查OSS Bucket配置
 */
export async function checkOSSBucket(c: Context) {
  console.log('🔍 [OSS Bucket Checker] Starting bucket configuration check...');
  
  const result: any = {
    timestamp: new Date().toISOString(),
    success: true,
    issues: [],
    warnings: [],
    fixes: [],
  };

  // 读取当前配置
  const currentBucket = Deno.env.get('ALIYUN_OSS_BUCKET_NAME');
  const expectedBucket = 'aicomic-awarelife';
  const oldBucket = 'awarelife';

  result.currentConfiguration = {
    ALIYUN_OSS_BUCKET_NAME: currentBucket || '(未配置)',
  };

  result.expectedConfiguration = {
    ALIYUN_OSS_BUCKET_NAME: expectedBucket,
  };

  // 检查bucket名称
  if (!currentBucket) {
    result.success = false;
    result.issues.push({
      severity: 'ERROR',
      code: 'BUCKET_NOT_CONFIGURED',
      message: 'ALIYUN_OSS_BUCKET_NAME 环境变量未配置',
      impact: '所有OSS上传和访问功能将无法工作',
    });
  } else if (currentBucket === oldBucket) {
    result.success = false;
    result.issues.push({
      severity: 'CRITICAL',
      code: 'WRONG_BUCKET',
      message: `当前使用的是旧的bucket "${oldBucket}"`,
      impact: '视频将被保存到错误的bucket中',
      details: {
        current: currentBucket,
        expected: expectedBucket,
        problem: `URL将显示为 ${oldBucket}.oss-cn-shenzhen.aliyuncs.com 而不是 ${expectedBucket}.oss-cn-shenzhen.aliyuncs.com`,
      },
    });
    
    result.fixes.push({
      step: 1,
      action: '在Supabase Dashboard中打开项目设置',
      url: 'https://supabase.com/dashboard → Project Settings → Edge Functions',
    });
    
    result.fixes.push({
      step: 2,
      action: '找到 ALIYUN_OSS_BUCKET_NAME 环境变量',
      currentValue: oldBucket,
      newValue: expectedBucket,
    });
    
    result.fixes.push({
      step: 3,
      action: '将值从 "awarelife" 修改为 "aicomic-awarelife"',
      note: '注意：bucket名称必须完全一致，不能有空格或其他字符',
    });
    
    result.fixes.push({
      step: 4,
      action: '点击 Save 保存更改',
      note: 'Edge Function会自动重新部署',
    });
    
    result.fixes.push({
      step: 5,
      action: '等待1-2分钟让部署完成',
      verification: '再次运行此检查确认修复成功',
    });
    
    result.fixes.push({
      step: 6,
      action: '清除浏览器缓存',
      command: 'Ctrl+Shift+R (Windows/Linux) 或 Cmd+Shift+R (Mac)',
    });
  } else if (currentBucket === expectedBucket) {
    result.success = true;
    result.status = 'CORRECT';
    result.message = `✅ Bucket配置正确！当前使用 "${expectedBucket}"`;
    result.urlFormat = `视频URL格式: https://${expectedBucket}.oss-cn-shenzhen.aliyuncs.com/...`;
  } else {
    result.success = false;
    result.issues.push({
      severity: 'WARNING',
      code: 'UNEXPECTED_BUCKET',
      message: `当前bucket名称 "${currentBucket}" 不是预期的值`,
      expected: expectedBucket,
      impact: '可能导致视频保存到错误的位置',
    });
  }

  // 检查是否有旧bucket的URL在使用
  if (currentBucket === oldBucket) {
    result.warnings.push({
      type: 'LEGACY_URLS',
      message: '检测到使用旧bucket名称，新上传的视频将继续使用错误的bucket',
      recommendation: '立即修改环境变量以避免将更多视频上传到旧bucket',
      migration: {
        note: '已经上传到旧bucket的视频需要手动迁移或保持不变',
        oldBucketUrl: `https://${oldBucket}.oss-cn-shenzhen.aliyuncs.com/...`,
        newBucketUrl: `https://${expectedBucket}.oss-cn-shenzhen.aliyuncs.com/...`,
      },
    });
  }

  // 生成详细报告
  result.summary = {
    isCorrect: currentBucket === expectedBucket,
    currentBucket: currentBucket,
    expectedBucket: expectedBucket,
    needsFix: currentBucket !== expectedBucket,
    fixSteps: result.fixes.length,
  };

  // 日志记录
  console.log('[OSS Bucket Checker] Current bucket:', currentBucket);
  console.log('[OSS Bucket Checker] Expected bucket:', expectedBucket);
  console.log('[OSS Bucket Checker] Status:', result.success ? '✅ CORRECT' : '❌ NEEDS FIX');

  return c.json(result);
}

/**
 * 注册OSS Bucket检查路由
 */
export function registerOSSBucketCheckerRoutes(app: any) {
  app.get('/make-server-fc31472c/oss-bucket-check', checkOSSBucket);
  console.log('[Server] ✅ OSS Bucket Checker routes registered');
}
