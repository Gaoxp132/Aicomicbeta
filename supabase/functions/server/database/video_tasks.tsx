/**
 * 视频任务数据库操作 - 统一导出
 * 已重构：拆分为多个功能模块
 * - video_tasks_crud.tsx: 基础CRUD操作
 * - video_tasks_query.tsx: 查询和同步操作
 * - video_tasks_storyboard.tsx: 分镜关联操作
 */

// 重新导出所有功能，保持向后兼容
export {
  createVideoTask,
  updateVideoTaskStatus,
  getVideoTask,
  getUserVideoTasks,
  updateVideoTaskThumbnail,
} from './video_tasks_crud.tsx';

export {
  findTasksPendingOSSTransfer,
  getAllProcessingTasks,
  deleteExpiredVolcengineVideos,
  updateVideoTaskFromVolcengine,
} from './video_tasks_query.tsx';

export {
  updateStoryboardStatus,
  linkTaskToStoryboard,
  updateStoryboardByTaskId,
  updateEpisodeStoryboardsStatus,
} from './video_tasks_storyboard.tsx';
