/**
 * 漫剧核心CRUD处理器（PostgreSQL版本）
 * 从 routes_series_core.tsx 提取的CRUD操作
 * 新增：KV自动回退和数据迁移功能
 */

import type { Context } from "npm:hono";
import * as db from "../../database/series.tsx";
import * as interactions from "../../database/series_interactions.tsx";
import * as kv from "../../kv_store.tsx";
import { transformSeriesData } from "../../utils/case_converter.tsx";
import { supabase } from "../../database/client.tsx";

/**
 * 从KV自动迁移单个漫剧到PostgreSQL
 * 🔥 v4.2.65: 添加超时控制，避免阻塞整个请求
 */
async function autoMigrateSeries(seriesId: string): Promise<any> {
  try {
    console.log(`[AutoMigrate] 🔄 Attempting to migrate series ${seriesId} from KV...`);
    
    // 🔥 添加超时控制：如果KV访问超过5秒，直接放弃
    const MIGRATION_TIMEOUT = 5000; // 5秒超时
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Migration timeout after 5s')), MIGRATION_TIMEOUT);
    });
    
    // 🔥 添加重试逻辑以处理 API key 问题
    let kvData: any;
    let retries = 2; // 减少重试次数从3到2
    let lastError: any;
    
    const kvFetch = async () => {
      for (let i = 0; i < retries; i++) {
        try {
          kvData = await kv.get(`series:${seriesId}`);
          break; // 成功，退出重试循环
        } catch (error: any) {
          lastError = error;
          console.warn(`[AutoMigrate] ⚠️ KV get attempt ${i + 1} failed:`, error.message);
          
          // 如果是 API key 错误，等待后重试
          if (error.message?.includes('API key') || error.message?.includes('apikey')) {
            console.log(`[AutoMigrate] 💤 Waiting 100ms before retry...`);
            await new Promise(resolve => setTimeout(resolve, 100)); // 减少等待时间从200ms到100ms
          } else {
            throw error; // 非 API key 错误，直接抛出
          }
        }
      }
    };
    
    // 🔥 使用Promise.race实现超时控制
    try {
      await Promise.race([kvFetch(), timeoutPromise]);
    } catch (error: any) {
      if (error.message?.includes('timeout')) {
        console.warn(`[AutoMigrate] ⏱️ Migration timeout, skipping KV for ${seriesId}`);
        return null;
      }
      throw error;
    }
    
    if (!kvData && lastError) {
      console.error(`[AutoMigrate] ❌ Failed to migrate series ${seriesId}:`, {
        message: lastError.message,
        hint: lastError.hint,
      });
      return null;
    }
    
    if (!kvData) {
      console.log(`[AutoMigrate] ⚠️ Series ${seriesId} not found in KV`);
      return null;
    }

    const kvSeries = JSON.parse(kvData);
    
    // 创建漫剧
    const seriesData = {
      id: kvSeries.id,
      title: kvSeries.title,
      description: kvSeries.description,
      genre: kvSeries.genre,
      style: kvSeries.style,
      user_phone: kvSeries.userPhone,
      total_episodes: kvSeries.totalEpisodes || kvSeries.episodes?.length || 0,
      status: kvSeries.status,
      cover_image_url: kvSeries.coverImage,  // ✅ 使用正确的列名
      created_at: kvSeries.createdAt,
      updated_at: kvSeries.updatedAt
    };

    await db.createSeries(seriesData);
    console.log(`[AutoMigrate] ✅ Series ${seriesId} migrated successfully`);

    // 迁移角色
    if (kvSeries.characters && kvSeries.characters.length > 0) {
      for (const char of kvSeries.characters) {
        try {
          await db.createCharacters(seriesId, [{
            id: char.id,
            name: char.name,
            description: char.description,
            avatar: char.avatar,
            appearance: char.appearance,
            personality: char.personality,
            role: char.role
          }]);
        } catch (err) {
          console.warn(`[AutoMigrate] Failed to migrate character ${char.name}:`, err);
        }
      }
    }

    // 迁移剧集和分镜
    if (kvSeries.episodes && kvSeries.episodes.length > 0) {
      for (const episode of kvSeries.episodes) {
        try {
          await db.createEpisodes(seriesId, [{
            id: episode.id,
            episode_number: episode.episodeNumber,
            title: episode.title,
            synopsis: episode.synopsis,
            status: episode.status,
            created_at: episode.createdAt,
            updated_at: episode.updatedAt
          }]);

          // 迁移分镜
          if (episode.storyboards && episode.storyboards.length > 0) {
            for (const storyboard of episode.storyboards) {
              try {
                await db.createStoryboards(episode.id, [{
                  id: storyboard.id,
                  scene_number: storyboard.sceneNumber,
                  description: storyboard.description,
                  dialogue: storyboard.dialogue,
                  location: storyboard.location,
                  time_of_day: storyboard.timeOfDay,
                  camera_angle: storyboard.cameraAngle,
                  duration: storyboard.duration,
                  video_url: storyboard.videoUrl,
                  status: storyboard.status,
                  task_id: storyboard.taskId
                }]);
              } catch (err) {
                console.warn(`[AutoMigrate] Failed to migrate storyboard:`, err);
              }
            }
          }
        } catch (err) {
          console.warn(`[AutoMigrate] Failed to migrate episode ${episode.title}:`, err);
        }
      }
    }

    return await db.getSeriesWithDetails(seriesId);
  } catch (error: any) {
    console.error(`[AutoMigrate] ❌ Failed to migrate series ${seriesId}:`, error);
    return null;
  }
}

