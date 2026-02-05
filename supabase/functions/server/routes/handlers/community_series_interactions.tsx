/**
 * 社区漫剧互动处理器
 * 从 community_series.tsx 提取的点赞、评论、分享、查看逻辑
 */

import type { Context } from "npm:hono";
import * as db from "../../database/index.tsx";

/**
 * 点赞/取消点赞漫剧
 */
export async function toggleSeriesLike(c: Context) {
  try {
    const seriesId = c.req.param('seriesId');
    const body = await c.req.json();
    const { userPhone } = body;

    if (!seriesId || !userPhone) {
      return c.json({
        success: false,
        error: 'Series ID and user phone are required'
      }, 400);
    }

    console.log('[Community Series] Toggle like:', { seriesId, userPhone });

    // 检查是否已点赞
    const { data: existingLike } = await db.supabase
      .from('series_likes')
      .select('*')
      .eq('series_id', seriesId)
      .eq('user_phone', userPhone)
      .single();

    if (existingLike) {
      // 取消点赞
      await db.supabase
        .from('series_likes')
        .delete()
        .eq('series_id', seriesId)
        .eq('user_phone', userPhone);

      // 更新计数
      await db.supabase.rpc('decrement_series_likes', { series_id: seriesId });

      return c.json({
        success: true,
        liked: false
      });
    } else {
      // 添加点赞
      await db.supabase
        .from('series_likes')
        .insert([{
          series_id: seriesId,
          user_phone: userPhone
        }]);

      // 更新计数
      await db.supabase.rpc('increment_series_likes', { series_id: seriesId });

      return c.json({
        success: true,
        liked: true
      });
    }
  } catch (error: any) {
    console.error('[Community Series] Error in toggleSeriesLike:', error);
    return c.json({
      success: false,
      error: error.message
    }, 500);
  }
}

/**
 * 添加评论
 */
export async function addSeriesComment(c: Context) {
  try {
    const seriesId = c.req.param('seriesId');
    const body = await c.req.json();
    const { userPhone, content, parentId } = body;

    if (!seriesId || !userPhone || !content) {
      return c.json({
        success: false,
        error: 'Series ID, user phone, and content are required'
      }, 400);
    }

    console.log('[Community Series] Adding comment:', { seriesId, userPhone, parentId });

    const { data: comment, error } = await db.supabase
      .from('series_comments')
      .insert([{
        series_id: seriesId,
        user_phone: userPhone,
        content,
        parent_id: parentId || null
      }])
      .select()
      .single();

    if (error) {
      console.error('[Community Series] Error adding comment:', error);
      return c.json({
        success: false,
        error: error.message
      }, 500);
    }

    // 更新评论计数
    await db.supabase.rpc('increment_series_comments', { series_id: seriesId });

    return c.json({
      success: true,
      comment
    });
  } catch (error: any) {
    console.error('[Community Series] Error in addSeriesComment:', error);
    return c.json({
      success: false,
      error: error.message
    }, 500);
  }
}

/**
 * 获取评论列表
 */
export async function getSeriesComments(c: Context) {
  try {
    const seriesId = c.req.param('seriesId');
    const page = parseInt(c.req.query('page') || '1');
    const limit = parseInt(c.req.query('limit') || '20');

    if (!seriesId) {
      return c.json({
        success: false,
        error: 'Series ID is required'
      }, 400);
    }

    console.log('[Community Series] Fetching comments:', { seriesId, page, limit });

    const offset = (page - 1) * limit;

    const { data: comments, error, count } = await db.supabase
      .from('series_comments')
      .select('*', { count: 'exact' })
      .eq('series_id', seriesId)
      .is('parent_id', null)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error('[Community Series] Error fetching comments:', error);
      return c.json({
        success: false,
        error: error.message,
        comments: []
      }, 500);
    }

    // 获取用户信息
    if (comments && comments.length > 0) {
      const phones = [...new Set(comments.map(c => c.user_phone))];
      const { data: users } = await db.supabase
        .from('users')
        .select('phone, username, avatar_url')
        .in('phone', phones);

      const usersMap = new Map(
        (users || []).map(u => [u.phone, u])
      );

      // 获取回复
      const commentIds = comments.map(c => c.id);
      const { data: replies } = await db.supabase
        .from('series_comments')
        .select('*')
        .in('parent_id', commentIds)
        .order('created_at', { ascending: true });

      const repliesMap = new Map<string, any[]>();
      (replies || []).forEach(reply => {
        if (!repliesMap.has(reply.parent_id)) {
          repliesMap.set(reply.parent_id, []);
        }
        const user = usersMap.get(reply.user_phone);
        repliesMap.get(reply.parent_id)!.push({
          ...reply,
          username: user?.username || '匿名用户',
          userAvatar: user?.avatar_url || ''
        });
      });

      const enrichedComments = comments.map(comment => {
        const user = usersMap.get(comment.user_phone);
        return {
          ...comment,
          username: user?.username || '匿名用户',
          userAvatar: user?.avatar_url || '',
          replies: repliesMap.get(comment.id) || []
        };
      });

      return c.json({
        success: true,
        comments: enrichedComments,
        total: count || 0,
        page,
        limit,
        hasMore: offset + limit < (count || 0)
      });
    }

    return c.json({
      success: true,
      comments: [],
      total: 0,
      page,
      limit,
      hasMore: false
    });
  } catch (error: any) {
    console.error('[Community Series] Error in getSeriesComments:', error);
    return c.json({
      success: false,
      error: error.message,
      comments: []
    }, 500);
  }
}

