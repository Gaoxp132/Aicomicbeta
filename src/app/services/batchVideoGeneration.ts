/**
 * 批量视频生成服务 - 自动为整个漫剧生成视频
 */

import { apiRequest } from '@/app/utils/apiClient';
import * as seriesService from './seriesService';
import type { Series, Episode, Storyboard } from '@/app/types';

export interface BatchGenerationProgress {
  totalStoryboards: number;
  completedStoryboards: number;
  failedStoryboards: number;
  currentEpisode: number;
  totalEpisodes: number;
  status: 'idle' | 'generating' | 'completed' | 'failed';
  progress: number; // 0-100
  retryCount?: number;
}

// 批量生成任务状态（存储在内存中）
const batchTasks = new Map<string, BatchGenerationProgress>();

/**
 * 为整个系列生成所有视频（带数据库同步和失败重试）
 */
export async function generateAllVideosForSeries(
  series: Series,
  userPhone: string,
  onProgress?: (progress: BatchGenerationProgress) => void
): Promise<{ success: boolean; error?: string }> {
  console.log('[BatchVideo] 🚀 Starting batch generation for series:', series.id);

  // 🔧 安全检查：确保episodes存在
  if (!series.episodes || series.episodes.length === 0) {
    const errorMsg = '批量生成失败：没有可生成的剧集';
    console.error('[BatchVideo] ❌', errorMsg);
    return { success: false, error: errorMsg };
  }

  const taskId = `batch-${series.id}-${Date.now()}`;
  const progress: BatchGenerationProgress = {
    totalStoryboards: 0,
    completedStoryboards: 0,
    failedStoryboards: 0,
    currentEpisode: 0,
    totalEpisodes: series.episodes.length,
    status: 'generating',
    progress: 0,
    retryCount: 0,
  };

  // 计算总分镜数 - 添加安全检查
  series.episodes.forEach(ep => {
    if (ep.storyboards && Array.isArray(ep.storyboards)) {
      progress.totalStoryboards += ep.storyboards.length;
    }
  });

  // 🔧 安全检查：确保有分镜需要生成
  if (progress.totalStoryboards === 0) {
    const errorMsg = '批量生成失败：没有可生成的分镜';
    console.error('[BatchVideo] ❌', errorMsg);
    return { success: false, error: errorMsg };
  }

  // 保存任务状态
  batchTasks.set(taskId, progress);
  onProgress?.(progress);

  // 📊 同步初始状态到数据库
  await syncProgressToDatabase(series.id, progress);

  try {
    // 逐个剧集生成视频
    for (let i = 0; i < series.episodes.length; i++) {
      const episode = series.episodes[i];
      progress.currentEpisode = i + 1;

      console.log(`[BatchVideo] 📺 Processing episode ${i + 1}/${series.episodes.length}`);

      // 为当前剧集的所有分镜生成视频（带重试）
      const result = await generateVideosForEpisode(
        series,
        episode,
        userPhone,
        (storyboardProgress) => {
          progress.completedStoryboards = storyboardProgress.completed;
          progress.failedStoryboards = storyboardProgress.failed;
          progress.progress = Math.round(
            (progress.completedStoryboards / progress.totalStoryboards) * 100
          );
          
          // 更新任务状态
          batchTasks.set(taskId, progress);
          onProgress?.(progress);
          
          // 📊 同步进度到数据库
          syncProgressToDatabase(series.id, progress);
        }
      );

      if (!result.success) {
        console.warn(`[BatchVideo] ⚠️ Episode ${i + 1} generation had errors:`, result.error);
        // 继续处理下一个剧集，不中断整个流程
      }
    }

    progress.status = 'completed';
    progress.progress = 100;
    batchTasks.set(taskId, progress);
    onProgress?.(progress);

    // 📊 同步最终状态到数据库
    await syncProgressToDatabase(series.id, progress);

    console.log('[BatchVideo] ✅ Batch generation completed');

    return { success: true };
  } catch (error: any) {
    console.error('[BatchVideo] ❌ Batch generation failed:', error);
    progress.status = 'failed';
    batchTasks.set(taskId, progress);
    onProgress?.(progress);

    // 📊 同步失败状态到数据库
    await syncProgressToDatabase(series.id, progress);

    return {
      success: false,
      error: error.message || 'Batch generation failed',
    };
  }
}

/**
 * 📊 同步进度到数据库
 */
