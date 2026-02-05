/**
 * 自动视频转存Handler
 * 从 routes_video_transfer.tsx 提取
 * 负责：自动发现并转存未转存的任务
 */

import type { Context } from "npm:hono";
import { transferVideoToOSS } from "../../video/aliyun_oss.tsx";
import * as db from "../../database/index.tsx";

/**
 * 自动发现并转存未转存的任务
 * POST /video/auto-transfer-pending
 * 
 * 扫描所有已完成但仍使用火山引擎URL的任务，自动转存到OSS
 */
export async function handleAutoTransferPending(c: Context) {
  try {
    console.log('[VideoTransferAuto] 🔍 Scanning for videos pending OSS transfer...');
    
    // 查询所有已完成但video_url包含火山引擎域名的任务
    const pendingTasks = await db.findTasksPendingOSSTransfer();
    
    if (!pendingTasks || pendingTasks.length === 0) {
      console.log('[VideoTransferAuto] ✅ No pending tasks found. All videos are on OSS.');
      return c.json({
        success: true,
        message: 'No pending tasks found',
        data: {
          total: 0,
          succeeded: 0,
          failed: 0,
          results: [],
        },
      });
    }
    
    console.log(`[VideoTransferAuto] 📦 Found ${pendingTasks.length} tasks pending OSS transfer:`);
    pendingTasks.forEach(task => {
      console.log(`[VideoTransferAuto]   - ${task.task_id}: ${task.video_url?.substring(0, 60)}...`);
    });
    
    const results = [];
    let successCount = 0;
    let failedCount = 0;
    
    // 串行处理每个任务
    for (const task of pendingTasks) {
      const taskId = task.task_id;
      const volcengineUrl = task.video_url;
      
      if (!volcengineUrl) {
        console.warn(`[VideoTransferAuto] ⚠️ Task ${taskId} has no video_url, skipping`);
        results.push({
          taskId,
          success: false,
          error: 'No video_url found',
        });
        failedCount++;
        continue;
      }
      
      console.log(`[VideoTransferAuto] 🚀 Processing task ${taskId}...`);
      
      try {
        // 执行OSS转存
        const result = await transferVideoToOSS(taskId, volcengineUrl, task.user_phone);
        
        if (result.success && result.ossUrl) {
          // 更新数据库中的视频URL
          try {
            await db.updateVideoTaskStatus(taskId, 'completed', result.ossUrl);
            
            // 如果有缩略图也需要转存
            if (task.thumbnail && (task.thumbnail.includes('ark-content-generation') || task.thumbnail.includes('volces.com'))) {
              console.log(`[VideoTransferAuto] 🖼️ Also transferring thumbnail for ${taskId}...`);
              const thumbnailResult = await transferVideoToOSS(`${taskId}_thumbnail`, task.thumbnail, task.user_phone);
              
              if (thumbnailResult.success && thumbnailResult.ossUrl) {
                await db.updateVideoTaskThumbnail(taskId, thumbnailResult.ossUrl);
                console.log(`[VideoTransferAuto] ✅ Thumbnail transferred: ${thumbnailResult.ossUrl.substring(0, 60)}...`);
              }
            }
            
            console.log(`[VideoTransferAuto] ✅ Task ${taskId} successfully transferred to OSS`);
            results.push({
              taskId,
              success: true,
              ossUrl: result.ossUrl,
              originalUrl: volcengineUrl.substring(0, 60) + '...',
            });
            successCount++;
          } catch (dbError: any) {
            console.error(`[VideoTransferAuto] ❌ Failed to update database for ${taskId}:`, dbError.message);
            results.push({
              taskId,
              success: false,
              error: `Database update failed: ${dbError.message}`,
            });
            failedCount++;
          }
        } else {
          console.error(`[VideoTransferAuto] ❌ OSS transfer failed for ${taskId}: ${result.error}`);
          results.push({
            taskId,
            success: false,
            error: result.error || 'Transfer failed',
          });
          failedCount++;
        }
      } catch (error: any) {
        console.error(`[VideoTransferAuto] ❌ Error processing ${taskId}:`, error.message);
        results.push({
          taskId,
          success: false,
          error: error.message,
        });
        failedCount++;
      }
      
      // 避免请求过快，延迟500ms
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    console.log(`[VideoTransferAuto] 🎉 Complete: ${successCount} succeeded, ${failedCount} failed out of ${pendingTasks.length} total`);
    
    return c.json({
      success: true,
      message: `Transferred ${successCount}/${pendingTasks.length} videos`,
      data: {
        total: pendingTasks.length,
        succeeded: successCount,
        failed: failedCount,
        results,
      },
    });
  } catch (error: any) {
    console.error('[VideoTransferAuto] ❌ Error:', error);
    return c.json({
      success: false,
      error: error.message || 'Internal server error',
    }, 500);
  }
}
