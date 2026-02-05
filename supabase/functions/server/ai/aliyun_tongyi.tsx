// 阿里云百炼 - 通义万相文生图功能
import type { Context } from "npm:hono";
import { fetchWithRetry } from "../utils.tsx";

/**
 * 调用阿里云通义千问大模型API
 * 官方文档: https://help.aliyun.com/zh/model-studio/developer-reference/qwen-api
 */
export async function callQwenAPI(
  prompt: string,
  systemPrompt?: string,
  model: string = "qwen-max"
): Promise<string> {
  const apiKey = Deno.env.get("ALIYUN_BAILIAN_API_KEY");
  
  if (!apiKey) {
    console.error("[Qwen API] Error: ALIYUN_BAILIAN_API_KEY not configured");
    throw new Error("阿里云API密钥未配置");
  }

  console.log("[Qwen API] Calling Qwen LLM...");
  console.log("[Qwen API] Model:", model);
  console.log("[Qwen API] Prompt length:", prompt.length);

  const messages: any[] = [];
  
  if (systemPrompt) {
    messages.push({
      role: "system",
      content: systemPrompt,
    });
  }
  
  messages.push({
    role: "user",
    content: prompt,
  });

  const requestBody = {
    model: model,
    input: {
      messages: messages,
    },
    parameters: {
      result_format: "message",
      temperature: 0.7,
      top_p: 0.8,
      max_tokens: 4000,
    },
  };

  console.log("[Qwen API] Request body:", JSON.stringify(requestBody, null, 2));

  try {
    const response = await fetchWithRetry(
      "https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/generation",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`,
        },
        body: JSON.stringify(requestBody),
      }
    );

    const responseText = await response.text();
    console.log("[Qwen API] Response status:", response.status);

    let result: any;
    try {
      result = JSON.parse(responseText);
    } catch (parseErr) {
      console.error("[Qwen API] Failed to parse response:", parseErr);
      throw new Error("API返回格式错误");
    }

    if (!response.ok) {
      console.error("[Qwen API] API error:", result);
      throw new Error(result.message || "通义千问API调用失败");
    }

    const content = result.output?.choices?.[0]?.message?.content;
    
    if (!content) {
      console.error("[Qwen API] No content in response:", result);
      throw new Error("API未返回内容");
    }

    console.log("[Qwen API] ✅ Response received, length:", content.length);
    
    return content;
    
  } catch (error: any) {
    console.error("[Qwen API] Error:", error.message);
    console.error("[Qwen API] Stack:", error.stack);
    throw error;
  }
}

/**
 * 阿里云通义万相 - 根据文字描述生成图片
 * 官方文档: https://help.aliyun.com/zh/model-studio/developer-reference/tongyi-wanxiang
 */
export async function handleAliyunTextToImage(c: Context) {
  try {
    const { prompt, imageType, size = "1024*1024", n = 1 } = await c.req.json();
    const apiKey = Deno.env.get("ALIYUN_BAILIAN_API_KEY");
    
    if (!apiKey) {
      console.error("[Aliyun Tongyi] Error: ALIYUN_BAILIAN_API_KEY not configured");
      return c.json({ error: "阿里云API密钥未配置" }, 500);
    }

    if (!prompt || prompt.trim().length === 0) {
      return c.json({ error: "图片描述不能为空" }, 400);
    }

    console.log("[Aliyun Tongyi] === Text-to-Image Request ===");
    console.log("[Aliyun Tongyi] Prompt:", prompt);
    console.log("[Aliyun Tongyi] Image Type:", imageType);
    console.log("[Aliyun Tongyi] Size:", size);

    // 通义万相支持的尺寸: 1024*1024, 720*1280, 1280*720
    const requestBody = {
      model: "wanx-v1",  // 通义万相模型
      input: {
        prompt: prompt.trim(),
      },
      parameters: {
        size: size,
        n: n,
        // style: "<auto>",  // 可选: "<auto>", "<3d cartoon>", "<anime>", "<oil painting>", "<watercolor>", "<sketch>", "<chinese painting>", "<flat illustration>"
      }
    };

    console.log("[Aliyun Tongyi] Calling Aliyun Bailian API...");
    console.log("[Aliyun Tongyi] Request body:", JSON.stringify(requestBody, null, 2));

    const response = await fetchWithRetry("https://dashscope.aliyuncs.com/api/v1/services/aigc/text2image/image-synthesis", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
        "X-DashScope-Async": "enable",  // 异步调用
      },
      body: JSON.stringify(requestBody),
    });

    const responseText = await response.text();
    console.log("[Aliyun Tongyi] API response status:", response.status);
    console.log("[Aliyun Tongyi] Response text:", responseText);

    let result: any;
    try {
      result = JSON.parse(responseText);
    } catch (parseErr) {
      console.error("[Aliyun Tongyi] Failed to parse API response:", parseErr);
      return c.json({ 
        error: "API返回格式错误", 
        rawResponse: responseText.substring(0, 200) 
      }, 500);
    }

    if (!response.ok) {
      console.error("[Aliyun Tongyi] API error:", result);
      return c.json({ 
        error: "图片生成失败", 
        details: result,
        message: result.message || "Unknown error"
      }, response.status);
    }

    // 异步任务：需要轮询任务状态
    const taskId = result.output?.task_id;
    const taskStatus = result.output?.task_status;

    if (!taskId) {
      console.error("[Aliyun Tongyi] No task_id in response:", result);
      return c.json({ 
        error: "图片生成失败", 
        message: "API未返回任务ID" 
      }, 500);
    }

    console.log("[Aliyun Tongyi] Task created:", taskId, "Status:", taskStatus);

    // 轮询任务状态（最多等待30秒）
    let imageUrl = "";
    const maxAttempts = 30;
    const pollingInterval = 1000; // 1秒

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      await new Promise(resolve => setTimeout(resolve, pollingInterval));

      console.log(`[Aliyun Tongyi] Polling task status (attempt ${attempt + 1}/${maxAttempts})...`);

      const statusResponse = await fetchWithRetry(
        `https://dashscope.aliyuncs.com/api/v1/tasks/${taskId}`,
        {
          method: "GET",
          headers: {
            "Authorization": `Bearer ${apiKey}`,
          },
        }
      );

      const statusText = await statusResponse.text();
      const statusResult = JSON.parse(statusText);

      console.log(`[Aliyun Tongyi] Task status:`, statusResult.output?.task_status);

      if (statusResult.output?.task_status === "SUCCEEDED") {
        imageUrl = statusResult.output?.results?.[0]?.url;
        console.log("[Aliyun Tongyi] ✅ Image generated successfully:", imageUrl);
        break;
      } else if (statusResult.output?.task_status === "FAILED") {
        console.error("[Aliyun Tongyi] Task failed:", statusResult);
        return c.json({ 
          error: "图片生成失败", 
          message: statusResult.output?.message || "任务执行失败" 
        }, 500);
      }
    }

    if (!imageUrl) {
      console.error("[Aliyun Tongyi] Task timeout: No image URL after polling");
      return c.json({ 
        error: "图片生成超时", 
        message: "请稍后重试" 
      }, 500);
    }

    return c.json({ 
      success: true, 
      imageUrl: imageUrl,
      taskId: taskId,
      model: "wanx-v1",
    });

  } catch (error: any) {
    console.error("[Aliyun Tongyi] === Error in text-to-image generation ===");
    console.error("[Aliyun Tongyi] Error:", error.message);
    console.error("[Aliyun Tongyi] Stack:", error.stack);
    return c.json({ 
      error: "图片生成失败", 
      message: error.message 
    }, 500);
  }
}

