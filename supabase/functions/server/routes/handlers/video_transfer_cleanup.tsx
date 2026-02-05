/**
 * 视频清理Handler
 * 从 routes_video_transfer.tsx 提取
 * 负责：删除所有使用火山引擎过期URL的视频
 */

import type { Context } from "npm:hono";
import * as db from "../../database/index.tsx";

/**
 * 删除所有使用火山引擎过期URL的视频
 * POST /video/cleanup-expired
 * 
 * 彻底清理数据库中无法恢复的过期视频记录
 */
export async function handleCleanupExpired(c: Context) {
  try {
    console.log('[VideoTransferCleanup] 🗑️ Starting cleanup of expired Volcengine videos...');
    
    const result = await db.deleteExpiredVolcengineVideos();
    
    if (result.deleted === 0) {
      return c.json({
        success: true,
        message: 'No expired videos found',
        data: {
          deleted: 0,
          taskIds: [],
        },
      });
    }
    
    return c.json({
      success: true,
      message: `Successfully deleted ${result.deleted} expired videos`,
      data: {
        deleted: result.deleted,
        taskIds: result.taskIds,
      },
    });
  } catch (error: any) {
    console.error('[VideoTransferCleanup] ❌ Error:', error);
    return c.json({
      success: false,
      error: error.message || 'Internal server error',
    }, 500);
  }
}
