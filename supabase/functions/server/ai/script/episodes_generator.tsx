/**
 * 剧集大纲生成模块
 * 从 ai/script_generator.tsx 提取
 * 负责：调用AI生成剧集大纲
 */

import { fetchWithRetry } from '../../utils.tsx';
import { VOLCENGINE_API_URL, MODEL_NAME, SYSTEM_PROMPT, API_CONFIG, TOKEN_LIMITS } from './config.tsx';
import { buildEpisodesPrompt } from './prompt_builder.tsx';
import { parseEpisodeOutlines } from './response_parser.tsx';
import type { GenerateEpisodesRequest, EpisodeOutline } from './types.tsx';

/**
 * 生成漫剧剧集大纲
 */
export async function generateEpisodeOutlines(
  request: GenerateEpisodesRequest
): Promise<{ success: boolean; episodes?: EpisodeOutline[]; error?: string }> {
  try {
    const apiKey = Deno.env.get('VOLCENGINE_API_KEY');
    
    if (!apiKey) {
      console.error('[EpisodesGenerator] VOLCENGINE_API_KEY not configured');
      return {
        success: false,
        error: 'AI服务未配置，请联系管理员',
      };
    }

    console.log('[EpisodesGenerator] Generating episodes:', {
      title: request.seriesTitle,
      totalEpisodes: request.totalEpisodes,
      genre: request.genre,
    });

    // 构建AI提示词
    const prompt = buildEpisodesPrompt(request);
    
    console.log('[EpisodesGenerator] Prompt length:', prompt.length);

    // ✅ 使用fetchWithRetry调用火山引擎API（自动重试3次）
    const response = await fetchWithRetry(
      VOLCENGINE_API_URL,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: MODEL_NAME,
          messages: [
            {
              role: 'system',
              content: SYSTEM_PROMPT,
            },
            {
              role: 'user',
              content: prompt,
            },
          ],
          temperature: API_CONFIG.temperature,
          max_tokens: TOKEN_LIMITS.episodesOnly,
        }),
      },
      API_CONFIG.timeout,
      API_CONFIG.maxRetries,
      API_CONFIG.retryDelays
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[EpisodesGenerator] API error:', {
        status: response.status,
        statusText: response.statusText,
        error: errorText,
      });
      return {
        success: false,
        error: `AI生成失败: ${response.statusText}`,
      };
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      console.error('[EpisodesGenerator] No content in response');
      return {
        success: false,
        error: 'AI返回内容为空',
      };
    }

    console.log('[EpisodesGenerator] AI response length:', content.length);

    // 解析AI返回的内容
    const episodes = parseEpisodeOutlines(content, request.totalEpisodes);

    if (!episodes || episodes.length === 0) {
      console.error('[EpisodesGenerator] Failed to parse episodes');
      return {
        success: false,
        error: 'AI返回格式错误，无法解析',
      };
    }

    console.log('[EpisodesGenerator] ✅ Generated', episodes.length, 'episodes');

    return {
      success: true,
      episodes,
    };
  } catch (error: any) {
    console.error('[EpisodesGenerator] Error:', error);
    return {
      success: false,
      error: error.message || '生成失败',
    };
  }
}
