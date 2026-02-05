/**
 * 漫剧系统数据库操作 - 统一导出
 * 已重构：拆分为多个功能模块
 * - types/series_types.tsx: 统一类型定义
 * - series_crud.tsx: 系列级别CRUD操作
 * - series_characters.tsx: 角色操作
 * - series_episodes.tsx: 剧集操作
 * - series_storyboards.tsx: 分镜操作
 * - series_chapters.tsx: 章节操作
 * 
 * 更新: 2025-01-25 - 添加 updateStoryboardsStatus 和 getSeriesChapters 导出
 */

// 重新导出类型定义
export type {
  Character,
  Storyboard,
  Episode,
  Series,
  CharacterInput,
  StoryboardInput,
  EpisodeInput,
  SeriesInput,
  GenerationProgress,
} from '../types/series_types.tsx';

// 重新导出Series操作（完整CRUD）
// ✅ v4.2.34: 完整的 CRUD 函数已添加
export {
  getUserSeries,
  getSeries,
  createSeries,
  updateSeries,
  updateSeriesProgress,
  deleteSeries,
  getSeriesWithDetails,
} from './series_crud.tsx';

// 重新导出Character操作
export {
  createCharacters,
  getSeriesCharacters,
  getCharacter,
  updateCharacter,
  deleteCharacter,
} from './series_characters.tsx';

// 重新导出Episode操作
export {
  createEpisodes,
  getSeriesEpisodes,
  getSeriesEpisodesPaginated, // 🔥 新增：分页查询
  getEpisode,
  updateEpisode,
  deleteEpisode,
} from './series_episodes.tsx';

// 重新导出Storyboard操作
export {
  createStoryboards,
  getEpisodeStoryboards,
  getSeriesStoryboards, // 🔥 v4.2.67: 新增获取series所有分镜
  getStoryboard,
  updateStoryboard,
  deleteStoryboard,
} from './series_storyboards.tsx';

// 🆕 重新导出Chapter操作
export type {
  Chapter,
  ChapterInput,
} from './series_chapters.tsx';

export {
  createChapters,
  getSeriesChapters,
  getChapter,
  updateChapter,
  deleteChapter,
  deleteSeriesChapters,
  updateChapterStatus,
  getChapterEpisodes,
} from './series_chapters.tsx';

console.log('[database/series.tsx] ✅ All series modules loaded (including chapters)');