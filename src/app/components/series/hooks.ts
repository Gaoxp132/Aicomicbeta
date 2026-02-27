/**
 * Series hooks — barrel re-export + remaining hooks
 * v6.0.88: Split useEpisodeActions (360 lines) into useEpisodeActions.ts
 * v6.0.71: Consolidated triple namespace import into single `services` alias
 * v6.0.68: Merged useSeriesEditorActions, useStoryboardBatchGeneration, useWizardAI
 */

import { useState, useCallback } from 'react';
import { toast } from 'sonner';
import type { Series, Storyboard, SeriesFormData } from '../../types';
import * as services from '../../services';
import { apiPost, apiGet, apiRequest } from '../../utils';
import { emitQuotaExceeded } from '../../utils/events';
import { STYLES } from '../../constants';

// Re-export useEpisodeActions from its own module
export { useEpisodeActions } from './useEpisodeActions';

// ═══════════════════════════════════════════════════════════════════════
// useSeriesEditorActions
// ═══════════════════════════════════════════════════════════════════════

export function useSeriesEditorActions(
  localSeries: Series,
  userPhone: string | undefined,
  setLocalSeries: (s: Series) => void,
  onUpdate: (s: Series) => void,
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
    if (!userPhone) { alert('请先登录'); return; }
    if (!confirm('确定要为整部漫剧生成所有视频吗？\n\n这将为所有分镜生成视频，可能需要较长时间。')) return;

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
        alert('所有视频已开始生成！\n\n您可以在"我的作品"中查看生成进度。');
      } else {
        alert('批量生成失败：' + result.error);
      }
    } catch (error: any) {
      alert('批量生成失败：' + error.message);
    } finally {
      setIsGeneratingVideos(false);
      setGenerationProgress(null);
    }
  };

  const handleSyncVideoData = async () => {
    if (!confirm('确定要同步视频数据吗？\n\n这将从video_tasks表中查找并更新所有分镜的视频URL。')) return;

    setIsSyncingVideoData(true);

    const result = await apiPost(`/series/${localSeries.id}/sync-video-data`);

    if (result.success) {
      const data = result.data as any;
      const stats = data?.stats || {};
      const synced = data?.synced || 0;
      const errors = data?.errors || 0;
      const messages = [`视频数据同步完成！\n`, `\u2705 成功同步: ${synced}个`];
      if (stats.fixedHistoricalLinks > 0) messages.push(`\ud83d\udd27 修复历史关联: ${stats.fixedHistoricalLinks}个`);
      if (stats.syncedByStoryboardId > 0 || stats.syncedByMetadata > 0) {
        messages.push(`   \ud83d\udd0d 同步方式:`);
        if (stats.syncedByStoryboardId > 0) messages.push(`      - 通过storyboard_id: ${stats.syncedByStoryboardId}个`);
        if (stats.syncedByMetadata > 0) messages.push(`      - 通过metadata匹配: ${stats.syncedByMetadata}个`);
      }
      messages.push(
        `\n\ud83d\udcca 统计信息:`,
        `  - 已有视频: ${stats.alreadyHasVideo || 0}个`,
        `  - 无任务ID: ${stats.noTaskId || 0}个`,
        `  - 跳过: ${stats.skipped || 0}个`,
        `  - 错误: ${errors}个`,
      );
      alert(messages.join('\n'));

      const refreshResult = await services.getSeries(localSeries.id);
      if (refreshResult.success && refreshResult.data) {
        setLocalSeries(refreshResult.data);
        onUpdate(refreshResult.data);
      }
    } else {
      alert('同步失败：' + result.error);
    }

    setIsSyncingVideoData(false);
  };

  const handleDiagnoseSyncIssue = async () => {
    const result = await apiGet(`/series/${localSeries.id}/diagnose-sync-issue`);

    if (result.success) {
      const summary = (result as any).diagnosis?.summary;
      if (summary) {
        alert(`\ud83d\udd2c 诊断完成！\n\n请查看Console(F12)的详细日志\n\n\ud83d\udcca 摘要：\n总分镜: ${summary.totalStoryboards}\n总任务: ${summary.totalVideoTasks}\n未匹配: ${summary.unmatchedStoryboards}`);
      }
    } else {
      alert('诊断失败：' + result.error);
    }
  };

  const handleInspectVideoTasks = async () => {
    const result = await apiGet(`/series/${localSeries.id}/inspect-video-tasks`);

    if (result.success && result.data) {
      const data = result.data as any;
      alert(`\ud83d\udd0d 检查完成！\n\n请查看Console(F12)的详细日志\n\n\ud83d\udcca 摘要：\n总任务数: ${data.totalCount}\n剧集数: ${data.episodeSummary?.length || 0}`);
    } else {
      alert('检查失败：' + result.error);
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

// ═══════════════════════════════════════════════════════════════════════
// useStoryboardBatchGeneration
// v6.0.21: removed toast progress — unified by TaskStatusFloating
// v6.0.63: forced sceneNumber ordering for sequential generation
// v6.0.92: 新增currentScene字段——实时显示正在生成的场景编号
// v6.0.93: 持久化 generating 状态到 DB，重新进入页面后仍能看到生成状态
// v6.0.95: 视频生成失败（Volcengine returned failed）时自动重试一次
// v6.0.96: 配额超限——中止批量生成并弹出付款对话框
// ═══════════════════════════════════════════════════════════════════════

interface UseStoryboardBatchGenerationOptions {
  seriesId: string;
  userPhone: string;
  episodeNumber: number;
  storyboardsRef: React.MutableRefObject<Storyboard[]>;
  updateStoryboards: (updater: (prev: Storyboard[]) => Storyboard[]) => void;
  /** v6.0.120: 当前风格锚定图URL（用于批量完成后提示设置锚定） */
  styleAnchorImageUrl?: string;
}

export function useStoryboardBatchGeneration({
  seriesId,
  userPhone,
  episodeNumber,
  storyboardsRef,
  updateStoryboards,
  styleAnchorImageUrl,
}: UseStoryboardBatchGenerationOptions) {
  const [isBatchGenerating, setIsBatchGenerating] = useState(false);
  // v6.0.92: 新增currentScene字段——实时显示正在生成的场景编号
  const [batchProgress, setBatchProgress] = useState({ completed: 0, failed: 0, total: 0, currentScene: 0 });

  const handleBatchGenerate = useCallback(async () => {
    const currentStoryboards = storyboardsRef.current;
    const pending = currentStoryboards.filter(sb => {
      const hasVideo = !!(sb.videoUrl || (sb as any).video_url);
      return !hasVideo && sb.status !== 'generating';
    }).sort((a, b) => (a.sceneNumber || 0) - (b.sceneNumber || 0));

    if (pending.length === 0) {
      toast.info('所有分镜视频已生成完成，无需再次生成');
      return;
    }

    const currentCompleted = currentStoryboards.filter(sb => !!(sb.videoUrl || (sb as any).video_url)).length;

    if (!confirm(`确定要为本集 ${pending.length} 个未生成的分镜批量生成视频吗？\n\n已有 ${currentCompleted} 个已完成，将跳过。\n\n生成过程可能需要较长时间，请耐心等待。`)) {
      return;
    }

    setIsBatchGenerating(true);
    setBatchProgress({ completed: 0, failed: 0, total: pending.length, currentScene: 0 });

    let completed = 0;
    let failed = 0;
    let consecutiveNetworkFails = 0;
    
    for (let idx = 0; idx < pending.length; idx++) {
      const sb = pending[idx];
      
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

        // v6.0.95: 视频生成失败（Volcengine returned failed）时自动重试一次
        let videoUrl: string | undefined;
        let lastGenErr: any = null;
        for (let genAttempt = 0; genAttempt < 2; genAttempt++) {
          if (genAttempt > 0) {
            console.log(`[StoryboardEditor] Batch: scene ${sb.sceneNumber} Volcengine failed, retrying in 10s...`);
            await new Promise(r => setTimeout(r, 10000));
          }
          try {
            videoUrl = await services.generateStoryboardVideo(
              seriesId, userPhone, sb, episodeNumber
            );
            lastGenErr = null;
            break; // success
          } catch (err: any) {
            lastGenErr = err;
            // 不重试「超时」——任务可能仍在后台处理中
            if (err.message?.includes('视频仍在生成中')) break;
            // 不重试网络错误（由外层consecutiveNetworkFails处理）
            if (err.message?.includes('网络连接失败') || err.message?.includes('Failed to fetch') || err.message?.includes('Edge Function')) break;
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

        completed++;
        consecutiveNetworkFails = 0;
      } catch (error: any) {
        console.error(`[StoryboardEditor] Batch: scene ${sb.sceneNumber} failed:`, error.message);

        // v6.0.96: 配额超限——中止批量生成并弹出付款对话框
        if (error.quotaExceeded && error.quotaInfo) {
          emitQuotaExceeded(error.quotaInfo);
          toast.error(`今日免费配额已用完，已完成 ${completed} 个。购买配额后可继续生成。`);
          setIsBatchGenerating(false);
          return;
        }

        const isNetworkError = error.message?.includes('网络连接失败') || 
                               error.message?.includes('Failed to fetch') ||
                               error.message?.includes('Edge Function');
        
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
          s.id === sb.id ? { ...s, status: 'draft' as const, error: error.message } : s
        ));
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

    if (failed === 0) {
      toast.success(`全部 ${completed} 个视频生成成功！`);
    } else {
      toast.warning(`批量生成完成：成功 ${completed}，失败 ${failed}`);
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
  }, [seriesId, userPhone, episodeNumber, storyboardsRef, updateStoryboards, styleAnchorImageUrl]);

  return {
    isBatchGenerating,
    batchProgress,
    handleBatchGenerate,
  };
}

// ═══════════════════════════════════════════════════════════════════════
// useWizardAI
// ═══════════════════════════════════════════════════════════════════════

const GENRES = [
  { id: 'romance', name: '爱情' },
  { id: 'suspense', name: '悬疑' },
  { id: 'comedy', name: '喜剧' },
  { id: 'action', name: '动作' },
  { id: 'fantasy', name: '奇幻' },
  { id: 'horror', name: '恐怖' },
  { id: 'scifi', name: '科幻' },
  { id: 'drama', name: '剧情' },
];

interface UseWizardAIOptions {
  formData: SeriesFormData;
  setFormData: React.Dispatch<React.SetStateAction<SeriesFormData>>;
  userPhone?: string;
  onComplete: (series: Series) => void;
}

export function useWizardAI({ formData, setFormData, userPhone, onComplete }: UseWizardAIOptions) {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isGeneratingBasicInfo, setIsGeneratingBasicInfo] = useState(false);
  const [isGeneratingOutline, setIsGeneratingOutline] = useState(false);

  const handleAIGenerate = async () => {
    setIsGeneratingBasicInfo(true);

    const result = await apiPost('/series/generate-basic-info', {
      userInput: formData.title || formData.description || '',
    }, {
      timeout: 180000,
      headers: userPhone ? { 'X-User-Phone': userPhone } : {},
    });

    if (result.success) {
      const aiData = result.data || result;

      if (aiData.title) {
        setFormData(prev => ({ ...prev, title: aiData.title }));
      }
      if (aiData.description) {
        setFormData(prev => ({ ...prev, description: aiData.description }));
      }

      if (aiData.title && aiData.description) {
        const isFallback = (result as any).fallback ? ' (使用默认方案)' : '';
        toast.success(`AI生成成功！${isFallback}已自动填充标题和简介。`);
      } else {
        toast.warning('AI生成部分成功，请检查并手补充缺失的字段。');
      }
    } else {
      const errorMsg = result.error || '未知错误';
      let errorMessage = 'AI生成失败：' + errorMsg;

      if (errorMsg.includes('timeout') || errorMsg.includes('超时')) {
        errorMessage = 'AI生成超时（3分钟），请稍后重试或手动填写。';
      } else if (errorMsg.includes('500')) {
        errorMessage += ' 服务器内部错误或AI服务配置问题。';
      } else if (errorMsg.includes('404')) {
        errorMessage += ' API路由不存在请检查部署。';
      } else if (errorMsg.includes('401') || errorMsg.includes('403')) {
        errorMessage += ' 权限不足或API密钥无效。';
      }

      console.error('[WizardAI] AI generation failed:', errorMsg);
      toast.error(errorMessage);
    }

    setIsGeneratingBasicInfo(false);
  };

  const handleAIGenerateOutline = async () => {
    if (!formData.title || !formData.description) {
      toast.warning('请先填写标题和简介后再生成大纲');
      return;
    }

    setIsGeneratingOutline(true);

    const genreName = GENRES.find(g => g.id === formData.genre)?.name || formData.genre;
    const styleName = STYLES.find(s => s.id === formData.style)?.name || formData.style;

    const result = await apiPost('/series/generate-outline', {
      title: formData.title,
      description: formData.description,
      genre: genreName,
      style: styleName,
      episodeCount: formData.episodeCount,
      existingOutline: formData.storyOutline || '',
    }, {
      timeout: 200000,
      headers: userPhone ? { 'X-User-Phone': userPhone } : {},
    });

    if (result.success) {
      const aiData = result.data || result;

      if (aiData.outline) {
        setFormData(prev => ({ ...prev, storyOutline: aiData.outline }));

        const mode = formData.storyOutline ? '扩展完善' : '生成';
        const fallbackNote = (result as any).fallback ? ' (使用默认模板)' : '';
        toast.success(`AI${mode}大纲成功！${fallbackNote}已自动填充，请检查后继续。`);
      } else if (aiData.mainPlot && aiData.episodes) {
        const outlineText = `【故事主线】\n${aiData.mainPlot}\n\n${aiData.growthTheme ? `【成长主题】\n${aiData.growthTheme}\n\n` : ''}【分集大纲】\n${aiData.episodes.map((ep: any) => `第${ep.episodeNumber}集 - ${ep.title}\n${ep.synopsis}\n主题：${ep.theme || '未指定'}`).join('\n\n')}`;

        setFormData(prev => ({ ...prev, storyOutline: outlineText }));

        const mode = formData.storyOutline ? '扩展完善' : '生成';
        const fallbackNote = (result as any).fallback ? ' (使用默认模板)' : '';
        toast.success(`AI${mode}大纲成功！${fallbackNote}已填充${aiData.episodes.length}集大纲，请检查后继续。`);
      } else {
        console.error('[WizardAI] No outline in response:', aiData);
        toast.error('AI生成的内容格式异常，请重试或手动输入。');
      }
    } else {
      const errorMsg = result.error || '未知错误';
      if (errorMsg.includes('timeout') || errorMsg.includes('超时')) {
        toast.error('AI大纲生成超时，建议减少集数或简化描述后重试。');
      } else {
        toast.error('AI生成大纲失败：' + errorMsg);
      }
      console.error('[WizardAI] AI outline generation failed:', errorMsg);
    }

    setIsGeneratingOutline(false);
  };

  const handleAnalyze = async () => {
    if (!userPhone) {
      toast.error('请先登录');
      return;
    }

    setIsAnalyzing(true);

    try {
      const createResult = await services.createSeries(formData, userPhone);

      if (!createResult.success || !createResult.data) {
        const errMsg = createResult.error || '创建漫剧失败';
        if (errMsg.includes('Edge Function') || errMsg.includes('Failed to fetch') || errMsg.includes('未连接')) {
          toast.error('服务器暂时不可用，请稍后重试。如持续出现，请检查网络连接。');
        } else {
          toast.error(`创作失败：${errMsg}`);
        }
        setIsAnalyzing(false);
        return;
      }

      const newSeries = createResult.data;

      setIsAnalyzing(false);

      toast.success('漫剧创建成功！AI正在后台生成剧集和分镜，页面会自动更新。');

      onComplete(newSeries);
    } catch (error: any) {
      console.error('[WizardAI] Series creation failed:', error);

      let errorMessage = '创作失败';
      if (error.message) {
        if (error.message.includes('404')) {
          errorMessage = 'AI服务暂时不可用（错误代码：404）。请稍后重试或联系技术支持。';
        } else if (error.message.includes('timeout') || error.message.includes('超时')) {
          errorMessage = '请求超时，服务器响应时间过长。请检查网络连接后重试。';
        } else if (error.message.includes('Network') || error.message.includes('网络')) {
          errorMessage = '网络连接失败，请检查您的网络设置。';
        } else {
          errorMessage = `创作失败：${error.message}`;
        }
      }

      toast.error(errorMessage);
    } finally {
      setIsAnalyzing(false);
    }
  };

  return {
    isAnalyzing,
    isGeneratingBasicInfo,
    isGeneratingOutline,
    handleAIGenerate,
    handleAIGenerateOutline,
    handleAnalyze,
  };
}