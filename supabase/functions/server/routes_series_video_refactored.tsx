/**
 * 漫剧视频生成和编辑路由（重构版）
 * 已重构：拆分为3个Handler模块
 * - handlers/series_video_batch.tsx: 批量生成分镜视频
 * - handlers/series_video_merge.tsx: 合并剧集视频
 * - handlers/series_video_export.tsx: 导出完整剧集
 * 
 * 注意：此文件为 routes_series_video.tsx 的重构版本
 * 原文件(410行)保留为备份
 */

import { Hono } from "npm:hono";

// 导入Handler模块
import {
  handleBatchGenerate,
  handleGetBatchTask
} from "./routes/handlers/series_video_batch.tsx";

import {
  handleMergeEpisode,
  handleGetMergeTask
} from "./routes/handlers/series_video_merge.tsx";

import {
  handleExportSeries
} from "./routes/handlers/series_video_export.tsx";

const app = new Hono();

console.log('[routes_series_video_refactored.tsx] ✅ Module loaded');

// ==================== 批量生成视频 ====================

/**
 * 批量生成所有分镜视频
 * POST /make-server-fc31472c/series/:seriesId/episodes/:episodeId/batch-generate
 */
app.post(
  "/make-server-fc31472c/series/:seriesId/episodes/:episodeId/batch-generate",
  handleBatchGenerate
);

/**
 * 查询批量生成任务状态
 * GET /make-server-fc31472c/series/batch-tasks/:taskId
 */
app.get("/make-server-fc31472c/series/batch-tasks/:taskId", handleGetBatchTask);

// ==================== 视频合并 ====================

/**
 * 合并剧集视频
 * POST /make-server-fc31472c/series/:seriesId/episodes/:episodeId/merge
 */
app.post(
  "/make-server-fc31472c/series/:seriesId/episodes/:episodeId/merge",
  handleMergeEpisode
);

/**
 * 查询合并任务状态
 * GET /make-server-fc31472c/series/merge-tasks/:taskId
 */
app.get("/make-server-fc31472c/series/merge-tasks/:taskId", handleGetMergeTask);

// ==================== 剧集导出 ====================

/**
 * 导出完整剧集
 * POST /make-server-fc31472c/series/:seriesId/export
 */
app.post("/make-server-fc31472c/series/:seriesId/export", handleExportSeries);

console.log('[routes_series_video_refactored.tsx] ✅ All video routes registered successfully');
console.log('[routes_series_video_refactored.tsx] 📋 Route summary:');
console.log('[routes_series_video_refactored.tsx]   Batch Generation: 2 routes');
console.log('[routes_series_video_refactored.tsx]   Video Merge: 2 routes');
console.log('[routes_series_video_refactored.tsx]   Series Export: 1 route');
console.log('[routes_series_video_refactored.tsx]   Total: 5 routes');

export function registerSeriesVideoRoutes(parentApp: Hono) {
  parentApp.route("/", app);
}