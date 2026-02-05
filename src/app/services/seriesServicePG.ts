/**
 * 漫剧服务 - PostgreSQL版本
 * 使用新的 routes_series_core.tsx API端点
 */

import { apiRequest } from '@/app/utils/apiClient';
import type { Series, SeriesFormData } from '@/app/types';

// ==================== 核心CRUD操作 ====================

/**
 * 获取用户的所有漫剧列表
 */
export async function getUserSeries(
  userPhone: string
): Promise<{ success: boolean; data?: Series[]; error?: string; count?: number }> {
  console.log('[SeriesServicePG] Getting user series for:', userPhone);
  console.log('[SeriesServicePG] 🔍 User phone details:', {
    value: userPhone,
    length: userPhone?.length,
    type: typeof userPhone,
  });

  try {
    const url = `/series?userPhone=${encodeURIComponent(userPhone)}`;
    console.log('[SeriesServicePG] 🌐 API Request URL:', url);
    
    const result = await apiRequest(url, {
      method: 'GET',
    });

    console.log('[SeriesServicePG] ✅ API Response:', {
      success: result.success,
      dataLength: result.data?.length,
      count: result.count,
      dataPreview: result.data?.slice(0, 2).map((s: any) => ({ id: s.id, title: s.title })),
    });
    
    return result;
  } catch (error: any) {
    console.error('[SeriesServicePG] Error fetching series:', error);
    return {
      success: false,
      error: error.message,
      data: [],
      count: 0,
    };
  }
}

/**
 * 获取单个漫剧的详细信息（包含角色、剧集、分镜、互动数据）
 * 🔥 v4.2.62: 分阶段加载优化
 * - 第一阶段：只加载基本信息和角色（立即显示）
 * - 第二阶段：懒加载前10集（用户能看到的）
 * - 按需加载：滚动时加载更多剧集
 */
