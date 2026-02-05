/**
 * AI生成分镜功能
 * 根据剧集信息，使用AI生成详细的分镜脚本
 */

import type { Context } from "npm:hono";
import * as db from "../../database/index.tsx";
import { callVolcengineAI } from "../../ai/volcengine_ai_engine.tsx";

/**
 * AI生成分镜脚本
 * POST /episodes/:id/generate-storyboards-ai
 */
export async function generateStoryboardsAI(c: Context) {
  const episodeId = c.req.param('id');
  
  try {
    const { sceneCount = 10 } = await c.req.json();
    
    if (sceneCount < 4 || sceneCount > 20) {
      return c.json({
        success: false,
        error: '分镜数量必须在4-20之间'
      }, 400);
    }
    
    console.log(`[AI Storyboards] 🎬 Generating ${sceneCount} storyboards for episode: ${episodeId}`);
    
    // 1. 获取剧集信息
    const episode = await db.getEpisode(episodeId);
    if (!episode) {
      return c.json({
        success: false,
        error: '剧集不存在'
      }, 404);
    }
    
    // 2. 获取系列信息
    const series = await db.getSeries(episode.series_id);
    if (!series) {
      return c.json({
        success: false,
        error: '漫剧不存在'
      }, 404);
    }
    
    // 3. 获取角色信息
    const characters = await db.getSeriesCharacters(series.id);
    
    // 4. 构建AI提示词
    const prompt = buildStoryboardsPrompt(series, episode, characters, sceneCount);
    
    // 5. 调用火山引擎AI生成
    console.log('[AI Storyboards] 🤖 Calling Volcengine AI...');
    const aiResponse = await callVolcengineAI(
      prompt,
      '你是专业分镜师，擅长创作视觉冲击力强、情感丰富的分镜脚本。直接返回JSON格式，不要额外说明。',
      {
        temperature: 0.8,
        maxTokens: 6000,
        timeoutMs: 240000 // 4分钟超时，支持复杂分镜生成
      }
    );
    
    if (!aiResponse) {
      throw new Error('AI生成失败: 未返回内容');
    }
    
    // 6. 解析AI返回的分镜数据
    console.log('[AI Storyboards] 📝 Parsing AI response...');
    const storyboards = parseStoryboardsFromAI(aiResponse, episodeId, sceneCount);
    
    if (storyboards.length === 0) {
      throw new Error('AI返回数据解析失败');
    }
    
    // 7. 存储到数据库
    console.log(`[AI Storyboards] 💾 Saving ${storyboards.length} storyboards to database...`);
    const savedStoryboards = await db.createStoryboards(storyboards);
    
    // 8. 更新剧集的场景数
    await db.updateEpisode(episodeId, {
      scene_count: savedStoryboards.length,
      status: 'storyboarded'
    });
    
    console.log(`[AI Storyboards] ✅ Successfully generated ${savedStoryboards.length} storyboards`);
    
    return c.json({
      success: true,
      data: {
        storyboards: savedStoryboards,
        count: savedStoryboards.length,
        message: `成功生成${savedStoryboards.length}个分镜`
      }
    });
    
  } catch (error: any) {
    console.error('[AI Storyboards] ❌ Error:', error);
    return c.json({
      success: false,
      error: error.message || '生成分镜失败'
    }, 500);
  }
}

/**
 * 构建生成分镜的AI提示词
 */
function buildStoryboardsPrompt(series: any, episode: any, characters: any[], sceneCount: number): string {
  const characterList = characters.length > 0
    ? characters.map(c => `- ${c.name}：${c.description || '主要角色'}`).join('\n')
    : '- 主角：故事的核心人物';
  
  return `你是一位专业的分镜师，擅长创作${series.genre || '剧情'}类漫剧的视觉脚本。

【任务】
请根据以下信息，为这一集创作${sceneCount}个详细的分镜脚本。

【漫剧信息】
- 标题：${series.title}
- 类型：${series.genre || '剧情'}
- 风格：${series.style || 'realistic'}
- 价值导向：${series.valueGuidance || '传递积极向上的正能量'}

【本集信息】
- 集数：第${episode.episode_number}集
- 标题：${episode.title}
- 简介：${episode.synopsis}
- 主题：${episode.themes || '成长'}
- 冲突：${episode.conflict || '角色面临挑战'}

【角色信息】
${characterList}

【分镜要求】
1. 每个分镜必须包含：
   - 场景编号（从1开始）
   - 场景描述（详细的视觉描述，100-200字）
   - 地点（具体场所）
   - 时间（day/night/dawn/dusk）
   - 出现角色（使用上述角色名）
   - 对话内容（自然流畅，符合角色性格）
   - 氛围（如：紧张、温馨、激动等）
   - 镜头类型（特写/中景/远景/全景）
   - 动作描述（角色的动作和表情）

2. 分镜安排：
   - 开场：设定场景，引入情境
   - 展开：推进剧情，展现冲突
   - 高潮：情感或动作的高点
   - 结尾：本集小结，为下集留悬念

3. 创作规范：
   - 画面要有电影感和视觉冲击力
   - 对话简洁有力，符合人物性格
   - 传递积极正能量，符合中国价值观
   - 适合${series.targetAudience || '全年龄段'}观看

【输出格式】
请严格按照以下JSON格式输出：

\`\`\`json
{
  "storyboards": [
    {
      "sceneNumber": 1,
      "description": "详细的场景视觉描述...",
      "location": "具体地点",
      "timeOfDay": "day",
      "characters": ["角色1", "角色2"],
      "dialogue": "角色1：对话内容\\n角色2：对话内容",
      "mood": "氛围描述",
      "shotType": "中景",
      "action": "角色动作和表情描述"
    }
    // ... 继续到第${sceneCount}个分镜
  ]
}
\`\`\`

现在开始创作${sceneCount}个分镜脚本：`;
}

/**
 * 从AI响应中解析分镜数据
 */
function parseStoryboardsFromAI(content: string, episodeId: string, expectedCount: number): any[] {
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
    const aiStoryboards = parsed.storyboards || [];
    
    if (!Array.isArray(aiStoryboards) || aiStoryboards.length === 0) {
      console.error('[AI Storyboards] ❌ No storyboards array found in AI response');
      return [];
    }
    
    console.log(`[AI Storyboards] 📊 Parsed ${aiStoryboards.length} storyboards from AI response`);
    
    // 转换为数据库格式
    const storyboards = aiStoryboards.map((sb: any) => ({
      episode_id: episodeId,
      scene_number: sb.sceneNumber || sb.scene_number || 0,
      description: sb.description || '',
      location: sb.location || '未指定地点',
      time_of_day: sb.timeOfDay || sb.time_of_day || 'day',
      characters: Array.isArray(sb.characters) ? sb.characters.join(', ') : '',
      dialogue: sb.dialogue || '',
      mood: sb.mood || '平静',
      shot_type: sb.shotType || sb.shot_type || '中景',
      action: sb.action || '',
      duration: 0,
      status: 'draft'
    }));
    
    // 验证分镜数量
    if (storyboards.length !== expectedCount) {
      console.warn(`[AI Storyboards] ⚠️ Expected ${expectedCount} storyboards, got ${storyboards.length}`);
    }
    
    return storyboards;
    
  } catch (error: any) {
    console.error('[AI Storyboards] ❌ Parse error:', error);
    console.error('[AI Storyboards] 📄 Raw content:', content);
    return [];
  }
}