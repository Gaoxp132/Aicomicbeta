/**
 * 视频生成服务
 * 将视频生成的核心逻辑提取为可复用的服务函数
 */

import { fetchWithRetry } from "../utils.tsx";
import { STYLE_PROMPTS, MODELS, API_CONFIG, selectOptimalModel, adjustParamsForModel } from "../video/constants.tsx";
import { uploadImagesToStorage, buildContentArray } from "../video/image_upload.tsx";
import * as db from "../database/index.tsx";

/**
 * 视频生成参数接口
 */
export interface VideoGenerationParams {
  userPhone?: string;
  images?: string[];
  imageUrls?: string[];
  prompt: string;
  description?: string;
  style?: string;
  duration?: number;
  model?: string;
  resolution?: string;
  fps?: number;
  enableAudio?: boolean;
  quality?: string;
  speed?: string;
  // 漫剧关联信息
  seriesId?: string;
  episodeId?: string;
  storyboardId?: string;
}

/**
 * 视频生成结果接口
 */
export interface VideoGenerationResult {
  success: boolean;
  taskId: string;
  volcTaskId: string;
  error?: string;
  message?: string;
}

/**
 * 核心视频生成服务函数
 * @param params 视频生成参数
 * @returns 视频生成结果
 */
export async function generateVideo(params: VideoGenerationParams): Promise<VideoGenerationResult> {
  try {
    const {
      userPhone,
      images,
      imageUrls,
      prompt,
      description,
      style = 'comic',
      duration = 5,
      model,
      resolution = '1080p',
      fps = 30,
      enableAudio = false,
      quality = 'high',
      speed = 'medium',
      seriesId,
      episodeId,
      storyboardId,
    } = params;

    console.log('[VideoGenerationService] ========== 开始视频生成 ==========');
    console.log('[VideoGenerationService] Prompt:', prompt);
    console.log('[VideoGenerationService] Style:', style);
    console.log('[VideoGenerationService] Duration:', duration);
    
    // 统一处理images和imageUrls
    const finalImages = images || imageUrls || [];
    const finalDescription = description || prompt || '';
    
    console.log('[VideoGenerationService] Images count:', finalImages?.length);

    // 验证必需参数
    if (!finalDescription || !finalDescription.trim()) {
      return {
        success: false,
        taskId: '',
        volcTaskId: '',
        error: '请输入视频描述',
      };
    }

    // 🔍 去重检查：如果该storyboard已有进行中或成功的任务，直接返回现有任务
    if (storyboardId) {
      console.log('[VideoGenerationService] 🔍 Checking for existing tasks for storyboard:', storyboardId);
      
      const { data: existingTasks, error: queryError } = await db.supabase
        .from('video_tasks')
        .select('task_id, volcengine_task_id, status')
        .eq('storyboard_id', storyboardId)
        .in('status', ['pending', 'processing', 'success', 'succeeded'])
        .order('created_at', { ascending: false })
        .limit(1);
      
      if (!queryError && existingTasks && existingTasks.length > 0) {
        const existingTask = existingTasks[0];
        console.log('[VideoGenerationService] ✅ Found existing task:', existingTask.task_id, 'Status:', existingTask.status);
        console.log('[VideoGenerationService] ⏭️ Skipping duplicate submission, returning existing task');
        
        return {
          success: true,
          taskId: existingTask.task_id,
          volcTaskId: existingTask.volcengine_task_id || '',
          message: '该分镜已有正在进行或已完成的任务，已返回现有任务ID',
        };
      }
      
      console.log('[VideoGenerationService] 🆕 No existing active task found, creating new task');
    }

    // 获取或创建用户（如果提供了userPhone）
    let user = null;
    if (userPhone) {
      user = await db.getOrCreateUser(userPhone);
      console.log('[VideoGenerationService] User:', user.phone);
    }

    // 🆕 智能选择最优模型
    const selectedModel = selectOptimalModel({
      duration: duration,
      resolution: resolution,
      fps: fps,
      enableAudio: enableAudio,
      imageCount: finalImages?.length || 1,
      quality: quality,
      speed: speed,
      model: model,
    });

    // 🆕 根据模型调整参数
    const adjustedParams = adjustParamsForModel(selectedModel, {
      duration: duration,
      resolution: resolution,
      fps: fps,
    });

    console.log('[VideoGenerationService] ========== 最终配置 ==========');
    console.log('[VideoGenerationService] 选中模型:', selectedModel);
    console.log('[VideoGenerationService] 调整后时长:', adjustedParams.duration);
    console.log('[VideoGenerationService] 调整后分辨率:', adjustedParams.resolution);
    console.log('[VideoGenerationService] 调整后帧率:', adjustedParams.fps);
    console.log('[VideoGenerationService] 音频:', enableAudio);
    console.log('[VideoGenerationService] ===========================================');

    // 获取风格提示词
    const stylePrompt = STYLE_PROMPTS[style] || STYLE_PROMPTS.comic;

    // 创建任务记录
    const taskId = `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    console.log('[VideoGenerationService] Creating task:', taskId);

    // 🆕 如果有storyboardId，获取scene_number作为storyboardNumber
    let storyboardNumber: number | undefined;
    let episodeNumber: number | undefined;
    
    if (storyboardId) {
      try {
        const { data: storyboard } = await db.supabase
          .from('storyboards')
          .select('scene_number, episode_id')
          .eq('id', storyboardId)
          .single();
        
        if (storyboard) {
          storyboardNumber = storyboard.scene_number;
          console.log('[VideoGenerationService] 📍 Storyboard scene_number:', storyboardNumber);
          
          // 🆕 获取episodeNumber
          if (storyboard.episode_id) {
            const { data: episode } = await db.supabase
              .from('series_episodes')
              .select('episode_number')
              .eq('id', storyboard.episode_id)
              .single();
            
            if (episode) {
              episodeNumber = episode.episode_number;
              console.log('[VideoGenerationService] 📍 Episode number:', episodeNumber);
            }
          }
        }
      } catch (err) {
        console.warn('[VideoGenerationService] ⚠️ Failed to get storyboard number:', err);
      }
    }

    await db.createVideoTask({
      taskId,
      userPhone: userPhone || 'system',
      prompt: finalDescription,
      style,
      duration: adjustedParams.duration.toString(),
      model: selectedModel,
      resolution: adjustedParams.resolution,
      fps: adjustedParams.fps,
      enableAudio: enableAudio,
      imageUrls: finalImages,
      seriesId,
      episodeId,
      storyboardId,
      storyboardNumber, // 🆕 传递scene_number
      episodeNumber, // 🆕 传递episodeNumber
    });

    // 🆕 关联任务到分镜（如果有storyboardId）
    if (storyboardId) {
      console.log('[VideoGenerationService] Linking task to storyboard:', taskId, '->', storyboardId);
      try {
        await db.linkTaskToStoryboard(taskId, storyboardId);
        console.log('[VideoGenerationService] ✅ Successfully linked task to storyboard');
      } catch (linkError) {
        console.error('[VideoGenerationService] ⚠️  Failed to link task to storyboard:', linkError);
        // 不中断流程，继续生成视频
      }
    }

    // 上传图片到存储
    console.log('[VideoGenerationService] Uploading images to storage...');
    const uploadResult = await uploadImagesToStorage(finalImages);
    if (!uploadResult.success) {
      await db.updateVideoTaskStatus(taskId, 'failed', undefined, undefined, uploadResult.error || '图片上传失败');
      return {
        success: false,
        taskId,
        volcTaskId: '',
        error: uploadResult.error || '图片上传失败',
      };
    }

    // 构建内容数组
    const contentArray = buildContentArray(
      uploadResult.publicUrls, 
      stylePrompt, 
      finalDescription,
      adjustedParams.duration
    );

    // 调用火山引擎API
    console.log('[VideoGenerationService] Calling Volcengine API...');
    const apiKey = Deno.env.get("VOLCENGINE_API_KEY");
    if (!apiKey) {
      console.error('[VideoGenerationService] VOLCENGINE_API_KEY not configured');
      await db.updateVideoTaskStatus(taskId, 'failed', undefined, undefined, 'API密钥未配置');
      return {
        success: false,
        taskId,
        volcTaskId: '',
        error: 'API密钥未配置',
      };
    }

    const requestBody: any = {
      model: selectedModel,
      content: contentArray,
      return_last_frame: true,
    };
    
    if (enableAudio === true) {
      requestBody.enable_audio = true;
      console.log('[VideoGenerationService] 🎵 Audio enabled in request');
    }

    console.log('[VideoGenerationService] ========== REQUEST DETAILS ==========');
    console.log('[VideoGenerationService] URL:', API_CONFIG.BASE_URL);
    console.log('[VideoGenerationService] Method: POST');
    console.log('[VideoGenerationService] Request Body:', JSON.stringify(requestBody, null, 2));
    console.log('[VideoGenerationService] ===========================================');

    const response = await fetchWithRetry(
      API_CONFIG.BASE_URL, 
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      },
      180000,
      3
    );

    const responseText = await response.text();
    console.log('[VideoGenerationService] API response status:', response.status);

    let result: any;
    try {
      result = JSON.parse(responseText);
    } catch (parseError: any) {
      console.error('[VideoGenerationService] Failed to parse API response:', parseError.message);
      await db.updateVideoTaskStatus(taskId, 'failed', undefined, undefined, '响应解析失败');
      return {
        success: false,
        taskId,
        volcTaskId: '',
        error: 'API响应格式错误',
      };
    }

    if (!response.ok) {
      console.error('[VideoGenerationService] API error:', result);
      const errorMessage = result.error?.message || result.message || "Unknown error";
      await db.updateVideoTaskStatus(taskId, 'failed', undefined, undefined, errorMessage);
      return {
        success: false,
        taskId,
        volcTaskId: '',
        error: errorMessage,
        message: '视频生成失败',
      };
    }

    // 提取任务ID
    const volcTaskId = result.id || result.task_id || result.data?.id;
    if (!volcTaskId) {
      console.error('[VideoGenerationService] No task ID in response:', result);
      await db.updateVideoTaskStatus(taskId, 'failed', undefined, undefined, '未获取到任务ID');
      return {
        success: false,
        taskId,
        volcTaskId: '',
        error: '未获取到任务ID',
      };
    }

    console.log('[VideoGenerationService] ✅ Video generation task created:', volcTaskId);

    // 更新任务状态
    await db.updateVideoTaskStatus(taskId, 'processing', undefined, undefined, undefined, volcTaskId);

    return {
      success: true,
      taskId,
      volcTaskId,
      message: '视频生成任务已创建',
    };

  } catch (error: any) {
    console.error('[VideoGenerationService] Error:', error);
    return {
      success: false,
      taskId: '',
      volcTaskId: '',
      error: error.message,
      message: '服务器错误',
    };
  }
}

/**
 * 为分镜生成视频的便捷函数
 * @param storyboardId 分镜ID
 * @param prompt 视频描述
 * @param style 视频风格
 * @param duration 视频时长（秒）
 * @param images 参考图片URL数组
 * @returns 视频生成结果
 */
export async function generateVideoForStoryboard(
  storyboardId: string,
  prompt: string,
  style: string = 'comic',
  duration: number = 8,
  images: string[] = []
): Promise<VideoGenerationResult> {
  console.log('[VideoGenerationService] 🎬 Generating video for storyboard:', storyboardId);
  
  return await generateVideo({
    userPhone: 'system',
    prompt,
    style,
    duration,
    imageUrls: images,
    storyboardId,
    enableAudio: false, // 分镜视频默认不开启音频
  });
}