/**
 * 视频任务查询和同步操作
 * 从 video_tasks.tsx 拆分出来的查询、同步、更新功能
 * ⚠️ 此文件完全独立，不依赖 video/ 目录下的模块
 */

import { supabase } from './client.tsx';

// ==================== 内联的API客户端函数 ====================

/**
 * 查询火山引擎任务状态
 * 从 video/query/api_client.tsx 复制过来
 */
async function queryVolcengineTask(taskId: string): Promise<Response> {
  const apiKey = Deno.env.get('VOLCENGINE_API_KEY');
  if (!apiKey) {
    throw new Error('VOLCENGINE_API_KEY not configured');
  }

  const url = `https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks/${taskId}`;
  
  return await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
  });
}

/**
 * 解析API响应
 * 从 video/query/response_processor.tsx 复制过来
 */
function parseApiResponse(apiData: any): {
  success: boolean;
  status: string;
  video_url?: string;
  thumbnail?: string;
  error?: string;
} {
  try {
    // 检查API错误
    if (apiData.error) {
      return {
        success: false,
        status: 'failed',
        error: apiData.error.message || 'API error',
      };
    }

    // 获取任务状态
    const taskStatus = apiData.task?.task_status;
    
    if (!taskStatus) {
      return {
        success: false,
        status: 'failed',
        error: 'No task status in response',
      };
    }

    // 映射状态
    let status = 'processing';
    switch (taskStatus) {
      case 'Success':
        status = 'completed';
        break;
      case 'Failed':
        status = 'failed';
        break;
      case 'Processing':
      case 'Pending':
        status = 'processing';
        break;
      default:
        status = 'processing';
    }

    // 提取视频信息
    const result: any = {
      success: true,
      status,
    };

    if (status === 'completed') {
      const videoUrl = apiData.task?.video_result?.video_url;
      const coverUrl = apiData.task?.video_result?.cover_url;
      
      if (videoUrl) {
        result.video_url = videoUrl;
      }
      if (coverUrl) {
        result.thumbnail = coverUrl;
      }
    }

    if (status === 'failed') {
      result.error = apiData.task?.error_message || 'Generation failed';
    }

    return result;
  } catch (error: any) {
    console.error('[parseApiResponse] Error:', error);
    return {
      success: false,
      status: 'failed',
      error: error.message,
    };
  }
}

/**
 * 更新视频任务状态
 * 从 video_tasks_crud.tsx 复制的简化版本
 */
async function updateVideoTaskStatus(
  taskId: string,
  status: string,
  videoUrl?: string,
  thumbnail?: string
): Promise<void> {
  try {
    const updateData: any = {
      status,
      updated_at: new Date().toISOString(),
    };

    if (videoUrl) {
      updateData.video_url = videoUrl;
    }
    if (thumbnail) {
      updateData.thumbnail = thumbnail;
    }

    const { error } = await supabase
      .from('video_tasks')
      .update(updateData)
      .eq('task_id', taskId);

    if (error) throw error;

    console.log(`[updateVideoTaskStatus] ✅ Updated task ${taskId} to status: ${status}`);
  } catch (error) {
    console.error('[updateVideoTaskStatus] Error:', error);
    throw error;
  }
}

// ==================== 独立查询函数 ====================

/**
 * 查询任务状态（独立函数，不依赖Context）
 */
async function queryTaskStatus(
  taskId: string,
  userPhone?: string
): Promise<{
  success: boolean;
  status: string;
  video_url?: string;
  thumbnail?: string;
  error?: string;
}> {
  try {
    console.log(`[queryTaskStatus] Querying task ${taskId} for user ${userPhone || 'unknown'}`);

    // 1. 从数据库获取任务信息
    let dbTask: any = null;
    try {
      if (taskId.startsWith('cgt-')) {
        // 火山引擎任务ID
        const { data: tasks, error } = await supabase
          .from('video_tasks')
          .select('*')
          .eq('volcengine_task_id', taskId)
          .limit(1);
        
        if (!error && tasks && tasks.length > 0) {
          dbTask = tasks[0];
        }
      } else {
        // 本地任务ID
        const { data, error } = await supabase
          .from('video_tasks')
          .select('*')
          .eq('task_id', taskId)
          .single();
        
        if (!error && data) {
          dbTask = data;
        }
      }
    } catch (dbError: any) {
      console.warn(`[queryTaskStatus] DB query failed: ${dbError.message}`);
    }

    // 2. 如果数据库中已经是完成状态，直接返回
    if (dbTask && (dbTask.status === 'completed' || dbTask.status === 'failed')) {
      return {
        success: true,
        status: dbTask.status,
        video_url: dbTask.video_url || dbTask.oss_video_url,
        thumbnail: dbTask.thumbnail,
      };
    }

    // 3. 从火山引擎查询最新状态
    const volcengineTaskId = dbTask?.volcengine_task_id || taskId;
    
    try {
      const response = await queryVolcengineTask(volcengineTaskId);
      
      if (!response.ok) {
        throw new Error(`API returned ${response.status}`);
      }

      const apiData = await response.json();
      const parsed = parseApiResponse(apiData);

      // 4. 如果有数据库任务，更新状态
      if (dbTask) {
        try {
          await updateVideoTaskStatus(
            dbTask.task_id,
            parsed.status,
            parsed.video_url,
            parsed.thumbnail
          );
        } catch (updateError: any) {
          console.warn(`[queryTaskStatus] Failed to update DB: ${updateError.message}`);
        }
      }

      return {
        success: true,
        status: parsed.status,
        video_url: parsed.video_url,
        thumbnail: parsed.thumbnail,
      };
      
    } catch (apiError: any) {
      console.error(`[queryTaskStatus] Volcengine API error:`, apiError);
      
      // 如果API失败但数据库有任务，返回数据库状态
      if (dbTask) {
        return {
          success: true,
          status: dbTask.status,
          video_url: dbTask.video_url || dbTask.oss_video_url,
          thumbnail: dbTask.thumbnail,
        };
      }
      
      return {
        success: false,
        status: 'failed',
        error: apiError.message,
      };
    }
  } catch (error: any) {
    console.error(`[queryTaskStatus] Error:`, error);
    return {
      success: false,
      status: 'failed',
      error: error.message,
    };
  }
}

