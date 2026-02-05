/**
 * 视频任务检查工具Handler
 * 检查和分析video_tasks表的数据
 */

import type { Context } from "npm:hono";
import * as db from "../../database/index.tsx";

/**
 * 检查单个视频任务
 */
export async function inspectVideoTasks(c: Context) {
  try {
    const { taskId } = c.req.query();

    if (!taskId) {
      return c.json({
        success: false,
        error: 'Task ID is required',
      }, 400);
    }

    console.log('[Video Tasks Inspector] 🔍 Inspecting task:', taskId);

    // 获取任务详情
    const { data: task, error: taskError } = await db.supabase
      .from('video_tasks')
      .select('*')
      .eq('task_id', taskId)
      .single();

    if (taskError || !task) {
      console.error('[Video Tasks Inspector] Task not found:', taskError);
      return c.json({
        success: false,
        error: 'Task not found',
      }, 404);
    }

    const inspection: any = {
      task,
      related_data: {},
      analysis: {},
      issues: [],
    };

    // 检查关联的分镜
    if (task.storyboard_id) {
      const { data: storyboard, error: sbError } = await db.supabase
        .from('series_storyboards')
        .select('*')
        .eq('id', task.storyboard_id)
        .single();

      if (sbError) {
        inspection.issues.push({
          type: 'storyboard_not_found',
          message: `关联的分镜 ${task.storyboard_id} 未找到`,
        });
      } else {
        inspection.related_data.storyboard = storyboard;

        // 分析同步状态
        if (storyboard.video_task_id !== task.task_id) {
          inspection.issues.push({
            type: 'task_id_mismatch',
            message: '分镜的video_task_id与实际任务ID不匹配',
            details: {
              storyboard_task_id: storyboard.video_task_id,
              actual_task_id: task.task_id,
            },
          });
        }

        if (storyboard.video_url !== task.video_url) {
          inspection.issues.push({
            type: 'video_url_mismatch',
            message: '分镜和任务的视频URL不一致',
          });
        }

        if (storyboard.status !== task.status) {
          inspection.issues.push({
            type: 'status_mismatch',
            message: '分镜和任务的状态不一致',
            details: {
              storyboard_status: storyboard.status,
              task_status: task.status,
            },
          });
        }
      }
    }

    // 检查关联的剧集
    if (task.episode_id) {
      const { data: episode, error: epError } = await db.supabase
        .from('series_episodes')
        .select('*')
        .eq('id', task.episode_id)
        .single();

      if (!epError && episode) {
        inspection.related_data.episode = episode;
      }
    }

    // 检查关联的漫剧
    if (task.series_id) {
      const { data: series, error: seriesError } = await db.supabase
        .from('series')
        .select('*')
        .eq('id', task.series_id)
        .single();

      if (!seriesError && series) {
        inspection.related_data.series = series;
      }
    }

    // 时间分析
    const createdAt = new Date(task.created_at);
    const updatedAt = new Date(task.updated_at);
    const now = new Date();

    inspection.analysis.timing = {
      created_at: task.created_at,
      updated_at: task.updated_at,
      age_hours: ((now.getTime() - createdAt.getTime()) / (1000 * 60 * 60)).toFixed(2),
      last_update_hours: ((now.getTime() - updatedAt.getTime()) / (1000 * 60 * 60)).toFixed(2),
    };

    // 状态分析
    if (task.status === 'processing') {
      const ageHours = (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60);
      if (ageHours > 1) {
        inspection.issues.push({
          type: 'long_processing_time',
          message: `任务处理时间过长 (${ageHours.toFixed(1)}小时)`,
          severity: 'warning',
        });
      }
    }

    if (task.status === 'completed' && !task.video_url) {
      inspection.issues.push({
        type: 'missing_video_url',
        message: '任务已完成但缺少视频URL',
        severity: 'error',
      });
    }

    inspection.analysis.summary = {
      total_issues: inspection.issues.length,
      has_related_data: Object.keys(inspection.related_data).length > 0,
      sync_status: inspection.issues.length === 0 ? 'synced' : 'issues_found',
    };

    console.log('[Video Tasks Inspector] ✅ Inspection completed');
    console.log('[Video Tasks Inspector] Found', inspection.issues.length, 'issues');

    return c.json({
      success: true,
      data: inspection,
    });

  } catch (error: any) {
    console.error('[Video Tasks Inspector] Error:', error);
    return c.json({
      success: false,
      error: error.message || 'Inspection failed',
    }, 500);
  }
}

/**
 * 检查漫剧的所有视频任务
 */
export async function inspectSeriesVideoTasks(c: Context) {
  try {
    const seriesId = c.req.param('seriesId');

    if (!seriesId) {
      return c.json({
        success: false,
        error: 'Series ID is required',
      }, 400);
    }

    console.log('[Video Tasks Inspector] 🔍 Inspecting series tasks:', seriesId);

    // 获取漫剧信息
    const { data: series, error: seriesError } = await db.supabase
      .from('series')
      .select('*')
      .eq('id', seriesId)
      .single();

    if (seriesError || !series) {
      return c.json({
        success: false,
        error: 'Series not found',
      }, 404);
    }

    // 获取所有任务
    const { data: tasks, error: tasksError } = await db.supabase
      .from('video_tasks')
      .select('*')
      .eq('series_id', seriesId)
      .order('created_at', { ascending: false });

    if (tasksError) {
      console.error('[Video Tasks Inspector] Error fetching tasks:', tasksError);
      return c.json({
        success: false,
        error: 'Failed to fetch tasks',
      }, 500);
    }

    const inspection: any = {
      series,
      tasks: tasks || [],
      stats: {
        total: tasks?.length || 0,
        by_status: {
          pending: tasks?.filter(t => t.status === 'pending').length || 0,
          processing: tasks?.filter(t => t.status === 'processing').length || 0,
          completed: tasks?.filter(t => t.status === 'completed').length || 0,
          failed: tasks?.filter(t => t.status === 'failed').length || 0,
        },
      },
      issues: [],
    };

    // 检查每个任务
    for (const task of tasks || []) {
      // 检查处理时间过长的任务
      if (task.status === 'processing') {
        const createdAt = new Date(task.created_at);
        const ageHours = (new Date().getTime() - createdAt.getTime()) / (1000 * 60 * 60);
        
        if (ageHours > 1) {
          inspection.issues.push({
            task_id: task.task_id,
            type: 'long_processing_time',
            message: `任务 ${task.task_id} 处理时间过长 (${ageHours.toFixed(1)}小时)`,
          });
        }
      }

      // 检查已完成但无视频的任务
      if (task.status === 'completed' && !task.video_url) {
        inspection.issues.push({
          task_id: task.task_id,
          type: 'missing_video_url',
          message: `任务 ${task.task_id} 已完成但缺少视频URL`,
        });
      }
    }

    inspection.stats.issues_count = inspection.issues.length;

    console.log('[Video Tasks Inspector] ✅ Series inspection completed');
    console.log('[Video Tasks Inspector] Total tasks:', inspection.stats.total);
    console.log('[Video Tasks Inspector] Issues found:', inspection.issues.length);

    return c.json({
      success: true,
      data: inspection,
    });

  } catch (error: any) {
    console.error('[Video Tasks Inspector] Error:', error);
    return c.json({
      success: false,
      error: error.message || 'Inspection failed',
    }, 500);
  }
}