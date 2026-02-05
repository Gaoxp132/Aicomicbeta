/**
 * 视频同步诊断工具Handler
 * 诊断视频数据同步问题
 */

import type { Context } from "npm:hono";
import * as db from "../../database/index.tsx";

/**
 * 诊断同步问题
 */
export async function diagnoseSyncIssue(c: Context) {
  try {
    const { taskId, seriesId, episodeId } = c.req.query();

    console.log('[Sync Diagnosis] 🔍 Diagnosing sync issue...');
    console.log('[Sync Diagnosis] Params:', { taskId, seriesId, episodeId });

    const diagnosis: any = {
      timestamp: new Date().toISOString(),
      params: { taskId, seriesId, episodeId },
      issues: [],
      recommendations: [],
    };

    // 如果提供了任务ID，检查任务
    if (taskId) {
      const { data: task, error: taskError } = await db.supabase
        .from('video_tasks')
        .select('*')
        .eq('task_id', taskId)
        .single();

      if (taskError || !task) {
        diagnosis.issues.push({
          type: 'task_not_found',
          severity: 'error',
          message: `视频任务 ${taskId} 未找到`,
          details: taskError?.message,
        });
      } else {
        diagnosis.task = task;

        // 检查任务状态
        if (task.status === 'processing') {
          const createdAt = new Date(task.created_at);
          const now = new Date();
          const hoursSinceCreation = (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60);

          if (hoursSinceCreation > 1) {
            diagnosis.issues.push({
              type: 'stuck_task',
              severity: 'warning',
              message: `任务处理时间过长 (${hoursSinceCreation.toFixed(1)}小时)`,
              recommendation: '建议检查火山引擎API状态或重试任务',
            });
          }
        }

        // 检查视频URL
        if (task.status === 'completed' && !task.video_url) {
          diagnosis.issues.push({
            type: 'missing_video_url',
            severity: 'error',
            message: '任务已完成但缺少视频URL',
            recommendation: '需要重新生成视频',
          });
        }

        // 检查关联的分镜
        if (task.storyboard_id) {
          const { data: storyboard, error: sbError } = await db.supabase
            .from('series_storyboards')
            .select('*')
            .eq('id', task.storyboard_id)
            .single();

          if (sbError || !storyboard) {
            diagnosis.issues.push({
              type: 'orphan_task',
              severity: 'warning',
              message: `任务关联的分镜 ${task.storyboard_id} 不存在`,
              recommendation: '分镜可能已被删除',
            });
          } else {
            diagnosis.storyboard = storyboard;

            // 检查分镜和任务的同步状态
            if (storyboard.video_task_id !== task.task_id) {
              diagnosis.issues.push({
                type: 'sync_mismatch',
                severity: 'warning',
                message: '分镜的video_task_id与任务ID不匹配',
                details: {
                  storyboard_task_id: storyboard.video_task_id,
                  actual_task_id: task.task_id,
                },
                recommendation: '需要更新分镜的video_task_id',
              });
            }

            if (storyboard.video_url !== task.video_url) {
              diagnosis.issues.push({
                type: 'url_mismatch',
                severity: 'warning',
                message: '分镜和任务的视频URL不一致',
                recommendation: '需要同步视频URL',
              });
            }
          }
        }
      }
    }

    // 如果提供了剧集ID，检查剧集
    if (episodeId) {
      const { data: episode, error: epError } = await db.supabase
        .from('series_episodes')
        .select('*')
        .eq('id', episodeId)
        .single();

      if (epError || !episode) {
        diagnosis.issues.push({
          type: 'episode_not_found',
          severity: 'error',
          message: `剧集 ${episodeId} 未找到`,
        });
      } else {
        diagnosis.episode = episode;

        // 检查剧集的分镜
        const { data: storyboards, error: sbsError } = await db.supabase
          .from('series_storyboards')
          .select('*')
          .eq('episode_id', episodeId);

        if (!sbsError && storyboards) {
          diagnosis.storyboards_count = storyboards.length;

          const completedCount = storyboards.filter(sb => sb.status === 'completed').length;
          const processingCount = storyboards.filter(sb => sb.status === 'processing').length;
          const failedCount = storyboards.filter(sb => sb.status === 'failed').length;

          diagnosis.storyboards_stats = {
            total: storyboards.length,
            completed: completedCount,
            processing: processingCount,
            failed: failedCount,
          };

          // 检查是否有卡住的分镜
          if (processingCount > 0) {
            diagnosis.issues.push({
              type: 'processing_storyboards',
              severity: 'info',
              message: `有${processingCount}个分镜正在处理中`,
            });
          }

          if (failedCount > 0) {
            diagnosis.issues.push({
              type: 'failed_storyboards',
              severity: 'warning',
              message: `有${failedCount}个分镜生成失败`,
              recommendation: '建议检查失败原因并重试',
            });
          }
        }
      }
    }

    // 如果提供了漫剧ID，检查漫剧
    if (seriesId) {
      const { data: series, error: seriesError } = await db.supabase
        .from('series')
        .select('*')
        .eq('id', seriesId)
        .single();

      if (seriesError || !series) {
        diagnosis.issues.push({
          type: 'series_not_found',
          severity: 'error',
          message: `漫剧 ${seriesId} 未找到`,
        });
      } else {
        diagnosis.series = series;

        // 检查漫剧的剧集
        const { data: episodes, error: epsError } = await db.supabase
          .from('series_episodes')
          .select('*')
          .eq('series_id', seriesId);

        if (!epsError && episodes) {
          diagnosis.episodes_count = episodes.length;
          diagnosis.episodes_stats = {
            total: episodes.length,
            completed: episodes.filter(ep => ep.status === 'completed').length,
            processing: episodes.filter(ep => ep.status === 'processing').length,
            failed: episodes.filter(ep => ep.status === 'failed').length,
          };
        }
      }
    }

    // 生成总结
    diagnosis.summary = {
      total_issues: diagnosis.issues.length,
      error_count: diagnosis.issues.filter((i: any) => i.severity === 'error').length,
      warning_count: diagnosis.issues.filter((i: any) => i.severity === 'warning').length,
      info_count: diagnosis.issues.filter((i: any) => i.severity === 'info').length,
    };

    console.log('[Sync Diagnosis] ✅ Diagnosis completed');
    console.log('[Sync Diagnosis] Found', diagnosis.issues.length, 'issues');

    return c.json({
      success: true,
      data: diagnosis,
    });

  } catch (error: any) {
    console.error('[Sync Diagnosis] Error:', error);
    return c.json({
      success: false,
      error: error.message || 'Diagnosis failed',
    }, 500);
  }
}