/**
 * Volcengine Service - Task creation, status polling, sync/transfer/recover
 * Split from consolidated services/index.ts (v6.0.68)
 * v6.0.75: 增强轮询韧性——自适应间隔/优雅超时/H265支持参数
 * v6.0.77: H265自动默认+降级（getVideoCodecPreference始终返回h265）
 */

import { apiPost, apiGet } from '../utils';

export interface TaskStatus { taskId: string; status: string; videoUrl?: string; progress?: number; }

export class CancelledTaskError extends Error {
  constructor(taskId: string) { super(`任务已取消 (ID: ${taskId})`); this.name = 'CancelledTaskError'; }
}

export async function createVideoTask(params: {
  prompt: string; style: string; duration: string; imageUrls?: string[]; resolution?: string; fps?: number;
  enableAudio?: boolean; model?: string; userPhone?: string; title?: string; seriesId?: string; episodeId?: string;
  storyboardId?: string; episodeNumber?: number; storyboardNumber?: number;
  codec?: string;
  forceRegenerate?: boolean;
}) {
  // v6.0.77: codec始终为'h265'（后端自动降级），调用方无需关心
  const paramsWithCodec = {
    ...params,
    codec: 'h265', // getVideoCodecPreference始终返回'h265'
  };
  const result = await apiPost('/volcengine/generate', paramsWithCodec, { timeout: 150000 });
  if (!result.success) {
    const errorMsg = result.error || '创建任务失败';
    // v6.0.96: 解析配额超限错误 (HTTP 429 + quotaExceeded flag)
    const httpMatch = errorMsg.match(/HTTP (\d+):\s*(.+)/s);
    if (httpMatch && httpMatch[1] === '429') {
      try {
        const body = JSON.parse(httpMatch[2]);
        if (body.quotaExceeded) {
          const qErr: any = new Error(body.error || '今日配额已用完');
          qErr.quotaExceeded = true;
          qErr.quotaInfo = { usedToday: body.usedToday ?? 0, freeLimit: body.freeLimit ?? 5, paidCredits: body.paidCredits ?? 0 };
          throw qErr;
        }
      } catch (parseErr: any) {
        if (parseErr.quotaExceeded) throw parseErr; // re-throw QuotaError
      }
    }
    if (errorMsg.includes('Failed to fetch') || errorMsg.includes('Edge Function')) throw new Error('网络连接失败，请检查：\n1. 网络连接是否正常\n2. 端服务是否运行\n3. CORS配置是否正确');
    if (errorMsg.includes('timeout') || errorMsg.includes('超时')) throw new Error('请求超时，请检查网络连接或稍后重试');
    console.error('API Error:', errorMsg); throw new Error(errorMsg);
  }
  const data = result.data;
  let taskData: any;
  if (data?.id || data?.task_id) taskData = data;
  else if ((result as any).task_id || (result as any).local_task_id) taskData = { id: (result as any).task_id || (result as any).local_task_id, task_id: (result as any).task_id, local_task_id: (result as any).local_task_id };
  else { console.error('API返回格式错误，缺少任务ID:', result); throw new Error('服务器未返回任务ID，请重试或联系管理员'); }
  if ((result as any).duplicate) { taskData.duplicate = true; taskData.existingStatus = (result as any).existingStatus; taskData.existingVideoUrl = (result as any).existingVideoUrl; }
  return taskData;
}

export async function getVolcengineTaskStatus(taskId: string) {
  const result = await apiGet(`/volcengine/status/${taskId}`, { timeout: 45000, silent: true });
  if (!result.success) {
    const errorMsg = result.error || 'Query task status failed';
    if (errorMsg.includes('任务不存在') || errorMsg.includes('Task not found') || errorMsg.includes('not found in database')) throw new Error('任务不存在');
    if (errorMsg.includes('timeout') || errorMsg.includes('超时')) { const e = new Error('Task status query timeout — task may still be processing'); e.name = 'AbortError'; throw e; }
    throw new Error(errorMsg);
  }
  const data = result.data || {};
  const status = data.status || 'unknown';
  let videoUrl = '';
  if (status === 'succeeded' || status === 'completed' || status === 'success') videoUrl = data.content?.video_url || data.video_url || '';
  return { status: status === 'succeeded' ? 'success' : status, videoUrl, taskId, rawData: data };
}

/**
 * v6.0.75: 增强版轮询——自适应间隔 + 优雅超时
 * - 网络错误时自动延长间隔（避免风暴式重试）
 * - 轮询超时不再抛异常，而是返回 {status:'timeout'} 让调用方决定如何处理
 * - 连续错误阈值从8提升到12，给更多恢复机会
 */
