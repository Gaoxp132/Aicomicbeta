/**
 * 完整剧本生成模块（角色+剧集）
 * 从 ai/script_generator.tsx 提取
 * 负责：调用AI同时生成角色和剧集大纲
 */

import { fetchWithRetry } from '../../utils.tsx';
import { VOLCENGINE_API_URL, MODEL_NAME, SYSTEM_PROMPT, API_CONFIG, TOKEN_LIMITS } from './config.tsx';
import { buildCompletePrompt } from './prompt_builder.tsx';
import { parseCompleteContent, generateFallbackCharacters } from './response_parser.tsx';
import type { GenerateEpisodesRequest, CharacterInfo, EpisodeOutline } from './types.tsx';

/**
 * 生成漫剧角色和剧集大纲（完整版）
 */
export async function generateCharactersAndEpisodes(
  request: GenerateEpisodesRequest
): Promise<{ 
  success: boolean; 
  characters?: CharacterInfo[];
  episodes?: EpisodeOutline[]; 
  error?: string 
}> {
  try {
    const apiKey = Deno.env.get('VOLCENGINE_API_KEY');
    
    if (!apiKey) {
      console.error('[CompleteGenerator] VOLCENGINE_API_KEY not configured');
      return {
        success: false,
        error: 'AI服务未配置，请联系管理员',
      };
    }

    console.log('[CompleteGenerator] Generating characters and episodes:', {
      title: request.seriesTitle,
      totalEpisodes: request.totalEpisodes,
      genre: request.genre,
    });

    // 构建包含角色生成的AI提示词
    const prompt = buildCompletePrompt(request);
    
    console.log('[CompleteGenerator] Complete prompt length:', prompt.length);

    // ✅ 使用fetchWithRetry调用火山引擎API
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
          max_tokens: TOKEN_LIMITS.complete,
        }),
      },
      API_CONFIG.timeout,
      API_CONFIG.maxRetries,
      API_CONFIG.retryDelays
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[CompleteGenerator] API error:', {
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
      console.error('[CompleteGenerator] No content in response');
      return {
        success: false,
        error: 'AI返回内容为空',
      };
    }

    console.log('[CompleteGenerator] AI response length:', content.length);

    // 解析AI返回的内容
    const { characters, episodes } = parseCompleteContent(content, request.totalEpisodes);

    // 如果没有角色，使用备用角色
    const finalCharacters = characters.length > 0 ? characters : generateFallbackCharacters(request);

    if (!episodes || episodes.length === 0) {
      console.error('[CompleteGenerator] Failed to parse episodes');
      return {
        success: false,
        error: 'AI返回格式错误，无法解析剧集',
      };
    }

    console.log('[CompleteGenerator] ✅ Generated:', {
      characters: finalCharacters.length,
      episodes: episodes.length,
    });

    return {
      success: true,
      characters: finalCharacters,
      episodes,
    };
  } catch (error: any) {
    console.error('[CompleteGenerator] Error:', error);
    return {
      success: false,
      error: error.message || '生成失败',
    };
  }
}
