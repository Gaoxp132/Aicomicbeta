/**
 * 单个任务查询Handler
 * 从 video/task_query.tsx 提取 queryTaskStatus 函数
 */

import type { Context } from "npm:hono";
import * as db from "../../database/index.tsx";
import {
  fetchTaskFromDB,
  isTaskCompleted,
  isTaskStuck,
  formatTaskResponse,
  getVolcengineTaskId,
} from "./task_fetcher.tsx";
import {
  queryVolcengineTask,
  isNetworkError,
  buildFallbackResponse,
  buildOldTaskResponse,
} from "./api_client.tsx";
import {
  parseApiResponse,
  handleApiError,
  extractVideoInfo,
  handleVideoTransfer,
  updateTaskInDB,
  buildSuccessResponse,
} from "./response_processor.tsx";

/**
 * 查询单个任务状态
 */
export async function queryTaskStatus(c: Context) {
  const taskId = c.req.param("taskId");
  console.log(`Querying status for task: ${taskId}`);

  // Step 1: 从数据库获取任务
  const dbTask = await fetchTaskFromDB(taskId);

  // Step 2: 如果任务不存在且不是火山引擎ID格式，返回404
  if (!dbTask && !taskId.startsWith('cgt-')) {
    console.log(`[Volcengine] Task not found or failed: 该任务不存在于数据库中`);
    return c.json({
      success: false,
      error: '任务不存在',
      message: `Task ${taskId} not found in database`,
    }, 404);
  }

  // Step 3: 如果任务已完成且有OSS URL，直接返回
  if (dbTask && isTaskCompleted(dbTask)) {
    console.log("✅ Task already completed with OSS URL, returning from database");
    return c.json(formatTaskResponse(dbTask));
  }

  // Step 4: 获取火山引擎任务ID
  const volcengineTaskId = getVolcengineTaskId(dbTask, taskId);

  // Step 5: 处理没有volcengine_task_id的旧任务
  if (!dbTask?.volcengine_task_id) {
    console.warn(`⚠️ No volcengine_task_id found for ${taskId}, using local ID (may fail)`);
    
    if (dbTask) {
      console.log(`📦 Returning database status for old task without volcengine_task_id`);
      console.log(`📊 Task info: status=${dbTask.status}, created_at=${dbTask.created_at}`);
      
      // 如果任务卡住（pending/processing但没有volcengine_task_id），标记为失败
      if (isTaskStuck(dbTask)) {
        console.warn(`❌ Task ${taskId} is stuck in ${dbTask.status} without volcengine_task_id, marking as failed`);
        
        try {
          await db.updateVideoTaskStatus(
            taskId,
            'failed',
            dbTask.video_url || '',
            dbTask.thumbnail || ''
          );
          console.log("✅ Task marked as failed");
        } catch (err: any) {
          console.warn("Failed to mark task as failed:", err.message);
        }
      }
      
      return c.json({
        success: true,
        ...buildOldTaskResponse(dbTask),
      });
    }
    
    // 如果数据库中也没有任务，返回404
    console.error(`❌ Task ${taskId} not found in database and has no volcengine_task_id`);
    return c.json({
      success: false,
      error: '任务不存在',
      message: '该任务不存在于数据库中',
    }, 404);
  }

  console.log(`✅ Using volcengine_task_id: ${volcengineTaskId}`);

  // Step 6: 查询火山引擎API
  let apiResponse: Response;
  
  try {
    apiResponse = await queryVolcengineTask(volcengineTaskId);
  } catch (fetchError: any) {
    console.error("❌ All fetch attempts failed:", fetchError.message);
    
    // 网络错误时的fallback策略
    if (isNetworkError(fetchError)) {
      console.log("🔄 Network error detected, attempting to use database fallback...");
      
      if (dbTask) {
        console.log("✅ Returning task status from database (fallback)");
        return c.json({
          success: true,
          ...buildFallbackResponse(dbTask),
        });
      } else {
        console.error("❌ No database fallback available");
        return c.json({
          error: "网络错误",
          message: "无法连接到视频生成服务，且没有缓存数据可用",
          details: fetchError.message,
        }, 503);
      }
    }
    
    // 其他类型的错误
    throw fetchError;
  }

  console.log("API response status:", apiResponse.status);

  // Step 7: 解析API响应
  let apiData: any;
  try {
    apiData = await parseApiResponse(apiResponse);
  } catch (parseError: any) {
    return c.json({
      error: "API响应格式错误",
      message: "无法解析API返回的数据",
      parseError: parseError.message,
    }, 500);
  }

  // Step 8: 处理API错误
  if (!apiResponse.ok) {
    const errorResult = await handleApiError(taskId, apiResponse.status, apiData);
    if (errorResult.shouldReturn) {
      return c.json(errorResult.response, apiResponse.status === 404 ? 200 : apiResponse.status);
    }
  }

  // Step 9: 提取视频信息
  const task = apiData.data || apiData;
  const { status, videoUrl: initialVideoUrl, thumbnailUrl: initialThumbnailUrl } = extractVideoInfo(task);

  // Step 10: 处理视频转存
  const { videoUrl, thumbnailUrl } = await handleVideoTransfer(
    taskId,
    initialVideoUrl,
    initialThumbnailUrl
  );

  // Step 11: 更新数据库
  await updateTaskInDB(taskId, status, videoUrl, thumbnailUrl, apiData);

  // Step 12: 返回响应
  return c.json(buildSuccessResponse(apiData));
}
