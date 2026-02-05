/**
 * OSS Bucket配置检查和修复工具
 * 
 * ✅ 当前使用的bucket: aicomic-awarelife
 */

import OSS from 'npm:ali-oss@6.18.1';
import { 
  CURRENT_BUCKET_NAME, 
  OLD_BUCKET_NAME,
  OSS_ENV_KEYS,
  DEFAULT_REGION,
  normalizeRegion,
} from '../config/oss_constants.tsx';

// ✅ 当前实际使用的bucket
const CURRENT_BUCKET = CURRENT_BUCKET_NAME;  // 使用新bucket

// 🔧 ali-oss SDK的region参数格式是：cn-shenzhen（不带oss-前缀）
// SDK会自动构建正确的endpoint: bucket.oss-cn-shenzhen.aliyuncs.com
let REGION = Deno.env.get(OSS_ENV_KEYS.REGION) || DEFAULT_REGION;
const ACCESS_KEY_ID = Deno.env.get(OSS_ENV_KEYS.ACCESS_KEY_ID) || '';
const ACCESS_KEY_SECRET = Deno.env.get(OSS_ENV_KEYS.ACCESS_KEY_SECRET) || '';

// 🔧 规范化region格式（移除oss-前缀，如果有）
REGION = normalizeRegion(REGION);

/**
 * 创建OSS客户端
 * ✅ 修复：确保使用正确的配置格式
 */
function createOSSClient(bucket: string) {
  console.log(`[OSS Bucket Checker] Creating OSS client with:`);
  console.log(`  bucket: ${bucket}`);
  console.log(`  region: ${REGION}`);
  console.log(`  accessKeyId: ${ACCESS_KEY_ID ? '***配置' : '未配置'}`);
  
  return new OSS({
    region: REGION,  // ✅ 使用不带oss-前缀的region（SDK会自动处理）
    accessKeyId: ACCESS_KEY_ID,
    accessKeySecret: ACCESS_KEY_SECRET,
    bucket: bucket,
    secure: true,  // ✅ 强制使用HTTPS
  });
}

/**
 * 检查bucket的CORS配置
 */
export async function checkBucketCORS(bucketName: string) {
  console.log(`\n🔍 检查 ${bucketName} 的CORS配置...`);
  
  try {
    const client = createOSSClient(bucketName);
    const result = await client.getBucketCORS(bucketName);
    
    console.log(`✅ CORS配置存在`);
    console.log(`规则数量: ${result.rules?.length || 0}`);
    
    result.rules?.forEach((rule: any, index: number) => {
      console.log(`\n规则 ${index + 1}:`);
      console.log(`  允许的源: ${rule.allowedOrigin?.join(', ')}`);
      console.log(`  允许的方法: ${rule.allowedMethod?.join(', ')}`);
      console.log(`  允许的头: ${rule.allowedHeader?.join(', ')}`);
      console.log(`  暴露的头: ${rule.exposeHeader?.join(', ')}`);
      console.log(`  最大缓存: ${rule.maxAgeSeconds}秒`);
    });
    
    return {
      success: true,
      configured: true,
      rules: result.rules,
    };
  } catch (error: any) {
    if (error.code === 'NoSuchCORSConfiguration') {
      console.log(`⚠️  CORS未配置`);
      return {
        success: true,
        configured: false,
        error: 'CORS未配置',
      };
    }
    
    console.error(`❌ 检查CORS失败:`, error);
    return {
      success: false,
      configured: false,
      error: error.message,
    };
  }
}

/**
 * 设置bucket的CORS配置
 */
