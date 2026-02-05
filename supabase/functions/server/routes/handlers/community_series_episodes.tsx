/**
 * 社区漫剧剧集操作处理器
 * 从 community_series.tsx 提取的剧集合并和缩略图生成逻辑
 */

import type { Context } from "npm:hono";
import * as db from "../../database/index.tsx";

/**
 * 合并剧集的分镜视频
 */
export async function mergeEpisodeStoryboards(c: Context) {
  try {
    const seriesId = c.req.param('seriesId');
    const episodeId = c.req.param('episodeId');

    if (!seriesId || !episodeId) {
      return c.json({
        success: false,
        error: 'Series ID and Episode ID are required'
      }, 400);
    }

    console.log('[Community Series] Merging episode storyboards:', { seriesId, episodeId });

    // 先获取episode的series_id和episode_number
    const { data: episode, error: epError } = await db.supabase
      .from('series_episodes')
      .select('series_id, episode_number')
      .eq('id', episodeId)
      .single();

    if (epError || !episode) {
      console.error('[Community Series] Episode not found:', epError);
      return c.json({
        success: false,
        error: 'Episode not found'
      }, 404);
    }

    // 获取剧集的所有分镜
    const { data: storyboards, error } = await db.supabase
      .from('series_storyboards')
      .select('*')
      .eq('series_id', episode.series_id)
      .eq('episode_number', episode.episode_number)
      .eq('status', 'completed')
      .order('scene_number', { ascending: true });

    if (error) {
      console.error('[Community Series] Error fetching storyboards:', error);
      return c.json({
        success: false,
        error: error.message
      }, 500);
    }

    if (!storyboards || storyboards.length === 0) {
      return c.json({
        success: false,
        error: 'No completed storyboards found for this episode'
      }, 400);
    }

    // TODO: 实现视频合并逻辑
    // 这里需要调用视频处理服务来合并视频
    // 暂时返回分镜列表
    
    return c.json({
      success: true,
      message: 'Video merging not yet implemented',
      storyboards: storyboards.map(s => ({
        id: s.id,
        sceneNumber: s.scene_number,
        videoUrl: s.video_url,
        duration: s.duration
      }))
    });
  } catch (error: any) {
    console.error('[Community Series] Error in mergeEpisodeStoryboards:', error);
    return c.json({
      success: false,
      error: error.message
    }, 500);
  }
}

/**
 * 生成剧集缩略图
 */
export async function generateEpisodeThumbnail(c: Context) {
  try {
    const seriesId = c.req.param('seriesId');
    const episodeId = c.req.param('episodeId');
    const body = await c.req.json();
    const { timestamp } = body;

    if (!seriesId || !episodeId) {
      return c.json({
        success: false,
        error: 'Series ID and Episode ID are required'
      }, 400);
    }

    console.log('[Community Series] Generating episode thumbnail:', { seriesId, episodeId, timestamp });

    // 获取剧集信息
    const { data: episode, error: episodeError } = await db.supabase
      .from('series_episodes')
      .select('*')
      .eq('id', episodeId)
      .single();

    if (episodeError) {
      console.error('[Community Series] Episode not found:', episodeError);
      return c.json({
        success: false,
        error: 'Episode not found'
      }, 404);
    }

    if (!episode.merged_video_url) {
      return c.json({
        success: false,
        error: 'Episode has no merged video'
      }, 400);
    }

    // TODO: 实现缩略图生成逻辑
    // 这里需要调用视频处理服务从指定时间戳提取帧
    // 暂时返回占位响应
    
    return c.json({
      success: true,
      message: 'Thumbnail generation not yet implemented',
      thumbnailUrl: episode.thumbnail_url || ''
    });
  } catch (error: any) {
    console.error('[Community Series] Error in generateEpisodeThumbnail:', error);
    return c.json({
      success: false,
      error: error.message
    }, 500);
  }
}