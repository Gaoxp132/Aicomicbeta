import type { Context } from "npm:hono";
import * as db from "../../database/index.tsx";
import * as ossService from "../../video/aliyun_oss.tsx";

/**
 * 自动修复系列数据的辅助函数
 */
async function quickFixSeries(seriesId: string): Promise<void> {
  try {
    // 1. 获取剧集
    const { data: episodes } = await db.supabase
      .from('series_episodes')
      .select('id')
      .eq('series_id', seriesId);

    if (!episodes || episodes.length === 0) {
      console.log(`[MigrateToEpisodes] ⏭️  Series ${seriesId} has no storyboards to migrate`);
      return;
    }

    console.log(`[MigrateToEpisodes] 🔍 Found ${episodes.length} existing episodes`);
    
    // 2. 查找所有分镜
    const { data: storyboards } = await db.supabase
      .from('series_storyboards')
      .select('id, scene_number')
      .eq('series_id', seriesId)
      .order('scene_number', { ascending: true });
    
    if (!storyboards || storyboards.length === 0) {
      console.log(`[MigrateToEpisodes] ⏭️  No storyboards found for series ${seriesId}`);
      return;
    }
    
    console.log(`[MigrateToEpisodes] 📋 Found ${storyboards.length} storyboards to process`);
    
    // 3. 为每个分镜创建或关联剧集
    for (const sb of storyboards) {
      const episodeNumber = sb.scene_number;
      
      // 检查该剧集是否存在
      let episode = episodes.find(ep => (ep as any).episode_number === episodeNumber);
      
      if (!episode) {
        console.log(`[MigrateToEpisodes] 🆕 Creating episode ${episodeNumber} for series ${seriesId}`);
        
        // 创建剧集
        const { data: newEpisode } = await db.supabase
          .from('series_episodes')
          .insert({
            series_id: seriesId,
            episode_number: episodeNumber,
            title: `第${episodeNumber}集`,
            status: 'completed',
          })
          .select()
          .single();
        
        episode = newEpisode;
      }
      
      // 更新分镜的episode_id
      if (episode) {
        await db.supabase
          .from('series_storyboards')
          .update({ episode_id: (episode as any).id })
          .eq('id', sb.id);
      }
    }
    
    console.log(`[MigrateToEpisodes] ✅ Migrated ${storyboards.length} storyboards to episodes`);
    
    // 3. 更新completed_episodes计数
    const { data: allEpisodes } = await db.supabase
      .from('series_episodes')
      .select('id')
      .eq('series_id', seriesId);

    let completedCount = 0;
    for (const ep of allEpisodes || []) {
      const { data: sbs } = await db.supabase
        .from('series_storyboards')
        .select('status, video_url, series_id, episode_number')
        .eq('series_id', seriesId)
        .eq('episode_number', ep.episode_number);
      
      if (sbs && sbs.some(sb => sb.status === 'completed' && sb.video_url)) {
        completedCount++;
      }
    }

    await db.supabase
      .from('series')
      .update({ completed_episodes: completedCount })
      .eq('id', seriesId);

    // 4. 设置封面图（如果缺失）
    const { data: series } = await db.supabase
      .from('series')
      .select('cover_image_url')  // ✅ 使用正确的列名
      .eq('id', seriesId)
      .single();

    if (!series?.cover_image_url && allEpisodes && allEpisodes.length > 0) {  // ✅ 使用正确的列名
      const { data: firstStoryboard } = await db.supabase
        .from('series_storyboards')
        .select('video_url, image_url')
        .eq('series_id', seriesId)
        .eq('episode_number', allEpisodes[0].episode_number)
        .order('scene_number')
        .limit(1)
        .maybeSingle();

      if (firstStoryboard?.video_url || firstStoryboard?.image_url) {
        await db.supabase
          .from('series')
          .update({ cover_image_url: firstStoryboard.image_url || firstStoryboard.video_url })  // ✅ 使用正确的列名
          .eq('id', seriesId);
      }
    }
  } catch (error) {
    console.error(`[Community Series] Quick fix error for ${seriesId}:`, error);
  }
}

/**
 * 获取社区漫剧列表
 */
