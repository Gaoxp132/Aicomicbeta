/**
 * 漫剧生成流程处理器（PostgreSQL版本）
 * 更新：完全使用PostgreSQL数据库和新的自动生成器
 */

import type { Context } from "npm:hono";
import * as db from "../../database/series.tsx";
import { autoGenerateSeriesFromIdea, autoGenerateSeriesFromOutline } from "../../ai/auto_series_generator_refactored.tsx";

/**
 * 开始生成漫剧（后台异步）
 */
export async function startGeneration(c: Context) {
  const seriesId = c.req.param("id");
  console.log("[SeriesGenFlow] 🚀 POST /series/:id/generate called for:", seriesId);

  try {
    const body = await c.req.json();
    const { userPhone, userInput, storyOutline, totalEpisodes, targetAudience, preferredThemes, scriptGenre, style, enableAudio } = body;

    // 检查系列是否存在
    const series = await db.getSeries(seriesId);
    if (!series) {
      console.log("[SeriesGenFlow] ❌ Series not found:", seriesId);
      return c.json({
        success: false,
        error: "Series not found",
      }, 404);
    }
    
    // 检查是否已经在生成中或已完成
    if (series.status === 'generating') {
      return c.json({
        success: true,
        message: "AI生成正在进行中...",
        alreadyGenerating: true,
      });
    }
    
    if (series.status === 'completed') {
      return c.json({
        success: true,
        message: "该漫剧已生成完成",
        alreadyCompleted: true,
      });
    }

    // 更新状态为生成中
    await db.updateSeries(seriesId, {
      status: 'generating',
    });

    // 初始化生成进度
    await db.updateSeriesProgress(seriesId, 0, '准备开始生成');

    console.log("[SeriesGenFlow] ✅ Series marked as generating, triggering background generation");

    // 🔥 在后台启动自动生成（不等待完成）
    const generationOptions = {
      userPhone: userPhone || series.user_phone,
      userInput,
      storyOutline,
      totalEpisodes: totalEpisodes || series.total_episodes || 5,
      targetAudience,
      preferredThemes,
      scriptGenre,
      style: style || series.style || 'realistic',
      enableAudio: enableAudio !== undefined ? enableAudio : false,
    };

    // 使用快速创作或传统创作模式
    const generationPromise = userInput
      ? autoGenerateSeriesFromIdea(seriesId, generationOptions)
      : autoGenerateSeriesFromOutline(seriesId, generationOptions);

    // 🔥 不等待完成，立即返回，但确保错误被正确处理
    generationPromise.catch(async (error) => {
      console.error("[SeriesGenFlow] ❌ Background generation failed:", error);
      console.error("[SeriesGenFlow] ❌ Error stack:", error.stack);
      
      // 🔥 重要：更新数据库状态为失败
      try {
        await db.updateSeries(seriesId, {
          status: 'failed',
          generation_progress: {
            currentStep: 0,
            totalSteps: 6,
            stepName: '生成失败',
            error: error.message || '未知错误',
            failedAt: new Date().toISOString(),
          },
        });
        console.log("[SeriesGenFlow] ✅ Series status updated to 'failed'");
      } catch (updateError: any) {
        console.error("[SeriesGenFlow] ❌ Failed to update series status:", updateError.message);
      }
    });

    return c.json({
      success: true,
      message: "AI生成已在后台启动，请通过 /progress 查询进度",
    });

  } catch (error: any) {
    console.error("[SeriesGenFlow] Error in startGeneration:", error);
    return c.json({
      success: false,
      error: error.message || "Failed to start generation",
    }, 500);
  }
}

/**
 * 查询生成进度
 */
export async function getProgress(c: Context) {
  const seriesId = c.req.param("id");
  console.log("[SeriesGenFlow] GET /series/:id/progress called for:", seriesId);

  try {
    const series = await db.getSeries(seriesId);
    if (!series) {
      return c.json({
        success: false,
        error: "Series not found"
      }, 404);
    }

    const progress = series.generation_progress || {
      current_step: 0,
      total_steps: 6,
      step_name: "未开始"
    };

    return c.json({
      success: true,
      progress: {
        currentStep: progress.current_step,
        totalSteps: progress.total_steps,
        stepName: progress.step_name,
        percentage: Math.round((progress.current_step / progress.total_steps) * 100),
        status: series.status,
        startedAt: progress.started_at,
        updatedAt: progress.updated_at
      }
    });

  } catch (error: any) {
    console.error("[SeriesGenFlow] Error getting progress:", error);
    return c.json({
      success: false,
      error: error.message || "Failed to get progress"
    }, 500);
  }
}

/**
 * 已废弃：processStep（不再需要，使用完全后台生成）
 */
export async function processStep(c: Context) {
  return c.json({
    success: false,
    error: "This endpoint is deprecated. Generation now runs in the background.",
    message: "Please use /progress to check generation status"
  }, 410); // 410 Gone
}