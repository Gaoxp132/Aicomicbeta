/**
 * 漫剧互动功能处理器
 * 从 routes_series_core.tsx 提取的互动相关逻辑
 */

import type { Context } from "npm:hono";
import * as interactions from "../../database/series_interactions.tsx";

/**
 * 点赞/取消点赞
 */
export async function toggleLike(c: Context) {
  try {
    const seriesId = c.req.param('id');
    const body = await c.req.json();
    const { userPhone } = body;

    if (!userPhone) {
      return c.json({ error: '缺少用户手机号' }, 400);
    }

    const result = await interactions.toggleSeriesLike(seriesId, userPhone);

    return c.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    console.error('[SeriesCore] Error toggling like:', error);
    return c.json({
      error: '点赞操作失败',
      message: error.message,
    }, 500);
  }
}

/**
 * 添加评论
 */
export async function addComment(c: Context) {
  try {
    const seriesId = c.req.param('id');
    const body = await c.req.json();
    const { userPhone, content, parentId } = body;

    if (!userPhone || !content) {
      return c.json({ error: '缺少必要参数' }, 400);
    }

    const comment = await interactions.addSeriesComment({
      seriesId,
      userPhone,
      content,
      parentId,
    });

    return c.json({
      success: true,
      data: comment,
    });
  } catch (error: any) {
    console.error('[SeriesCore] Error adding comment:', error);
    return c.json({
      error: '评论失败',
      message: error.message,
    }, 500);
  }
}

/**
 * 获取评论列表
 */
export async function getComments(c: Context) {
  try {
    const seriesId = c.req.param('id');
    const page = parseInt(c.req.query('page') || '1');
    const limit = parseInt(c.req.query('limit') || '20');

    const result = await interactions.getSeriesComments(seriesId, page, limit);

    return c.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    console.error('[SeriesCore] Error fetching comments:', error);
    return c.json({
      error: '获取评论失败',
      message: error.message,
    }, 500);
  }
}

/**
 * 记录分享
 */
export async function recordShare(c: Context) {
  try {
    const seriesId = c.req.param('id');
    const body = await c.req.json();
    const { userPhone, platform } = body;

    if (!userPhone) {
      return c.json({ error: '缺少用户手机号' }, 400);
    }

    const result = await interactions.recordSeriesShare(seriesId, userPhone, platform);

    return c.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    console.error('[SeriesCore] Error recording share:', error);
    return c.json({
      error: '分享记录失败',
      message: error.message,
    }, 500);
  }
}

/**
 * 更新观看历史
 */
export async function updateViewingHistory(c: Context) {
  try {
    const seriesId = c.req.param('id');
    const body = await c.req.json();
    const { userPhone, episodeId, storyboardId, progress } = body;

    if (!userPhone) {
      return c.json({ error: '缺少用户手机号' }, 400);
    }

    const result = await interactions.updateViewingHistory({
      seriesId,
      userPhone,
      episodeId,
      storyboardId,
      progress: progress || 0,
    });

    return c.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    console.error('[SeriesCore] Error updating viewing history:', error);
    return c.json({
      error: '更新观看历史失败',
      message: error.message,
    }, 500);
  }
}

/**
 * 获取用户观看历史列表
 */
export async function getViewingHistory(c: Context) {
  try {
    const userPhone = c.req.header('x-user-phone') || c.req.query('userPhone');
    
    if (!userPhone) {
      return c.json({ error: '缺少用户手机号' }, 400);
    }

    const page = parseInt(c.req.query('page') || '1');
    const limit = parseInt(c.req.query('limit') || '20');

    const result = await interactions.getUserViewingHistory(userPhone, page, limit);

    return c.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    console.error('[SeriesCore] Error fetching viewing history:', error);
    return c.json({
      error: '获取观看历史失败',
      message: error.message,
    }, 500);
  }
}
