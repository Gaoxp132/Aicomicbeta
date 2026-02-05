/**
 * OSS URL迁移脚本
 * 
 * 用途：将数据库中的旧OSS URL迁移到新的bucket和路径
 * 
 * 迁移详情：
 * - 旧bucket: awarelife
 * - 新bucket: aicomic-awarelife
 * - 新路径前缀: aicomic/
 * 
 * URL转换示例：
 * 旧: https://awarelife.oss-cn-shenzhen.aliyuncs.com/video-doubao/xxx.mp4
 * 新: https://aicomic-awarelife.oss-cn-shenzhen.aliyuncs.com/aicomic/video-doubao/xxx.mp4
 * 
 * 注意：
 * - episodes表没有video_url列，视频URL存储在storyboards.video_url和video_tasks.video_url
 * - 使用storyboards表替代shots表（shots表不存在）
 */

import { createClient } from 'jsr:@supabase/supabase-js@2';

/**
 * 转换OSS URL
 */
function convertOSSUrl(oldUrl: string): string {
  if (!oldUrl) return oldUrl;
  
  // 匹配旧的OSS URL格式
  const oldPattern = /https:\/\/awarelife\.oss-cn-shenzhen\.aliyuncs\.com\/(.*)/;
  const match = oldUrl.match(oldPattern);
  
  if (!match) {
    // 不是旧格式，返回原URL
    console.log('  ⏭️ Skipping (not old format):', oldUrl.substring(0, 100));
    return oldUrl;
  }
  
  // 提取路径
  const oldPath = match[1];
  
  // 构建新URL
  const newUrl = `https://aicomic-awarelife.oss-cn-shenzhen.aliyuncs.com/aicomic/${oldPath}`;
  
  console.log('  ✅ Converted:', {
    from: oldUrl.substring(0, 80) + '...',
    to: newUrl.substring(0, 80) + '...',
  });
  
  return newUrl;
}

/**
 * 迁移分镜的图片和视频URL
 */
async function migrateStoryboardUrls(supabase: any): Promise<number> {
  console.log('\n🎬 Migrating storyboard image and video URLs...');
  
  try {
    // 1. 查询所有包含旧URL的分镜（图片或视频）
    const { data: storyboards, error: fetchError } = await supabase
      .from('storyboards')
      .select('id, image_url, video_url')
      .or('image_url.like.%awarelife.oss-cn-shenzhen.aliyuncs.com%,video_url.like.%awarelife.oss-cn-shenzhen.aliyuncs.com%');
    
    if (fetchError) {
      console.error('❌ Failed to fetch storyboards:', fetchError);
      return 0;
    }
    
    if (!storyboards || storyboards.length === 0) {
      console.log('  ℹ️ No storyboards to migrate');
      return 0;
    }
    
    console.log(`  📋 Found ${storyboards.length} storyboards to migrate`);
    
    // 2. 逐个更新
    let successCount = 0;
    for (const sb of storyboards) {
      const updates: any = {};
      
      // 转换image_url
      if (sb.image_url) {
        const newImageUrl = convertOSSUrl(sb.image_url);
        if (newImageUrl !== sb.image_url) {
          updates.image_url = newImageUrl;
        }
      }
      
      // 转换video_url
      if (sb.video_url) {
        const newVideoUrl = convertOSSUrl(sb.video_url);
        if (newVideoUrl !== sb.video_url) {
          updates.video_url = newVideoUrl;
        }
      }
      
      // 如果有更新，执行更新
      if (Object.keys(updates).length > 0) {
        const { error: updateError } = await supabase
          .from('storyboards')
          .update(updates)
          .eq('id', sb.id);
        
        if (updateError) {
          console.error(`  ❌ Failed to update storyboard ${sb.id}:`, updateError);
        } else {
          successCount++;
        }
      }
    }
    
    console.log(`  ✅ Successfully migrated ${successCount} storyboards`);
    return successCount;
  } catch (error: any) {
    console.error('❌ Storyboard migration failed:', error);
    return 0;
  }
}

/**
 * 迁移剧集封面URL
 */
