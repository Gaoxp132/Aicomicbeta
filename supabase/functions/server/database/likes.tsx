import { supabase } from './client.tsx';
import { getOrCreateUser } from './users.tsx';

// ==================== 点赞操作 ====================

export async function toggleLike(workId: string, userPhone: string) {
  try {
    // 确保用户存在
    await getOrCreateUser(userPhone);

    // 检查是否已点赞
    const { data: existingLike, error: checkError } = await supabase
      .from('likes')
      .select('id')
      .eq('work_id', workId)
      .eq('user_phone', userPhone)
      .single();

    if (existingLike) {
      // 已点赞，取消点赞
      const { error: deleteError } = await supabase
        .from('likes')
        .delete()
        .eq('work_id', workId)
        .eq('user_phone', userPhone);

      if (deleteError) throw deleteError;

      // 获取最新点赞数
      const { count } = await supabase
        .from('likes')
        .select('*', { count: 'exact', head: true })
        .eq('work_id', workId);

      return {
        isLiked: false,
        likes: count || 0,
      };
    } else {
      // 未点赞，添加点赞
      const { error: insertError } = await supabase
        .from('likes')
        .insert([{
          work_id: workId,
          user_phone: userPhone,
        }]);

      if (insertError) throw insertError;

      // 获取最新点赞数
      const { count } = await supabase
        .from('likes')
        .select('*', { count: 'exact', head: true })
        .eq('work_id', workId);

      return {
        isLiked: true,
        likes: count || 0,
      };
    }
  } catch (error) {
    console.error('Error toggling like:', error);
    throw error;
  }
}

export async function getLikeStatus(workId: string, userPhone: string) {
  try {
    const { data, error } = await supabase
      .from('likes')
      .select('id')
      .eq('work_id', workId)
      .eq('user_phone', userPhone)
      .single();

    const { count } = await supabase
      .from('likes')
      .select('*', { count: 'exact', head: true })
      .eq('work_id', workId);

    return {
      isLiked: !!data,
      likes: count || 0,
    };
  } catch (error) {
    console.error('Error getting like status:', error);
    throw error;
  }
}

// ✅ 新增：单独获取点赞状态（布尔值）
export async function isLiked(workId: string, userPhone: string): Promise<boolean> {
  try {
    const { data } = await supabase
      .from('likes')
      .select('id')
      .eq('work_id', workId)
      .eq('user_phone', userPhone)
      .single();

    return !!data;
  } catch (error) {
    return false;
  }
}

// ✅ 新增：单独获取点赞数量
export async function getLikesCount(workId: string): Promise<number> {
  try {
    const { count } = await supabase
      .from('likes')
      .select('*', { count: 'exact', head: true })
      .eq('work_id', workId);

    return count || 0;
  } catch (error) {
    return 0;
  }
}

// ✅ 新增：创建评论的别名函数（兼容旧代码）
export async function createComment(workId: string, userPhone: string, content: string) {
  const { addComment } = await import('./comments.tsx');
  return addComment({ workId, userPhone, content });
}