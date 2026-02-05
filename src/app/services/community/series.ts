/**
 * 社区漫剧系列相关API
 */

import { projectId, publicAnonKey } from '/utils/supabase/info';
import type { CommunitySeriesWork, PaginatedResponse, ApiResponse } from '@/app/types';

const BASE_URL = `https://${projectId}.supabase.co/functions/v1/make-server-fc31472c`;

/**
 * 获取社区漫剧系列列表
 */
export async function getCommunitySeries(params: {
  page?: number;
  limit?: number;
  sort?: 'latest' | 'popular';
  search?: string;
  userPhone?: string; // 添加用户手机号参数以获取点赞状态和播放历史
  since?: string; // 🆕 只获取此时间之后的新数据（ISO时间戳）
}): Promise<{
  success: boolean;
  data: CommunitySeriesWork[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
  error?: string;
}> {
  // 默认返回值
  const defaultResult = {
    success: false,
    data: [],
    total: 0,
    page: params.page || 1,
    limit: params.limit || 20,
    hasMore: false,
  };

  try {
    const queryParams = new URLSearchParams({
      page: String(params.page || 1),
      limit: String(params.limit || 20),
      sort: params.sort || 'latest',
      ...(params.search && { search: params.search }),
      ...(params.userPhone && { userPhone: params.userPhone }),
      ...(params.since && { since: params.since }), // 🆕 增量查询参数
    });

    const url = `${BASE_URL}/community/series?${queryParams}`;
    console.log('[community/series] 🚀 Fetching from:', url, params.since ? '(incremental)' : '(full)');

    // 🔥 重试机制：最多重试2次
    let lastError: Error | null = null;
    const maxRetries = 2;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          console.log(`[community/series] 🔄 Retry ${attempt + 1}/${maxRetries}`);
          // 指数退避
          await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, attempt - 1)));
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 60000); // 增加到60秒

        try {
          const response = await fetch(url, {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${publicAnonKey}`,
              'Content-Type': 'application/json',
            },
            signal: controller.signal,
          });

          clearTimeout(timeoutId);

          if (!response.ok) {
            const errorText = await response.text();
            console.error('[community/series] ❌ HTTP Error:', response.status, errorText);
            
            // 5xx错误值得重试，4xx错误不重试
            if (response.status >= 500 && attempt < maxRetries - 1) {
              lastError = new Error(`HTTP ${response.status}: ${response.statusText}`);
              continue;
            }
            
            return {
              ...defaultResult,
              error: `HTTP ${response.status}: ${response.statusText}`,
            };
          }

          const result = await response.json();
          console.log('[community/series] ✅ Fetched', result.data?.length || 0, 'items');

          return result;
        } catch (fetchError: any) {
          clearTimeout(timeoutId);
          throw fetchError;
        }
      } catch (fetchError: any) {
        lastError = fetchError;
        
        if (fetchError.name === 'AbortError') {
          console.error('[community/series] ⏰ Request timeout');
          if (attempt === maxRetries - 1) {
            return {
              ...defaultResult,
              error: '请求超时，请稍后重试',
            };
          }
        } else if (fetchError.message === 'Failed to fetch') {
          console.error('[community/series] 🔌 Network error (attempt', attempt + 1, '/', maxRetries, ')');
          if (attempt === maxRetries - 1) {
            return {
              ...defaultResult,
              error: '网络连接失败，请检查网络后重试',
            };
          }
        } else {
          // 其他错误不重试
          console.error('[community/series] ❌ Unexpected error:', fetchError.message);
          break;
        }
      }
    }
    
    // 所有重试都失败
    throw lastError || new Error('Unknown error');
  } catch (error: any) {
    console.error('[community/series] ❌ Error:', error);
    // 静默失败 - 返回空数组
    return {
      ...defaultResult,
      error: error.message || '加载失败',
    };
  }
}

/**
 * 获取单个漫剧系列详情
 */
export async function getSeriesDetail(
  seriesId: string,
  userPhone?: string
): Promise<{
  success: boolean;
  data?: CommunitySeriesWork;
  error?: string;
}> {
  try {
    const queryParams = userPhone ? `?userPhone=${userPhone}` : '';
    console.log('[community/series] Fetching series detail:', seriesId);

    const response = await fetch(`${BASE_URL}/community/series/${seriesId}${queryParams}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${publicAnonKey}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[community/series] Failed to fetch series detail:', response.status, errorText);
      throw new Error(`Failed to fetch series detail: ${response.statusText}`);
    }

    const result = await response.json();
    console.log('[community/series] Fetched series detail:', result.data?.id);

    return result;
  } catch (error: any) {
    console.error('[community/series] Error:', error);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * 点赞漫剧系列
 */
export async function likeSeries(seriesId: string, userPhone: string): Promise<ApiResponse<{
  isLiked: boolean;
  likes: number;
}>> {
  try {
    const response = await fetch(`${BASE_URL}/community/series/${seriesId}/like`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${publicAnonKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ userPhone }),
    });

    if (!response.ok) {
      throw new Error(`Failed to like series: ${response.statusText}`);
    }

    return await response.json();
  } catch (error: any) {
    console.error('[community/series] Like error:', error);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * 评论漫剧系列
 */
export async function commentSeries(
  seriesId: string,
  userPhone: string,
  content: string,
  parentId?: string
): Promise<ApiResponse> {
  try {
    const response = await fetch(`${BASE_URL}/community/series/${seriesId}/comment`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${publicAnonKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ userPhone, content, parentId }),
    });

    if (!response.ok) {
      throw new Error(`Failed to comment series: ${response.statusText}`);
    }

    return await response.json();
  } catch (error: any) {
    console.error('[community/series] Comment error:', error);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * 获取漫剧系列评论列表
 */
export async function getSeriesComments(
  seriesId: string,
  page: number = 1,
  limit: number = 20
): Promise<any> {
  try {
    const response = await fetch(
      `${BASE_URL}/community/series/${seriesId}/comments?page=${page}&limit=${limit}`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${publicAnonKey}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to get comments: ${response.statusText}`);
    }

    return await response.json();
  } catch (error: any) {
    console.error('[community/series] Get comments error:', error);
    return {
      success: false,
      data: [],
      error: error.message,
    };
  }
}

/**
 * 分享漫剧系列
 */
export async function shareSeries(
  seriesId: string,
  userPhone: string,
  platform: string = 'link'
): Promise<ApiResponse> {
  try {
    const response = await fetch(`${BASE_URL}/community/series/${seriesId}/share`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${publicAnonKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ userPhone, platform }),
    });

    if (!response.ok) {
      throw new Error(`Failed to share series: ${response.statusText}`);
    }

    return await response.json();
  } catch (error: any) {
    console.error('[community/series] Share error:', error);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * 增加漫剧系列浏览量
 */
export async function incrementSeriesViews(seriesId: string): Promise<ApiResponse> {
  try {
    const response = await fetch(`${BASE_URL}/community/series/${seriesId}/view`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${publicAnonKey}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to increment views: ${response.statusText}`);
    }

    return await response.json();
  } catch (error: any) {
    console.error('[community/series] Increment views error:', error);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * 更新播放历史
 */
export async function updateViewingHistory(data: {
  seriesId: string;
  episodeId: string;
  episodeNumber: number;
  userPhone: string;
  lastPosition?: number;
  duration?: number;
  completed?: boolean;
}): Promise<ApiResponse> {
  try {
    const response = await fetch(`${BASE_URL}/community/series/${data.seriesId}/viewing-history`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${publicAnonKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      throw new Error(`Failed to update viewing history: ${response.statusText}`);
    }

    return await response.json();
  } catch (error: any) {
    console.error('[community/series] Update viewing history error:', error);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * 获取播放历史
 */
export async function getViewingHistory(
  seriesId: string,
  userPhone: string
): Promise<ApiResponse<any>> {
  try {
    const response = await fetch(
      `${BASE_URL}/community/series/${seriesId}/viewing-history?userPhone=${userPhone}`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${publicAnonKey}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to get viewing history: ${response.statusText}`);
    }

    return await response.json();
  } catch (error: any) {
    console.error('[community/series] Get viewing history error:', error);
    return {
      success: false,
      error: error.message,
    };
  }
}