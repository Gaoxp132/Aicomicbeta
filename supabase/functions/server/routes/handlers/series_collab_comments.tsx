/**
 * 漫剧评论系统Handler
 * 从 routes_series_collab.tsx 提取
 * 负责：添加评论、获取评论、回复评论
 */

import type { Context } from "npm:hono";
import * as kv from "../../kv_store.tsx";

interface CommentReply {
  id: string;
  userPhone: string;
  userName: string;
  content: string;
  createdAt: string;
}

interface Comment {
  id: string;
  seriesId: string;
  episodeId?: string;
  storyboardId?: string;
  userPhone: string;
  userName: string;
  content: string;
  replies: CommentReply[];
  createdAt: string;
  updatedAt: string;
}

/**
 * 添加评论
 * POST /series/:seriesId/comments
 */
export async function handleAddComment(c: Context) {
  try {
    const seriesId = c.req.param("seriesId");
    const { userPhone, userName, content, episodeId, storyboardId } = await c.req.json();

    console.log("[SeriesCollabComments] Adding comment:", seriesId);

    const comment: Comment = {
      id: `comment-${Date.now()}`,
      seriesId,
      episodeId,
      storyboardId,
      userPhone,
      userName: userName || userPhone,
      content,
      replies: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // 保存评论
    const commentsKey = `series:${seriesId}:comments`;
    const commentsData = await kv.get(commentsKey);
    const comments: Comment[] = commentsData ? JSON.parse(commentsData) : [];

    comments.push(comment);
    await kv.set(commentsKey, JSON.stringify(comments));

    console.log("[SeriesCollabComments] ✅ Comment added");

    return c.json({
      success: true,
      data: comment,
    });
  } catch (error: any) {
    console.error("[SeriesCollabComments] Error adding comment:", error);
    return c.json({
      success: false,
      error: error.message || "Failed to add comment",
    }, 500);
  }
}

/**
 * 获取评论列表
 * GET /series/:seriesId/comments
 */
export async function handleGetComments(c: Context) {
  try {
    const seriesId = c.req.param("seriesId");
    const episodeId = c.req.query("episodeId");
    const storyboardId = c.req.query("storyboardId");

    const commentsKey = `series:${seriesId}:comments`;
    const commentsData = await kv.get(commentsKey);

    let comments: Comment[] = commentsData ? JSON.parse(commentsData) : [];

    // 筛选
    if (episodeId) {
      comments = comments.filter(c => c.episodeId === episodeId);
    }
    if (storyboardId) {
      comments = comments.filter(c => c.storyboardId === storyboardId);
    }

    return c.json({
      success: true,
      data: comments,
    });
  } catch (error: any) {
    console.error("[SeriesCollabComments] Error fetching comments:", error);
    return c.json({
      success: false,
      error: error.message || "Failed to fetch comments",
    }, 500);
  }
}

/**
 * 回复评论
 * POST /series/:seriesId/comments/:commentId/replies
 */
export async function handleAddReply(c: Context) {
  try {
    const seriesId = c.req.param("seriesId");
    const commentId = c.req.param("commentId");
    const { userPhone, userName, content } = await c.req.json();

    console.log("[SeriesCollabComments] Adding reply to comment:", commentId);

    const commentsKey = `series:${seriesId}:comments`;
    const commentsData = await kv.get(commentsKey);

    if (!commentsData) {
      return c.json({
        success: false,
        error: "Comments not found",
      }, 404);
    }

    const comments: Comment[] = JSON.parse(commentsData);
    const comment = comments.find(c => c.id === commentId);

    if (!comment) {
      return c.json({
        success: false,
        error: "Comment not found",
      }, 404);
    }

    const reply: CommentReply = {
      id: `reply-${Date.now()}`,
      userPhone,
      userName: userName || userPhone,
      content,
      createdAt: new Date().toISOString(),
    };

    comment.replies.push(reply);
    comment.updatedAt = new Date().toISOString();

    await kv.set(commentsKey, JSON.stringify(comments));

    console.log("[SeriesCollabComments] ✅ Reply added");

    return c.json({
      success: true,
      data: reply,
    });
  } catch (error: any) {
    console.error("[SeriesCollabComments] Error adding reply:", error);
    return c.json({
      success: false,
      error: error.message || "Failed to add reply",
    }, 500);
  }
}
