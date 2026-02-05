import { MODEL_CAPABILITIES } from '../constants/videoGeneration';

export type ImageMode = 'first_frame' | 'first_last' | 'reference';

// 智能匹配最优模型
export function getOptimalModel(
  imageUrls: string[],
  imageMode: ImageMode,
  selectedResolution: string,
  selectedDuration: string,
  enableAudio: boolean,
  useTongyi: boolean = false
): string {
  const imageCount = imageUrls.length;
  const isHighRes = selectedResolution === '1080p' || selectedResolution === '2k';
  
  // 🌟 优先级0：如果开启通义，强制使用Wan2.1-14B模型（最高优先级，不受音频影响）
  // 通义模型不支持音频，如果用户开启了通义，音频选项应该被禁用
  if (useTongyi) {
    const tongyiModel = MODEL_CAPABILITIES['aliyun-wan-2.1-14b'];
    
    console.log('[ModelSelection] 🌟 Tongyi mode enabled, using aliyun-wan-2.1-14b (ignoring audio setting)');
    
    // 检查图片数量是否在支持范围内
    if (imageCount >= tongyiModel.minImages && imageCount <= tongyiModel.maxImages) {
      // 检查时长支持
      if (tongyiModel.durations.includes(selectedDuration)) {
        // 检查分辨率支持
        if (tongyiModel.resolutions.includes(selectedResolution)) {
          // 检查图片模式支持
          const modeSupported = 
            (imageCount === 0 && tongyiModel.supportsTextToVideo) ||
            (imageMode === 'first_frame' && imageCount === 1 && tongyiModel.supportsFirstFrame) ||
            (imageMode === 'first_last' && imageCount <= 2 && tongyiModel.supportsFirstLastFrame) ||
            (imageMode === 'reference' && tongyiModel.supportsReferenceImages);
          
          if (modeSupported) {
            console.log('[ModelSelection] ✅ Tongyi model fully compatible with current config');
            return 'aliyun-wan-2.1-14b';
          }
        }
      }
    }
    
    // 如果通义模型不支持当前配置，仍然返回通义模型（让上层调整配置）
    console.warn('[ModelSelection] ⚠️ Tongyi enabled but config not fully compatible, still using aliyun-wan-2.1-14b');
    return 'aliyun-wan-2.1-14b';
  }
  
  // ✨ 优先级1：如果开启音频且未开启通义，才使用支持音频的模型
  // 音频模型 doubao-seedance-1-5-pro-251215 只支持 480p/720p
  if (enableAudio && !useTongyi) {
    const audioModel = MODEL_CAPABILITIES['doubao-seedance-1-5-pro-251215'];
    
    // 🎵 开启音频时，自动调整配置以兼容音频模型
    let compatibleResolution = selectedResolution;
    let compatibleDuration = selectedDuration;
    
    // 检查并调整分辨率（音频模型不支持1080p）
    if (!audioModel.resolutions.includes(selectedResolution)) {
      compatibleResolution = audioModel.resolutions.includes('720p') ? '720p' : audioModel.resolutions[0];
      console.log(`[ModelSelection] 🎵 Auto-adjusted resolution for audio: ${selectedResolution} → ${compatibleResolution}`);
    }
    
    // 检查并调整时长
    if (!audioModel.durations.includes(selectedDuration)) {
      const durationNum = parseInt(selectedDuration);
      compatibleDuration = audioModel.durations.find(d => parseInt(d) >= durationNum) || 
                          audioModel.durations[audioModel.durations.length - 1];
      console.log(`[ModelSelection] 🎵 Auto-adjusted duration for audio: ${selectedDuration} → ${compatibleDuration}`);
    }
    
    // 检查图片数量是否在支持范围内
    if (imageCount >= audioModel.minImages && imageCount <= audioModel.maxImages) {
      // 检查图片模式支持
      const modeSupported = 
        (imageCount === 0 && audioModel.supportsTextToVideo) ||
        (imageMode === 'first_frame' && imageCount === 1 && audioModel.supportsFirstFrame) ||
        (imageMode === 'first_last' && imageCount <= 2 && audioModel.supportsFirstLastFrame);
      
      if (modeSupported) {
        console.log('[ModelSelection] 🎵 Audio enabled, using audio model with compatible config:', {
          model: 'doubao-seedance-1-5-pro-251215',
          resolution: compatibleResolution,
          duration: compatibleDuration,
          imageMode,
          imageCount
        });
        return 'doubao-seedance-1-5-pro-251215';
      }
    }
    
    // 如果图片数量或模式不兼容，给出警告
    console.warn('[ModelSelection] ⚠️ Audio enabled but image config not compatible:', {
      imageCount,
      imageMode,
      supportedRange: `${audioModel.minImages}-${audioModel.maxImages}`,
      supportsReference: audioModel.supportsReferenceImages
    });
    
    // 仍然返回音频模型，让UI层决定如何处理
    return 'doubao-seedance-1-5-pro-251215';
  }
  
  // 按优先级排序所有模型
  const sortedModels = Object.entries(MODEL_CAPABILITIES)
    .map(([id, cap]) => ({ id, ...cap }))
    .sort((a, b) => b.priority - a.priority);
  
  // 筛选符合条件的模型
  const compatibleModels = sortedModels.filter(model => {
    // ✅ 修复：不再跳过音频模型，即使没开启音频也可以使用
    // 1.5版本是最高质量的模型，应该优先使用
    
    // 检查图片数量范围
    if (imageCount < model.minImages || imageCount > model.maxImages) return false;
    
    // 检查分辨率支持
    if (!model.resolutions.includes(selectedResolution)) return false;
    
    // 检查时长支持
    if (!model.durations.includes(selectedDuration)) return false;
    
    // 检查图生视频/文生视频支持
    if (imageCount === 0 && !model.supportsTextToVideo) return false;
    
    // 检查图片模式支持
    if (imageMode === 'first_last' && imageCount === 2 && !model.supportsFirstLastFrame) return false;
    if (imageMode === 'reference' && !model.supportsReferenceImages) return false;
    if (imageMode === 'first_frame' && imageCount === 1 && !model.supportsFirstFrame) return false;
    
    return true;
  });
  
  // 如果有完全兼容的模型，返回优先级最高的
  if (compatibleModels.length > 0) {
    console.log('[ModelSelection] ✅ Using compatible model:', compatibleModels[0].id);
    return compatibleModels[0].id;
  }
  
  // 如果没有完全兼容的模型，尝试放宽条件
  // 优先保证分辨率，如果选择了1080p
  if (isHighRes) {
    if (imageMode === 'reference' || imageCount >= 3) {
      return 'doubao-seedance-1-0-lite-i2v-250428';
    } else if (imageMode === 'first_last' && imageCount === 2) {
      return 'doubao-seedance-1-0-pro-250528';
    } else if (imageCount <= 1) {
      return 'doubao-seedance-1-0-pro-250528';
    }
  }
  
  // 根据图片模式和数量选择
  if (imageMode === 'reference' && imageCount >= 1) {
    return 'doubao-seedance-1-0-lite-i2v-250428';
  } else if (imageMode === 'first_last') {
    if (imageCount === 2) {
      return isHighRes ? 'doubao-seedance-1-0-pro-250528' : 'doubao-seedance-1-0-lite-i2v-250428';
    } else if (imageCount === 1) {
      return isHighRes ? 'doubao-seedance-1-0-pro-250528' : 'doubao-seedance-1-0-pro-fast-251015';
    }
  } else if (imageMode === 'first_frame' && imageCount === 1) {
    return isHighRes ? 'doubao-seedance-1-0-pro-250528' : 'doubao-seedance-1-0-pro-fast-251015';
  }
  
  // 文生视频
  return isHighRes ? 'doubao-seedance-1-0-pro-250528' : 'doubao-seedance-1-0-lite-t2v-250428';
}

// 获取图片模式描述
export function getImageModeDescription(
  imageMode: ImageMode,
  imageCount: number
): string {
  if (imageCount === 0) {
    // 没有图片时，强调可以直接生成
    return '支持纯文字生成视频，无需上传图片';
  }
  
  if (imageMode === 'first_last') {
    if (imageCount === 1) return '已上传首帧，可继续上传尾帧';
    if (imageCount === 2) return 'AI将以第一张为首帧，第二张为尾帧生成视频';
  } else if (imageMode === 'reference') {
    return `已上传${imageCount}张参考图，AI将综合分析所有图片`;
  } else if (imageMode === 'first_frame') {
    return 'AI将以此图片为首帧生成视频';
  }
  
  return '';
}