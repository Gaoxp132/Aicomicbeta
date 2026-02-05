/**
 * 漫剧剧集操作
 * 从 series.tsx 拆分出来的Episode级别操作
 */

import { supabase } from './client.tsx';
import type { Episode } from '../types/series_types.tsx';

// 导出类型（向后兼容）
export type { Episode };

// ==================== Episode操作 ====================

/**
 * 批量创建剧集
 */
export async function createEpisodes(
  episodes: Omit<Episode, 'id' | 'created_at' | 'updated_at'>[]
): Promise<Episode[]> {
  try {
    const { data, error } = await supabase
      .from('series_episodes')
      .insert(episodes)
      .select();

    if (error) throw error;

    console.log(`[series_episodes] ✅ Created ${data.length} episodes`);
    
    // 🔥 同步更新series表的total_episodes字段
    if (data.length > 0 && data[0].series_id) {
      const seriesId = data[0].series_id;
      
      // 查询该系列的总剧集数
      const { data: allEpisodes, error: countError } = await supabase
        .from('series_episodes')
        .select('id')
        .eq('series_id', seriesId);
      
      if (!countError && allEpisodes) {
        const totalCount = allEpisodes.length;
        
        // 更新total_episodes字段
        const { error: updateError } = await supabase
          .from('series')
          .update({ total_episodes: totalCount })
          .eq('id', seriesId);
        
        if (updateError) {
          console.warn(`[series_episodes] ⚠️ Failed to sync total_episodes for series ${seriesId}:`, updateError);
        } else {
          console.log(`[series_episodes] ✅ Synced total_episodes: ${totalCount} for series ${seriesId}`);
        }
      }
    }
    
    return data;
  } catch (error) {
    console.error('[series_episodes] Error creating episodes:', error);
    throw error;
  }
}

/**
 * 获取漫剧的所有剧集
 */
export async function getSeriesEpisodes(seriesId: string): Promise<Episode[]> {
  try {
    const { data, error } = await supabase
      .from('series_episodes')
      .select('*')
      .eq('series_id', seriesId)
      .order('episode_number', { ascending: true });

    if (error) throw error;

    return data || [];
  } catch (error) {
    console.error('[series_episodes] Error getting series episodes:', error);
    throw error;
  }
}

/**
 * 🔥 新增：分页获取漫剧剧集
 * @param seriesId 漫剧ID
 * @param limit 每页数量
 * @param offset 偏移量
 * @param includeStoryboards 是否包含分镜（默认false）
 */
export async function getSeriesEpisodesPaginated(
  seriesId: string,
  limit: number = 10,
  offset: number = 0,
  includeStoryboards: boolean = false
): Promise<{ episodes: Episode[]; total: number }> {
  try {
    console.log(`[series_episodes] 📄 Paginated query: limit=${limit}, offset=${offset}, includeStoryboards=${includeStoryboards}`);
    
    // 获取总数
    const { count } = await supabase
      .from('series_episodes')
      .select('*', { count: 'exact', head: true })
      .eq('series_id', seriesId);
    
    // 获取分页数据
    const { data: episodes, error } = await supabase
      .from('series_episodes')
      .select('*')
      .eq('series_id', seriesId)
      .order('episode_number', { ascending: true })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    let episodesWithStoryboards = episodes || [];
    
    // 如果需要加载分镜
    if (includeStoryboards && episodes && episodes.length > 0) {
      console.log(`[series_episodes] 🎬 Loading storyboards for ${episodes.length} episodes...`);
      
      const episodeIds = episodes.map(ep => ep.id);
      const { data: storyboards, error: sbError } = await supabase
        .from('series_storyboards')
        .select('*')
        .in('episode_id', episodeIds)
        .order('scene_number', { ascending: true });
      
      if (sbError) {
        console.error('[series_episodes] Error loading storyboards:', sbError);
      } else if (storyboards) {
        // 将分镜关联到对应的剧集
        episodesWithStoryboards = episodes.map(episode => ({
          ...episode,
          storyboards: storyboards.filter(sb => sb.episode_id === episode.id),
        }));
      }
    }

    console.log(`[series_episodes] ✅ Loaded ${episodesWithStoryboards.length} episodes (total: ${count})`);
    
    return {
      episodes: episodesWithStoryboards,
      total: count || 0,
    };
  } catch (error) {
    console.error('[series_episodes] Error getting paginated episodes:', error);
    throw error;
  }
}

/**
 * 获取单个剧集
 */
export async function getEpisode(episodeId: string): Promise<Episode | null> {
  try {
    const { data, error } = await supabase
      .from('series_episodes')
      .select('*')
      .eq('id', episodeId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return null;
      }
      throw error;
    }

    return data;
  } catch (error) {
    console.error('[series_episodes] Error getting episode:', error);
    throw error;
  }
}

/**
 * 更新剧集信息
 */
export async function updateEpisode(
  episodeId: string,
  updates: Partial<Episode>
): Promise<Episode> {
  try {
    const updateData: any = {
      ...updates,
      updated_at: new Date().toISOString(),
    };

    // 移除不应该更新的字段
    delete updateData.id;
    delete updateData.series_id;
    delete updateData.created_at;

    const { data, error } = await supabase
      .from('series_episodes')
      .update(updateData)
      .eq('id', episodeId)
      .select()
      .single();

    if (error) throw error;

    console.log('[series_episodes] ✅ Updated episode:', episodeId);
    return data;
  } catch (error) {
    console.error('[series_episodes] Error updating episode:', error);
    throw error;
  }
}

/**
 * 删除剧集
 */
export async function deleteEpisode(episodeId: string): Promise<void> {
  try {
    // 🔥 先获取series_id，用于后续同步total_episodes
    const { data: episode, error: fetchError } = await supabase
      .from('series_episodes')
      .select('series_id')
      .eq('id', episodeId)
      .single();
    
    if (fetchError && fetchError.code !== 'PGRST116') {
      throw fetchError;
    }
    
    const seriesId = episode?.series_id;
    
    // 删除剧集
    const { error } = await supabase
      .from('series_episodes')
      .delete()
      .eq('id', episodeId);

    if (error) throw error;

    console.log('[series_episodes] ✅ Deleted episode:', episodeId);
    
    // 🔥 同步更新series表的total_episodes字段
    if (seriesId) {
      const { data: allEpisodes, error: countError } = await supabase
        .from('series_episodes')
        .select('id')
        .eq('series_id', seriesId);
      
      if (!countError && allEpisodes) {
        const totalCount = allEpisodes.length;
        
        const { error: updateError } = await supabase
          .from('series')
          .update({ total_episodes: totalCount })
          .eq('id', seriesId);
        
        if (updateError) {
          console.warn(`[series_episodes] ⚠️ Failed to sync total_episodes for series ${seriesId}:`, updateError);
        } else {
          console.log(`[series_episodes] ✅ Synced total_episodes: ${totalCount} for series ${seriesId}`);
        }
      }
    }
  } catch (error) {
    console.error('[series_episodes] Error deleting episode:', error);
    throw error;
  }
}