/**
 * 漫剧数据检查和视频管理Handler
 * 提供数据检查、视频列表等功能
 */

import type { Context } from "npm:hono";
import * as db from "../../database/index.tsx";

/**
 * 列出漫剧的所有视频
 */
export async function listSeriesVideos(c: Context) {
  try {
    const seriesId = c.req.param('id');

    if (!seriesId) {
      return c.json({
        success: false,
        error: 'Series ID is required',
      }, 400);
    }

    console.log('[Data Inspector] 📹 Listing videos for series:', seriesId);

    // 获取漫剧基本信息
    const { data: series, error: seriesError } = await db.supabase
      .from('series')
      .select('*')
      .eq('id', seriesId)
      .single();

    if (seriesError || !series) {
      console.error('[Data Inspector] Series not found:', seriesError);
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
      console.error('[Data Inspector] Error fetching episodes:', episodesError);
      return c.json({
        success: false,
        error: 'Failed to fetch episodes',
      }, 500);
    }

    // 获取所有视频任务
    const { data: videoTasks, error: tasksError } = await db.supabase
      .from('video_tasks')
      .select('*')
      .eq('series_id', seriesId)
      .order('created_at', { ascending: false });

    if (tasksError) {
      console.error('[Data Inspector] Error fetching video tasks:', tasksError);
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
        console.error('[Data Inspector] Error fetching storyboards:', storyboardsError);
      } else {
        storyboards = storyboardsData || [];
      }
    }

    // 组织视频数据
    const videoData = {
      series: {
        id: series.id,
        title: series.title,
        description: series.description,
        total_episodes: episodes?.length || 0,
      },
      episodes: episodes?.map(episode => {
        const episodeStoryboards = storyboards.filter(sb => sb.episode_id === episode.id);
        const episodeTasks = videoTasks?.filter(vt => vt.episode_id === episode.id) || [];
        
        return {
          id: episode.id,
          episode_number: episode.episode_number,
          title: episode.title,
          status: episode.status,
          video_url: episode.video_url,
          merged_video_url: episode.merged_video_url,
          thumbnail: episode.thumbnail,
          storyboards: episodeStoryboards.map(sb => ({
            id: sb.id,
            panel_number: sb.panel_number,
            description: sb.description,
            video_url: sb.video_url,
            video_task_id: sb.video_task_id,
            status: sb.status,
          })),
          video_tasks: episodeTasks.map(vt => ({
            task_id: vt.task_id,
            volcengine_task_id: vt.volcengine_task_id,
            status: vt.status,
            video_url: vt.video_url,
            thumbnail: vt.thumbnail,
            created_at: vt.created_at,
            updated_at: vt.updated_at,
          })),
          stats: {
            total_storyboards: episodeStoryboards.length,
            completed_storyboards: episodeStoryboards.filter(sb => sb.status === 'completed').length,
            processing_storyboards: episodeStoryboards.filter(sb => sb.status === 'processing').length,
            failed_storyboards: episodeStoryboards.filter(sb => sb.status === 'failed').length,
            total_video_tasks: episodeTasks.length,
            completed_tasks: episodeTasks.filter(vt => vt.status === 'completed').length,
            processing_tasks: episodeTasks.filter(vt => vt.status === 'processing').length,
            failed_tasks: episodeTasks.filter(vt => vt.status === 'failed').length,
          },
        };
      }) || [],
      summary: {
        total_episodes: episodes?.length || 0,
        total_storyboards: storyboards.length,
        total_video_tasks: videoTasks?.length || 0,
        completed_episodes: episodes?.filter(ep => ep.status === 'completed').length || 0,
        processing_episodes: episodes?.filter(ep => ep.status === 'processing').length || 0,
        failed_episodes: episodes?.filter(ep => ep.status === 'failed').length || 0,
        completed_storyboards: storyboards.filter(sb => sb.status === 'completed').length,
        processing_storyboards: storyboards.filter(sb => sb.status === 'processing').length,
        failed_storyboards: storyboards.filter(sb => sb.status === 'failed').length,
        completed_tasks: videoTasks?.filter(vt => vt.status === 'completed').length || 0,
        processing_tasks: videoTasks?.filter(vt => vt.status === 'processing').length || 0,
        failed_tasks: videoTasks?.filter(vt => vt.status === 'failed').length || 0,
      },
    };

    console.log('[Data Inspector] ✅ Videos listed successfully');
    console.log('[Data Inspector] Summary:', videoData.summary);

    return c.json({
      success: true,
      data: videoData,
    });

  } catch (error: any) {
    console.error('[Data Inspector] Error in listSeriesVideos:', error);
    return c.json({
      success: false,
      error: error.message || 'Internal server error',
    }, 500);
  }
}