/**
 * 分享漫剧
 */
export async function shareSeries(c: Context) {
  try {
    const seriesId = c.req.param('seriesId');
    const body = await c.req.json();
    const { userPhone, platform } = body;

    if (!seriesId) {
      return c.json({
        success: false,
        error: 'Series ID is required'
      }, 400);
    }

    console.log('[Community Series] Share series:', { seriesId, userPhone, platform });

    // 记录分享
    await db.supabase
      .from('series_shares')
      .insert([{
        series_id: seriesId,
        user_phone: userPhone,
        platform: platform || 'unknown'
      }]);

    // 更新分享计数
    await db.supabase.rpc('increment_series_shares', { series_id: seriesId });

    return c.json({
      success: true
    });
  } catch (error: any) {
    console.error('[Community Series] Error in shareSeries:', error);
    return c.json({
      success: false,
      error: error.message
    }, 500);
  }
}

/**
 * 记录查看
 */
export async function recordSeriesView(c: Context) {
  try {
    const seriesId = c.req.param('seriesId');
    const body = await c.req.json();
    const { userPhone } = body;

    if (!seriesId) {
      return c.json({
        success: false,
        error: 'Series ID is required'
      }, 400);
    }

    console.log('[Community Series] Record view:', { seriesId, userPhone });

    // 更新查看计数
    await db.supabase.rpc('increment_series_views', { series_id: seriesId });

    return c.json({
      success: true
    });
  } catch (error: any) {
    console.error('[Community Series] Error in recordSeriesView:', error);
    return c.json({
      success: false,
      error: error.message
    }, 500);
  }
}

/**
 * 保存观看历史
 */
export async function saveViewingHistory(c: Context) {
  try {
    const seriesId = c.req.param('seriesId');
    const body = await c.req.json();
    const { userPhone, episodeId, progress, duration } = body;

    if (!seriesId || !userPhone) {
      return c.json({
        success: false,
        error: 'Series ID and user phone are required'
      }, 400);
    }

    console.log('[Community Series] Save viewing history:', { seriesId, userPhone, episodeId, progress });

    await db.supabase
      .from('viewing_history')
      .upsert([{
        series_id: seriesId,
        episode_id: episodeId,
        user_phone: userPhone,
        progress: progress || 0,
        duration: duration || 0,
        updated_at: new Date().toISOString()
      }], {
        onConflict: 'series_id,episode_id,user_phone'
      });

    return c.json({
      success: true
    });
  } catch (error: any) {
    console.error('[Community Series] Error in saveViewingHistory:', error);
    return c.json({
      success: false,
      error: error.message
    }, 500);
  }
}

/**
 * 获取观看历史
 */
export async function getViewingHistory(c: Context) {
  try {
    const seriesId = c.req.param('seriesId');
    const userPhone = c.req.query('userPhone');

    if (!seriesId || !userPhone) {
      return c.json({
        success: false,
        error: 'Series ID and user phone are required'
      }, 400);
    }

    console.log('[Community Series] Get viewing history:', { seriesId, userPhone });

    const { data: history, error } = await db.supabase
      .from('viewing_history')
      .select('*')
      .eq('series_id', seriesId)
      .eq('user_phone', userPhone)
      .order('updated_at', { ascending: false });

    if (error) {
      console.error('[Community Series] Error fetching viewing history:', error);
      return c.json({
        success: false,
        error: error.message,
        history: []
      }, 500);
    }

    return c.json({
      success: true,
      history: history || []
    });
  } catch (error: any) {
    console.error('[Community Series] Error in getViewingHistory:', error);
    return c.json({
      success: false,
      error: error.message,
      history: []
    }, 500);
  }
}
