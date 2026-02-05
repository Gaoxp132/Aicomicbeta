/**
 * 社区漫剧 - 调试工具Handler
 * 提供调试和数据查看工具
 */

import type { Context } from "npm:hono";
import * as db from "../../database/index.tsx";

/**
 * 获取原始漫剧数据（调试用）
 */
export async function getSeriesRawData(c: Context) {
  try {
    const { seriesId } = c.req.query();

    if (!seriesId) {
      return c.json({
        success: false,
        error: 'Series ID is required',
      }, 400);
    }

    console.log('[Debug] Fetching raw data for series:', seriesId);

    // 获取漫剧基本信息
    const { data: series, error: seriesError } = await db.supabase
      .from('series')
      .select('*')
      .eq('id', seriesId)
      .single();

    if (seriesError || !series) {
      console.error('[Debug] Series not found:', seriesError);
      return c.json({
        success: false,
        error: 'Series not found',
      }, 404);
    }

    // 获取所有剧集
    const { data: episodes, error: episodesError } = await db.supabase
      .from('series_episodes')
      .select('*')
      .eq('series_id', seriesId)
      .order('episode_number', { ascending: true });

    if (episodesError) {
      console.error('[Debug] Error fetching episodes:', episodesError);
    }

    // 获取所有分镜
    const episodeIds = episodes?.map(ep => ep.id) || [];
    let storyboards: any[] = [];
    
    if (episodeIds.length > 0) {
      const { data: storyboardsData, error: storyboardsError } = await db.supabase
        .from('series_storyboards')
        .select('*')
        .in('episode_id', episodeIds)
        .order('panel_number', { ascending: true });

      if (storyboardsError) {
        console.error('[Debug] Error fetching storyboards:', storyboardsError);
      } else {
        storyboards = storyboardsData || [];
      }
    }

    // 获取所有视频任务
    const { data: videoTasks, error: tasksError } = await db.supabase
      .from('video_tasks')
      .select('*')
      .eq('series_id', seriesId)
      .order('created_at', { ascending: false });

    if (tasksError) {
      console.error('[Debug] Error fetching video tasks:', tasksError);
    }

    // 获取用户互动数据
    const { data: likes, error: likesError } = await db.supabase
      .from('series_likes')
      .select('*')
      .eq('series_id', seriesId);

    const { data: comments, error: commentsError } = await db.supabase
      .from('series_comments')
      .select('*')
      .eq('series_id', seriesId)
      .order('created_at', { ascending: false });

    // 构建完整的调试数据
    const debugData = {
      series: {
        ...series,
        _metadata: {
          created_at: series.created_at,
          updated_at: series.updated_at,
          total_episodes: episodes?.length || 0,
          total_storyboards: storyboards.length,
          total_video_tasks: videoTasks?.length || 0,
        },
      },
      episodes: episodes?.map(ep => ({
        ...ep,
        storyboards: storyboards.filter(sb => sb.episode_id === ep.id),
        videoTasks: videoTasks?.filter(vt => vt.episode_id === ep.id) || [],
      })) || [],
      interactions: {
        likes_count: likes?.length || 0,
        comments_count: comments?.length || 0,
        likes: likes || [],
        comments: comments || [],
      },
      videoTasks: videoTasks || [],
      stats: {
        total_episodes: episodes?.length || 0,
        total_storyboards: storyboards.length,
        total_video_tasks: videoTasks?.length || 0,
        completed_episodes: episodes?.filter(ep => ep.status === 'completed').length || 0,
        processing_episodes: episodes?.filter(ep => ep.status === 'processing').length || 0,
        failed_episodes: episodes?.filter(ep => ep.status === 'failed').length || 0,
      },
    };

    console.log('[Debug] Raw data fetched successfully');
    console.log('[Debug] Stats:', debugData.stats);

    return c.json({
      success: true,
      data: debugData,
      timestamp: new Date().toISOString(),
    });

  } catch (error: any) {
    console.error('[Debug] Error in getSeriesRawData:', error);
    return c.json({
      success: false,
      error: error.message || 'Internal server error',
    }, 500);
  }
}