import type { Hono } from "npm:hono";
import { registerCommunityWorksRoutes } from "./routes/community_works.tsx";
import { registerCommunityInteractionsRoutes } from "./routes/community_interactions.tsx";
import { registerCommunitySeriesRoutes } from "./routes/community_series.tsx";

/**
 * 社区路由总注册
 * 
 * 🔥 v3.8.9.5 - 2025-01-25T15:35:00Z - Force reload handlers
 */
export function registerCommunityRoutes(app: Hono) {
  console.log('[Community Routes] Starting registration... v3.8.9.5');
  
  try {
    // 注册作品查询路由
    console.log('[Community Routes] Registering works routes...');
    registerCommunityWorksRoutes(app);
    console.log('[Community Routes] ✅ Works routes registered');
  } catch (error: any) {
    console.error('[Community Routes] ❌ Failed to register works routes:', error.message);
    throw error;
  }
  
  try {
    // 注册互动路由（点赞、评论、分享、浏览）
    console.log('[Community Routes] Registering interactions routes...');
    registerCommunityInteractionsRoutes(app);
    console.log('[Community Routes] ✅ Interactions routes registered');
  } catch (error: any) {
    console.error('[Community Routes] ❌ Failed to register interactions routes:', error.message);
    throw error;
  }
  
  try {
    // 注册漫剧系列路由
    console.log('[Community Routes] Registering series routes...');
    registerCommunitySeriesRoutes(app);
    console.log('[Community Routes] ✅ Series routes registered');
  } catch (error: any) {
    console.error('[Community Routes] ❌ Failed to register series routes:', error.message);
    throw error;
  }
  
  console.log('[Community Routes] All routes registered successfully');
}