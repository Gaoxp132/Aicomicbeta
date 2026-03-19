/**
 * AI服务模块 - Doubao多模型智能路由 + Qwen兜底
 * v6.0.157: 新增多模态视觉支持——imageUrls参数可将图片注入user消息，自动强制seed-2-0-pro（唯一支持vision的模型）
 */

import type { AITaskTier } from "./types.ts";
import { DOUBAO_CHAT_URL, DOUBAO_MODELS, EXHAUSTION_COOLDOWN_MS, DASHSCOPE_CHAT_URL } from "./constants.ts";
import { fetchWithTimeout, getErrorMessage, getErrorName } from "./utils.ts";

const VOLCENGINE_API_KEY = Deno.env.get('VOLCENGINE_API_KEY') || '';
const ALIYUN_BAILIAN_API_KEY = Deno.env.get('ALIYUN_BAILIAN_API_KEY') || '';

// 模型耗尽追踪（内存中，进程重启自动清零）
const _exhaustedModels = new Map<string, number>();

function _getModelsForTier(tier: AITaskTier): string[] {
  switch (tier) {
    case 'heavy':  return [DOUBAO_MODELS.pro, DOUBAO_MODELS.mini, DOUBAO_MODELS.lite];
    case 'medium': return [DOUBAO_MODELS.mini, DOUBAO_MODELS.pro, DOUBAO_MODELS.lite];
    case 'light':  return [DOUBAO_MODELS.lite, DOUBAO_MODELS.mini, DOUBAO_MODELS.pro];
  }
}

function _isModelAvailable(model: string): boolean {
  const exhaustedAt = _exhaustedModels.get(model);
  if (!exhaustedAt) return true;
  if (Date.now() - exhaustedAt > EXHAUSTION_COOLDOWN_MS) {
    _exhaustedModels.delete(model);
    console.log(`[AI] Model ${model} cooldown expired, re-enabling`);
    return true;
  }
  return false;
}

/**
 * v6.0.157: 将纯文本消息转换为多模态格式（图文混合）
 * 仅修改最后一条 user 消息的 content 为 OpenAI multimodal 数组格式
 */
type MultimodalContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

type ChatMessage = { role: string; content: string | MultimodalContentPart[] };

function _buildMultimodalMessages(
  messages: Array<{ role: string; content: string }>,
  imageUrls: string[],
): Array<ChatMessage> {
  // 找到最后一条user消息，将其content改为multimodal数组
  const result = messages.map((msg, idx) => {
    // 只在最后一条user消息注入图片
    const isLastUser = msg.role === 'user' && messages.slice(idx + 1).every(m => m.role !== 'user');
    if (!isLastUser) return msg;

    const contentParts: MultimodalContentPart[] = [];
    // 图片在前（模型先看图再读指令，效果更好）
    for (const url of imageUrls) {
      contentParts.push({ type: 'image_url', image_url: { url } });
    }
    contentParts.push({ type: 'text', text: msg.content });
    return { role: msg.role, content: contentParts };
  });
  return result;
}

/**
 * 统一AI文本生成入口——Doubao多模型智能路由 + Qwen兜底
 * v6.0.157: 新增 imageUrls 参数，传入时自动启用多模态视觉模式
 *           - 多模态模式强制使用 seed-2-0-pro（唯一支持 vision 的 Doubao 模型）
 *           - 图片以 image_url 格式注入最后一条 user 消息
 *           - Qwen 兜底时降级为纯文本（忽略图片），并打印警告
 * @param params.messages - OpenAI格式消息
 * @param params.tier - 任务复杂度（heavy/medium/light）
 * @param params.temperature - 温度
 * @param params.max_tokens - 最大token数
 * @param params.timeout - 超时毫秒
 * @param params.imageUrls - 可选：图片URL数组，传入时启用多模态视觉
 * @returns { content, model } 或 throw Error
 */
