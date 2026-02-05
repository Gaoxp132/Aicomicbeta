/**
 * 漫剧剧集修复工具
 * 用于修复status=completed但episodes=0的系列数据问题
 */

import type { Context } from "npm:hono";
import * as db from "../../database/series.tsx";
import { analyzeStoryOutline } from "../../ai/qwen_series_ai.tsx";
import { supabase } from "../../database/client.tsx";

/**
 * 诊断漫剧数据完整性
 * GET /make-server-fc31472c/series/:id/diagnose
 */
export async function diagnoseSeries(c: Context) {
  const seriesId = c.req.param("id");
  
  try {
    console.log('[SeriesFix] 🔍 Diagnosing series:', seriesId);
    
    // 1. 获取Series基本信息
    const series = await db.getSeries(seriesId);
    if (!series) {
      return c.json({ error: 'Series not found' }, 404);
    }
    
    // 2. 检查关联数据
    const [characters, episodes, chapters] = await Promise.all([
      db.getSeriesCharacters(seriesId),
      db.getSeriesEpisodes(seriesId),
      db.getSeriesChapters(seriesId),
    ]);
    
    // 3. 检查分镜数据
    const storyboardsCount = await Promise.all(
      episodes.map(ep => db.getEpisodeStoryboards(ep.id))
    ).then(results => results.reduce((sum, boards) => sum + boards.length, 0));
    
    // 4. 生成诊断报告
    const diagnosis = {
      seriesId: series.id,
      title: series.title,
      status: series.status,
      totalEpisodes: series.total_episodes,
      
      dataIntegrity: {
        characters: {
          count: characters.length,
          status: characters.length > 0 ? 'OK' : 'MISSING',
        },
        episodes: {
          count: episodes.length,
          expected: series.total_episodes,
          status: episodes.length === series.total_episodes ? 'OK' : 
                  episodes.length === 0 ? 'MISSING' : 'INCOMPLETE',
        },
        chapters: {
          count: chapters.length,
          status: 'OPTIONAL',
        },
        storyboards: {
          count: storyboardsCount,
          status: storyboardsCount > 0 ? 'OK' : 'MISSING',
        },
      },
      
      issues: [] as string[],
      fixable: false,
    };
    
    // 5. 识别问题
    if (series.status === 'completed' && episodes.length === 0) {
      diagnosis.issues.push('Series marked as completed but has no episodes');
      diagnosis.fixable = true;
    }
    
    if (episodes.length < series.total_episodes && series.status === 'completed') {
      diagnosis.issues.push(`Expected ${series.total_episodes} episodes but found ${episodes.length}`);
      diagnosis.fixable = true;
    }
    
    if (characters.length === 0 && episodes.length > 0) {
      diagnosis.issues.push('Has episodes but no characters defined');
    }
    
    if (storyboardsCount === 0 && episodes.length > 0) {
      diagnosis.issues.push('Has episodes but no storyboards');
      diagnosis.fixable = true;
    }
    
    console.log('[SeriesFix] ✅ Diagnosis complete:', diagnosis);
    
    return c.json({
      success: true,
      diagnosis,
    });
    
  } catch (error: any) {
    console.error('[SeriesFix] ❌ Diagnosis failed:', error);
    return c.json({
      success: false,
      error: error.message || 'Diagnosis failed',
    }, 500);
  }
}

/**
 * 修复缺失的剧集数据
 * POST /make-server-fc31472c/series/:id/fix-episodes
 */
export async function fixSeriesEpisodes(c: Context) {
  const seriesId = c.req.param("id");
  
  console.log('[SeriesFix] ========================================');
  console.log('[SeriesFix] 🔧 fixSeriesEpisodes CALLED');
  console.log('[SeriesFix] 📥 Series ID:', seriesId);
  console.log('[SeriesFix] 📥 Request path:', c.req.path);
  console.log('[SeriesFix] 📥 Request method:', c.req.method);
  console.log('[SeriesFix] ========================================');
  
  try {
    console.log('[SeriesFix] 🔧 Starting episode fix for series:', seriesId);
    
    // 1. 获取Series信息
    const series = await db.getSeries(seriesId);
    if (!series) {
      return c.json({ error: 'Series not found' }, 404);
    }
    
    console.log('[SeriesFix] 📋 Series data:', {
      id: series.id,
      title: series.title,
      total_episodes: series.total_episodes,
      status: series.status,
    });
    
    // 2. 检查现有Episodes
    const existingEpisodes = await db.getSeriesEpisodes(seriesId);
    
    // 🔥 v4.2.67: 修复 - 确保 total_episodes 有值
    const targetEpisodes = series.total_episodes || 0;
    console.log('[SeriesFix] 📊 Found', existingEpisodes.length, 'existing episodes, need', targetEpisodes);
    
    if (targetEpisodes === 0) {
      return c.json({
        success: false,
        error: 'Series has no target episodes count (total_episodes is 0 or undefined)',
      }, 400);
    }
    
    if (existingEpisodes.length === targetEpisodes) {
      return c.json({
        success: true,
        message: 'Series already has all episodes',
        episodes: existingEpisodes,
      });
    }
    
    // 🔥 v4.2.67.1: 测试 - 暂时不使用新字段，只更新status
    console.log('[SeriesFix] 🧪 Testing update without new fields...');
    await db.updateSeries(seriesId, {
      status: 'generating',
    });
    
    // 4. 异步生成缺失的内容（不阻塞响应）
    regenerateEpisodesAsync(seriesId, series).catch(error => {
      console.error('[SeriesFix] ❌ Async regeneration failed:', error);
    });
    
    return c.json({
      success: true,
      message: 'Episode regeneration started',
      status: 'generating',
    });
    
  } catch (error: any) {
    console.error('[SeriesFix] ❌ Fix failed:', error);
    return c.json({
      success: false,
      error: error.message || 'Fix failed',
    }, 500);
  }
}