export async function getCommunitySeriesList(c: Context) {
  try {
    const page = parseInt(c.req.query('page') || '1');
    const limit = parseInt(c.req.query('limit') || '20');
    const genre = c.req.query('genre');
    const style = c.req.query('style');
    const sortBy = c.req.query('sortBy') || 'created_at'; // created_at, likes, views
    const userPhone = c.req.query('userPhone');

    console.log('[Community Series] Fetching series list:', { page, limit, genre, style, sortBy, userPhone });

    // 🔥 修改查询逻辑：不仅获取completed状态，还要获取有剧集和视频的系列
    // 先查询所有符合条件的系列
    let query = db.supabase
      .from('series')
      .select('*', { count: 'exact' });

    // 应用过滤条件
    if (genre) {
      query = query.eq('genre', genre);
    }

    if (style) {
      query = query.eq('style', style);
    }

    if (userPhone) {
      query = query.eq('user_phone', userPhone);
    }

    // 应用排序
    switch (sortBy) {
      case 'likes':
        query = query.order('likes_count', { ascending: false });
        break;
      case 'views':
        query = query.order('views_count', { ascending: false });
        break;
      default:
        query = query.order('created_at', { ascending: false });
    }

    // 应用分页
    const offset = (page - 1) * limit;
    query = query.range(offset, offset + limit - 1);

    const { data: allSeries, error, count } = await query;

    if (error) {
      console.error('[Community Series] Query error:', error);
      return c.json({
        success: false,
        error: error.message,
        series: [],
        total: 0
      }, 500);
    }

    if (!allSeries || allSeries.length === 0) {
      console.log('[Community Series] No series found');
      return c.json({
        success: true,
        data: [],
        total: 0,
        page,
        hasMore: false
      });
    }

    console.log('[Community Series] Found', allSeries.length, 'series, filtering for episodes...');

    // 🚀 优化：使用批量查询而不是循环（避免N+1问题）
    const seriesIds = allSeries.map(s => s.id);
    
    // 批量查询所有剧集
    const { data: allEpisodes } = await db.supabase
      .from('series_episodes')
      .select('series_id, id')
      .in('series_id', seriesIds);
    
    // 构建系列ID到剧集的映射
    const seriesEpisodesMap = new Map<string, number>();
    (allEpisodes || []).forEach(ep => {
      const count = seriesEpisodesMap.get(ep.series_id) || 0;
      seriesEpisodesMap.set(ep.series_id, count + 1);
    });
    
    // 过滤有剧集的系列
    const seriesWithEpisodes = allSeries.filter(series => 
      seriesEpisodesMap.has(series.id) && (seriesEpisodesMap.get(series.id) || 0) > 0
    );

    console.log('[Community Series] Filtered to', seriesWithEpisodes.length, 'series with episodes');

    if (seriesWithEpisodes.length === 0) {
      return c.json({
        success: true,
        data: [],
        total: 0,
        page,
        hasMore: false
      });
    }

    // 获取用户信息
    const phones = [...new Set(seriesWithEpisodes.map(s => s.user_phone))];
    const { data: users } = await db.supabase
      .from('users')
      .select('phone, username, avatar_url')
      .in('phone', phones);

    const usersMap = new Map(
      (users || []).map(u => [u.phone, u])
    );

    // 构建返回数据
    const series = seriesWithEpisodes.map(s => {
      const user = usersMap.get(s.user_phone);
      return {
        id: s.id,
        title: s.title,
        description: s.description,
        genre: s.genre,
        style: s.style,
        coverImage: s.cover_image_url,  // ✅ 使用正确的列名
        totalEpisodes: s.total_episodes,
        completedEpisodes: s.completed_episodes || 0,
        status: s.status,
        likes: s.likes_count || 0,
        views: 0,  // series 表没有 views 列，暂时返回 0
        shares: s.shares_count || 0,
        comments: s.comments_count || 0,
        userPhone: s.user_phone,
        username: user?.username || '匿名用户',
        userAvatar: user?.avatar_url || '',
        createdAt: s.created_at,
        updatedAt: s.updated_at,
      };
    });

    console.log('[Community Series] Returning', series.length, 'series');

    return c.json({
      success: true,
      data: series,
      total: series.length,
      page,
      hasMore: offset + limit < (count || 0)
    });
  } catch (error: any) {
    console.error('[Community Series] Error in getCommunitySeriesList:', error);
    return c.json({
      success: false,
      error: error.message,
      data: [],
      total: 0
    }, 500);
  }
}

/**
 * 获取单个漫剧详情
 */
