/**
 * useEpisodeActions — Episode-level CRUD, AI generation, merge, repair, sync
 * Extracted from hooks.ts (v6.0.88) to keep files under 500 lines
 * v6.0.92: handleSmartGenerate 添加基于定时器的分阶段进度消息（7阶段/5s~270s）
 * v6.0.107: handleMergeVideos 对 skippedEpisodes 自动触发本地合并
 *           merge-all-videos 返回 skippedEpisodes:number[] 时，逐集调用 clientMergeEpisode
 *           本地合并成功 → 自动触发浏览器下载；失败 → 计入 totalFailed 并记录 console.error
 */

import { useState, useCallback } from 'react';
import { toast } from 'sonner';
import type { Series, Episode } from '../../types';
import * as services from '../../services';
import { apiPost, apiRequest, ASPECT_TO_RESOLUTION } from '../../utils';
import { clientMergeEpisode } from './ClientVideoMerger';
import { getErrorMessage } from '../../utils';

// ── 钩子参数类型 ─────────────────────────────────────────────────────────

interface UseEpisodeActionsOptions {
  series: Series;
  episodes: Episode[];
  userPhone?: string;
  onEpisodesUpdate: (episodes: Episode[]) => void;
  onSeriesUpdate?: (series: Series) => void; // v6.0.143: 用于 handleSmartGenerate 设置 status='generating'
}

// ── 7阶段进度提示（v6.0.92）────────────────────────────────────────────

const SMART_GENERATE_PHASES: [number, string][] = [
  [5_000,   '正在分析故事结构...'],
  [18_000,  '正在构建角色体系...'],
  [40_000,  '正在生成分集大纲...'],
  [80_000,  '正在创作分镜脚本...'],
  [140_000, '正在润色对白台词...'],
  [210_000, '正在完善视觉描述...'],
  [270_000, '即将完成，最后润色...'],
];

// ════════════════════════════════════════════════════════════════════════
// useEpisodeActions
// ════════════════════════════════════════════════════════════════════════

