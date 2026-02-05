/**
 * 标准创作模式 - 从故事大纲生成漫剧
 * 从 ai/auto_series_generator.tsx 提取
 * 负责：基于故事大纲，自动生成角色、剧集、分镜和视频
 */

import * as db from '../../database/series.tsx';
import { analyzeStoryOutline } from '../qwen_series_ai.tsx';
import { generateStoryboardsForEpisode } from './storyboard_generator.tsx';
import { autoGenerateAllVideos } from './video_generator.tsx';
import { AUTO_GENERATION_CONFIG } from './config.tsx';
import type { GenerationOptions } from './types.tsx';

/**
 * 🚀 完全自动化的漫剧生成（传统创作模式）
 */
export async function autoGenerateSeriesFromOutline(
  seriesId: string,
  options: GenerationOptions
): Promise<void> {
  console.log('[AutoGen] 🚀 Starting full auto-generation from outline:', seriesId);
  
  try {
    const { storyOutline, totalEpisodes, style, enableAudio } = options;
    
    // 📖 步骤1：AI分析故事大纲
    console.log('[AutoGen] 📖 Step 1/6: Analyzing story outline...');
    await db.updateSeriesProgress(seriesId, 1, '分析故事大纲');
    
    const analysis = await analyzeStoryOutline(storyOutline || '', seriesId, totalEpisodes || 5);
    
    // 👥 步骤2：创建角色
    console.log('[AutoGen] 👥 Step 2/6: Creating characters...');
    await db.updateSeriesProgress(seriesId, 2, '生成角色');
    
    const charactersData = analysis.characters.map((char: any) => ({
      series_id: seriesId,
      name: char.name,
      description: char.description,
      appearance: char.appearance,
      personality: char.personality,
      role: char.role,
      growth_arc: char.growthArc,
      core_values: char.coreValues,
    }));
    
    const characters = await db.createCharacters(charactersData);
    console.log('[AutoGen] ✅ Created', characters.length, 'characters');
    
    // 📚 步骤3：创建剧集
    console.log('[AutoGen] 📚 Step 3/6: Creating episodes...');
    await db.updateSeriesProgress(seriesId, 3, '生成剧集');
    
    const episodesData = analysis.episodes.map((ep: any) => ({
      series_id: seriesId,
      episode_number: ep.episodeNumber,
      title: ep.title,
      synopsis: ep.synopsis || '',  // 🔥 v4.2.67: 使用synopsis替代description
      growth_theme: ep.growthTheme || '',  // 🔥 v4.2.67: 使用growth_theme
      growth_insight: ep.growthInsight || '',  // 🔥 v4.2.67: 新增字段
      total_duration: 0,  // 🔥 v4.2.67: 使用total_duration，初始为0
      status: 'draft' as const,
    }));
    
    const episodes = await db.createEpisodes(episodesData);
    console.log('[AutoGen] ✅ Created', episodes.length, 'episodes');
    
    // 🎨 步骤4：为每集生成分镜
    console.log('[AutoGen] 🎨 Step 4/6: Generating storyboards...');
    
    for (let i = 0; i < episodes.length; i++) {
      const episode = episodes[i];
      await db.updateSeriesProgress(seriesId, 4, `生成分镜 (${i + 1}/${episodes.length})`);
      
      try {
        const storyboards = await generateStoryboardsForEpisode(
          episode,
          characters,
          style || 'realistic'
        );
        
        await db.createStoryboards(storyboards);
        
        // 更新剧集总时长
        const totalDuration = storyboards.reduce((sum, sb) => sum + sb.duration, 0);
        await db.updateEpisode(episode.id, { total_duration: totalDuration });
        
        console.log(`[AutoGen] ✅ Generated ${storyboards.length} storyboards for Episode ${episode.episode_number}`);
        
      } catch (error: any) {
        console.error(`[AutoGen] ⚠️ Failed to generate storyboards for Episode ${episode.episode_number}:`, error);
        
        // Fallback: 创建基础分镜
        const fallbackStoryboard = [{
          episode_id: episode.id,
          scene_number: 1,
          description: episode.synopsis,
          duration: 10,
          status: 'draft' as const,
        }];
        
        await db.createStoryboards(fallbackStoryboard);
        await db.updateEpisode(episode.id, { total_duration: 10 });
      }
    }
    
    console.log('[AutoGen] ✅ All storyboards generated');
    
    // 🎬 步骤5：自动生成所有视频
    if (AUTO_GENERATION_CONFIG.VIDEO_GENERATION_ENABLED) {
      await autoGenerateAllVideos(
        seriesId, 
        style || 'realistic', 
        enableAudio || false,
        options.userPhone || 'system' // 🔧 关键修复：传递 userPhone 参数
      );
    }
    
    // 🎉 步骤6：完成
    console.log('[AutoGen] 🎉 Step 6/6: Finalizing...');
    await db.updateSeries(seriesId, {
      status: 'completed',
      generation_progress: {
        currentStep: 6,
        totalSteps: 6,
        stepName: '创作完成',
        completedAt: new Date().toISOString(),
      },
    });
    
    console.log('[AutoGen] 🎉 Series fully completed:', seriesId);
    
  } catch (error: any) {
    console.error('[AutoGen] ❌ Auto-generation failed:', error);
    
    // 🔧 如果Series已被删除，不要尝试更新状态
    if (error.message === 'Series not found') {
      console.warn('[AutoGen] ⚠️ Series was deleted, skipping status update');
      return;
    }
    
    try {
      await db.updateSeries(seriesId, {
        status: 'failed',
        generation_progress: {
          currentStep: 0,
          totalSteps: 6,
          stepName: '自动生成失败',
          error: error.message,
          failedAt: new Date().toISOString(),
        },
      });
    } catch (updateError: any) {
      console.error('[AutoGen] ❌ Failed to update series status:', updateError.message);
    }
    
    throw error;
  }
}