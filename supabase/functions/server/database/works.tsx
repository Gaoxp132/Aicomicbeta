/**
 * 社区作品数据库操作
 * 
 * 提供作品发布、查询和互动功能
 * 
 * 更新: 2025-01-27 - 表名修复：works_refactored -> works
 */

import { supabase } from './client.tsx';
import { getOrCreateUser } from './users.tsx';

// ==================== 工具函数 ====================

/**
 * 解析时长字符串（如 "8s" -> 8）
 */
export function parseDuration(duration: string | number | undefined): number {
  if (!duration) return 8; // 默认值
  
  if (typeof duration === 'number') {
    return duration;
  }
  
  // 移除 's' 后缀并转换为数字
  const parsed = parseInt(duration.replace('s', ''));
  return isNaN(parsed) ? 8 : parsed;
}

// ==================== 互动功能 ====================

/**
 * 获取作品的互动数据（点赞数和评论数）
 */
export async function getWorksInteractionCounts(workIds: string[]) {
  try {
    if (!workIds || workIds.length === 0) {
      return { likesCounts: {}, commentsCounts: {} };
    }
    
    // 并行查询点赞和评论数
    const [likesResult, commentsResult] = await Promise.all([
      supabase
        .from('likes')
        .select('work_id')
        .in('work_id', workIds),
      supabase
        .from('comments')
        .select('work_id')
        .in('work_id', workIds)
    ]);
    
    // 统计每个作品的点赞数
    const likesCounts: Record<string, number> = {};
    if (likesResult.data) {
      likesResult.data.forEach((like: any) => {
        likesCounts[like.work_id] = (likesCounts[like.work_id] || 0) + 1;
      });
    }
    
    // 统计每个作品的评论数
    const commentsCounts: Record<string, number> = {};
    if (commentsResult.data) {
      commentsResult.data.forEach((comment: any) => {
        commentsCounts[comment.work_id] = (commentsCounts[comment.work_id] || 0) + 1;
      });
    }
    
    return { likesCounts, commentsCounts };
  } catch (error: any) {
    console.error('[getWorksInteractionCounts] Error:', error);
    return { likesCounts: {}, commentsCounts: {} };
  }
}

/**
 * 为作品列表添加互动数据
 */
export function enrichWorksWithInteractions(
  works: any[],
  likesCounts: Record<string, number>,
  commentsCounts: Record<string, number>
) {
  return works.map((work: any) => ({
    ...work,
    likes: likesCounts[work.id] || 0,
    comments: commentsCounts[work.id] || 0,
  }));
}

/**
 * 增加作品浏览数
 */
export async function incrementViews(workId: string) {
  try {
    const { error } = await supabase.rpc('increment_views', { work_id: workId });
    
    if (error) {
      // 🔥 v4.2.67: 修复 - 使用直接的SQL UPDATE，不使用supabase.raw()
      console.warn('[incrementViews] RPC not available, using manual increment');
      
      // 先获取当前值
      const { data: current } = await supabase
        .from('works')
        .select('views')
        .eq('id', workId)
        .single();
      
      // 然后更新
      const { error: updateError } = await supabase
        .from('works')
        .update({ views: (current?.views || 0) + 1 })
        .eq('id', workId);
      
      if (updateError) throw updateError;
    }
    
    console.log('[incrementViews] ✅ Views incremented for work:', workId);
  } catch (error: any) {
    console.error('[incrementViews] Error:', error);
    throw error;
  }
}

/**
 * 增加作品分享数
 */
export async function incrementShares(workId: string) {
  try {
    const { error } = await supabase.rpc('increment_shares', { work_id: workId });
    
    if (error) {
      // 🔥 v4.2.67: 修复 - 使用直接的SQL UPDATE，不使用supabase.raw()
      console.warn('[incrementShares] RPC not available, using manual increment');
      
      // 先获取当前值
      const { data: current } = await supabase
        .from('works')
        .select('shares')
        .eq('id', workId)
        .single();
      
      // 然后更新
      const { error: updateError } = await supabase
        .from('works')
        .update({ shares: (current?.shares || 0) + 1 })
        .eq('id', workId);
      
      if (updateError) throw updateError;
    }
    
    console.log('[incrementShares] ✅ Shares incremented for work:', workId);
  } catch (error: any) {
    console.error('[incrementShares] Error:', error);
    throw error;
  }
}

// ==================== 查询功能 ====================

/**
 * 获取社区作品列表（带分页、筛选、排序）
 */