/**
 * 获取用户的所有漫剧列表（包含统计信息）
 * 新增：自动检测KV数据并迁移
 */
export async function getSeriesList(c: Context) {
  try {
    const userPhone = c.req.header('x-user-phone') || c.req.query('userPhone');
    
    if (!userPhone) {
      return c.json({ error: '缺少用户手机号' }, 400);
    }

    console.log('[SeriesCore] 📋 Fetching series list for user:', userPhone);

    // 🔍 详细调试：检查 Supabase 客户端状态
    console.log('[SeriesCore] 🔍 Supabase client check:', {
      hasSupabase: !!supabase,
      envUrl: !!Deno.env.get('SUPABASE_URL'),
      envKey: !!Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
    });

    // 尝试从PostgreSQL获取
    let seriesList = await db.getUserSeries(userPhone);
    
    console.log('[SeriesCore] 📊 Database query result:', {
      count: seriesList.length,
      seriesIds: seriesList.map(s => s.id),
    });

    // 如果PostgreSQL为空，检查KV是否有数据
    if (seriesList.length === 0) {
      console.log('[SeriesCore] 🔍 PostgreSQL empty, checking KV storage...');
      
      const userSeriesKey = `user:${userPhone}:series`;
      const userSeriesData = await kv.get(userSeriesKey);
      
      if (userSeriesData) {
        const seriesIds = JSON.parse(userSeriesData);
        console.log(`[SeriesCore] 💡 Found ${seriesIds.length} series in KV, auto-migrating...`);
        
        // 自动迁移所有系列
        const migrationResults = [];
        for (const seriesId of seriesIds) {
          try {
            const migrated = await autoMigrateSeries(seriesId);
            if (migrated) {
              migrationResults.push(migrated.series);
            }
          } catch (err) {
            console.error(`[SeriesCore] Failed to migrate ${seriesId}:`, err);
          }
        }
        
        // 重新从PostgreSQL获取
        seriesList = await db.getUserSeries(userPhone);
        console.log(`[SeriesCore] ✅ Auto-migration complete, loaded ${seriesList.length} series`);
      }
    }

    console.log('[SeriesCore] ✅ Found', seriesList.length, 'series');

    // 🚀 超激进优化：只查询count，不返回完整episodes数组
    // 将N个串行查询改为1个批量count查询
    const seriesWithStats = await Promise.all(
      seriesList.map(async (series) => {
        try {
          // 🔥 只查询count，不返回完整数据（极快）
          const { count: episodesCount, error } = await supabase
            .from('series_episodes')
            .select('id', { count: 'exact', head: true })
            .eq('series_id', series.id);
          
          if (error) {
            console.warn(`[SeriesCore] Failed to count episodes for ${series.id}:`, error);
          }
          
          const totalEpisodes = episodesCount || 0;
          
          // 🔧 转换为camelCase格式
          return transformSeriesData({
            ...series,
            // ✅ 使用count结果
            completed_episodes: series.completed_episodes || 0,
            episodes: [], // 不返回详细剧集数据，避免超时
            characters: [],
            stats: {
              charactersCount: 0,
              episodesCount: totalEpisodes,
              storyboardsCount: 0,
              completedVideosCount: series.completed_episodes || 0,
            },
          });
        } catch (err) {
          console.error(`[SeriesCore] Error processing series ${series.id}:`, err);
          return transformSeriesData({
            ...series,
            characters: [],
            episodes: [],
            stats: {
              charactersCount: 0,
              episodesCount: 0,
              storyboardsCount: 0,
              completedVideosCount: 0,
            },
          });
        }
      })
    );

    return c.json({
      success: true,
      data: seriesWithStats,
      count: seriesWithStats.length,
    });
  } catch (error: any) {
    console.error('[SeriesCore] Error fetching series list:', error);
    return c.json({
      error: '获取漫剧列表失败',
      message: error.message,
    }, 500);
  }
}

