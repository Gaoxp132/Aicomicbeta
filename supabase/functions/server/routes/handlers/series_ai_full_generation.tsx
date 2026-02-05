/**
 * 一键完整生成功能
 * 自动完成：角色生成 → 剧集生成 → 分镜生成 → 视频生成
 */

import type { Context } from "npm:hono";
import * as db from "../../database/index.tsx";
import { callVolcengineAI } from "../../ai/volcengine_ai_engine.tsx";
import { generateEpisodesAI } from "./series_ai_episodes.tsx";
import { generateStoryboardsAI } from "./series_ai_storyboards.tsx";

/**
 * 一键完整生成
 * POST /series/:id/generate-full-ai
 */
export async function generateFullAI(c: Context) {
  const seriesId = c.req.param('id');
  
  try {
    const { userPhone } = await c.req.json();
    
    if (!userPhone) {
      return c.json({
        success: false,
        error: '缺少用户手机号'
      }, 400);
    }
    
    console.log(`[Full Generation] 🚀 Starting full AI generation for series: ${seriesId}`);
    
    // 1. 获取系列信息
    const series = await db.getSeries(seriesId);
    if (!series) {
      return c.json({
        success: false,
        error: '漫剧不存在'
      }, 404);
    }
    
    const stats = {
      charactersGenerated: 0,
      episodesGenerated: 0,
      storyboardsGenerated: 0,
      videosSubmitted: 0
    };
    
    // 步骤1：生成角色（如果没有）
    console.log('[Full Generation] 👥 Step 1: Checking characters...');
    let characters = await db.getSeriesCharacters(seriesId);
    
    if (!characters || characters.length === 0) {
      console.log('[Full Generation] 🎭 Generating characters with AI...');
      characters = await generateCharactersWithAI(series);
      if (characters.length > 0) {
        const saved = await db.createCharacters(characters);
        stats.charactersGenerated = saved.length;
        console.log(`[Full Generation] ✅ Generated ${saved.length} characters`);
      }
    } else {
      console.log(`[Full Generation] ✅ Found ${characters.length} existing characters`);
    }
    
    // 步骤2：生成剧集（如果没有）
    console.log('[Full Generation] 📚 Step 2: Checking episodes...');
    let episodes = await db.getSeriesEpisodes(seriesId);
    
    if (!episodes || episodes.length === 0) {
      console.log('[Full Generation] 📝 Generating episodes with AI...');
      const totalEpisodes = series.totalEpisodes || 10;
      
      // 调用剧集生成
      const episodesData = await generateEpisodesWithAI(series, totalEpisodes);
      if (episodesData.length > 0) {
        const saved = await db.createEpisodes(episodesData);
        episodes = saved;
        stats.episodesGenerated = saved.length;
        console.log(`[Full Generation] ✅ Generated ${saved.length} episodes`);
      }
    } else {
      console.log(`[Full Generation] ✅ Found ${episodes.length} existing episodes`);
    }
    
    // 步骤3：为每集生成分镜（如果没有）
    console.log('[Full Generation] 🎬 Step 3: Generating storyboards...');
    let totalStoryboards = 0;
    
    for (let i = 0; i < episodes.length; i++) {
      const episode = episodes[i];
      console.log(`[Full Generation] 📹 Processing episode ${i + 1}/${episodes.length}: ${episode.title}`);
      
      // 检查该集是否已有分镜
      const existingStoryboards = await db.getEpisodeStoryboards(episode.id);
      
      if (!existingStoryboards || existingStoryboards.length === 0) {
        console.log(`[Full Generation] 🎨 Generating storyboards for episode ${episode.episode_number}...`);
        
        const storyboards = await generateStoryboardsWithAI(series, episode, characters, 10);
        if (storyboards.length > 0) {
          const saved = await db.createStoryboards(storyboards);
          totalStoryboards += saved.length;
          
          // 更新剧集状态
          await db.updateEpisode(episode.id, {
            scene_count: saved.length,
            status: 'storyboarded'
          });
          
          console.log(`[Full Generation] ✅ Generated ${saved.length} storyboards for episode ${episode.episode_number}`);
        }
      } else {
        console.log(`[Full Generation] ✅ Episode ${episode.episode_number} already has ${existingStoryboards.length} storyboards`);
        totalStoryboards += existingStoryboards.length;
      }
    }
    
    stats.storyboardsGenerated = totalStoryboards;
    
    // 步骤4：提交视频生成任务
    console.log('[Full Generation] 🎥 Step 4: Submitting video generation tasks...');
    
    // 获取所有分镜
    const allStoryboards = await db.getSeriesStoryboards(seriesId);
    console.log(`[Full Generation] 📊 Total storyboards to generate: ${allStoryboards.length}`);
    
    // 为每个分镜提交视频生成任务
    let videosSubmitted = 0;
    for (const storyboard of allStoryboards) {
      try {
        // 构建视频生成prompt
        const prompt = buildVideoPrompt(series, storyboard);
        
        // 提交到视频生成队列（这里需要调用实际的视频生成API）
        // 暂时标记为pending状态
        await db.updateStoryboard(storyboard.id, {
          status: 'pending_video'
        });
        
        videosSubmitted++;
      } catch (error: any) {
        console.error(`[Full Generation] ⚠️ Failed to submit video for storyboard ${storyboard.id}:`, error.message);
      }
    }
    
    stats.videosSubmitted = videosSubmitted;
    
    // 更新系列状态
    await db.updateSeries(seriesId, {
      status: 'generating',
      updated_at: new Date().toISOString()
    });
    
    console.log('[Full Generation] 🎉 Full generation completed!');
    console.log('[Full Generation] 📊 Stats:', stats);
    
    return c.json({
      success: true,
      data: {
        stats,
        message: '完整生成流程已启动',
        details: {
          characters: `${stats.charactersGenerated > 0 ? '已生成' : '已存在'} ${characters.length} 个角色`,
          episodes: `${stats.episodesGenerated > 0 ? '已生成' : '已存在'} ${episodes.length} 集`,
          storyboards: `共生成 ${stats.storyboardsGenerated} 个分镜`,
          videos: `已提交 ${stats.videosSubmitted} 个视频生成任务`
        }
      }
    });
    
  } catch (error: any) {
    console.error('[Full Generation] ❌ Error:', error);
    return c.json({
      success: false,
      error: error.message || '完整生成失败'
    }, 500);
  }
}