export async function getCommunityWorks(params: {
  page?: number;
  limit?: number;
  category?: string;
  sort?: 'latest' | 'popular';
  search?: string;
}) {
  try {
    const page = params.page || 1;
    const limit = params.limit || 20;
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    console.log('[DB] getCommunityWorks called with:', { page, limit, from, to, category: params.category });
    const startTime = Date.now();

    // 添加总体超时保护
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('getCommunityWorks total timeout after 8s')), 8000);
    });

    const queryWork = async () => {
      // 简化查询：先只获取works数据，然后再补充用户信息
      let query = supabase
        .from('works')
        .select('id, task_id, title, prompt, style, duration, thumbnail, video_url, views, shares, published_at, user_phone');

      // 分类筛选
      if (params.category && params.category !== 'all') {
        query = query.eq('style', params.category);
      }

      // 搜索
      if (params.search) {
        query = query.or(`title.ilike.%${params.search}%,prompt.ilike.%${params.search}%`);
      }

      // 排序
      if (params.sort === 'popular') {
        query = query.order('views', { ascending: false });
      } else {
        query = query.order('published_at', { ascending: false });
      }

      // 分页
      query = query.range(from, to);

      const { data, error } = await query;

      if (error) {
        console.error('[DB] Supabase query error:', error);
        throw new Error(`Database query failed: ${error.message || JSON.stringify(error)}`);
      }

      console.log(`[DB] Query returned ${data?.length || 0} rows in ${Date.now() - startTime}ms`);

      if (!data || data.length === 0) {
        return {
          works: [],
          total: 0,
          page,
          limit,
          hasMore: false,
        };
      }

      // 获取唯一的用户手机号列表
      const uniquePhones = [...new Set(data.map((w: any) => w.user_phone))];
      
      // 批量获取用户信息
      const { data: usersData, error: usersError } = await supabase
        .from('users')
        .select('phone, nickname, avatar')
        .in('phone', uniquePhones);
      
      if (usersError) {
        console.error('[DB] Error fetching users:', usersError);
      }
      
      // 创建用户信息映射
      const usersMap = new Map(
        (usersData || []).map((user: any) => [user.phone, user])
      );
      
      console.log(`[DB] Fetched ${usersData?.length || 0} users in ${Date.now() - startTime}ms`);

      // 获取互动数据
      const workIds = data.map((w: any) => w.id);
      const { likesCounts, commentsCounts } = await getWorksInteractionCounts(workIds);
      
      console.log(`[DB] Fetched interaction data in ${Date.now() - startTime}ms`);

      // 组合数据：添加用户信息和互动数据
      const works = data.map((work: any) => ({
        ...work,
        user: usersMap.get(work.user_phone) || {
          phone: work.user_phone,
          nickname: '未知用户',
          avatar: ''
        },
        users: usersMap.get(work.user_phone) || {
          phone: work.user_phone,
          nickname: '未知用户',
          avatar: ''
        },
        likes: likesCounts[work.id] || 0,
        comments: commentsCounts[work.id] || 0,
      }));

      console.log(`[DB] getCommunityWorks completed in ${Date.now() - startTime}ms`);
      
      // 简化的总数估算（避免额外的count查询）
      const hasMore = works.length === limit;

      return {
        works,
        total: hasMore ? (page * limit + 1) : (from + works.length),
        page,
        limit,
        hasMore,
      };
    };

    // 竞速：查询 vs 超时
    const result = await Promise.race([queryWork(), timeoutPromise]);
    return result;
  } catch (error: any) {
    console.error('[DB] getCommunityWorks error:', error);
    
    // 如果是超时错误，返回友好提示
    if (error.message?.includes('timeout')) {
      throw new Error('数据库查询超时，请稍后重试');
    }
    
    throw new Error(`Failed to get community works: ${error.message}`);
  }
}

/**
 * 获取用户自己的作品列表
 */
export async function getUserWorks(userPhone: string) {
  try {
    console.log('[DB] Getting works for user:', userPhone);
    
    // 查询用户的作品
    const { data: works, error } = await supabase
      .from('works')
      .select('*, users!inner(phone, nickname, avatar_url)')
      .eq('user_phone', userPhone)
      .order('published_at', { ascending: false });
    
    if (error) {
      console.error('[DB] Error fetching user works:', error);
      throw error;
    }
    
    if (!works || works.length === 0) {
      return {
        works: [],
        total: 0,
      };
    }
    
    // 获取互动数据
    const workIds = works.map((w: any) => w.id);
    const { likesCounts, commentsCounts } = await getWorksInteractionCounts(workIds);
    
    // 添加互动数据
    const enrichedWorks = enrichWorksWithInteractions(works, likesCounts, commentsCounts);
    
    console.log(`[DB] ✅ Found ${enrichedWorks.length} works for user ${userPhone}`);
    
    return {
      works: enrichedWorks,
      total: enrichedWorks.length,
    };
  } catch (error: any) {
    console.error('[DB] getUserWorks error:', error);
    throw new Error(`Failed to get user works: ${error.message}`);
  }
}