/**
 * 获取单个漫剧的详细信息（包含角色、剧集、分镜）
 * 新增：自动从KV迁移不存在的漫剧
 * 🔥 优化：支持分阶段加载，减少数据传输
 */
export async function getSeriesDetails(c: Context) {
  try {
    const seriesId = c.req.param('id');
    const userPhone = c.req.header('x-user-phone') || c.req.query('userPhone');
    
    // 🔥 新增：支持查询参数控制加载内容
    const includeCharacters = c.req.query('includeCharacters') !== 'false'; // 默认true
    const includeEpisodes = c.req.query('includeEpisodes') !== 'false'; // 默认true
    const episodesLimit = parseInt(c.req.query('episodesLimit') || '10'); // 默认只加载10集
    const episodesOffset = parseInt(c.req.query('episodesOffset') || '0'); // 默认从第0集开始
    const includeStoryboards = c.req.query('includeStoryboards') === 'true'; // 默认false，不加载分镜

    console.log('[SeriesCore] 📖 Fetching series details:', {
      seriesId,
      includeCharacters,
      includeEpisodes,
      episodesLimit,
      episodesOffset,
      includeStoryboards,
    });

    let seriesData;
    
    try {
      // 🔥 优化：只加载请求的数据
      if (includeEpisodes && episodesLimit > 0) {
        seriesData = await db.getSeriesWithDetails(seriesId);
      } else {
        // 只加载基本信息和角色
        const series = await db.getSeries(seriesId);
        if (!series) {
          throw new Error('Series not found');
        }
        
        const characters = includeCharacters 
          ? await db.getSeriesCharacters(seriesId)
          : [];
        
        seriesData = {
          series,
          characters,
          episodes: [],
        };
      }
      
      // 🔥 详细日志：检查getSeriesWithDetails返回的数据
      console.log('[SeriesCore] 🔍 getSeriesWithDetails returned:', {
        has_series: !!seriesData.series,
        series_id: seriesData.series?.id,
        characters_count: seriesData.characters?.length || 0,
        episodes_count: seriesData.episodes?.length || 0,
      });
      
      if (seriesData.episodes && seriesData.episodes.length > 0) {
        console.log('[SeriesCore] 📋 First episode sample:', {
          id: seriesData.episodes[0].id,
          episode_number: seriesData.episodes[0].episode_number,
          title: seriesData.episodes[0].title,
          has_storyboards: !!seriesData.episodes[0].storyboards,
          storyboards_count: seriesData.episodes[0].storyboards?.length || 0,
        });
      } else {
        console.warn('[SeriesCore] ⚠️ WARNING: getSeriesWithDetails returned NO episodes!');
      }
    } catch (error: any) {
      if (error.message === 'Series not found') {
        // 🔥 v4.2.65: 添加KV迁移超时控制，避免阻塞整个请求
        console.log('[SeriesCore] 🔍 Series not in PostgreSQL, attempting KV migration...');
        
        try {
          const migrated = await autoMigrateSeries(seriesId);
          
          if (migrated) {
            console.log('[SeriesCore] ✅ Auto-migrated from KV');
            seriesData = migrated;
          } else {
            // KV迁移失败或超时，直接返回404
            console.warn('[SeriesCore] ⚠️ KV migration failed or timed out');
            throw error;
          }
        } catch (migrationError: any) {
          // 🔥 捕获迁移过程中的所有错误，避免影响主流程
          console.error('[SeriesCore] ❌ Migration error:', migrationError.message);
          throw error; // 抛出原始的"Series not found"错误
        }
      } else {
        throw error;
      }
    }

    // 🔧 数据修复：如果没有剧集但有分镜，自动创建剧集
    if ((!seriesData.episodes || seriesData.episodes.length === 0)) {
      console.log('[SeriesCore] 🔧 No episodes found, checking for orphan storyboards...');
      
      // 查询所有属于该系列的分镜（通过series_id关联）
      const { data: allStoryboards } = await supabase
        .from('series_storyboards')
        .select('*')
        .eq('series_id', seriesId)
        .order('episode_number', { ascending: true })
        .order('scene_number', { ascending: true });

      if (allStoryboards && allStoryboards.length > 0) {
        console.log(`[SeriesCore] 🔧 Found ${allStoryboards.length} storyboards for series, creating episodes...`);
        
        // 按episode_number分组创建剧集
        const storyboardsByEpisode = new Map<number, any[]>();
        for (const sb of allStoryboards) {
          if (!storyboardsByEpisode.has(sb.episode_number)) {
            storyboardsByEpisode.set(sb.episode_number, []);
          }
          storyboardsByEpisode.get(sb.episode_number)!.push(sb);
        }
        
        const createdEpisodes = [];
        
        for (const [episodeNumber, storyboards] of storyboardsByEpisode) {
          try {
            const { data: newEpisode } = await supabase
              .from('series_episodes')
              .insert({
                series_id: seriesId,
                episode_number: episodeNumber,
                title: `第${episodeNumber}集`,
                synopsis: '',
                status: 'draft',
              })
              .select()
              .single();

            if (newEpisode) {
              createdEpisodes.push({
                ...newEpisode,
                storyboards: storyboards,
              });
            }
          } catch (err) {
            console.error(`[SeriesCore] Failed to create episode ${episodeNumber}:`, err);
          }
        }
        
        // 更新seriesData中的episodes
        seriesData.episodes = createdEpisodes;
        
        // 更新completed_episodes计数
        const completedCount = createdEpisodes.filter(ep => 
          ep.storyboards.some(sb => sb.status === 'completed' && sb.video_url)
        ).length;
        
        await supabase
          .from('series')
          .update({ completed_episodes: completedCount })
          .eq('id', seriesId);
      }
    }

    // 记录浏览量
    if (userPhone) {
      await interactions.incrementSeriesViews(seriesId).catch(err => 
        console.error('[SeriesCore] Failed to increment views:', err)
      );
    }

    // 获取互动数据
    const interactionData = await interactions.getSeriesInteractions(seriesId, userPhone);

    // 🔥 防御性检查：确保seriesData.series存在
    if (!seriesData || !seriesData.series) {
      console.error('[SeriesCore] ❌ Invalid seriesData structure:', seriesData);
      throw new Error('Series data is invalid or incomplete');
    }

    console.log('[SeriesCore] ✅ Series details loaded:', {
      title: seriesData.series.title,
      characters: seriesData.characters?.length || 0,
      episodes: seriesData.episodes?.length || 0,
    });

    // 🔥 调试：在转换前检查episodes数据
    console.log('[SeriesCore] 🔍 Episodes before transformation:', {
      episodes_count: seriesData.episodes?.length || 0,
      first_episode: seriesData.episodes?.[0] ? {
        id: seriesData.episodes[0].id,
        episode_number: seriesData.episodes[0].episode_number,
        title: seriesData.episodes[0].title,
        storyboards_count: seriesData.episodes[0].storyboards?.length || 0,
      } : null,
    });

    // 🔧 修复：确保episodes和characters不被series对象的空属性覆盖
    const seriesWithoutArrays = { ...seriesData.series };
    delete seriesWithoutArrays.characters;
    delete seriesWithoutArrays.episodes;

    // 转换为camelCase格式
    const responseData = transformSeriesData({
      ...seriesWithoutArrays,
      characters: seriesData.characters,
      episodes: seriesData.episodes,
      interactions: interactionData,
    });

    // 🔥 调试：在转换后检查episodes数据
    console.log('[SeriesCore] 🔍 Episodes after transformation:', {
      episodes_count: responseData.episodes?.length || 0,
      response_has_episodes: !!responseData.episodes,
      first_episode: responseData.episodes?.[0] ? {
        id: responseData.episodes[0].id,
        episodeNumber: responseData.episodes[0].episodeNumber,
        title: responseData.episodes[0].title,
      } : null,
      full_response_keys: Object.keys(responseData),
    });

    return c.json({
      success: true,
      data: responseData,
    });
  } catch (error: any) {
    console.error('[SeriesCore] Error fetching series details:', error);
    
    if (error.message === 'Series not found') {
      return c.json({
        error: '漫剧不存在',
        message: error.message,
      }, 404);
    }

    return c.json({
      error: '获取漫剧详情失败',
      message: error.message,
    }, 500);
  }
}