/**
 * 异步重新生成剧集数据
 */
async function regenerateEpisodesAsync(seriesId: string, series: any) {
  try {
    console.log('[SeriesFix] 🚀 Starting async regeneration for:', seriesId);
    
    // Step 1: 分析故事大纲生成角色和剧集
    // ✅ v4.2.67: 使用新添加的独立字段
    await db.updateSeries(seriesId, {
      status: 'generating',
      current_step: '分析故事大纲',
      completed_steps: 1,
      total_steps: 5,
    });
    
    const storyOutline = series.story_outline || series.description;
    const analysis = await analyzeStoryOutline(
      storyOutline,
      seriesId,
      series.total_episodes
    );
    
    // Step 2: 创建角色（如果存在）
    await db.updateSeries(seriesId, {
      current_step: '生成角色',
      completed_steps: 2,
      total_steps: 5,
    });
    
    const existingCharacters = await db.getSeriesCharacters(seriesId);
    if (existingCharacters.length === 0 && analysis.characters) {
      const charactersData = analysis.characters.map((char: any) => ({
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
      console.log('[SeriesFix] ✅ Created characters:', charactersData.length);
    }
    
    // Step 3: 创建剧集
    await db.updateSeries(seriesId, {
      current_step: '生成剧集',
      completed_steps: 3,
      total_steps: 5,
    });
    
    const existingEpisodes = await db.getSeriesEpisodes(seriesId);
    const episodesToCreate = analysis.episodes.filter((ep: any) => 
      !existingEpisodes.some(existing => existing.episode_number === ep.episodeNumber)
    );
    
    if (episodesToCreate.length > 0) {
      const episodesData = episodesToCreate.map((ep: any) => ({
        series_id: seriesId,
        episode_number: ep.episodeNumber,
        title: ep.title,
        synopsis: ep.description || ep.synopsis || '',  // 🔥 v4.2.67: 使用synopsis替代description
        growth_theme: ep.theme || '',  // 🔥 v4.2.67: 使用growth_theme替代theme
        total_duration: ep.duration || 60,  // 🔥 v4.2.67: 使用total_duration替代duration
        status: 'completed',
      }));
      
      await db.createEpisodes(episodesData);
      console.log('[SeriesFix] ✅ Created episodes:', episodesData.length);
    }
    
    // Step 4: 为每个剧集创建分镜
    await db.updateSeries(seriesId, {
      current_step: '生成分镜',
      completed_steps: 4,
      total_steps: 5,
    });
    
    const allEpisodes = await db.getSeriesEpisodes(seriesId);
    
    for (const episode of allEpisodes) {
      const existingStoryboards = await db.getEpisodeStoryboards(episode.id);
      
      if (existingStoryboards.length === 0) {
        // 从分析结果中找到对应的episode数据
        const episodeData = analysis.episodes.find((ep: any) => 
          ep.episodeNumber === episode.episode_number
        );
        
        if (episodeData && episodeData.scenes) {
          const storyboardsData = episodeData.scenes.map((scene: any, index: number) => ({
            episode_id: episode.id,
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
          console.log('[SeriesFix] ✅ Created storyboards for episode', episode.episode_number);
        }
      }
    }
    
    // Step 5: 更新series状态（移除completed_episodes字段）
    await supabase
      .from('series')
      .update({ 
        status: 'completed',
        // 🔥 v4.2.67: 移除completed_episodes，这个字段不存在
      })
      .eq('id', seriesId);
    
    console.log('[SeriesFix] ✅ Regeneration complete for:', seriesId);
    
  } catch (error: any) {
    console.error('[SeriesFix] ❌ Regeneration failed:', error);
    
    // ✅ v4.2.67: 使用新添加的 error 字段
    await db.updateSeries(seriesId, {
      status: 'failed',
      error: error.message,
    }).catch(err => {
      console.error('[SeriesFix] Failed to update error status:', err);
    });
  }
}

/**
 * 扫描并修复所有漫剧
 * POST /make-server-fc31472c/series/scan-and-fix-all
 */
export async function scanAndFixAllSeries(c: Context) {
  try {
    const { userPhone } = await c.req.json();
    
    if (!userPhone) {
      return c.json({ error: 'Missing userPhone' }, 400);
    }
    
    console.log('[SeriesFix] 🔍 Scanning all series for user:', userPhone);
    
    // 获取用户的所有series
    const allSeries = await db.getUserSeries(userPhone);
    
    const issuesFound: any[] = [];
    let fixedCount = 0;
    
    for (const series of allSeries) {
      const episodes = await db.getSeriesEpisodes(series.id);
      
      // 检查是否有问题
      if (series.status === 'completed' && episodes.length === 0) {
        issuesFound.push({
          seriesId: series.id,
          title: series.title,
          issue: 'No episodes despite completed status',
        });
        
        // 触发修复
        regenerateEpisodesAsync(series.id, series).catch(err => {
          console.error('[SeriesFix] Failed to fix:', series.id, err);
        });
        
        fixedCount++;
      }
    }
    
    return c.json({
      success: true,
      scanned: allSeries.length,
      issuesFound: issuesFound.length,
      fixedCount,
      issues: issuesFound,
    });
    
  } catch (error: any) {
    console.error('[SeriesFix] ❌ Scan failed:', error);
    return c.json({
      success: false,
      error: error.message || 'Scan failed',
    }, 500);
  }
}

/**
 * 🆕 修复有分镜但没有剧集的情况
 * POST /make-server-fc31472c/series/:id/fix-orphan-storyboards
 */
export async function fixOrphanStoryboards(c: Context) {
  const seriesId = c.req.param("id");
  
  try {
    console.log('[SeriesFix] 🔧 Fixing orphan storyboards for series:', seriesId);
    
    // 1. 获取Series信息
    const series = await db.getSeries(seriesId);
    if (!series) {
      return c.json({ error: 'Series not found' }, 404);
    }
    
    // 2. 查找所有属于该系列的分镜
    const { data: allStoryboards, error: sbError } = await supabase
      .from('series_storyboards')
      .select('*')
      .eq('series_id', seriesId)
      .order('scene_number', { ascending: true });
    
    if (sbError) {
      console.error('[SeriesFix] Error fetching storyboards:', sbError);
      throw sbError;
    }
    
    if (!allStoryboards || allStoryboards.length === 0) {
      return c.json({
        success: true,
        message: 'No storyboards found for this series',
        fixed: 0,
      });
    }
    
    console.log('[SeriesFix] Found', allStoryboards.length, 'storyboards');
    
    // 3. 按episode_id分组
    const storyboardsByEpisode = new Map<string, any[]>();
    for (const sb of allStoryboards) {
      const episodeId = sb.episode_id;
      if (!storyboardsByEpisode.has(episodeId)) {
        storyboardsByEpisode.set(episodeId, []);
      }
      storyboardsByEpisode.get(episodeId)!.push(sb);
    }
    
    console.log('[SeriesFix] Found', storyboardsByEpisode.size, 'unique episode IDs');
    
    // 4. 检查每个episode是否存在，不存在则创建
    let fixedCount = 0;
    let episodeNumber = 1;
    
    for (const [episodeId, storyboards] of storyboardsByEpisode) {
      // 检查episode是否存在
      const existingEpisode = await db.getEpisode(episodeId);
      
      if (!existingEpisode) {
        console.log('[SeriesFix] Creating missing episode for ID:', episodeId);
        
        // 从分镜中提取信息
        const episodeTitle = `第${episodeNumber}集`;
        const episodeDescription = storyboards.map(sb => sb.description).join(' ');
        
        // 创建episode
        const { data: newEpisode, error: createError } = await supabase
          .from('series_episodes')
          .insert({
            id: episodeId, // 使用原有的ID
            series_id: seriesId,
            episode_number: episodeNumber,
            title: episodeTitle,
            description: episodeDescription.substring(0, 500),
            duration: storyboards.length * 15, // 每个分镜15秒
            status: 'completed',
          })
          .select()
          .single();
        
        if (createError) {
          console.error('[SeriesFix] Failed to create episode:', createError);
        } else {
          console.log('[SeriesFix] ✅ Created episode:', episodeNumber);
          fixedCount++;
        }
        
        episodeNumber++;
      }
    }
    
    // 5. 更新series的completed_episodes计数
    const allEpisodes = await db.getSeriesEpisodes(seriesId);
    await supabase
      .from('series')
      .update({ 
        status: 'completed',
        // 🔥 v4.2.67: 移除completed_episodes，这个字段不存在
      })
      .eq('id', seriesId);
    
    console.log('[SeriesFix] ✅ Fixed', fixedCount, 'orphan episodes');
    
    return c.json({
      success: true,
      message: `Successfully fixed ${fixedCount} orphan episodes`,
      fixed: fixedCount,
      totalEpisodes: allEpisodes.length,
    });
    
  } catch (error: any) {
    console.error('[SeriesFix] ❌ Fix failed:', error);
    return c.json({
      success: false,
      error: error.message || 'Fix failed',
    }, 500);
  }
}