export async function setBucketCORS(bucketName: string) {
  console.log(`\n🔧 设置 ${bucketName} 的CORS配置...`);
  
  try {
    const client = createOSSClient(bucketName);
    
    const corsRules = [
      {
        allowedOrigin: ['*'],
        allowedMethod: ['GET', 'HEAD', 'PUT', 'POST', 'DELETE'],
        allowedHeader: ['*'],
        exposeHeader: [
          'ETag',
          'Content-Length',
          'Content-Type',
          'Content-Range',
          'Accept-Ranges',
          'x-oss-request-id',
        ],
        maxAgeSeconds: 3600,
      },
    ];
    
    await client.putBucketCORS(bucketName, corsRules);
    
    console.log(`✅ CORS配置已设置`);
    console.log(`允许所有源访问 (*)`);
    console.log(`允许的方法: GET, HEAD, PUT, POST, DELETE`);
    
    return {
      success: true,
      message: 'CORS配置已成功设置',
    };
  } catch (error: any) {
    console.error(`❌ 设置CORS失败:`, error);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * 检查bucket的ACL（访问控制）
 */
export async function checkBucketACL(bucketName: string) {
  console.log(`\n🔍 检查 ${bucketName} 的ACL...`);
  
  try {
    const client = createOSSClient(bucketName);
    const result = await client.getBucketACL(bucketName);
    
    console.log(`✅ ACL: ${result.acl}`);
    console.log(`Owner: ${result.owner?.id}`);
    
    return {
      success: true,
      acl: result.acl,
      owner: result.owner,
    };
  } catch (error: any) {
    console.error(`❌ 检查ACL失败:`, error);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * 设置bucket为公共读
 */
export async function setBucketPublicRead(bucketName: string) {
  console.log(`\n🔧 设置 ${bucketName} 为公共读...`);
  
  try {
    const client = createOSSClient(bucketName);
    await client.putBucketACL(bucketName, 'public-read');
    
    console.log(`✅ Bucket已设置为公共读`);
    
    return {
      success: true,
      message: 'Bucket已设置为公共读',
    };
  } catch (error: any) {
    console.error(`❌ 设置ACL失败:`, error);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * 检查文件是否存在
 */
export async function checkFileExists(bucketName: string, objectName: string) {
  try {
    const client = createOSSClient(bucketName);
    await client.head(objectName);
    return true;
  } catch (error: any) {
    if (error.code === 'NoSuchKey') {
      return false;
    }
    throw error;
  }
}

/**
 * 完整诊断
 */
export async function diagnoseNewBucket() {
  console.log('');
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║           🔍 新Bucket完整诊断                              ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log('');
  
  const results = {
    bucketName: NEW_BUCKET,
    region: REGION,
    checks: [] as any[],
  };
  
  // 1. 检查CORS
  const corsCheck = await checkBucketCORS(NEW_BUCKET);
  results.checks.push({
    name: 'CORS配置',
    ...corsCheck,
  });
  
  // 2. 检查ACL
  const aclCheck = await checkBucketACL(NEW_BUCKET);
  results.checks.push({
    name: 'ACL权限',
    ...aclCheck,
  });
  
  // 3. 检查示例文件
  console.log(`\n🔍 检查示例文件是否存在...`);
  const sampleFile = 'aicomic/video-doubao/18565821136/2026/01/26/ep-2ae0ffb5-cf4b-4fc1-807f-fd7d265d82fb-playlist.m3u8';
  try {
    const exists = await checkFileExists(NEW_BUCKET, sampleFile);
    console.log(exists ? `✅ 文件存在` : `❌ 文件不存在`);
    results.checks.push({
      name: '示例文件存在',
      success: exists,
      file: sampleFile,
    });
  } catch (error: any) {
    console.error(`❌ 检查文件失败:`, error.message);
    results.checks.push({
      name: '示例文件存在',
      success: false,
      error: error.message,
    });
  }
  
  console.log('');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('');
  
  // 汇总
  const allSuccess = results.checks.every(c => c.success);
  console.log(`📊 诊断结果: ${allSuccess ? '✅ 全部通过' : '⚠️ 有问题需要修复'}`);
  
  return results;
}

/**
 * 自动修复
 */
export async function autoFixNewBucket() {
  console.log('');
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║           🔧 新Bucket自动修复                              ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log('');
  
  const fixes = [];
  
  // 1. 检查并修复CORS
  const corsCheck = await checkBucketCORS(NEW_BUCKET);
  if (!corsCheck.configured) {
    console.log(`🔧 修复: 设置CORS配置...`);
    const corsFixResult = await setBucketCORS(NEW_BUCKET);
    fixes.push({
      name: 'CORS配置',
      ...corsFixResult,
    });
  } else {
    console.log(`✅ CORS已配置，无需修复`);
    fixes.push({
      name: 'CORS配置',
      success: true,
      message: '已配置',
    });
  }
  
  // 2. 检查并修复ACL
  const aclCheck = await checkBucketACL(NEW_BUCKET);
  if (aclCheck.success && aclCheck.acl !== 'public-read') {
    console.log(`🔧 修复: 设置为公共读...`);
    const aclFixResult = await setBucketPublicRead(NEW_BUCKET);
    fixes.push({
      name: 'ACL权限',
      ...aclFixResult,
    });
  } else {
    console.log(`✅ ACL已正确配置`);
    fixes.push({
      name: 'ACL权限',
      success: true,
      message: '已正确配置',
    });
  }
  
  console.log('');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('');
  
  const allSuccess = fixes.every(f => f.success);
  console.log(`📊 修复结果: ${allSuccess ? '✅ 全部成功' : '⚠️ 部分失败'}`);
  
  return {
    success: allSuccess,
    fixes,
  };
}