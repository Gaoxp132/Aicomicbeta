/**
 * 漫剧协作功能路由（重构版）
 * 已重构：拆分为4个Handler模块
 * - handlers/series_collab_versions.tsx: 版本历史管理
 * - handlers/series_collab_comments.tsx: 评论系统
 * - handlers/series_collab_annotations.tsx: 批注系统
 * - handlers/series_collab_collaborators.tsx: 协作者管理
 * 
 * 注意：此文件为 routes_series_collab.tsx 的重构版本
 * 原文件(582行)保留为备份
 */

import { Hono } from "npm:hono";

// 导入版本历史Handler
import {
  handleCreateVersion,
  handleGetVersions,
  handleRestoreVersion
} from "./routes/handlers/series_collab_versions.tsx";

// 导入评论系统Handler
import {
  handleAddComment,
  handleGetComments,
  handleAddReply
} from "./routes/handlers/series_collab_comments.tsx";

// 导入批注系统Handler
import {
  handleAddAnnotation,
  handleGetAnnotations,
  handleResolveAnnotation
} from "./routes/handlers/series_collab_annotations.tsx";

// 导入协作者管理Handler
import {
  handleAddCollaborator,
  handleGetCollaborators
} from "./routes/handlers/series_collab_collaborators.tsx";

const app = new Hono();

console.log('[routes_series_collab_refactored.tsx] ✅ Module loaded');

// ==================== 版本历史 ====================

/**
 * 创建新版本
 * POST /make-server-fc31472c/series/:seriesId/versions
 */
app.post("/make-server-fc31472c/series/:seriesId/versions", handleCreateVersion);

/**
 * 获取版本历史列表
 * GET /make-server-fc31472c/series/:seriesId/versions
 */
app.get("/make-server-fc31472c/series/:seriesId/versions", handleGetVersions);

/**
 * 恢复到指定版本
 * POST /make-server-fc31472c/series/:seriesId/versions/:versionId/restore
 */
app.post(
  "/make-server-fc31472c/series/:seriesId/versions/:versionId/restore",
  handleRestoreVersion
);

// ==================== 评论系统 ====================

/**
 * 添加评论
 * POST /make-server-fc31472c/series/:seriesId/comments
 */
app.post("/make-server-fc31472c/series/:seriesId/comments", handleAddComment);

/**
 * 获取评论列表
 * GET /make-server-fc31472c/series/:seriesId/comments
 */
app.get("/make-server-fc31472c/series/:seriesId/comments", handleGetComments);

/**
 * 回复评论
 * POST /make-server-fc31472c/series/:seriesId/comments/:commentId/replies
 */
app.post(
  "/make-server-fc31472c/series/:seriesId/comments/:commentId/replies",
  handleAddReply
);

// ==================== 批注系统 ====================

/**
 * 添加批注
 * POST /make-server-fc31472c/series/:seriesId/annotations
 */
app.post("/make-server-fc31472c/series/:seriesId/annotations", handleAddAnnotation);

/**
 * 获取批注列表
 * GET /make-server-fc31472c/series/:seriesId/annotations
 */
app.get("/make-server-fc31472c/series/:seriesId/annotations", handleGetAnnotations);

/**
 * 解决批注
 * PUT /make-server-fc31472c/series/:seriesId/annotations/:annotationId/resolve
 */
app.put(
  "/make-server-fc31472c/series/:seriesId/annotations/:annotationId/resolve",
  handleResolveAnnotation
);

// ==================== 协作者管理 ====================

/**
 * 添加协作者
 * POST /make-server-fc31472c/series/:seriesId/collaborators
 */
app.post("/make-server-fc31472c/series/:seriesId/collaborators", handleAddCollaborator);

/**
 * 获取协作者列表
 * GET /make-server-fc31472c/series/:seriesId/collaborators
 */
app.get("/make-server-fc31472c/series/:seriesId/collaborators", handleGetCollaborators);

console.log('[routes_series_collab_refactored.tsx] ✅ All collaboration routes registered successfully');
console.log('[routes_series_collab_refactored.tsx] 📋 Route summary:');
console.log('[routes_series_collab_refactored.tsx]   Version History: 3 routes');
console.log('[routes_series_collab_refactored.tsx]   Comment System: 3 routes');
console.log('[routes_series_collab_refactored.tsx]   Annotation System: 3 routes');
console.log('[routes_series_collab_refactored.tsx]   Collaborator Management: 2 routes');
console.log('[routes_series_collab_refactored.tsx]   Total: 11 routes');

export function registerSeriesCollabRoutes(parentApp: Hono) {
  parentApp.route("/", app);
}