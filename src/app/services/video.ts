/**
 * Video Service - Merger, batch generation, series video service
 * Split from consolidated services/index.ts (v6.0.68)
 */

import { apiRequest, apiPost, getVideoCodecPreference } from '../utils';
import type { Series, Episode, Storyboard } from '../types';
import { updateSeries } from './series';
import { buildVideoPrompt } from './series';
import { createVideoTask, pollTaskStatus } from './volcengine';
import type { TaskStatus } from './volcengine';
import { emitQuotaExceeded } from '../utils/events';

// ═══════════════════════════════════════════════════════════════════
// [4] videoMerger
// ═══════════════════════════════════════════════════════════════════

export async function mergeEpisodeVideos(
  seriesId: string,
  episodeId: string,
  userPhone?: string
): Promise<{ success: boolean; data?: any; videoUrl?: string; error?: string }> {
  const result = await apiPost(`/episodes/${episodeId}/merge-videos`, userPhone ? { userPhone } : {}, { timeout: 300_000, maxRetries: 1 });
  if (result.success) {
    // v6.0.105: 服务器 HTTP 200 + success:false 时 apiRequest 透传整个对象
    // 此处需检查 result.data 是否含有 mergedVideoUrl（真正的成功）
    const videoUrl = result.data?.mergedVideoUrl || result.data?.videoUrls?.[0];
    if (videoUrl) return { success: true, data: result.data, videoUrl };
  }

  // v6.0.105: 检测 useClientMerge 信号（服务器主动路由到本地合并）
  // 三重检测: 顶层属性 / data子属性 / 错误字符串关键词
  const rawResult = result as any;
  const isUseClientMerge =
    rawResult.useClientMerge === true ||
    rawResult.data?.useClientMerge === true ||
    (typeof rawResult.error === 'string' && rawResult.error.includes('本地合并'));
  if (isUseClientMerge) {
    console.log(`[VideoMerger] Server recommends client-side merge: ${result.error || '(no message)'}`);
    return { success: false, data: { useClientMerge: true }, error: result.error || '服务器建议使用本地合并' };
  }

  let errorStr = result.error || '合并失败';

  // v6.0.96/105: HTTP 546 WORKER_LIMIT → 标记 useClientMerge 以便自动回退
  if (errorStr.includes('546') || errorStr.includes('WORKER_LIMIT') || errorStr.includes('compute resources')) {
    console.warn('[VideoMerger] WORKER_LIMIT: Edge Function OOM/CPU exceeded — will fallback to client merge');
    return { success: false, data: { useClientMerge: true }, error: '服务器资源不足，将自动使用本地合并' };
  }

  // v6.0.69: 解析分辨率不一致的结构化错误信息
  let parsedData: any = null;
  try {
    const jsonMatch = errorStr.match(/HTTP \d+:\s*(.+)/s);
    if (jsonMatch) {
      parsedData = JSON.parse(jsonMatch[1]);
      if (parsedData.useClientMerge) {
        console.log('[VideoMerger] Server useClientMerge (from JSON):', parsedData.error);
        return { success: false, data: { useClientMerge: true }, error: parsedData.error || '服务器建议使用本地合并' };
      }
      if (parsedData.resolutionMismatch) {
        const scenes = parsedData.mismatchedScenes || [];
        errorStr = parsedData.hint || parsedData.error || errorStr;
        console.error('[VideoMerger] Resolution mismatch:', parsedData);
        return { success: false, error: errorStr, data: { resolutionMismatch: true, mismatchedScenes: scenes, majorityResolution: parsedData.majorityResolution, hint: parsedData.hint } };
      }
    }
  } catch { /* not JSON, use original error */ }
  console.error('[VideoMerger] Error:', errorStr);
  return { success: false, error: errorStr };
}