/**
 * 创建新漫剧（快速模式）
 */
export async function createSeries(c: Context) {
  try {
    const body = await c.req.json();
    const { title, description, genre, style, userPhone, totalEpisodes } = body;

    if (!title || !userPhone) {
      return c.json({
        error: '缺少必要参数',
        required: ['title', 'userPhone'],
      }, 400);
    }

    console.log('[SeriesCore] 📝 Creating new series:', title);

    const seriesData = {
      title: title.substring(0, 100),
      description: description?.substring(0, 500) || '',
      genre: genre || '成长励志',
      style: style || '温馨治愈',
      user_phone: userPhone,
      total_episodes: totalEpisodes || 10,
      status: 'draft',
    };

    const newSeries = await db.createSeries(seriesData);

    console.log('[SeriesCore] ✅ Series created:', newSeries.id);

    // 🔧 转换为camelCase格式返回给前端
    const responseData = transformSeriesData(newSeries);

    return c.json({
      success: true,
      data: responseData,
    });
  } catch (error: any) {
    console.error('[SeriesCore] Error creating series:', error);
    console.error('[SeriesCore] Error details:', {
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
      stack: error.stack,
    });
    
    // 🔍 检查是否是数据库连接问题
    if (error.message?.includes('Failed to fetch') || error.code === 'ECONNREFUSED') {
      return c.json({
        error: '数据库连接失败',
        message: '无法连接到数据库，请检查环境变量配置',
        details: error.message,
      }, 500);
    }
    
    return c.json({
      error: '创建漫剧失败',
      message: error.message,
      details: error.details || error.hint || 'No additional details',
    }, 500);
  }
}