export async function getSeriesDetails(
  seriesId: string,
  userPhone?: string,
  options?: {
    includeEpisodes?: boolean;     // 是否加载剧集，默认true
    episodesLimit?: number;        // 加载剧集数量，默认10
    episodesOffset?: number;       // 剧集偏移量，默认0
    includeStoryboards?: boolean;  // 是否加载分镜，默认false
  }
): Promise<{ success: boolean; data?: any; error?: string }> {
  const {
    includeEpisodes = true,
    episodesLimit = 10,
    episodesOffset = 0,
    includeStoryboards = false,
  } = options || {};

  console.log('[SeriesServicePG] 📖 Getting series details (optimized):', {
    seriesId,
    includeEpisodes,
    episodesLimit,
    episodesOffset,
    includeStoryboards,
  });

  try {
    // 🔥 构建查询参数
    const params = new URLSearchParams();
    if (userPhone) params.append('userPhone', userPhone);
    if (!includeEpisodes) params.append('includeEpisodes', 'false');
    if (episodesLimit !== 10) params.append('episodesLimit', String(episodesLimit));
    if (episodesOffset > 0) params.append('episodesOffset', String(episodesOffset));
    if (includeStoryboards) params.append('includeStoryboards', 'true');
    
    const url = `/series/${seriesId}?${params.toString()}`;
    
    const result = await apiRequest(url, {
      method: 'GET',
      // 🔥 分阶段加载后，超时可以大大缩短
      timeout: includeEpisodes && episodesLimit > 20 ? 60000 : 30000, // 少量数据30秒，大量数据60秒
      maxRetries: 3,
    });

    if (!result.success) {
      // 🔥 静默处理"not found"错误
      if (result.error?.includes('not found') || result.error?.includes('Series not found')) {
        console.warn('[SeriesServicePG] ⚠️ Series not found:', seriesId);
        return result;
      }
      
      // 🔥 静默处理离线状态（不显示错误）
      if (result.error === 'offline') {
        console.warn('[SeriesServicePG] ⚠️ Offline mode, series details unavailable:', seriesId);
        return result;
      }
      
      // 🔥 新增：静默处理连接超时错误
      if (result.error?.includes('timeout') || result.error?.includes('connection')) {
        console.warn('[SeriesServicePG] ⚠️ Connection timeout, entering offline mode:', seriesId);
        return {
          success: false,
          error: 'offline', // 标记为离线状态
        };
      }
      
      // 🔥 新增：静默处理Cloudflare 500错误
      if (result.error?.includes('500') || result.error?.includes('Internal server error')) {
        console.warn('[SeriesServicePG] ⚠️ Server error, entering offline mode:', seriesId);
        return {
          success: false,
          error: 'offline', // 标记为离线状态
        };
      }
      
      console.error('[SeriesServicePG] Error loading series:', result.error);
      return result;
    }

    console.log('[SeriesServicePG] ✅ Series details loaded:', {
      title: result.data?.title,
      characters: result.data?.characters?.length || 0,
      episodes: result.data?.episodes?.length || 0,
    });

    return result;
  } catch (error: any) {
    console.error('[SeriesServicePG] Error fetching series details:', error);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * 🆕 懒加载更多剧集
 */
export async function loadMoreEpisodes(
  seriesId: string,
  offset: number = 0,
  limit: number = 10,
  includeStoryboards: boolean = false
): Promise<{ success: boolean; data?: { episodes: any[]; total: number }; error?: string }> {
  console.log('[SeriesServicePG] 📄 Loading more episodes:', {
    seriesId,
    offset,
    limit,
    includeStoryboards,
  });

  try {
    const params = new URLSearchParams();
    params.append('episodesLimit', String(limit));
    params.append('episodesOffset', String(offset));
    if (includeStoryboards) params.append('includeStoryboards', 'true');
    
    const url = `/series/${seriesId}/episodes?${params.toString()}`;
    
    const result = await apiRequest(url, {
      method: 'GET',
      timeout: 20000, // 20秒足够
      maxRetries: 2,
    });

    return result;
  } catch (error: any) {
    console.error('[SeriesServicePG] Error loading more episodes:', error);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * 创建新漫剧（基础模式）
 */
export async function createSeries(
  formData: SeriesFormData,
  userPhone: string
): Promise<{ success: boolean; data?: Series; error?: string }> {
  console.log('[SeriesServicePG] Creating series from form data');

  try {
    const result = await apiRequest('/series', {
      method: 'POST',
      body: JSON.stringify({
        userPhone,
        title: formData.title,
        description: formData.description,
        genre: formData.genre,
        style: formData.style,
        totalEpisodes: formData.episodeCount,
        theme: formData.theme,
        storyOutline: formData.storyOutline,
      }),
    });

    console.log('[SeriesServicePG] ✅ Series created:', result.data?.id);
    return result;
  } catch (error: any) {
    console.error('[SeriesServicePG] Error creating series:', error);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * AI创建漫剧（从创意生成）
 */
export async function createSeriesFromIdea(
  userInput: string,
  userPhone: string,
  options?: {
    targetAudience?: string;
    preferredThemes?: string[];
    totalEpisodes?: number;
    scriptGenre?: string;
  }
): Promise<{ success: boolean; seriesId?: string; data?: Series; error?: string }> {
  console.log('[SeriesServicePG] 🎨 Creating series from idea');

  try {
    const result = await apiRequest('/series/create-from-idea', {
      method: 'POST',
      body: JSON.stringify({
        userPhone,
        userInput,
        targetAudience: options?.targetAudience || 'universal',
        preferredThemes: options?.preferredThemes || ['SELF_GROWTH', 'FAMILY_BONDS'],
        totalEpisodes: options?.totalEpisodes || 5,
        scriptGenre: options?.scriptGenre || '现实生活',
      }),
    });

    if (result.success && result.seriesId) {
      console.log('[SeriesServicePG] ✅ Series creation started:', result.seriesId);
      console.log('[SeriesServicePG] 📊 AI is generating content in background...');
    }

    return result;
  } catch (error: any) {
    console.error('[SeriesServicePG] Error creating series from idea:', error);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * 更新漫剧信息
 */
export async function updateSeries(
  seriesId: string,
  updates: Partial<Series>
): Promise<{ success: boolean; data?: Series; error?: string }> {
  console.log('[SeriesServicePG] Updating series:', seriesId);

  try {
    const result = await apiRequest(`/series/${seriesId}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });

    console.log('[SeriesServicePG] ✅ Series updated');
    return result;
  } catch (error: any) {
    console.error('[SeriesServicePG] Error updating series:', error);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * 删除漫剧
 */
export async function deleteSeries(
  seriesId: string
): Promise<{ success: boolean; error?: string }> {
  console.log('[SeriesServicePG] Deleting series:', seriesId);

  try {
    const result = await apiRequest(`/series/${seriesId}`, {
      method: 'DELETE',
    });

    console.log('[SeriesServicePG] ✅ Series deleted');
    return result;
  } catch (error: any) {
    console.error('[SeriesServicePG] Error deleting series:', error);
    return {
      success: false,
      error: error.message,
    };
  }
}

// ==================== 互动功能 ====================

/**
 * 切换点赞状态
 */
export async function toggleSeriesLike(
  seriesId: string,
  userPhone: string
): Promise<{ success: boolean; data?: { isLiked: boolean; likes: number }; error?: string }> {
  console.log('[SeriesServicePG] Toggling like for series:', seriesId);

  try {
    const result = await apiRequest(`/series/${seriesId}/like`, {
      method: 'POST',
      body: JSON.stringify({ userPhone }),
    });

    console.log('[SeriesServicePG] ✅ Like toggled:', result.data);
    return result;
  } catch (error: any) {
    console.error('[SeriesServicePG] Error toggling like:', error);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * 添加评论
 */
export async function addSeriesComment(
  seriesId: string,
  userPhone: string,
  content: string,
  parentId?: string
): Promise<{ success: boolean; data?: any; error?: string }> {
  console.log('[SeriesServicePG] Adding comment to series:', seriesId);

  try {
    const result = await apiRequest(`/series/${seriesId}/comment`, {
      method: 'POST',
      body: JSON.stringify({
        userPhone,
        content,
        parentId,
      }),
    });

    console.log('[SeriesServicePG] ✅ Comment added');
    return result;
  } catch (error: any) {
    console.error('[SeriesServicePG] Error adding comment:', error);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * 获取评论列表
 */
export async function getSeriesComments(
  seriesId: string,
  page: number = 1,
  limit: number = 20
): Promise<{ success: boolean; data?: any; error?: string }> {
  console.log('[SeriesServicePG] Getting comments for series:', seriesId);

  try {
    const result = await apiRequest(
      `/series/${seriesId}/comments?page=${page}&limit=${limit}`,
      {
        method: 'GET',
      }
    );

    console.log('[SeriesServicePG] ✅ Comments loaded:', result.data?.comments?.length || 0);
    return result;
  } catch (error: any) {
    console.error('[SeriesServicePG] Error getting comments:', error);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * 记录分享
 */
export async function recordSeriesShare(
  seriesId: string,
  userPhone: string,
  platform: 'link' | 'wechat' | 'weibo' | 'douyin' | 'other' = 'link'
): Promise<{ success: boolean; data?: { shares: number }; error?: string }> {
  console.log('[SeriesServicePG] Recording share for series:', seriesId);

  try {
    const result = await apiRequest(`/series/${seriesId}/share`, {
      method: 'POST',
      body: JSON.stringify({
        userPhone,
        platform,
      }),
    });

    console.log('[SeriesServicePG] ✅ Share recorded');
    return result;
  } catch (error: any) {
    console.error('[SeriesServicePG] Error recording share:', error);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * 更新观看历史
 */
export async function updateViewingHistory(data: {
  seriesId: string;
  episodeId: string;
  episodeNumber: number;
  userPhone: string;
  lastPosition?: number;
  duration?: number;
  completed?: boolean;
}): Promise<{ success: boolean; error?: string }> {
  console.log('[SeriesServicePG] Updating viewing history:', data.seriesId);

  try {
    const result = await apiRequest(`/series/${data.seriesId}/viewing-history`, {
      method: 'POST',
      body: JSON.stringify({
        userPhone: data.userPhone,
        episodeId: data.episodeId,
        episodeNumber: data.episodeNumber,
        lastPosition: data.lastPosition,
        duration: data.duration,
        completed: data.completed,
      }),
    });

    console.log('[SeriesServicePG] ✅ Viewing history updated');
    return result;
  } catch (error: any) {
    console.error('[SeriesServicePG] Error updating viewing history:', error);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * 获取用户的观看历史列表
 */
export async function getUserViewingHistory(
  userPhone: string,
  limit: number = 20
): Promise<{ success: boolean; data?: any[]; error?: string }> {
  console.log('[SeriesServicePG] Getting viewing history for user:', userPhone);

  try {
    const result = await apiRequest(
      `/viewing-history?userPhone=${userPhone}&limit=${limit}`,
      {
        method: 'GET',
      }
    );

    console.log('[SeriesServicePG] ✅ Viewing history loaded:', result.data?.length || 0);
    return result;
  } catch (error: any) {
    console.error('[SeriesServicePG] Error getting viewing history:', error);
    return {
      success: false,
      error: error.message,
      data: [],
    };
  }
}

// ==================== 轮询辅助函数 ====================

/**
 * 轮询漫剧生成进度
 * @param seriesId 漫剧ID
 * @param onProgress 进度回调函数
 * @param interval 轮询间隔（毫秒），默认3000ms
 * @returns 取消轮询的函数
 */
export function pollSeriesProgress(
  seriesId: string,
  userPhone: string,
  onProgress: (series: any) => void,
  interval: number = 3000
): () => void {
  let isPolling = true;
  let timeoutId: NodeJS.Timeout;

  const poll = async () => {
    if (!isPolling) return;

    try {
      const result = await getSeriesDetails(seriesId, userPhone);
      
      if (result.success && result.data) {
        onProgress(result.data);

        const status = result.data.status;
        
        // 如果生成完成或失败，停止轮询
        if (status === 'completed' || status === 'failed') {
          console.log('[SeriesServicePG] ⏹️ Polling stopped, status:', status);
          isPolling = false;
          return;
        }
      }

      // 继续轮询
      if (isPolling) {
        timeoutId = setTimeout(poll, interval);
      }
    } catch (error: any) {
      console.error('[SeriesServicePG] Polling error:', error);
      
      // 出错时继续轮询（可能是临时网络问题）
      if (isPolling) {
        timeoutId = setTimeout(poll, interval);
      }
    }
  };

  // 启动轮询
  poll();

  // 返回取消函数
  return () => {
    console.log('[SeriesServicePG] 🛑 Canceling polling');
    isPolling = false;
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  };
}