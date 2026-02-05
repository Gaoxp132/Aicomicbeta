import { apiGet, apiPost } from '../../utils/apiClient';

/**
 * 切换点赞状态
 */
export async function toggleLike(userPhone: string, workId: string) {
  try {
    const response = await apiPost(`/community/works/${workId}/like`, {
      userPhone,
    });
    
    if (response.success) {
      return response.data;
    }
    
    return {
      success: false,
      error: response.error || '点赞操作失败',
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * 获取点赞状态
 */
export async function getLikeStatus(workId: string, userPhone: string) {
  try {
    const response = await apiGet(`/community/works/${workId}/like-status?userPhone=${userPhone}`);
    
    console.log('[getLikeStatus] Response:', response);
    
    // 🔧 修复：统一返回格式
    if (response && response.success) {
      return {
        success: true,
        isLiked: response.isLiked || response.data?.isLiked || false,
        likes: response.likes || response.data?.likes || 0,
      };
    }
    
    return {
      success: false,
      isLiked: false,
      likes: 0,
      error: response?.error || 'Failed to fetch like status',
    };
  } catch (error: any) {
    console.error('[getLikeStatus] Error:', error);
    return {
      success: false,
      isLiked: false,
      likes: 0,
      error: error.message,
    };
  }
}