export async function mergeAllSeriesVideos(
  seriesId: string,
  userPhone: string
): Promise<{
  success: boolean;
  mergedCount?: number;
  failedCount?: number;
  errors?: string[];
  skippedEpisodes?: number[];  // v6.0.107: 被跳过的集数（分镜过多，需本地合并）
  useClientMerge?: boolean;
  error?: string;
}> {
  const result = await apiPost(`/series/${seriesId}/merge-all-videos`, { userPhone }, { timeout: 600_000, maxRetries: 1 });
  if (result.success) {
    const data = result.data || {};
    return {
      success: true,
      mergedCount: data.mergedCount || 0,
      failedCount: data.failedCount || 0,
      errors: data.errors || [],
      skippedEpisodes: data.skippedEpisodes || [],
      useClientMerge: data.useClientMerge || false,
    };
  }
  console.error('[VideoMerger] Error:', result.error);
  return { success: false, error: result.error || '批量合并失败' };
}

export async function repairEpisodeVideo(
  episodeId: string,
  userPhone: string
): Promise<{ success: boolean; data?: any; error?: string }> {
  const result = await apiPost(`/episodes/${episodeId}/repair-video`, { userPhone }, { timeout: 180_000, maxRetries: 1 });
  if (result.success) return { success: true, data: result.data };
  console.error('[VideoMerger] Repair error:', result.error);
  return { success: false, error: result.error || '修复失败' };
}

// ═══════════════════════════════════════════════════════════════════
// [5] batchVideoGeneration
// ═══════════════════════════════════════════════════════════════════

interface BatchGenerationProgress {
  totalStoryboards: number; completedStoryboards: number; failedStoryboards: number; skippedStoryboards: number;
  currentEpisode: number; totalEpisodes: number; status: 'idle' | 'generating' | 'completed' | 'failed';
  progress: number; retryCount?: number;
}

interface ExistingStoryboardTask { taskId: string; status: string; videoUrl: string; episodeNumber?: number; sceneNumber?: number; }

const batchTasks = new Map<string, BatchGenerationProgress>();
const activeBatchSeriesIds = new Set<string>();
const cancelledSeriesIds = new Set<string>();

export function cancelBatchGeneration(seriesId: string): void {
  cancelledSeriesIds.add(seriesId);
  activeBatchSeriesIds.delete(seriesId);
  console.log(`[BatchVideo] 🚫 Series ${seriesId} batch generation cancelled`);
}

function isSeriesCancelled(seriesId: string): boolean { return cancelledSeriesIds.has(seriesId); }

async function fetchExistingVideoTasks(seriesId: string): Promise<Map<string, ExistingStoryboardTask>> {
  const taskMap = new Map<string, ExistingStoryboardTask>();
  try {
    const result = await apiRequest(`/series/${seriesId}/video-task-status`, { method: 'GET', timeout: 15000, maxRetries: 1, silent: true });
    if (result.success && (result as any).storyboardTasks) {
      const tasks = (result as any).storyboardTasks;
      for (const [sbId, task] of Object.entries(tasks)) {
        const t = task as any;
        taskMap.set(sbId, { taskId: t.taskId || '', status: t.status || 'unknown', videoUrl: t.videoUrl || '', episodeNumber: t.episodeNumber, sceneNumber: t.sceneNumber });
      }
      console.log(`[BatchVideo] 📋 Pre-check: ${taskMap.size} storyboards already have tasks`);
    }
  } catch (err: any) { console.warn(`[BatchVideo] Pre-check failed (non-blocking): ${err.message}`); }
  return taskMap;
}