async function syncProgressToDatabase(
  seriesId: string,
  progress: BatchGenerationProgress
): Promise<void> {
  try {
    // 更新series的元数据
    await seriesService.updateSeries(seriesId, {
      metadata: {
        batchGenerationStatus: progress.status,
        batchGenerationProgress: progress.progress,
        lastBatchUpdate: new Date().toISOString(),
      },
    } as any);
    
    console.log(`[BatchVideo] 📊 Synced progress to database: ${progress.progress}%`);
  } catch (error: any) {
    console.error('[BatchVideo] ❌ Failed to sync progress to database:', error);
    // 不抛出错误，避免中断视频生成流程
  }
}

/**
 * 为单个剧集生成所有分镜视频（带失败重试）
 */
async function generateVideosForEpisode(
  series: Series,
  episode: Episode,
  userPhone: string,
  onProgress?: (progress: { completed: number; failed: number; total: number }) => void
): Promise<{ success: boolean; error?: string }> {
  const storyboards = episode.storyboards || [];
  let completed = 0;
  let failed = 0;
  const maxRetries = 2; // 每个分镜最多重试2次

  console.log(`[BatchVideo] 🎬 Generating ${storyboards.length} videos for episode:`, episode.title);

  // 并发控制：每次最多生成3个视频
  const concurrency = 3;
  const queue = [...storyboards];

  const generateNext = async (): Promise<void> => {
    if (queue.length === 0) return;

    const storyboard = queue.shift()!;
    let retryCount = 0;
    let success = false;

    // 🔄 失败重试机制
    while (retryCount <= maxRetries && !success) {
      try {
        if (retryCount > 0) {
          console.log(`[BatchVideo] 🔄 Retry ${retryCount}/${maxRetries} for storyboard ${storyboard.sceneNumber}`);
          // 等待一段时间再重试
          await new Promise(resolve => setTimeout(resolve, 2000 * retryCount));
        }

        console.log(`[BatchVideo] 🎥 Generating video for storyboard ${storyboard.sceneNumber}`);

        const result = await generateVideoForStoryboard(
          series,
          episode,
          storyboard,
          userPhone
        );

        if (result.success) {
          completed++;
          success = true;
          console.log(`[BatchVideo] ✅ Video generated for storyboard ${storyboard.sceneNumber}`);
        } else {
          throw new Error(result.error || 'Generation failed');
        }
      } catch (error: any) {
        retryCount++;
        console.warn(`[BatchVideo] ⚠️ Attempt ${retryCount} failed for storyboard ${storyboard.sceneNumber}:`, error.message);
        
        if (retryCount > maxRetries) {
          failed++;
          console.error(`[BatchVideo] ❌ Max retries reached for storyboard ${storyboard.sceneNumber}`);
        }
      }
    }

    onProgress?.({ completed, failed, total: storyboards.length });

    // 继续处理下一个
    if (queue.length > 0) {
      await generateNext();
    }
  };

  // 启动并发生成
  const workers = Array(Math.min(concurrency, storyboards.length))
    .fill(null)
    .map(() => generateNext());

  await Promise.all(workers);

  return {
    success: failed === 0,
    error: failed > 0 ? `${failed}/${storyboards.length} videos failed to generate after retries` : undefined,
  };
}

/**
 * 为单个分镜生成视频
 */
async function generateVideoForStoryboard(
  series: Series,
  episode: Episode,
  storyboard: Storyboard,
  userPhone: string
): Promise<{ success: boolean; taskId?: string; error?: string }> {
  try {
    // 构建视频生成prompt
    const prompt = buildVideoPrompt(series, episode, storyboard);

    console.log('[BatchVideo] 🎬 Generated prompt for storyboard:', {
      seriesTitle: series.title,
      episodeNumber: episode.episodeNumber,
      episodeTitle: episode.title,
      sceneNumber: storyboard.sceneNumber,
      promptLength: prompt.length,
      prompt: prompt,
    });

    // 调用视频生成API
    const result = await apiRequest('/volcengine/generate', {
      method: 'POST',
      body: JSON.stringify({
        prompt,
        style: series.style || 'realistic',
        duration: storyboard.duration?.toString() || '5',
        userPhone,
        resolution: '1280x720',
        fps: 24,
        enableAudio: true, // 🎵 默认启用音频
        // ✅ 关联信息（包含集数和分镜编号，用于进度显示）
        seriesId: series.id,
        episodeId: episode.id,
        episodeNumber: episode.episodeNumber, // ✅ 添加集数编号
        storyboardId: storyboard.id,
        storyboardNumber: storyboard.sceneNumber, // ✅ 添加分镜编号
      }),
    });

    console.log('[BatchVideo] 📡 API Response:', result);

    // ✅ 修复：正确处理API响应结构
    if (result.success) {
      // result本身就是响应体，不需要再访问result.data
      const taskId = result.taskId || result.local_task_id || result.task_id;
      
      if (!taskId) {
        console.error('[BatchVideo] ❌ No taskId in response:', result);
        return {
          success: false,
          error: 'No task ID returned from server',
        };
      }

      console.log('[BatchVideo] ✅ Task created successfully:', taskId);
      return {
        success: true,
        taskId: taskId,
      };
    }

    return {
      success: false,
      error: result.error || 'Failed to create video task',
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Failed to generate video',
    };
  }
}

