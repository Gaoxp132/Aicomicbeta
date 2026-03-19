/**
 * Volcengine Service - Task creation, status polling, sync/transfer/recover
 * Split from consolidated services/index.ts (v6.0.68)
 * v6.0.75: 增强轮询韧性——自适应间隔/优雅超时/H265支持参数
 * v6.0.77: H265自动默认+降级（getVideoCodecPreference始终返回h265）
 */

import { apiPost, apiGet } from '../utils';

export interface TaskStatus { taskId: string; status: string; videoUrl?: string; progress?: number; failureReason?: string; }

export class CancelledTaskError extends Error {
  constructor(taskId: string) { super(`任务已取消 (ID: ${taskId})`); this.name = 'CancelledTaskError'; }
}

/** v6.0.183: 轮询超时专用错误——任务可能仍在后台处理中，不应视为"失败" */
export class PollingTimeoutError extends Error {
  taskId: string;
  constructor(taskId: string) {
    super(`视频生成轮询超时，任务可能仍在后台处理中。任务ID: ${taskId}`);
    this.name = 'PollingTimeoutError';
    this.taskId = taskId;
  }
}

/**
 * v6.0.183: 防御性类型守卫——即使 instanceof 因 bundler 模块重复而失败，也能正确识别
 * 三重检测: instanceof → error.name → error.message 关键词
 */
export function isPollingTimeoutError(err: unknown): err is PollingTimeoutError {
  if (err instanceof PollingTimeoutError) return true;
  if (err instanceof Error) {
    if (err.name === 'PollingTimeoutError') return true;
    if (err.message.includes('轮询超时') && err.message.includes('任务ID:')) return true;
  }
  return false;
}

/** 从 PollingTimeoutError（或鸭子类型匹配的 Error）中提取 taskId */
export function getPollingTimeoutTaskId(err: unknown): string {
  if (err instanceof PollingTimeoutError) return err.taskId;
  if (err instanceof Error) {
    const match = err.message.match(/任务ID:\s*(\S+)/);
    if (match) return match[1];
  }
  return 'unknown';
}

export interface QuotaInfo { usedToday: number; freeLimit: number; paidCredits: number; }
export class QuotaExceededError extends Error {
  quotaExceeded = true;
  quotaInfo: QuotaInfo;
  constructor(message: string, quotaInfo: QuotaInfo) {
    super(message); this.name = 'QuotaExceededError'; this.quotaInfo = quotaInfo;
  }
}

export interface VideoTaskData {
  id: string;
  task_id?: string;
  local_task_id?: string;
  duplicate?: boolean;
  existingStatus?: string;
  existingVideoUrl?: string;
  [key: string]: unknown;
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
  const result = await apiPost('/volcengine/generate', paramsWithCodec, { timeout: 120000 });
  if (!result.success) {
    const errorMsg = result.error || '创建任务失败';
    // v6.0.96: 解析配额超限错误 (HTTP 429 + quotaExceeded flag)
    const httpMatch = errorMsg.match(/HTTP (\d+):\s*(.+)/s);
    if (httpMatch && httpMatch[1] === '429') {
      try {
        const body = JSON.parse(httpMatch[2]);
        if (body.quotaExceeded) {
          throw new QuotaExceededError(
            body.error || '今日配额已用完',
            { usedToday: body.usedToday ?? 0, freeLimit: body.freeLimit ?? 5, paidCredits: body.paidCredits ?? 0 }
          );
        }
      } catch (parseErr: unknown) {
        if (parseErr instanceof QuotaExceededError) throw parseErr; // re-throw QuotaError
      }
    }
    if (errorMsg.includes('Failed to fetch') || errorMsg.includes('Edge Function')) throw new Error('网络连接失败，请检查：\n1. 网络连接是否正常\n2. 端服务是否运行\n3. CORS配置是否正确');
    if (errorMsg.includes('timeout') || errorMsg.includes('超时')) throw new Error('请求超时，请检查网络连接或稍后重试');
    console.error('API Error:', errorMsg); throw new Error(errorMsg);
  }
  const data = result.data;
  let taskData: VideoTaskData;
  if (data?.id || data?.task_id) taskData = data;
  else if (result.task_id || result.local_task_id) taskData = { id: result.task_id || result.local_task_id, task_id: result.task_id, local_task_id: result.local_task_id };
  else { console.error('API返回格式错误，缺少任务ID:', result); throw new Error('服务器未返回任务ID，请重试或联系管理员'); }
  if (result.duplicate) { taskData.duplicate = true; taskData.existingStatus = result.existingStatus; taskData.existingVideoUrl = result.existingVideoUrl; }
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
  // v6.0.161: 提取失败原因
  const failureReason = data.failureReason || data.error?.message || '';
  return { status: status === 'succeeded' ? 'success' : status, videoUrl, taskId, rawData: data, failureReason };
}

