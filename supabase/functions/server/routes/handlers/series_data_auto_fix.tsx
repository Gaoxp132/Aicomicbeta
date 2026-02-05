/**
 * 漫剧数据自动修复处理器
 * 用于修复：
 * 1. 有分镜但没有剧集的系列
 * 2. 缺失封面图的系列
 * 3. completedEpisodes计数不正确的系列
 * 
 * v4.2.67: 重构批量修复功能，使用AI自动生成缺失内容
 */

import type { Context } from "npm:hono";
import * as db from "../../database/index.tsx";
import { batchFixUserSeries } from "./series_batch_fix.tsx"; // 🔥 导入新的批量修复逻辑

/**
 * 自动修复单个漫剧的数据问题
 */
async function autoFixSeriesData(seriesId: string): Promise<{
  fixed: boolean;
  issues: string[];
  actions: string[];
}> {
  const issues: string[] = [];
  const actions: string[] = [];

  try {
    console.log(`[AutoFix] 🔍 Checking series ${seriesId}...`);

    // 1. 获取系列基本信息
    const { data: series, error: seriesError } = await db.supabase
      .from('series')
      .select('*')
      .eq('id', seriesId)
      .single();

    if (seriesError || !series) {
      issues.push('系列不存在');
      return { fixed: false, issues, actions };
    }

    // 2. 获取剧集
    const { data: episodes, error: epsError } = await db.supabase
      .from('series_episodes')
      .select('*')
      .eq('series_id', seriesId)
      .order('episode_number', { ascending: true });

    if (epsError) {
      issues.push(`获取剧集失败: ${epsError.message}`);
      return { fixed: false, issues, actions };
    }

    // 3. 获取所有分镜（包括孤立的分镜）
    const { data: allStoryboards, error: sbError } = await db.supabase
      .from('series_storyboards')
      .select('*')
      .order('scene_number', { ascending: true });

    if (sbError) {
      issues.push(`获取分镜失败: ${sbError.message}`);
      return { fixed: false, issues, actions };
    }

    // 4. 查找属于该系列的孤立分镜（没有episode_id或episode_id对应的episode不存在）
    const episodeIds = new Set((episodes || []).map(ep => ep.id));
    const orphanStoryboards = (allStoryboards || []).filter(sb => {
      // 检查分镜是否与该系列的剧集关联
      if (sb.episode_id && episodeIds.has(sb.episode_id)) {
        return false; // 已关联到有效剧集
      }
      // 检查是否可能属于该系列（通过task_id或其他方式）
      // 这里我们需要一个方法来判断分镜属于哪个系列
      // 暂时跳过，只处理已知的episode_id
      return false;
    });

    console.log(`[AutoFix] Series ${seriesId}: ${(episodes || []).length} episodes, ${orphanStoryboards.length} orphan storyboards`);

    // 5. 如果没有剧集但有分镜，尝试从分镜重建剧集
    if ((!episodes || episodes.length === 0) && allStoryboards && allStoryboards.length > 0) {
      issues.push('系列有分镜但没有剧集记录');
      
      // 按scene_number分组，每个分组创建一个剧集
      // 假设每6-10个分镜为一集
      const SCENES_PER_EPISODE = 8;
      const episodeGroups: any[][] = [];
      
      for (let i = 0; i < allStoryboards.length; i += SCENES_PER_EPISODE) {
        episodeGroups.push(allStoryboards.slice(i, i + SCENES_PER_EPISODE));
      }

      for (let i = 0; i < episodeGroups.length; i++) {
        const group = episodeGroups[i];
        const episodeNumber = i + 1;
        
        // 创建剧集
        const { data: newEpisode, error: createError } = await db.supabase
          .from('series_episodes')
          .insert({
            series_id: seriesId,
            episode_number: episodeNumber,
            title: `第 ${episodeNumber} 集`,
            synopsis: `${series.title} - 第 ${episodeNumber} 集`,
            status: group.some(sb => sb.status === 'completed') ? 'completed' : 'generating',
          })
          .select()
          .single();

        if (createError) {
          console.error(`[AutoFix] Failed to create episode ${episodeNumber}:`, createError);
          continue;
        }

        // 将分镜关联到新创建的剧集
        const storyboardIds = group.map(sb => sb.id);
        const { error: updateError } = await db.supabase
          .from('series_storyboards')
          .update({ episode_id: newEpisode.id })
          .in('id', storyboardIds);

        if (updateError) {
          console.error(`[AutoFix] Failed to link storyboards to episode:`, updateError);
        } else {
          actions.push(`创建剧集 ${episodeNumber}，关联 ${group.length} 个分镜`);
        }
      }
    }

    // 6. 计算实际完成的剧集数
    let actualCompletedEpisodes = 0;
    for (const episode of episodes || []) {
      const { data: storyboards } = await db.supabase
        .from('series_storyboards')
        .select('*')
        .eq('series_id', episode.series_id)
        .eq('episode_number', episode.episode_number);

      if (storyboards && storyboards.length > 0) {
        const hasCompletedVideo = storyboards.some(sb => sb.status === 'completed' && sb.video_url);
        if (hasCompletedVideo) {
          actualCompletedEpisodes++;
        }
      }
    }

    // 7. 更新completed_episodes计数
    if (series.completed_episodes !== actualCompletedEpisodes) {
      issues.push(`完成集数不正确: ${series.completed_episodes} -> ${actualCompletedEpisodes}`);
      
      const { error: updateError } = await db.supabase
        .from('series')
        .update({ completed_episodes: actualCompletedEpisodes })
        .eq('id', seriesId);

      if (updateError) {
        console.error(`[AutoFix] Failed to update completed_episodes:`, updateError);
      } else {
        actions.push(`更新完成集数: ${actualCompletedEpisodes}`);
      }
    }

    // 8. 生成封面图（如果缺失）
    if (!series.cover_image_url) {  // ✅ 使用正确的列名
      issues.push('缺少封面图');
      
      // 获取第一个有视频的分镜
      if (episodes && episodes.length > 0) {
        const { data: firstStoryboard } = await db.supabase
          .from('series_storyboards')
          .select('video_url, image_url')
          .eq('series_id', episodes[0].series_id)
          .eq('episode_number', episodes[0].episode_number)
          .not('video_url', 'is', null)
          .order('scene_number', { ascending: true })
          .limit(1)
          .maybeSingle();

        if (firstStoryboard?.video_url) {
          // 使用视频URL作为封面（实际应用中应该生成缩略图）
          const coverImage = firstStoryboard.image_url || firstStoryboard.video_url;
          
          const { error: updateError } = await db.supabase
            .from('series')
            .update({ cover_image_url: coverImage })  // ✅ 使用正确的列名
            .eq('id', seriesId);

          if (updateError) {
            console.error(`[AutoFix] Failed to set cover image:`, updateError);
          } else {
            actions.push(`设置封面图: ${coverImage.substring(0, 50)}...`);
          }
        }
      }
    }

    console.log(`[AutoFix] ✅ Series ${seriesId} fixed:`, {
      issues: issues.length,
      actions: actions.length,
    });

    return {
      fixed: actions.length > 0,
      issues,
      actions,
    };
  } catch (error: any) {
    console.error(`[AutoFix] Error fixing series ${seriesId}:`, error);
    issues.push(`修复失败: ${error.message}`);
    return { fixed: false, issues, actions };
  }
}

