/**
 * AI故事生成Handler
 * 从 routes_ai.tsx 提取
 * 负责：随机故事生成和增强型故事生成
 */

import type { Context } from "npm:hono";
import { fetchWithRetry } from "../../utils.tsx";
import { handleGenerateStoryEnhanced } from "../../ai/story_generator.tsx";

const VOLCENGINE_API_URL = 'https://ark.cn-beijing.volces.com/api/v3/chat/completions';
const MODEL_NAME = 'doubao-seed-1-8-251228';

/**
 * AI随机故事生成 - 创建随机故事描述
 */
export async function handleGenerateStory(c: Context) {
  try {
    const apiKey = Deno.env.get("VOLCENGINE_API_KEY");
    
    if (!apiKey) {
      console.log("[StoryGeneration] Error: VOLCENGINE_API_KEY not configured");
      return c.json({ error: "API密钥未配置" }, 500);
    }

    console.log("[StoryGeneration] === AI Random Story Generation Request ===");

    const requestBody = {
      model: MODEL_NAME,
      messages: [
        {
          role: "system",
          content: "你是一个专业的AI漫剧/短剧编剧。你擅长创作富有创意、戏剧性强、画面感丰富的短故事。",
        },
        {
          role: "user",
          content: "请创作一个全新的、富有创意的AI漫剧故事描述。要求：1) 30-80字左右 2) 包含明确的人物、场景和情节冲突 3) 具有强烈的画面感和戏剧张力 4) 适合制成5-12秒的短视频 5) 题材多样化（可以是科幻、奇幻、悬疑、冒险、浪漫等）6) 直接输出故事描述，不要有任何前缀、解释或标题。",
        },
      ],
      temperature: 0.95,
      max_tokens: 200,
    };

    console.log("[StoryGeneration] Calling Volcengine AI API for story generation...");

    const response = await fetchWithRetry(VOLCENGINE_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify(requestBody),
    });

    const responseText = await response.text();
    console.log("[StoryGeneration] AI response status:", response.status);

    let result: any;
    try {
      result = JSON.parse(responseText);
    } catch (parseErr) {
      console.error("[StoryGeneration] Failed to parse AI response:", parseErr);
      return c.json({ error: "AI返回格式错误", rawResponse: responseText.substring(0, 200) }, 500);
    }

    if (!response.ok) {
      console.error("[StoryGeneration] AI API error:", result);
      return c.json({ 
        error: "AI故事生成失败", 
        details: result,
        message: result.error?.message || "Unknown error"
      }, response.status);
    }

    const storyDescription = result.choices?.[0]?.message?.content || "";
    
    console.log("[StoryGeneration] === AI Random Story Generation Completed ===");
    console.log("[StoryGeneration] Generated story:", storyDescription);

    return c.json({ 
      success: true, 
      story: storyDescription.trim(),
    });

  } catch (error: any) {
    console.error("[StoryGeneration] === Error in AI story generation ===");
    console.error("[StoryGeneration] Error:", error.message);
    return c.json({ 
      error: "AI故事生成失败", 
      message: error.message 
    }, 500);
  }
}

/**
 * 增强型故事生成 - 使用story_generator.tsx模块
 */
export async function handleGenerateStoryEnhancedWrapper(c: Context) {
  return handleGenerateStoryEnhanced(c);
}