/**
 * v6.0.75: 增强版轮询——自适应间隔 + 优雅超时
 * - 网络错误时自动延长间隔（避免风暴式重试）
 * - 轮询超时不再抛异常，而是返回 {status:'timeout'} 让调用方决定如何处理
 * - 连续错误阈值从8提升到12，给更多恢复机会
 * v6.0.183: 自适应间隔覆盖 ~30 分钟（原 ~16 分钟）
 *   - 前20次: 5s (共100s ≈ 1.7min)
 *   - 21-50次: 10s (共300s = 5min)
 *   - 51-80次: 15s (共450s = 7.5min)
 *   - 81-120次: 25s (共1000s ≈ 16.7min)
 *   合计: ~1850s ≈ 30.8 分钟
 */
export async function pollTaskStatus(
  taskId: string,
  onProgress?: (status: TaskStatus) => void,
  maxAttempts: number = 120,
  interval: number = 8000 // 仅作为基准参数传入，实际使用自适应间隔
): Promise<TaskStatus> {
  let attempts = 0;
  let consecutiveErrors = 0;
  const maxConsecutiveErrors = 12;
  // v6.0.183: 错误导致的间隔膨胀独立于自应间隔
  let errorIntervalBonus = 0;

  /** v6.0.183: 根据轮询次数计算自适应间隔 — 越往后间隔越长，覆盖更多时间 */
  const getAdaptiveInterval = (attempt: number): number => {
    let base: number;
    if (attempt < 20) base = 5000;       // 前 20 次: 5s
    else if (attempt < 50) base = 10000; // 21-50 次: 10s
    else if (attempt < 80) base = 15000; // 51-80 次: 15s
    else base = 25000;                   // 81+ 次: 25s
    return base + errorIntervalBonus;
  };

  while (attempts < maxAttempts) {
    const currentInterval = getAdaptiveInterval(attempts);
    try {
      const status = await getVolcengineTaskStatus(taskId);
      consecutiveErrors = 0;
      // v6.0.183: 成功查询后逐步消除错误间隔膨胀
      errorIntervalBonus = Math.max(0, errorIntervalBonus - 2000);

      if (onProgress) onProgress(status);

      if (status.status === 'completed' || status.status === 'success') return status;
      if (status.status === 'failed' || status.status === 'error') {
        const reason = status.failureReason ? `: ${status.failureReason}` : '';
        console.error(`Task failed with status: ${status.status}${reason}`);
        throw new Error(`视频生成失败 (状态: ${status.status})${reason ? `\n原因: ${reason}` : ''}`);
      }
      if (status.status === 'cancelled') {
        console.log(`[pollTaskStatus] Task ${taskId} cancelled`);
        throw new CancelledTaskError(taskId);
      }

      await new Promise(resolve => setTimeout(resolve, currentInterval));
      attempts++;
    } catch (error: unknown) {
      if (error instanceof CancelledTaskError) throw error;
      const errMsg = error instanceof Error ? error.message : String(error);
      // v6.0.75: 视频生成失败是确定性错误，不需要重试
      if (errMsg.includes('视频生成失败')) throw error;

      consecutiveErrors++;

      // v6.0.183: 修正字符串匹配——getVolcengineTaskStatus 抛出 '任务不存在'，原检查 '任务存在或已过期' 永远不匹配
      if (errMsg.includes('任务不存在') || errMsg.includes('Task not found') || errMsg.includes('not found in database')) {
        throw new Error(`任务不存在或已过期 (ID: ${taskId})`);
      }

      // v6.0.183: 网络问题时在自适应基准上叠加额外延迟（上限 15s）
      if (errMsg.includes('timeout') || (error instanceof Error && error.name === 'AbortError')) {
        errorIntervalBonus = Math.min(15000, errorIntervalBonus + 3000);
      } else if (errMsg.includes('Failed to fetch')) {
        errorIntervalBonus = Math.min(15000, errorIntervalBonus + 5000);
      }

      if (consecutiveErrors >= maxConsecutiveErrors) {
        console.warn(`[pollTaskStatus] Too many consecutive errors (${consecutiveErrors}), returning timeout status for task ${taskId}`);
        return {
          taskId,
          status: 'timeout',
          videoUrl: undefined,
        };
      }

      await new Promise(resolve => setTimeout(resolve, currentInterval + errorIntervalBonus));
      attempts++;
    }
  }

  // v6.0.183: 轮询耗尽——最后一搏：等待20s后再做一次状态检查
  console.warn(`[pollTaskStatus] Max attempts (${maxAttempts}) reached for task ${taskId}, elapsed ~30 min`);
  try {
    console.log(`[pollTaskStatus] Final check: waiting 20s before last status query for ${taskId}...`);
    await new Promise(resolve => setTimeout(resolve, 20000));
    const finalStatus = await getVolcengineTaskStatus(taskId);
    if (finalStatus.status === 'completed' || finalStatus.status === 'success') {
      console.log(`[pollTaskStatus] ✅ Final check succeeded! Task ${taskId} completed with video URL`);
      return finalStatus;
    }
    console.log(`[pollTaskStatus] Final check: task ${taskId} still ${finalStatus.status}`);
  } catch (finalErr: unknown) {
    console.warn(`[pollTaskStatus] Final check failed for ${taskId}: ${finalErr instanceof Error ? finalErr.message : String(finalErr)}`);
  }

  return {
    taskId,
    status: 'timeout',
    videoUrl: undefined,
  };
}

