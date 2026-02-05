/**
 * 数据库诊断工具
 * 检查数据库表结构和列信息
 */

import type { Context } from 'npm:hono';
import { createClient } from 'jsr:@supabase/supabase-js@2';

export async function checkDatabaseSchema(c: Context) {
  try {
    console.log('[DB Diagnostics] Checking database schema...');
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Missing Supabase credentials');
    }
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    const tables = ['series', 'episodes', 'storyboards', 'video_tasks', 'characters'];
    const schemaInfo: any = {};
    
    for (const tableName of tables) {
      try {
        // 查询一条记录来获取列信息
        const { data, error } = await supabase
          .from(tableName)
          .select('*')
          .limit(1);
        
        if (error) {
          schemaInfo[tableName] = {
            error: error.message,
            code: error.code,
            hint: error.hint,
          };
        } else {
          // 获取列名
          const columns = data && data.length > 0 ? Object.keys(data[0]) : [];
          schemaInfo[tableName] = {
            exists: true,
            columns,
            sampleCount: data?.length || 0,
          };
        }
      } catch (err: any) {
        schemaInfo[tableName] = {
          error: err.message,
        };
      }
    }
    
    // 测试特定的列查询
    const columnTests = {
      'series.cover_image': null as any,
      'series.cover_image_url': null as any,
      'episodes.video_url': null as any,
      'storyboards.video_url': null as any,
      'storyboards.image_url': null as any,
    };
    
    // 测试 series.cover_image
    try {
      const { data, error } = await supabase
        .from('series')
        .select('cover_image')
        .limit(1);
      columnTests['series.cover_image'] = error ? { error: error.message } : { success: true, found: data?.length || 0 };
    } catch (err: any) {
      columnTests['series.cover_image'] = { error: err.message };
    }
    
    // 测试 series.cover_image_url
    try {
      const { data, error } = await supabase
        .from('series')
        .select('cover_image_url')
        .limit(1);
      columnTests['series.cover_image_url'] = error ? { error: error.message } : { success: true, found: data?.length || 0 };
    } catch (err: any) {
      columnTests['series.cover_image_url'] = { error: err.message };
    }
    
    // 测试 episodes.video_url
    try {
      const { data, error } = await supabase
        .from('series_episodes')
        .select('video_url')
        .limit(1);
      columnTests['series_episodes.video_url'] = error ? { error: error.message } : { success: true, found: data?.length || 0 };
    } catch (err: any) {
      columnTests['series_episodes.video_url'] = { error: err.message };
    }
    
    // 测试 storyboards.video_url
    try {
      const { data, error } = await supabase
        .from('series_storyboards')
        .select('video_url')
        .limit(1);
      columnTests['series_storyboards.video_url'] = error ? { error: error.message } : { success: true, found: data?.length || 0 };
    } catch (err: any) {
      columnTests['series_storyboards.video_url'] = { error: err.message };
    }
    
    // 测试 storyboards.image_url
    try {
      const { data, error } = await supabase
        .from('series_storyboards')
        .select('image_url')
        .limit(1);
      columnTests['series_storyboards.image_url'] = error ? { error: error.message } : { success: true, found: data?.length || 0 };
    } catch (err: any) {
      columnTests['series_storyboards.image_url'] = { error: err.message };
    }
    
    return c.json({
      success: true,
      data: {
        tables: schemaInfo,
        columnTests,
        recommendation: generateRecommendation(schemaInfo, columnTests),
      },
    });
  } catch (error: any) {
    console.error('[DB Diagnostics] Error:', error);
    return c.json({
      success: false,
      error: error.message,
    }, 500);
  }
}

function generateRecommendation(schemaInfo: any, columnTests: any): string[] {
  const recommendations: string[] = [];
  
  // 检查 series 表
  if (columnTests['series.cover_image']?.error) {
    recommendations.push('❌ series.cover_image列不存在 - 需要添加此列或使用cover_image_url');
  }
  if (columnTests['series.cover_image_url']?.success) {
    recommendations.push('✅ series.cover_image_url列存在 - 建议统一使用此列名');
  }
  
  // 检查 episodes 表
  if (columnTests['series_episodes.video_url']?.error) {
    recommendations.push('⚠️ episodes.video_url列不存在 - 这是正常的，视频URL存储在storyboards和video_tasks表中');
  }
  
  // 检查 storyboards 表
  if (columnTests['series_storyboards.video_url']?.success && columnTests['series_storyboards.image_url']?.success) {
    recommendations.push('✅ storyboards表结构正确，包含video_url和image_url列');
  }
  
  return recommendations;
}