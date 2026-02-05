import type { Hono } from "npm:hono";
import { createDualRouteRegistrar } from "../utils.tsx";

// 导入处理器 - 🔥 v3.8.9.5 Force reload
import { getCommunitySeriesList, getSeriesDetail } from "./handlers/community_series_list.tsx";
import { 
  toggleSeriesLike,
  addSeriesComment,
  getSeriesComments,
  shareSeries,
  recordSeriesView,
  saveViewingHistory,
  getViewingHistory
} from "./handlers/community_series_interactions.tsx";
import { 
  mergeEpisodeStoryboards,
  generateEpisodeThumbnail
} from "./handlers/community_series_episodes.tsx";
import { getSeriesRawData } from "./handlers/community_series_debug.tsx";

/**
 * 注册社区漫剧相关路由
 */
export function registerCommunitySeriesRoutes(app: Hono) {
  console.log('[Community Series Routes] Starting registration...');
  const register = createDualRouteRegistrar(app);
  
  // ==================== 列表和详情 ====================
  
  console.log('[Community Series Routes] Registering GET /community/series...');
  // 📋 获取社区漫剧列表
  register('get', '/community/series', getCommunitySeriesList);
  
  console.log('[Community Series Routes] Registering GET /community/series/:seriesId...');
  // 📖 获取单个漫剧详情
  register('get', '/community/series/:seriesId', getSeriesDetail);

  // ==================== 互动功能 ====================
  
  console.log('[Community Series Routes] Registering interaction routes...');
  // 👍 点赞/取消点赞漫剧
  app.post("/make-server-fc31472c/community/series/:seriesId/like", toggleSeriesLike);
  
  // 💬 添加评论
  app.post("/make-server-fc31472c/community/series/:seriesId/comment", addSeriesComment);
  
  // 📝 获取评论列表
  app.get("/make-server-fc31472c/community/series/:seriesId/comments", getSeriesComments);
  
  // 🔗 分享漫剧
  app.post("/make-server-fc31472c/community/series/:seriesId/share", shareSeries);
  
  // 👀 记录查看
  app.post("/make-server-fc31472c/community/series/:seriesId/view", recordSeriesView);
  
  // 📺 保存观看历史
  app.post("/make-server-fc31472c/community/series/:seriesId/viewing-history", saveViewingHistory);
  
  // 📜 获取观看历史
  app.get("/make-server-fc31472c/community/series/:seriesId/viewing-history", getViewingHistory);

  // ==================== 剧集操作 ====================
  
  console.log('[Community Series Routes] Registering episode routes...');
  // 🎬 合并剧集的分镜视频
  app.post("/make-server-fc31472c/series/:seriesId/episodes/:episodeId/merge", mergeEpisodeStoryboards);
  
  // 🖼️ 生成剧集缩略图
  app.post("/make-server-fc31472c/series/:seriesId/episodes/:episodeId/thumbnail", generateEpisodeThumbnail);

  // ==================== 调试工具 ====================
  
  console.log('[Community Series Routes] Registering debug routes...');
  // 🔍 获取原始漫剧数据（调试用）
  app.get("/make-server-fc31472c/debug/series-raw", getSeriesRawData);
  
  console.log('[Community Series Routes] ✅ All routes registered successfully');
}