function isStoryboardAlreadyCompleted(
  storyboard: Storyboard,
  existingTasks: Map<string, ExistingStoryboardTask>
): { skip: boolean; reason?: string; videoUrl?: string } {
  if (storyboard.videoUrl && (storyboard.videoUrl.startsWith('http://') || storyboard.videoUrl.startsWith('https://'))) {
    return { skip: true, reason: 'storyboard.videoUrl exists', videoUrl: storyboard.videoUrl };
  }
  const existing = existingTasks.get(storyboard.id);
  if (existing) {
    if (['completed', 'succeeded', 'success'].includes(existing.status) && existing.videoUrl && (existing.videoUrl.startsWith('http://') || existing.videoUrl.startsWith('https://'))) {
      return { skip: true, reason: `existing task ${existing.taskId} completed`, videoUrl: existing.videoUrl };
    }
    if (['pending', 'processing', 'submitted'].includes(existing.status)) {
      return { skip: true, reason: `existing task ${existing.taskId} is ${existing.status}` };
    }
  }
  if (storyboard.status === 'completed' && storyboard.videoUrl) {
    return { skip: true, reason: 'storyboard.status=completed', videoUrl: storyboard.videoUrl };
  }
  return { skip: false };
}

export async function generateAllVideosForSeries(
  series: Series,
  userPhone: string,
  onProgress?: (progress: BatchGenerationProgress) => void
): Promise<{ success: boolean; error?: string }> {
  if (activeBatchSeriesIds.has(series.id)) {
    console.warn(`[BatchVideo] ⚠️ Series ${series.id} ("${series.title}") batch generation already in progress, skipping duplicate call`);
    return { success: true };
  }
  activeBatchSeriesIds.add(series.id);
  console.log(`[BatchVideo] 🔒 Acquired lock for series ${series.id}, active locks: ${activeBatchSeriesIds.size}`);

  if (isSeriesCancelled(series.id)) {
    console.warn(`[BatchVideo] ⚠️ Series ${series.id} ("${series.title}") has been cancelled, skipping batch generation`);
    activeBatchSeriesIds.delete(series.id);
    return { success: true };
  }

  if (!series.episodes || series.episodes.length === 0) {
    activeBatchSeriesIds.delete(series.id);
    return { success: false, error: '批量生成失：没有可生成的剧集' };
  }

  const existingTasks = await fetchExistingVideoTasks(series.id);

  const taskId = `batch-${series.id}-${Date.now()}`;
  const progress: BatchGenerationProgress = {
    totalStoryboards: 0, completedStoryboards: 0, failedStoryboards: 0, skippedStoryboards: 0,
    currentEpisode: 0, totalEpisodes: series.episodes.length, status: 'generating', progress: 0, retryCount: 0,
  };

  series.episodes.forEach(ep => { if (ep.storyboards && Array.isArray(ep.storyboards)) progress.totalStoryboards += ep.storyboards.length; });

  if (progress.totalStoryboards === 0) {
    activeBatchSeriesIds.delete(series.id);
    return { success: false, error: '批量生成失败：没有可生成的分镜' };
  }

  batchTasks.set(taskId, progress);
  onProgress?.(progress);
  await syncBatchProgressToDatabase(series.id, progress);

  try {
    for (let i = 0; i < series.episodes.length; i++) {
      const episode = series.episodes[i];
      progress.currentEpisode = i + 1;

      const result = await generateVideosForEpisode(series, episode, userPhone, existingTasks, (sp) => {
        progress.completedStoryboards = sp.completed;
        progress.failedStoryboards = sp.failed;
        progress.skippedStoryboards = sp.skipped;
        progress.progress = Math.round(((progress.completedStoryboards + progress.skippedStoryboards) / progress.totalStoryboards) * 100);
        batchTasks.set(taskId, progress);
        onProgress?.(progress);
        syncBatchProgressToDatabase(series.id, progress);
      });

      if (!result.success) console.warn(`[BatchVideo] ⚠️ Episode ${i + 1} generation had errors:`, result.error);
    }

    progress.status = 'completed';
    progress.progress = 100;
    batchTasks.set(taskId, progress);
    onProgress?.(progress);
    await syncBatchProgressToDatabase(series.id, progress);

    activeBatchSeriesIds.delete(series.id);
    const summary = `completed=${progress.completedStoryboards}, skipped=${progress.skippedStoryboards}, failed=${progress.failedStoryboards}`;
    console.log(`[BatchVideo] 🔓 Released lock for series ${series.id} (${summary}), active locks: ${activeBatchSeriesIds.size}`);
    return { success: true };
  } catch (error: any) {
    console.error('[BatchVideo] ❌ Batch generation failed:', error);
    progress.status = 'failed';
    batchTasks.set(taskId, progress);
    onProgress?.(progress);
    await syncBatchProgressToDatabase(series.id, progress);
    activeBatchSeriesIds.delete(series.id);
    console.log(`[BatchVideo] 🔓 Released lock for series ${series.id}, active locks: ${activeBatchSeriesIds.size}`);
    return { success: false, error: error.message || 'Batch generation failed' };
  }
}

