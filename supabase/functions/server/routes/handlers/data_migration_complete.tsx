/**
 * 完整数据迁移处理器
 * 从KV存储迁移到PostgreSQL数据库
 * 
 * 功能：
 * 1. 迁移所有系列（series）
 * 2. 迁移所有作品（works）
 * 3. 迁移视频任务（video_tasks）
 * 4. 迁移互动数据（likes, comments）
 * 5. 提供进度追踪和错误处理
 */

import type { Context } from "npm:hono";
import * as kv from "../../kv_store.tsx";
import { createClient } from "npm:@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
);

interface MigrationStats {
  total: number;
  success: number;
  failed: number;
  skipped: number;
  errors: string[];
}

interface MigrationResult {
  series: MigrationStats;
  works: MigrationStats;
  videoTasks: MigrationStats;
  likes: MigrationStats;
  comments: MigrationStats;
  totalDuration: number;
}

/**
 * 🚀 主迁移入口 - 迁移所有数据
 */
export async function migrateAllData(c: Context) {
  const startTime = Date.now();
  console.log('[Data Migration] ========== 开始完整数据迁移 ==========');
  console.log('[Data Migration] 时间:', new Date().toISOString());
  
  const result: MigrationResult = {
    series: { total: 0, success: 0, failed: 0, skipped: 0, errors: [] },
    works: { total: 0, success: 0, failed: 0, skipped: 0, errors: [] },
    videoTasks: { total: 0, success: 0, failed: 0, skipped: 0, errors: [] },
    likes: { total: 0, success: 0, failed: 0, skipped: 0, errors: [] },
    comments: { total: 0, success: 0, failed: 0, skipped: 0, errors: [] },
    totalDuration: 0
  };

  try {
    // 1. 迁移系列数据
    console.log('[Data Migration] 📺 Step 1/5: 迁移系列数据...');
    result.series = await migrateSeries();
    
    // 2. 迁移作品数据
    console.log('[Data Migration] 🎬 Step 2/5: 迁移作品数据...');
    result.works = await migrateWorks();
    
    // 3. 迁移视频任务
    console.log('[Data Migration] 🎥 Step 3/5: 迁移视频任务...');
    result.videoTasks = await migrateVideoTasks();
    
    // 4. 迁移点赞数据
    console.log('[Data Migration] ❤️ Step 4/5: 迁移点赞数据...');
    result.likes = await migrateLikes();
    
    // 5. 迁移评论数据
    console.log('[Data Migration] 💬 Step 5/5: 迁移评论数据...');
    result.comments = await migrateComments();
    
    result.totalDuration = Date.now() - startTime;
    
    console.log('[Data Migration] ========== 迁移完成 ==========');
    console.log('[Data Migration] 总耗时:', result.totalDuration, 'ms');
    console.log('[Data Migration] 系列:', result.series.success, '/', result.series.total);
    console.log('[Data Migration] 作品:', result.works.success, '/', result.works.total);
    console.log('[Data Migration] 任务:', result.videoTasks.success, '/', result.videoTasks.total);
    console.log('[Data Migration] 点赞:', result.likes.success, '/', result.likes.total);
    console.log('[Data Migration] 评论:', result.comments.success, '/', result.comments.total);
    
    return c.json({
      success: true,
      message: '数据迁移完成',
      result
    });
    
  } catch (error: any) {
    console.error('[Data Migration] ❌ 迁移失败:', error);
    return c.json({
      success: false,
      error: error.message,
      result
    }, 500);
  }
}

/**
 * 迁移系列数据（优化版 - 支持批量处理）
 */
