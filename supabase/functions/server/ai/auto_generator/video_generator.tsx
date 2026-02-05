/**
 * 视频自动生成模块（重构版 - 使用统一视频生成服务）
 * 从 ai/auto_series_generator.tsx 提取
 * 负责：批量视频生成和轮询
 * 
 * 🔧 关键修复：
 * 1. 使用 video_generation_service.tsx 统一入口
 * 2. 所有视频任务写入 video_tasks 表
 * 3. 支持前端任务恢复（刷新页面后可见）
 * 4. 传递 userPhone, storyboardId, episodeId 参数
 */

import * as db from '../../database/series.tsx';
import { generateVideo, type VideoGenerationParams } from '../../services/video_generation_service.tsx';
import { AUTO_GENERATION_CONFIG } from './config.tsx';

/**
 * 🎥 自动生成所有视频（使用统一服务）
 */
export async function autoGenerateAllVideos(
  seriesId: string,
  style: string,
  enableAudio: boolean,
  userPhone: string
): Promise<void> {
  console.log('[AutoGen] 🎥 Starting video generation for all storyboards...');
  console.log('[AutoGen] 📊 Video settings:', { seriesId, style, enableAudio, userPhone });
  
  // 🔥 检查API密钥
  const apiKey = Deno.env.get('VOLCENGINE_API_KEY');
  if (!apiKey) {
    const errorMsg = '❌ VOLCENGINE_API_KEY is not configured! Cannot generate videos.';
    console.error('[AutoGen]', errorMsg);
    throw new Error(errorMsg);
  }
  console.log('[AutoGen] ✅ VOLCENGINE_API_KEY is configured');
  
  // 获取漫剧详情（包含所有剧集和分镜）
  const series = await db.getSeries(seriesId);
  if (!series) {
    throw new Error(`Series not found: ${seriesId}`);
  }
  
  const { episodes } = await db.getSeriesWithDetails(seriesId);
  
  let totalStoryboards = 0;
  let submittedStoryboards = 0;
  let failedStoryboards = 0;
  
  // 计算总分镜数
  for (const episode of episodes) {
    totalStoryboards += episode.storyboards.length;
  }
  
  console.log(`[AutoGen] Total storyboards to generate: ${totalStoryboards}`);
  await db.updateSeriesProgress(seriesId, 5, `提交视频生成任务 (0/${totalStoryboards})`);
  
  // 使用并发控制（避免API限制）
  const concurrentLimit = AUTO_GENERATION_CONFIG.VIDEO_CONCURRENT_LIMIT;
  const queue: Array<{ episode: typeof episodes[0], storyboard: db.Storyboard }> = [];
  
  for (const episode of episodes) {
    for (const storyboard of episode.storyboards) {
      queue.push({ episode, storyboard });
    }
  }
  
  console.log('[AutoGen] 🚀 批量提交视频生成任务（异步生成，不等待完成）...');
  
  // 分批处理
  for (let i = 0; i < queue.length; i += concurrentLimit) {
    const batch = queue.slice(i, i + concurrentLimit);
    
    await Promise.all(
      batch.map(async ({ episode, storyboard }) => {
        try {
          console.log(`[AutoGen] 🎬 Submitting video task for Episode ${episode.episode_number}, Scene ${storyboard.scene_number}...`);
          
          // 更新分镜状态为生成中
          await db.updateStoryboard(storyboard.id, { status: 'generating' });
          
          // 🔧 关键修复：使用统一的视频生成服务
          const videoResult = await generateVideoForStoryboard(
            storyboard,
            episode,
            seriesId, // 直接传递 seriesId
            style,
            enableAudio,
            userPhone
          );
          
          // ✅ 更新分镜，记录 video_task_id
          await db.updateStoryboard(storyboard.id, {
            status: 'generating', // 保持generating状态，由后台轮询更新
            video_task_id: videoResult.taskId, // 记录本地task_xxx格式的ID
          });
          
          submittedStoryboards++;
          await db.updateSeriesProgress(seriesId, 5, `提交视频任务 (${submittedStoryboards}/${totalStoryboards})`);
          
          console.log(`[AutoGen] ✅ Video task submitted for Scene ${storyboard.scene_number}, TaskID: ${videoResult.taskId}`);
          
        } catch (error: any) {
          console.error(`[AutoGen] ❌ Failed to submit video task for Scene ${storyboard.scene_number}:`, error);
          
          failedStoryboards++;
          
          // 更新为失败状态
          await db.updateStoryboard(storyboard.id, {
            status: 'failed',
            error: error.message,
          });
        }
      })
    );
    
    // 批次间延迟（避免API限流）
    if (i + concurrentLimit < queue.length) {
      await new Promise(resolve => setTimeout(resolve, 2000)); // 2秒延迟
    }
  }
  
  console.log(`[AutoGen] ✅ Video task submission completed:`);
  console.log(`[AutoGen]    - Total: ${totalStoryboards}`);
  console.log(`[AutoGen]    - Submitted: ${submittedStoryboards}`);
  console.log(`[AutoGen]    - Failed: ${failedStoryboards}`);
  console.log(`[AutoGen] 📝 所有视频任务已提交，将在后台异步生成`);
  console.log(`[AutoGen] 📝 用户可以在"我的作品"页面查看实时进度`);
}

