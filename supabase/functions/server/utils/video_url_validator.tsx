/**
 * 视频URL验证和修复工具
 * 检测数据库中失效的视频URL并提供修复建议
 * 
 * @version 3.22.7
 * @date 2026-01-26
 */

import { createClient } from 'jsr:@supabase/supabase-js@2';

interface ValidationResult {
  url: string;
  status: 'valid' | 'invalid' | 'unknown';
  httpStatus?: number;
  error?: string;
  suggestion?: string;
}

/**
 * 检测URL是否可访问
 */
async function checkUrlAccessibility(url: string): Promise<ValidationResult> {
  try {
    console.log('[URL Validator] Checking URL:', url.substring(0, 100) + '...');
    
    // 使用HEAD请求测试URL
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10秒超时
    
    const response = await fetch(url, {
      method: 'HEAD',
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);
    
    const status = response.status;
    
    if (status === 200 || status === 206) {
      return {
        url,
        status: 'valid',
        httpStatus: status,
      };
    } else if (status === 403) {
      return {
        url,
        status: 'invalid',
        httpStatus: status,
        error: 'Forbidden - 文件可能不存在或bucket权限不足',
        suggestion: '需要重新上传视频到OSS或调整bucket权限',
      };
    } else if (status === 404) {
      return {
        url,
        status: 'invalid',
        httpStatus: status,
        error: 'Not Found - 文件不存在',
        suggestion: '需要重新生成视频或检查存储路径',
      };
    } else {
      return {
        url,
        status: 'invalid',
        httpStatus: status,
        error: `HTTP ${status}`,
        suggestion: '检查OSS配置或视频链接',
      };
    }
  } catch (error: any) {
    console.error('[URL Validator] Error checking URL:', error.message);
    
    return {
      url,
      status: 'invalid',
      error: error.name === 'AbortError' ? '请求超时' : error.message,
      suggestion: '网络连接问题或URL完全无效',
    };
  }
}

/**
 * 验证数据库中所有视频URL的有效性
 */
export async function validateAllVideoUrls() {
  console.log('');
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║         🔍 视频URL有效性检测                               ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log('');
  
  const startTime = Date.now();
  
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );
    
    // 1. 检查storyboards表中的视频
    console.log('📊 检查 storyboards 表...');
    const { data: storyboards, error: sbError } = await supabase
      .from('storyboards')
      .select('id, video_url')
      .not('video_url', 'is', null)
      .limit(100);  // 限制数量避免超时
    
    if (sbError) {
      console.error('❌ Query error:', sbError);
      return {
        success: false,
        error: sbError.message,
      };
    }
    
    console.log(`   找到 ${storyboards?.length || 0} 个视频URL`);
    
    // 2. 检查video_tasks表中的视频
    console.log('📊 检查 video_tasks 表...');
    const { data: videoTasks, error: vtError } = await supabase
      .from('video_tasks')
      .select('task_id, video_url')
      .not('video_url', 'is', null)
      .limit(100);
    
    if (vtError) {
      console.error('❌ Query error:', vtError);
      return {
        success: false,
        error: vtError.message,
      };
    }
    
    console.log(`   找到 ${videoTasks?.length || 0} 个视频URL`);
    console.log('');
    
    // 3. 验证URL（采样检测）
    const sampleSize = 10;  // 只检测前10个以避免超时
    const allUrls = [
      ...(storyboards || []).map(sb => ({ id: sb.id, url: sb.video_url, table: 'storyboards' })),
      ...(videoTasks || []).map(vt => ({ id: vt.task_id, url: vt.video_url, table: 'video_tasks' })),
    ];
    
    console.log(`🔍 采样验证前 ${Math.min(sampleSize, allUrls.length)} 个URL...`);
    console.log('');
    
    const sampleUrls = allUrls.slice(0, sampleSize);
    const validationResults: (ValidationResult & { id: string, table: string })[] = [];
    
    for (const { id, url, table } of sampleUrls) {
      if (!url) continue;
      
      const result = await checkUrlAccessibility(url);
      validationResults.push({
        ...result,
        id,
        table,
      });
      
      const icon = result.status === 'valid' ? '✅' : '❌';
      const statusText = result.httpStatus ? `HTTP ${result.httpStatus}` : result.error || 'Unknown';
      console.log(`${icon} ${table} [${id}]: ${statusText}`);
      if (result.error) {
        console.log(`   错误: ${result.error}`);
      }
      if (result.suggestion) {
        console.log(`   建议: ${result.suggestion}`);
      }
      console.log('');
    }
    
    // 4. 统计结果
    const validCount = validationResults.filter(r => r.status === 'valid').length;
    const invalidCount = validationResults.filter(r => r.status === 'invalid').length;
    const unknownCount = validationResults.filter(r => r.status === 'unknown').length;
    
    const timeMs = Date.now() - startTime;
    
    console.log('═══════════════════════════════════════════════════════════');
    console.log(`📊 检测完成（采样 ${sampleUrls.length} 个URL）`);
    console.log(`✅ 有效: ${validCount} 个`);
    console.log(`❌ 失效: ${invalidCount} 个`);
    console.log(`❓ 未知: ${unknownCount} 个`);
    console.log(`⏱️  耗时: ${timeMs}ms`);
    console.log('');
    
    // 5. 分析问题类型
    const issues = validationResults
      .filter(r => r.status === 'invalid')
      .reduce((acc, r) => {
        const key = r.error || 'Unknown';
        acc[key] = (acc[key] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);
    
    if (Object.keys(issues).length > 0) {
      console.log('🔍 问题分类:');
      Object.entries(issues).forEach(([issue, count]) => {
        console.log(`   • ${issue}: ${count} 个`);
      });
      console.log('');
    }
    
    // 6. 提供修复建议
    const recommendations: string[] = [];
    
    const forbiddenCount = validationResults.filter(r => r.httpStatus === 403).length;
    const notFoundCount = validationResults.filter(r => r.httpStatus === 404).length;
    
    if (forbiddenCount > 0) {
      recommendations.push(
        `发现 ${forbiddenCount} 个403错误 - bucket权限不足或AccessKey错误`,
        '→ 检查环境变量: ALIYUN_OSS_ACCESS_KEY_ID, ALIYUN_OSS_ACCESS_KEY_SECRET',
        '→ 确认bucket权限设置正确'
      );
    }
    
    if (notFoundCount > 0) {
      recommendations.push(
        `发现 ${notFoundCount} 个404错误 - 文件不存在`,
        '→ 这些视频可能从未上传到OSS',
        '→ 需要重新生成视频或从火山引擎迁移'
      );
    }
    
    if (recommendations.length > 0) {
      console.log('💡 修复建议:');
      recommendations.forEach(rec => console.log(`   ${rec}`));
      console.log('');
    }
    
    return {
      success: true,
      data: {
        totalChecked: sampleUrls.length,
        totalInDatabase: allUrls.length,
        validCount,
        invalidCount,
        unknownCount,
        issues,
        recommendations,
        validationResults: validationResults.map(r => ({
          id: r.id,
          table: r.table,
          url: r.url.substring(0, 100) + '...',
          status: r.status,
          httpStatus: r.httpStatus,
          error: r.error,
          suggestion: r.suggestion,
        })),
        timeMs,
      },
    };
  } catch (error: any) {
    console.error('[URL Validator] ❌ Fatal error:', error);
    
    return {
      success: false,
      error: error.message || 'Unknown error',
      timeMs: Date.now() - startTime,
    };
  }
}

/**
 * 查找所有包含特定bucket的URL
 */
export async function findUrlsByBucket(bucketName: string) {
  console.log(`🔍 查找包含 bucket "${bucketName}" 的所有URL...`);
  
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );
    
    const searchPattern = `%${bucketName}.oss-%`;
    
    // 查询storyboards
    const { data: storyboards, error: sbError } = await supabase
      .from('storyboards')
      .select('id, video_url, image_url')
      .or(`video_url.like.${searchPattern},image_url.like.${searchPattern}`);
    
    // 查询video_tasks  
    const { data: videoTasks, error: vtError } = await supabase
      .from('video_tasks')
      .select('task_id, video_url')
      .like('video_url', searchPattern);
    
    const storyboardsCount = storyboards?.length || 0;
    const videoTasksCount = videoTasks?.length || 0;
    
    console.log(`✅ 找到:`);
    console.log(`   storyboards: ${storyboardsCount} 条记录`);
    console.log(`   video_tasks: ${videoTasksCount} 条记录`);
    
    return {
      success: true,
      data: {
        bucketName,
        storyboards: storyboards || [],
        videoTasks: videoTasks || [],
        totalCount: storyboardsCount + videoTasksCount,
      },
    };
  } catch (error: any) {
    console.error('[Find by Bucket] ❌ Error:', error);
    
    return {
      success: false,
      error: error.message,
    };
  }
}