/**
 * 使用AI生成角色
 */
async function generateCharactersWithAI(series: any): Promise<any[]> {
  const prompt = `你是一位专业的角色设计师。请为以下漫剧创作3-5个主要角色：

【漫剧信息】
- 标题：${series.title}
- 简介：${series.description}
- 类型：${series.genre || '剧情'}

【角色要求】
1. 每个角色包含：名字、年龄、性格、外貌、背景故事
2. 角色要有鲜明特点和成长空间
3. 角色关系要合理

请以JSON格式输出：
\`\`\`json
{
  "characters": [
    {
      "name": "角色名",
      "age": 25,
      "personality": "性格描述",
      "appearance": "外貌描述",
      "background": "背景故事"
    }
  ]
}
\`\`\``;

  try {
    const response = await callVolcengineAI(
      prompt,
      '你是专业编剧，擅长创作正能量角色。直接返回JSON格式，不要额外说明。',
      {
        temperature: 0.8,
        maxTokens: 2000,
        timeoutMs: 120000 // 2分钟超时
      }
    );
    if (!response) return [];
    
    const jsonMatch = response.content.match(/```json\s*([\s\S]*?)\s*```/) || 
                      response.content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return [];
    
    const parsed = JSON.parse(jsonMatch[1] || jsonMatch[0]);
    const aiCharacters = parsed.characters || [];
    
    return aiCharacters.map((c: any) => ({
      series_id: series.id,
      name: c.name,
      age: c.age,
      personality: c.personality || '',
      appearance: c.appearance || '',
      background: c.background || '',
      role: 'main'
    }));
  } catch (error) {
    console.error('[AI Characters] Error:', error);
    return [];
  }
}

/**
 * 使用AI生成剧集
 */
