/**
 * 漫剧分镜操作
 * 从 series.tsx 拆分出来的Storyboard级别操作
 */

import { supabase } from './client.tsx';
import type { Storyboard } from '../types/series_types.tsx';

// 导出类型（向后兼容）
export type { Storyboard };

// ==================== Storyboard操作 ====================

/**
 * 批量创建分镜
 */
export async function createStoryboards(
  storyboards: Omit<Storyboard, 'id' | 'created_at' | 'updated_at'>[]
): Promise<Storyboard[]> {
  try {
    const { data, error } = await supabase
      .from('series_storyboards')
      .insert(storyboards)
      .select();

    if (error) throw error;

    console.log(`[series_storyboards] ✅ Created ${data.length} storyboards`);
    return data;
  } catch (error) {
    console.error('[series_storyboards] Error creating storyboards:', error);
    throw error;
  }
}

/**
 * 获取剧集的所有分镜
 */
export async function getEpisodeStoryboards(episodeId: string): Promise<Storyboard[]> {
  try {
    // 先获取episode的series_id和episode_number
    const { data: episode, error: epError } = await supabase
      .from('series_episodes')
      .select('series_id, episode_number')
      .eq('id', episodeId)
      .single();

    if (epError) throw epError;
    if (!episode) return [];

    // 使用series_id和episode_number查询分镜
    const { data, error } = await supabase
      .from('series_storyboards')
      .select('*')
      .eq('series_id', episode.series_id)
      .eq('episode_number', episode.episode_number)
      .order('scene_number', { ascending: true });

    if (error) throw error;

    return data || [];
  } catch (error) {
    console.error('[series_storyboards] Error getting episode storyboards:', error);
    throw error;
  }
}

/**
 * 🔥 v4.2.67: 获取漫剧的所有分镜（跨所有剧集）
 */
export async function getSeriesStoryboards(seriesId: string): Promise<Storyboard[]> {
  try {
    const { data, error } = await supabase
      .from('series_storyboards')
      .select('*')
      .eq('series_id', seriesId)
      .order('episode_number', { ascending: true })
      .order('scene_number', { ascending: true });

    if (error) throw error;

    console.log(`[series_storyboards] ✅ Found ${data?.length || 0} storyboards for series ${seriesId}`);
    return data || [];
  } catch (error) {
    console.error('[series_storyboards] Error getting series storyboards:', error);
    throw error;
  }
}

/**
 * 获取单个分镜
 */
export async function getStoryboard(storyboardId: string): Promise<Storyboard | null> {
  try {
    const { data, error } = await supabase
      .from('series_storyboards')
      .select('*')
      .eq('id', storyboardId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return null;
      }
      throw error;
    }

    return data;
  } catch (error) {
    console.error('[series_storyboards] Error getting storyboard:', error);
    throw error;
  }
}

/**
 * 更新分镜信息
 */
export async function updateStoryboard(
  storyboardId: string,
  updates: Partial<Storyboard>
): Promise<Storyboard> {
  try {
    const updateData: any = {
      ...updates,
      updated_at: new Date().toISOString(),
    };

    // 移除不应该更新的字段
    delete updateData.id;
    delete updateData.episode_id;
    delete updateData.created_at;

    const { data, error } = await supabase
      .from('series_storyboards')
      .update(updateData)
      .eq('id', storyboardId)
      .select()
      .single();

    if (error) throw error;

    console.log('[series_storyboards] ✅ Updated storyboard:', storyboardId);
    return data;
  } catch (error) {
    console.error('[series_storyboards] Error updating storyboard:', error);
    throw error;
  }
}

/**
 * 删除分镜
 */
export async function deleteStoryboard(storyboardId: string): Promise<void> {
  try {
    const { error } = await supabase
      .from('series_storyboards')
      .delete()
      .eq('id', storyboardId);

    if (error) throw error;

    console.log('[series_storyboards] ✅ Deleted storyboard:', storyboardId);
  } catch (error) {
    console.error('[series_storyboards] Error deleting storyboard:', error);
    throw error;
  }
}

/**
 * 批量更新分镜状态
 */
export async function updateStoryboardsStatus(
  storyboardIds: string[],
  status: string
): Promise<void> {
  try {
    const { error } = await supabase
      .from('series_storyboards')
      .update({ 
        status,
        updated_at: new Date().toISOString(),
      })
      .in('id', storyboardIds);

    if (error) throw error;

    console.log(`[series_storyboards] ✅ Updated ${storyboardIds.length} storyboards to status: ${status}`);
  } catch (error) {
    console.error('[series_storyboards] Error updating storyboards status:', error);
    throw error;
  }
}