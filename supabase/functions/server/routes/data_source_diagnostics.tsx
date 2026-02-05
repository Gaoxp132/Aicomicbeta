/**
 * 数据源诊断工具
 * 用于检查数据在KV Store和PostgreSQL数据库中的实际状态
 * 帮助诊断数据丢失问题
 */

import type { Context } from "npm:hono";
import { supabase } from "../database/client.tsx";
import * as kv from "../kv_store.tsx";

/**
 * 诊断用户数据在两个存储系统中的状态
 * GET /make-server-fc31472c/diagnostics/data-sources/:userPhone
 */
export async function diagnoseUserDataSources(c: Context) {
  try {
    const userPhone = c.req.param('userPhone');
    
    console.log('[DataSourceDiagnostics] 🔍 Diagnosing data sources for user:', userPhone);
    
    const result = {
      userPhone,
      timestamp: new Date().toISOString(),
      postgresql: {
        connected: false,
        tables: {
          series: { exists: false, count: 0, sample: null },
          series_episodes: { exists: false, count: 0 },
          series_characters: { exists: false, count: 0 },
          series_storyboards: { exists: false, count: 0 },
          users: { exists: false, count: 0 },
          video_tasks: { exists: false, count: 0 },
        }
      },
      kvStore: {
        connected: false,
        keys: {
          userSeries: { exists: false, value: null },
          seriesData: { exists: false, count: 0, samples: [] },
        }
      },
      recommendations: [] as string[],
    };
    
    // ========== 1. 检查 PostgreSQL 数据库 ==========
    console.log('[DataSourceDiagnostics] 📊 Checking PostgreSQL database...');
    
    try {
      // 检查 series 表
      const { data: seriesData, error: seriesError, count: seriesCount } = await supabase
        .from('series')
        .select('*', { count: 'exact' })
        .eq('user_phone', userPhone);
      
      if (!seriesError) {
        result.postgresql.connected = true;
        result.postgresql.tables.series.exists = true;
        result.postgresql.tables.series.count = seriesCount || 0;
        
        if (seriesData && seriesData.length > 0) {
          result.postgresql.tables.series.sample = {
            id: seriesData[0].id,
            title: seriesData[0].title,
            status: seriesData[0].status,
            created_at: seriesData[0].created_at,
          };
        }
        
        console.log(`[DataSourceDiagnostics] ✅ Series table: ${seriesCount} records found`);
      } else {
        console.error('[DataSourceDiagnostics] ❌ Series table error:', seriesError);
        result.recommendations.push(`Series表查询失败: ${seriesError.message}`);
      }
      
      // 检查 series_episodes 表
      if (seriesData && seriesData.length > 0) {
        const seriesIds = seriesData.map(s => s.id);
        const { count: episodesCount, error: episodesError } = await supabase
          .from('series_episodes')
          .select('id', { count: 'exact', head: true })
          .in('series_id', seriesIds);
        
        if (!episodesError) {
          result.postgresql.tables.series_episodes.exists = true;
          result.postgresql.tables.series_episodes.count = episodesCount || 0;
          console.log(`[DataSourceDiagnostics] ✅ Episodes table: ${episodesCount} records`);
        }
      }
      
      // 检查 series_characters 表
      if (seriesData && seriesData.length > 0) {
        const seriesIds = seriesData.map(s => s.id);
        const { count: charsCount, error: charsError } = await supabase
          .from('series_characters')
          .select('id', { count: 'exact', head: true })
          .in('series_id', seriesIds);
        
        if (!charsError) {
          result.postgresql.tables.series_characters.exists = true;
          result.postgresql.tables.series_characters.count = charsCount || 0;
          console.log(`[DataSourceDiagnostics] ✅ Characters table: ${charsCount} records`);
        }
      }
      
      // 检查 series_storyboards 表
      if (seriesData && seriesData.length > 0) {
        const seriesIds = seriesData.map(s => s.id);
        
        // 先获取所有剧集ID
        const { data: episodesData } = await supabase
          .from('series_episodes')
          .select('id')
          .in('series_id', seriesIds);
        
        if (episodesData && episodesData.length > 0) {
          const episodeIds = episodesData.map(e => e.id);
          const { count: storyboardsCount, error: storyboardsError } = await supabase
            .from('series_storyboards')
            .select('id', { count: 'exact', head: true })
            .in('episode_id', episodeIds);
          
          if (!storyboardsError) {
            result.postgresql.tables.series_storyboards.exists = true;
            result.postgresql.tables.series_storyboards.count = storyboardsCount || 0;
            console.log(`[DataSourceDiagnostics] ✅ Storyboards table: ${storyboardsCount} records`);
          }
        }
      }
      
      // 检查 users 表
      const { count: usersCount, error: usersError } = await supabase
        .from('users')
        .select('phone', { count: 'exact', head: true })
        .eq('phone', userPhone);
      
      if (!usersError) {
        result.postgresql.tables.users.exists = true;
        result.postgresql.tables.users.count = usersCount || 0;
        console.log(`[DataSourceDiagnostics] ✅ Users table: ${usersCount} records`);
      }
      
      // 检查 video_tasks 表
      const { count: tasksCount, error: tasksError } = await supabase
        .from('video_tasks')
        .select('task_id', { count: 'exact', head: true })
        .eq('user_phone', userPhone);
      
      if (!tasksError) {
        result.postgresql.tables.video_tasks.exists = true;
        result.postgresql.tables.video_tasks.count = tasksCount || 0;
        console.log(`[DataSourceDiagnostics] ✅ Video tasks table: ${tasksCount} records`);
      }
      
    } catch (pgError: any) {
      console.error('[DataSourceDiagnostics] ❌ PostgreSQL connection error:', pgError);
      result.recommendations.push(`PostgreSQL连接失败: ${pgError.message}`);
    }
    
    // ========== 2. 检查 KV Store ==========
    console.log('[DataSourceDiagnostics] 🗂️ Checking KV Store...');
    
    try {
      // 检查用户的漫剧列表键
      const userSeriesKey = `user:${userPhone}:series`;
      const userSeriesValue = await kv.get(userSeriesKey);
      
      if (userSeriesValue) {
        result.kvStore.connected = true;
        result.kvStore.keys.userSeries.exists = true;
        
        try {
          const seriesIds = JSON.parse(userSeriesValue);
          result.kvStore.keys.userSeries.value = seriesIds;
          
          console.log(`[DataSourceDiagnostics] 📦 KV Store: Found ${seriesIds.length} series IDs`);
          
          // 检查每个漫剧的数据
          result.kvStore.keys.seriesData.count = seriesIds.length;
          
          for (const seriesId of seriesIds.slice(0, 3)) { // 只检查前3个
            const seriesKey = `series:${seriesId}`;
            const seriesData = await kv.get(seriesKey);
            
            if (seriesData) {
              const parsed = JSON.parse(seriesData);
              result.kvStore.keys.seriesData.samples.push({
                id: parsed.id,
                title: parsed.title,
                status: parsed.status,
                episodesCount: parsed.episodes?.length || 0,
              });
              result.kvStore.keys.seriesData.exists = true;
            }
          }
          
        } catch (parseError) {
          console.error('[DataSourceDiagnostics] ❌ Failed to parse KV data:', parseError);
          result.recommendations.push('KV数据格式错误');
        }
      } else {
        console.log('[DataSourceDiagnostics] ℹ️ No data in KV Store for this user');
      }
      
      result.kvStore.connected = true;
      
    } catch (kvError: any) {
      console.error('[DataSourceDiagnostics] ❌ KV Store error:', kvError);
      result.recommendations.push(`KV Store访问失败: ${kvError.message}`);
    }
    
    // ========== 3. 生成建议 ==========
    if (result.postgresql.connected && result.postgresql.tables.series.count > 0) {
      result.recommendations.push('✅ PostgreSQL数据正常，应该可以正常使用');
    } else if (result.kvStore.keys.seriesData.exists && result.postgresql.tables.series.count === 0) {
      result.recommendations.push('⚠️ 数据在KV Store中但不在PostgreSQL中，需要执行迁移');
      result.recommendations.push(`执行迁移: POST ${c.req.url.split('/diagnostics')[0]}/migration/migrate-user/${userPhone}`);
    } else if (!result.postgresql.connected) {
      result.recommendations.push('❌ PostgreSQL连接失败，请检查数据库配置');
    } else if (!result.kvStore.connected) {
      result.recommendations.push('❌ KV Store连接失败');
    } else {
      result.recommendations.push('⚠️ 两个存储系统都没有找到数据');
    }
    
    return c.json({
      success: true,
      data: result,
    });
    
  } catch (error: any) {
    console.error('[DataSourceDiagnostics] ❌ Fatal error:', error);
    return c.json({
      success: false,
      error: error.message,
      stack: error.stack,
    }, 500);
  }
}