export interface SyncPendingResult { success: boolean; total: number; synced: number; failed: number; stillRunning: number; message: string; }
export interface TransferOSSResult { success: boolean; total: number; transferred: number; errors: number; message: string; }
export interface RecoverAllResult { success: boolean; total: number; recovered: number; failed: number; alreadyOK: number; ossTransferred: number; message: string; }

export async function syncPendingTasks(): Promise<SyncPendingResult> {
  // v6.0.173: timeout 60→50s(服务端40s deadline+10s余量), maxRetries 0(超时不重试,避免3×60s=180s等待)
  const result = await apiPost('/volcengine/sync-pending-tasks', undefined, { timeout: 50000, maxRetries: 0 });
  if (result.success) {
    const d = result.data || result;
    return { success: true, total: d.total ?? 0, synced: d.synced ?? 0, failed: d.failed ?? 0, stillRunning: d.stillRunning ?? 0, message: d.message ?? '' };
  }
  const msg = result.error?.includes('timeout') ? '同步请求超时，请稍后重试' : (result.error || 'Request failed');
  return { success: false, total: 0, synced: 0, failed: 0, stillRunning: 0, message: msg };
}

export async function transferCompletedToOSS(): Promise<TransferOSSResult> {
  // v6.0.173: maxRetries 0 — 长耗时批量操作超时后不重试
  const result = await apiPost('/volcengine/transfer-completed-to-oss', undefined, { timeout: 50000, maxRetries: 0 });
  if (result.success) {
    const d = result.data || result;
    return { success: true, total: d.total ?? 0, transferred: d.transferred ?? 0, errors: d.errors ?? 0, message: d.message ?? '' };
  }
  const msg = result.error?.includes('timeout') ? '转存请求超时，请稍后重试' : (result.error || 'Request failed');
  return { success: false, total: 0, transferred: 0, errors: 0, message: msg };
}

export async function recoverAllTasks(seriesId?: string): Promise<RecoverAllResult> {
  // v6.0.173: maxRetries 0 — 长耗时批量操作超时后不重试
  const result = await apiPost('/volcengine/recover-all-tasks', { seriesId: seriesId || '' }, { timeout: 55000, maxRetries: 0 });
  if (result.success) {
    const d = result.data || result;
    return { success: true, total: d.total ?? 0, recovered: d.recovered ?? 0, failed: d.failed ?? 0, alreadyOK: d.alreadyOK ?? 0, ossTransferred: d.ossTransferred ?? 0, message: d.message ?? '' };
  }
  const msg = result.error?.includes('timeout') ? '恢复请求超时，请稍后重试' : (result.error || 'Request failed');
  return { success: false, total: 0, recovered: 0, failed: 0, alreadyOK: 0, ossTransferred: 0, message: msg };
}