export function useEpisodeActions({
  series,
  episodes,
  userPhone,
  onEpisodesUpdate,
  onSeriesUpdate,
}: UseEpisodeActionsOptions) {
  const [isSmartGenerating, setIsSmartGenerating] = useState(false);
  const [smartProgress, setSmartProgress] = useState('');
  const [isMerging, setIsMerging] = useState(false);
  const [isSyncingThumbnails, setIsSyncingThumbnails] = useState(false);

  // ── handleAddEpisode ──────────────────────────────────────────────────

  const handleAddEpisode = useCallback(async () => {
    if (!userPhone) {
      toast.error('请先登录后添加剧集');
      return;
    }

    const nextEpisodeNumber = episodes.length + 1;

    const result = await apiPost(`/series/${series.id}/episodes`, {
      episodeNumber: nextEpisodeNumber,
      title: `第${nextEpisodeNumber}集`,
      synopsis: '',
      userPhone,
    });

    if (result.success && result.data) {
      const newEpisode = result.data as Episode;
      onEpisodesUpdate([...episodes, newEpisode]);
      toast.success(`第${nextEpisodeNumber}集已添加`);
    } else {
      toast.error('添加剧集失败：' + (result.error || '未知错误'));
    }
  }, [series.id, episodes, userPhone, onEpisodesUpdate]);

  // ── handleSmartGenerate ───────────────────────────────────────────────
  // v6.0.92: 添加基于定时器的分阶段进度消息，全程 AI 生成过程有中文进度反馈

  const handleSmartGenerate = useCallback(async () => {
    if (!userPhone) {
      toast.error('请先登录后生成');
      return;
    }

    setIsSmartGenerating(true);
    setSmartProgress('正在启动 AI 创作引擎...');

    // 7 阶段定时器进度反馈（v6.0.92）
    const phaseTimers: ReturnType<typeof setTimeout>[] = [];
    SMART_GENERATE_PHASES.forEach(([delay, msg]) => {
      phaseTimers.push(setTimeout(() => setSmartProgress(msg), delay));
    });

    try {
      const result = await services.generateFullAI(
        series.id,
        userPhone,
        (status) => setSmartProgress(status),
      );

      if (result.success) {
        // v6.0.143: generateFullAI 现在是 fire-and-forget，立即返回 success
        // 不需要在这里刷新数据 — SeriesEditor 的轮询机制会检测 status 变化并自动更新 episodes
        toast.success('AI 创作已启动！请等待轮询自动检测完成。预计需要 2-5 分钟。');
        if (onSeriesUpdate) {
          onSeriesUpdate({ ...series, status: 'generating' });
        }
      } else {
        toast.error('AI 创作失败：' + (result.error || '未知错误'));
      }
    } catch (error: unknown) {
      const errMsg = getErrorMessage(error);
      console.error('[EpisodeActions] handleSmartGenerate error:', errMsg);
      toast.error('AI 创作失败：' + errMsg);
    } finally {
      phaseTimers.forEach(clearTimeout);
      setIsSmartGenerating(false);
      setSmartProgress('');
    }
  }, [series.id, userPhone, onEpisodesUpdate, onSeriesUpdate]);

  // ── handleMergeVideos ─────────────────────────────────────────────────
  // v6.0.107: 服务器返回 skippedEpisodes 时，对每集自动触发 clientMergeEpisode 本地合并

  const handleMergeVideos = useCallback(async () => {
    if (!userPhone) {
      toast.error('请先登录后合并视频');
      return;
    }

    // v6.0.111: 计算 preferredResolution
    const seriesAspectRatio = series.coherenceCheck?.aspectRatio || '9:16';
    const preferredResolution = ASPECT_TO_RESOLUTION[seriesAspectRatio];

    setIsMerging(true);
    try {
      const result = await services.mergeAllSeriesVideos(series.id, userPhone);

      if (result.success) {
        const skipped = result.skippedEpisodes || [];

        // v6.0.107: 对 skippedEpisodes 自动触发本地合并
        let clientMergedCount = 0;
        if (skipped.length > 0) {
          console.log(
            `[EpisodeManager] ${skipped.length} episodes skipped by server, starting client merge: [${skipped.join(',')}]`,
          );
          toast.info(`${skipped.length} 集分镜较多，正在本地合并...`, { duration: 5000 });

          for (const epNum of skipped) {
            const ep = episodes.find(e => e.episodeNumber === epNum);
            if (!ep || !ep.storyboards?.length) {
              console.warn(`[EpisodeManager] Skipped ep${epNum}: no storyboards found`);
              continue;
            }
            try {
              const { blobUrl, sizeMB, warnings } = await clientMergeEpisode(ep, ep.storyboards, undefined, { preferredResolution, seriesId: series.id });
              // v6.0.110: 显示合并警告（跳过的场景、分辨率排除）
              if (warnings?.length) {
                warnings.forEach(w => toast.warning(`第${epNum}集: ${w}`, { duration: 8000 }));
              }
              // 本地合并产出 blobUrl，触发自动下载
              const a = document.createElement('a');
              a.href = blobUrl;
              a.download = `${series.title || '作品'}-第${epNum}集.mp4`;
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
              clientMergedCount++;
              console.log(`[EpisodeManager] ✅ Client merge ep${epNum}: ${sizeMB}MB`);
            } catch (clientErr: unknown) {
              console.error(
                `[EpisodeManager] ❌ Client merge ep${epNum} failed:`,
                getErrorMessage(clientErr),
              );
            }
          }
        }

        const serverMerged = result.mergedCount || 0;
        const totalMerged = serverMerged + clientMergedCount;
        const totalFailed = (result.failedCount || 0) + (skipped.length - clientMergedCount);

        if (totalFailed > 0 && result.errors?.length) {
          toast.warning(
            `合并部分完成：服务器 ${serverMerged} 集 + 本地 ${clientMergedCount} 集，失败 ${totalFailed} 集。\n${result.errors.slice(0, 3).join('；')}`,
            { duration: 10000 },
          );
        } else {
          toast.success(
            `视频合并完成！成功: ${totalMerged}${clientMergedCount > 0 ? ` (本地${clientMergedCount})` : ''}`,
          );
        }
        window.location.reload();
      } else {
        toast.error('视频合并失败：' + (result.error || '未知错误'));
      }
    } catch (error: unknown) {
      const errMsg = getErrorMessage(error);
      console.error('[EpisodeManager] Merge videos error:', errMsg);
      toast.error('视频合并失败：' + errMsg);
    } finally {
      setIsMerging(false);
    }
  }, [series.id, series.title, episodes, userPhone, series.coherenceCheck]);

  // ── handleRepairSingleEpisode ─────────────────────────────────────────

  const handleRepairSingleEpisode = useCallback(async (episodeId: string) => {
    if (!userPhone) {
      toast.error('请先登录后修复视频');
      return;
    }

    toast.info('正在修复视频...');
    try {
      const result = await services.repairEpisodeVideo(episodeId, userPhone);
      if (result.success) {
        toast.success('视频修复完成！');
        const refreshResult = await services.getSeries(series.id);
        if (refreshResult.success && refreshResult.data?.episodes) {
          onEpisodesUpdate(refreshResult.data.episodes as Episode[]);
        }
      } else {
        toast.error('视频修复失败：' + (result.error || '未知错误'));
      }
    } catch (error: unknown) {
      const errMsg = getErrorMessage(error);
      console.error('[EpisodeActions] Repair error:', errMsg);
      toast.error('视频修复失败：' + errMsg);
    }
  }, [series.id, userPhone, onEpisodesUpdate]);

  // ── handleSyncThumbnails ──────────────────────────────────────────────

  const handleSyncThumbnails = useCallback(async () => {
    setIsSyncingThumbnails(true);
    try {
      const result = await services.syncThumbnails(series.id);
      if (result.success) {
        const synced = result.synced || 0;
        const sbSynced = result.storyboardsSynced || 0;
        toast.success(`缩略图同步完成！剧集: ${synced}，分镜: ${sbSynced}`);
        const refreshResult = await services.getSeries(series.id);
        if (refreshResult.success && refreshResult.data?.episodes) {
          onEpisodesUpdate(refreshResult.data.episodes as Episode[]);
        }
      } else {
        toast.error('缩略图同步失败：' + (result.error || '未知错误'));
      }
    } catch (error: unknown) {
      const errMsg = getErrorMessage(error);
      console.error('[EpisodeActions] Sync thumbnails error:', errMsg);
      toast.error('缩略图同步失败：' + errMsg);
    } finally {
      setIsSyncingThumbnails(false);
    }
  }, [series.id, onEpisodesUpdate]);

  // ── 返回值 ────────────────────────────────────────────────────────────

  return {
    isSmartGenerating,
    smartProgress,
    isMerging,
    isSyncingThumbnails,
    handleAddEpisode,
    handleSmartGenerate,
    handleMergeVideos,
    handleRepairSingleEpisode,
    handleSyncThumbnails,
  };
}