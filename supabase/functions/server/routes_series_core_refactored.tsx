/**
 * 漫剧核心路由（重构版）- PostgreSQL版本
 * 已重构：拆分为多个处理器模块
 * - handlers/series_core_crud.tsx: CRUD操作
 * - handlers/series_core_ai.tsx: AI生成
 * - handlers/series_core_interactions.tsx: 互动功能
 * - handlers/series_core_video.tsx: 视频生成
 * - handlers/series_data_auto_fix.tsx: 数据修复
 * 
 * 注意：此文件为routes_series_core.tsx的重构版本
 * 原文件(917行)保留为routes_series_core_original_backup.tsx
 */

import { Hono } from "npm:hono";

// 导入所有Handler
import {
  getSeriesList,
  getSeriesDetails,
  createSeries,
  updateSeries,
  deleteSeries,
} from "./routes/handlers/series_core_crud.tsx";

import {
  createFromIdea,
} from "./routes/handlers/series_core_ai.tsx";

import {
  toggleLike,
  addComment,
  getComments,
  recordShare,
  updateViewingHistory,
  getViewingHistory,
} from "./routes/handlers/series_core_interactions.tsx";

import {
  generateVideo,
} from "./routes/handlers/series_core_video.tsx";

import {
  batchFixSeriesData,
  fixSingleSeries,
  detectDataIssues,
} from "./routes/handlers/series_data_auto_fix.tsx";

console.log('[routes_series_core_refactored.tsx] ✅ PostgreSQL-based series routes loaded');

const PREFIX = '/make-server-fc31472c';

// ==================== 导出 ====================

export function registerSeriesCoreRoutes(app: Hono) {
  console.log('[routes_series_core_refactored.tsx] 🚀 Registering series core routes...');
  console.log('[routes_series_core_refactored.tsx] 📍 PREFIX:', PREFIX);
  console.log('[routes_series_core_refactored.tsx] 📍 app object type:', typeof app);
  console.log('[routes_series_core_refactored.tsx] 📍 app.get type:', typeof app.get);
  
  // ==================== 核心CRUD操作 ====================
  
  /**
   * 📋 获取用户的所有漫剧列表（包含统计信息）
   */
  console.log('[routes_series_core_refactored.tsx] 📝 Registering GET', `${PREFIX}/series`);
  app.get(`${PREFIX}/series`, getSeriesList);

  /**
   * 📖 获取单个漫剧的详细信息（包含角色、剧集、分镜）
   */
  console.log('[routes_series_core_refactored.tsx] 📝 Registering GET', `${PREFIX}/series/:id`);
  app.get(`${PREFIX}/series/:id`, getSeriesDetails);

  /**
   * ➕ 创建新漫剧（快速模式）
   */
  console.log('[routes_series_core_refactored.tsx] 📝 Registering POST', `${PREFIX}/series`);
  app.post(`${PREFIX}/series`, createSeries);

  /**
   * ✏️ 更新漫剧信息
   */
  console.log('[routes_series_core_refactored.tsx] 📝 Registering PUT', `${PREFIX}/series/:id`);
  app.put(`${PREFIX}/series/:id`, updateSeries);

  /**
   * 🗑️ 删除漫剧\
   */
  console.log('[routes_series_core_refactored.tsx] 📝 Registering DELETE', `${PREFIX}/series/:id`);
  app.delete(`${PREFIX}/series/:id`, deleteSeries);

  // ==================== AI生成 ====================
  
  /**
   * 🎨 从创意创建完整漫剧（AI生成）
   */
  console.log('[routes_series_core_refactored.tsx] 📝 Registering POST', `${PREFIX}/series/create-from-idea`);
  app.post(`${PREFIX}/series/create-from-idea`, createFromIdea);

  // ==================== 互动功能 ====================
  
  /**
   * ❤️ 点赞/取消点赞
   */
  console.log('[routes_series_core_refactored.tsx] 📝 Registering POST', `${PREFIX}/series/:id/like`);
  app.post(`${PREFIX}/series/:id/like`, toggleLike);

  /**
   * 💬 添加评论
   */
  console.log('[routes_series_core_refactored.tsx] 📝 Registering POST', `${PREFIX}/series/:id/comment`);
  app.post(`${PREFIX}/series/:id/comment`, addComment);

  /**
   * 📝 获取评论列表
   */
  console.log('[routes_series_core_refactored.tsx] 📝 Registering GET', `${PREFIX}/series/:id/comments`);
  app.get(`${PREFIX}/series/:id/comments`, getComments);

  /**
   * 🔗 记录分享
   */
  console.log('[routes_series_core_refactored.tsx] 📝 Registering POST', `${PREFIX}/series/:id/share`);
  app.post(`${PREFIX}/series/:id/share`, recordShare);

  /**
   * 📺 更新观看历史
   */
  console.log('[routes_series_core_refactored.tsx] 📝 Registering POST', `${PREFIX}/series/:id/viewing-history`);
  app.post(`${PREFIX}/series/:id/viewing-history`, updateViewingHistory);

  /**
   * 📖 获取观看历史
   */
  console.log('[routes_series_core_refactored.tsx] 📝 Registering GET', `${PREFIX}/series/:id/viewing-history`);
  app.get(`${PREFIX}/series/:id/viewing-history`, getViewingHistory);

  // ==================== 视频生成 ====================
  
  /**
   * 🎬 生成视频
   */
  console.log('[routes_series_core_refactored.tsx] 📝 Registering POST', `${PREFIX}/series/:seriesId/episodes/:episodeId/storyboards/:storyboardId/generate-video`);
  app.post(`${PREFIX}/series/:seriesId/episodes/:episodeId/storyboards/:storyboardId/generate-video`, generateVideo);

  // ==================== 数据修复 ====================
  
  /**
   * 🔧 批量修复所有漫剧数据
   */
  console.log('[routes_series_core_refactored.tsx] 📝 Registering POST', `${PREFIX}/series/batch-fix`);
  app.post(`${PREFIX}/series/batch-fix`, batchFixSeriesData);

  /**
   * 🔧 修复单个漫剧数据
   */
  console.log('[routes_series_core_refactored.tsx] 📝 Registering POST', `${PREFIX}/series/:seriesId/fix`);
  app.post(`${PREFIX}/series/:seriesId/fix`, fixSingleSeries);

  /**
   * 🔍 检测数据问题（不修复）
   */
  console.log('[routes_series_core_refactored.tsx] 📝 Registering GET', `${PREFIX}/series/detect-issues`);
  app.get(`${PREFIX}/series/detect-issues`, detectDataIssues);
  
  console.log('[routes_series_core_refactored.tsx] ✅ All routes registered successfully');
  console.log('[routes_series_core_refactored.tsx] 📋 Route summary:');
  console.log('[routes_series_core_refactored.tsx]   CRUD: 5 routes');
  console.log('[routes_series_core_refactored.tsx]   AI Generation: 1 route');
  console.log('[routes_series_core_refactored.tsx]   Interactions: 6 routes');
  console.log('[routes_series_core_refactored.tsx]   Video: 1 route');
  console.log('[routes_series_core_refactored.tsx]   Data Fix: 3 routes');
  console.log('[routes_series_core_refactored.tsx]   Total: 16 routes');
}

/**
 * 🔄 别名导出 - 兼容旧代码
 * 因为Deno Edge Function的编译缓存问题，旧版本的app.tsx可能还在寻找 registerSeriesRoutes
 * 这个别名确保新旧代码都能正常工作
 */
export const registerSeriesRoutes = registerSeriesCoreRoutes;