/**
 * v6.0.200: 视频尾帧提取工具
 * 从浏览器 <video> 元素中提取视频的最后一帧，用于场景间首尾帧衔接
 */

import { apiRequest } from '../utils';

/**
 * 从视频URL提取最后一帧图片（浏览器端 canvas 截帧）
 * @returns base64 data URL of the last frame, or null on failure
 */
export function extractLastFrame(videoUrl: string): Promise<string | null> {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.crossOrigin = 'anonymous';
    video.muted = true;
    video.preload = 'auto';

    const cleanup = () => {
      video.removeEventListener('loadedmetadata', onMetadata);
      video.removeEventListener('seeked', onSeeked);
      video.removeEventListener('error', onError);
      video.src = '';
      video.load();
    };

    const timeoutId = setTimeout(() => {
      cleanup();
      resolve(null);
    }, 15000);

    const onError = () => {
      clearTimeout(timeoutId);
      cleanup();
      resolve(null);
    };

    const onSeeked = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) { cleanup(); clearTimeout(timeoutId); resolve(null); return; }
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
        clearTimeout(timeoutId);
        cleanup();
        if (dataUrl.length < 2000) { resolve(null); return; }
        resolve(dataUrl);
      } catch {
        // CORS tainted canvas
        clearTimeout(timeoutId);
        cleanup();
        resolve(null);
      }
    };

    const onMetadata = () => {
      if (video.duration && isFinite(video.duration)) {
        video.currentTime = Math.max(0, video.duration - 0.5);
      } else {
        clearTimeout(timeoutId);
        cleanup();
        resolve(null);
      }
    };

    video.addEventListener('loadedmetadata', onMetadata, { once: true });
    video.addEventListener('seeked', onSeeked, { once: true });
    video.addEventListener('error', onError, { once: true });
    video.src = videoUrl;
  });
}

// 缓存已上传的 storyboardId，避免重复上传
const _uploadedIds = new Set<string>();

/**
 * 提取视频尾帧并上传到服务器（fire-and-forget）
 * 服务端OSS截帧会自动尝试，此函数是浏览器端的fallback
 */
export async function extractAndUploadLastFrame(
  videoUrl: string,
  seriesId: string,
  storyboardId: string,
): Promise<void> {
  if (_uploadedIds.has(storyboardId)) return;
  _uploadedIds.add(storyboardId);

  try {
    // 查找此分镜对应的 taskId
    const result = await apiRequest(`/series/${seriesId}/video-task-status`, {
      method: 'GET', timeout: 10000, maxRetries: 1, silent: true,
    });
    const tasks = result?.storyboardTasks as Record<string, { taskId?: string; lastFrameUrl?: string }> | undefined;
    const taskInfo = tasks?.[storyboardId];
    if (!taskInfo?.taskId) return;
    // 服务端已有尾帧则跳过
    if (taskInfo.lastFrameUrl) return;

    const dataUrl = await extractLastFrame(videoUrl);
    if (!dataUrl) return;

    await apiRequest(`/video-tasks/${taskInfo.taskId}/last-frame`, {
      method: 'POST',
      body: JSON.stringify({ lastFrameDataUrl: dataUrl }),
      timeout: 30000, maxRetries: 1,
    });
    console.log(`[LastFrame] ✅ Client uploaded last frame for ${storyboardId}`);
  } catch {
    // non-blocking
  }
}
