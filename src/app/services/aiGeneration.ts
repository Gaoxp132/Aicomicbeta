import { getApiUrl, getDefaultApiHeaders } from '../constants/api';
import { STYLE_STORIES } from '../constants/videoGeneration';
import type { ImageMode } from '../utils/modelSelection';

// AI生成故事
export async function generateStoryWithAI(
  imageUrls: string[],
  existingText: string,
  selectedStyle: string,
  selectedDuration: string,
  selectedResolution: string,
  enableAudio: boolean,
  imageMode: ImageMode
): Promise<string> {
  console.log('[AI Story] Starting story generation...');

  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    console.log('[AI Story] ⏰ Request timeout after 120s');
    controller.abort();
  }, 120000); // 120秒超时（增加到2分钟以适应AI服务响应时间）

  try {
    const requestUrl = getApiUrl('/ai/generate-story-enhanced');
    const requestBody = { 
      imageUrls: imageUrls.length > 0 ? imageUrls : undefined,
      existingText: existingText || undefined,
      style: selectedStyle,
      duration: selectedDuration,
      resolution: selectedResolution,
      enableAudio: enableAudio,
      imageMode: imageMode,
    };
    
    console.log('[AI Story] 📤 Sending request to:', requestUrl);
    console.log('[AI Story] 📦 Request body:', JSON.stringify(requestBody, null, 2));
    
    const response = await fetch(requestUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getDefaultApiHeaders(),
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    
    console.log('[AI Story] 📥 Response received');
    console.log('[AI Story] Status:', response.status, response.statusText);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('[AI Story] ❌ Error response:', errorText);
      
      // 解析错误响应
      let errorData: any;
      try {
        errorData = JSON.parse(errorText);
      } catch (e) {
        errorData = { message: errorText };
      }
      
      // ✅ 使用服务器返回的fallbackStory（如果有）
      if (errorData.fallbackStory && typeof errorData.fallbackStory === 'string' && errorData.fallbackStory.length > 10) {
        console.log('[AI Story] Using server fallback story');
        throw { 
          message: errorData.message || `HTTP ${response.status}`, 
          fallbackStory: errorData.fallbackStory,
          isTimeout: false
        };
      }
      
      // 如果服务器没有提供fallback，使用本地的
      const currentStyleStories = STYLE_STORIES[selectedStyle] || STYLE_STORIES.anime;
      const randomStory = currentStyleStories[Math.floor(Math.random() * currentStyleStories.length)];
      
      console.log('[AI Story] Using local fallback story');
      throw { 
        message: errorData.message || `HTTP ${response.status}`, 
        fallbackStory: randomStory,
        isTimeout: false
      };
    }
    
    const data = await response.json();

    console.log('[AI Story] Response data:', { 
      success: data.success, 
      fallback: data.fallback,
      storyLength: data.story?.length 
    });

    if (!data.success) {
      // 使用本地fallback
      const currentStyleStories = STYLE_STORIES[selectedStyle] || STYLE_STORIES.anime;
      const randomStory = currentStyleStories[Math.floor(Math.random() * currentStyleStories.length)];
      throw { 
        message: data.message || '故事生成失败',
        fallbackStory: randomStory,
        isTimeout: false
      };
    }

    // ✅ 使用服务器返回的故事（无论是AI生成还是fallback）
    console.log('[AI Story] ✅ Using server story:', data.fallback ? '(fallback)' : '(AI generated)');
    return data.story;
  } catch (error: any) {
    clearTimeout(timeoutId);
    
    console.error('[AI Story] ❌ Generation failed');
    console.error('[AI Story] Error type:', error.constructor.name);
    console.error('[AI Story] Error name:', error.name);
    console.error('[AI Story] Error message:', error.message);
    
    // 检查是否是超时错误
    const isTimeout = error.name === 'AbortError' || 
                     error.message?.includes('timeout') || 
                     error.message?.includes('timed out') ||
                     error.message?.includes('Connection timed out');
    
    // 始终使用本地示例故事作为降级方案
    const currentStyleStories = STYLE_STORIES[selectedStyle] || STYLE_STORIES.anime;
    const randomStory = currentStyleStories[Math.floor(Math.random() * currentStyleStories.length)];
    
    // 如果错误对象已经包含fallbackStory，验证它是否合理
    if (error.fallbackStory && typeof error.fallbackStory === 'string' && error.fallbackStory.length > 10) {
      console.log('[AI Story] ⏰ Using fallback story from error object');
      throw { ...error, isTimeout };
    }
    
    if (isTimeout) {
      console.log('[AI Story] ⏰ Timeout detected, using local fallback');
      throw { 
        message: 'AI服务响应超时，使用预设故事', 
        isTimeout: true, 
        fallbackStory: randomStory 
      };
    }
    
    // 其他错误情况 - 也提供降级故事
    console.log('[AI Story] 💔 Other error, providing local fallback');
    throw { 
      message: error.message || 'AI服务暂时不可用，使用预设故事', 
      isTimeout: false, 
      fallbackStory: randomStory 
    };
  }
}

