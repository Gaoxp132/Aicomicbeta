/**
 * useStoryboardBatchGeneration — Batch video generation for storyboards
 * v6.0.21: removed toast progress — unified by TaskStatusFloating
 * v6.0.63: forced sceneNumber ordering for sequential generation
 * v6.0.92: 新增currentScene字段——实时显示正在生成的场景编号
 * v6.0.93: 持久化 generating 状态到 DB，重新进入页面后仍能看到生成状态
 * v6.0.95: 视频生成失败（Volcengine returned failed）时自动重试一次
 * v6.0.96: 配额超限——中止批量生成并弹出付款对话框
 * v6.0.162: 失败时回写draft到DB，防止刷新后永久卡在'generating'
 * v6.0.163: 记录generating开始时间（用于显示耗时+超时重置）
 * v6.0.178: 由调用方注入的确认函数（来自 useConfirm），替代原生 confirm()
 * v6.0.183: 三大修复——
 *   (1) 新增 pre-flight 检查: 批量前查询服务器已有任务状态，避免为仍在后台运行的任务创建重复任务
 *   (2) 轮询超时(PollingTimeoutError)不再标记为失败(draft)——保持'generating'，让背景轮询最终拾取结果
 *   (3) 已完成的后台任务自动识别并跳过，直接更新本地videoUrl
 * Extracted from hooks.ts for maintainability
 */

import { useState, useCallback } from 'react';
import { toast } from 'sonner';
import type { Storyboard } from '../../types';
import * as services from '../../services';
import { apiRequest } from '../../utils';
import { sbVideoUrl } from '../../utils';
import { emitQuotaExceeded } from '../../utils/events';
import { QuotaExceededError, isPollingTimeoutError, getPollingTimeoutTaskId } from '../../services/volcengine';
import type { ConfirmOptions } from './ConfirmDialog';
import { getErrorMessage } from '../../utils';
import { extractAndUploadLastFrame } from '../../utils/videoLastFrame';

interface UseStoryboardBatchGenerationOptions {
  seriesId: string;
  userPhone: string;
  episodeNumber: number;
  storyboardsRef: React.MutableRefObject<Storyboard[]>;
  updateStoryboards: (updater: (prev: Storyboard[]) => Storyboard[]) => void;
  /** v6.0.120: 当前风格锚定图URL（用于批量完成后提示设置锚定） */
  styleAnchorImageUrl?: string;
  /** v6.0.163: 记录generating开始时间（用于显示耗时+超时重置） */
  generatingStartTimes?: React.MutableRefObject<Map<string, number>>;
  /** v6.0.178: 由调用方注入的确认函数（来自 useConfirm），替代原生 confirm() */
  confirmFn?: (opts: ConfirmOptions) => Promise<boolean>;
}

