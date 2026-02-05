/**
 * 剧集分镜查询 Handler
 * 用于视频播放器获取剧集的所有分镜数据
 */

import type { Context } from "npm:hono";
import * as db from "../../database/index.tsx";

/**
 * 获取剧集的所有分镜
 * GET /series/episodes/:episodeId/storyboards
 */
export async function getEpisodeStoryboardsHandler(c: Context) {
  try {
    const episodeId = c.req.param('episodeId');
    
    if (!episodeId) {
      return c.json({
        success: false,
        error: 'Missing episodeId parameter',
      }, 400);
    }

    console.log('[getEpisodeStoryboards] Fetching storyboards for episode:', episodeId);

    // 获取分镜列表
    const storyboards = await db.getEpisodeStoryboards(episodeId);

    console.log('[getEpisodeStoryboards] ✅ Found', storyboards.length, 'storyboards');

    // 转换字段名（snake_case -> camelCase）
    const formattedStoryboards = storyboards.map(sb => ({
      id: sb.id,
      episodeId: sb.episode_id,
      sceneNumber: sb.scene_number,
      description: sb.description,
      dialogue: sb.dialogue,
      characters: sb.characters,
      location: sb.location,
      timeOfDay: sb.time_of_day,
      cameraAngle: sb.camera_angle,
      duration: sb.duration,
      imageUrl: sb.image_url,
      videoUrl: sb.video_url,
      status: sb.status,
      videoTaskId: sb.video_task_id,
      createdAt: sb.created_at,
      updatedAt: sb.updated_at,
    }));

    return c.json({
      success: true,
      data: formattedStoryboards,
    });

  } catch (error: any) {
    console.error('[getEpisodeStoryboards] Error:', error);
    return c.json({
      success: false,
      error: error.message || 'Failed to fetch episode storyboards',
    }, 500);
  }
}
