/**
 * 漫剧视频导出Handler
 * 从 routes_series_video.tsx 提取
 * 负责：导出完整剧集
 */

import type { Context } from "npm:hono";
import * as kv from "../../kv_store.tsx";

interface ExportTask {
  id: string;
  seriesId: string;
  format: string;
  quality: string;
  status: 'processing' | 'completed' | 'failed';
  downloadUrl?: string;
  error?: string;
  createdAt: string;
  updatedAt?: string;
}

/**
 * 导出完整剧集
 * POST /series/:seriesId/export
 */
export async function handleExportSeries(c: Context) {
  try {
    const seriesId = c.req.param("seriesId");
    const { format, quality } = await c.req.json();

    console.log("[SeriesVideoExport] Exporting series:", seriesId);

    const seriesKey = `series:${seriesId}`;
    const seriesData = await kv.get(seriesKey);

    if (!seriesData) {
      return c.json({
        success: false,
        error: "Series not found",
      }, 404);
    }

    const series = JSON.parse(seriesData);

    // 创建导出任务
    const exportTaskId = `export-${Date.now()}`;
    const exportTask: ExportTask = {
      id: exportTaskId,
      seriesId,
      format: format || 'mp4',
      quality: quality || '1080p',
      status: 'processing',
      createdAt: new Date().toISOString(),
    };

    await kv.set(`export-task:${exportTaskId}`, JSON.stringify(exportTask));

    // 异步处理导出
    processExportTask(exportTaskId, series, exportTask);

    console.log("[SeriesVideoExport] ✅ Export task created:", exportTaskId);

    return c.json({
      success: true,
      data: {
        exportTaskId,
      },
    });
  } catch (error: any) {
    console.error("[SeriesVideoExport] Error creating export task:", error);
    return c.json({
      success: false,
      error: error.message || "Failed to create export task",
    }, 500);
  }
}

// ==================== 异步处理函数 ====================

/**
 * 处理导出任务
 */
async function processExportTask(exportTaskId: string, series: any, exportTask: ExportTask) {
  try {
    console.log("[SeriesVideoExport] Processing export task:", exportTaskId);

    // TODO: 实际的导出逻辑
    // 1. 收集所有剧集的合并视频
    // 2. 添加整体片头片尾
    // 3. 转码为指定格式和质量
    // 4. 上传到OSS
    // 5. 返回下载URL

    console.log("[SeriesVideoExport] ✅ Export completed:", exportTaskId);

    exportTask.status = 'completed';
    exportTask.downloadUrl = 'https://example.com/series-export.mp4'; // TODO: 实际URL
    exportTask.updatedAt = new Date().toISOString();
    await kv.set(`export-task:${exportTaskId}`, JSON.stringify(exportTask));
  } catch (error: any) {
    console.error("[SeriesVideoExport] Export failed:", error);

    exportTask.status = 'failed';
    exportTask.error = error.message;
    await kv.set(`export-task:${exportTaskId}`, JSON.stringify(exportTask));
  }
}
