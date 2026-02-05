import { apiRequest } from '@/app/utils/apiClient';
import { API_BASE_URL } from '@/app/constants/api';
import { publicAnonKey } from '/utils/supabase/info';
import type { Series, SeriesFormData, Storyboard } from '@/app/types';

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * 测试服务器连接和路由加载状态
 */
export async function testServerStatus(): Promise<{
  success: boolean;
  modulesStatus?: any;
  seriesTestRoute?: any;
  directMethodTestRoute?: any;
  seriesGetRoute?: any;
  error?: string;
}> {
  try {
    console.log('[SeriesService] 🧪 Testing server status...');
    
    // Test 1: 检查模块加载状态
    const modulesResponse = await apiRequest('/modules-status', {
      method: 'GET',
    });
    
    console.log('[SeriesService] Modules status:', modulesResponse);
    
    // Test 2: 检查直接方法测试路由（在routes_video.tsx中直接注册）
    let directMethodTestResult = null;
    try {
      const directMethodResponse = await apiRequest('/series/test-direct-method', {
        method: 'GET',
      });
      console.log('[SeriesService] ✅ Direct method test route works:', directMethodResponse);
      directMethodTestResult = directMethodResponse;
    } catch (methodError: any) {
      console.error('[SeriesService] ❌ Direct method test route failed:', methodError);
    }
    
    // Test 3: 检查series测试路由（通过辅助函数注册）
    let seriesTestResult = null;
    try {
      const seriesTestResponse = await apiRequest('/series/test', {
        method: 'GET',
      });
      console.log('[SeriesService] ✅ Series test route works:', seriesTestResponse);
      seriesTestResult = seriesTestResponse;
    } catch (seriesError: any) {
      console.error('[SeriesService] ❌ Series test route failed:', seriesError);
    }
    
    // Test 4: 🎯 检查真正的GET /series路由（带空userPhone参数）
    let seriesGetResult = null;
    try {
      const seriesGetResponse = await apiRequest('/series?userPhone=test', {
        method: 'GET',
      });
      console.log('[SeriesService] ✅ Real GET /series route works:', seriesGetResponse);
      seriesGetResult = seriesGetResponse;
    } catch (getError: any) {
      console.error('[SeriesService] ❌ Real GET /series route failed:', getError);
    }
    
    return {
      success: true,
      modulesStatus: modulesResponse.data,
      directMethodTestRoute: directMethodTestResult,
      seriesTestRoute: seriesTestResult,
      seriesGetRoute: seriesGetResult,
    };
  } catch (error: any) {
    console.error('[SeriesService] Server status test failed:', error);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * 创建新漫剧（完整自动生成版）
 */
export async function createSeries(
  formData: SeriesFormData,
  userPhone: string
): Promise<ApiResponse<Series>> {
  try {
    console.log('[SeriesService] Creating series with auto-generation...');
    
    // 步骤1：创建漫剧基础信息
    const response = await fetch(`${API_BASE_URL}/series`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${publicAnonKey}`,
      },
      body: JSON.stringify({
        title: formData.title,
        description: formData.description,
        genre: formData.genre,
        style: formData.style,
        totalEpisodes: formData.episodeCount,
        storyOutline: formData.storyOutline,
        userPhone,
        theme: formData.theme,
        targetAudience: formData.targetAudience,
      }),
    });

    const result = await response.json();

    if (!result.success || !result.data) {
      throw new Error(result.error || '创建漫剧失败');
    }

    const newSeries = result.data;
    console.log('[SeriesService] Series created:', newSeries.id);

    // 步骤2：🚀 触发完整的AI自动生成（分集、分镜、视频）
    console.log('[SeriesService] 🚀 Triggering auto-generation...');
    
    // 异步调用，不等待完成
    triggerAutoGeneration(newSeries.id, formData, userPhone).catch(error => {
      console.error('[SeriesService] Auto-generation error:', error);
    });

    return {
      success: true,
      data: newSeries,
    };
  } catch (error: any) {
    console.error('[SeriesService] Error creating series:', error);
    return {
      success: false,
      error: error.message || '创建失败',
    };
  }
}

/**
 * 🆕 触发完整的AI自动生成（分集、分镜、视频）
 */
async function triggerAutoGeneration(
  seriesId: string,
  formData: SeriesFormData,
  userPhone: string
): Promise<void> {
  try {
    console.log('[SeriesService] 🎬 Starting full auto-generation for:', seriesId);
    
    const response = await fetch(`${API_BASE_URL}/series/${seriesId}/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${publicAnonKey}`,
      },
      body: JSON.stringify({
        userPhone,
        storyOutline: formData.storyOutline,
        totalEpisodes: formData.episodeCount,
        style: formData.style,
        enableAudio: false, // 可以根据需要配置
      }),
    });

    const result = await response.json();

    if (result.success) {
      console.log('[SeriesService] ✅ Auto-generation triggered successfully');
    } else {
      console.error('[SeriesService] ❌ Auto-generation failed:', result.error);
    }
  } catch (error: any) {
    console.error('[SeriesService] ❌ Failed to trigger auto-generation:', error);
    throw error;
  }
}

/**
 * AI分析故事大纲，生成角色和剧集
 */
export async function analyzeSeries(
  seriesId: string,
  storyOutline: string
): Promise<{ success: boolean; data?: any; error?: string }> {
  console.log('[SeriesService] Analyzing series story outline');

  return apiRequest(`/series/${seriesId}/analyze`, {
    method: 'POST',
    body: JSON.stringify({
      storyOutline,
    }),
  });
}

/**
 * 零基础创作：从简单想法生成完整漫剧
 */
export async function createSeriesFromIdea(
  userInput: string,
  userPhone: string,
  options?: {
    targetAudience?: 'youth' | 'adult' | 'family';
    preferredThemes?: string[];
    totalEpisodes?: number;
    scriptGenre?: string;
  }
): Promise<{ success: boolean; data?: Series; error?: string; seriesId?: string }> {
  console.log('[SeriesService] 🚀 Creating series from idea (progressive generation)');

  // 步骤1：创建漫剧框架
  const createResult = await apiRequest('/series/create-from-idea', {
    method: 'POST',
    body: JSON.stringify({
      userInput,
      userPhone,
      ...options,
    }),
  });

  if (!createResult.success) {
    console.error('[SeriesService] ❌ Failed to create series framework:', createResult.error);
    return createResult;
  }

  const seriesId = createResult.seriesId;
  console.log('[SeriesService] ✅ Series framework created:', seriesId);

  // 步骤2：标记为generating状态
  apiRequest(`/series/${seriesId}/generate`, {
    method: 'POST',
    body: JSON.stringify({}),
  }).catch(error => {
    console.error('[SeriesService] ⚠️ Failed to mark as generating:', error);
  });

  // 步骤3：立即开始渐进式生成
  console.log('[SeriesService] 🎨 Starting progressive generation...');
  processSeriesSteps(seriesId).catch(error => {
    console.error('[SeriesService] ⚠️ Progressive generation error:', error);
  });

  // 返回框架数据和seriesId
  return {
    success: true,
    seriesId,
    data: {
      id: seriesId,
      status: 'generating',
      // 其他字段会通过轮询获取
    } as any,
  };
}

/**
 * 渐进式处理生成步骤（轮询直到完成）
 */
async function processSeriesSteps(seriesId: string): Promise<void> {
  const maxAttempts = 50; // 增加到50次（因为有10个步骤，每个可能需要多次重试）
  let attempts = 0;
  let consecutiveErrors = 0;

  while (attempts < maxAttempts) {
    attempts++;
    
    try {
      console.log(`[SeriesService] 🔄 Processing step ${attempts}/${maxAttempts} for series:`, seriesId);
      
      const result = await apiRequest(`/series/${seriesId}/process-step`, {
        method: 'POST',
        body: JSON.stringify({}),
      });

      if (!result.success) {
        console.error('[SeriesService] ❌ Step processing failed:', result.error);
        consecutiveErrors++;
        
        // 如果连续失败3次，停止
        if (consecutiveErrors >= 3) {
          console.error('[SeriesService] ❌ Too many consecutive errors, stopping');
          break;
        }
        
        // 等待后重试
        await new Promise(resolve => setTimeout(resolve, 5000));
        continue;
      }

      // 重置错误计数
      consecutiveErrors = 0;

      // 🆕 检查是否在排队中
      if (result.queued) {
        console.log(`[SeriesService] ⏳ Series is queued at position ${result.queuePosition}, waiting...`);
        // 排队时等待5秒后重试
        await new Promise(resolve => setTimeout(resolve, 5000));
        continue;
      }

      if (result.completed) {
        console.log('[SeriesService] ✅ Series generation completed!');
        break;
      }

      console.log(`[SeriesService] ✅ Step completed: ${result.message || 'Processing...'}`);

      // 每步之间等待3秒（AI生成需要时间）
      await new Promise(resolve => setTimeout(resolve, 3000));

    } catch (error: any) {
      console.error('[SeriesService] ❌ Step processing error:', error.message);
      consecutiveErrors++;
      
      // 如果连续失败3次，停止
      if (consecutiveErrors >= 3) {
        console.error('[SeriesService] ❌ Too many consecutive errors, stopping');
        break;
      }
      
      // 等待后重试
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }

  if (attempts >= maxAttempts) {
    console.warn('[SeriesService] ⚠️ Reached max attempts, stopping progressive generation');
  }
}

/**
 * 重试创作失败的漫剧
 */
export async function retrySeries(
  seriesId: string,
  userPhone: string,
  storyOutline: string
): Promise<{ success: boolean; data?: any; error?: string }> {
  console.log('[SeriesService] Retrying series:', seriesId);

  // 🔄 重新调用分析接口，后端会重新处理
  return analyzeSeries(seriesId, storyOutline);
}

/**
 * 获取用户的所有漫剧
 */
export async function getUserSeries(
  userPhone: string
): Promise<{ success: boolean; data?: Series[]; error?: string }> {
  console.log('[SeriesService] Getting user series');

  return apiRequest(`/series?userPhone=${userPhone}`, {
    method: 'GET',
  });
}

/**
 * 获取单个漫剧详情
 */
export async function getSeries(
  seriesId: string
): Promise<{ success: boolean; data?: Series; error?: string }> {
  console.log('[SeriesService] 🔍 Getting series:', seriesId);

  const result = await apiRequest(`/series/${seriesId}`, {
    method: 'GET',
  });
  
  // 🔥 详细日志：检查返回的数据结构
  if (result.success && result.data) {
    console.log('[SeriesService] ✅ Series data received:', {
      id: result.data.id,
      title: result.data.title,
      episodes_array_length: result.data.episodes?.length || 0,
      characters_array_length: result.data.characters?.length || 0,
      stats: result.data.stats,
      // 🔥 新增：检查完整的响应数据结构
      all_keys: Object.keys(result.data),
      has_episodes_key: 'episodes' in result.data,
      episodes_type: typeof result.data.episodes,
      episodes_is_array: Array.isArray(result.data.episodes),
      // 完整数据（用于调试）
      full_data: result.data,
    });
    
    // 检查episodes是否为空
    if (!result.data.episodes || result.data.episodes.length === 0) {
      console.warn('[SeriesService] ⚠️ WARNING: episodes array is empty!');
      console.warn('[SeriesService] 但stats显示episodesCount:', result.data.stats?.episodesCount);
    }
    
    // 检查characters是否为空
    if (!result.data.characters || result.data.characters.length === 0) {
      console.warn('[SeriesService] ⚠️ WARNING: characters array is empty!');
      console.warn('[SeriesService] 但stats显示charactersCount:', result.data.stats?.charactersCount);
    }
  } else {
    console.error('[SeriesService] ❌ Failed to get series:', result.error);
  }
  
  return result;
}

/**
 * 获取漫剧创作进度
 */
export async function getSeriesProgress(
  seriesId: string
): Promise<{ success: boolean; data?: Series; error?: string }> {
  console.log('[SeriesService] Getting series progress:', seriesId);

  return apiRequest(`/series/${seriesId}/progress`, {
    method: 'GET',
  });
}

/**
 * 更新漫剧
 */
export async function updateSeries(
  seriesId: string,
  updates: Partial<Series>
): Promise<{ success: boolean; data?: Series; error?: string }> {
  console.log('[SeriesService] Updating series:', seriesId);

  return apiRequest(`/series/${seriesId}`, {
    method: 'PUT',
    body: JSON.stringify(updates),
  });
}

/**
 * 删除漫剧
 */
export async function deleteSeries(
  seriesId: string,
  userPhone: string
): Promise<{ success: boolean; error?: string }> {
  console.log('[SeriesService] Deleting series:', seriesId);

  return apiRequest(`/series/${seriesId}`, {
    method: 'DELETE',
    body: JSON.stringify({ userPhone }),
  });
}

/**
 * 批量更新分镜状态
 */
export async function updateStoryboardsStatus(
  seriesId: string,
  episodeId: string,
  storyboards: Storyboard[]
): Promise<void> {
  // 获取最新的series数据
  const { success, data: series } = await getSeries(seriesId);
  if (!success || !series) {
    console.error('[SeriesService] Failed to fetch series for update');
    return;
  }

  // 更新episode中的storyboards
  const updatedEpisodes = series.episodes.map((ep) => {
    if (ep.id === episodeId) {
      return {
        ...ep,
        storyboards,
        updatedAt: new Date(),
      };
    }
    return ep;
  });

  // 保存更新
  await updateSeries(seriesId, {
    episodes: updatedEpisodes,
  });
}