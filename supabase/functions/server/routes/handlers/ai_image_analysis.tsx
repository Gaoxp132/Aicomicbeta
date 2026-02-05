/**
 * AI图片分析Handler
 * 从 routes_ai.tsx 提取
 * 负责：图片分析和多图分析
 */

import type { Context } from "npm:hono";
import { fetchWithRetry } from "../../utils.tsx";

const VOLCENGINE_API_URL = 'https://ark.cn-beijing.volces.com/api/v3/chat/completions';
const MODEL_NAME = 'doubao-seed-1-8-251228';

/**
 * AI图片分析 - 根据上传的图片生成故事描述
 */
export async function handleAnalyzeImage(c: Context) {
  try {
    const { imageUrl } = await c.req.json();
    const apiKey = Deno.env.get("VOLCENGINE_API_KEY");
    
    if (!apiKey) {
      console.log("[ImageAnalysis] Error: VOLCENGINE_API_KEY not configured");
      return c.json({ error: "API密钥未配置" }, 500);
    }

    if (!imageUrl) {
      return c.json({ error: "图片URL不能为空" }, 400);
    }

    console.log("[ImageAnalysis] === AI Image Analysis Request ===");
    console.log("[ImageAnalysis] Image URL provided:", imageUrl.substring(0, 100) + "...");

    const requestBody = {
      model: MODEL_NAME,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: {
                url: imageUrl,
              },
            },
            {
              type: "text",
              text: "请仔细分析这张图片，并根据图片内容创作一个适合制作成AI漫剧/短剧的故事描述。要求：1) 30-80字左右 2) 包含人物、场景和情节 3) 富有戏剧性和画面感 4) 适合5-12秒的短视频呈现。直接输出故事描述，不要有任何前缀或解释。",
            },
          ],
        },
      ],
      temperature: 0.8,
      max_tokens: 200,
    };

    console.log("[ImageAnalysis] Calling Volcengine AI API for image analysis...");

    const response = await fetchWithRetry(VOLCENGINE_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify(requestBody),
    });

    const responseText = await response.text();
    console.log("[ImageAnalysis] AI response status:", response.status);

    let result: any;
    try {
      result = JSON.parse(responseText);
    } catch (parseErr) {
      console.error("[ImageAnalysis] Failed to parse AI response:", parseErr);
      return c.json({ error: "AI返回格式错误", rawResponse: responseText.substring(0, 200) }, 500);
    }

    if (!response.ok) {
      console.error("[ImageAnalysis] AI API error:", result);
      return c.json({ 
        error: "AI图片分析失败", 
        details: result,
        message: result.error?.message || "Unknown error"
      }, response.status);
    }

    const storyDescription = result.choices?.[0]?.message?.content || "";
    
    console.log("[ImageAnalysis] === AI Image Analysis Completed ===");
    console.log("[ImageAnalysis] Generated story:", storyDescription);

    return c.json({ 
      success: true, 
      story: storyDescription.trim(),
    });

  } catch (error: any) {
    console.error("[ImageAnalysis] === Error in AI image analysis ===");
    console.error("[ImageAnalysis] Error:", error.message);
    return c.json({ 
      error: "AI图片分析失败", 
      message: error.message 
    }, 500);
  }
}

/**
 * AI多图片分析 - 根据多张图片生成故事
 */
export async function handleAnalyzeImages(c: Context) {
  try {
    const { imageUrls } = await c.req.json();
    const apiKey = Deno.env.get("VOLCENGINE_API_KEY");
    
    if (!apiKey) {
      console.log("[ImageAnalysis] Error: VOLCENGINE_API_KEY not configured");
      return c.json({ error: "API密钥未配置" }, 500);
    }

    if (!Array.isArray(imageUrls) || imageUrls.length === 0) {
      return c.json({ error: "图片URL数组不能为空" }, 400);
    }

    console.log("[ImageAnalysis] === AI Multi-Image Analysis Request ===");
    console.log("[ImageAnalysis] Number of images:", imageUrls.length);

    // 构建包含多张图片的content数组
    const content: any[] = imageUrls.map((url: string) => ({
      type: "image_url",
      image_url: {
        url: url,
      },
    }));

    // 添加文本提示
    content.push({
      type: "text",
      text: "请仔细分析这些图片，并根据所有图片的内容创作一个连贯的AI漫剧/短剧故事描述。要求：1) 30-80字左右 2) 整合所有图片中的元素 3) 创造连贯的故事线 4) 富有戏剧性和画面感 5) 适合5-12秒的短视频呈现。直接输出故事描述，不要有任何前缀或解释。",
    });

    const requestBody = {
      model: MODEL_NAME,
      messages: [
        {
          role: "user",
          content: content,
        },
      ],
      temperature: 0.8,
      max_tokens: 200,
    };

    console.log("[ImageAnalysis] Calling Volcengine AI API for multi-image analysis...");

    const response = await fetchWithRetry(VOLCENGINE_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify(requestBody),
    });

    const responseText = await response.text();
    console.log("[ImageAnalysis] AI response status:", response.status);

    let result: any;
    try {
      result = JSON.parse(responseText);
    } catch (parseErr) {
      console.error("[ImageAnalysis] Failed to parse AI response:", parseErr);
      return c.json({ error: "AI返回格式错误", rawResponse: responseText.substring(0, 200) }, 500);
    }

    if (!response.ok) {
      console.error("[ImageAnalysis] AI API error:", result);
      return c.json({ 
        error: "AI多图片分析失败", 
        details: result,
        message: result.error?.message || "Unknown error"
      }, response.status);
    }

    const storyDescription = result.choices?.[0]?.message?.content || "";
    
    console.log("[ImageAnalysis] === AI Multi-Image Analysis Completed ===");
    console.log("[ImageAnalysis] Generated story:", storyDescription);

    return c.json({ 
      success: true, 
      story: storyDescription.trim(),
    });

  } catch (error: any) {
    console.error("[ImageAnalysis] === Error in AI multi-image analysis ===");
    console.error("[ImageAnalysis] Error:", error.message);
    return c.json({ 
      error: "AI多图片分析失败", 
      message: error.message 
    }, 500);
  }
}
