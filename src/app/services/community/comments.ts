import { apiGet, apiPost } from '../../utils/apiClient';

/**
 * 获取作品评论
 */
export async function getComments(workId: string, page: number = 1, limit: number = 20) {
  try {
    const response = await apiGet(`/community/works/${workId}/comments?page=${page}&limit=${limit}`);
    
    if (response.success) {
      return response.data;
    }
    
    return {
      success: false,
      comments: [],
      error: response.error,
    };
  } catch (error: any) {
    return {
      success: false,
      comments: [],
      error: error.message,
    };
  }
}

/**
 * 添加评论
 */
export async function addComment(userPhone: string, workId: string, content: string) {
  try {
    const response = await apiPost(`/community/works/${workId}/comments`, {
      userPhone,
      content,
    });
    
    if (response.success) {
      return response.data;
    }
    
    return {
      success: false,
      error: response.error || '添加评论失败',
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message,
    };
  }
}