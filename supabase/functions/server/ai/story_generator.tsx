// Enhanced Story Generator
import type { Context } from "npm:hono";
import { fetchWithRetry } from "../utils.tsx";
import { STYLE_STORIES } from "./story_templates.tsx";

/**
 * AI自动生成故事（增强版）- 综合图片和已有文字生成故事
 */
export async function handleGenerateStoryEnhanced(c: Context) {
  try {
    const { imageUrls, existingText, style, duration, resolution, enableAudio, imageMode } = await c.req.json();
    const apiKey = Deno.env.get("VOLCENGINE_API_KEY");
    
    if (!apiKey) {
      console.log("Error: VOLCENGINE_API_KEY not configured");
      return c.json({ error: "API密钥未配置", success: false }, 500);
    }

    console.log("=== AI Enhanced Story Generation Request ===");
    console.log(`Images: ${imageUrls?.length || 0}, Text: ${existingText ? 'yes' : 'no'}, Style: ${style}, Duration: ${duration}, Mode: ${imageMode}, Audio: ${enableAudio}`);

    const hasImages = imageUrls && Array.isArray(imageUrls) && imageUrls.length > 0;
    const hasText = existingText && existingText.trim().length > 0;

    // 🎲 添加随机种子，确保每次生成不同
    const randomSeed = Math.floor(Math.random() * 10000);
    const timestamp = Date.now();
    
    // 🎨 风格描述映射
    const styleDescriptions: Record<string, string> = {
      'realistic': '写实风格、真实感强',
      'anime': '动漫风格、二次元',
      'cartoon': '卡通风格、可爱有趣',
      'cyberpunk': '赛博朋克风格、科技未来感',
      'fantasy': '奇幻风格、魔法世界',
      'horror': '恐怖悬疑风格、紧张刺激',
      'romance': '浪漫爱情风格、温馨感人',
      'scifi': '科幻风格、太空未来',
      'historical': '历史古装风格、年代感',
      'comedy': '喜剧搞笑风格、轻松幽默',
      'action': '动作冒险风格、刺激热血',
      'documentary': '纪实风格、真实记录'
    };
    
    // 🎬 图片模式描述
    const imageModeDescriptions: Record<string, string> = {
      'first_frame': '单张首帧图片作为开场',
      'first_last': '两张图片（首帧和尾帧）展现故事发展',
      'reference': '多张参考图提供视觉风格指导'
    };

    let contentArray: any[] = [];
    let promptText = "";

    if (hasImages) {
      imageUrls.forEach((imageUrl: string) => {
        contentArray.push({
          type: "image_url",
          image_url: {
            url: imageUrl,
          },
        });
      });

      // 根据图片模式调整提示词
      const modeDesc = imageModeDescriptions[imageMode] || '图片参考';
      const styleDesc = styleDescriptions[style] || style;
      
      if (hasText) {
        if (imageUrls.length === 1) {
          promptText = `用户选择了${styleDesc}，视频时长${duration}秒${enableAudio ? '，需要配音' : ''}。用户提供了一张图片（${modeDesc}）和描述："${existingText}"。\n\n请分析图片内容，结合用户描述和所选风格，创作一个适合该风格和时长的完整故事。`;
        } else if (imageUrls.length === 2) {
          promptText = `用户选择了${styleDesc}，视频时长${duration}秒${enableAudio ? '，需要配音' : ''}。用户提供了2张图片（首帧和尾帧）以及描述："${existingText}"。\n\n请分析这2张图片的内容变化，结合用户描述和所选风格，创作一个展现从开始到结束转变的${duration}秒故事。`;
        } else {
          promptText = `用户选择了${styleDesc}，视频时长${duration}秒${enableAudio ? '，需要配音' : ''}。用户提供了${imageUrls.length}张参考图和描述："${existingText}"。\n\n请综合分析所有图片的风格和元素，结合用户描述，创作一个符合该风格、适合${duration}秒展现的连贯故事。`;
        }
      } else {
        if (imageUrls.length === 1) {
          promptText = `用户选择了${styleDesc}，视频时长${duration}秒${enableAudio ? '，需要配音' : ''}。请仔细分析这张图片，根据图片内容创作一个符合${styleDesc}、适合${duration}秒视频的故事。`;
        } else if (imageUrls.length === 2) {
          promptText = `用户选择了${styleDesc}，视频时长${duration}秒${enableAudio ? '，需要配音' : ''}。请分析这2张图片（首帧和尾帧），创作一个展现场景转变的${duration}秒${styleDesc}故事。`;
        } else {
          promptText = `用户选择了${styleDesc}，视频时长${duration}秒${enableAudio ? '，需要配音' : ''}。请分析这${imageUrls.length}张参考图，理解其风格和元素，创作一个符合该风格的${duration}秒故事。`;
        }
      }
    } else if (hasText) {
      const styleDesc = styleDescriptions[style] || style;
      promptText = `用户选择了${styleDesc}，视频时长${duration}秒${enableAudio ? '，需要配音' : ''}。用户提供的描述："${existingText}"。\n\n请基于这段描述，结合所选风格，进行润色和扩展，创作一个更加生动、完整、符合${styleDesc}、适合${duration}秒视频的故事。`;
    } else {
      const styleDesc = styleDescriptions[style] || style;
      // 🎲 完全随机生成 - 每次都不同
      const themes = ['冒险', '爱情', '悬疑', '奇幻', '科幻', '历史', '日常', '成长', '友情', '梦想'];
      const randomTheme = themes[randomSeed % themes.length];
      promptText = `用户选择了${styleDesc}，视频时长${duration}秒${enableAudio ? '，需要配音' : ''}。请创作一个全新的、富有创意的${randomTheme}主题${styleDesc}故事。要求每次生成都独特、新颖、不重复。`;
    }

    // 添加通用要求，根据时长调整字数
    const durationNum = parseInt(duration);
    let wordCount = '30-80';
    if (durationNum <= 5) {
      wordCount = '20-40';
    } else if (durationNum <= 8) {
      wordCount = '30-60';
    } else if (durationNum <= 12) {
      wordCount = '50-90';
    } else {
      wordCount = '60-100';
    }

    promptText += `\n\n要求：\n1) ${wordCount}字左右，适合${duration}秒视频\n2) 包含明确的人物、场景和情节\n3) 富有戏剧性和画面感\n${enableAudio ? '4) 适合配音朗读，语言流畅自然\n5) 直接输出故事描述，不要任何前缀、解释或标题' : '4) 视觉冲击力强\n5) 直接输出故事描述，不要任何前缀、解释或标题'}\n\n[随机种子: ${randomSeed}, 时间戳: ${timestamp}]`;

    contentArray.push({
      type: "text",
      text: promptText,
    });

    const requestBody = {
      model: "doubao-seed-1-8-251228",
      messages: [
        {
          role: "system",
          content: `你是一个专业的AI漫剧/短剧编剧。你擅长创作富有创意、戏剧性强、画面感丰富的短故事。你能够理解图片内容，并基于图片、文字描述、风格选择和视频参数创作精彩的故事。每次创作都要独特、新颖，绝不重复。当前时间: ${new Date().toISOString()}`,
        },
        {
          role: "user",
          content: hasImages ? contentArray : promptText,
        },
      ],
      temperature: 0.9, // 提高随机性
      max_tokens: 250,
    };

    console.log("Calling Volcengine AI API for enhanced story generation...");
    console.log("Request body:", JSON.stringify({
      model: requestBody.model,
      messagesCount: requestBody.messages.length,
      hasImages: hasImages,
      imagesCount: hasImages ? imageUrls.length : 0,
      temperature: requestBody.temperature,
      max_tokens: requestBody.max_tokens
    }));

    const response = await fetchWithRetry("https://ark.cn-beijing.volces.com/api/v3/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify(requestBody),
    }, 180000, 3); // 180秒超时（3分钟），最多重试3次

    const responseText = await response.text();
    console.log("AI response status:", response.status);

    let result: any;
    try {
      result = JSON.parse(responseText);
    } catch (parseErr) {
      console.error("Failed to parse AI response:", parseErr);
      return c.json({ error: "AI返回格式错误", rawResponse: responseText.substring(0, 200), success: false }, 500);
    }

    if (!response.ok) {
      console.error("AI API error:", result);
      return c.json({ 
        error: "AI故事生成失败", 
        details: result,
        message: result.error?.message || "Unknown error",
        success: false
      }, response.status);
    }

    const storyDescription = result.choices?.[0]?.message?.content || "";
    
    console.log("=== AI Enhanced Story Generated ===");
    console.log("Generated story:", storyDescription);

    return c.json({ 
      success: true, 
      story: storyDescription.trim(),
    });

  } catch (error: any) {
    console.error("=== Error in AI enhanced story generation ===");
    console.error("Error:", error.message);
    
    // 检查是否是超时或网络错误
    const isTimeout = error.message?.includes('timeout') || 
                     error.message?.includes('timed out') ||
                     error.message?.includes('Connection') ||
                     error.name === 'AbortError';
    
    // 如果是超时，返回一个fallback故事
    if (isTimeout) {
      console.log("AI service timeout, returning fallback story...");
      
      // 从模板中随机选择一个故事
      const availableStories = style && STYLE_STORIES[style] 
        ? STYLE_STORIES[style] 
        : STYLE_STORIES.anime;
      
      const fallbackStory = availableStories[Math.floor(Math.random() * availableStories.length)];
      
      return c.json({ 
        success: true,
        story: fallbackStory,
        fallback: true,
        fallbackReason: 'AI服务超时',
        fallbackStory: fallbackStory,
        message: 'AI服务响应超时使用预设故事'
      });
    }
    
    // 其他错误也返回fallback
    const availableStories = style && STYLE_STORIES[style] 
      ? STYLE_STORIES[style] 
      : STYLE_STORIES.anime;
    
    const fallbackStory = availableStories[Math.floor(Math.random() * availableStories.length)];
    
    return c.json({ 
      success: true,
      story: fallbackStory,
      fallback: true,
      fallbackReason: error.message,
      fallbackStory: fallbackStory,
      message: 'AI服务暂时不可用，使用预设故事'
    });
  }
}