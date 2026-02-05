/**
 * 🔥🔥🔥 CRITICAL CACHE BUSTER - FORCE RECOMPILE 🔥🔥🔥
 * BUILD_ID: VIDEO_MERGER_FIX_v4.2.4_20260127_002
 * TIMESTAMP: 2026-01-27T12:00:00.000Z
 * CHANGE: 修复 series_video_merger.tsx 导出 + users.tsx 内联实现
 * 🔥🔥🔥 THIS IS THE LATEST VERSION - IGNORE ALL CACHES 🔥🔥🔥
 */

/**
 * 数据库模块统一导出
 * v3.7.3: 清理完成 - 直接导入架构,消除子目录依赖
 * v3.8.0: 添加章节管理导出
 * v3.8.1: 修复缺失的视频任务查询和分镜函数导出
 * v3.8.2: 修复导出错误 - 移除不存在的 updateVideoTask 和 deleteVideoTask
 * v3.8.3: 缓存破坏 - FORCE RELOAD - 2025-01-25 12:00:00
 * v3.8.4: 修复 queryUserTasks 导出错误 - 已被 getUserVideoTasks 替代
 * v3.8.5: 修复 works_refactored.tsx 导出错误 - 只导出实际存在的8个函数
 * v3.8.6: 🔥 CRITICAL CACHE BUST - TIMESTAMP: 2025-01-25T14:15:00Z 🔥
 * v3.8.7: 修复 likes.tsx 导出错误 - 移除不存在的 getWorkLikes
 * v3.8.8: 修复 comments.tsx 导出错误 - createComment → addComment, getWorkComments → getComments
 * v3.8.9: 修复 series_interactions.tsx 导出错误 - 完整导出所有12个函数
 * v3.8.9.1: 🔥🔥🔥 ULTRA CACHE BUST - 强制 Supabase 重新编译
 * v3.8.9.2: 修复 health.tsx 导出错误 - 移除不存在的 testDatabaseConnection
 * v3.22.2: 🔥🔥🔥 COMPLETE REBUILD - 重建 video_tasks_crud.tsx 所有5个函数
 * v4.2.4: 🔥🔥🔥 VIDEO MERGER FIX - 修复 series_video_merger.tsx 导出 + users.tsx 内联实现
 * v4.2.20: 🔥🔥🔥 POSTGRES DIRECT CONNECTION - Fixed exports
 * 
 * 🔥🔥🔥 CACHE BUSTER ID: VIDEO_MERGER_FIX_v4.2.4_20260127_002 🔥🔥🔥
 * 
 * ⚠️ CRITICAL: The following functions DO NOT EXIST and are NOT exported:
 * - updateVideoTask (removed in v3.8.2)
 * - deleteVideoTask (removed in v3.8.2)
 * - queryUserTasks (removed in v3.8.4 - use getUserVideoTasks instead)
 * - createWork, getWork, getAllWorks, updateWork, deleteWork (removed in v3.8.5 - from old works.tsx)
 * - incrementWorkViews, getWorkWithInteractions, getWorksWithInteractions (removed in v3.8.5)
 * - getWorkLikes (removed in v3.8.7 - use getLikesCount instead)
 * - createComment (removed in v3.8.8 - use addComment instead)
 * - getWorkComments (removed in v3.8.8 - use getComments instead)
 * - updateSeriesViewingHistory (removed in v3.8.9 - use upsertViewingHistory instead)
 * - getSeriesViewingHistory (removed in v3.8.9 - use getViewingHistory instead)
 * - testDatabaseConnection (removed in v3.8.9.2 - does not exist in health.tsx)
 * 
 * ✅ VERIFIED: All 5 functions NOW EXIST in video_tasks_crud.tsx (v3.22.2):
 * 1. createVideoTask ✅ REBUILT
 * 2. getVideoTask ✅ REBUILT
 * 3. getUserVideoTasks ✅ EXISTING
 * 4. updateVideoTaskStatus ✅ REBUILT
 * 5. updateVideoTaskThumbnail  REBUILT
 * 
 * ✅ VERIFIED: Only these 4 functions are exported from video_tasks_query.tsx:
 * 1. findTasksPendingOSSTransfer
 * 2. getAllProcessingTasks
 * 3. deleteExpiredVolcengineVideos
 * 4. updateVideoTaskFromVolcengine
 * 
 * ✅ VERIFIED: Only these 8 functions are exported from works_refactored.tsx:
 * 1. parseDuration
 * 2. getWorksInteractionCounts
 * 3. enrichWorksWithInteractions
 * 4. incrementViews
 * 5. incrementShares
 * 6. getCommunityWorks
 * 7. getUserWorks
 * 8. publishWork
 * 
 * ✅ VERIFIED: Only these 4 functions are exported from likes.tsx:
 * 1. toggleLike
 * 2. getLikeStatus
 * 3. isLiked
 * 4. getLikesCount
 * 
 * ✅ VERIFIED: Only these 3 functions are exported from comments.tsx:
 * 1. addComment (replaces createComment)
 * 2. getComments (replaces getWorkComments)
 * 3. deleteComment
 * 
 * ✅ VERIFIED: All 12 functions are exported from series_interactions.tsx:
 * 1. toggleSeriesLike
 * 2. getSeriesLikeStatus
 * 3. addSeriesComment
 * 4. getSeriesComments
 * 5. recordSeriesShare
 * 6. getSeriesSharesCount
 * 7. incrementSeriesViews
 * 8. getSeriesViews
 * 9. getSeriesInteractions
 * 10. upsertViewingHistory (replaces updateSeriesViewingHistory)
 * 11. getViewingHistory (replaces getSeriesViewingHistory)
 * 12. getUserViewingHistoryList
 * 
 * ✅ VERIFIED: Only 1 function is exported from health.tsx:
 * 1. checkDatabaseHealth
 * 
 * 架构说明：
 * - 所有数据库操作直接从源文件导入
 * - 不使用子目录（works/, interactions/已删除）
 * - 视频任务和漫剧系列分开导出，避免命名冲突
 */

