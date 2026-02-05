/**
 * 漫剧AI生成处理器
 * 从 routes_series_core.tsx 提取的AI生成逻辑
 */

import type { Context } from "npm:hono";
import * as db from "../../database/series.tsx";
import { createCompleteSeriesFromIdea } from "../../ai/qwen_series_ai.tsx";

/**
 * 异步运行AI生成(不阻塞HTTP响应)
 */
async function runAIGeneration(
  seriesId: string,
  userInput: string,
  options: {
    targetAudience?: string;
    preferredThemes?: string[];
    totalEpisodes?: number;
    scriptGenre?: string;
  }
) {
  try {
    console.log('[SeriesCore AI] 🤖 Starting AI generation for series:', seriesId);
    console.log('[SeriesCore AI] User input:', userInput);
    console.log('[SeriesCore AI] Options:', JSON.stringify(options));

    // 更新进度：开始生成
    await db.updateSeriesProgress(seriesId, {
      currentStep: 1,
      totalSteps: 5,
      stepName: '正在构思故事大纲...',
    });

    // 调用AI生成完整漫剧
    const aiResult = await createCompleteSeriesFromIdea(userInput, {
      targetAudience: options.targetAudience || 'universal',
      preferredThemes: options.preferredThemes || ['SELF_GROWTH', 'FAMILY_BONDS'],
      totalEpisodes: options.totalEpisodes || 5,
      scriptGenre: options.scriptGenre || '现实生活',
    });

    console.log('[SeriesCore AI] ✅ AI generation complete:', aiResult.title);

    // 更新进度：AI生成完成
    await db.updateSeriesProgress(seriesId, {
      currentStep: 2,
      totalSteps: 5,
      stepName: '正在保存角色信息...',
    });

    // 更新漫剧基础信息
    await db.updateSeries(seriesId, {
      title: aiResult.title,
      description: aiResult.theme,
      theme: aiResult.theme,
      story_outline: aiResult.storyOutline,
      core_values: aiResult.coreValues,
      coherence_check: aiResult.coherenceCheck,
      status: 'completed',
    });

    // 🆕 创建角色数据
    if (aiResult.characters && aiResult.characters.length > 0) {
      console.log('[SeriesCore AI] 👥 Creating characters:', aiResult.characters.length);
      const charactersData = aiResult.characters.map((char: any) => ({
        series_id: seriesId,
        name: char.name,
        description: char.description,
        appearance: char.appearance,
        personality: char.personality,
        role: char.role,
        growth_arc: char.growthArc,
        core_values: char.coreValues || [],
      }));
      
      await db.createCharacters(charactersData);
      console.log('[SeriesCore AI] ✅ Characters created');
    }

    // 🆕 创建剧集和分镜数据
    if (aiResult.episodes && aiResult.episodes.length > 0) {
      console.log('[SeriesCore AI] 📺 Creating episodes:', aiResult.episodes.length);
      
      for (const episode of aiResult.episodes) {
        // 创建剧集
        const episodesData = [{
          series_id: seriesId,
          episode_number: episode.episodeNumber,
          title: episode.title,
          description: episode.description,
          theme: episode.theme || '',
          duration: episode.duration || 60,
          status: 'completed',
        }];
        
        const createdEpisodes = await db.createEpisodes(episodesData);
        const episodeId = createdEpisodes[0].id;
        
        console.log('[SeriesCore AI] ✅ Episode created:', episode.episodeNumber, episodeId);
        
        // 创建分镜
        if (episode.scenes && episode.scenes.length > 0) {
          const storyboardsData = episode.scenes.map((scene: any, index: number) => ({
            episode_id: episodeId,
            scene_number: index + 1,
            description: scene.description || scene.visualDescription || '',
            dialogue: scene.dialogue || '',
            characters: scene.characters || [],
            location: scene.location || '',
            duration: scene.duration || 15,
            visual_description: scene.visualDescription || scene.description || '',
            camera_angle: scene.cameraAngle || 'medium',
            lighting: scene.lighting || 'natural',
            mood: scene.mood || 'neutral',
            status: 'pending',
          }));
          
          await db.createStoryboards(storyboardsData);
          console.log('[SeriesCore AI] ✅ Storyboards created for episode:', episode.episodeNumber, storyboardsData.length);
        }
      }
      
      console.log('[SeriesCore AI] ✅ All episodes and storyboards created');
    }

    console.log('[SeriesCore AI] ✅ AI generation completed for series:', seriesId);
  } catch (error: any) {
    console.error('[SeriesCore AI] ❌ AI generation failed:', error);

    // 更新状态为失败
    await db.updateSeries(seriesId, {
      status: 'failed',
      error: error.message,
    }).catch(err => {
      console.error('[SeriesCore AI] Failed to update error status:', err);
    });
  }
}

/**
 * 从创意创建完整漫剧（AI生成）
 */
export async function createFromIdea(c: Context) {
  try {
    const body = await c.req.json();
    const {
      userInput,
      userPhone,
      targetAudience,
      preferredThemes,
      totalEpisodes,
      scriptGenre,
    } = body;

    if (!userPhone) {
      return c.json({ error: '缺少用户手机号' }, 400);
    }

    if (!userInput) {
      return c.json({ error: '请提供创作灵感或故事描述' }, 400);
    }

    console.log('[SeriesCore] 🎨 Creating series from idea for user:', userPhone);
    console.log('[SeriesCore] User input:', userInput.substring(0, 100) + '...');

    // 1. 先创建漫剧框架
    const newSeries = await db.createSeries({
      user_phone: userPhone,
      title: `创作中：${userInput.substring(0, 30)}...`,
      description: '准备开始创作...',
      genre: 'growth',
      style: 'realistic',
      theme: userInput,
      story_outline: userInput,
      total_episodes: totalEpisodes || 5,
      status: 'generating',
    });

    console.log('[SeriesCore] ✅ Series framework created:', newSeries.id);

    // 2. 异步启动AI生成（不阻塞响应）
    runAIGeneration(newSeries.id, userInput, {
      targetAudience: targetAudience || 'universal',
      preferredThemes: preferredThemes || ['SELF_GROWTH', 'FAMILY_BONDS'],
      totalEpisodes: totalEpisodes || 5,
      scriptGenre: scriptGenre || '现实生活',
    }).catch(error => {
      console.error('[SeriesCore] AI generation failed:', error);
    });

    // 3. 立即返回
    return c.json({
      success: true,
      seriesId: newSeries.id,
      message: '漫剧创建成功，AI正在生成内容...',
      status: 'generating',
    });
  } catch (error: any) {
    console.error('[SeriesCore] Error creating series from idea:', error);
    return c.json({
      error: '创建漫剧失败',
      message: error.message,
    }, 500);
  }
}