export async function callAI(params: {
  messages: Array<{ role: string; content: string }>;
  tier: AITaskTier;
  temperature?: number;
  max_tokens?: number;
  timeout?: number;
  imageUrls?: string[];
}): Promise<{ content: string; model: string }> {
  const { messages, tier, temperature = 0.8, max_tokens, timeout = 60000, imageUrls } = params;
  // v6.0.160: 全局清理 U+FFFD 替换字符——源码Unicode编码损坏导致prompt中混入乱码
  const sanitizedMessages = messages.map(m => ({
    ...m,
    content: typeof m.content === 'string' ? m.content.replace(/\uFFFD+/g, '') : m.content,
  }));
  const errors: string[] = [];

  // v6.0.157: 多模态视觉模式检测
  const isVisionMode = imageUrls && imageUrls.length > 0;
  if (isVisionMode) {
    console.log(`[AI] Vision mode: ${imageUrls.length} image(s), tier=${tier}, forcing pro model`);
  }

  // Phase 1: 尝试 Doubao 模型（需要 VOLCENGINE_API_KEY）
  if (VOLCENGINE_API_KEY) {
    // v6.0.157: vision模式强制pro模型（唯一支持图片理解），否则按tier路由
    const candidates = isVisionMode
      ? [DOUBAO_MODELS.pro].filter(_isModelAvailable)
      : _getModelsForTier(tier).filter(_isModelAvailable);

    for (const model of candidates) {
      try {
        // v6.0.157: vision模式将消息转为多模态格式
        const finalMessages = isVisionMode
          ? _buildMultimodalMessages(sanitizedMessages, imageUrls)
          : sanitizedMessages;

        const body: Record<string, unknown> = { model, messages: finalMessages, temperature };
        if (max_tokens) body.max_tokens = max_tokens;

        const resp = await fetchWithTimeout(DOUBAO_CHAT_URL, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${VOLCENGINE_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }, timeout);

        // 429 / 402 / 额度耗尽 → 标记并尝试下一个
        if (resp.status === 429 || resp.status === 402) {
          _exhaustedModels.set(model, Date.now());
          const errText = await resp.text().catch(() => '');
          console.warn(`[AI] Doubao ${model} quota exhausted (${resp.status}): ${errText.substring(0, 200)}`);
          errors.push(`${model}:${resp.status}`);
          continue;
        }

        if (!resp.ok) {
          const errText = await resp.text().catch(() => '');
          console.warn(`[AI] Doubao ${model} error ${resp.status}: ${errText.substring(0, 200)}`);
          errors.push(`${model}:${resp.status}`);
          continue;
        }

        const data = await resp.json();
        const content = data?.choices?.[0]?.message?.content || '';
        if (!content) {
          console.warn(`[AI] Doubao ${model} returned empty content`);
          errors.push(`${model}:empty`);
          continue;
        }

        console.log(`[AI] Doubao ${model} success (tier=${tier}${isVisionMode ? ',vision' : ''}, tokens=${data?.usage?.total_tokens || '?'})`);
        return { content, model };
      } catch (err: unknown) {
        const msg = getErrorName(err) === 'AbortError' ? 'timeout' : getErrorMessage(err);
        console.warn(`[AI] Doubao ${model} exception: ${msg}`);
        errors.push(`${model}:${msg}`);
        continue;
      }
    }

    // v6.0.157: vision模式下pro耗尽时，降级为纯文本模式重试其他模型
    if (isVisionMode && !_isModelAvailable(DOUBAO_MODELS.pro)) {
      console.warn(`[AI] Vision mode pro model exhausted, falling back to text-only with tier=${tier} routing`);
      const textCandidates = _getModelsForTier(tier).filter(_isModelAvailable);
      for (const model of textCandidates) {
        try {
          const body: Record<string, unknown> = { model, messages: sanitizedMessages, temperature }; // 纯文本消息，不含图片
          if (max_tokens) body.max_tokens = max_tokens;

          const resp = await fetchWithTimeout(DOUBAO_CHAT_URL, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${VOLCENGINE_API_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          }, timeout);

          if (resp.status === 429 || resp.status === 402) {
            _exhaustedModels.set(model, Date.now());
            errors.push(`${model}:${resp.status}(text-fallback)`);
            continue;
          }
          if (!resp.ok) { errors.push(`${model}:${resp.status}(text-fallback)`); continue; }
          const data = await resp.json();
          const content = data?.choices?.[0]?.message?.content || '';
          if (!content) { errors.push(`${model}:empty(text-fallback)`); continue; }

          console.log(`[AI] Doubao ${model} text-fallback success (vision pro exhausted, tier=${tier})`);
          return { content, model };
        } catch (err: unknown) {
          errors.push(`${model}:${getErrorName(err) === 'AbortError' ? 'timeout' : getErrorMessage(err)}(text-fallback)`);
        }
      }
    }
  }

  // Phase 2: Qwen 兜底（需要 ALIYUN_BAILIAN_API_KEY，使用 OpenAI 兼容格式）
  // v6.0.157: Qwen不支持视觉，降级为纯文本并打印警告
  if (ALIYUN_BAILIAN_API_KEY) {
    if (isVisionMode) {
      console.warn(`[AI] Qwen fallback does not support vision — degrading to text-only (${imageUrls.length} images dropped)`);
    }
    try {
      const body: Record<string, unknown> = { model: 'qwen-turbo', messages: sanitizedMessages, temperature };
      if (max_tokens) body.max_tokens = max_tokens;

      const resp = await fetchWithTimeout(DASHSCOPE_CHAT_URL, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${ALIYUN_BAILIAN_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }, timeout);

      if (resp.ok) {
        const data = await resp.json();
        const content = data?.choices?.[0]?.message?.content || '';
        if (content) {
          console.log(`[AI] Qwen fallback success (tier=${tier})`);
          return { content, model: 'qwen-turbo' };
        }
      }
      const errText = await resp.text().catch(() => '');
      errors.push(`qwen-turbo:${resp.status}:${errText.substring(0, 100)}`);
    } catch (err: unknown) {
      errors.push(`qwen-turbo:${getErrorMessage(err)}`);
    }
  }

  throw new Error(`All AI models failed [tier=${tier}${isVisionMode ? ',vision' : ''}]: ${errors.join(' → ')}`);
}