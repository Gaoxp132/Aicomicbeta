/**
 * 批量修复用户的所有series数据
 * v4.2.67: 自动检测并修复缺失episodes的series
 */

import type { Context } from "npm:hono";
import * as db from "../../database/index.tsx";
import { callVolcengineAI } from "../../ai/volcengine_ai_engine.tsx";

/**
 * 批量修复用户的所有缺失数据的series
 * POST /series/batch-fix
 */
export async function batchFixUserSeries(c: Context) {
  try {
    const { userPhone } = await c.req.json();
    
    if (!userPhone) {
      return c.json({
        success: false,
        error: '缺少用户手机号'
      }, 400);
    }
    
    console.log(`[BatchFix] 🚀 Starting batch fix for user: ${userPhone}`);
    
    // 1. 获取用户的所有series
    const allSeries = await db.getUserSeries(userPhone);
    console.log(`[BatchFix] 📊 Found ${allSeries.length} series for user`);
    
    if (!allSeries || allSeries.length === 0) {
      return c.json({
        success: true,
        message: '用户没有漫剧',
        data: {
          total: 0,
          fixed: 0,
          skipped: 0,
          failed: 0,
        }
      });
    }
    
    const fixResults = {
      total: allSeries.length,
      fixed: 0,
      skipped: 0,
      failed: 0,
      details: [] as any[]
    };
    
    // 2. 逐个检查并修复
    for (const series of allSeries) {
      try {
        console.log(`[BatchFix] 🔍 Checking series: ${series.id} - ${series.title}`);
        
        // 检查episodes
        const episodes = await db.getSeriesEpisodes(series.id);
        const expectedCount = series.total_episodes || 0;
        const actualCount = episodes.length;
        
        console.log(`[BatchFix] 📋 Episodes: ${actualCount}/${expectedCount}`);
        
        if (actualCount === expectedCount) {
          console.log(`[BatchFix] ✅ Series ${series.id} is complete, skipping`);
          fixResults.skipped++;
          fixResults.details.push({
            seriesId: series.id,
            title: series.title,
            status: 'skipped',
            message: '数据完整',
          });
          continue;
        }
        
        // 需要修复
        console.log(`[BatchFix] 🔧 Fixing series: ${series.id}`);
        
        // 调用AI生成缺失的内容
        const fixResult = await fixSeriesData(series);
        
        if (fixResult.success) {
          fixResults.fixed++;
          fixResults.details.push({
            seriesId: series.id,
            title: series.title,
            status: 'fixed',
            message: `已生成 ${fixResult.episodesCreated} 集, ${fixResult.storyboardsCreated} 个分镜`,
          });
        } else {
          fixResults.failed++;
          fixResults.details.push({
            seriesId: series.id,
            title: series.title,
            status: 'failed',
            message: fixResult.error || '修复失败',
          });
        }
        
      } catch (error: any) {
        console.error(`[BatchFix] ❌ Error fixing series ${series.id}:`, error);
        fixResults.failed++;
        fixResults.details.push({
          seriesId: series.id,
          title: series.title,
          status: 'error',
          message: error.message,
        });
      }
    }
    
    console.log(`[BatchFix] 🎉 Batch fix completed:`, fixResults);
    
    return c.json({
      success: true,
      message: '批量修复完成',
      data: fixResults
    });
    
  } catch (error: any) {
    console.error('[BatchFix] ❌ Error:', error);
    return c.json({
      success: false,
      error: error.message || '批量修复失败'
    }, 500);
  }
}

/**
 * 修复单个series的数据
 */