// ==================== 导出的查询操作 ====================

/**
 * 查找等待OSS传输的任务
 */
export async function findTasksPendingOSSTransfer() {
  try {
    const { data, error } = await supabase
      .from('video_tasks')
      .select('*')
      .eq('status', 'completed')
      .is('oss_video_url', null)
      .not('video_url', 'is', null)
      .limit(10);

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('[video_tasks_query] Error finding tasks pending OSS transfer:', error);
    return [];
  }
}

/**
 * 获取所有处理中的任务
 */
export async function getAllProcessingTasks() {
  try {
    const { data, error } = await supabase
      .from('video_tasks')
      .select('*')
      .eq('status', 'processing')
      .order('created_at', { ascending: true });

    if (error) throw error;
    return data || []
  } catch (error) {
    console.error('[video_tasks_query] Error getting processing tasks:', error);
    return [];
  }
}

/**
 * 删除所有使用火山引擎过期URL的视频任务和作品
 */
export async function deleteExpiredVolcengineVideos() {
  try {
    console.log('[video_tasks_query] 🔍 Checking for expired Volcengine videos...');
    
    // 1. 找出所有火山引擎URL（包含 X-Tos-Date 参数的URL）
    const { data: expiredTasks, error: selectError } = await supabase
      .from('video_tasks')
      .select('task_id, video_url')
      .not('video_url', 'is', null)
      .like('video_url', '%X-Tos-Date=%');

    if (selectError) throw selectError;

    if (!expiredTasks || expiredTasks.length === 0) {
      console.log('[video_tasks_query] ✅ No expired Volcengine videos found');
      return { deleted: 0 };
    }

    console.log(`[video_tasks_query] ⚠️ Found ${expiredTasks.length} expired Volcengine videos`);
    
    const taskIds = expiredTasks.map(t => t.task_id);
    
    // 2. 删除 works 表中的相关记录
    const { error: worksDeleteError } = await supabase
      .from('works')
      .delete()
      .in('task_id', taskIds);

    if (worksDeleteError) {
      console.error('[video_tasks_query] ❌ Error deleting from works:', worksDeleteError);
    } else {
      console.log(`[video_tasks_query] ✅ Deleted expired works`);
    }
    
    // 3. 删除 video_tasks 表中的记录
    const { error: tasksDeleteError } = await supabase
      .from('video_tasks')
      .delete()
      .in('task_id', taskIds);

    if (tasksDeleteError) throw tasksDeleteError;
    
    console.log(`[video_tasks_query] ✅ Deleted ${expiredTasks.length} expired Volcengine videos`);
    
    return { deleted: expiredTasks.length };
  } catch (error) {
    console.error('[video_tasks_query] ❌ Error deleting expired videos:', error);
    throw error;
  }
}

// ==================== 同步操作 ====================

/**
 * 从火山引擎同步更新视频任务状态
 */
export async function updateVideoTaskFromVolcengine(taskId: string) {
  try {
    console.log(`[video_tasks_query] 🔄 Syncing task ${taskId} from Volcengine...`);
    
    // 1. 从数据库获取任务
    const { data: task, error: dbError } = await supabase
      .from('video_tasks')
      .select('*')
      .eq('task_id', taskId)
      .single();

    if (dbError) {
      if (dbError.code === 'PGRST116') {
        console.log(`[video_tasks_query] Task ${taskId} not found in database`);
        return null;
      }
      throw dbError;
    }

    // 2. 如果任务已完成，无需同步
    if (task.status === 'completed' || task.status === 'failed') {
      console.log(`[video_tasks_query] Task ${taskId} already ${task.status}, skipping sync`);
      return task;
    }

    // 3. 从火山引擎查询最新状态
    const volcengineResult = await queryTaskStatus(
      task.volcengine_task_id || taskId,
      task.user_phone
    );

    if (!volcengineResult.success) {
      console.error(`[video_tasks_query] Failed to query Volcengine for task ${taskId}:`, volcengineResult.error);
      return task;
    }

    // 4. 更新数据库中的状态
    const updateData: any = {
      status: volcengineResult.status,
      updated_at: new Date().toISOString(),
    };

    if (volcengineResult.video_url) {
      updateData.video_url = volcengineResult.video_url;
    }

    if (volcengineResult.error) {
      updateData.error = volcengineResult.error; // 🔥 v4.2.67: 修复 - 使用正确的列名 'error' 而不是 'error_message'
    }

    const { data: updatedTask, error: updateError } = await supabase
      .from('video_tasks')
      .update(updateData)
      .eq('task_id', taskId)
      .select()
      .single();

    if (updateError) throw updateError;

    console.log(`[video_tasks_query] ✅ Synced task ${taskId}, status: ${volcengineResult.status}`);
    return updatedTask;
  } catch (error) {
    console.error(`[video_tasks_query] Error syncing task ${taskId}:`, error);
    throw error;
  }
}