/** Internal: sync batch progress to DB (calls updateSeries directly) */
async function syncBatchProgressToDatabase(seriesId: string, progress: BatchGenerationProgress): Promise<void> {
  try {
    await updateSeries(seriesId, {
      metadata: { batchGenerationStatus: progress.status, batchGenerationProgress: progress.progress, lastBatchUpdate: new Date().toISOString() },
    } as any);
  } catch (error: any) {
    console.warn('[BatchVideo] syncProgressToDatabase failed (non-blocking):', error.message);
  }
}

async function generateVideosForEpisode(
  series: Series,
  episode: Episode,
  userPhone: string,
  existingTasks: Map<string, ExistingStoryboardTask>,
  onProgress?: (progress: { completed: number; failed: number; skipped: number; total: number }) => void
): Promise<{ success: boolean; error?: string }> {
  const storyboards = episode.storyboards || [];
  let completed = 0, failed = 0, skipped = 0;
  const maxRetries = 3; // v6.0.84: 2→3次重试（Volcengine北京端点TCP超时较多）
  let consecutiveNetworkFails = 0;

  for (let idx = 0; idx < storyboards.length; idx++) {
    const storyboard = storyboards[idx];

    if (isSeriesCancelled(series.id)) {
      console.log(`[BatchVideo] 🚫 Series ${series.id} cancelled, aborting episode ${episode.episodeNumber}`);
      break;
    }

    const checkResult = isStoryboardAlreadyCompleted(storyboard, existingTasks);
    if (checkResult.skip) {
      skipped++;
      console.log(`[BatchVideo] ⏭️ Skipping E${episode.episodeNumber}/S${storyboard.sceneNumber}: ${checkResult.reason}`);
      onProgress?.({ completed, failed, skipped, total: storyboards.length });
      continue;
    }

    // v6.0.84: 增大基础间隔 3s→5s，网络故障时 8s→12s（减少429 rate-limit错误）
    if (idx > 0 && (completed + failed) > 0) {
      const delay = consecutiveNetworkFails > 0 ? 12000 : 5000;
      await new Promise(resolve => setTimeout(resolve, delay));
    }

    let retryCount = 0;
    let success = false;

    while (retryCount <= maxRetries && !success) {
      try {
        // v6.0.84: 重试间隔指数退避 3s→5s/10s/20s
        if (retryCount > 0) await new Promise(resolve => setTimeout(resolve, 5000 * Math.pow(2, retryCount - 1)));

        const result = await generateVideoForStoryboard(series, episode, storyboard, userPhone);
        if (result.success) {
          if (result.duplicate && result.existingVideoUrl) {
            skipped++;
            console.log(`[BatchVideo] ⏭️ Backend dedup E${episode.episodeNumber}/S${storyboard.sceneNumber}: already has video`);
          } else { completed++; }
          success = true;
          consecutiveNetworkFails = 0;
        } else { throw new Error(result.error || 'Generation failed'); }
      } catch (error: any) {
        retryCount++;
        const isNetworkError = error.message?.includes('Failed to fetch') || error.message?.includes('网络连接') || error.message?.includes('Edge Function') || error.message?.includes('timeout') || error.message?.includes('TIMEOUT');
        if (isNetworkError) {
          consecutiveNetworkFails++;
        }
        if (retryCount > maxRetries) {
          failed++;
          console.warn(`[BatchVideo] ❌ E${episode.episodeNumber}/S${storyboard.sceneNumber} failed after ${maxRetries} retries: ${error.message?.substring(0, 100)}`);
        }
      }
    }

    onProgress?.({ completed, failed, skipped, total: storyboards.length });

    // v6.0.84: 连续网络失败阈值 5→8（Volcengine TCP超时波动容忍度提高）
    if (consecutiveNetworkFails >= 8) {
      console.error(`[BatchVideo] Too many network failures (${consecutiveNetworkFails}), aborting episode`);
      failed += (storyboards.length - idx - 1);
      onProgress?.({ completed, failed, skipped, total: storyboards.length });
      break;
    }
  }

  return { success: failed === 0, error: failed > 0 ? `${failed}/${storyboards.length} videos failed to generate after retries` : undefined };
}