/**
 * 批量修复所有漫剧数据
 */
export async function batchFixSeriesData(c: Context) {
  try {
    console.log('[AutoFix] 🔧 Starting batch data fix...');

    // 获取所有系列
    const { data: allSeries, error } = await db.supabase
      .from('series')
      .select('id, title')
      .order('created_at', { ascending: false });

    if (error) {
      return c.json({
        success: false,
        error: error.message,
      }, 500);
    }

    const results = [];
    let fixedCount = 0;
    let totalIssues = 0;

    for (const series of allSeries || []) {
      const result = await autoFixSeriesData(series.id);
      
      if (result.fixed) {
        fixedCount++;
      }
      
      totalIssues += result.issues.length;
      
      if (result.issues.length > 0 || result.actions.length > 0) {
        results.push({
          seriesId: series.id,
          seriesTitle: series.title,
          ...result,
        });
      }
    }

    console.log(`[AutoFix] ✅ Batch fix completed: ${fixedCount}/${allSeries?.length || 0} series fixed`);

    return c.json({
      success: true,
      data: {
        totalSeries: allSeries?.length || 0,
        fixedCount,
        totalIssues,
        results,
      },
    });
  } catch (error: any) {
    console.error('[AutoFix] Batch fix error:', error);
    return c.json({
      success: false,
      error: error.message,
    }, 500);
  }
}

/**
 * 修复单个漫剧数据
 */
export async function fixSingleSeries(c: Context) {
  try {
    const seriesId = c.req.param('seriesId');
    
    if (!seriesId) {
      return c.json({
        success: false,
        error: 'Series ID is required',
      }, 400);
    }

    const result = await autoFixSeriesData(seriesId);

    return c.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    console.error('[AutoFix] Fix single series error:', error);
    return c.json({
      success: false,
      error: error.message,
    }, 500);
  }
}

/**
 * 检测数据问题（不修复）
 */
export async function detectDataIssues(c: Context) {
  try {
    console.log('[AutoFix] 🔍 Detecting data issues...');

    const { data: allSeries, error } = await db.supabase
      .from('series')
      .select('id, title, cover_image_url, completed_episodes, total_episodes')  // ✅ 使用正确的列名
      .order('created_at', { ascending: false });

    if (error) {
      return c.json({
        success: false,
        error: error.message,
      }, 500);
    }

    const issues = [];

    for (const series of allSeries || []) {
      const seriesIssues = [];

      // 检查是否有剧集
      const { data: episodes, count: episodeCount } = await db.supabase
        .from('series_episodes')
        .select('id', { count: 'exact' })
        .eq('series_id', series.id);

      if (!episodes || episodes.length === 0) {
        seriesIssues.push('没有剧集记录');
      }

      // 检查封面图
      if (!series.cover_image_url) {  // ✅ 使用正确的列名
        seriesIssues.push('缺少封面图');
      }

      // 检查完成集数
      if (series.completed_episodes === 0 && episodeCount && episodeCount > 0) {
        seriesIssues.push('可能有已完成的剧集但计数为0');
      }

      if (seriesIssues.length > 0) {
        issues.push({
          seriesId: series.id,
          seriesTitle: series.title,
          issues: seriesIssues,
        });
      }
    }

    return c.json({
      success: true,
      data: {
        totalSeries: allSeries?.length || 0,
        seriesWithIssues: issues.length,
        issues,
      },
    });
  } catch (error: any) {
    console.error('[AutoFix] Detect issues error:', error);
    return c.json({
      success: false,
      error: error.message,
    }, 500);
  }
}