export function useStoryboardBatchGeneration({
  seriesId,
  userPhone,
  episodeNumber,
  storyboardsRef,
  updateStoryboards,
  styleAnchorImageUrl,
  generatingStartTimes,
  confirmFn,
}: UseStoryboardBatchGenerationOptions) {
  const [isBatchGenerating, setIsBatchGenerating] = useState(false);
  // v6.0.92: 新增currentScene字段——实时显示正在生成的场景编号
  const [batchProgress, setBatchProgress] = useState({ completed: 0, failed: 0, total: 0, currentScene: 0 });

  const handleBatchGenerate = useCallback(async () => {
    const currentStoryboards = storyboardsRef.current;
    const pending = currentStoryboards.filter(sb => {
      return !sbVideoUrl(sb) && sb.status !== 'generating';
    }).sort((a, b) => (a.sceneNumber || 0) - (b.sceneNumber || 0));

    if (pending.length === 0) {
      toast.info('所有分镜视频已生成完成，无需再次生成');
      return;
    }

    const currentCompleted = currentStoryboards.filter(sb => !!sbVideoUrl(sb)).length;

    if (confirmFn) {
      const confirmed = await confirmFn({
        title: '批量生成视频',
        description: `确定要为本集 ${pending.length} 个未生成的分镜批量生成视频吗？\n\n已有 ${currentCompleted} 个已完成，将跳过。\n\n生成过程可能需要较长时间，请耐心等待。`,
        confirmText: '开始生成',
        cancelText: '取消',
        variant: 'warning',
        icon: 'regenerate',
      });
      if (!confirmed) return;
    }

    setIsBatchGenerating(true);
    setBatchProgress({ completed: 0, failed: 0, total: pending.length, currentScene: 0 });

    // v6.0.183: Pre-flight check — 查询服务器端已有任务状态
    // 避免为仍在后台运行的Volcengine任务创建重复任务
    let existingTasks: Map<string, { taskId: string; status: string; videoUrl: string }>;
    try {
      existingTasks = await services.fetchExistingVideoTasks(seriesId);
    } catch {
      existingTasks = new Map();
    }

    let completed = 0;
    let failed = 0;
    let timedOut = 0; // v6.0.183: 超时计数——任务仍在后台处理，不算失败
    let consecutiveNetworkFails = 0;
    
    for (let idx = 0; idx < pending.length; idx++) {
      const sb = pending[idx];
      
      // v6.0.183: Pre-flight — 检查服务器是否已有此分镜的完成/进行中任务
      const existingTask = existingTasks.get(sb.id);
      if (existingTask) {
        const isCompleted = ['completed', 'succeeded', 'success'].includes(existingTask.status);
        const hasUrl = existingTask.videoUrl && (existingTask.videoUrl.startsWith('http://') || existingTask.videoUrl.startsWith('https://'));
        
        if (isCompleted && hasUrl) {
          // 服务器已有完成的视频——直接更新本地状态，无需重新生成
          console.log(`[StoryboardEditor] Batch: scene ${sb.sceneNumber} already completed on server (task ${existingTask.taskId}), updating local state`);
          updateStoryboards(prev => prev.map(s =>
            s.id === sb.id ? { ...s, status: 'completed' as const, videoUrl: existingTask.videoUrl } : s
          ));
          completed++;
          setBatchProgress({ completed, failed, total: pending.length, currentScene: 0 });
          continue;
        }
        
        if (['pending', 'processing', 'submitted'].includes(existingTask.status)) {
          // 任务仍在后台运行——跳过，保持 generating 状态，由背景轮询拾取
          console.log(`[StoryboardEditor] Batch: scene ${sb.sceneNumber} has in-progress task ${existingTask.taskId} (${existingTask.status}), skipping — background polling will pick it up`);
          updateStoryboards(prev => prev.map(s =>
            s.id === sb.id ? { ...s, status: 'generating' as const } : s
          ));
          timedOut++;
          setBatchProgress({ completed, failed, total: pending.length, currentScene: 0 });
          continue;
        }
      }

      if (idx > 0) {
        const delay = consecutiveNetworkFails > 0 ? 8000 : 3000;
        await new Promise(r => setTimeout(r, delay));
      }
      
      try {
        // v6.0.92: 先更新currentScene，让进度条显示正在处理哪个场景
        setBatchProgress(prev => ({ ...prev, currentScene: sb.sceneNumber || idx + 1 }));

        updateStoryboards(prev => prev.map(s =>
          s.id === sb.id ? { ...s, status: 'generating' as const } : s
        ));

        // v6.0.93: 持久化 generating 状态到 DB，重新进入页面后仍能看到生成状态
        apiRequest(`/series/${seriesId}/storyboards/${sb.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ status: 'generating', episodeNumber, sceneNumber: sb.sceneNumber }),
        }).catch(() => {}); // fire-and-forget，非阻塞

        // v6.0.163: 记录generating开始时间（用于显示耗时+超时重置）
        if (generatingStartTimes) {
          generatingStartTimes.current.set(sb.id, Date.now());
        }

        // v6.0.95+161: 视频生成失败（Volcengine returned failed）时自动重试最多2次（共3次尝试）
        // v6.0.161: 从2次增加到3次，第2次重试延长至20s（给Volcengine更多恢复时间）
        let videoUrl: string | undefined;
        let lastGenErr: unknown = null;
        for (let genAttempt = 0; genAttempt < 3; genAttempt++) {
          if (genAttempt > 0) {
            const retryDelay = genAttempt === 1 ? 10000 : 20000;
            console.log(`[StoryboardEditor] Batch: scene ${sb.sceneNumber} Volcengine failed (attempt ${genAttempt}/${2}), retrying in ${retryDelay / 1000}s...`);
            await new Promise(r => setTimeout(r, retryDelay));
          }
          try {
            videoUrl = await services.generateStoryboardVideo(
              seriesId, userPhone, sb, episodeNumber
            );
            lastGenErr = null;
            break; // success
          } catch (err: unknown) {
            lastGenErr = err;
            // v6.0.183: PollingTimeoutError 不重试——任务仍在后台处理中
            if (isPollingTimeoutError(err)) break;
            const errStr = getErrorMessage(err);
            console.warn(`[StoryboardEditor] Batch: scene ${sb.sceneNumber} generation attempt ${genAttempt + 1} failed:`, errStr);
            // 不重试网络错误（由外层consecutiveNetworkFails处理）
            if (errStr.includes('网络连接失败') || errStr.includes('Failed to fetch') || errStr.includes('Edge Function')) break;
          }
        }
        if (!videoUrl) throw lastGenErr;

        console.log(`[StoryboardEditor] Batch: scene ${sb.sceneNumber} completed with URL: ${videoUrl.substring(0, 80)}...`);

        updateStoryboards(prev => prev.map(s =>
          s.id === sb.id ? { ...s, status: 'completed' as const, videoUrl } : s
        ));

        await apiRequest(`/series/${seriesId}/storyboards/${sb.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            videoUrl,
            status: 'completed',
            episodeNumber,
            sceneNumber: sb.sceneNumber,
          }),
        });

        // v6.0.206: 等待尾帧提取完成（最多20s），降低下一场景抢跑导致无尾帧参考的概率
        // 不再fire-and-forget，因为串行生成依赖前序场景的尾帧
        try {
          await Promise.race([
            extractAndUploadLastFrame(videoUrl, seriesId, sb.id),
            new Promise(resolve => setTimeout(resolve, 20000)), // 20s timeout
          ]);
        } catch { /* non-blocking */ }

        completed++;
        consecutiveNetworkFails = 0;
      } catch (error: unknown) {
        // v6.0.96: 配额超限——中止批量生成并弹出付款对话框
        if (error instanceof QuotaExceededError) {
          emitQuotaExceeded(error.quotaInfo);
          toast.error(`今日免费配额已用完，已完成 ${completed} 个。购买配额后可继续生成。`);
          setIsBatchGenerating(false);
          return;
        }

        // v6.0.183: 轮询超时 → 保持 'generating' 状态，不标记为失败
        // 任务仍在 Volcengine 后台处理中，由 useStoryboardPolling 背景轮询最终拾取结果
        if (isPollingTimeoutError(error)) {
          timedOut++;
          console.warn(`[StoryboardEditor] Batch: scene ${sb.sceneNumber} polling timeout (task ${getPollingTimeoutTaskId(error)}), keeping 'generating' — background polling will pick it up`);
          toast.info(`场景${sb.sceneNumber}生成耗时较长，将在后台继续处理`, { duration: 5000 });
          // 保持 'generating' 状态 — 不回写 'draft'，不计入 failed
          setBatchProgress({ completed, failed, total: pending.length, currentScene: 0 });
          continue; // 继续处理下一个分镜
        }

        console.error(`[StoryboardEditor] Batch: scene ${sb.sceneNumber} failed:`, getErrorMessage(error));

        const isNetworkError = (error instanceof Error && error.message?.includes('网络连接失败')) || 
                               (error instanceof Error && error.message?.includes('Failed to fetch')) ||
                               (error instanceof Error && error.message?.includes('Edge Function'));
        
        if (isNetworkError) {
          consecutiveNetworkFails++;
          if (consecutiveNetworkFails >= 3 && idx < pending.length - 1) {
            console.warn(`[StoryboardEditor] ${consecutiveNetworkFails} consecutive network failures, pausing 10s...`);
            await new Promise(r => setTimeout(r, 10000));
          }
        } else {
          consecutiveNetworkFails = 0;
        }
        
        updateStoryboards(prev => prev.map(s =>
          s.id === sb.id ? { ...s, status: 'draft' as const, error: getErrorMessage(error) } : s
        ));
        // v6.0.162: 失败时回写draft到DB，防止刷新后永久卡在'generating'
        apiRequest(`/series/${seriesId}/storyboards/${sb.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ status: 'draft', episodeNumber, sceneNumber: sb.sceneNumber }),
        }).catch(() => {}); // fire-and-forget
        failed++;
        
        if (consecutiveNetworkFails >= 5) {
          console.error(`[StoryboardEditor] Too many network failures, aborting batch`);
          toast.error(`网络连续失败，已中止。${completed} 个已完成，请稍后重试。`);
          setIsBatchGenerating(false);
          return;
        }
      }

      setBatchProgress({ completed, failed, total: pending.length, currentScene: 0 });
    }

    setIsBatchGenerating(false);

    // v6.0.183: 汇总消息包含超时数量
    if (failed === 0 && timedOut === 0) {
      toast.success(`全部 ${completed} 个视频生成成功！`);
    } else if (failed === 0 && timedOut > 0) {
      toast.info(`${completed} 个生成成功，${timedOut} 个仍在后台处理中（页面会自动刷新结果）`);
    } else {
      const parts = [`成功 ${completed}`];
      if (timedOut > 0) parts.push(`后台处理中 ${timedOut}`);
      parts.push(`失败 ${failed}`);
      toast.warning(`批量生成完成：${parts.join('，')}`);
    }

    // v6.0.120: 批量完成后，若无风格锚定图，提示用户设置
    if (completed > 0 && !styleAnchorImageUrl) {
      setTimeout(() => {
        toast.info(
          '提示: 建议设置风格锚定图，确保后续场景与已生成场景的画风一致。可在标题下方的"设置风格锚定图"中选择。',
          { duration: 8000 }
        );
      }, 2000);
    }
  }, [seriesId, userPhone, episodeNumber, storyboardsRef, updateStoryboards, styleAnchorImageUrl, generatingStartTimes, confirmFn]);

  return {
    isBatchGenerating,
    batchProgress,
    handleBatchGenerate,
  };
}