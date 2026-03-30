/**
 * v6.0.202: 视频尾帧提取工具
 * 从浏览器 <video> 元素中提取视频的最后一帧，用于场景间首尾帧衔接
 * canvas 失败时（Volcengine CDN CORS）回退到服务端 OSS 截帧
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

// v6.0.203: 按 taskId 去重，避免同一 storyboard 重生成后被错误拦截
const _processedTaskIds = new Set<string>();
const _inflightTaskIds = new Set<string>();

/**
 * 提取视频尾帧并上传到服务器
 * 优先级: 1) 客户端 canvas 截帧（OSS 视频，CORS 已配置）
 *         2) 服务端 OSS 截帧触发（canvas CORS 失败时的回退）
 */
export async function extractAndUploadLastFrame(
  videoUrl: string,
  seriesId: string,
  storyboardId: string,
): Promise<void> {
  let inflightTaskId = '';
  try {
    // 查找此分镜对应的 taskId
    const result = await apiRequest(`/series/${seriesId}/video-task-status`, {
      method: 'GET', timeout: 10000, maxRetries: 1, silent: true,
    });
    const tasks = result?.storyboardTasks as Record<string, {
      taskId?: string;
      lastFrameUrl?: string;
      thumbnail?: string;
    }> | undefined;
    const taskInfo = tasks?.[storyboardId];
    const taskId = taskInfo?.taskId;
    if (!taskId) return;

    if (_processedTaskIds.has(taskId) || _inflightTaskIds.has(taskId)) return;

    const hasLastFrame = !!taskInfo.lastFrameUrl;
    const isDirtyLastFrame =
      !!taskInfo.lastFrameUrl &&
      !!taskInfo.thumbnail &&
      taskInfo.lastFrameUrl === taskInfo.thumbnail;

    // 服务端已有真实尾帧则跳过（脏值 lastFrameUrl===thumbnail 不算）
    if (hasLastFrame && !isDirtyLastFrame) {
      _processedTaskIds.add(taskId);
      return;
    }

    _inflightTaskIds.add(taskId);
    inflightTaskId = taskId;

    // 优先: 客户端 canvas 截帧（适用于 OSS URL，CORS 已配置）
    const dataUrl = await extractLastFrame(videoUrl);
    if (dataUrl) {
      await apiRequest(`/video-tasks/${taskId}/last-frame`, {
        method: 'POST',
        body: JSON.stringify({ lastFrameDataUrl: dataUrl }),
        timeout: 30000, maxRetries: 1,
      });
      console.log(`[LastFrame] ✅ Client canvas uploaded last frame for ${storyboardId}`);
      _processedTaskIds.add(taskId);
      return;
    }

    // 回退: canvas CORS 失败（Volcengine CDN）→ 请求服务端从 OSS 直接截帧
    console.log(`[LastFrame] Canvas CORS fail, requesting server-side OSS extraction for ${storyboardId}`);
    const fallbackResp = await apiRequest(`/video-tasks/${taskId}/extract-last-frame`, {
      method: 'POST',
      body: JSON.stringify({ videoUrl }),
      timeout: 20000, maxRetries: 0, silent: true,
    });
    if (fallbackResp?.success) {
      _processedTaskIds.add(taskId);
    }
  } catch {
    // non-blocking
  } finally {
    if (inflightTaskId) _inflightTaskIds.delete(inflightTaskId);
  }
}
