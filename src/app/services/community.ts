/**
 * Community Service - Works, series, profiles, interactions
 * Split from consolidated services/index.ts (v6.0.68)
 */

import { apiPost, apiGet } from '../utils';
import type { ApiResponse, CommunitySeriesWork } from '../types';

export async function getCommunityWorks(params: {
  page?: number; limit?: number; category?: string;
  sort?: 'latest' | 'popular'; search?: string; since?: string;
}) {
  const { page = 1, limit = 20, category, sort = 'latest', search, since } = params;
  const queryParams = new URLSearchParams({ page: page.toString(), limit: limit.toString(), sort });
  if (category && category !== 'all') queryParams.append('category', category);
  if (search) queryParams.append('search', search);
  if (since) queryParams.append('since', since);
  try {
    const response = await apiGet(`/community/works?${queryParams.toString()}`);
    if (response.success) {
      if (response.works) return response;
      if (response.data && response.data.works) return response.data;
    }
    return { success: false, works: [], total: 0, error: response.error || '未获取到数据' };
  } catch (error: any) {
    const isTimeout = error.name === 'TimeoutError' || error.message?.includes('timeout') || error.message?.includes('timed out');
    return { success: false, works: [], total: 0, error: isTimeout ? '数据加载超时，请检查网络连接或稍后重试' : error.message };
  }
}

