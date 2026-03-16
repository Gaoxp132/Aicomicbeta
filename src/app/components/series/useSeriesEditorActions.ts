/**
 * useSeriesEditorActions — Video generation, sync, and diagnostics for SeriesEditor
 * Extracted from hooks.ts for maintainability
 */

import { useState } from 'react';
import type { Series } from '../../types';
import * as services from '../../services';
import { apiPost, apiGet } from '../../utils';
import { getErrorMessage } from '../../utils';
import { toast } from 'sonner';
import type { ConfirmOptions } from './ConfirmDialog';

// v6.0.178: confirmFn 由调用方注入（来自 useConfirm），避免 .ts 文件内依赖 React 组件
type ConfirmFn = (opts: ConfirmOptions) => Promise<boolean>;

export function useSeriesEditorActions(
  localSeries: Series,
  userPhone: string | undefined,
  setLocalSeries: (s: Series) => void,
  onUpdate: (s: Series) => void,
  confirmFn?: ConfirmFn,
) {
  const [isGeneratingVideos, setIsGeneratingVideos] = useState(false);
  const [isSyncingVideoData, setIsSyncingVideoData] = useState(false);
  const [generationProgress, setGenerationProgress] = useState<{
    current: number;
    total: number;
    percentage: number;
    status: string;
  } | null>(null);

  const handleGenerateAllVideos = async () => {
    if (!userPhone) { toast.error('请先登录'); return; }
    if (confirmFn) {
      const confirmed = await confirmFn({
        title: '批量生成视频',
        description: '确���要为整部漫剧生成所有视吗？这将为所有分镜生成视频，可能需要较长时间。',
        confirmText: '开始生成',
        cancelText: '取消',
        variant: 'warning',
        icon: 'regenerate',
      });
      if (!confirmed) return;
    }

    setIsGeneratingVideos(true);
    setGenerationProgress({ current: 0, total: 0, percentage: 0, status: '准备中...' });

    try {
      const result = await services.generateAllVideosForSeries(
        localSeries, userPhone,
        (progress) => {
          setGenerationProgress({
            current: progress.completedStoryboards + (progress.skippedStoryboards || 0),
            total: progress.totalStoryboards,
            percentage: progress.progress,
            status: progress.skippedStoryboards
              ? `第 ${progress.currentEpisode}/${progress.totalEpisodes} 集（${progress.skippedStoryboards}个已有视频跳过）`
              : `正在生成第 ${progress.currentEpisode}/${progress.totalEpisodes} 集...`,
          });
        }
      );
      if (result.success) {
        toast.success('所有视频已开始生成！您可以在"我的作品"中查看生成进度。');
      } else {
        toast.error('批量生成失败：' + result.error);
      }
    } catch (error: unknown) {
      toast.error('批量生成失败：' + getErrorMessage(error));
    } finally {
      setIsGeneratingVideos(false);
      setGenerationProgress(null);
    }
  };

  const handleSyncVideoData = async () => {
    if (confirmFn) {
      const confirmed = await confirmFn({
        title: '同步视频数据',
        description: '确定要同步视频数据吗？这将从video_tasks表中查找并更新所有分镜的视频URL。',
        confirmText: '开始同步',
        cancelText: '取消',
        variant: 'info',
        icon: 'question',
      });
      if (!confirmed) return;
    }

    setIsSyncingVideoData(true);

    const result = await apiPost(`/series/${localSeries.id}/sync-video-data`);

    if (result.success) {
      const data = result.data;
      const stats = data?.stats || {};
      const synced = data?.synced || 0;
      const errors = data?.errors || 0;
      const parts: string[] = [`成功同步: ${synced}个`];
      if (stats.fixedHistoricalLinks > 0) parts.push(`修复历史关联: ${stats.fixedHistoricalLinks}个`);
      if (errors > 0) parts.push(`错误: ${errors}个`);
      toast.success('视频数据同步完成！' + parts.join('，'));
      console.log('[SyncVideoData] 详细统计:', JSON.stringify(stats, null, 2));

      const refreshResult = await services.getSeries(localSeries.id);
      if (refreshResult.success && refreshResult.data) {
        setLocalSeries(refreshResult.data);
        onUpdate(refreshResult.data);
      }
    } else {
      toast.error('同步失败：' + result.error);
    }

    setIsSyncingVideoData(false);
  };

  const handleDiagnoseSyncIssue = async () => {
    const result = await apiGet(`/series/${localSeries.id}/diagnose-sync-issue`);

    if (result.success) {
      const summary = result.diagnosis?.summary;
      if (summary) {
        toast.info(`诊断完成！总分镜: ${summary.totalStoryboards}, 总任务: ${summary.totalVideoTasks}, 未匹配: ${summary.unmatchedStoryboards}（详见Console F12）`);
        console.log('[DiagnoseSync] 完整诊断结果:', JSON.stringify(result, null, 2));
      }
    } else {
      toast.error('诊断失败：' + result.error);
    }
  };

  const handleInspectVideoTasks = async () => {
    const result = await apiGet(`/series/${localSeries.id}/inspect-video-tasks`);

    if (result.success && result.data) {
      const data = result.data;
      toast.info(`检查完成！总任务数: ${data.totalCount}, 剧集数: ${data.episodeSummary?.length || 0}（详见Console F12）`);
      console.log('[InspectVideoTasks] 完整数据:', JSON.stringify(data, null, 2));
    } else {
      toast.error('检查失败：' + result.error);
    }
  };

  return {
    isGeneratingVideos,
    isSyncingVideoData,
    generationProgress,
    handleGenerateAllVideos,
    handleSyncVideoData,
    handleDiagnoseSyncIssue,
    handleInspectVideoTasks,
  };
}