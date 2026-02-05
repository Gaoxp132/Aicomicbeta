/**
 * 剧集互动功能
 * 点赞、评论、分享等社交功能
 * v4.2.4: 内联实现 getBeijingTime，避免模块导入问题
 */

import { supabase } from './client.tsx';
import { getOrCreateUser } from './users.tsx';

// 🔥 CACHE BUSTER
export const SERIES_INTERACTIONS_VERSION = 'v4.2.4_STANDALONE_2026-01-27_004';

/**
 * 获取当前北京时间（内联实现，避免模块导入问题）
 * @returns 北京时间的ISO字符串
 */
function getBeijingTime(): string {
  const now = new Date();
  // 转换为北京时间（UTC+8）
  const beijingTime = new Date(now.getTime() + (8 * 60 * 60 * 1000));
  return beijingTime.toISOString();
}

// ==================== 点赞操作 ====================

/**
 * 切换剧集的点赞状态
 */
export async function toggleSeriesLike(seriesId: string, userPhone: string) {
  try {
    await getOrCreateUser(userPhone);

    // 检查是否已点赞
    const { data: existingLike } = await supabase
      .from('likes')
      .select('id')
      .eq('series_id', seriesId)
      .eq('user_phone', userPhone)
      .single();

    if (existingLike) {
      // 取消点赞
      const { error } = await supabase
        .from('likes')
        .delete()
        .eq('series_id', seriesId)
        .eq('user_phone', userPhone);

      if (error) throw error;

      // 获取最新点赞数
      const { count } = await supabase
        .from('likes')
        .select('*', { count: 'exact', head: true })
        .eq('series_id', seriesId);

      return {
        isLiked: false,
        likes: count || 0,
      };
    } else {
      // 添加点赞
      const { error } = await supabase
        .from('likes')
        .insert([{
          series_id: seriesId,
          user_phone: userPhone,
        }]);

      if (error) throw error;

      const { count } = await supabase
        .from('likes')
        .select('*', { count: 'exact', head: true })
        .eq('series_id', seriesId);

      return {
        isLiked: true,
        likes: count || 0,
      };
    }
  } catch (error) {
    console.error('Error toggling series like:', error);
    throw error;
  }
}

/**
 * 获取剧集的点赞状态
 */
export async function getSeriesLikeStatus(seriesId: string, userPhone: string) {
  try {
    const { data } = await supabase
      .from('likes')
      .select('id')
      .eq('series_id', seriesId)
      .eq('user_phone', userPhone)
      .single();

    const { count } = await supabase
      .from('likes')
      .select('*', { count: 'exact', head: true })
      .eq('series_id', seriesId);

    return {
      isLiked: !!data,
      likes: count || 0,
    };
  } catch (error) {
    console.error('Error getting series like status:', error);
    return {
      isLiked: false,
      likes: 0,
    };
  }
}

// ==================== 评论操作 ====================

/**
 * 为剧集添加评论
 */
export async function addSeriesComment(commentData: {
  seriesId: string;
  userPhone: string;
  content: string;
  parentId?: string;
}) {
  try {
    await getOrCreateUser(commentData.userPhone);

    const { data, error } = await supabase
      .from('comments')
      .insert([{
        series_id: commentData.seriesId,
        user_phone: commentData.userPhone,
        content: commentData.content,
        parent_id: commentData.parentId || null,
      }])
      .select(`
        *,
        users!inner(phone, nickname, avatar_url)
      `)
      .single();

    if (error) throw error;

    return {
      ...data,
      user: data.users,
    };
  } catch (error) {
    console.error('Error adding series comment:', error);
    throw error;
  }
}

/**
 * 获取剧集的评论列表
 */
export async function getSeriesComments(seriesId: string, page: number = 1, limit: number = 20) {
  try {
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    const { data, error, count } = await supabase
      .from('comments')
      .select(`
        *,
        users!inner(phone, nickname, avatar_url)
      `, { count: 'exact' })
      .eq('series_id', seriesId)
      .is('parent_id', null)
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) throw error;

    // 获取回复
    const commentIds = data?.map((c: any) => c.id) || [];
    const { data: replies } = await supabase
      .from('comments')
      .select(`
        *,
        users!inner(phone, nickname, avatar_url)
      `)
      .in('parent_id', commentIds)
      .order('created_at', { ascending: true });

    const comments = data?.map((comment: any) => ({
      ...comment,
      user: comment.users,
      replies: (replies || [])
        .filter((r: any) => r.parent_id === comment.id)
        .map((r: any) => ({
          ...r,
          user: r.users,
        })),
    })) || [];

    return {
      comments,
      total: count || 0,
      page,
      limit,
      hasMore: (from + comments.length) < (count || 0),
    };
  } catch (error) {
    console.error('Error getting series comments:', error);
    throw error;
  }
}

// ==================== 分享操作 ====================

/**
 * 记录剧集分享
 */
