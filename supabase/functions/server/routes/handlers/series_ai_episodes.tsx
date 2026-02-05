/**
 * AI生成剧集功能
 * 根据系列信息，使用AI生成完整的剧集列表
 */

import type { Context } from "npm:hono";
import * as db from "../../database/index.tsx";
import { callVolcengineAI } from "../../ai/volcengine_ai_engine.tsx";

/**
 * AI生成剧集列表
 * POST /series/:id/generate-episodes-ai
 */
export async function generateEpisodesAI(c: Context) {
  const seriesId = c.req.param('id');
  
  try {
    const { totalEpisodes } = await c.req.json();
    
    if (!totalEpisodes || totalEpisodes < 1 || totalEpisodes > 80) {
      return c.json({
        success: false,
        error: '剧集数量必须在1-80之间'
      }, 400);
    }
    
    console.log(`[AI Episodes] 🎬 Generating ${totalEpisodes} episodes for series: ${seriesId}`);
    
    // 1. 获取系列信息
    const series = await db.getSeries(seriesId);
    if (!series) {
      return c.json({
        success: false,
        error: '漫剧不存在'
      }, 404);
    }
    
    // 2. 构建AI提示词
    const prompt = buildEpisodesPrompt(series, totalEpisodes);
    
    // 3. 调用火山引擎AI生成
    console.log('[AI Episodes] 🤖 Calling Volcengine AI...');
    const aiResponse = await callVolcengineAI(
      prompt,
      '你是专业编剧，擅长创作正能量故事，将故事合理拆分为连贯的剧集。直接返回JSON格式，不要额外说明。',
      {
        temperature: 0.8,
        maxTokens: 4000,
        timeoutMs: 180000 // 3分钟超时，支持长剧本生成
      }
    );
    
    if (!aiResponse) {
      throw new Error('AI生成失败: 未返回内容');
    }
    
    // 4. 解析AI返回的剧集数据
    console.log('[AI Episodes] 📝 Parsing AI response...');
    const episodes = parseEpisodesFromAI(aiResponse, seriesId, totalEpisodes);
    
    if (episodes.length === 0) {
      throw new Error('AI返回数据解析失败');
    }
    
    // 5. 存储到数据库
    console.log(`[AI Episodes] 💾 Saving ${episodes.length} episodes to database...`);
    const savedEpisodes = await db.createEpisodes(episodes);
    
    console.log(`[AI Episodes] ✅ Successfully generated ${savedEpisodes.length} episodes`);
    
    return c.json({
      success: true,
      data: {
        episodes: savedEpisodes,
        count: savedEpisodes.length,
        message: `成功生成${savedEpisodes.length}集剧集`
      }
    });
    
  } catch (error: any) {
    console.error('[AI Episodes] ❌ Error:', error);
    return c.json({
      success: false,
      error: error.message || '生成剧集失败'
    }, 500);
  }
}

/**
 * 构建生成剧集的AI提示词
 */
function buildEpisodesPrompt(series: any, totalEpisodes: number): string {
  return `你是一位专业的编剧，擅长创作${series.genre || '剧情'}类漫剧。

【任务】
请根据以下漫剧信息，为这部作品生成${totalEpisodes}集的完整剧集大纲。

【漫剧信息】
- 标题：${series.title}
- 简介：${series.description}
- 类型：${series.genre || '剧情'}
- 总集数：${totalEpisodes}集
- 目标受众：${series.targetAudience || '全年龄段'}
- 价值导向：${series.valueGuidance || '传递积极向上的正能量'}

【生成要求】
1. 每集必须包含：
   - 集标题（简洁有力，8-15字）
   - 集简介（详细描述本集内容，80-150字）
   - 主题标签（1-3个核心主题词，如"友情"、"勇气"、"成长"）
   - 剧情冲突（本集的核心矛盾和转折）

2. 剧集安排规律：
   - 第1集：开篇引入，建立世界观和主要角色
   - 中间集：推进剧情，深化矛盾，角色成长
   - 最后1集：高潮与结局，解决核心冲突
   
3. 剧情要求：
   - 每集之间有逻辑连续性
   - 情节跌宕起伏，有悬念和惊喜
   - 符合中国价值观，传递正能量
   - 适合目标受众观看

【输出格式】
请严格按照以下JSON格式输出，不要添加任何其他文字：

\`\`\`json
{
  "episodes": [
    {
      "episodeNumber": 1,
      "title": "第1集标题",
      "synopsis": "第1集详细简介...",
      "themes": ["主题1", "主题2"],
      "conflict": "本集核心冲突描述"
    },
    {
      "episodeNumber": 2,
      "title": "第2集标题",
      "synopsis": "第2集详细简介...",
      "themes": ["主题1", "主题2"],
      "conflict": "本集核心冲突描述"
    }
    // ... 继续到第${totalEpisodes}集
  ]
}
\`\`\`

现在开始生成${totalEpisodes}集的完整剧集大纲：`;
}

/**
 * 从AI响应中解析剧集数据
 */
function parseEpisodesFromAI(content: string, seriesId: string, expectedCount: number): any[] {
  try {
    // 提取JSON内容
    let jsonStr = content;
    
    // 如果包含```json标记，提取其中的JSON
    const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1];
    } else {
      // 尝试提取{}之间的内容
      const objMatch = content.match(/\{[\s\S]*\}/);
      if (objMatch) {
        jsonStr = objMatch[0];
      }
    }
    
    const parsed = JSON.parse(jsonStr);
    const aiEpisodes = parsed.episodes || [];
    
    if (!Array.isArray(aiEpisodes) || aiEpisodes.length === 0) {
      console.error('[AI Episodes] ❌ No episodes array found in AI response');
      return [];
    }
    
    console.log(`[AI Episodes] 📊 Parsed ${aiEpisodes.length} episodes from AI response`);
    
    // 转换为数据库格式
    const episodes = aiEpisodes.map((ep: any) => ({
      series_id: seriesId,
      episode_number: ep.episodeNumber || ep.episode_number || 0,
      title: ep.title || `第${ep.episodeNumber}集`,
      synopsis: ep.synopsis || ep.description || '',
      themes: Array.isArray(ep.themes) ? ep.themes.join(', ') : '',
      conflict: ep.conflict || '',
      status: 'draft',
      duration: 0,
      scene_count: 0
    }));
    
    // 验证剧集数量
    if (episodes.length !== expectedCount) {
      console.warn(`[AI Episodes] ⚠️ Expected ${expectedCount} episodes, got ${episodes.length}`);
    }
    
    return episodes;
    
  } catch (error: any) {
    console.error('[AI Episodes] ❌ Parse error:', error);
    console.error('[AI Episodes] 📄 Raw content:', content);
    return [];
  }
}