// AI生成图片
export async function generateImageWithAI(
  prompt: string,
  imageType: 'first_frame' | 'last_frame' | 'reference',
  useTongyiImage: boolean = false
): Promise<string> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    console.log('[AI Image] Request timeout after 60s');
    controller.abort();
  }, 60000); // 60秒超时

  try {
    console.log('[AI Image] Starting generation...');
    
    // 根据开关选择API
    const apiUrl = useTongyiImage 
      ? '/ai/aliyun/text-to-image-sync'
      : '/ai/text-to-image';
    
    console.log('[AI Image] Using engine:', useTongyiImage ? 'Aliyun Tongyi Wanxiang (通义万相)' : 'Doubao (豆包)');
    console.log('[AI Image] Request URL:', getApiUrl(apiUrl));
    
    const requestBody = useTongyiImage
      ? {
          prompt: prompt.trim(),
          size: '1024*1024',
          style: '<auto>', // 自动选择风格
        }
      : {
          prompt: prompt.trim(),
          imageType: imageType,
        };
    
    const response = await fetch(
      getApiUrl(apiUrl),
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getDefaultApiHeaders(),
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      }
    );

    clearTimeout(timeoutId);
    
    console.log('[AI Image] Response status:', response.status);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('[AI Image] Error response:', errorText);
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const data = await response.json();

    if (!data.success) {
      throw new Error(data.message || '图片生成失败');
    }

    console.log('[AI Image] 生成的图片URL:', data.imageUrl.substring(0, 100) + '...');
    return data.imageUrl;
  } catch (error: any) {
    clearTimeout(timeoutId);
    console.error('[AI Image] Generation failed:', error);
    throw error;
  }
}

// AI润色图片提示词
export async function polishImagePrompt(
  prompt: string,
  imageType: 'first_frame' | 'last_frame' | 'reference'
): Promise<string> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    console.log('[AI Polish] Request timeout after 30s');
    controller.abort();
  }, 30000); // 30秒超时

  try {
    console.log('[AI Polish] Starting prompt polish...');
    console.log('[AI Polish] Request URL:', getApiUrl('/ai/polish-image-prompt'));
    
    const response = await fetch(
      getApiUrl('/ai/polish-image-prompt'),
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getDefaultApiHeaders(),
        },
        body: JSON.stringify({
          prompt: prompt.trim(),
          imageType: imageType,
        }),
        signal: controller.signal,
      }
    );

    clearTimeout(timeoutId);
    
    console.log('[AI Polish] Response status:', response.status);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('[AI Polish] Error response:', errorText);
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const data = await response.json();

    if (!data.success) {
      throw new Error(data.message || '润色失败');
    }

    console.log('[AI Polish] 润色后的提示词:', data.polishedPrompt);
    return data.polishedPrompt;
  } catch (error: any) {
    clearTimeout(timeoutId);
    console.error('[AI Polish] Polish failed:', error);
    throw error;
  }
}