async function generateVideoForStoryboard(
  series: Series,
  episode: Episode,
  storyboard: Storyboard,
  userPhone: string
): Promise<{ success: boolean; taskId?: string; error?: string; duplicate?: boolean; existingVideoUrl?: string }> {
  try {
    const prompt = buildVideoPrompt(series, episode, storyboard);
    // v6.0.78: 从series.coherenceCheck读取分辨率配置，保证同一剧所有分镜分辨率一致
    const seriesResolution = series.coherenceCheck?.resolution || '720p';
    const result = await apiRequest('/volcengine/generate', {
      method: 'POST',
      body: JSON.stringify({
        prompt,
        title: `${series.title || '漫剧'}-E${episode.episodeNumber || 1}-场景${storyboard.sceneNumber || 1}`,
        style: series.style || 'realistic',
        duration: storyboard.duration?.toString() || '10',
        userPhone,
        resolution: seriesResolution,
        fps: 24,
        enableAudio: true,
        seriesId: series.id,
        episodeId: episode.id,
        episodeNumber: episode.episodeNumber,
        storyboardId: storyboard.id,
        storyboardNumber: storyboard.sceneNumber,
        codec: getVideoCodecPreference(), // v6.0.76: 自动注入用户编码偏好
        aspectRatio: series.coherenceCheck?.aspectRatio || undefined, // v6.0.84: 显式传递比例（后端也从coherence_check读取，双保险）
      }),
      timeout: 150000,
      maxRetries: 1,
    });

    if (result.success) {
      const taskId = result.local_task_id || result.taskId || result.task_id;
      if (!taskId) return { success: false, error: 'No task ID returned from server' };
      const isDuplicate = !!(result as any).duplicate;
      const existingVideoUrl = (result as any).existingVideoUrl || '';
      return { success: true, taskId, duplicate: isDuplicate, existingVideoUrl };
    }

    return { success: false, error: result.error || 'Failed to create video task' };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to generate video' };
  }
}

// ═══════════════════════════════════════════════════════════════════
// [6] seriesVideoService
// ═══════════════════════════════════════════════════════════════════

function buildStoryboardPrompt(storyboard: Storyboard): string {
  const parts: string[] = [];
  if (storyboard.description) parts.push(storyboard.description);
  if (storyboard.dialogue) parts.push(`对话：「${storyboard.dialogue}」`);
  if (storyboard.location) parts.push(`地点：${storyboard.location}`);
  if (storyboard.timeOfDay) {
    const timeMap: Record<string, string> = { morning: '晨', noon: '正午', afternoon: '下午', evening: '傍晚', night: '夜晚' };
    parts.push(`时间：${timeMap[storyboard.timeOfDay] || storyboard.timeOfDay}`);
  }
  if (storyboard.emotionalTone) parts.push(`氛围：${storyboard.emotionalTone}`);
  if (storyboard.cameraAngle) {
    const cameraMap: Record<string, string> = { 'close-up': '特写镜头', medium: '中景', wide: '远景', overhead: '俯拍', 'low-angle': '仰拍' };
    parts.push(`镜头：${cameraMap[storyboard.cameraAngle] || storyboard.cameraAngle}`);
  }
  if (storyboard.growthInsight) parts.push(`成长启示：${storyboard.growthInsight}`);
  return parts.join('。') || '场景描';
}

