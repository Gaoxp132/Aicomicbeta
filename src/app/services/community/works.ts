import { apiGet, apiPost } from '../../utils/apiClient';

/**
 * 获取社区作品列表
 */
export async function getCommunityWorks(params: {
  page?: number;
  limit?: number;
  category?: string;
  sort?: 'latest' | 'popular';
  search?: string;
  since?: string; // 🆕 增量刷新：只获取此时间之后的作品
}) {
  const { page = 1, limit = 20, category, sort = 'latest', search, since } = params;
  
  const queryParams = new URLSearchParams({
    page: page.toString(),
    limit: limit.toString(),
    sort,
  });
  
  if (category && category !== 'all') {
    queryParams.append('category', category);
  }
  
  if (search) {
    queryParams.append('search', search);
  }
  
  // 🆕 增量刷新参数
  if (since) {
    queryParams.append('since', since);
  }

  try {
    console.log('[getCommunityWorks] Fetching with params:', params);
    
    // 🚀 使用统一的增强API客户端（300秒超时 + 5次重试）
    const response = await apiGet(`/community/works?${queryParams.toString()}`);
    
    console.log('[getCommunityWorks] Raw response:', response);
    
    if (response.success) {
      // 🔧 直接检查response本身是否就是数据
      if (response.works) {
        console.log('[getCommunityWorks] ✅ Success (direct), works:', response.works?.length || 0);
        return response;
      }
      
      // 或者数据在response.data中
      if (response.data && response.data.works) {
        console.log('[getCommunityWorks] ✅ Success (nested), works:', response.data.works?.length || 0);
        return response.data;
      }
    }
    
    // API请求成功但没有数据
    console.warn('[getCommunityWorks] ⚠️ No data in response');
    return {
      success: false,
      works: [],
      total: 0,
      error: response.error || '未获取到数据',
    };
  } catch (error: any) {
    console.error('[getCommunityWorks] Error:', error);
    
    // 🔧 区分超时错误和其他错误
    const isTimeout = error.name === 'TimeoutError' || 
                     error.message?.includes('timeout') || 
                     error.message?.includes('timed out');
    
    return {
      success: false,
      works: [],
      total: 0,
      error: isTimeout 
        ? '数据加载超时，请检查网络连接或稍后重试' 
        : error.message,
    };
  }
}

/**
 * 发布作品到社区
 */
