/**
 * 章节数据库操作模块
 * 用于管理长剧（30-80集）的章节
 */

import { supabase } from './client.tsx';

// 章节接口
export interface Chapter {
  id: string;
  seriesId: string;
  chapterNumber: number;
  title: string;
  description: string;
  episodeRangeStart: number;
  episodeRangeEnd: number;
  theme?: string;
  status: 'draft' | 'in-progress' | 'completed';
  createdAt: string;
  updatedAt: string;
}

// 章节输入接口
export interface ChapterInput {
  seriesId: string;
  chapterNumber: number;
  title: string;
  description?: string;
  episodeRangeStart: number;
  episodeRangeEnd: number;
  theme?: string;
  status?: 'draft' | 'in-progress' | 'completed';
}

/**
 * 创建章节
 */
export async function createChapters(chapters: ChapterInput[]): Promise<Chapter[]> {
  console.log(`[series_chapters] Creating ${chapters.length} chapters...`);
  
  const dbChapters = chapters.map(chapter => ({
    series_id: chapter.seriesId,
    chapter_number: chapter.chapterNumber,
    title: chapter.title,
    description: chapter.description || '',
    episode_range_start: chapter.episodeRangeStart,
    episode_range_end: chapter.episodeRangeEnd,
    theme: chapter.theme,
    status: chapter.status || 'draft',
  }));

  const { data, error } = await supabase
    .from('chapters')
    .insert(dbChapters)
    .select();

  if (error) {
    console.error('[series_chapters] Error creating chapters:', error);
    throw new Error(`Failed to create chapters: ${error.message}`);
  }

  console.log(`[series_chapters] ✅ Created ${data.length} chapters`);
  return data.map(convertFromDB);
}

/**
 * 获取系列的所有章节
 */
export async function getSeriesChapters(seriesId: string): Promise<Chapter[]> {
  console.log(`[series_chapters] Getting chapters for series ${seriesId}...`);

  try {
    const { data, error } = await supabase
      .from('chapters')
      .select('*')
      .eq('series_id', seriesId)
      .order('chapter_number', { ascending: true });

    if (error) {
      // 如果表不存在，返回空数组而不是抛出错误
      if (error.code === 'PGRST205' || error.message.includes('Could not find the table')) {
        console.warn('[series_chapters] ⚠️ Chapters table does not exist yet, returning empty array');
        return [];
      }
      
      console.error('[series_chapters] Error getting chapters:', error);
      throw new Error(`Failed to get chapters: ${error.message}`);
    }

    console.log(`[series_chapters] ✅ Found ${data?.length || 0} chapters`);
    return data ? data.map(convertFromDB) : [];
  } catch (error: any) {
    // 如果是表不存在错误，返回空数组
    if (error.message && error.message.includes('Could not find the table')) {
      console.warn('[series_chapters] ⚠️ Chapters table does not exist, returning empty array');
      return [];
    }
    
    console.error('[series_chapters] Unexpected error:', error);
    throw error;
  }
}

/**
 * 获取单个章节
 */
export async function getChapter(chapterId: string): Promise<Chapter | null> {
  console.log(`[series_chapters] Getting chapter ${chapterId}...`);

  const { data, error } = await supabase
    .from('chapters')
    .select('*')
    .eq('id', chapterId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      console.log(`[series_chapters] Chapter ${chapterId} not found`);
      return null;
    }
    console.error('[series_chapters] Error getting chapter:', error);
    throw new Error(`Failed to get chapter: ${error.message}`);
  }

  return convertFromDB(data);
}

/**
 * 更新章节
 */
