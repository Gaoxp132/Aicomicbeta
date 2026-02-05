/**
 * 漫剧视频生成和编辑服务
 */

import { projectId, publicAnonKey } from '/utils/supabase/info';
import type { Storyboard } from '@/app/types';

const API_BASE_URL = `https://${projectId}.supabase.co/functions/v1/make-server-fc31472c`;

async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<{ success: boolean; data?: T; error?: string }> {
  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${publicAnonKey}`,
        ...options.headers,
      },
    });

    const result = await response.json();
    return result;
  } catch (error: any) {
    console.error('[SeriesVideoService] API request failed:', error);
    return {
      success: false,
      error: error.message || 'Network error',
    };
  }
}

/**
 * 为单个分镜生成视频
 */
export async function generateStoryboardVideo(
  seriesId: string,
  userPhone: string,
  storyboard: Storyboard
): Promise<string> {
  console.log('[SeriesVideoService] Generating video for storyboard:', storyboard.id);

  const response = await apiRequest<{ videoUrl: string }>(`/series/storyboards/${storyboard.id}/generate-video`, {
    method: 'POST',
    body: JSON.stringify({
      userPhone,
      seriesId,
      prompt: storyboard.description,
      style: 'comic', // 默认漫画风格
      duration: storyboard.duration || 8,
    }),
  });

  if (!response.success || !response.data?.videoUrl) {
    throw new Error(response.error || '视频生成失败');
  }

  return response.data.videoUrl;
}