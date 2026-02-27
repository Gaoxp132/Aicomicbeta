/**
 * AI服务模块 - Doubao多模型智能路由 + Qwen兜底
 * v6.0.77
 */

import type { AITaskTier } from "./types.ts";
import { DOUBAO_CHAT_URL, DOUBAO_MODELS, EXHAUSTION_COOLDOWN_MS, DASHSCOPE_CHAT_URL } from "./constants.ts";
import { fetchWithTimeout } from "./utils.ts";

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
 * 统一AI文本生成入口——Doubao多模型智能路由 + Qwen兜底
 * @param params.messages - OpenAI格式消息
 * @param params.tier - 任务复杂度（heavy/medium/light）
 * @param params.temperature - 温度
 * @param params.max_tokens - 最大token数
 * @param params.timeout - 超时毫秒
 * @returns { content, model } 或 throw Error
 */
export async function callAI(params: {
  messages: Array<{ role: string; content: string }>;
  tier: AITaskTier;
  temperature?: number;
  max_tokens?: number;
  timeout?: number;
}): Promise<{ content: string; model: string }> {
  const { messages, tier, temperature = 0.8, max_tokens, timeout = 60000 } = params;
  const errors: string[] = [];

  // Phase 1: 尝试 Doubao 模型（需要 VOLCENGINE_API_KEY）
  if (VOLCENGINE_API_KEY) {
    const candidates = _getModelsForTier(tier).filter(_isModelAvailable);
    for (const model of candidates) {
      try {
        const body: any = { model, messages, temperature };
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

        console.log(`[AI] Doubao ${model} success (tier=${tier}, tokens=${data?.usage?.total_tokens || '?'})`);
        return { content, model };
      } catch (err: any) {
        const msg = err.name === 'AbortError' ? 'timeout' : err.message;
        console.warn(`[AI] Doubao ${model} exception: ${msg}`);
        errors.push(`${model}:${msg}`);
        continue;
      }
    }
  }

  // Phase 2: Qwen 兜底（需要 ALIYUN_BAILIAN_API_KEY，使用 OpenAI 兼容格式）
  if (ALIYUN_BAILIAN_API_KEY) {
    try {
      const body: any = { model: 'qwen-turbo', messages, temperature };
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
    } catch (err: any) {
      errors.push(`qwen-turbo:${err.message}`);
    }
  }

  throw new Error(`All AI models failed [tier=${tier}]: ${errors.join(' → ')}`);
}