export async function publishToCommunity(data: {
  phone: string; taskId: string; title?: string; prompt?: string;
  style?: string; duration?: string; thumbnail?: string; videoUrl: string;
}) {
  try {
    const response = await apiPost('/community/publish', data);
    if (response.success) return response.data;
    return { success: false, error: response.error || '发布失败' };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function getUserWorks(phone: string, page: number = 1, limit: number = 20) {
  try {
    const queryParams = new URLSearchParams({ page: page.toString(), limit: limit.toString() });
    const response = await apiGet(`/community/user/${phone}/works?${queryParams.toString()}`);
    if (response && response.success) {
      return { success: true, works: response.works || response.data?.works || [], total: response.total || response.data?.total || 0 };
    }
    return { success: false, works: [], total: 0, error: response?.error || 'Failed to fetch user works' };
  } catch (error: any) {
    console.error('[getUserWorks] Error:', error);
    return { success: false, works: [], total: 0, error: error.message };
  }
}

export async function incrementViews(workId: string) {
  try {
    const response = await apiPost(`/community/works/${workId}/increment-view`);
    if (response.success) return response.data;
    return { success: false, error: response.error };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function incrementShares(workId: string) {
  try {
    const response = await apiPost(`/community/works/${workId}/share`);
    if (response.success) return response.data;
    return { success: false, error: response.error };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function refreshVideoUrl(workId: string) {
  try {
    try {
      const response = await apiPost(`/community/works/${workId}/refresh-video`);
      if (response.success && response.data) {
        return { success: true, videoUrl: response.data.videoUrl, thumbnailUrl: response.data.thumbnailUrl };
      }
    } catch (_newRouteError: any) { /* fallback */ }
    const worksResponse = await apiGet(`/community/works`);
    if (worksResponse.success && worksResponse.data?.works) {
      const work = worksResponse.data.works.find((w: any) => w.id === workId);
      if (work && work.task_id) {
        const taskResponse = await apiGet(`/volcengine/status/${work.task_id}`);
        if (taskResponse.success && taskResponse.data) {
          const taskData = taskResponse.data;
          const newVideoUrl = taskData.content?.video_url || taskData.video_url || "";
          const newThumbnailUrl = taskData.content?.cover_url || taskData.cover_url || "";
          if (newVideoUrl) {
            await apiPost(`/community/publish`, {
              phone: work.user_phone, taskId: work.task_id, title: work.title,
              prompt: work.prompt, style: work.style, duration: work.duration,
              thumbnail: newThumbnailUrl || work.thumbnail, videoUrl: newVideoUrl,
            });
            return { success: true, videoUrl: newVideoUrl, thumbnailUrl: newThumbnailUrl };
          }
        }
      }
    }
    return { success: false, error: '无法刷新视频URL' };
  } catch (error: any) {
    console.error('[refreshVideoUrl] Exception:', error);
    return { success: false, error: error.message };
  }
}

export async function getTaskStatus(taskIds: string[]) {
  try {
    if (!taskIds || taskIds.length === 0) return { success: true, statuses: [] };
    const response = await apiPost('/community/tasks/batch-status', { taskIds });
    if (response.success && response.data) return response.data;
    return { success: false, statuses: [], error: response.error || '获取任务状态失败' };
  } catch (error: any) {
    console.error('[getTaskStatus] Error:', error);
    return { success: false, statuses: [], error: error.message };
  }
}

export async function retryVideo(taskId: string) {
  try {
    const response = await apiPost(`/volcengine/retry/${taskId}`, {});
    if (response.success && response.data) return { success: true, newTaskId: response.data.task_id };
    return { success: false, error: response.error || '重新生成失败' };
  } catch (error: any) {
    console.error('[retryVideo] Error:', error);
    return { success: false, error: error.message };
  }
}

export async function getUserProfile(userPhone: string) {
  try {
    const response = await apiGet(`/user/profile/${userPhone}`);
    if (response && response.success) {
      const user = (response as any).user || response.data;
      return {
        success: true,
        user: {
          phone: user?.phone || userPhone,
          nickname: user?.username || user?.nickname || `用户${userPhone.slice(-4)}`,
          avatar: user?.avatarUrl || user?.avatar_url || user?.avatar || '',
        },
      };
    }
    return { success: false, error: response?.error || 'Failed to fetch user profile' };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function toggleLike(userPhone: string, workId: string) {
  try {
    const response = await apiPost(`/community/works/${workId}/like`, { userPhone });
    if (response.success) return response.data;
    return { success: false, error: response.error || '点赞操作失败' };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function getLikeStatus(workId: string, userPhone: string) {
  try {
    const response = await apiGet(`/community/works/${workId}/like-status?userPhone=${userPhone}`);
    if (response && response.success) {
      return {
        success: true,
        isLiked: response.isLiked || response.data?.isLiked || false,
        likes: response.likes || response.data?.likes || 0,
      };
    }
    return { success: false, isLiked: false, likes: 0, error: response?.error || 'Failed to fetch like status' };
  } catch (error: any) {
    return { success: false, isLiked: false, likes: 0, error: error.message };
  }
}

export async function getComments(workId: string, page: number = 1, limit: number = 20) {
  try {
    const response = await apiGet(`/community/works/${workId}/comments?page=${page}&limit=${limit}`);
    if (response.success) return response.data;
    return { success: false, comments: [], error: response.error };
  } catch (error: any) {
    return { success: false, comments: [], error: error.message };
  }
}

export async function addComment(userPhone: string, workId: string, content: string) {
  try {
    const response = await apiPost(`/community/works/${workId}/comments`, { userPhone, content });
    if (response.success) return response.data;
    return { success: false, error: response.error || '添加评论失败' };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function getCommunitySeries(params: {
  page?: number; limit?: number; sort?: 'latest' | 'popular';
  search?: string; userPhone?: string; since?: string;
}): Promise<{
  success: boolean; data: CommunitySeriesWork[]; total: number;
  page: number; limit: number; hasMore: boolean; error?: string;
}> {
  const defaultResult = {
    success: false, data: [] as CommunitySeriesWork[], total: 0,
    page: params.page || 1, limit: params.limit || 20, hasMore: false,
  };
  try {
    const queryParams = new URLSearchParams({
      page: String(params.page || 1), limit: String(params.limit || 20), sort: params.sort || 'latest',
    });
    if (params.search) queryParams.append('search', params.search);
    if (params.userPhone) queryParams.append('userPhone', params.userPhone);
    if (params.since) queryParams.append('since', params.since);
    const response = await apiGet(`/community/series?${queryParams}`, { timeout: 60000, maxRetries: 2 });
    if (response.success) {
      return {
        success: true, data: response.data || [],
        total: (response as any).total || response.data?.length || 0,
        page: (response as any).page || params.page || 1,
        limit: (response as any).limit || params.limit || 20,
        hasMore: (response as any).hasMore || false,
      };
    }
    return { ...defaultResult, error: response.error || '加载失败' };
  } catch (error: any) {
    return { ...defaultResult, error: error.message || '加载失败' };
  }
}

export async function getSeriesDetail(seriesId: string, userPhone?: string): Promise<{ success: boolean; data?: CommunitySeriesWork; error?: string; }> {
  try {
    const queryParams = userPhone ? `?userPhone=${userPhone}` : '';
    const response = await apiGet(`/community/series/${seriesId}${queryParams}`, { timeout: 30000, maxRetries: 2 });
    if (response.success) return { success: true, data: response.data };
    return { success: false, error: response.error || '获取详情失败' };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function likeSeries(seriesId: string, userPhone: string): Promise<any> {
  try {
    const response = await apiPost(`/community/works/${seriesId}/like`, { userPhone });
    if (response.success) {
      return {
        success: true,
        isLiked: (response as any).isLiked ?? response.data?.isLiked ?? true,
        likes: (response as any).likes ?? response.data?.likes ?? 0,
      };
    }
    return { success: false, error: response.error || '点赞失败' };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function commentSeries(seriesId: string, userPhone: string, content: string, parentId?: string): Promise<ApiResponse> {
  try {
    const response = await apiPost(`/community/works/${seriesId}/comments`, { userPhone, content, parentId });
    return response;
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function getSeriesComments(seriesId: string, page: number = 1, limit: number = 20): Promise<any> {
  try {
    const response = await apiGet(`/community/works/${seriesId}/comments?page=${page}&limit=${limit}`, { silent: true });
    if (response.success) return { success: true, data: response.data || (response as any).comments || [] };
    return { success: false, data: [], error: response.error };
  } catch (error: any) {
    return { success: false, data: [], error: error.message };
  }
}

export async function shareSeries(seriesId: string, userPhone?: string, platform: string = 'link'): Promise<ApiResponse> {
  try {
    await apiPost(`/series/${seriesId}/share`, { userPhone, platform });
    return { success: true };
  } catch (_error: any) {
    return { success: true }; // Non-critical
  }
}

export async function incrementSeriesViews(seriesId: string): Promise<ApiResponse> {
  try {
    await apiPost(`/community/works/${seriesId}/increment-view`, {}, { silent: true });
    return { success: true };
  } catch {
    return { success: true }; // Non-critical
  }
}

export async function updateViewingHistory(data: {
  seriesId: string; episodeId?: string; episodeNumber?: number;
  userPhone: string; lastPosition?: number; duration?: number; completed?: boolean;
}): Promise<ApiResponse> {
  try {
    const response = await apiPost(`/series/${data.seriesId}/viewing-history`, {
      userPhone: data.userPhone, lastEpisode: data.episodeNumber || 1, progress: data.lastPosition || 0,
    }, { silent: true });
    return response;
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function updateUserProfile(userPhone: string, data: { nickname?: string; avatar?: string }) {
  try {
    const response = await apiPost(`/user/profile/${userPhone}`, data);
    if (response.success) return { success: true };
    return { success: false, error: response.error || '更新失败' };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}