export async function getSeriesDetail(c: Context) {
  try {
    const seriesId = c.req.param('seriesId');

    if (!seriesId) {
      return c.json({
        success: false,
        error: 'Series ID is required'
      }, 400);
    }

    console.log('[Community Series] Fetching series detail:', seriesId);

    // 获取漫剧基本信息
    const { data: series, error: seriesError } = await db.supabase
      .from('series')
      .select('*')
      .eq('id', seriesId)
      .single();

    if (seriesError) {
      console.error('[Community Series] Series not found:', seriesError);
      return c.json({
        success: false,
        error: 'Series not found'
      }, 404);
    }

    // 获取用户信息
    const { data: user } = await db.supabase
      .from('users')
      .select('phone, username, avatar_url')
      .eq('phone', series.user_phone)
      .single();

    // 获取剧集列表
    const { data: episodes } = await db.supabase
      .from('series_episodes')
      .select('*')
      .eq('series_id', seriesId)
      .order('episode_number', { ascending: true });

    // 🔥 为剧集视频URL生成签名（修复403错误）
    const signedEpisodes = await Promise.all(
      (episodes || []).map(async (episode) => {
        try {
          // 如果有video_url，生成签名URL
          if (episode.video_url) {
            console.log('[Community Series] Signing video URL for episode:', episode.id);
            
            // 从URL中提取bucket和object path
            const urlObj = new URL(episode.video_url);
            const hostParts = urlObj.hostname.split('.');
            const urlBucket = hostParts[0];
            const objectPath = urlObj.pathname.substring(1); // 移除开头的 /
            
            const currentBucket = Deno.env.get('ALIYUN_OSS_BUCKET_NAME') || 'aicomic-awarelife';
            
            let signedUrl: string;
            // 根据bucket选择签名方法
            if (urlBucket !== currentBucket) {
              console.log(`[Community Series] Using legacy bucket (${urlBucket}) for episode:`, episode.id);
              signedUrl = await ossService.generateSignedUrlForBucket(objectPath, urlBucket, 7200); // 2小时过期
            } else {
              signedUrl = await ossService.generateSignedUrl(objectPath, 7200);
            }
            
            // ✅ 完整转换字段为camelCase
            return {
              id: episode.id,
              seriesId: episode.series_id,
              episodeNumber: episode.episode_number,
              title: episode.title,
              synopsis: episode.synopsis,
              status: episode.status,
              videoUrl: signedUrl, // 使用签名后的URL
              originalVideoUrl: episode.video_url, // 保留原始URL供参考
              mergedVideoUrl: episode.merged_video_url,
              thumbnail: episode.thumbnail_url,
              thumbnailUrl: episode.thumbnail_url,
              totalDuration: episode.total_duration || 0,
              completedStoryboardCount: episode.completed_storyboard_count || 0,
              createdAt: episode.created_at,
              updatedAt: episode.updated_at,
            };
          }
          
          // ✅ 没有video_url时也转换字段
          return {
            id: episode.id,
            seriesId: episode.series_id,
            episodeNumber: episode.episode_number,
            title: episode.title,
            synopsis: episode.synopsis,
            status: episode.status,
            videoUrl: episode.video_url,
            mergedVideoUrl: episode.merged_video_url,
            thumbnail: episode.thumbnail_url,
            thumbnailUrl: episode.thumbnail_url,
            totalDuration: episode.total_duration || 0,
            completedStoryboardCount: episode.completed_storyboard_count || 0,
            createdAt: episode.created_at,
            updatedAt: episode.updated_at,
          };
        } catch (error: any) {
          console.error('[Community Series] Failed to sign video URL for episode:', episode.id, error);
          // 签名失败时返回转换后的字段
          return {
            id: episode.id,
            seriesId: episode.series_id,
            episodeNumber: episode.episode_number,
            title: episode.title,
            synopsis: episode.synopsis,
            status: episode.status,
            videoUrl: episode.video_url,
            mergedVideoUrl: episode.merged_video_url,
            thumbnail: episode.thumbnail_url,
            thumbnailUrl: episode.thumbnail_url,
            totalDuration: episode.total_duration || 0,
            completedStoryboardCount: episode.completed_storyboard_count || 0,
            createdAt: episode.created_at,
            updatedAt: episode.updated_at,
            signError: error.message,
          };
        }
      })
    );

    // 🔥 FIX: 从series表的characters JSON字段获取角色列表（不查询独立的characters表）
    // 因为characters数据存储在series表的characters列中
    const characters = series.characters || [];

    // 构建返回数据
    const seriesDetail = {
      id: series.id,
      title: series.title,
      description: series.description,
      genre: series.genre,
      style: series.style,
      coverImage: series.cover_image_url,  // ✅ 使用正确的列名
      totalEpisodes: series.total_episodes,
      completedEpisodes: series.completed_episodes || 0,
      status: series.status,
      likes: series.likes_count || 0,
      views: 0,  // series 表没有 views 列，暂时返回 0
      shares: series.shares_count || 0,
      comments: series.comments_count || 0,
      userPhone: series.user_phone,
      username: user?.username || '匿名用户',
      userAvatar: user?.avatar_url || '',
      episodes: signedEpisodes, // 使用签名后的剧集列表
      characters: characters || [],
      createdAt: series.created_at,
      updatedAt: series.updated_at,
    };

    return c.json({
      success: true,
      series: seriesDetail
    });
  } catch (error: any) {
    console.error('[Community Series] Error in getSeriesDetail:', error);
    return c.json({
      success: false,
      error: error.message
    }, 500);
  }
}