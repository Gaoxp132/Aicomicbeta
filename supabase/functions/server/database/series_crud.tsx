/**
 * 漫剧CRUD操作
 * Series级别的数据库操作
 */

import { supabase } from './client.tsx';
import type { Series } from '../types/series_types.tsx';

/**
 * 获取用户的所有漫剧列表
 * 🔥 增加重试机制处理连接超时
 */
export async function getUserSeries(userPhone: string, retryCount = 0): Promise<Series[]> {
  const MAX_RETRIES = 3;
  const RETRY_DELAY = 1000; // 1秒
  
  console.log(`[series_crud] 📋 getUserSeries: ${userPhone} (attempt ${retryCount + 1}/${MAX_RETRIES + 1})`);
  
  try {
    const { data, error } = await supabase
      .from('series')
      .select('*')
      .eq('user_phone', userPhone)
      .order('created_at', { ascending: false });
    
    if (error) {
      // 🔥 检查是否是连接错误，如果是则重试
      const isConnectionError = 
        error.message?.includes('upstream connect error') ||
        error.message?.includes('connection timeout') ||
        error.message?.includes('connection termination') ||
        error.message?.includes('connection reset') ||  // 🔥 v4.2.67: 添加connection reset
        error.message?.includes('reset before headers');
      
      if (isConnectionError && retryCount < MAX_RETRIES) {
        console.warn(`[series_crud] ⚠️ Connection error, retrying in ${RETRY_DELAY}ms... (${retryCount + 1}/${MAX_RETRIES})`);
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY * (retryCount + 1))); // 递增延迟
        return getUserSeries(userPhone, retryCount + 1);
      }
      
      console.error('[series_crud] ❌ Error getting user series:', error);
      throw error;
    }
    
    console.log(`[series_crud] ✅ Found ${data?.length || 0} series`);
    return data || [];
  } catch (error) {
    // 🔥 捕获网络错误并重试
    const errorMessage = error instanceof Error ? error.message : String(error);
    const isNetworkError = 
      errorMessage.includes('upstream connect error') ||
      errorMessage.includes('connection timeout') ||
      errorMessage.includes('connection termination') ||
      errorMessage.includes('connection reset') ||  // 🔥 v4.2.67: 添加connection reset
      errorMessage.includes('AbortError') ||
      errorMessage.includes('fetch failed');
    
    if (isNetworkError && retryCount < MAX_RETRIES) {
      console.warn(`[series_crud] ⚠️ Network error, retrying in ${RETRY_DELAY}ms... (${retryCount + 1}/${MAX_RETRIES})`);
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY * (retryCount + 1)));
      return getUserSeries(userPhone, retryCount + 1);
    }
    
    console.error('[series_crud] ❌ getUserSeries failed:', error);
    return [];
  }
}

/**
 * 获取单个漫剧基础信息（不含关联数据）
 * 🔥 增加重试机制处理连接超时
 */