export async function updateChapter(
  chapterId: string,
  updates: Partial<ChapterInput>
): Promise<Chapter> {
  console.log(`[series_chapters] Updating chapter ${chapterId}...`);

  const dbUpdates: any = {};
  
  if (updates.title !== undefined) dbUpdates.title = updates.title;
  if (updates.description !== undefined) dbUpdates.description = updates.description;
  if (updates.episodeRangeStart !== undefined) dbUpdates.episode_range_start = updates.episodeRangeStart;
  if (updates.episodeRangeEnd !== undefined) dbUpdates.episode_range_end = updates.episodeRangeEnd;
  if (updates.theme !== undefined) dbUpdates.theme = updates.theme;
  if (updates.status !== undefined) dbUpdates.status = updates.status;

  const { data, error } = await supabase
    .from('chapters')
    .update(dbUpdates)
    .eq('id', chapterId)
    .select()
    .single();

  if (error) {
    console.error('[series_chapters] Error updating chapter:', error);
    throw new Error(`Failed to update chapter: ${error.message}`);
  }

  console.log(`[series_chapters] ✅ Updated chapter ${chapterId}`);
  return convertFromDB(data);
}

/**
 * 删除章节
 */
export async function deleteChapter(chapterId: string): Promise<void> {
  console.log(`[series_chapters] Deleting chapter ${chapterId}...`);

  const { error } = await supabase
    .from('chapters')
    .delete()
    .eq('id', chapterId);

  if (error) {
    console.error('[series_chapters] Error deleting chapter:', error);
    throw new Error(`Failed to delete chapter: ${error.message}`);
  }

  console.log(`[series_chapters] ✅ Deleted chapter ${chapterId}`);
}

/**
 * 批量删除系列的所有章节
 */
export async function deleteSeriesChapters(seriesId: string): Promise<void> {
  console.log(`[series_chapters] Deleting all chapters for series ${seriesId}...`);

  const { error } = await supabase
    .from('chapters')
    .delete()
    .eq('series_id', seriesId);

  if (error) {
    console.error('[series_chapters] Error deleting chapters:', error);
    throw new Error(`Failed to delete chapters: ${error.message}`);
  }

  console.log(`[series_chapters] ✅ Deleted all chapters for series ${seriesId}`);
}

/**
 * 更新章节状态（基于包含的剧集状态）
 */
export async function updateChapterStatus(chapterId: string): Promise<void> {
  console.log(`[series_chapters] Updating status for chapter ${chapterId}...`);

  const { error } = await supabase.rpc('update_chapter_status', {
    chapter_id_param: chapterId
  });

  if (error) {
    console.error('[series_chapters] Error updating chapter status:', error);
    // 不抛出错误，因为这是一个辅助功能
    console.warn('[series_chapters] Failed to update chapter status, continuing...');
    return;
  }

  console.log(`[series_chapters] ✅ Updated status for chapter ${chapterId}`);
}

/**
 * 获取章节内的所有剧集
 */
export async function getChapterEpisodes(chapterId: string): Promise<any[]> {
  console.log(`[series_chapters] Getting episodes for chapter ${chapterId}...`);

  const { data, error } = await supabase.rpc('get_chapter_episodes', {
    chapter_id_param: chapterId
  });

  if (error) {
    console.error('[series_chapters] Error getting chapter episodes:', error);
    throw new Error(`Failed to get chapter episodes: ${error.message}`);
  }

  console.log(`[series_chapters] ✅ Found ${data?.length || 0} episodes in chapter`);
  return data || [];
}

/**
 * 数据库格式转换为应用格式
 */
function convertFromDB(dbChapter: any): Chapter {
  return {
    id: dbChapter.id,
    seriesId: dbChapter.series_id,
    chapterNumber: dbChapter.chapter_number,
    title: dbChapter.title,
    description: dbChapter.description || '',
    episodeRangeStart: dbChapter.episode_range_start,
    episodeRangeEnd: dbChapter.episode_range_end,
    theme: dbChapter.theme,
    status: dbChapter.status,
    createdAt: dbChapter.created_at,
    updatedAt: dbChapter.updated_at,
  };
}

console.log('[series_chapters.tsx] ✅ Chapter database operations module loaded');