export async function recordSeriesShare(
  seriesId: string, 
  userPhone: string, 
  platform: 'link' | 'wechat' | 'weibo' | 'douyin' | 'other' = 'link'
) {
  try {
    await getOrCreateUser(userPhone);

    const { error } = await supabase
      .from('shares')
      .insert([{
        series_id: seriesId,
        user_phone: userPhone,
        platform,
      }]);

    if (error) throw error;

    // 获取最新分享数
    const { count } = await supabase
      .from('shares')
      .select('*', { count: 'exact', head: true })
      .eq('series_id', seriesId);

    return {
      success: true,
      shares: count || 0,
    };
  } catch (error) {
    console.error('Error recording series share:', error);
    throw error;
  }
}

/**
 * 获取剧集的分享数
 */
export async function getSeriesSharesCount(seriesId: string): Promise<number> {
  try {
    const { count } = await supabase
      .from('shares')
      .select('*', { count: 'exact', head: true })
      .eq('series_id', seriesId);

    return count || 0;
  } catch (error) {
    console.error('Error getting series shares count:', error);
    return 0;
  }
}

// ==================== 浏览量操作 ====================

/**
 * 增加剧集浏览量
 */
export async function incrementSeriesViews(seriesId: string): Promise<void> {
  try {
    // series表没有views列，暂不实现
    // 未来可以添加独立的views追踪表
    console.log('[series_interactions] Increment views for series:', seriesId);
  } catch (error) {
    console.error('Error incrementing series views:', error);
  }
}

/**
 * 获取剧集浏览数
 */
export async function getSeriesViews(seriesId: string): Promise<number> {
  try {
    // series 表没有 views 列，需要从其他地方获取或返回默认值
    // 可以基于点赞数、评论数等计算一个虚拟的浏览数
    // 或者简单返回 0
    console.log('[series_interactions] Getting views for series:', seriesId);
    
    // 临时方案：返回 0 或基于其他指标计算
    // 未来可以添加独立的 views 追踪表
    return 0;
    
  } catch (error) {
    console.error('Error getting series views:', error);
    return 0;
  }
}

// ==================== 综合互动数据 ====================

/**
 * 获取剧集的所有互动数据
 */
export async function getSeriesInteractions(seriesId: string, userPhone?: string) {
  try {
    // 获取点赞数
    const { count: likesCount } = await supabase
      .from('likes')
      .select('*', { count: 'exact', head: true })
      .eq('series_id', seriesId);

    // 获取评论数
    const { count: commentsCount } = await supabase
      .from('comments')
      .select('*', { count: 'exact', head: true })
      .eq('series_id', seriesId);

    // 获取分享数
    const { count: sharesCount } = await supabase
      .from('shares')
      .select('*', { count: 'exact', head: true })
      .eq('series_id', seriesId);

    // 获取浏览量
    const views = await getSeriesViews(seriesId);

    // 如果提供了用户手机号，检查用户是否点赞
    let isLiked = false;
    if (userPhone) {
      const { data } = await supabase
        .from('likes')
        .select('id')
        .eq('series_id', seriesId)
        .eq('user_phone', userPhone)
        .single();
      
      isLiked = !!data;
    }

    return {
      likes: likesCount || 0,
      comments: commentsCount || 0,
      shares: sharesCount || 0,
      views,
      isLiked,
    };
  } catch (error) {
    console.error('Error getting series interactions:', error);
    return {
      likes: 0,
      comments: 0,
      shares: 0,
      views: 0,
      isLiked: false,
    };
  }
}

// ==================== 播放历史 ====================

/**
 * 更新或创建播放历史记录
 */
export async function upsertViewingHistory(data: {
  userPhone: string;
  seriesId: string;
  episodeId: string;
  episodeNumber: number;
  lastPosition?: number;
  duration?: number;
  completed?: boolean;
}) {
  try {
    await getOrCreateUser(data.userPhone);

    const { error } = await supabase
      .from('viewing_history')
      .upsert({
        user_phone: data.userPhone,
        series_id: data.seriesId,
        episode_id: data.episodeId,
        episode_number: data.episodeNumber,
        last_position: data.lastPosition || 0,
        duration: data.duration || 0,
        completed: data.completed || false,
        last_watched_at: getBeijingTime(),
      }, {
        onConflict: 'user_phone,series_id',
      });

    if (error) throw error;

    return { success: true };
  } catch (error) {
    console.error('Error upserting viewing history:', error);
    throw error;
  }
}

/**
 * 获取用户的播放历史
 */
export async function getViewingHistory(userPhone: string, seriesId: string) {
  try {
    const { data, error } = await supabase
      .from('viewing_history')
      .select('*')
      .eq('user_phone', userPhone)
      .eq('series_id', seriesId)
      .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 = not found
      throw error;
    }

    return data || null;
  } catch (error) {
    console.error('Error getting viewing history:', error);
    return null;
  }
}

/**
 * 获取用户所有的播放历史列表
 */
export async function getUserViewingHistoryList(userPhone: string, limit: number = 20) {
  try {
    const { data, error } = await supabase
      .from('viewing_history')
      .select(`
        *,
        series:series_id (
          id,
          title,
          cover_image_url,
          genre,
          style,
          total_episodes
        )
      `)
      .eq('user_phone', userPhone)
      .order('last_watched_at', { ascending: false })
      .limit(limit);

    if (error) throw error;

    return data || [];
  } catch (error) {
    console.error('Error getting user viewing history list:', error);
    return [];
  }
}