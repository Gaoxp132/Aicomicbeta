import type { Comic } from '../App';

/**
 * 将数据库作品格式转换为Comic格式
 */
export function convertWorkToComic(work: any): Comic {
  return {
    id: work.id,
    title: work.title || work.prompt?.slice(0, 30) + '...',
    prompt: work.prompt || '',
    style: work.style || 'anime',
    duration: work.duration || '5s',
    thumbnail: work.thumbnail || '',
    videoUrl: work.video_url || work.videoUrl || '',
    createdAt: new Date(work.published_at || work.publishedAt || work.created_at),
    status: 'completed',
    taskId: work.task_id || work.taskId,
  };
}

/**
 * 标准化作品数据格式（下划线转驼峰）
 */
export function normalizeWork(work: any) {
  const normalized = {
    ...work,
    taskId: work.task_id || work.taskId,
    videoUrl: work.video_url || work.videoUrl,
    publishedAt: work.published_at || work.publishedAt,
    status: work.status || 'pending', // 确保保留status字段
  };
  
  // 调试日志 - 只对completed状态的任务警告videoUrl缺失
  if (normalized.status === 'completed' && (!normalized.videoUrl || normalized.videoUrl.trim() === '')) {
    console.warn('[normalizeWork] ⚠️ Completed work has no valid videoUrl:', {
      id: work.id,
      video_url: work.video_url,
      videoUrl: work.videoUrl,
      task_id: work.task_id,
      status: work.status,
    });
  }
  
  return normalized;
}

/**
 * 批量标准化作品数据
 */
export function normalizeWorks(works: any[]) {
  return works.map(normalizeWork);
}