/**
 * 通义万相同步调用版本（适合快速生成）
 */
export async function handleAliyunTextToImageSync(c: Context) {
  try {
    const { prompt, imageType, size = "1024*1024", style } = await c.req.json();
    const apiKey = Deno.env.get("ALIYUN_BAILIAN_API_KEY");
    
    if (!apiKey) {
      console.error("[Aliyun Tongyi Sync] Error: ALIYUN_BAILIAN_API_KEY not configured");
      return c.json({ error: "阿里云API密钥未配置" }, 500);
    }

    if (!prompt || prompt.trim().length === 0) {
      return c.json({ error: "图片描述不能为空" }, 400);
    }

    console.log("[Aliyun Tongyi Sync] === Text-to-Image Request ===");
    console.log("[Aliyun Tongyi Sync] Prompt:", prompt);
    console.log("[Aliyun Tongyi Sync] Size:", size);
    console.log("[Aliyun Tongyi Sync] Style:", style);

    const requestBody = {
      model: "wanx-v1",
      input: {
        prompt: prompt.trim(),
      },
      parameters: {
        size: size,
        n: 1,
      }
    };

    // 添加风格参数（如果指定）
    if (style) {
      requestBody.parameters.style = style;
    }

    console.log("[Aliyun Tongyi Sync] Request body:", JSON.stringify(requestBody, null, 2));

    // 同步调用（不使用 X-DashScope-Async header）
    const response = await fetchWithRetry("https://dashscope.aliyuncs.com/api/v1/services/aigc/text2image/image-synthesis", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify(requestBody),
    });

    const responseText = await response.text();
    console.log("[Aliyun Tongyi Sync] Response status:", response.status);

    let result: any;
    try {
      result = JSON.parse(responseText);
    } catch (parseErr) {
      console.error("[Aliyun Tongyi Sync] Parse error:", parseErr);
      return c.json({ 
        error: "API返回格式错误", 
        rawResponse: responseText.substring(0, 200) 
      }, 500);
    }

    if (!response.ok) {
      console.error("[Aliyun Tongyi Sync] API error:", result);
      return c.json({ 
        error: "图片生成失败", 
        details: result,
        message: result.message || "Unknown error"
      }, response.status);
    }

    const imageUrl = result.output?.results?.[0]?.url;

    if (!imageUrl) {
      console.error("[Aliyun Tongyi Sync] No image URL in response:", result);
      return c.json({ 
        error: "图片生成失败", 
        message: "API未返回图片URL" 
      }, 500);
    }

    console.log("[Aliyun Tongyi Sync] ✅ Image generated:", imageUrl);

    return c.json({ 
      success: true, 
      imageUrl: imageUrl,
      model: "wanx-v1",
    });

  } catch (error: any) {
    console.error("[Aliyun Tongyi Sync] Error:", error.message);
    return c.json({ 
      error: "图片生成失败", 
      message: error.message 
    }, 500);
  }
}