async function migrateSeries(): Promise<MigrationStats> {
  const stats: MigrationStats = {
    total: 0,
    success: 0,
    failed: 0,
    skipped: 0,
    errors: []
  };

  try {
    const seriesKeys = await kv.getByPrefix('series:');
    stats.total = seriesKeys.length;
    
    console.log('[Series Migration] 找到', stats.total, '个系列待迁移');
    
    // 批量处理（每次10个）
    const BATCH_SIZE = 10;
    for (let i = 0; i < seriesKeys.length; i += BATCH_SIZE) {
      const batch = seriesKeys.slice(i, i + BATCH_SIZE);
      
      await Promise.all(batch.map(async (kvEntry) => {
        try {
          const seriesData = JSON.parse(kvEntry.value);
          const seriesId = seriesData.id;
          
          // 检查是否已存在
          const { data: existing } = await supabase
            .from('series')
            .select('id')
            .eq('id', seriesId)
            .single();
          
          if (existing) {
            stats.skipped++;
            return;
          }
          
          // 迁移系列主数据
          const { error: seriesError } = await supabase
            .from('series')
            .insert({
              id: seriesData.id,
              user_phone: seriesData.userPhone || seriesData.user_phone || '',
              title: seriesData.title || '未命名系列',
              description: seriesData.description || '',
              genre: seriesData.genre || 'growth',
              style: seriesData.style || 'realistic',
              theme: seriesData.theme,
              story_outline: seriesData.storyOutline || seriesData.story_outline,
              core_values: seriesData.coreValues || seriesData.core_values || [],
              total_episodes: seriesData.totalEpisodes || seriesData.total_episodes || 0,
              cover_image_url: seriesData.coverImage || seriesData.cover_image_url,
              status: seriesData.status || 'draft',
              generation_progress: seriesData.generationProgress || seriesData.generation_progress || {},
              created_at: seriesData.createdAt || seriesData.created_at || new Date().toISOString(),
              updated_at: seriesData.updatedAt || seriesData.updated_at || new Date().toISOString()
            });
          
          if (seriesError) throw seriesError;
          
          // 批量迁移角色
          if (seriesData.characters && Array.isArray(seriesData.characters) && seriesData.characters.length > 0) {
            const characters = seriesData.characters.map((char: any) => ({
              id: char.id || `char-${Date.now()}-${Math.random()}`,
              series_id: seriesId,
              name: char.name || '未命名角色',
              description: char.description || '',
              appearance: char.appearance || '',
              personality: char.personality || '',
              role: char.role || 'supporting',
              growth_arc: char.growthArc || char.growth_arc,
              core_values: char.coreValues || char.core_values || [],
              avatar_url: char.avatar || char.avatar_url
            }));
            
            await supabase.from('series_characters').insert(characters);
          }
          
          // 批量迁移剧集和分镜
          if (seriesData.episodes && Array.isArray(seriesData.episodes) && seriesData.episodes.length > 0) {
            for (const ep of seriesData.episodes) {
              const { error: epError } = await supabase
                .from('series_episodes')
                .insert({
                  id: ep.id || `ep-${Date.now()}-${Math.random()}`,
                  series_id: seriesId,
                  episode_number: ep.episodeNumber || ep.episode_number || 0,
                  title: ep.title || '未命名剧集',
                  synopsis: ep.synopsis || '',
                  growth_theme: ep.growthTheme || ep.growth_theme,
                  growth_insight: ep.growthInsight || ep.growth_insight,
                  key_moment: ep.keyMoment || ep.key_moment,
                  total_duration: ep.totalDuration || ep.total_duration || 0,
                  status: ep.status || 'draft'
                });
              
              if (epError) console.warn('[Migration] Episode error:', epError);
              
              // 批量迁移分镜
              if (ep.storyboards && Array.isArray(ep.storyboards) && ep.storyboards.length > 0) {
                const storyboards = ep.storyboards.map((sb: any) => ({
                  id: sb.id || `sb-${Date.now()}-${Math.random()}`,
                  series_id: seriesId,
                  episode_number: ep.episodeNumber || ep.episode_number || 0,
                  scene_number: sb.sceneNumber || sb.scene_number || 0,
                  description: sb.description || '',
                  dialogue: sb.dialogue,
                  characters: sb.characters || [],
                  location: sb.location,
                  time_of_day: sb.timeOfDay || sb.time_of_day,
                  camera_angle: sb.cameraAngle || sb.camera_angle,
                  duration: sb.duration || 8,
                  emotional_tone: sb.emotionalTone || sb.emotional_tone,
                  growth_insight: sb.growthInsight || sb.growth_insight,
                  image_url: sb.imageUrl || sb.image_url,
                  video_url: sb.videoUrl || sb.video_url,
                  video_task_id: sb.videoTaskId || sb.video_task_id,
                  status: sb.status || 'draft',
                  error: sb.error
                }));
                
                await supabase.from('series_storyboards').insert(storyboards);
              }
            }
          }
          
          stats.success++;
          
        } catch (error: any) {
          console.error('[Series Migration] 迁移失败:', error.message);
          stats.failed++;
          stats.errors.push(error.message);
        }
      }));
      
      // 批量处理间隔100ms，避免过载
      if (i + BATCH_SIZE < seriesKeys.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
  } catch (error: any) {
    console.error('[Series Migration] 获取数据失败:', error);
    stats.errors.push(error.message);
  }
  
  return stats;
}

/**
 * 迁移作品数据
 */
async function migrateWorks(): Promise<MigrationStats> {
  const stats: MigrationStats = {
    total: 0,
    success: 0,
    failed: 0,
    skipped: 0,
    errors: []
  };

  try {
    const workKeys = await kv.getByPrefix('work:');
    stats.total = workKeys.length;
    
    console.log('[Works Migration] 找到', stats.total, '个作品待迁移');
    
    for (const kvEntry of workKeys) {
      try {
        const workData = JSON.parse(kvEntry.value);
        const workId = workData.id;
        
        // 检查是否已存在
        const { data: existing } = await supabase
          .from('works')
          .select('id')
          .eq('id', workId)
          .single();
        
        if (existing) {
          stats.skipped++;
          continue;
        }
        
        // 迁移作品
        const { error } = await supabase
          .from('works')
          .insert({
            id: workData.id,
            task_id: workData.taskId || workData.task_id,
            user_phone: workData.userPhone || workData.user_phone || '',
            title: workData.title || '未命名作品',
            prompt: workData.prompt || '',
            style: workData.style || 'realistic',
            duration: workData.duration || '8s',
            duration_seconds: workData.durationSeconds || workData.duration_seconds || 8,
            category: workData.category || 'growth',
            video_url: workData.videoUrl || workData.video_url,
            thumbnail: workData.thumbnail,
            cover_image: workData.coverImage || workData.cover_image,
            status: workData.status || 'pending',
            error: workData.error,
            is_public: workData.isPublic !== undefined ? workData.isPublic : true,
            views: workData.views || 0,
            likes: workData.likes || 0,
            shares: workData.shares || 0,
            volcengine_task_id: workData.volcengineTaskId || workData.volcengine_task_id,
            request_id: workData.requestId || workData.request_id,
            generation_metadata: workData.generationMetadata || workData.generation_metadata || {},
            created_at: workData.createdAt || workData.created_at || new Date().toISOString(),
            updated_at: workData.updatedAt || workData.updated_at || new Date().toISOString()
          });
        
        if (error) {
          throw error;
        }
        
        stats.success++;
        
      } catch (error: any) {
        stats.failed++;
        stats.errors.push(error.message);
      }
    }
    
  } catch (error: any) {
    stats.errors.push(error.message);
  }
  
  return stats;
}

/**
 * 迁移视频任务
 */
async function migrateVideoTasks(): Promise<MigrationStats> {
  const stats: MigrationStats = {
    total: 0,
    success: 0,
    failed: 0,
    skipped: 0,
    errors: []
  };

  try {
    const taskKeys = await kv.getByPrefix('video_task:');
    stats.total = taskKeys.length;
    
    console.log('[Video Tasks Migration] 找到', stats.total, '个任务待迁移');
    
    for (const kvEntry of taskKeys) {
      try {
        const taskData = JSON.parse(kvEntry.value);
        
        // 检查是否已存在
        const { data: existing } = await supabase
          .from('video_tasks')
          .select('task_id')
          .eq('task_id', taskData.taskId || taskData.task_id)
          .single();
        
        if (existing) {
          stats.skipped++;
          continue;
        }
        
        // 迁移任务
        const { error } = await supabase
          .from('video_tasks')
          .insert({
            task_id: taskData.taskId || taskData.task_id,
            user_phone: taskData.userPhone || taskData.user_phone || '',
            title: taskData.title || '未命名任务',
            prompt: taskData.prompt || '',
            style: taskData.style || 'realistic',
            duration: taskData.duration || '8s',
            category: taskData.category || 'growth',
            status: taskData.status || 'pending',
            progress: taskData.progress || 0,
            error: taskData.error,
            video_url: taskData.videoUrl || taskData.video_url,
            thumbnail: taskData.thumbnail,
            cover_image: taskData.coverImage || taskData.cover_image,
            volcengine_task_id: taskData.volcengineTaskId || taskData.volcengine_task_id,
            request_id: taskData.requestId || taskData.request_id,
            volcengine_status: taskData.volcengineStatus || taskData.volcengine_status,
            volcengine_progress: taskData.volcengineProgress || taskData.volcengine_progress || 0,
            series_id: taskData.seriesId || taskData.series_id,
            episode_number: taskData.episodeNumber || taskData.episode_number,
            scene_number: taskData.sceneNumber || taskData.scene_number,
            generation_metadata: taskData.generationMetadata || taskData.generation_metadata || {},
            created_at: taskData.createdAt || taskData.created_at || new Date().toISOString(),
            updated_at: taskData.updatedAt || taskData.updated_at || new Date().toISOString(),
            completed_at: taskData.completedAt || taskData.completed_at
          });
        
        if (error) {
          throw error;
        }
        
        stats.success++;
        
      } catch (error: any) {
        stats.failed++;
        stats.errors.push(error.message);
      }
    }
    
  } catch (error: any) {
    stats.errors.push(error.message);
  }
  
  return stats;
}

/**
 * 迁移点赞数据
 */
async function migrateLikes(): Promise<MigrationStats> {
  const stats: MigrationStats = {
    total: 0,
    success: 0,
    failed: 0,
    skipped: 0,
    errors: []
  };

  try {
    const likeKeys = await kv.getByPrefix('like:');
    stats.total = likeKeys.length;
    
    console.log('[Likes Migration] 找到', stats.total, '个点赞待迁移');
    
    for (const kvEntry of likeKeys) {
      try {
        const likeData = JSON.parse(kvEntry.value);
        
        // 检查是否已存在（避免重复）
        const { data: existing } = await supabase
          .from('likes')
          .select('id')
          .eq('work_id', likeData.workId || likeData.work_id || '')
          .eq('user_phone', likeData.userPhone || likeData.user_phone || '')
          .single();
        
        if (existing) {
          stats.skipped++;
          continue;
        }
        
        const { error } = await supabase
          .from('likes')
          .insert({
            work_id: likeData.workId || likeData.work_id || '',
            series_id: likeData.seriesId || likeData.series_id,
            user_phone: likeData.userPhone || likeData.user_phone || '',
            created_at: likeData.createdAt || likeData.created_at || new Date().toISOString()
          });
        
        if (error) {
          throw error;
        }
        
        stats.success++;
        
      } catch (error: any) {
        stats.failed++;
        stats.errors.push(error.message);
      }
    }
    
  } catch (error: any) {
    stats.errors.push(error.message);
  }
  
  return stats;
}

/**
 * 迁移评论数据
 */
async function migrateComments(): Promise<MigrationStats> {
  const stats: MigrationStats = {
    total: 0,
    success: 0,
    failed: 0,
    skipped: 0,
    errors: []
  };

  try {
    const commentKeys = await kv.getByPrefix('comment:');
    stats.total = commentKeys.length;
    
    console.log('[Comments Migration] 找到', stats.total, '个评论待迁移');
    
    for (const kvEntry of commentKeys) {
      try {
        const commentData = JSON.parse(kvEntry.value);
        
        // 检查是否已存在
        const { data: existing } = await supabase
          .from('comments')
          .select('id')
          .eq('id', commentData.id)
          .single();
        
        if (existing) {
          stats.skipped++;
          continue;
        }
        
        const { error } = await supabase
          .from('comments')
          .insert({
            id: commentData.id,
            work_id: commentData.workId || commentData.work_id,
            series_id: commentData.seriesId || commentData.series_id,
            user_phone: commentData.userPhone || commentData.user_phone || '',
            content: commentData.content || '',
            parent_id: commentData.parentId || commentData.parent_id,
            created_at: commentData.createdAt || commentData.created_at || new Date().toISOString(),
            updated_at: commentData.updatedAt || commentData.updated_at || new Date().toISOString()
          });
        
        if (error) {
          throw error;
        }
        
        stats.success++;
        
      } catch (error: any) {
        stats.failed++;
        stats.errors.push(error.message);
      }
    }
    
  } catch (error: any) {
    stats.errors.push(error.message);
  }
  
  return stats;
}

/**
 * 获取迁移状态
 */
export async function getMigrationStatus(c: Context) {
  try {
    // 统计KV中的数据
    const seriesKeys = await kv.getByPrefix('series:');
    const workKeys = await kv.getByPrefix('work:');
    const taskKeys = await kv.getByPrefix('video_task:');
    const likeKeys = await kv.getByPrefix('like:');
    const commentKeys = await kv.getByPrefix('comment:');
    
    // 统计PostgreSQL中的数据
    const { count: seriesCount } = await supabase
      .from('series')
      .select('*', { count: 'exact', head: true });
    
    const { count: worksCount } = await supabase
      .from('works')
      .select('*', { count: 'exact', head: true });
    
    const { count: tasksCount } = await supabase
      .from('video_tasks')
      .select('*', { count: 'exact', head: true });
    
    const { count: likesCount } = await supabase
      .from('likes')
      .select('*', { count: 'exact', head: true });
    
    const { count: commentsCount } = await supabase
      .from('comments')
      .select('*', { count: 'exact', head: true });
    
    return c.json({
      success: true,
      kv: {
        series: seriesKeys.length,
        works: workKeys.length,
        tasks: taskKeys.length,
        likes: likeKeys.length,
        comments: commentKeys.length
      },
      postgres: {
        series: seriesCount || 0,
        works: worksCount || 0,
        tasks: tasksCount || 0,
        likes: likesCount || 0,
        comments: commentsCount || 0
      },
      needsMigration: {
        series: seriesKeys.length > (seriesCount || 0),
        works: workKeys.length > (worksCount || 0),
        tasks: taskKeys.length > (tasksCount || 0),
        likes: likeKeys.length > (likesCount || 0),
        comments: commentKeys.length > (commentsCount || 0)
      }
    });
    
  } catch (error: any) {
    console.error('[Migration Status] Error:', error);
    return c.json({
      success: false,
      error: error.message
    }, 500);
  }
}