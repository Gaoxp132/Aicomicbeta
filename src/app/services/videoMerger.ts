/**
 * 视频合并服务
 * 用于合并漫剧剧集的分镜视频
 */

import { projectId, publicAnonKey } from '/utils/supabase/info';

/**
 * 合并单个剧集的视频
 * 🆕 使用新的API端点，支持自动上传到OSS
 */
export async function mergeEpisodeVideos(
  seriesId: string,
  episodeId: string,
  userPhone?: string // 新增：可选的用户手机号
): Promise<{ success: boolean; data?: any; videoUrl?: string; error?: string }> {
  try {
    console.log('[VideoMerger] Merging videos for episode:', episodeId);

    const requestBody = userPhone ? { userPhone } : {};

    const response = await fetch(
      `https://${projectId}.supabase.co/functions/v1/make-server-fc31472c/episodes/${episodeId}/merge-videos`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${publicAnonKey}`,
        },
        body: JSON.stringify(requestBody),
      }
    );

    const result = await response.json();

    if (!response.ok || !result.success) {
      console.error('[VideoMerger] Error:', result);
      return {
        success: false,
        error: result.error || '合并失败',
      };
    }

    console.log('[VideoMerger] ✅ Episode videos merged successfully');
    console.log('[VideoMerger] Merged video URL:', result.data?.mergedVideoUrl);
    console.log('[VideoMerger] Playlist URL:', result.data?.playlistUrl);

    return {
      success: true,
      data: result.data,
      videoUrl: result.data?.mergedVideoUrl || result.data?.videoUrls?.[0],
    };
  } catch (error: any) {
    console.error('[VideoMerger] Exception:', error);
    return {
      success: false,
      error: error.message || '网络错误',
    };
  }
}

/**
 * 合并整个漫剧系列的所有剧集视频
 * 🆕 使用新的API端点，支持批量上传到OSS
 */
export async function mergeAllSeriesVideos(
  seriesId: string,
  userPhone: string
): Promise<{ success: boolean; mergedCount?: number; failedCount?: number; errors?: string[]; error?: string }> {
  try {
    console.log('[VideoMerger] Merging all videos for series:', seriesId);

    const response = await fetch(
      `https://${projectId}.supabase.co/functions/v1/make-server-fc31472c/series/${seriesId}/merge-all-videos`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${publicAnonKey}`,
        },
        body: JSON.stringify({ userPhone }),
      }
    );

    const result = await response.json();

    if (!response.ok) {
      console.error('[VideoMerger] Error:', result);
      return {
        success: false,
        error: result.error || '批量合并失败',
      };
    }

    console.log(`[VideoMerger] ✅ Series videos merged: ${result.data?.mergedCount || 0} succeeded, ${result.data?.failedCount || 0} failed`);

    return {
      success: result.success,
      mergedCount: result.data?.mergedCount || 0,
      failedCount: result.data?.failedCount || 0,
      errors: result.data?.errors || [],
    };
  } catch (error: any) {
    console.error('[VideoMerger] Exception:', error);
    return {
      success: false,
      error: error.message || '网络错误',
    };
  }
}

/**
 * 🆕 查询剧集合并状态
 */
export async function getEpisodeMergeStatus(
  episodeId: string
): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    const response = await fetch(
      `https://${projectId}.supabase.co/functions/v1/make-server-fc31472c/episodes/${episodeId}/merge-status`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${publicAnonKey}`,
        },
      }
    );

    const result = await response.json();

    if (!response.ok || !result.success) {
      return {
        success: false,
        error: result.error || '查询失败',
      };
    }

    return {
      success: true,
      data: result.data,
    };
  } catch (error: any) {
    console.error('[VideoMerger] Exception:', error);
    return {
      success: false,
      error: error.message || '网络错误',
    };
  }
}

/**
 * 🆕 修复单个剧集的M3U8视频
 * 重新转存视频到OSS并生成新的M3U8播放列表
 */
export async function repairEpisodeVideo(
  episodeId: string,
  userPhone: string
): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    console.log('[VideoMerger] Repairing video for episode:', episodeId);

    const response = await fetch(
      `https://${projectId}.supabase.co/functions/v1/make-server-fc31472c/episodes/${episodeId}/repair-video`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${publicAnonKey}`,
        },
        body: JSON.stringify({ userPhone }),
      }
    );

    const result = await response.json();

    if (!response.ok || !result.success) {
      console.error('[VideoMerger] Repair error:', result);
      return {
        success: false,
        error: result.error || '修复失败',
      };
    }

    console.log('[VideoMerger] ✅ Episode video repaired successfully');
    console.log('[VideoMerger] New M3U8 URL:', result.data?.merged_video_url);

    return {
      success: true,
      data: result.data,
    };
  } catch (error: any) {
    console.error('[VideoMerger] Repair exception:', error);
    return {
      success: false,
      error: error.message || '网络错误',
    };
  }
}