export async function getSeries(seriesId: string, retryCount = 0): Promise<Series | null> {
  const MAX_RETRIES = 3;
  const RETRY_DELAY = 1000; // 1秒
  
  console.log(`[series_crud] 📖 getSeries: ${seriesId} (attempt ${retryCount + 1}/${MAX_RETRIES + 1})`);
  
  try {
    // 🔥 v4.2.67: 不使用 .single()，手动取第一个元素
    const { data: rows, error } = await supabase
      .from('series')
      .select('*')
      .eq('id', seriesId);
    
    // 🔥 v4.2.67: 手动提取第一个元素
    const data = rows && rows.length > 0 ? rows[0] : null;
    
    // 🔥 v4.2.67: 先打印原始响应
    console.log(`[series_crud] 🔍 RAW RESPONSE:`, {
      rows_type: typeof rows,
      rows_is_array: Array.isArray(rows),
      rows_length: rows?.length,
      data_type: typeof data,
      data_is_array: Array.isArray(data),
      data: data,
      error: error,
    });
    
    if (error) {
      if (error.message?.includes('not found') || error.code === 'PGRST116') {
        console.warn('[series_crud] ⚠️ Series not found:', seriesId);
        return null;
      }
      
      // 🔥 检查是否是连接错误，如果是则重试
      const isConnectionError = 
        error.message?.includes('upstream connect error') ||
        error.message?.includes('connection timeout') ||
        error.message?.includes('connection termination') ||
        error.message?.includes('connection reset') ||  // 🔥 v4.2.67: 添加connection reset
        error.message?.includes('reset before headers');
      
      if (isConnectionError && retryCount < MAX_RETRIES) {
        console.warn(`[series_crud] ⚠️ Connection error, retrying in ${RETRY_DELAY}ms... (${retryCount + 1}/${MAX_RETRIES})`);
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY * (retryCount + 1))); // 递增延迟
        return getSeries(seriesId, retryCount + 1);
      }
      
      console.error('[series_crud] ❌ Error getting series:', error);
      throw error;
    }
    
    // 🔥 v4.2.67: 详细日志 - 打印返回的数据
    console.log(`[series_crud] 📦 Raw data from DB:`, {
      id: data?.id,
      title: data?.title,
      total_episodes: data?.total_episodes,
      status: data?.status,
      has_total_episodes: 'total_episodes' in (data || {}),
      all_keys: Object.keys(data || {}),
    });
    
    console.log(`[series_crud] ✅ Found series: ${data.title}`);
    return data;
  } catch (error) {
    // 🔥 捕获网络错误并重试
    const errorMessage = error instanceof Error ? error.message : String(error);
    const isNetworkError = 
      errorMessage.includes('upstream connect error') ||
      errorMessage.includes('connection timeout') ||
      errorMessage.includes('connection termination') ||
      errorMessage.includes('connection reset') ||  // 🔥 v4.2.67: 添加connection reset
      errorMessage.includes('AbortError') ||
      errorMessage.includes('fetch failed');
    
    if (isNetworkError && retryCount < MAX_RETRIES) {
      console.warn(`[series_crud] ⚠️ Network error, retrying in ${RETRY_DELAY}ms... (${retryCount + 1}/${MAX_RETRIES})`);
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY * (retryCount + 1)));
      return getSeries(seriesId, retryCount + 1);
    }
    
    console.error('[series_crud] ❌ getSeries failed:', error);
    return null;
  }
}

/**
 * 创建新漫剧
 */
export async function createSeries(seriesData: Partial<Series>): Promise<Series> {
  console.log(`[series_crud] ➕ createSeries: ${seriesData.title}`);
  
  // 🔍 详细检查 Supabase 客户端
  if (!supabase) {
    const error = new Error('Supabase client is not initialized. Check SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables.');
    console.error('[series_crud] ❌ Supabase client missing!');
    throw error;
  }
  
  try {
    const { data, error } = await supabase
      .from('series')
      .insert(seriesData)
      .select()
      .single();
    
    if (error) {
      console.error('[series_crud] ❌ Error creating series:', {
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint,
      });
      throw error;
    }
    
    console.log(`[series_crud] ✅ Created series: ${data.id}`);
    return data;
  } catch (err: any) {
    console.error('[series_crud] ❌ Unexpected error in createSeries:', {
      message: err.message,
      stack: err.stack,
    });
    throw err;
  }
}

/**
 * 更新漫剧信息
 */
