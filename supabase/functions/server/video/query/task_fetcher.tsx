/**
 * 任务获取工具 - 从数据库或API获取任务信息
 * 从 video/task_query.tsx 提取
 */

import * as db from "../../database/index.tsx";

/**
 * 从数据库获取任务
 * 支持通过task_id或volcengine_task_id查询
 */
export async function fetchTaskFromDB(taskId: string): Promise<any | null> {
  try {
    // 如果是火山引擎任务ID格式 (cgt-开头)
    if (taskId.startsWith('cgt-')) {
      console.log(`⚠️ Detected Volcengine task ID format: ${taskId}`);
      console.log(`🔍 Searching database by volcengine_task_id...`);
      
      const { data: tasks, error } = await db.supabase
        .from('video_tasks')
        .select('*')
        .eq('volcengine_task_id', taskId)
        .limit(1);
      
      if (!error && tasks && tasks.length > 0) {
        console.log(`✅ Found task by volcengine_task_id: ${tasks[0].task_id}`);
        return tasks[0];
      } else {
        console.log(`⚠️ No task found with volcengine_task_id = ${taskId}`);
        return null;
      }
    } else {
      // 正常查询本地task_id
      try {
        const task = await db.getVideoTask(taskId);
        return task;
      } catch (error: any) {
        // 静默处理not found错误
        if (error.message?.includes('not found')) {
          console.log(`[TaskFetcher] Task ${taskId} not found in database`);
        } else {
          console.warn(`⚠️ Error getting task ${taskId} from database:`, error.message);
        }
        return null;
      }
    }
  } catch (error: any) {
    console.warn(`⚠️ Failed to fetch task from DB:`, error.message);
    return null;
  }
}

/**
 * 检查任务是否已完成且有OSS URL
 */
export function isTaskCompleted(task: any): boolean {
  return task.status === 'completed' && task.video_url?.includes('aliyuncs.com');
}

/**
 * 检查任务是否卡住（没有volcengine_task_id但状态为pending/processing）
 */
export function isTaskStuck(task: any): boolean {
  return !task.volcengine_task_id && 
         (task.status === 'pending' || task.status === 'processing');
}

/**
 * 格式化任务响应数据
 */
export function formatTaskResponse(task: any) {
  return {
    success: true,
    data: {
      data: {
        task_id: task.task_id,
        status: 'succeeded',
        content: {
          video_url: task.video_url,
          cover_url: task.thumbnail || '',
        },
        created_at: task.created_at,
        updated_at: task.updated_at,
      }
    }
  };
}

/**
 * 获取火山引擎任务ID（优先使用volcengine_task_id）
 */
export function getVolcengineTaskId(task: any, fallbackId: string): string {
  return task?.volcengine_task_id || fallbackId;
}
