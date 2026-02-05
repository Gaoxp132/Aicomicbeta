/**
 * 单个视频转存Handler
 * 从 routes_video_transfer.tsx 提取
 * 负责：将火山引擎视频转存到阿里云OSS
 */

import type { Context } from "npm:hono";
import { transferVideoToOSS } from "../../video/aliyun_oss.tsx";
import * as db from "../../database/index.tsx";

/**
 * 将火山引擎视频转存到阿里云OSS
 * POST /video/transfer
 */
export async function handleSingleTransfer(c: Context) {
  try {
    const body = await c.req.json();
    const { taskId, volcengineUrl } = body;
    
    if (!taskId) {
      return c.json({ success: false, error: 'Missing taskId' }, 400);
    }
    
    if (!volcengineUrl) {
      return c.json({ success: false, error: 'Missing volcengineUrl' }, 400);
    }
    
    console.log(`[VideoTransferSingle] Transferring video for task ${taskId}`);
    
    // 从数据库获取任务信息以获取用户ID
    let userId: string | undefined;
    try {
      const taskData = await db.getVideoTask(taskId);
      if (taskData?.user_phone) {
        userId = taskData.user_phone;
        console.log(`[VideoTransferSingle] Found user ID: ${userId}`);
      }
    } catch (err: any) {
      console.warn(`[VideoTransferSingle] Could not fetch task data:`, err.message);
    }
    
    // 执行转存，传入用户ID
    const result = await transferVideoToOSS(taskId, volcengineUrl, userId);
    
    if (result.success && result.ossUrl) {
      // 更新数据库中的视频URL
      try {
        await db.updateVideoTaskStatus(taskId, 'completed', result.ossUrl);
        
        console.log(`[VideoTransferSingle] Database updated for task ${taskId}`);
      } catch (dbError: any) {
        console.error('[VideoTransferSingle] Failed to update database:', dbError.message);
        // 不影响返回结果，因为视频已经成功转存
      }
      
      return c.json({
        success: true,
        data: {
          taskId,
          ossUrl: result.ossUrl,
          originalUrl: volcengineUrl,
        },
      });
    } else {
      return c.json({
        success: false,
        error: result.error || 'Transfer failed',
      }, 500);
    }
  } catch (error: any) {
    console.error('[VideoTransferSingle] Error:', error);
    return c.json({
      success: false,
      error: error.message || 'Internal server error',
    }, 500);
  }
}
