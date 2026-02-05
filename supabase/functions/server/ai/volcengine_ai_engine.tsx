/**
 * 调用火山引擎AI模型
 */

// 定义AI响应类型
interface VolcengineAIResponse {
  choices: Array<{
    message: {
      content: string;
      role: string;
    };
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

// APPLICATION_SCENARIOS 类型定义（为了兼容性）
const APPLICATION_SCENARIOS = {} as any;

export async function callVolcengineAI(
  prompt: string,
  systemPrompt?: string,
  options: {
    temperature?: number;
    maxTokens?: number;
    modelType?: 'simple' | 'creative' | 'complex' | 'reasoning'; // 旧版：任务类型（兼容）
    scenario?: keyof typeof APPLICATION_SCENARIOS; // 新版：应用场景（推荐）
    timeoutMs?: number; // 超时时间（毫秒）
  } = {}
): Promise<string> {
  console.log('[VolcengineAI] ========== CALLING VOLCENGINE API ==========');
  console.log('[VolcengineAI] Timestamp:', new Date().toISOString());
  console.log('[VolcengineAI] Prompt length:', prompt.length);
  console.log('[VolcengineAI] Prompt preview:', prompt.substring(0, 200) + '...');
  
  const apiKey = Deno.env.get('VOLCENGINE_API_KEY');
  
  if (!apiKey) {
    const errorMsg = '❌ CRITICAL ERROR: VOLCENGINE_API_KEY is not configured in environment variables!';
    console.error('[VolcengineAI]', errorMsg);
    console.error('[VolcengineAI] Available env vars:', Object.keys(Deno.env.toObject()).filter(k => !k.includes('SECRET')));
    throw new Error(errorMsg);
  }
  
  console.log('[VolcengineAI] ✅ API Key found:', apiKey.substring(0, 10) + '...' + apiKey.substring(apiKey.length - 5));

  // 🎯 智能模型选择：优先使用场景，其次使用任务类型
  let selectedModel: string;
  
  // ⚡ 使用火山引擎豆包模型ID（而不是endpoint ID）
  // 参考：其他路由成功使用的模型格式
  const modelMap: Record<string, string> = {
    'simple': 'doubao-seed-1-8-251228',      // 豆包1.8B种子模型（快速响应）
    'creative': 'doubao-seed-1-8-251228',    // 创意模型（同上，性能均衡）
    'complex': 'doubao-seed-1-8-251228',     // 复杂任务（使用相同模型）
    'reasoning': 'doubao-seed-1-8-251228'    // 推理模型（使用相同模型）
  };
  
  if (options.modelType && modelMap[options.modelType]) {
    selectedModel = modelMap[options.modelType];
    console.log(`[VolcengineAI] Using model: ${selectedModel} (task type: ${options.modelType})`);
  } else {
    // 默认：使用豆包1.8B种子模型
    selectedModel = 'doubao-seed-1-8-251228';
    console.log(`[VolcengineAI] Using default model: ${selectedModel}`);
  }

  const url = 'https://ark.cn-beijing.volces.com/api/v3/chat/completions';
  
  const messages = [];
  if (systemPrompt) {
    messages.push({ role: 'system', content: systemPrompt });
  }
  messages.push({ role: 'user', content: prompt });

  console.log('[VolcengineAI] Calling API with prompt length:', prompt.length);

  // 🚀 添加超时控制 - v4.2.47: 增加到180秒支持复杂大纲生成
  const timeoutMs = options.timeoutMs || 180000; // 🔥 180秒（3分钟），支持复杂任务
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    console.log(`[VolcengineAI] Making request with ${timeoutMs}ms timeout...`);
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: selectedModel,
        messages,
        temperature: options.temperature || 0.7,
        max_tokens: options.maxTokens || 800, // 降低默认token数，加快响应
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    
    console.log(`[VolcengineAI] Response status: ${response.status}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[VolcengineAI] ❌ API Error:', {
        status: response.status,
        statusText: response.statusText,
        error: errorText.substring(0, 500),
        model: selectedModel,
        url: url,
      });
      
      // 提供更详细的错误信息
      let errorMessage = `Volcengine AI API failed: ${response.status}`;
      if (response.status === 404) {
        errorMessage += ' - 模型不存在或API密钥无效，请检查VOLCENGINE_API_KEY环境变量';
      } else if (response.status === 401) {
        errorMessage += ' - API密钥未授权，请检查密钥是否正确';
      } else if (response.status === 429) {
        errorMessage += ' - API调用频率限制，请稍后重试';
      } else if (response.status === 500) {
        errorMessage += ' - 服务器内部错误，请稍后重试';
      }
      
      throw new Error(errorMessage);
    }

    const result: VolcengineAIResponse = await response.json();
    
    console.log('[VolcengineAI] 📦 Full API response:', JSON.stringify(result, null, 2).substring(0, 1000));
    
    if (result.choices && result.choices.length > 0) {
      const content = result.choices[0].message.content;
      console.log('[VolcengineAI] ✅ Response received, length:', content.length);
      console.log('[VolcengineAI] Content preview:', content.substring(0, 300));
      return content;
    }
    
    console.error('[VolcengineAI] ❌ Invalid response structure:', result);
    throw new Error('Invalid response from Volcengine AI API - no choices returned');

  } catch (error: any) {
    clearTimeout(timeoutId);
    
    if (error.name === 'AbortError') {
      console.error(`[VolcengineAI] ⏱️ Request timeout after ${timeoutMs}ms`);
      throw new Error(`AI request timeout after ${timeoutMs}ms`);
    }
    
    throw error;
  }
}