// Text-to-Image 文生图功能
import type { Context } from "npm:hono";
import { fetchWithRetry } from "../utils.tsx";

/**
 * AI文生图 - 根据文字描述生成图片
 */
export async function handleTextToImage(c: Context) {
  try {
    const { prompt, imageType } = await c.req.json();
    const apiKey = Deno.env.get("VOLCENGINE_API_KEY");
    
    if (!apiKey) {
      console.log("Error: VOLCENGINE_API_KEY not configured");
      return c.json({ error: "API密钥未配置" }, 500);
    }

    if (!prompt || prompt.trim().length === 0) {
      return c.json({ error: "图片描述不能为空" }, 400);
    }

    console.log("=== AI Text-to-Image Request ===");
    console.log("Prompt:", prompt);
    console.log("Image Type:", imageType);

    const modelMap: Record<string, string> = {
      'first_frame': 'doubao-seedream-4-5-251128',
      'last_frame': 'doubao-seedream-4-5-251128',
      'reference': 'doubao-seedream-4-0-250828',
    };

    const selectedModel = modelMap[imageType] || 'doubao-seedream-4-5-251128';
    console.log(`Selected model for ${imageType}:`, selectedModel);

    const requestBody = {
      model: selectedModel,
      prompt: prompt.trim(),
      n: 1,
      size: "1920x1920",
      response_format: "b64_json",
    };

    console.log("Calling Volcengine Text-to-Image API...");
    console.log("Request body:", JSON.stringify(requestBody, null, 2));

    const response = await fetchWithRetry("https://ark.cn-beijing.volces.com/api/v3/images/generations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify(requestBody),
    });

    const responseText = await response.text();
    console.log("Text-to-Image API response status:", response.status);
    console.log("Response text (first 200 chars):", responseText.substring(0, 200));

    let result: any;
    try {
      result = JSON.parse(responseText);
    } catch (parseErr) {
      console.error("Failed to parse API response:", parseErr);
      return c.json({ 
        error: "API返回格式错误", 
        rawResponse: responseText.substring(0, 200) 
      }, 500);
    }

    if (!response.ok) {
      console.error("Text-to-Image API error:", result);
      return c.json({ 
        error: "图片生成失败", 
        details: result,
        message: result.error?.message || "Unknown error"
      }, response.status);
    }

    const imageB64 = result.data?.[0]?.b64_json || "";
    
    if (!imageB64) {
      console.error("No image data in response:", result);
      return c.json({ 
        error: "图片生成失败", 
        message: "API未返回图片数据" 
      }, 500);
    }

    console.log("=== Image Generated Successfully ===");
    console.log("Image data length:", imageB64.length);

    const imageDataUrl = `data:image/png;base64,${imageB64}`;

    return c.json({ 
      success: true, 
      imageUrl: imageDataUrl,
      model: selectedModel,
    });

  } catch (error: any) {
    console.error("=== Error in text-to-image generation ===");
    console.error("Error:", error.message);
    console.error("Stack:", error.stack);
    return c.json({ 
      error: "图片生成失败", 
      message: error.message 
    }, 500);
  }
}