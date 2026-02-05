/**
 * 批量视频转存Handler
 * 从 routes_video_transfer.tsx 提取
 * 负责：批量将火山引擎视频转存到阿里云OSS
 */

import type { Context } from "npm:hono";
import { transferVideoToOSS } from "../../video/aliyun_oss.tsx";
import * as db from "../../database/index.tsx";

/**
 * 批量转存视频
 * POST /video/batch-transfer
 */
export async function handleBatchTransfer(c: Context) {
  try {
    const body = await c.req.json();
    const { tasks } = body; // [{ taskId, volcengineUrl }, ...]
    
    if (!Array.isArray(tasks) || tasks.length === 0) {
      return c.json({ success: false, error: 'Invalid tasks array' }, 400);
    }
    
    console.log(`[VideoTransferBatch] Starting batch transfer for ${tasks.length} videos`);
    
    const results = [];
    
    for (const task of tasks) {
      const { taskId, volcengineUrl } = task;
      
      if (!taskId || !volcengineUrl) {
        results.push({
          taskId: taskId || 'unknown',
          success: false,
          error: 'Missing taskId or volcengineUrl',
        });
        continue;
      }
      
      console.log(`[VideoTransferBatch] Processing task ${taskId}...`);
      
      // 从数据库获取任务信息以获取用户ID
      let userId: string | undefined;
      try {
        const taskData = await db.getVideoTask(taskId);
        if (taskData?.user_phone) {
          userId = taskData.user_phone;
          console.log(`[VideoTransferBatch] Found user ID for ${taskId}: ${userId}`);
        }
      } catch (err: any) {
        console.warn(`[VideoTransferBatch] Could not fetch task data for ${taskId}:`, err.message);
      }
      
      const result = await transferVideoToOSS(taskId, volcengineUrl, userId);
      
      if (result.success && result.ossUrl) {
        // 更新数据库
        try {
          await db.updateVideoTaskStatus(taskId, 'completed', result.ossUrl);
        } catch (dbError: any) {
          console.error(`[VideoTransferBatch] Failed to update database for ${taskId}:`, dbError.message);
        }
        
        results.push({
          taskId,
          success: true,
          ossUrl: result.ossUrl,
        });
      } else {
        results.push({
          taskId,
          success: false,
          error: result.error,
        });
      }
      
      // 避免请求过快，稍微延迟
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    const successCount = results.filter(r => r.success).length;
    console.log(`[VideoTransferBatch] Complete: ${successCount}/${tasks.length} succeeded`);
    
    return c.json({
      success: true,
      data: {
        total: tasks.length,
        succeeded: successCount,
        failed: tasks.length - successCount,
        results,
      },
    });
  } catch (error: any) {
    console.error('[VideoTransferBatch] Error:', error);
    return c.json({
      success: false,
      error: error.message || 'Internal server error',
    }, 500);
  }
}
