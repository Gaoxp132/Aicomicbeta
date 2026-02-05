/**
 * 漫剧生成队列管理工具
 * 管理用户级别的生成任务队列
 */
import * as kv from "../kv_store.tsx";

console.log('[series_queue.tsx] ✅ Queue management utilities loaded');

// ==================== 数据结构 ====================

export interface GenerationTask {
  seriesId: string;
  userPhone: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  startedAt?: string;
  completedAt?: string;
  error?: string;
}

// ==================== 队列管理函数 ====================

// 获取用户的队列Key
function getUserQueueKey(userPhone: string): string {
  return `generation:queue:${userPhone}`;
}

// 获取用户的当前任务Key
function getUserCurrentTaskKey(userPhone: string): string {
  return `generation:current:${userPhone}`;
}

// 获取用户的队列
export async function getUserQueue(userPhone: string): Promise<GenerationTask[]> {
  const data = await kv.get(getUserQueueKey(userPhone));
  return data ? JSON.parse(data) : [];
}

// 保存用户的队列
export async function saveUserQueue(userPhone: string, queue: GenerationTask[]): Promise<void> {
  await kv.set(getUserQueueKey(userPhone), JSON.stringify(queue));
}

// 获取用户当前正在处理的任务
export async function getUserCurrentTask(userPhone: string): Promise<GenerationTask | null> {
  const data = await kv.get(getUserCurrentTaskKey(userPhone));
  return data ? JSON.parse(data) : null;
}

// 设置用户的当前任务
export async function setUserCurrentTask(userPhone: string, task: GenerationTask | null): Promise<void> {
  if (task) {
    await kv.set(getUserCurrentTaskKey(userPhone), JSON.stringify(task));
  } else {
    await kv.del(getUserCurrentTaskKey(userPhone));
  }
}

// 添加任务到用户队列
export async function addToUserQueue(seriesId: string, userPhone: string): Promise<number> {
  const queue = await getUserQueue(userPhone);
  
  // 检查是否已在队列中
  const existingIndex = queue.findIndex(t => t.seriesId === seriesId);
  if (existingIndex >= 0) {
    console.log(`[UserQueue] Series ${seriesId} already in user ${userPhone}'s queue at position ${existingIndex}`);
    return existingIndex;
  }
  
  // 添加到队列末尾
  const task: GenerationTask = {
    seriesId,
    userPhone,
    status: 'queued',
  };
  queue.push(task);
  await saveUserQueue(userPhone, queue);
  
  console.log(`[UserQueue] Added series ${seriesId} to user ${userPhone}'s queue, position: ${queue.length - 1}`);
  return queue.length - 1;
}

// 从用户队列中移除任务
export async function removeFromUserQueue(seriesId: string, userPhone: string): Promise<void> {
  const queue = await getUserQueue(userPhone);
  const newQueue = queue.filter(t => t.seriesId !== seriesId);
  await saveUserQueue(userPhone, newQueue);
  console.log(`[UserQueue] Removed series ${seriesId} from user ${userPhone}'s queue`);
}

// 获取任务在用户队列中的位置
export async function getUserQueuePosition(seriesId: string, userPhone: string): Promise<number> {
  const queue = await getUserQueue(userPhone);
  const index = queue.findIndex(t => t.seriesId === seriesId);
  return index;
}
