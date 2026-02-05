/**
 * 漫剧视频合并Handler
 * 从 routes_series_video.tsx 提取
 * 负责：合并剧集视频、查询合并任务状态
 */

import type { Context } from "npm:hono";
import * as kv from "../../kv_store.tsx";

interface MergeTask {
  id: string;
  seriesId: string;
  episodeId: string;
  status: 'processing' | 'completed' | 'failed';
  addOpening: boolean;
  addEnding: boolean;
  openingText: string;
  endingText: string;
  mergedVideoUrl?: string;
  error?: string;
  createdAt: string;
  updatedAt?: string;
}

/**
 * 合并剧集视频
 * POST /series/:seriesId/episodes/:episodeId/merge
 */
export async function handleMergeEpisode(c: Context) {
  try {
    const seriesId = c.req.param("seriesId");
    const episodeId = c.req.param("episodeId");
    const { addOpening, addEnding, openingText, endingText } = await c.req.json();

    console.log("[SeriesVideoMerge] Merging episode videos:", { seriesId, episodeId });

    // 获取漫剧数据
    const seriesKey = `series:${seriesId}`;
    const seriesData = await kv.get(seriesKey);

    if (!seriesData) {
      return c.json({
        success: false,
        error: "Series not found",
      }, 404);
    }

    const series = JSON.parse(seriesData);
    const episode = series.episodes.find((ep: any) => ep.id === episodeId);

    if (!episode) {
      return c.json({
        success: false,
        error: "Episode not found",
      }, 404);
    }

    // 检查所有分镜是否都已生成视频
    const allCompleted = episode.storyboards.every((sb: any) => sb.status === 'completed' && sb.videoUrl);

    if (!allCompleted) {
      return c.json({
        success: false,
        error: "Not all storyboards have generated videos",
      }, 400);
    }

    // 创建合并任务
    const mergeTaskId = `merge-${Date.now()}`;
    const mergeTask: MergeTask = {
      id: mergeTaskId,
      seriesId,
      episodeId,
      status: 'processing',
      addOpening: addOpening || false,
      addEnding: addEnding || false,
      openingText: openingText || series.title,
      endingText: endingText || '敬请期待下集',
      createdAt: new Date().toISOString(),
    };

    await kv.set(`merge-task:${mergeTaskId}`, JSON.stringify(mergeTask));

    // 异步处理合并（这里需要调用视频编辑服务）
    processMergeTask(mergeTaskId, series, episode, mergeTask);

    console.log("[SeriesVideoMerge] ✅ Merge task created:", mergeTaskId);

    return c.json({
      success: true,
      data: {
        mergeTaskId,
      },
    });
  } catch (error: any) {
    console.error("[SeriesVideoMerge] Error creating merge task:", error);
    return c.json({
      success: false,
      error: error.message || "Failed to create merge task",
    }, 500);
  }
}

/**
 * 查询合并任务状态
 * GET /series/merge-tasks/:taskId
 */
export async function handleGetMergeTask(c: Context) {
  try {
    const taskId = c.req.param("taskId");

    const taskData = await kv.get(`merge-task:${taskId}`);

    if (!taskData) {
      return c.json({
        success: false,
        error: "Merge task not found",
      }, 404);
    }

    const task = JSON.parse(taskData);

    return c.json({
      success: true,
      data: task,
    });
  } catch (error: any) {
    console.error("[SeriesVideoMerge] Error fetching merge task:", error);
    return c.json({
      success: false,
      error: error.message || "Failed to fetch merge task",
    }, 500);
  }
}

// ==================== 异步处理函数 ====================

/**
 * 处理视频合并任务
 */
async function processMergeTask(
  mergeTaskId: string,
  series: any,
  episode: any,
  mergeTask: MergeTask
) {
  try {
    console.log("[SeriesVideoMerge] Processing merge task:", mergeTaskId);

    // TODO: 实际的视频合并逻辑
    // 1. 收集所有分镜视频URL
    // 2. 如果需要片头，生成片头视频
    // 3. 如果需要片尾，生成片尾视频
    // 4. 按顺序合并所有视频
    // 5. 上传到OSS
    // 6. 返回完整视频URL

    const videoUrls = episode.storyboards.map((sb: any) => sb.videoUrl);

    console.log("[SeriesVideoMerge] ✅ Merge completed:", mergeTaskId);

    mergeTask.status = 'completed';
    mergeTask.mergedVideoUrl = 'https://example.com/merged-video.mp4'; // TODO: 实际URL
    mergeTask.updatedAt = new Date().toISOString();
    await kv.set(`merge-task:${mergeTaskId}`, JSON.stringify(mergeTask));
  } catch (error: any) {
    console.error("[SeriesVideoMerge] Merge failed:", error);

    mergeTask.status = 'failed';
    mergeTask.error = error.message;
    await kv.set(`merge-task:${mergeTaskId}`, JSON.stringify(mergeTask));
  }
}
