/**
 * 视频任务与分镜关联操作
 * 从 video_tasks.tsx 拆分出来的分镜相关功能
 */

import { supabase } from './client.tsx';

// ==================== 分镜关联操作 ====================

/**
 * 更新分镜状态（通过分镜ID）
 */
export async function updateStoryboardStatus(
  storyboardId: string,
  status: string,
  videoUrl?: string,
  errorMessage?: string
) {
  try {
    const updateData: any = {
      status,
      updated_at: new Date().toISOString(),
    };

    if (videoUrl) updateData.video_url = videoUrl;
    if (errorMessage) updateData.error = errorMessage; // 🔥 v4.2.67: 修复 - 使用正确的列名 'error' 而不是 'error_message'

    const { data, error } = await supabase
      .from('series_storyboards')
      .update(updateData)
      .eq('id', storyboardId)
      .select();

    if (error) {
      if (error.code === 'PGRST116') {
        console.warn(`[video_tasks_storyboard] Storyboard ${storyboardId} not found`);
        return null;
      }
      throw error;
    }

    if (!data || data.length === 0) {
      console.warn(`[video_tasks_storyboard] No storyboard updated for ID: ${storyboardId}`);
      return null;
    }

    console.log(`[video_tasks_storyboard] ✅ Updated storyboard ${storyboardId} to status: ${status}`);
    return data[0];
  } catch (error) {
    console.error('[video_tasks_storyboard] Error updating storyboard status:', error);
    throw error;
  }
}

/**
 * 关联任务到分镜
 */
export async function linkTaskToStoryboard(
  taskId: string,
  storyboardId: string
) {
  try {
    // 1. 更新 video_tasks 表，设置 storyboard_id
    const { error: taskError } = await supabase
      .from('video_tasks')
      .update({ storyboard_id: storyboardId })
      .eq('task_id', taskId);

    if (taskError) throw taskError;

    // 2. 更新 storyboards 表，设置 task_id
    const { error: storyboardError } = await supabase
      .from('series_storyboards')
      .update({ 
        task_id: taskId,
        status: 'generating',
        updated_at: new Date().toISOString(),
      })
      .eq('id', storyboardId);

    if (storyboardError) throw storyboardError;

    console.log(`[video_tasks_storyboard] ✅ Linked task ${taskId} to storyboard ${storyboardId}`);
  } catch (error) {
    console.error('[video_tasks_storyboard] Error linking task to storyboard:', error);
    throw error;
  }
}

/**
 * 通过任务ID更新分镜状态
 */
export async function updateStoryboardByTaskId(
  taskId: string,
  status: 'draft' | 'generating' | 'completed' | 'failed',
  videoUrl?: string,
  errorMessage?: string
) {
  try {
    // 1. 从 video_tasks 获取 storyboard_id
    const { data: task, error: taskError } = await supabase
      .from('video_tasks')
      .select('storyboard_id')
      .eq('task_id', taskId)
      .single();

    if (taskError) {
      if (taskError.code === 'PGRST116') {
        console.warn(`[video_tasks_storyboard] Task ${taskId} not found`);
        return null;
      }
      throw taskError;
    }

    if (!task.storyboard_id) {
      console.warn(`[video_tasks_storyboard] Task ${taskId} has no associated storyboard`);
      return null;
    }

    // 2. 更新分镜状态
    return await updateStoryboardStatus(
      task.storyboard_id,
      status,
      videoUrl,
      errorMessage
    );
  } catch (error) {
    console.error('[video_tasks_storyboard] Error updating storyboard by task ID:', error);
    throw error;
  }
}

/**
 * 批量更新剧集中所有分镜的状态
 */
export async function updateEpisodeStoryboardsStatus(
  episodeId: string,
  status: 'draft' | 'generating' | 'completed' | 'failed'
) {
  try {
    // 先获取episode的series_id和episode_number
    const { data: episode, error: epError } = await supabase
      .from('series_episodes')
      .select('series_id, episode_number')
      .eq('id', episodeId)
      .single();

    if (epError) throw epError;
    if (!episode) {
      console.log(`[video_tasks_storyboard] Episode ${episodeId} not found`);
      return [];
    }

    const { data, error } = await supabase
      .from('series_storyboards')
      .update({ 
        status,
        updated_at: new Date().toISOString(),
      })
      .eq('series_id', episode.series_id)
      .eq('episode_number', episode.episode_number)
      .select();

    if (error) throw error;

    console.log(`[video_tasks_storyboard] ✅ Updated ${data?.length || 0} storyboards for episode ${episodeId}`);
    return data;
  } catch (error) {
    console.error('[video_tasks_storyboard] Error updating episode storyboards:', error);
    throw error;
  }
}