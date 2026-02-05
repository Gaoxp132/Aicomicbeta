import type { Context } from 'npm:hono';
import { createClient } from "npm:@supabase/supabase-js@2";

// 🔥 CACHE BUSTER
export const COMMUNITY_WORKS_BATCH_VERSION = 'v4.2.4_STANDALONE_2026-01-27_004';

/**
 * 获取当前北京时间（内联实现，避免模块导入问题）
 * @returns 北京时间的ISO字符串
 */
function getBeijingTime(): string {
  const now = new Date();
  // 转换为北京时间（UTC+8）
  const beijingTime = new Date(now.getTime() + (8 * 60 * 60 * 1000));
  return beijingTime.toISOString();
}

/**
 * 创建 Supabase 客户端
 */
function createSupabaseClient() {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  
  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }
  
  return createClient(supabaseUrl, supabaseKey, {
    db: { schema: 'public' },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * 批量查询作品状态
 */
export async function batchCheckWorksStatus(c: Context) {
  try {
    const { workIds } = await c.req.json();

    if (!Array.isArray(workIds) || workIds.length === 0) {
      return c.json({ 
        success: false, 
        error: 'Invalid workIds array' 
      }, 400);
    }

    console.log('[Community Works] Batch checking status for:', workIds.length, 'works');

    const supabase = createSupabaseClient();
    const { data: tasks, error } = await supabase
      .from('video_tasks')
      .select('task_id, status, video_url, thumbnail, error') // 🔥 v4.2.67: 修复 - 使用 'error' 而不是 'error_message'
      .in('task_id', workIds);

    if (error) {
      console.error('[Community Works] Batch status check error:', error);
      return c.json({ 
        success: false, 
        error: error.message 
      }, 500);
    }

    // 构建状态映射
    const statusMap = new Map(
      (tasks || []).map(t => [t.task_id, {
        status: t.status,
        videoUrl: t.video_url,
        thumbnail: t.thumbnail,
        error: t.error // 🔥 v4.2.67: 修复 - 使用 'error' 而不是 'error_message'
      }])
    );

    const results: any = {};
    workIds.forEach(id => {
      results[id] = statusMap.get(id) || { status: 'not_found' };
    });

    return c.json({
      success: true,
      results
    });
  } catch (error: any) {
    console.error('[Community Works] Error in batchCheckWorksStatus:', error);
    return c.json({ 
      success: false, 
      error: error.message 
    }, 500);
  }
}

/**
 * 批量查询任务状态（含火山引擎同步）
 */
export async function batchCheckTasksStatus(c: Context) {
  try {
    const { taskIds } = await c.req.json();

    if (!Array.isArray(taskIds) || taskIds.length === 0) {
      return c.json({ 
        success: false, 
        error: 'Invalid taskIds array' 
      }, 400);
    }

    console.log('[Community Tasks] Batch checking status for:', taskIds.length, 'tasks');

    const supabase = createSupabaseClient();
    const { data: tasks, error } = await supabase
      .from('video_tasks')
      .select('task_id, status, video_url, thumbnail, error, created_at, updated_at, generation_metadata') // 🔥 v4.2.67: 修复 - 使用 'generation_metadata' 而不是 'metadata'
      .in('task_id', taskIds);

    if (error) {
      console.error('[Community Tasks] Batch status check error:', error);
      return c.json({ 
        success: false, 
        error: error.message 
      }, 500);
    }

    // 构建结果映射
    const statusMap = new Map(
      (tasks || []).map(t => [t.task_id, {
        taskId: t.task_id,
        status: t.status,
        videoUrl: t.video_url,
        thumbnail: t.thumbnail,
        error: t.error, // 🔥 v4.2.67: 修复 - 使用 'error' 而不是 'error_message'
        createdAt: t.created_at,
        updatedAt: t.updated_at,
        metadata: t.generation_metadata // 🔥 v4.2.67: 修复 - 使用 'generation_metadata'
      }])
    );

    const results: any = {};
    taskIds.forEach(id => {
      results[id] = statusMap.get(id) || { 
        taskId: id,
        status: 'not_found' 
      };
    });

    return c.json({
      success: true,
      count: taskIds.length,
      results
    });
  } catch (error: any) {
    console.error('[Community Tasks] Error in batchCheckTasksStatus:', error);
    return c.json({ 
      success: false, 
      error: error.message 
    }, 500);
  }
}

/**
 * 清理失败的任务
 */
export async function cleanupFailedTasks(c: Context) {
  try {
    const body = await c.req.json();
    const { olderThanHours = 24, dryRun = true } = body;

    console.log('[Community Tasks] Cleanup failed tasks:', {
      olderThanHours,
      dryRun
    });

    // 计算时间阈值
    const thresholdTime = new Date();
    thresholdTime.setHours(thresholdTime.getHours() - olderThanHours);

    const supabase = createSupabaseClient();
    
    // 查询失败的任务
    const { data: failedTasks, error: queryError } = await supabase
      .from('video_tasks')
      .select('task_id, status, error, created_at, updated_at') // 🔥 v4.2.67: 修复 - 使用 'error' 而不是 'error_message'
      .in('status', ['failed', 'error', 'timeout'])
      .lt('updated_at', thresholdTime.toISOString());

    if (queryError) {
      console.error('[Community Tasks] Query failed tasks error:', queryError);
      return c.json({ 
        success: false, 
        error: queryError.message 
      }, 500);
    }

    const taskCount = failedTasks?.length || 0;

    if (dryRun) {
      console.log('[Community Tasks] Dry run - would delete:', taskCount, 'tasks');
      return c.json({
        success: true,
        dryRun: true,
        taskCount,
        tasks: failedTasks?.map(t => ({
          taskId: t.task_id,
          status: t.status,
          error: t.error, // 🔥 v4.2.67: 修复 - 使用 'error' 而不是 'error_message'
          createdAt: t.created_at,
          updatedAt: t.updated_at
        }))
      });
    }

    // 实际删除
    if (taskCount > 0) {
      const taskIds = failedTasks!.map(t => t.task_id);
      
      const { error: deleteError } = await supabase
        .from('video_tasks')
        .delete()
        .in('task_id', taskIds);

      if (deleteError) {
        console.error('[Community Tasks] Delete failed tasks error:', deleteError);
        return c.json({ 
          success: false, 
          error: deleteError.message 
        }, 500);
      }

      console.log('[Community Tasks] Deleted:', taskCount, 'failed tasks');
    }

    return c.json({
      success: true,
      dryRun: false,
      deletedCount: taskCount,
      message: `Successfully deleted ${taskCount} failed tasks`
    });
  } catch (error: any) {
    console.error('[Community Tasks] Error in cleanupFailedTasks:', error);
    return c.json({ 
      success: false, 
      error: error.message 
    }, 500);
  }
}