// ==================== 发布功能 ====================

/**
 * 发布作品到社区
 */
export async function publishWork(workData: {
  taskId: string;
  userPhone: string;
  title?: string;
  prompt?: string;
  style?: string;
  duration?: string;
  thumbnail?: string;
  videoUrl: string;
}) {
  try {
    console.log('[PublishWork] Starting to publish work:', {
      taskId: workData.taskId,
      userPhone: workData.userPhone,
      hasVideo: !!workData.videoUrl,
    });
    
    // 确保用户存在
    await getOrCreateUser(workData.userPhone);

    // 🔧 确保任务记录存在（解决外键约束问题）
    // 如果任务不存在，先创建一个最小化的任务记录
    try {
      const { data: existingTask } = await supabase
        .from('video_tasks')
        .select('task_id')
        .eq('task_id', workData.taskId)
        .single();
      
      if (!existingTask) {
        console.log('[PublishWork] Task not found, creating minimal task record:', workData.taskId);
        
        // 解析 duration
        const parsedDuration = parseDuration(workData.duration);
        
        // 创建最小化任务记录以满足外键约束
        const { error: taskError } = await supabase
          .from('video_tasks')
          .insert([{
            task_id: workData.taskId,
            user_phone: workData.userPhone,
            prompt: workData.prompt || workData.title || '社区作品',
            style: workData.style || 'unknown',
            duration: parsedDuration || 8,
            status: 'completed', // 直接标记为完成
            video_url: workData.videoUrl,
            thumbnail: workData.thumbnail,
          }]);
        
        if (taskError && taskError.code !== '23505') { // 忽略重复键错误
          console.warn('[PublishWork] Failed to create task record:', taskError);
          // 不抛出错误，继续发布作品
        } else {
          console.log('[PublishWork] Task record created successfully');
        }
      } else {
        console.log('[PublishWork] Task already exists:', workData.taskId);
      }
    } catch (taskCheckError: any) {
      console.warn('[PublishWork] Task check/creation error:', taskCheckError.message);
      // 继续尝试发布作品
    }

    // 🔧 解析 duration - 将 "8s" 转换为 8
    const parsedDuration = parseDuration(workData.duration);
    
    // 🔧 生成唯一ID（使用 crypto.randomUUID()）
    const workId = crypto.randomUUID();
    console.log('[PublishWork] Generated work ID:', workId);

    // 🔧 检查作品是否已存在（基于task_id去重）
    const { data: existingWork } = await supabase
      .from('works')
      .select('id, task_id')
      .eq('task_id', workData.taskId)
      .single();
    
    if (existingWork) {
      console.log('[PublishWork] Work already exists, updating instead:', existingWork.id);
      
      // 更新现有作品
      const { data: updatedWork, error: updateError } = await supabase
        .from('works')
        .update({
          title: workData.title,
          prompt: workData.prompt,
          style: workData.style,
          duration: parsedDuration,
          thumbnail: workData.thumbnail,
          video_url: workData.videoUrl,
          published_at: new Date().toISOString(),
        })
        .eq('id', existingWork.id)
        .select()
        .single();
      
      if (updateError) {
        console.error('[PublishWork] Update error:', updateError);
        throw updateError;
      }
      
      console.log('[PublishWork] ✅ Work updated successfully');
      
      return {
        success: true,
        workId: existingWork.id,
        work: updatedWork,
        isUpdate: true,
      };
    }

    // 🔧 插入��作品
    const { data: work, error: insertError } = await supabase
      .from('works')
      .insert([{
        id: workId,
        task_id: workData.taskId,
        user_phone: workData.userPhone,
        title: workData.title || '未命名作品',
        prompt: workData.prompt,
        style: workData.style,
        duration: parsedDuration,
        thumbnail: workData.thumbnail,
        video_url: workData.videoUrl,
        published_at: new Date().toISOString(),
      }])
      .select()
      .single();
    
    if (insertError) {
      console.error('[PublishWork] Insert error:', insertError);
      throw insertError;
    }
    
    console.log('[PublishWork] ✅ Work published successfully:', workId);
    
    return {
      success: true,
      workId: workId,
      work: work,
      isUpdate: false,
    };
  } catch (error: any) {
    console.error('[PublishWork] ❌ Error publishing work:', error);
    throw new Error(`Failed to publish work: ${error.message}`);
  }
}

console.log('[works.tsx] ✅ All works functions loaded');