export async function updateSeries(
  seriesId: string,
  updates: Partial<Series>
): Promise<Series> {
  console.log(`[series_crud] ✏️ updateSeries: ${seriesId}`, updates);
  
  // 🔥 v4.2.67: 白名单 - 只允许这些字段
  const allowedFields = [
    'title', 'description', 'genre', 'style', 'theme', 'story_outline',
    'core_values', 'total_episodes', 'cover_image_url', 'status',
    'generation_progress', 'coherence_check', 'updated_at',
    'views', 'likes_count', 'comments_count', 'shares_count',
    'current_step', 'completed_steps', 'total_steps', 'error'  // 🔥 移除completed_episodes
  ];
  
  // 只保留白名单中的字段
  const cleanUpdates: any = {};
  for (const key of Object.keys(updates)) {
    if (allowedFields.includes(key)) {
      cleanUpdates[key] = (updates as any)[key];
    } else {
      console.warn(`[series_crud] ⚠️ Ignoring invalid field: ${key}`);
    }
  }
  
  console.log(`[series_crud] 🔍 Clean updates:`, cleanUpdates);
  
  // 🔥 v4.2.67: 额外验证 - 确保所有值都是有效的
  const finalUpdates: any = {};
  for (const [key, value] of Object.entries(cleanUpdates)) {
    // 过滤掉 undefined, null, 空对象
    if (value !== undefined && value !== null) {
      if (typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0) {
        console.warn(`[series_crud] ⚠️ Skipping empty object for key: ${key}`);
        continue;
      }
      finalUpdates[key] = value;
    } else {
      console.warn(`[series_crud] ⚠️ Skipping null/undefined for key: ${key}`);
    }
  }
  
  console.log(`[series_crud] 📤 Final updates to send:`, JSON.stringify(finalUpdates, null, 2));
  
  // 🔥 v4.2.67.2: 绕过Supabase JS客户端，直接使用REST API
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    const response = await fetch(`${supabaseUrl}/rest/v1/series?id=eq.${seriesId}`, {
      method: 'PATCH',
      headers: {
        'apikey': supabaseServiceKey!,
        'Authorization': `Bearer ${supabaseServiceKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation',
      },
      body: JSON.stringify(finalUpdates),
    });
    
    console.log(`[series_crud] 🔍 Direct REST response:`, {
      status: response.status,
      statusText: response.statusText,
      headers: Object.fromEntries(response.headers.entries()),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('[series_crud] ❌ REST API error:', errorText);
      throw new Error(`Update failed: ${response.status} ${errorText}`);
    }
    
    const rows = await response.json();
    console.log(`[series_crud] 📦 REST response data:`, rows);
    
    const data = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
    
    if (!data) {
      throw new Error(`Series ${seriesId} not found after update`);
    }
    
    console.log(`[series_crud] ✅ Updated series: ${seriesId}`);
    return data;
  } catch (restError: any) {
    console.error('[series_crud] ❌ Direct REST API failed:', restError);
    throw restError;
  }
}

/**
 * 更新漫剧生成进度
 */
export async function updateSeriesProgress(
  seriesId: string,
  progress: {
    status?: string;
    currentStep?: string;
    completedSteps?: number;
    totalSteps?: number;
    errorMessage?: string;
  }
): Promise<Series> {
  console.log(`[series_crud] 📊 updateSeriesProgress: ${seriesId}`, progress);
  
  // 🔥 v4.2.67: 修复 - generation_progress是JSONB字段，不是单独的列
  const updateData: any = {
    updated_at: new Date().toISOString(),
  };
  
  if (progress.status) {
    updateData.status = progress.status;
  }
  
  // 构建generation_progress JSONB对象
  const generationProgress: any = {};
  if (progress.currentStep) generationProgress.currentStep = progress.currentStep;
  if (progress.completedSteps !== undefined) generationProgress.completedSteps = progress.completedSteps;
  if (progress.totalSteps !== undefined) generationProgress.totalSteps = progress.totalSteps;
  if (progress.errorMessage) generationProgress.errorMessage = progress.errorMessage;
  
  if (Object.keys(generationProgress).length > 0) {
    updateData.generation_progress = generationProgress;
  }
  
  // 🔥 v4.2.67: 不使用 .single()，手动取第一个元素
  const { data: rows, error } = await supabase
    .from('series')
    .update(updateData)
    .eq('id', seriesId)
    .select('*');
  
  const data = rows && rows.length > 0 ? rows[0] : null;
  
  if (error) {
    console.error('[series_crud] ❌ Error updating series progress:', error);
    throw error;
  }
  
  console.log(`[series_crud] ✅ Updated series progress: ${seriesId}`);
  return data;
}

/**
 * 删除漫剧
 */
export async function deleteSeries(seriesId: string): Promise<void> {
  console.log(`[series_crud] 🗑️ deleteSeries: ${seriesId}`);
  
  const { error } = await supabase
    .from('series')
    .delete()
    .eq('id', seriesId);
  
  if (error) {
    console.error('[series_crud] ❌ Error deleting series:', error);
    throw error;
  }
  
  console.log(`[series_crud] ✅ Deleted series: ${seriesId}`);
}

/**
 * 获取漫剧详情（包含所有关联数据）
 * v4.2.55: 修复嵌套查询PGRST206错误
 */
export async function getSeriesWithDetails(seriesId: string): Promise<any> {
  console.log(`[series_crud] 🔍 getSeriesWithDetails: ${seriesId}`);
  
  try {
    // 获取基础信息
    const series = await getSeries(seriesId);
    if (!series) {
      console.error(`[series_crud] ❌ Series not found: ${seriesId}`);
      throw new Error('Series not found');
    }
    
    console.log(`[series_crud] ✅ Series found:`, {
      id: series.id,
      title: series.title,
      status: series.status,
      totalEpisodes: series.total_episodes,
    });
    
    // 获取角色列表
    const { data: characters, error: charactersError } = await supabase
      .from('series_characters')
      .select('*')
      .eq('series_id', seriesId)
      .order('created_at', { ascending: true });
    
    console.log(`[series_crud] 🎭 Characters query:`, {
      count: characters?.length || 0,
      hasError: !!charactersError,
      error: charactersError,
    });
    
    // 🔧 修复：分两步查询，避免嵌套查询PGRST206错误
    // 第一步：查询剧集
    const { data: episodesRaw, error: episodesError } = await supabase
      .from('series_episodes')
      .select('*')
      .eq('series_id', seriesId)
      .order('episode_number', { ascending: true });
    
    // 🔥 详细日志：检查episodes查询结果
    console.log(`[series_crud] 🔍 Episodes query result:`, {
      episodes_count: episodesRaw?.length || 0,
      has_error: !!episodesError,
      error: episodesError,
      error_details: episodesError ? {
        message: episodesError.message,
        code: (episodesError as any).code,
        details: (episodesError as any).details,
        hint: (episodesError as any).hint,
      } : null,
      raw_episodes: episodesRaw,
    });
    
    // 第二步：查询所有分镜（如果有剧集）
    let episodes = episodesRaw || [];
    if (episodes.length > 0) {
      const { data: storyboards, error: storyboardsError } = await supabase
        .from('series_storyboards')
        .select('*')
        .eq('series_id', seriesId)
        .order('episode_number', { ascending: true })
        .order('scene_number', { ascending: true });
      
      console.log(`[series_crud] 🎬 Storyboards query result:`, {
        storyboards_count: storyboards?.length || 0,
        has_error: !!storyboardsError,
        error: storyboardsError,
      });
      
      // 将分镜关联到对应的剧集
      if (storyboards && !storyboardsError) {
        episodes = episodes.map(episode => {
          const episodeStoryboards = storyboards.filter(
            sb => sb.episode_number === episode.episode_number
          );
          return {
            ...episode,
            storyboards: episodeStoryboards,
          };
        });
        
        console.log(`[series_crud] 🔗 Episodes with storyboards attached:`, {
          episodes_count: episodes.length,
          total_storyboards: storyboards.length,
        });
      }
    }
    
    if (episodes && episodes.length > 0) {
      console.log(`[series_crud] 📋 First episode sample:`, {
        id: episodes[0].id,
        series_id: episodes[0].series_id,
        episode_number: episodes[0].episode_number,
        title: episodes[0].title,
        has_storyboards: !!episodes[0].storyboards,
        storyboards_count: Array.isArray(episodes[0].storyboards) 
          ? episodes[0].storyboards.length 
          : 'not_array',
      });
    } else {
      console.warn(`[series_crud] ⚠️ WARNING: No episodes found for series ${seriesId}!`);
    }
    
    console.log(`[series_crud] ✅ Found series with ${characters?.length || 0} characters and ${episodes?.length || 0} episodes`);
    
    // 🔥 返回标准化的格式：{series, characters, episodes}
    return {
      series: series,
      characters: characters || [],
      episodes: episodes || [],
    };
  } catch (error) {
    console.error('[series_crud] ❌ getSeriesWithDetails failed:', error);
    throw error;
  }
}