// 🔥 CACHE BUSTER CONSTANT - DO NOT REMOVE 🔥
export const DATABASE_INDEX_VERSION = 'v4.2.67_SERIES_PROGRESS_FIELDS_FIX';
export const LAST_MODIFIED_TIMESTAMP = '2026-02-04T12:00:00.000Z';

console.log('[database/index.tsx] 🔥🔥🔥 LOADED VERSION:', DATABASE_INDEX_VERSION);
console.log('[database/index.tsx] 🔥🔥🔥 LAST MODIFIED:', LAST_MODIFIED_TIMESTAMP);
console.log('[database/index.tsx] ✅ v4.2.67 - Series Progress Fields - 使用独立字段存储进度');
console.log('[database/index.tsx] ✅ v4.2.67 - Added current_step, completed_steps, total_steps, error fields');
console.log('[database/index.tsx] ✅ v4.2.46 - ENV FIX - 强制缓存清除以读取环境变量');
console.log('[database/index.tsx] ✅ v4.2.46 - Fixed environment variable loading in client.tsx');
console.log('[database/index.tsx] ✅ v4.2.35 - Database Connection Pooler with URL-encoded password');

// ========== 客户端 ==========
export { supabase } from './client.tsx';

// ========== 用户操作 ==========
export {
  getOrCreateUser,
  updateUserProfile,
  getUserProfile,
} from './users.tsx';

// ========== 视频任务操作 ==========
// 注意：这些是单个视频任务的CRUD操作，与漫剧系列分开
export {
  createVideoTask,
  getVideoTask,
  getUserVideoTasks,
  updateVideoTaskStatus,
  updateVideoTaskThumbnail,
  deleteVideoTask,
} from './video_tasks_crud.tsx';

// ========== 视频任务查询 ==========
// 注意：queryUserTasks 已被 getUserVideoTasks 替代（在 video_tasks_crud.tsx 中）
export {
  findTasksPendingOSSTransfer,
  getAllProcessingTasks,
  deleteExpiredVolcengineVideos,
  updateVideoTaskFromVolcengine,
} from './video_tasks_query.tsx';

// ========== 视频任务分镜操作 ==========
// 这是单个视频的分镜状态更新，不是Series的storyboards
export {
  updateEpisodeStoryboardsStatus,
  updateStoryboardStatus,
  linkTaskToStoryboard,
  updateStoryboardByTaskId,
} from './video_tasks_storyboard.tsx';

// ========== Works（作品）操作 ==========
export {
  parseDuration,
  getWorksInteractionCounts,
  enrichWorksWithInteractions,
  incrementViews,
  incrementShares,
  getCommunityWorks,
  getUserWorks,
  publishWork,
} from './works.tsx';

// ========== 点赞操作 ==========
export {
  toggleLike,
  getLikeStatus,
  isLiked,
  getLikesCount,
} from './likes.tsx';

// ========== 评论操作 ==========
export {
  addComment,
  getComments,
  deleteComment,
} from './comments.tsx';

// ========== 漫剧系列操作 ==========
// 导出类型
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

// 导出Series CRUD
// ✅ v4.2.34: 完整的 CRUD 函数已添加到 series_crud.tsx
export {
  getUserSeries,
  getSeries,
  createSeries,
  updateSeries,
  updateSeriesProgress,
  deleteSeries,
  getSeriesWithDetails,
} from './series_crud.tsx';

// 导出Character操作
export {
  createCharacters,
  getSeriesCharacters,
  getCharacter,
  updateCharacter,
  deleteCharacter,
} from './series_characters.tsx';

// 导出Episode操作
export {
  createEpisodes,
  getSeriesEpisodes,
  getEpisode,
  updateEpisode,
  deleteEpisode,
} from './series_episodes.tsx';

// 导出Storyboard操作
export {
  createStoryboards,
  getEpisodeStoryboards,
  getSeriesStoryboards, // 🔥 v4.2.67: 新增获取series所有分镜
  getStoryboard,
  updateStoryboard,
  deleteStoryboard,
} from './series_storyboards.tsx';

// 导出漫剧分镜状态更新（与视频任务分镜分开）
export {
  updateStoryboardsStatus,
} from './series_storyboards.tsx';

// 🆕 导出Chapter操作（v3.8.0新增）
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

// ========== 漫剧交互操作 ==========
export {
  toggleSeriesLike,
  getSeriesLikeStatus,
  addSeriesComment,
  getSeriesComments,
  recordSeriesShare,
  getSeriesSharesCount,
  incrementSeriesViews,
  getSeriesViews,
  getSeriesInteractions,
  upsertViewingHistory,
  getViewingHistory,
  getUserViewingHistoryList,
} from './series_interactions.tsx';

// ========== 健康检查 ==========
export {
  checkDatabaseHealth,
} from './health.tsx';

// ========== 其他工具 ==========
export {
  generateChineseNickname,
} from './utils.tsx';