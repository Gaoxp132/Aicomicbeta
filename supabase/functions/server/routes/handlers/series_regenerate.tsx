/**
 * 漫剧重新生成处理器
 * 用于重新生成缺失或失败的视频
 */

import type { Context } from "npm:hono";
import * as db from "../../database/index.tsx";
import { generateVideoForStoryboard } from "../../services/video_generation_service.tsx";

/**
 * 一键重新生成缺失的视频
 * POST /make-server-fc31472c/series/:id/regenerate
 */
export async function regenerateMissingVideos(c: Context) {
  const seriesId = c.req.param("id");
  
  try {
    console.log('[SeriesRegenerate] 🔄 Starting regeneration for series:', seriesId);
    
    const series = await db.getSeries(seriesId);
    if (!series) {
      return c.json({ 
        success: false,
        error: 'Series not found' 
      }, 404);
    }
    
    // 获取所有剧集
    const episodes = await db.getSeriesEpisodes(seriesId);
    
    if (episodes.length === 0) {
      return c.json({
        success: false,
        error: '该漫剧没有剧集数据',
      });
    }
    
    // 收集需要重新生成的分镜
    const missingStoryboards = [];
    let totalStoryboards = 0;
    
    for (const episode of episodes) {
      const storyboards = await db.getEpisodeStoryboards(episode.id);
      totalStoryboards += storyboards.length;
      
      for (const sb of storyboards) {
        // 如果没有视频URL，或者状态是失���，则需要重新生成
        if (!sb.video_url || sb.status === 'failed' || sb.status === 'error') {
          missingStoryboards.push({
            ...sb,
            episodeNumber: episode.episode_number,
            episodeTitle: episode.title,
          });
        }
      }
    }
    
    console.log('[SeriesRegenerate] Found', missingStoryboards.length, 'missing/failed videos out of', totalStoryboards);
    
    if (missingStoryboards.length === 0) {
      return c.json({
        success: true,
        message: '所有视频已经生成完成',
        stats: {
          total: totalStoryboards,
          missing: 0,
          tasksCreated: 0,
        }
      });
    }
    
    // 创建视频生成任务
    const tasksCreated = [];
    const tasksFailed = [];
    
    for (const sb of missingStoryboards) {
      try {
        console.log('[SeriesRegenerate] Creating task for storyboard:', sb.id, `(第${sb.episodeNumber}集-场景${sb.scene_number})`);
        
        const result = await generateVideoForStoryboard(
          sb.id,
          sb.image_prompt || sb.scene_description || `${series.title} 第${sb.episodeNumber}集 场景${sb.scene_number}`,
          series.style || 'realistic',
          sb.duration || 8,
          [] // 图片数组，如果有的话可以传入
        );
        
        if (result.success) {
          tasksCreated.push({
            episodeNumber: sb.episodeNumber,
            sceneNumber: sb.scene_number,
            taskId: result.taskId,
          });
          console.log('[SeriesRegenerate] ✅ Created task:', result.taskId);
        } else {
          throw new Error(result.error || 'Failed to create video task');
        }
      } catch (error: any) {
        console.error('[SeriesRegenerate] ❌ Failed to create task for storyboard:', sb.id, error);
        tasksFailed.push({
          episodeNumber: sb.episodeNumber,
          sceneNumber: sb.scene_number,
          error: error.message,
        });
      }
    }
    
    console.log('[SeriesRegenerate] ✅ Regeneration complete:');
    console.log('[SeriesRegenerate]   Total missing:', missingStoryboards.length);
    console.log('[SeriesRegenerate]   Tasks created:', tasksCreated.length);
    console.log('[SeriesRegenerate]   Tasks failed:', tasksFailed.length);
    
    return c.json({
      success: true,
      message: `已创建${tasksCreated.length}个视频生成任务`,
      stats: {
        total: totalStoryboards,
        missing: missingStoryboards.length,
        tasksCreated: tasksCreated.length,
        tasksFailed: tasksFailed.length,
      },
      tasks: {
        created: tasksCreated,
        failed: tasksFailed,
      },
    });
    
  } catch (error: any) {
    console.error('[SeriesRegenerate] ❌ Regeneration failed:', error);
    return c.json({
      success: false,
      error: error.message || 'Regeneration failed',
    }, 500);
  }
}

/**
 * 重新生成指定剧集的所有视频
 * POST /make-server-fc31472c/series/:id/episodes/:episodeId/regenerate
 */
export async function regenerateEpisodeVideos(c: Context) {
  const seriesId = c.req.param("id");
  const episodeId = c.req.param("episodeId");
  
  try {
    console.log('[SeriesRegenerate] 🔄 Regenerating episode:', episodeId, 'of series:', seriesId);
    
    const series = await db.getSeries(seriesId);
    if (!series) {
      return c.json({ 
        success: false,
        error: 'Series not found' 
      }, 404);
    }
    
    const episode = await db.getEpisode(episodeId);
    if (!episode || episode.series_id !== seriesId) {
      return c.json({
        success: false,
        error: 'Episode not found',
      }, 404);
    }
    
    // 获取所有分镜
    const storyboards = await db.getEpisodeStoryboards(episodeId);
    
    if (storyboards.length === 0) {
      return c.json({
        success: false,
        error: '该剧集没有分镜数据',
      });
    }
    
    // 创建视频生成任务
    const tasksCreated = [];
    const tasksFailed = [];
    
    for (const sb of storyboards) {
      try {
        console.log('[SeriesRegenerate] Creating task for storyboard:', sb.id, `(场景${sb.scene_number})`);
        
        const result = await generateVideoForStoryboard(
          sb.id,
          sb.image_prompt || sb.scene_description || `${series.title} 第${episode.episode_number}集 场景${sb.scene_number}`,
          series.style || 'realistic',
          sb.duration || 8,
          [] // 图片数组，如果有的话可以传入
        );
        
        if (result.success) {
          tasksCreated.push({
            sceneNumber: sb.scene_number,
            taskId: result.taskId,
          });
          console.log('[SeriesRegenerate] ✅ Created task:', result.taskId);
        } else {
          throw new Error(result.error || 'Failed to create video task');
        }
      } catch (error: any) {
        console.error('[SeriesRegenerate] ❌ Failed to create task for storyboard:', sb.id, error);
        tasksFailed.push({
          sceneNumber: sb.scene_number,
          error: error.message,
        });
      }
    }
    
    console.log('[SeriesRegenerate] ✅ Episode regeneration complete:');
    console.log('[SeriesRegenerate]   Total storyboards:', storyboards.length);
    console.log('[SeriesRegenerate]   Tasks created:', tasksCreated.length);
    console.log('[SeriesRegenerate]   Tasks failed:', tasksFailed.length);
    
    return c.json({
      success: true,
      message: `已为第${episode.episode_number}集创建${tasksCreated.length}个视频生成任务`,
      stats: {
        total: storyboards.length,
        tasksCreated: tasksCreated.length,
        tasksFailed: tasksFailed.length,
      },
      tasks: {
        created: tasksCreated,
        failed: tasksFailed,
      },
    });
    
  } catch (error: any) {
    console.error('[SeriesRegenerate] ❌ Episode regeneration failed:', error);
    return c.json({
      success: false,
      error: error.message || 'Episode regeneration failed',
    }, 500);
  }
}