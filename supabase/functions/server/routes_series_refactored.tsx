/**
 * 漫剧创作系统路由（重构版）
 * 已重构：拆分为多个处理器模块
 * - handlers/series_ai_generation.tsx: AI生成相关
 * - handlers/series_generation_flow.tsx: 生成流程管理
 * - handlers/series_crud_legacy.tsx: CRUD操作（Legacy KV版本）
 * - handlers/series_analysis.tsx: 分析和调试
 * - handlers/series_migration.tsx: 数据迁移
 * - handlers/series_fix_episodes.tsx: 修复集数
 * - handlers/series_data_inspector.tsx: 数据检查和视频管理
 * - handlers/series_data_cleanup.tsx: 数据清理和重建
 * - handlers/series_regenerate.tsx: 重新生成视频
 * 
 * 注意：此文件为routes_series.tsx的重构版本
 * 原文件(2532行)保留为routes_series_original_backup.tsx
 * 
 * 🔥 CACHE BUSTER v4.2.4_FORCE_REBUILD_005 - 2026-01-27
 */

import type { Hono } from "npm:hono";

// 🔥 Module version for cache busting
const SERIES_ROUTES_VERSION = 'v4.2.4_FORCE_REBUILD_005_2026-01-27';
console.log(`[Series Routes] 🔥 Loading version: ${SERIES_ROUTES_VERSION}`);

// 导入所有Handler
import { 
  generateBasicInfo, 
  generateOutline, 
  createFromIdea 
} from "./routes/handlers/series_ai_generation.tsx";

// 🆕 导入AI生成剧集和分镜
import { generateEpisodesAI } from "./routes/handlers/series_ai_episodes.tsx";
import { generateStoryboardsAI } from "./routes/handlers/series_ai_storyboards.tsx";
import { generateFullAI } from "./routes/handlers/series_ai_full_generation.tsx";

// 🆕 导入视频合并
import { mergeEpisodeVideos, mergeAllSeriesVideos } from "./routes/handlers/series_video_merger.tsx";

import { 
  startGeneration, 
  processStep, 
  getProgress 
} from "./routes/handlers/series_generation_flow.tsx";

import { 
  createSeries, 
  getSeriesDetails,
  getSeriesList, 
  updateSeries, 
  deleteSeries 
} from "./routes/handlers/series_core_crud.tsx";

import { 
  analyzeSeries, 
  getDebugInfo 
} from "./routes/handlers/series_analysis.tsx";

import { 
  recoverFromKV, 
  batchMigrate 
} from "./routes/handlers/series_migration.tsx";

import {
  diagnoseSeries,
  fixSeriesEpisodes,
  scanAndFixAllSeries,
  fixOrphanStoryboards
} from "./routes/handlers/series_fix_episodes.tsx";

// 🔧 导入total_episodes修复工具
import { fixTotalEpisodes } from "./routes/handlers/fix_total_episodes.tsx";

import {
  listSeriesVideos
} from "./routes/handlers/series_data_inspector.tsx";

import {
  fixSeriesData,
  cleanupTestData,
  rebuildSeriesStats
} from "./routes/handlers/series_data_cleanup.tsx";

import {
  regenerateMissingVideos,
  regenerateEpisodeVideos
} from "./routes/handlers/series_regenerate.tsx";

// 🆕 导入视频数据同步工具
import {
  syncSeriesVideoData,
  batchSyncVideoData,
  diagnoseVideoDataStatus
} from "./routes/handlers/video_data_sync.tsx";

// 🆕 导入同步诊断工具
import { diagnoseSyncIssue } from "./routes/handlers/video_sync_diagnosis.tsx";

// 🆕 导入video_tasks检查工具
import { inspectVideoTasks, inspectSeriesVideoTasks } from "./routes/handlers/video_tasks_inspector.tsx";

// 🆕 导入AI诊断工具
import { diagnoseAI, testScenario } from "./routes/handlers/ai_diagnosis.tsx";

// 🆕 导入剧集分镜查询（用于视频播放器）
import { getEpisodeStoryboardsHandler } from "./routes/handlers/series_episode_storyboards.tsx";

// 🆕 导入剧集分镜诊断和修复工具
try {
  var { diagnoseEpisodeStoryboards, fixEpisodeStoryboards } = await import("./routes/handlers/episode_storyboard_fix.tsx");
  console.log('[routes_series_refactored.tsx] ✅ episode_storyboard_fix loaded');
} catch (e: any) {
  console.error('[routes_series_refactored.tsx] ❌ Failed to load episode_storyboard_fix:', e.message);
  var diagnoseEpisodeStoryboards = null;
  var fixEpisodeStoryboards = null;
}

// 🆕 导入分镜URL同步工具
try {
  var { checkStoryboardUrls, syncStoryboardUrls } = await import("./routes/handlers/storyboard_url_sync.tsx");
  console.log('[routes_series_refactored.tsx] ✅ storyboard_url_sync loaded');
} catch (e: any) {
  console.error('[routes_series_refactored.tsx] ❌ Failed to load storyboard_url_sync:', e.message);
  var checkStoryboardUrls = null;
  var syncStoryboardUrls = null;
}