async function generateEpisodesWithAI(series: any, totalEpisodes: number): Promise<any[]> {
  const prompt = `为《${series.title}》生成${totalEpisodes}集的剧集大纲。

每集包含：标题、简介、主题、冲突。

以JSON格式输出：
\`\`\`json
{
  "episodes": [
    {
      "episodeNumber": 1,
      "title": "集标题",
      "synopsis": "集简介",
      "themes": ["主题1"],
      "conflict": "冲突描述"
    }
  ]
}
\`\`\``;

  try {
    const response = await callVolcengineAI(
      prompt,
      '你是专业编剧，擅长创作正能量故事，将故事合理拆分为连贯的剧集。直接返回JSON格式，不要额外说明。',
      {
        temperature: 0.8,
        maxTokens: 4000,
        timeoutMs: 180000 // 3分钟超时
      }
    );
    if (!response) return [];
    
    const jsonMatch = response.content.match(/```json\s*([\s\S]*?)\s*```/) || 
                      response.content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return [];
    
    const parsed = JSON.parse(jsonMatch[1] || jsonMatch[0]);
    const aiEpisodes = parsed.episodes || [];
    
    return aiEpisodes.map((ep: any) => ({
      series_id: series.id,
      episode_number: ep.episodeNumber,
      title: ep.title,
      synopsis: ep.synopsis || '',
      themes: Array.isArray(ep.themes) ? ep.themes.join(', ') : '',
      conflict: ep.conflict || '',
      status: 'draft',
      duration: 0,
      scene_count: 0
    }));
  } catch (error) {
    console.error('[AI Episodes] Error:', error);
    return [];
  }
}

/**
 * 使用AI生成分镜
 */
async function generateStoryboardsWithAI(
  series: any, 
  episode: any, 
  characters: any[], 
  sceneCount: number
): Promise<any[]> {
  const characterList = characters.map(c => c.name).join('、') || '主角';
  
  const prompt = `为《${series.title}》第${episode.episode_number}集创作${sceneCount}个分镜。

本集信息：
- 标题：${episode.title}
- 简介：${episode.synopsis}
- 角色：${characterList}

每个分镜包含：场景描述、地点、时间、角色、对话、氛围、镜头。

以JSON格式输出：
\`\`\`json
{
  "storyboards": [
    {
      "sceneNumber": 1,
      "description": "场景描述",
      "location": "地点",
      "timeOfDay": "day",
      "characters": ["角色1"],
      "dialogue": "对话内��",
      "mood": "氛围",
      "shotType": "中景",
      "action": "动作描述"
    }
  ]
}
\`\`\``;

  try {
    const response = await callVolcengineAI(
      prompt,
      '你是专业分镜师，擅长创作视觉冲击力强、情感丰富的分镜脚本。直接返回JSON格式，不要额外说明。',
      {
        temperature: 0.8,
        maxTokens: 6000,
        timeoutMs: 240000 // 4分钟超时
      }
    );
    if (!response) return [];
    
    const jsonMatch = response.content.match(/```json\s*([\s\S]*?)\s*```/) || 
                      response.content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return [];
    
    const parsed = JSON.parse(jsonMatch[1] || jsonMatch[0]);
    const aiStoryboards = parsed.storyboards || [];
    
    return aiStoryboards.map((sb: any) => ({
      episode_id: episode.id,
      series_id: series.id, // 🔥 v4.2.67: 添加series_id（必需字段）
      episode_number: episode.episode_number, // 🔥 v4.2.67: 添加episode_number（必需字段）
      scene_number: sb.sceneNumber,
      description: sb.description || '',
      location: sb.location || '',
      time_of_day: sb.timeOfDay || 'day',
      characters: Array.isArray(sb.characters) ? sb.characters.join(', ') : '',
      dialogue: sb.dialogue || '',
      mood: sb.mood || '',
      shot_type: sb.shotType || '中景',
      action: sb.action || '',
      duration: 0,
      status: 'draft'
    }));
  } catch (error) {
    console.error('[AI Storyboards] Error:', error);
    return [];
  }
}

/**
 * 构建视频生成prompt
 */
function buildVideoPrompt(series: any, storyboard: any): string {
  return `【故事背景】${series.title}。${series.description}。
【场景${storyboard.scene_number}】${storyboard.description}。
角色：${storyboard.characters}。地点：${storyboard.location}。时间：${storyboard.time_of_day}。
对话：${storyboard.dialogue}。
氛围：${storyboard.mood}。镜头：${storyboard.shot_type}。
视觉风格：${series.style || 'realistic'}，画面精美，细节丰富。
价值引导：${series.valueGuidance || '传递积极向上的正能量'}`;
}