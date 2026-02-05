import { supabase } from './client.tsx';
import { getOrCreateUser } from './users.tsx';

// ==================== 评论操作 ====================
// 最后更新: 2025-01-22 - 添加 deleteComment 函数

export async function addComment(commentData: {
  workId: string;
  userPhone: string;
  content: string;
  parentId?: string;
}) {
  try {
    // 确保用户存在
    await getOrCreateUser(commentData.userPhone);

    const { data, error } = await supabase
      .from('comments')
      .insert([{
        work_id: commentData.workId,
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

    // 格式化返回数据
    return {
      ...data,
      user: data.users,
    };
  } catch (error) {
    console.error('Error adding comment:', error);
    throw error;
  }
}

export async function getComments(workId: string, page: number = 1, limit: number = 20) {
  try {
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    const { data, error, count } = await supabase
      .from('comments')
      .select(`
        *,
        users!inner(phone, nickname, avatar_url)
      `, { count: 'exact' })
      .eq('work_id', workId)
      .is('parent_id', null)
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) throw error;

    // 获取所有评论的回复
    const commentIds = data?.map((c: any) => c.id) || [];
    const { data: replies } = await supabase
      .from('comments')
      .select(`
        *,
        users!inner(phone, nickname, avatar_url)
      `)
      .in('parent_id', commentIds)
      .order('created_at', { ascending: true });

    // 格式化数据
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
    console.error('Error getting comments:', error);
    throw error;
  }
}

export async function deleteComment(commentId: string, userPhone: string) {
  try {
    // 验证评论所有权
    const { data: comment, error: fetchError } = await supabase
      .from('comments')
      .select('user_phone')
      .eq('id', commentId)
      .single();

    if (fetchError) throw fetchError;
    
    if (comment.user_phone !== userPhone) {
      throw new Error('Unauthorized: You can only delete your own comments');
    }

    // 删除评论（级联删除回复）
    const { error: deleteError } = await supabase
      .from('comments')
      .delete()
      .eq('id', commentId);

    if (deleteError) throw deleteError;

    return { success: true };
  } catch (error) {
    console.error('Error deleting comment:', error);
    throw error;
  }
}