async function fixSeriesData(series: any): Promise<any> {
  try {
    let episodesCreated = 0;
    let storyboardsCreated = 0;
    
    // 1. 检查并生成角色
    let characters = await db.getSeriesCharacters(series.id);
    if (!characters || characters.length === 0) {
      characters = await generateCharactersAI(series);
      if (characters.length > 0) {
        await db.createCharacters(characters);
      }
    }
    
    // 2. 检查并生成episodes
    let episodes = await db.getSeriesEpisodes(series.id);
    const expectedEpisodes = series.total_episodes || 10;
    
    if (!episodes || episodes.length === 0) {
      const episodesData = await generateEpisodesAI(series, expectedEpisodes);
      if (episodesData.length > 0) {
        const created = await db.createEpisodes(episodesData);
        episodes = created;
        episodesCreated = created.length;
      }
    }
    
    // 3. 为每集生成分镜
    for (const episode of episodes) {
      const existingStoryboards = await db.getEpisodeStoryboards(episode.id);
      
      if (!existingStoryboards || existingStoryboards.length === 0) {
        const storyboards = await generateStoryboardsAI(series, episode, characters, 5);
        if (storyboards.length > 0) {
          const created = await db.createStoryboards(storyboards);
          storyboardsCreated += created.length;
          
          await db.updateEpisode(episode.id, {
            scene_count: created.length,
            status: 'storyboarded'
          });
        }
      }
    }
    
    // 更新series状态
    await db.updateSeries(series.id, {
      status: 'completed',
      updated_at: new Date().toISOString()
    });
    
    return {
      success: true,
      episodesCreated,
      storyboardsCreated,
    };
    
  } catch (error: any) {
    console.error('[FixSeriesData] Error:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

// AI生成函数（复用之前的逻辑）
async function generateCharactersAI(series: any): Promise<any[]> {
  const prompt = `为漫剧《${series.title}》创作3-5个主要角色。

简介：${series.description}
类型：${series.genre || '剧情'}

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
    const response = await callVolcengineAI(prompt, '你是专业编剧，擅长创作正能量角色。直接返回JSON格式。', {
      temperature: 0.8,
      maxTokens: 2000,
      timeoutMs: 120000
    });
    
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

async function generateEpisodesAI(series: any, totalEpisodes: number): Promise<any[]> {
  const prompt = `为《${series.title}》生成${totalEpisodes}集的剧集大纲。

每集包含：标题、简介、主题。

以JSON格式输出：
\`\`\`json
{
  "episodes": [
    {
      "episodeNumber": 1,
      "title": "集标题",
      "synopsis": "集简介",
      "themes": ["主题1"]
    }
  ]
}
\`\`\``;

  try {
    const response = await callVolcengineAI(prompt, '你是专业编剧，擅长创作正能量故事。直接返回JSON格式。', {
      temperature: 0.8,
      maxTokens: 4000,
      timeoutMs: 180000
    });
    
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
      status: 'draft',
      duration: 0,
      scene_count: 0
    }));
  } catch (error) {
    console.error('[AI Episodes] Error:', error);
    return [];
  }
}

async function generateStoryboardsAI(
  series: any, 
  episode: any, 
  characters: any[], 
  sceneCount: number
): Promise<any[]> {
  const characterList = characters.map(c => c.name).join('、') || '主角';
  
  const prompt = `为《${series.title}》第${episode.episode_number}集创作${sceneCount}个分镜。

本集：${episode.title} - ${episode.synopsis}
角色：${characterList}

每个分镜包含：场景描述、地点、时间、对话。

以JSON格式输出：
\`\`\`json
{
  "storyboards": [
    {
      "sceneNumber": 1,
      "description": "场景描述",
      "location": "地点",
      "timeOfDay": "day",
      "dialogue": "对话内容"
    }
  ]
}
\`\`\``;

  try {
    const response = await callVolcengineAI(prompt, '你是专业分镜师。直接返回JSON格式。', {
      temperature: 0.8,
      maxTokens: 6000,
      timeoutMs: 240000
    });
    
    if (!response) return [];
    
    const jsonMatch = response.content.match(/```json\s*([\s\S]*?)\s*```/) || 
                      response.content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return [];
    
    const parsed = JSON.parse(jsonMatch[1] || jsonMatch[0]);
    const aiStoryboards = parsed.storyboards || [];
    
    return aiStoryboards.map((sb: any) => ({
      episode_id: episode.id,
      series_id: series.id,
      episode_number: episode.episode_number,
      scene_number: sb.sceneNumber,
      description: sb.description || '',
      location: sb.location || '',
      time_of_day: sb.timeOfDay || 'day',
      dialogue: sb.dialogue || '',
      duration: 0,
      status: 'draft'
    }));
  } catch (error) {
    console.error('[AI Storyboards] Error:', error);
    return [];
  }
}