/**
 * 构建视频生成prompt
 * 🎯 包含完整的剧本上下文，确保生成内容与故事一致
 */
function buildVideoPrompt(
  series: Series,
  episode: Episode,
  storyboard: Storyboard
): string {
  const parts = [];

  // 🆕 1. 漫剧整体背景（提供故事世界观）
  parts.push(`【故事背景】${series.title}`);
  if (series.description) {
    parts.push(`故事简介：${series.description}`);
  }
  if (series.theme) {
    parts.push(`核心主题：${series.theme}`);
  }

  // 🆕 2. 当前剧集信息（提供章节上下文）
  parts.push(`【第${episode.episodeNumber}集：${episode.title}】`);
  if (episode.synopsis) {
    parts.push(`本集概要：${episode.synopsis}`);
  }
  if (episode.growthTheme) {
    parts.push(`成长主题：${episode.growthTheme}`);
  }

  // 🆕 3. 场景编号（体现故事进度）
  parts.push(`【场景${storyboard.sceneNumber}】`);

  // 4. 场景详细描述
  if (storyboard.description) {
    parts.push(storyboard.description);
  }

  // 5. 角色信息（包含性格描述）
  if (storyboard.characters && storyboard.characters.length > 0) {
    const characterDetails = storyboard.characters.map(charId => {
      const character = series.characters?.find(c => c.id === charId);
      if (character) {
        return `${character.name}（${character.personality || character.description}）`;
      }
      return charId;
    });
    parts.push(`角色：${characterDetails.join('、')}`);
  }

  // 6. 地点和时间
  if (storyboard.location) {
    parts.push(`地点：${storyboard.location}`);
  }
  if (storyboard.timeOfDay) {
    const timeMap: Record<string, string> = {
      'morning': '清晨',
      'noon': '正午',
      'afternoon': '下午',
      'evening': '傍晚',
      'night': '夜晚',
    };
    parts.push(`时间：${timeMap[storyboard.timeOfDay] || storyboard.timeOfDay}`);
  }

  // 7. 对话内容
  if (storyboard.dialogue) {
    parts.push(`对话：${storyboard.dialogue}`);
  }

  // 8. 情绪氛围
  if (storyboard.emotionalTone) {
    parts.push(`氛围：${storyboard.emotionalTone}`);
  }

  // 9. 镜头语言
  if (storyboard.cameraAngle) {
    const cameraMap: Record<string, string> = {
      'close-up': '特写镜头',
      'medium': '中景',
      'wide': '远景',
      'overhead': '俯拍',
      'low-angle': '仰拍',
    };
    parts.push(`镜头：${cameraMap[storyboard.cameraAngle] || storyboard.cameraAngle}`);
  }

  // 🆕 10. 成长启示（如果有）
  if (storyboard.growthInsight) {
    parts.push(`成长启示：${storyboard.growthInsight}`);
  }

  // 11. 视觉风格
  parts.push(`视觉风格：${series.style || '写实风格'}，画面精美，细节丰富`);

  // 🆕 12. 核心价值观引导
  if (series.coreValues && series.coreValues.length > 0) {
    parts.push(`价值引导：传递${series.coreValues.slice(0, 2).join('、')}的正能量`);
  }

  return parts.join('。');
}

/**
 * 查询批量生成进度
 */
export async function getBatchGenerationStatus(
  seriesId: string
): Promise<{
  success: boolean;
  data?: {
    totalTasks: number;
    completedTasks: number;
    failedTasks: number;
    progress: number;
  };
  error?: string;
}> {
  return apiRequest(`/series/${seriesId}/batch-status`, {
    method: 'GET',
  });
}