/**
 * 🎬 为单个分镜生成视频（使用统一服务）
 * 
 * 🔧 关键改进：
 * 1. 不再直接调用火山引擎API
 * 2. 通过 video_generation_service 统一处理
 * 3. 任务写入 video_tasks 表
 * 4. 不等待视频完成，立即返回
 */
export async function generateVideoForStoryboard(
  storyboard: db.Storyboard,
  episode: any,
  seriesId: string,
  style: string,
  enableAudio: boolean,
  userPhone: string
): Promise<{ videoUrl: string; taskId: string }> {
  console.log('[AutoGen] 🎬 Calling unified video generation service...');
  
  // 🔧 使用统一的视频生成服务
  const params: VideoGenerationParams = {
    userPhone,
    prompt: storyboard.description,
    style: style || 'realistic',
    duration: storyboard.duration || 5,
    enableAudio: enableAudio,
    resolution: '1080p',
    fps: 30,
    // 🔥 关键参数：关联分镜、剧集、漫剧
    storyboardId: storyboard.id,
    episodeId: episode.id,
    seriesId: seriesId,
  };
  
  console.log('[AutoGen] 📋 Video generation params:', {
    prompt: params.prompt.substring(0, 50) + '...',
    duration: params.duration,
    style: params.style,
    storyboardId: params.storyboardId,
  });
  
  // 调用统一服务
  const result = await generateVideo(params);
  
  if (!result.success) {
    console.error('[AutoGen] ❌ Video generation failed:', result.error);
    throw new Error(result.error || '视频生成失败');
  }
  
  console.log('[AutoGen] ✅ Video task created successfully:', {
    taskId: result.taskId,
    volcTaskId: result.volcTaskId,
  });
  
  // 🔥 关键改进：不等待完成，立即返回
  // 视频URL将由后台轮询服务自动更新到 video_tasks 表
  // 前端可以通过 useTaskRecovery 恢复任务并查看进度
  return {
    videoUrl: '', // 视频URL稍后由后台更新
    taskId: result.taskId, // 返回本地task_xxx格式的ID
  };
}

/**
 * 🔧 轮询等待视频生成完成（保留但不推荐使用）
 * 
 * @deprecated 推荐使用后台轮询服务，避免阻塞主流程
 * 
 * 如果需要同步等待视频完成，可以调用此函数
 * 但会阻塞整个漫剧生成流程，不适合批量生成
 */
export async function pollVideoCompletion(taskId: string, apiKey: string): Promise<string> {
  console.warn('[AutoGen] ⚠️ Using deprecated pollVideoCompletion - consider using background polling instead');
  
  const maxAttempts = 60; // 最多轮询60次（10分钟）
  const pollInterval = 10000; // 每10秒轮询一次
  
  // 导入video_tasks查询函数
  const { getVideoTask } = await import('../../database/index.tsx');
  
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    await new Promise(resolve => setTimeout(resolve, pollInterval));
    
    try {
      // 从数据库查询任务状态（而不是直接调用火山引擎）
      const task = await getVideoTask(taskId);
      
      if (!task) {
        console.warn(`[AutoGen] Task not found in database: ${taskId}`);
        continue;
      }
      
      // 检查��态
      if (task.status === 'completed' && task.video_url) {
        console.log('[AutoGen] ✅ Video generation completed:', taskId);
        return task.video_url;
      }
      
      if (task.status === 'failed') {
        throw new Error(`视频生成失败: ${task.error || '未知错误'}`);
      }
      
      console.log(`[AutoGen] Poll attempt ${attempt + 1}/${maxAttempts}: status = ${task.status}`);
      
    } catch (error: any) {
      console.warn(`[AutoGen] Poll error (attempt ${attempt + 1}):`, error.message);
    }
  }
  
  throw new Error('视频生成超时：轮询次数已达上限');
}