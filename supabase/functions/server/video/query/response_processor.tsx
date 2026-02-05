/**
 * 响应处理模块
 * 从 video/task_query.tsx 提取
 */

import * as db from "../../database/index.tsx";
import { transferVideoToOSS } from "../aliyun_oss.tsx";

/**
 * 解析API响应
 */
export async function parseApiResponse(response: Response): Promise<any> {
  const responseText = await response.text();
  console.log("API response text (first 500 chars):", responseText.substring(0, 500));

  try {
    const apiData = JSON.parse(responseText);
    console.log("API response data parsed successfully");
    return apiData;
  } catch (parseError: any) {
    console.error("Failed to parse API response as JSON:", parseError.message);
    console.error("Raw response text:", responseText);
    throw new Error(`JSON解析失败: ${parseError.message}`);
  }
}

/**
 * 处理API错误响应
 */
export async function handleApiError(
  taskId: string,
  status: number,
  apiData: any
): Promise<{ shouldReturn: boolean; response?: any }> {
  console.log("API error:", apiData);
  
  // 特殊处理：如果任务不存在（404），标记为失败
  if (status === 404 || apiData.error?.code === 'ResourceNotFound') {
    console.log("⚠️ Task not found in Volcengine, marking as failed");
    
    try {
      // 更新数据库状态为失败
      await db.supabase
        .from('video_tasks')
        .update({
          status: 'failed',
          updated_at: new Date().toISOString(),
        })
        .eq('task_id', taskId);
      
      console.log("✅ Task marked as failed in database");
    } catch (dbError: any) {
      console.warn("Failed to update task status:", dbError.message);
    }
    
    // 返回友好的错误信息
    return {
      shouldReturn: true,
      response: {
        success: false,
        error: "任务不存在",
        message: "该任务在火山引擎上不存在，可能已过期或被删除",
        status: 'failed',
      }
    };
  }
  
  // 其他错误
  return {
    shouldReturn: true,
    response: {
      error: "查询任务失败",
      details: apiData,
      message: apiData.error?.message || apiData.message || "Unknown error",
    }
  };
}

/**
 * 提取视频信息
 */
export function extractVideoInfo(task: any) {
  const status = task.status || "unknown";
  let videoUrl = "";
  let thumbnailUrl = "";

  if (status === "succeeded" || status === "completed" || status === "success") {
    videoUrl = task.content?.video_url || task.video_url || "";
    thumbnailUrl = task.content?.cover_url || task.cover_url || 
                   task.content?.thumbnail || task.thumbnail || "";

    console.log("Extracted video URL from API:", videoUrl);
    console.log("Extracted thumbnail URL from API:", thumbnailUrl);
  }

  return { status, videoUrl, thumbnailUrl };
}

/**
 * 处理视频转存到OSS
 */
export async function handleVideoTransfer(
  taskId: string,
  videoUrl: string,
  thumbnailUrl: string
): Promise<{ videoUrl: string; thumbnailUrl: string }> {
  if (!videoUrl) {
    return { videoUrl, thumbnailUrl };
  }

  // 检查数据库中是否已有OSS URL
  let shouldTransfer = false;
  let existingOssUrl = "";
  
  try {
    const existingTask = await db.getVideoTask(taskId);
    if (existingTask) {
      existingOssUrl = existingTask.video_url || "";
      // 如果已经是OSS URL，不需要再次转存
      shouldTransfer = !existingOssUrl.includes('aliyuncs.com');
      
      if (!shouldTransfer) {
        console.log("✅ [Auto-Transfer] Video already in OSS, skipping transfer");
        return {
          videoUrl: existingOssUrl,
          thumbnailUrl: existingTask.thumbnail || thumbnailUrl
        };
      }
    } else {
      shouldTransfer = true;
    }
  } catch (err: any) {
    console.warn("Failed to check existing task:", err.message);
    shouldTransfer = true;
  }
  
  // 如果需要转存
  if (shouldTransfer) {
    console.log("🚀 [Auto-Transfer] Starting automatic video transfer to OSS...");
    
    try {
      const transferResult = await transferVideoToOSS(taskId, videoUrl, thumbnailUrl);
      
      if (transferResult.success) {
        console.log("✅ [Auto-Transfer] Video transferred successfully");
        return {
          videoUrl: transferResult.video_url,
          thumbnailUrl: transferResult.thumbnail_url || thumbnailUrl
        };
      } else {
        console.warn("⚠️ [Auto-Transfer] Transfer failed, using original URL:", transferResult.error);
      }
    } catch (transferError: any) {
      console.error("❌ [Auto-Transfer] Transfer error:", transferError.message);
    }
  }
  
  return { videoUrl, thumbnailUrl };
}

/**
 * 更新数据库任务状态
 */
export async function updateTaskInDB(
  taskId: string,
  status: string,
  videoUrl: string,
  thumbnailUrl: string,
  rawApiResponse: any
) {
  try {
    await db.updateVideoTaskStatus(
      taskId,
      status === 'succeeded' || status === 'completed' || status === 'success' ? 'completed' : status,
      videoUrl,
      thumbnailUrl
    );
    
    console.log("✅ Updated task in database");
  } catch (dbError: any) {
    console.warn("⚠️ Failed to update database, but query succeeded:", dbError.message);
  }
}

/**
 * 构建最终响应
 */
export function buildSuccessResponse(apiData: any) {
  return {
    success: true,
    data: apiData
  };
}