export async function publishToCommunity(data: {
  phone: string;
  taskId: string;
  title?: string;
  prompt?: string;
  style?: string;
  duration?: string;
  thumbnail?: string;
  videoUrl: string;
}) {
  try {
    const response = await apiPost('/community/publish', data);
    
    if (response.success) {
      return response.data;
    }
    
    return {
      success: false,
      error: response.error || '发布失败',
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * 获取用户的作品列表
 */
export async function getUserWorks(phone: string, page: number = 1, limit: number = 20) {
  try {
    const queryParams = new URLSearchParams({
      page: page.toString(),
      limit: limit.toString(),
    });
    
    console.log('[getUserWorks] Fetching works for:', phone);
    const response = await apiGet(`/community/user/${phone}/works?${queryParams.toString()}`);
    
    console.log('[getUserWorks] Raw response:', response);
    
    // 🔧 修复：统一返回格式
    if (response && response.success) {
      return {
        success: true,
        works: response.works || response.data?.works || [],
        total: response.total || response.data?.total || 0,
      };
    }
    
    return { 
      success: false, 
      works: [],
      total: 0,
      error: response?.error || 'Failed to fetch user works',
    };
  } catch (error: any) {
    console.error('[getUserWorks] Error:', error);
    return {
      success: false,
      works: [],
      total: 0,
      error: error.message,
    };
  }
}

/**
 * 清理异常任务（自动查询火山引擎并删除失败的任务）
 */
export async function cleanupFailedTasks() {
  try {
    console.log('[cleanupFailedTasks] Starting cleanup...');
    
    const response = await apiPost('/community/tasks/cleanup-failed', {});
    
    if (response.success && response.data) {
      console.log('[cleanupFailedTasks] ✅ Cleanup result:', response.data);
      return response.data;
    }
    
    return {
      success: false,
      error: response.error || '清理失败',
    };
  } catch (error: any) {
    console.error('[cleanupFailedTasks] Error:', error);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * 增加作品浏览量
 */
export async function incrementViews(workId: string) {
  try {
    const response = await apiPost(`/community/works/${workId}/increment-view`);
    
    if (response.success) {
      return response.data;
    }
    
    return {
      success: false,
      error: response.error,
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * 增加作品分享数
 */
export async function incrementShares(workId: string) {
  try {
    const response = await apiPost(`/community/works/${workId}/share`);
    
    if (response.success) {
      return response.data;
    }
    
    return {
      success: false,
      error: response.error,
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * 刷新视频URL（从火山引擎重新获取）
 */
export async function refreshVideoUrl(workId: string) {
  try {
    console.log('[refreshVideoUrl] Refreshing video URL for work:', workId);
    
    // 方案1：尝试使用新路由（如果部署了）
    try {
      const response = await apiPost(`/community/works/${workId}/refresh-video`);
      
      if (response.success && response.data) {
        console.log('[refreshVideoUrl] Successfully refreshed (new route):', response.data);
        return {
          success: true,
          videoUrl: response.data.videoUrl,
          thumbnailUrl: response.data.thumbnailUrl,
        };
      }
    } catch (newRouteError: any) {
      console.log('[refreshVideoUrl] New route not available, using fallback method');
    }
    
    // 方案2：Fallback - 先获取作品的task_id，然后查询任务状态
    console.log('[refreshVideoUrl] Using fallback method...');
    const worksResponse = await apiGet(`/community/works`);
    
    if (worksResponse.success && worksResponse.data?.works) {
      const work = worksResponse.data.works.find((w: any) => w.id === workId);
      
      if (work && work.task_id) {
        console.log('[refreshVideoUrl] Found task_id:', work.task_id);
        
        // 查询任务状态以获取最新的视��URL（使用正确的路由）
        const taskResponse = await apiGet(`/volcengine/status/${work.task_id}`);
        
        if (taskResponse.success && taskResponse.data) {
          const taskData = taskResponse.data;
          const newVideoUrl = taskData.content?.video_url || taskData.video_url || "";
          const newThumbnailUrl = taskData.content?.cover_url || taskData.cover_url || "";
          
          if (newVideoUrl) {
            console.log('[refreshVideoUrl] Successfully refreshed (fallback):', newVideoUrl);
            
            // 更新数据库
            await apiPost(`/community/publish`, {
              phone: work.user_phone,
              taskId: work.task_id,
              title: work.title,
              prompt: work.prompt,
              style: work.style,
              duration: work.duration,
              thumbnail: newThumbnailUrl || work.thumbnail,
              videoUrl: newVideoUrl,
            });
            
            return {
              success: true,
              videoUrl: newVideoUrl,
              thumbnailUrl: newThumbnailUrl,
            };
          }
        }
      }
    }
    
    console.error('[refreshVideoUrl] All methods failed');
    return {
      success: false,
      error: '无法刷新视频URL',
    };
  } catch (error: any) {
    console.error('[refreshVideoUrl] Exception:', error);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * 批量获取任务状态（仅查询指定的task_id列表）
 */
export async function getTaskStatus(taskIds: string[]) {
  try {
    if (!taskIds || taskIds.length === 0) {
      return {
        success: true,
        statuses: [],
      };
    }
    
    console.log(`[getTaskStatus] Fetching status for ${taskIds.length} tasks:`, taskIds);
    
    const response = await apiPost('/community/tasks/batch-status', { taskIds });
    
    if (response.success && response.data) {
      console.log(`[getTaskStatus] ✅ Received ${response.data.statuses?.length || 0} statuses`);
      return response.data;
    }
    
    return {
      success: false,
      statuses: [],
      error: response.error || '获取任务状态失败',
    };
  } catch (error: any) {
    console.error('[getTaskStatus] Error:', error);
    return {
      success: false,
      statuses: [],
      error: error.message,
    };
  }
}

/**
 * 🔄 手动重新生成失败的视频
 */
export async function retryVideo(taskId: string) {
  try {
    console.log(`[retryVideo] Retrying task: ${taskId}`);
    
    const response = await apiPost(`/volcengine/retry/${taskId}`, {});
    
    if (response.success && response.data) {
      console.log(`[retryVideo] ✅ Retry successful, new task:`, response.data.task_id);
      return {
        success: true,
        newTaskId: response.data.task_id,
      };
    }
    
    return {
      success: false,
      error: response.error || '重新生成失败',
    };
  } catch (error: any) {
    console.error('[retryVideo] Error:', error);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * 🔍 手动刷新单个视频的状态（从火山引擎查询最新状态）
 */
export async function refreshVideoStatus(taskId: string) {
  try {
    console.log(`[refreshVideoStatus] Refreshing status for task: ${taskId}`);
    
    const response = await apiGet(`/volcengine/status/${taskId}`);
    
    // 🔧 处理成功的响应
    if (response.success && response.data) {
      console.log(`[refreshVideoStatus] ✅ Status refreshed:`, response.data.data?.status);
      return {
        success: true,
        status: response.data.data?.status,
        videoUrl: response.data.data?.content?.video_url,
        thumbnail: response.data.data?.content?.cover_url,
      };
    }
    
    // 🔧 处理404错误（任务不存在）
    if (response.error === '任务不存在' || response.status === 'failed') {
      console.log(`[refreshVideoStatus] ⚠️ Task not found, marking as failed`);
      return {
        success: true,
        status: 'failed',
        error: response.message || '任务不存在',
      };
    }
    
    return {
      success: false,
      error: response.error || '刷新状态失败',
    };
  } catch (error: any) {
    console.error('[refreshVideoStatus] Error:', error);
    return {
      success: false,
      error: error.message,
    };
  }
}