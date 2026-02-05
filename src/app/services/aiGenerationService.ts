/**
 * AI生成服务
 * 处理AI生成剧集、分镜、完整生成等功能
 */

import { apiClient } from '@/app/utils/optimizedApiClient';

/**
 * AI生成剧集
 */
export async function generateEpisodesAI(seriesId: string, totalEpisodes: number) {
  try {
    console.log(`[AI Service] 📚 Generating ${totalEpisodes} episodes for series: ${seriesId}`);
    
    const response = await apiClient.post(
      `/series/${seriesId}/generate-episodes-ai`,
      { totalEpisodes }
    );
    
    if (response.success) {
      console.log(`[AI Service] ✅ Generated ${response.data.count} episodes`);
      return {
        success: true,
        data: response.data
      };
    } else {
      throw new Error(response.error || 'AI生成剧集失败');
    }
  } catch (error: any) {
    console.error('[AI Service] ❌ Generate episodes error:', error);
    return {
      success: false,
      error: error.message || 'AI生成剧集失败'
    };
  }
}

/**
 * AI生成分镜
 */
export async function generateStoryboardsAI(episodeId: string, sceneCount: number = 10) {
  try {
    console.log(`[AI Service] 🎬 Generating ${sceneCount} storyboards for episode: ${episodeId}`);
    
    const response = await apiClient.post(
      `/episodes/${episodeId}/generate-storyboards-ai`,
      { sceneCount }
    );
    
    if (response.success) {
      console.log(`[AI Service] ✅ Generated ${response.data.count} storyboards`);
      return {
        success: true,
        data: response.data
      };
    } else {
      throw new Error(response.error || 'AI生成分镜失败');
    }
  } catch (error: any) {
    console.error('[AI Service] ❌ Generate storyboards error:', error);
    return {
      success: false,
      error: error.message || 'AI生成分镜失败'
    };
  }
}

/**
 * 一键完整生成
 */
export async function generateFullAI(seriesId: string, userPhone: string, onProgress?: (status: string) => void) {
  try {
    console.log(`[AI Service] 🚀 Starting full AI generation for series: ${seriesId}`);
    
    if (onProgress) onProgress('正在启动完整生成流程...');
    
    const response = await apiClient.post(
      `/series/${seriesId}/generate-full-ai`,
      { userPhone }
    );
    
    if (response.success) {
      console.log('[AI Service] ✅ Full generation completed:', response.data.stats);
      return {
        success: true,
        data: response.data
      };
    } else {
      throw new Error(response.error || '一键完整生成失败');
    }
  } catch (error: any) {
    console.error('[AI Service] ❌ Full generation error:', error);
    return {
      success: false,
      error: error.message || '一键完整生成失败'
    };
  }
}