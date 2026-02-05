// Prompt Polish 提示词优化功能
import type { Context } from "npm:hono";
import { fetchWithRetry } from "../utils.tsx";

/**
 * AI润色图片提示词 - 优化用户输入的图片描述
 */
export async function handlePolishImagePrompt(c: Context) {
  try {
    const { prompt, imageType } = await c.req.json();
    const apiKey = Deno.env.get("VOLCENGINE_API_KEY");
    
    if (!apiKey) {
      console.log("Error: VOLCENGINE_API_KEY not configured");
      return c.json({ error: "API密钥未配置" }, 500);
    }

    if (!prompt || prompt.trim().length === 0) {
      return c.json({ error: "提示词不能为空" }, 400);
    }

    console.log("=== AI Polish Image Prompt Request ===");
    console.log("Original prompt:", prompt);
    console.log("Image Type:", imageType);

    const typeDescriptions: Record<string, string> = {
      'first_frame': '这是视频的首帧画面，需要有强烈的视觉冲击力和吸引力',
      'last_frame': '这是视频的尾帧画面，需要有情感张力或戏剧性结局',
      'reference': '这是参考图片，需要包含丰富的视觉元素和氛围',
    };

    const typeDesc = typeDescriptions[imageType] || '这是一张图片';

    const requestBody = {
      model: "doubao-seed-1-8-251228",
      messages: [
        {
          role: "system",
          content: "你是一个专业的AI图片生成提示词专家。你擅长将简单的描述扩展成详细、专业、富有画面感的图片生成提示词。你了解各种艺术风格、光影效果、构图技巧。",
        },
        {
          role: "user",
          content: `用户想要生成一张图片，原始描述是："${prompt}"。\\n\\n${typeDesc}。\\n\\n请你优化和扩展这个描述，要求：\\n1) 保留用户的核心意图不变\\n2) 添加具体的视觉细节（光影、色彩、构图、氛围等）\\n3) 明确艺术风格（如果用户没有指定）\\n4) 80-150字左右\\n5) 使用适合AI图片生成的专业描述语言\\n6) 直接输出优化后的提示词，不要有任何前缀或解释\\n\\n优化后的提示词：`,
        },
      ],
      temperature: 0.7,
      max_tokens: 300,
    };

    console.log("Calling Volcengine AI API for prompt polishing...");

    const response = await fetchWithRetry("https://ark.cn-beijing.volces.com/api/v3/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify(requestBody),
    });

    const responseText = await response.text();
    console.log("AI response status:", response.status);

    let result: any;
    try {
      result = JSON.parse(responseText);
    } catch (parseErr) {
      console.error("Failed to parse AI response:", parseErr);
      return c.json({ 
        error: "AI返回格式错误", 
        rawResponse: responseText.substring(0, 200) 
      }, 500);
    }

    if (!response.ok) {
      console.error("AI API error:", result);
      return c.json({ 
        error: "提示词润色失败", 
        details: result,
        message: result.error?.message || "Unknown error"
      }, response.status);
    }

    const polishedPrompt = result.choices?.[0]?.message?.content || "";
    
    if (!polishedPrompt) {
      console.error("No polished prompt in response:", result);
      return c.json({ 
        error: "提示词润色失败", 
        message: "AI未返回优化结果" 
      }, 500);
    }

    console.log("=== Prompt Polished Successfully ===");
    console.log("Polished prompt:", polishedPrompt);

    return c.json({ 
      success: true, 
      polishedPrompt: polishedPrompt.trim(),
    });

  } catch (error: any) {
    console.error("=== Error in prompt polishing ===");
    console.error("Error:", error.message);
    console.error("Stack:", error.stack);
    return c.json({ 
      error: "提示词润色失败", 
      message: error.message 
    }, 500);
  }
}