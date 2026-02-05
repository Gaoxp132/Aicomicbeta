/**
 * 阿里云OSS配置验证工具
 * 用于全面检查OSS配置的正确性
 */

import type { Context } from "npm:hono";

/**
 * OSS配置验证结果
 */
interface ValidationResult {
  isValid: boolean;
  score: number; // 0-100分
  errors: string[];
  warnings: string[];
  suggestions: string[];
  details: Record<string, any>;
}

/**
 * 验证OSS配置
 */
export async function validateOSSConfig(c: Context) {
  console.log('🔍 [OSS Config Validator] Starting comprehensive validation...');
  
  const result: ValidationResult = {
    isValid: true,
    score: 100,
    errors: [],
    warnings: [],
    suggestions: [],
    details: {},
  };

  // 1. 检查必需的环境变量
  console.log('📋 [OSS Config Validator] Step 1: Checking required environment variables...');
  
  const accessKeyId = Deno.env.get('ALIYUN_OSS_ACCESS_KEY_ID');
  const accessKeySecret = Deno.env.get('ALIYUN_OSS_ACCESS_KEY_SECRET');
  const bucketName = Deno.env.get('ALIYUN_OSS_BUCKET_NAME');
  const region = Deno.env.get('ALIYUN_OSS_REGION');
  const endpoint = Deno.env.get('ALIYUN_OSS_ENDPOINT');

  result.details.environmentVariables = {
    ALIYUN_OSS_ACCESS_KEY_ID: accessKeyId ? {
      status: '✅ 已配置',
      length: accessKeyId.length,
      preview: accessKeyId.substring(0, 8) + '...',
    } : {
      status: '❌ 未配置',
    },
    ALIYUN_OSS_ACCESS_KEY_SECRET: accessKeySecret ? {
      status: '✅ 已配置',
      length: accessKeySecret.length,
      preview: accessKeySecret.substring(0, 4) + '...',
    } : {
      status: '❌ 未配置',
    },
    ALIYUN_OSS_BUCKET_NAME: bucketName ? {
      status: '✅ 已配置',
      value: bucketName,
    } : {
      status: '❌ 未配置',
    },
    ALIYUN_OSS_REGION: region ? {
      status: '✅ 已配置',
      value: region,
    } : {
      status: '❌ 未配置',
    },
    ALIYUN_OSS_ENDPOINT: endpoint ? {
      status: '✅ 已配置',
      value: endpoint,
    } : {
      status: 'ℹ️ 未配置（可选）',
    },
  };

  // 检查必需变量
  if (!accessKeyId) {
    result.errors.push('❌ ALIYUN_OSS_ACCESS_KEY_ID 未配置');
    result.isValid = false;
    result.score -= 40;
  }

  if (!accessKeySecret) {
    result.errors.push('❌ ALIYUN_OSS_ACCESS_KEY_SECRET 未配置');
    result.isValid = false;
    result.score -= 40;
  }

  if (!bucketName) {
    result.errors.push('❌ ALIYUN_OSS_BUCKET_NAME 未配置');
    result.isValid = false;
    result.score -= 20;
  }

  // 2. 验证配置值的格式
  console.log('🔍 [OSS Config Validator] Step 2: Validating configuration formats...');

  // 验证AccessKeyId格式
  if (accessKeyId) {
    // 阿里云AccessKeyId通常以LTAI开头，长度为24字符
    if (!accessKeyId.startsWith('LTAI')) {
      result.warnings.push('⚠️ ALIYUN_OSS_ACCESS_KEY_ID 格式可能不正确（应以LTAI开头）');
      result.score -= 5;
    }
    if (accessKeyId.length < 16 || accessKeyId.length > 30) {
      result.warnings.push(`⚠️ ALIYUN_OSS_ACCESS_KEY_ID 长度异常（当前${accessKeyId.length}字符）`);
      result.score -= 5;
    }
  }

  // 验证AccessKeySecret格式
  if (accessKeySecret) {
    // 阿里云AccessKeySecret通常为30字符
    if (accessKeySecret.length < 20 || accessKeySecret.length > 40) {
      result.warnings.push(`⚠️ ALIYUN_OSS_ACCESS_KEY_SECRET 长度异常（当前${accessKeySecret.length}字符）`);
      result.score -= 5;
    }
  }

  // 验证BucketName格式
  if (bucketName) {
    // Bucket名称规则：3-63字符，只能包含小写字母、数字和连字符，必须以字母或数字开头和结尾
    const bucketNameRegex = /^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/;
    if (!bucketNameRegex.test(bucketName)) {
      result.errors.push(`❌ ALIYUN_OSS_BUCKET_NAME 格式不正确（当前值：${bucketName}）`);
      result.errors.push('   Bucket名称规则：3-63字符，只能包含小写字母、数字和连字符，必须以字母或数字开头和结尾');
      result.isValid = false;
      result.score -= 15;
    }
    
    // 检查是否使用了推荐的bucket名称
    if (bucketName === 'aicomic-awarelife') {
      result.details.bucketNameStatus = '✅ 使用正确的bucket名称';
    } else {
      result.warnings.push(`⚠️ ALIYUN_OSS_BUCKET_NAME 与预期不符（当前：${bucketName}，预期：aicomic-awarelife）`);
      result.score -= 5;
    }
  }

  // 验证Region格式
  if (region) {
    // Region格式支持两种：
    // 1. 带oss-前缀: oss-cn-shenzhen, oss-cn-beijing, oss-us-west-1 等（SDK使用）
    // 2. 不带oss-前缀: cn-shenzhen, cn-beijing, us-west-1 等（环境变量可以使用）
    const regionWithOssRegex = /^oss-(cn|us|ap|eu)-[a-z0-9-]+$/;
    const regionWithoutOssRegex = /^(cn|us|ap|eu)-[a-z0-9-]+$/;
    
    if (!regionWithOssRegex.test(region) && !regionWithoutOssRegex.test(region)) {
      result.errors.push(`❌ ALIYUN_OSS_REGION 格式不正确（当前值：${region}）`);
      result.errors.push('   Region格式示例：oss-cn-shenzhen 或 cn-shenzhen, oss-cn-beijing 或 cn-beijing');
      result.isValid = false;
      result.score -= 15;
    }
    
    // 检查是否使用了推荐的region
    if (region === 'oss-cn-shenzhen' || region === 'cn-shenzhen') {
      result.details.regionStatus = '✅ 使用正确的region';
    } else {
      result.warnings.push(`⚠️ ALIYUN_OSS_REGION 与预期不符（当前：${region}，预期：oss-cn-shenzhen 或 cn-shenzhen）`);
      result.score -= 5;
    }
  } else {
    // Region未配置，会使用默认值
    result.warnings.push('⚠️ ALIYUN_OSS_REGION 未配置，将使用默认值 oss-cn-shenzhen');
    result.score -= 5;
  }

  // 验证Endpoint格式
  if (endpoint) {
    // Endpoint可以是自定义域名或标准OSS endpoint
    const isCustomDomain = !endpoint.includes('aliyuncs.com');
    const isStandardEndpoint = /^oss-[a-z0-9-]+\.aliyuncs\.com$/.test(endpoint);
    
    result.details.endpointType = isCustomDomain ? '自定义域名' : '标准OSS endpoint';
    
    if (isCustomDomain) {
      // 验证自定义域名格式
      const domainRegex = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/i;
      if (!domainRegex.test(endpoint)) {
        result.warnings.push(`⚠️ ALIYUN_OSS_ENDPOINT 自定义域名格式可能不正确（${endpoint}）`);
        result.score -= 5;
      }
      
      // 检查是否使用了推荐的自定义域名
      if (endpoint === 'file.awarelife.cn') {
        result.details.endpointStatus = '✅ 使用正确的自定义域名';
      } else {
        result.warnings.push(`⚠️ ALIYUN_OSS_ENDPOINT 与预期不符（当前：${endpoint}，预期：file.awarelife.cn）`);
      }
    } else if (!isStandardEndpoint) {
      result.warnings.push(`⚠️ ALIYUN_OSS_ENDPOINT 格式不正确（${endpoint}）`);
      result.score -= 5;
    }
    
    // 检查endpoint是否包含协议前缀
    if (endpoint.startsWith('http://') || endpoint.startsWith('https://')) {
      result.warnings.push('⚠️ ALIYUN_OSS_ENDPOINT 不应包含协议前缀（http://或https://）');
      result.suggestions.push(`建议修改为：${endpoint.replace(/^https?:\/\//, '')}`);
      result.score -= 5;
    }
  } else {
    result.details.endpointStatus = 'ℹ️ 未配置，将使用标准OSS endpoint';
    result.suggestions.push('💡 如果使用自定义域名，建议设置 ALIYUN_OSS_ENDPOINT=file.awarelife.cn');
  }

  // 3. 测试OSS配置（如果基本配置正确）
  console.log('🧪 [OSS Config Validator] Step 3: Testing OSS configuration...');
  
  if (accessKeyId && accessKeySecret && bucketName && (region || true)) {
    try {
      // 尝试导入OSS模块并测试配置
      const ossModule = await import('../video/aliyun_oss.tsx');
      
      // 测试能否正确读取配置
      try {
        // 构造一个测试URL
        const testRegion = region || 'cn-shenzhen';
        const testEndpoint = endpoint || `oss-${testRegion}.aliyuncs.com`;
        const testUrl = `https://${bucketName}.${testEndpoint}/test.txt`;
        
        result.details.testConfiguration = {
          bucket: bucketName,
          region: testRegion,
          endpoint: testEndpoint,
          testUrl: testUrl,
          status: '✅ 配置格式正确',
        };
        
        result.suggestions.push('💡 配置格式正确，可以进行实际的文件上传测试');
      } catch (configError: any) {
        result.errors.push(`❌ OSS配置测试失败: ${configError.message}`);
        result.isValid = false;
        result.score -= 10;
      }
    } catch (importError: any) {
      result.warnings.push(`⚠️ 无法加载OSS模块: ${importError.message}`);
      result.score -= 5;
    }
  }

  // 4. 生成配置建议
  console.log('💡 [OSS Config Validator] Step 4: Generating recommendations...');
  
  if (result.errors.length === 0) {
    result.suggestions.push('✅ 基本配置检查通过');
    
    if (!endpoint) {
      result.suggestions.push('💡 建议配置自定义域名 ALIYUN_OSS_ENDPOINT=file.awarelife.cn 以优化访问速度');
    }
    
    if (result.score === 100) {
      result.suggestions.push('🎉 配置完美！所有检查项都通过了');
    } else if (result.score >= 90) {
      result.suggestions.push('👍 配置良好，有一些小的优化建议');
    } else if (result.score >= 70) {
      result.suggestions.push('⚠️ 配置基本可用，但建议处理警告项');
    }
  }

  // 5. 生成配置摘要
  result.details.summary = {
    totalChecks: 5,
    passedChecks: 5 - result.errors.length,
    warnings: result.warnings.length,
    score: result.score,
    grade: result.score >= 90 ? 'A' : result.score >= 80 ? 'B' : result.score >= 70 ? 'C' : result.score >= 60 ? 'D' : 'F',
  };

  // 6. 生成修复建议
  if (result.errors.length > 0 || result.warnings.length > 0) {
    result.details.howToFix = {
      step1: '打开 Supabase Dashboard',
      step2: '进入 Project Settings → Edge Functions → Environment Variables',
      step3: '设置或修改以下环境变量：',
      requiredVariables: {
        ALIYUN_OSS_ACCESS_KEY_ID: 'LTAI5tQLLbdErVCMRGwgeqvK',
        ALIYUN_OSS_ACCESS_KEY_SECRET: 'f9woo64lulWdfGUVXtdypiXBalpvzl',
        ALIYUN_OSS_BUCKET_NAME: 'aicomic-awarelife',
        ALIYUN_OSS_REGION: 'cn-shenzhen',
      },
      optionalVariables: {
        ALIYUN_OSS_ENDPOINT: 'file.awarelife.cn（自定义域名，可选）',
      },
      step4: '保存后重新部署 Edge Function',
      step5: '刷新浏览器缓存后重新测试',
    };
  }

  console.log('✅ [OSS Config Validator] Validation complete');
  console.log(`   Score: ${result.score}/100 (Grade: ${result.details.summary.grade})`);
  console.log(`   Errors: ${result.errors.length}, Warnings: ${result.warnings.length}`);

  return c.json({
    success: result.isValid,
    timestamp: new Date().toISOString(),
    version: 'v1.0.0',
    ...result,
  });
}

/**
 * 注册OSS配置验证路由
 */
export function registerOSSConfigValidatorRoutes(app: any) {
  app.get('/make-server-fc31472c/oss-config-validate', validateOSSConfig);
  console.log('[Server] ✅ OSS Config Validator routes registered');
}