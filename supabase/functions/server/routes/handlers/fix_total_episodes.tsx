/**
 * 一次性修复脚本：同步所有漫剧的total_episodes字段
 * 
 * 问题：数据库中的total_episodes字段可能与实际剧集数不一致
 * 解决：批量查询并更新所有series的total_episodes
 */

import type { Context } from "npm:hono";
import { supabase } from "../../database/client.tsx";

/**
 * 修复所有漫剧的total_episodes字段
 * GET /api/series/fix-total-episodes
 */
export async function fixTotalEpisodes(c: Context) {
  try {
    console.log('[FixTotalEpisodes] 🔧 Starting total_episodes sync...');

    // 1. 获取所有漫剧
    const { data: allSeries, error: seriesError } = await supabase
      .from('series')
      .select('id, title, total_episodes');

    if (seriesError) {
      console.error('[FixTotalEpisodes] ❌ Failed to fetch series:', seriesError);
      return c.json({
        success: false,
        error: seriesError.message
      }, 500);
    }

    if (!allSeries || allSeries.length === 0) {
      return c.json({
        success: true,
        message: 'No series found',
        fixed: 0
      });
    }

    console.log(`[FixTotalEpisodes] 📊 Found ${allSeries.length} series to check`);

    // 2. 批量查询每个series的实际剧集数
    const seriesIds = allSeries.map(s => s.id);
    const { data: allEpisodes, error: episodesError } = await supabase
      .from('series_episodes')
      .select('series_id, id')
      .in('series_id', seriesIds);

    if (episodesError) {
      console.error('[FixTotalEpisodes] ❌ Failed to fetch episodes:', episodesError);
      return c.json({
        success: false,
        error: episodesError.message
      }, 500);
    }

    // 3. 构建series_id到剧集数的映射
    const episodeCountMap = new Map<string, number>();
    (allEpisodes || []).forEach(ep => {
      const count = episodeCountMap.get(ep.series_id) || 0;
      episodeCountMap.set(ep.series_id, count + 1);
    });

    // 4. 找出需要更新的series
    const updates: Array<{ id: string; title: string; oldCount: number; newCount: number }> = [];
    
    for (const series of allSeries) {
      const actualCount = episodeCountMap.get(series.id) || 0;
      const currentCount = series.total_episodes || 0;
      
      if (actualCount !== currentCount) {
        updates.push({
          id: series.id,
          title: series.title,
          oldCount: currentCount,
          newCount: actualCount
        });
      }
    }

    console.log(`[FixTotalEpisodes] 🔍 Found ${updates.length} series with mismatched counts`);

    // 5. 批量更新
    const results = await Promise.all(
      updates.map(async (update) => {
        try {
          const { error } = await supabase
            .from('series')
            .update({ total_episodes: update.newCount })
            .eq('id', update.id);

          if (error) {
            console.error(`[FixTotalEpisodes] ❌ Failed to update ${update.title}:`, error);
            return {
              ...update,
              success: false,
              error: error.message
            };
          }

          console.log(`[FixTotalEpisodes] ✅ Updated "${update.title}": ${update.oldCount} → ${update.newCount}`);
          return {
            ...update,
            success: true
          };
        } catch (err: any) {
          console.error(`[FixTotalEpisodes] ❌ Exception updating ${update.title}:`, err);
          return {
            ...update,
            success: false,
            error: err.message
          };
        }
      })
    );

    const successCount = results.filter(r => r.success).length;
    const failedCount = results.filter(r => !r.success).length;

    console.log(`[FixTotalEpisodes] ✅ Sync complete: ${successCount} succeeded, ${failedCount} failed`);

    return c.json({
      success: true,
      message: `Synced ${successCount} series`,
      stats: {
        total: allSeries.length,
        checked: allSeries.length,
        needsUpdate: updates.length,
        updated: successCount,
        failed: failedCount
      },
      details: results.map(r => ({
        id: r.id,
        title: r.title,
        oldCount: r.oldCount,
        newCount: r.newCount,
        success: r.success,
        error: r.error
      }))
    });

  } catch (error: any) {
    console.error('[FixTotalEpisodes] ❌ Error:', error);
    return c.json({
      success: false,
      error: error.message
    }, 500);
  }
}