/**
 * 更新漫剧信息
 */
export async function updateSeries(c: Context) {
  try {
    const seriesId = c.req.param('id');
    const body = await c.req.json();

    console.log('[SeriesCore] ✏️ Updating series:', seriesId);

    const updatedSeries = await db.updateSeries(seriesId, body);

    console.log('[SeriesCore] ✅ Series updated:', seriesId);

    // 🔧 转换为camelCase格式返回给前端
    const responseData = transformSeriesData(updatedSeries);

    return c.json({
      success: true,
      data: responseData,
    });
  } catch (error: any) {
    console.error('[SeriesCore] Error updating series:', error);
    
    if (error.message === 'Series not found') {
      return c.json({
        error: '漫剧不存在',
        message: error.message,
      }, 404);
    }

    return c.json({
      error: '更新漫剧失败',
      message: error.message,
    }, 500);
  }
}

/**
 * 删除漫剧
 */
export async function deleteSeries(c: Context) {
  try {
    const seriesId = c.req.param('id');

    console.log('[SeriesCore] 🗑️ Deleting series:', seriesId);

    await db.deleteSeries(seriesId);

    console.log('[SeriesCore] ✅ Series deleted:', seriesId);

    return c.json({
      success: true,
      message: '漫剧已删除',
    });
  } catch (error: any) {
    console.error('[SeriesCore] Error deleting series:', error);
    
    if (error.message === 'Series not found') {
      return c.json({
        error: '漫剧不存在',
        message: error.message,
      }, 404);
    }

    return c.json({
      error: '删除漫剧失败',
      message: error.message,
    }, 500);
  }
}