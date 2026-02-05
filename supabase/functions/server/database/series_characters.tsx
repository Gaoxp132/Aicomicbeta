/**
 * 漫剧角色操作
 * 从 series.tsx 拆分出来的Character级别操作
 */

import { supabase } from './client.tsx';
import type { Character } from '../types/series_types.tsx';

// 导出类型（向后兼容）
export type { Character };

// ==================== Character操作 ====================

/**
 * 批量创建角色
 */
export async function createCharacters(
  characters: Omit<Character, 'id' | 'created_at'>[]
): Promise<Character[]> {
  try {
    const { data, error } = await supabase
      .from('series_characters')
      .insert(characters)
      .select();

    if (error) throw error;

    console.log(`[series_characters] ✅ Created ${data.length} characters`);
    return data;
  } catch (error) {
    console.error('[series_characters] Error creating characters:', error);
    throw error;
  }
}

/**
 * 获取漫剧的所有角色
 */
export async function getSeriesCharacters(seriesId: string): Promise<Character[]> {
  try {
    const { data, error } = await supabase
      .from('series_characters')
      .select('*')
      .eq('series_id', seriesId)
      .order('created_at', { ascending: true });

    if (error) throw error;

    return data || [];
  } catch (error) {
    console.error('[series_characters] Error getting series characters:', error);
    throw error;
  }
}

/**
 * 获取单个角色
 */
export async function getCharacter(characterId: string): Promise<Character | null> {
  try {
    const { data, error } = await supabase
      .from('series_characters')
      .select('*')
      .eq('id', characterId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return null;
      }
      throw error;
    }

    return data;
  } catch (error) {
    console.error('[series_characters] Error getting character:', error);
    throw error;
  }
}

/**
 * 更新角色信息
 */
export async function updateCharacter(
  characterId: string,
  updates: Partial<Character>
): Promise<Character> {
  try {
    const updateData: any = {
      ...updates,
    };

    // 移除不应该更新的字段
    delete updateData.id;
    delete updateData.series_id;
    delete updateData.created_at;

    const { data, error } = await supabase
      .from('series_characters')
      .update(updateData)
      .eq('id', characterId)
      .select()
      .single();

    if (error) throw error;

    console.log('[series_characters] ✅ Updated character:', characterId);
    return data;
  } catch (error) {
    console.error('[series_characters] Error updating character:', error);
    throw error;
  }
}

/**
 * 删除角色
 */
export async function deleteCharacter(characterId: string): Promise<void> {
  try {
    const { error } = await supabase
      .from('series_characters')
      .delete()
      .eq('id', characterId);

    if (error) throw error;

    console.log('[series_characters] ✅ Deleted character:', characterId);
  } catch (error) {
    console.error('[series_characters] Error deleting character:', error);
    throw error;
  }
}