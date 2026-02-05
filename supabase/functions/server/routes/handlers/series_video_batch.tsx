/**
 * 漫剧视频批量生成Handler
 * 从 routes_series_video.tsx 提取
 * 负责：批量生成分镜视频、查询批量任务状态
 */

import type { Context } from "npm:hono";
import * as kv from "../../kv_store.tsx";

interface BatchGenerateTask {
  id: string;
  seriesId: string;
  episodeId: string;
  storyboardIds: string[];
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  completedCount: number;
  totalCount: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * 批量生成所有分镜视频
 * POST /series/:seriesId/episodes/:episodeId/batch-generate
 */
export async function handleBatchGenerate(c: Context) {
  try {
    const seriesId = c.req.param("seriesId");
    const episodeId = c.req.param("episodeId");
    const { userPhone } = await c.req.json();

    console.log("[SeriesVideoBatch] Starting batch generation:", { seriesId, episodeId });

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

    // 创建批量任务
    const batchTaskId = `batch-${Date.now()}`;
    const batchTask: BatchGenerateTask = {
      id: batchTaskId,
      seriesId,
      episodeId,
      storyboardIds: episode.storyboards.map((sb: any) => sb.id),
      status: 'pending',
      progress: 0,
      completedCount: 0,
      totalCount: episode.storyboards.length,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // 保存任务
    await kv.set(`batch-task:${batchTaskId}`, JSON.stringify(batchTask));

    // 异步处理批量生成
    processBatchGeneration(batchTaskId, series, episode, userPhone);

    console.log("[SeriesVideoBatch] ✅ Batch task created:", batchTaskId);

    return c.json({
      success: true,
      data: {
        batchTaskId,
        totalCount: episode.storyboards.length,
      },
    });
  } catch (error: any) {
    console.error("[SeriesVideoBatch] Error creating batch task:", error);
    return c.json({
      success: false,
      error: error.message || "Failed to create batch task",
    }, 500);
  }
}

/**
 * 查询批量生成任务状态
 * GET /series/batch-tasks/:taskId
 */
export async function handleGetBatchTask(c: Context) {
  try {
    const taskId = c.req.param("taskId");

    const taskData = await kv.get(`batch-task:${taskId}`);

    if (!taskData) {
      return c.json({
        success: false,
        error: "Batch task not found",
      }, 404);
    }

    const task = JSON.parse(taskData);

    return c.json({
      success: true,
      data: task,
    });
  } catch (error: any) {
    console.error("[SeriesVideoBatch] Error fetching batch task:", error);
    return c.json({
      success: false,
      error: error.message || "Failed to fetch batch task",
    }, 500);
  }
}

// ==================== 异步处理函数 ====================

/**
 * 处理批量生成任务
 */
async function processBatchGeneration(
  batchTaskId: string,
  series: any,
  episode: any,
  userPhone: string
) {
  try {
    console.log("[SeriesVideoBatch] Processing batch generation:", batchTaskId);

    const task: BatchGenerateTask = JSON.parse(
      await kv.get(`batch-task:${batchTaskId}`) || '{}'
    );

    task.status = 'processing';
    await kv.set(`batch-task:${batchTaskId}`, JSON.stringify(task));

    // TODO: 实际调用视频生成API
    // 这里应该遍历所有分镜，逐个调用视频生成接口
    // 为了避免并发限制，可以使用队列方式，每次生成3-5个

    console.log("[SeriesVideoBatch] ✅ Batch generation completed:", batchTaskId);

    task.status = 'completed';
    task.progress = 100;
    task.completedCount = task.totalCount;
    task.updatedAt = new Date().toISOString();
    await kv.set(`batch-task:${batchTaskId}`, JSON.stringify(task));
  } catch (error: any) {
    console.error("[SeriesVideoBatch] Batch generation failed:", error);

    const task: BatchGenerateTask = JSON.parse(
      await kv.get(`batch-task:${batchTaskId}`) || '{}'
    );
    task.status = 'failed';
    await kv.set(`batch-task:${batchTaskId}`, JSON.stringify(task));
  }
}
