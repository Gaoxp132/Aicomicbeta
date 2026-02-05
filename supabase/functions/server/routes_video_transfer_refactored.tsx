/**
 * 视频转存路由（重构版）
 * 已重构：拆分为4个Handler模块
 * - handlers/video_transfer_single.tsx: 单个视频转存
 * - handlers/video_transfer_batch.tsx: 批量视频转存
 * - handlers/video_transfer_auto.tsx: 自动发现并转存
 * - handlers/video_transfer_cleanup.tsx: 清理过期视频
 * 
 * 注意：此文件为 routes_video_transfer.tsx 的重构版本
 * 原文件(341行)保留为备份
 */

import type { Hono } from 'npm:hono';
import { createDualRouteRegistrar } from './utils.tsx';

// 导入Handler
import { handleSingleTransfer } from './routes/handlers/video_transfer_single.tsx';
import { handleBatchTransfer } from './routes/handlers/video_transfer_batch.tsx';
import { handleAutoTransferPending } from './routes/handlers/video_transfer_auto.tsx';
import { handleCleanupExpired } from './routes/handlers/video_transfer_cleanup.tsx';

console.log('[routes_video_transfer_refactored.tsx] ✅ Module loaded');

/**
 * 注册视频转存路由
 */
export function registerVideoTransferRoutes(app: Hono) {
  const registerRoute = createDualRouteRegistrar(app);
  
  /**
   * POST /video/transfer - 将火山引擎视频转存到阿里云OSS
   */
  registerRoute('post', '/video/transfer', handleSingleTransfer);
  
  /**
   * POST /video/batch-transfer - 批量转存视频
   */
  registerRoute('post', '/video/batch-transfer', handleBatchTransfer);
  
  /**
   * POST /video/auto-transfer-pending - 自动发现并转存未转存的任务
   * 扫描所有已完成但仍使用火山引擎URL的任务，自动转存到OSS
   */
  registerRoute('post', '/video/auto-transfer-pending', handleAutoTransferPending);
  
  /**
   * POST /video/cleanup-expired - 删除所有使用火山引擎过期URL的视频
   * 彻底清理数据库中无法恢复的过期视频记录
   */
  registerRoute('post', '/video/cleanup-expired', handleCleanupExpired);
  
  console.log('[routes_video_transfer_refactored.tsx] ✅ All video transfer routes registered successfully');
  console.log('[routes_video_transfer_refactored.tsx] 📋 Route summary:');
  console.log('[routes_video_transfer_refactored.tsx]   Single Transfer: 1 route');
  console.log('[routes_video_transfer_refactored.tsx]   Batch Transfer: 1 route');
  console.log('[routes_video_transfer_refactored.tsx]   Auto Transfer: 1 route');
  console.log('[routes_video_transfer_refactored.tsx]   Cleanup Expired: 1 route');
  console.log('[routes_video_transfer_refactored.tsx]   Total: 4 routes');
}