console.log('[routes_series_refactored.tsx] ✅ File loaded successfully');

const PREFIX = "/make-server-fc31472c";

/**
 * 注册漫剧创作系路由
 */
export function registerSeriesRoutes(app: Hono) {
  console.log('[routes_series_refactored.tsx] 🚀 Registering series routes...');

  // ==================== AI生成相关 ====================
  
  // 🔧 AI诊断工具
  app.get(`${PREFIX}/ai/diagnose`, diagnoseAI);
  app.post(`${PREFIX}/ai/test-scenario`, testScenario);
  
  // 🤖 生成基本信息（标题和简介）
  app.post(`${PREFIX}/series/generate-basic-info`, generateBasicInfo);
  
  // 📝 生成故事大纲
  app.post(`${PREFIX}/series/generate-outline`, generateOutline);
  
  // 💡 从创意创建漫剧（一键生成）
  app.post(`${PREFIX}/series/create-from-idea`, createFromIdea);

  // 🆕 AI生成剧集
  app.post(`${PREFIX}/series/:id/generate-episodes-ai`, generateEpisodesAI);
  
  // 🆕 AI生成分镜
  app.post(`${PREFIX}/episodes/:id/generate-storyboards-ai`, generateStoryboardsAI);
  
  // 🆕 一键完整生成
  app.post(`${PREFIX}/series/:id/generate-full-ai`, generateFullAI);

  // 🆕 合并剧集视频
  app.post(`${PREFIX}/episodes/:id/merge-videos`, mergeEpisodeVideos);
  
  // 🆕 合并所有剧集视频
  app.post(`${PREFIX}/series/:id/merge-all-videos`, mergeAllSeriesVideos);

  // 🆕 修复单个剧集的M3U8视频
  app.post(`${PREFIX}/episodes/:id/repair-video`, async (c) => {
    const episodeId = c.req.param('id');
    
    try {
      console.log(`[Repair Video] 🔧 Starting video repair for episode: ${episodeId}`);
      
      // 获取请求体（可能包含userPhone）
      let userPhone: string | undefined;
      try {
        const body = await c.req.json();
        userPhone = body?.userPhone;
        console.log(`[Repair Video] 📱 User phone:`, userPhone || 'Not provided');
      } catch (e) {
        console.log(`[Repair Video] ⚠️ No request body or failed to parse`);
      }
      
      if (!userPhone) {
        console.warn(`[Repair Video] ⚠️ No userPhone provided, repair may fail`);
      }
      
      // 重新调用合并视频API，这会重新生成M3U8
      console.log(`[Repair Video] 🔄 Calling mergeEpisodeVideos...`);
      const result = await mergeEpisodeVideos(c);
      
      console.log(`[Repair Video] ✅ Repair completed successfully`);
      return result;
    } catch (error: any) {
      console.error(`[Repair Video] ❌ Critical error during video repair:`, error);
      console.error(`[Repair Video] ❌ Error stack:`, error.stack);
      
      return c.json({
        success: false,
        error: error.message || 'Video repair failed',
        details: error.stack
      }, 500);
    }
  });

  // ==================== 生成流程管理 ====================
  
  // 🚀 开始生成漫剧
  app.post(`${PREFIX}/series/:id/generate`, startGeneration);
  
  // 🔄 处理生成步骤（轮询）
  app.post(`${PREFIX}/series/:id/process-step`, processStep);
  
  // 📊 查询生成进度
  app.get(`${PREFIX}/series/:id/progress`, getProgress);

  // ==================== 分析和调试 ====================
  
  // 🔍 分析漫剧质量
  app.post(`${PREFIX}/series/:id/analyze`, analyzeSeries);
  
  // 🐛 获取调试信息
  app.get(`${PREFIX}/series/:id/debug`, getDebugInfo);

  // ==================== CRUD操作 ====================
  // 🔧 现在统一使用 series_core_crud 的handlers（支持数据转换）
  // Legacy版本不支持snake_case转camelCase，会导致前端字段缺失
  
  // ➕ 创建新漫剧
  app.post(`${PREFIX}/series`, createSeries);
  
  // 📖 获取单个漫剧详情（必须在列表路由之前）
  app.get(`${PREFIX}/series/:id`, getSeriesDetails);
  
  // 📋 获取用户的漫剧列表
  app.get(`${PREFIX}/series`, getSeriesList);
  
  // ✏️ 更新漫剧
  app.put(`${PREFIX}/series/:id`, updateSeries);
  
  // 🗑️ 删除漫剧
  app.delete(`${PREFIX}/series/:id`, deleteSeries);

  // ==================== 数据迁移 ====================
  
  // 🔄 从KV恢复单个漫剧到PostgreSQL
  app.post(`${PREFIX}/series/:id/recover-from-kv`, recoverFromKV);
  
  // 🔄 批量迁移用户的所有漫剧
  app.post(`${PREFIX}/series/batch-migrate`, batchMigrate);

  // ==================== 修复集数 ====================
  
  // 🛠️ 诊断漫剧问题
  app.post(`${PREFIX}/series/:id/diagnose`, diagnoseSeries);
  
  // 🛠️ 修复单个漫剧的集数
  app.post(`${PREFIX}/series/:id/fix-episodes`, fixSeriesEpisodes);
  
  // 🆕 修复有分镜但没有剧集的情况
  app.post(`${PREFIX}/series/:id/fix-orphan-storyboards`, fixOrphanStoryboards);
  
  // 🛠️ 扫描并修复所有漫剧
  app.post(`${PREFIX}/series/scan-and-fix-all`, scanAndFixAllSeries);

  // 🆕 修复所有漫剧的total_episodes字段（一次性修复脚本）
  app.get(`${PREFIX}/series/fix-total-episodes`, fixTotalEpisodes);

  // ==================== 数据检查和视频管 ====================
  
  // 🛠️ 列出漫剧视频
  app.get(`${PREFIX}/series/:id/list-videos`, listSeriesVideos);

  // ==================== 数据清理和重建 ====================
  
  // 🛠️ 修复漫剧数据
  app.post(`${PREFIX}/series/:id/fix-data`, fixSeriesData);
  
  // 🛠️ 清理测试数据
  app.post(`${PREFIX}/series/:id/cleanup-test-data`, cleanupTestData);
  
  // 🛠️ 重建漫剧统计信息
  app.post(`${PREFIX}/series/:id/rebuild-stats`, rebuildSeriesStats);

  // ==================== 重新生成视频 ====================
  
  // 🛠️ 重新生成缺失的视频
  app.post(`${PREFIX}/series/:id/regenerate-missing-videos`, regenerateMissingVideos);
  
  // 🛠️ 重新生成剧集视频
  app.post(`${PREFIX}/series/:id/episodes/:episodeId/regenerate`, regenerateEpisodeVideos);

  // ==================== 视频数据同步 ====================
  
  // 🛠️ 同步单个漫剧的视频数据
  app.post(`${PREFIX}/series/:id/sync-video-data`, syncSeriesVideoData);
  
  // 🛠️ 批量同步用户的视频数据
  app.post(`${PREFIX}/series/batch-sync-video-data`, batchSyncVideoData);
  
  // 🛠️ 诊断视频数据状态
  app.get(`${PREFIX}/series/:id/diagnose-video-data-status`, diagnoseVideoDataStatus);

  // 🛠️ 诊断同步问题
  app.get(`${PREFIX}/series/:id/diagnose-sync-issue`, diagnoseSyncIssue);

  // 🛠️ 检查video_tasks表
  app.get(`${PREFIX}/series/:id/inspect-video-tasks`, inspectSeriesVideoTasks);
  app.get(`${PREFIX}/video-tasks/inspect`, inspectVideoTasks);

  // 🆕 获取剧集分镜（用于视频播放器）
  app.get(`${PREFIX}/episodes/:id/storyboards`, getEpisodeStoryboardsHandler);

  // 🆕 诊断剧集分镜
  if (diagnoseEpisodeStoryboards) {
    app.get(`${PREFIX}/episodes/:id/diagnose-storyboards`, diagnoseEpisodeStoryboards);
  }

  // 🆕 修复剧集分镜
  if (fixEpisodeStoryboards) {
    app.post(`${PREFIX}/episodes/:id/fix-storyboards`, fixEpisodeStoryboards);
  }

  // 🆕 检查分镜URL同步状态
  if (checkStoryboardUrls) {
    app.get(`${PREFIX}/episodes/:id/check-storyboard-urls`, checkStoryboardUrls);
  }

  // 🆕 同步分镜URL（从video_tasks到storyboards）
  if (syncStoryboardUrls) {
    app.post(`${PREFIX}/episodes/:id/sync-storyboard-urls`, syncStoryboardUrls);
  }

  console.log('[routes_series_refactored.tsx]  All routes registered successfully');
  console.log('[routes_series_refactored.tsx] 📋 Route summary:');
  console.log('[routes_series_refactored.tsx]   AI Generation: 6 routes');
  console.log('[routes_series_refactored.tsx]   Generation Flow: 3 routes');
  console.log('[routes_series_refactored.tsx]   Analysis & Debug: 2 routes');
  console.log('[routes_series_refactored.tsx]   CRUD: 5 routes');
  console.log('[routes_series_refactored.tsx]   Migration: 2 routes');
  console.log('[routes_series_refactored.tsx]   Fix Episodes: 5 routes');
  console.log('[routes_series_refactored.tsx]   Data Inspector: 2 routes');
  console.log('[routes_series_refactored.tsx]   Data Cleanup: 3 routes');
  console.log('[routes_series_refactored.tsx]   Regenerate Videos: 2 routes');
  console.log('[routes_series_refactored.tsx]   Video Data Sync: 4 routes');
  console.log('[routes_series_refactored.tsx]   Video Tasks Inspector: 2 routes');
  console.log('[routes_series_refactored.tsx]   Total: 46 routes');
}