async function migrateSeriesCoverUrls(supabase: any): Promise<number> {
  console.log('\n📚 Migrating series cover URLs...');
  
  try {
    const { data: series, error: fetchError } = await supabase
      .from('series')
      .select('id, cover_image_url')
      .like('cover_image_url', '%awarelife.oss-cn-shenzhen.aliyuncs.com%');
    
    if (fetchError) {
      console.error('❌ Failed to fetch series:', fetchError);
      return 0;
    }
    
    if (!series || series.length === 0) {
      console.log('  ℹ️ No series to migrate');
      return 0;
    }
    
    console.log(`  📋 Found ${series.length} series to migrate`);
    
    let successCount = 0;
    for (const s of series) {
      const newUrl = convertOSSUrl(s.cover_image_url);
      
      if (newUrl === s.cover_image_url) {
        continue;
      }
      
      const { error: updateError } = await supabase
        .from('series')
        .update({ cover_image_url: newUrl })
        .eq('id', s.id);
      
      if (updateError) {
        console.error(`  ❌ Failed to update series ${s.id}:`, updateError);
      } else {
        successCount++;
      }
    }
    
    console.log(`  ✅ Successfully migrated ${successCount} series`);
    return successCount;
  } catch (error: any) {
    console.error('❌ Series migration failed:', error);
    return 0;
  }
}

/**
 * 迁移视频任务的视频URL
 */
async function migrateVideoTaskUrls(supabase: any): Promise<number> {
  console.log('\n🎥 Migrating video task URLs...');
  
  try {
    const { data: tasks, error: fetchError } = await supabase
      .from('video_tasks')
      .select('id, task_id, video_url')
      .like('video_url', '%awarelife.oss-cn-shenzhen.aliyuncs.com%');
    
    if (fetchError) {
      console.error('❌ Failed to fetch video tasks:', fetchError);
      return 0;
    }
    
    if (!tasks || tasks.length === 0) {
      console.log('  ℹ️ No video tasks to migrate');
      return 0;
    }
    
    console.log(`  📋 Found ${tasks.length} video tasks to migrate`);
    
    let successCount = 0;
    for (const task of tasks) {
      const newUrl = convertOSSUrl(task.video_url);
      
      if (newUrl === task.video_url) {
        continue;
      }
      
      const { error: updateError } = await supabase
        .from('video_tasks')
        .update({ video_url: newUrl })
        .eq('id', task.id);
      
      if (updateError) {
        console.error(`  ❌ Failed to update video task ${task.id}:`, updateError);
      } else {
        successCount++;
      }
    }
    
    console.log(`  ✅ Successfully migrated ${successCount} video tasks`);
    return successCount;
  } catch (error: any) {
    console.error('❌ Video task migration failed:', error);
    return 0;
  }
}

/**
 * 执行完整的URL迁移
 */
export async function runOSSUrlMigration(): Promise<{
  success: boolean;
  storyboardsMigrated: number;
  seriesMigrated: number;
  videoTasksMigrated: number;
  totalMigrated: number;
  error?: string;
}> {
  console.log('🚀 Starting OSS URL migration...');
  console.log('📦 Old bucket: awarelife');
  console.log('📦 New bucket: aicomic-awarelife');
  console.log('📁 New prefix: aicomic/');
  console.log('---');
  
  try {
    // 创建Supabase客户端
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Missing Supabase credentials');
    }
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    // 执行迁移
    const storyboardsMigrated = await migrateStoryboardUrls(supabase);
    const seriesMigrated = await migrateSeriesCoverUrls(supabase);
    const videoTasksMigrated = await migrateVideoTaskUrls(supabase);
    
    const totalMigrated = storyboardsMigrated + seriesMigrated + videoTasksMigrated;
    
    console.log('\n✅ Migration complete!');
    console.log('📊 Summary:');
    console.log(`  - Storyboards: ${storyboardsMigrated}`);
    console.log(`  - Series: ${seriesMigrated}`);
    console.log(`  - Video Tasks: ${videoTasksMigrated}`);
    console.log(`  - Total: ${totalMigrated}`);
    
    return {
      success: true,
      storyboardsMigrated,
      seriesMigrated,
      videoTasksMigrated,
      totalMigrated,
    };
  } catch (error: any) {
    console.error('❌ Migration failed:', error);
    return {
      success: false,
      storyboardsMigrated: 0,
      seriesMigrated: 0,
      videoTasksMigrated: 0,
      totalMigrated: 0,
      error: error.message,
    };
  }
}