export async function generateStoryboardVideo(
  seriesId: string,
  userPhone: string,
  storyboard: Storyboard,
  episodeNumber?: number,
  onProgress?: (status: TaskStatus) => void,
  forceRegenerate?: boolean, // v6.0.87: 强制重新生成（跳过去重，用于分辨率不一致修复）
): Promise<string> {
  // v6.0.87: forceRegenerate 模式下不跳过已有视频
  if (!forceRegenerate && storyboard.videoUrl && (storyboard.videoUrl.startsWith('http://') || storyboard.videoUrl.startsWith('https://'))) {
    console.log(`[SeriesVideoService] ⏭️ Storyboard ${storyboard.id} already has video: ${storyboard.videoUrl.substring(0, 60)}...`);
    return storyboard.videoUrl;
  }

  const richPrompt = buildStoryboardPrompt(storyboard);
  const taskParams = {
    prompt: richPrompt, style: 'comic' as string, duration: String(storyboard.duration || 10), userPhone,
    title: storyboard.description?.substring(0, 100) || `场景${storyboard.sceneNumber || 1}视频`,
    seriesId, storyboardId: storyboard.id, episodeNumber, storyboardNumber: storyboard.sceneNumber,
    enableAudio: true, resolution: '720p', fps: 24, // v6.0.79: 实际分辨率和比例由后端从series.coherence_check统一读取
    ...(storyboard.imageUrl ? { imageUrls: [storyboard.imageUrl] } : {}),
    ...(forceRegenerate ? { forceRegenerate: true } : {}), // v6.0.87
  };

  console.log(`[SeriesVideoService] Submitting video task for storyboard ${storyboard.id}, episode ${episodeNumber}, scene ${storyboard.sceneNumber}, audio=true`);
  let task: any;
  try {
    task = await createVideoTask(taskParams);
  } catch (err: any) {
    // v6.0.96: quota exceeded — emit global event for PaymentDialog
    if (err.quotaExceeded && err.quotaInfo) {
      emitQuotaExceeded(err.quotaInfo);
    }
    throw err;
  }

  if (task.duplicate && task.existingVideoUrl && (task.existingVideoUrl.startsWith('http://') || task.existingVideoUrl.startsWith('https://'))) {
    console.log(`[SeriesVideoService] ⏭️ Backend returned existing video for storyboard ${storyboard.id}: ${task.existingVideoUrl.substring(0, 60)}...`);
    return task.existingVideoUrl;
  }

  const taskId = task.local_task_id || task.task_id || task.id;
  if (!taskId) throw new Error('服务器未返回任务ID，无法跟踪视频生成进度');

  if (task.duplicate) console.log(`[SeriesVideoService] Task ${taskId} is duplicate (status=${task.existingStatus}), polling existing task...`);
  else console.log(`[SeriesVideoService] Task created: local=${task.local_task_id}, volc=${task.task_id}, polling with: ${taskId}`);

  // v6.0.75: 增加轮询次数到120（~16分钟），给Volcengine更多处理时间
  const result = await pollTaskStatus(taskId, onProgress, 120, 8000);
  
  // v6.0.75: 处理轮询超时——任务可能仍在处理中
  if (result.status === 'timeout') {
    console.warn(`[SeriesVideoService] ⏳ Polling timeout for task ${taskId}, task may still be processing in background`);
    throw new Error(`视频仍在成中，请稍后刷新页面查看结果。任务ID: ${taskId}`);
  }
  
  if (!result.videoUrl) throw new Error('视频生成完成但未返回视频URL，请稍后在任务列表中查看');

  console.log(`[SeriesVideoService] ✅ Video ready: ${result.videoUrl.substring(0, 80)}...`);
  return result.videoUrl;
}