export async function pollTaskStatus(
  taskId: string,
  onProgress?: (status: TaskStatus) => void,
  maxAttempts: number = 120, // v6.0.75: 从90增加到120（~16分钟，给Volcengine更多处理时间）
  interval: number = 8000
): Promise<TaskStatus> {
  let attempts = 0;
  let consecutiveErrors = 0;
  const maxConsecutiveErrors = 12; // v6.0.75: 从8增加到12
  let currentInterval = interval;

  while (attempts < maxAttempts) {
    try {
      const status = await getVolcengineTaskStatus(taskId);
      consecutiveErrors = 0;
      // v6.0.75: 成功查询后逐步恢复正常间隔（而非立即跳回）
      currentInterval = Math.max(interval, currentInterval - 1000);

      if (onProgress) onProgress(status);

      if (status.status === 'completed' || status.status === 'success') return status;
      if (status.status === 'failed' || status.status === 'error') {
        console.error('Task failed with status:', status.status);
        throw new Error(`视频生成失败 (状态: ${status.status})`);
      }
      if (status.status === 'cancelled') {
        console.log(`[pollTaskStatus] Task ${taskId} cancelled`);
        throw new CancelledTaskError(taskId);
      }

      await new Promise(resolve => setTimeout(resolve, currentInterval));
      attempts++;
    } catch (error: any) {
      if (error instanceof CancelledTaskError) throw error;
      // v6.0.75: 视频生成失败是确定性错误，不需要重试
      if (error.message?.includes('视频生成失败')) throw error;

      consecutiveErrors++;

      if (error.message?.includes('任务不存在') || error.message?.includes('Task not found') || error.message?.includes('not found in database') || error.response?.status === 404) {
        throw new Error(`任务不存在或已过期 (ID: ${taskId})`);
      }

      // v6.0.75: 网络问题时更温和的间隔增长
      if (error.message?.includes('timeout') || error.name === 'AbortError') {
        currentInterval = Math.min(20000, currentInterval + 3000);
      } else if (error.message?.includes('Failed to fetch')) {
        currentInterval = Math.min(25000, currentInterval + 4000);
      }

      if (consecutiveErrors >= maxConsecutiveErrors) {
        // v6.0.75: 不再直接抛异常，返回超时状态让调用方决定
        console.warn(`[pollTaskStatus] Too many consecutive errors (${consecutiveErrors}), returning timeout status for task ${taskId}`);
        return {
          taskId,
          status: 'timeout',
          videoUrl: undefined,
        };
      }

      await new Promise(resolve => setTimeout(resolve, currentInterval));
      attempts++;
    }
  }

  // v6.0.75: 轮询耗尽也返回timeout状态而非抛异常
  console.warn(`[pollTaskStatus] Max attempts (${maxAttempts}) reached for task ${taskId}`);
  return {
    taskId,
    status: 'timeout',
    videoUrl: undefined,
  };
}

export async function syncPendingTasks(): Promise<{ success: boolean; total: number; synced: number; failed: number; stillRunning: number; message: string }> {
  const result = await apiPost('/volcengine/sync-pending-tasks', undefined, { timeout: 60000 });
  if (result.success) return result as any;
  const msg = result.error?.includes('timeout') ? '同步请求超时，请稍后重试' : (result.error || 'Request failed');
  return { success: false, total: 0, synced: 0, failed: 0, stillRunning: 0, message: msg };
}

export async function transferCompletedToOSS(): Promise<{ success: boolean; total: number; transferred: number; errors: number; message: string }> {
  const result = await apiPost('/volcengine/transfer-completed-to-oss', undefined, { timeout: 60000 });
  if (result.success) return result as any;
  const msg = result.error?.includes('timeout') ? '转存请求超时，请稍后重试' : (result.error || 'Request failed');
  return { success: false, total: 0, transferred: 0, errors: 0, message: msg };
}

export async function recoverAllTasks(seriesId?: string): Promise<{ success: boolean; total: number; recovered: number; failed: number; alreadyOK: number; ossTransferred: number; message: string }> {
  const result = await apiPost('/volcengine/recover-all-tasks', { seriesId: seriesId || '' }, { timeout: 90000 });
  if (result.success) return result as any;
  const msg = result.error?.includes('timeout') ? '恢复请求超时，请稍后重试' : (result.error || 'Request failed');
  return { success: false, total: 0, recovered: 0, failed: 0, alreadyOK: 0, ossTransferred: 0, message: msg };
}