/**
 * 迁移单个用户的所有数据从KV Store到PostgreSQL
 * POST /make-server-fc31472c/migration/migrate-user/:userPhone
 */
export async function migrateUserData(c: Context) {
  try {
    const userPhone = c.req.param('userPhone');
    
    console.log('[DataMigration] 🚀 Starting migration for user:', userPhone);
    
    const result = {
      userPhone,
      timestamp: new Date().toISOString(),
      migrated: {
        series: 0,
        episodes: 0,
        characters: 0,
        storyboards: 0,
      },
      errors: [] as string[],
    };
    
    // 获取用户的漫剧列表
    const userSeriesKey = `user:${userPhone}:series`;
    const userSeriesValue = await kv.get(userSeriesKey);
    
    if (!userSeriesValue) {
      return c.json({
        success: false,
        error: 'No data found in KV Store for this user',
      }, 404);
    }
    
    const seriesIds = JSON.parse(userSeriesValue);
    console.log(`[DataMigration] Found ${seriesIds.length} series to migrate`);
    
    // 迁移每个漫剧
    for (const seriesId of seriesIds) {
      try {
        const seriesKey = `series:${seriesId}`;
        const seriesData = await kv.get(seriesKey);
        
        if (!seriesData) {
          result.errors.push(`Series ${seriesId}: Data not found in KV`);
          continue;
        }
        
        const kvSeries = JSON.parse(seriesData);
        
        // 1. 迁移漫剧主表
        const { error: seriesError } = await supabase
          .from('series')
          .upsert({
            id: kvSeries.id,
            title: kvSeries.title,
            description: kvSeries.description,
            genre: kvSeries.genre,
            style: kvSeries.style,
            user_phone: kvSeries.userPhone || userPhone,
            total_episodes: kvSeries.totalEpisodes || kvSeries.episodes?.length || 0,
            completed_episodes: kvSeries.completedEpisodes || 0,
            status: kvSeries.status || 'draft',
            cover_image_url: kvSeries.coverImage || kvSeries.cover_image_url,
            created_at: kvSeries.createdAt || new Date().toISOString(),
            updated_at: kvSeries.updatedAt || new Date().toISOString(),
          });
        
        if (seriesError) {
          result.errors.push(`Series ${seriesId}: ${seriesError.message}`);
          continue;
        }
        
        result.migrated.series++;
        console.log(`[DataMigration] ✅ Migrated series: ${kvSeries.title}`);
        
        // 2. 迁移角色
        if (kvSeries.characters && Array.isArray(kvSeries.characters)) {
          for (const char of kvSeries.characters) {
            const { error: charError } = await supabase
              .from('series_characters')
              .upsert({
                id: char.id,
                series_id: seriesId,
                name: char.name,
                description: char.description,
                avatar: char.avatar,
                appearance: char.appearance,
                personality: char.personality,
                role: char.role,
              });
            
            if (!charError) {
              result.migrated.characters++;
            }
          }
        }
        
        // 3. 迁移剧集
        if (kvSeries.episodes && Array.isArray(kvSeries.episodes)) {
          for (const episode of kvSeries.episodes) {
            const { error: episodeError } = await supabase
              .from('series_episodes')
              .upsert({
                id: episode.id,
                series_id: seriesId,
                episode_number: episode.episodeNumber,
                title: episode.title,
                synopsis: episode.synopsis,
                status: episode.status || 'draft',
                video_url: episode.videoUrl,
                created_at: episode.createdAt || new Date().toISOString(),
                updated_at: episode.updatedAt || new Date().toISOString(),
              });
            
            if (!episodeError) {
              result.migrated.episodes++;
              
              // 4. 迁移分镜
              if (episode.storyboards && Array.isArray(episode.storyboards)) {
                for (const sb of episode.storyboards) {
                  const { error: sbError } = await supabase
                    .from('series_storyboards')
                    .upsert({
                      id: sb.id,
                      episode_id: episode.id,
                      scene_number: sb.sceneNumber,
                      description: sb.description,
                      dialogue: sb.dialogue,
                      location: sb.location,
                      time_of_day: sb.timeOfDay,
                      camera_angle: sb.cameraAngle,
                      duration: sb.duration,
                      video_url: sb.videoUrl,
                      status: sb.status || 'draft',
                      task_id: sb.taskId,
                    });
                  
                  if (!sbError) {
                    result.migrated.storyboards++;
                  }
                }
              }
            }
          }
        }
        
      } catch (seriesError: any) {
        result.errors.push(`Series ${seriesId}: ${seriesError.message}`);
        console.error(`[DataMigration] ❌ Failed to migrate series ${seriesId}:`, seriesError);
      }
    }
    
    console.log('[DataMigration] ✅ Migration complete:', result.migrated);
    
    return c.json({
      success: true,
      data: result,
    });
    
  } catch (error: any) {
    console.error('[DataMigration] ❌ Fatal error:', error);
    return c.json({
      success: false,
      error: error.message,
      stack: error.stack,
    }, 500);
  }
}

/**
 * 注册诊断路由
 */
export function registerDataSourceDiagnosticsRoutes(app: any) {
  const PREFIX = '/make-server-fc31472c';
  
  // 诊断用户数据源
  app.get(`${PREFIX}/diagnostics/data-sources/:userPhone`, diagnoseUserDataSources);
  
  // 迁移用户数据
  app.post(`${PREFIX}/migration/migrate-user/:userPhone`, migrateUserData);
  
  console.log('[DataSourceDiagnostics] ✅ Routes registered');
}
