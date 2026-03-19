/**
 * useEpisodeMerge.ts — Hook encapsulating server-side episode merge + auto-fix logic
 * Extracted from StoryboardVideoMerger.tsx
 */
import { useState, useMemo, useCallback } from 'react';
import { toast } from 'sonner';
import { mergeEpisodeVideos, generateStoryboardVideo } from '../../services';
import { apiRequest } from '../../utils';
import { sbVideoUrl } from '../../utils';
import type { Episode, Storyboard } from '../../types';
import { isPollingTimeoutError } from '../../services/volcengine';

import { getErrorMessage } from '../../utils';
import { clientMergeEpisode } from './clientMergeLogic';

/** Merge diagnostics */
export interface MergeDiagnostics {
  failedScenes: number[];
  totalStoryboards: number;
  downloadedCount: number;
  mergedSegments?: number;
  mergeMethod?: string;
}

export interface AutoFixProgress {
  status: 'idle' | 'regenerating' | 'remerging';
  total: number;
  current: number;
  currentScene?: number;
}

interface UseEpisodeMergeOpts {
  episode: Episode;
  storyboards: Storyboard[];
  seriesId: string;
  userPhone: string;
  mergedVideoUrl: string | null;
  setMergedVideoUrl: (url: string | null) => void;
  onMergeComplete?: (videoUrl: string) => void;
  onStoryboardsUpdated?: (updates: Array<{ id: string; videoUrl: string }>) => void;
}

export function useEpisodeMerge({
  episode,
  storyboards,
  seriesId,
  userPhone,
  mergedVideoUrl,
  setMergedVideoUrl,
  onMergeComplete,
  onStoryboardsUpdated,
}: UseEpisodeMergeOpts) {
  const [isMergingEpisode, setIsMergingEpisode] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [mergeDiag, setMergeDiag] = useState<MergeDiagnostics | null>(null);
  const [autoFixProgress, setAutoFixProgress] = useState<AutoFixProgress | null>(null);

  const videoCounts = useMemo(() => {
    const total = storyboards.length;
    const withVideo = storyboards.filter(sb => {
      const url = sbVideoUrl(sb);
      return url.length > 0 && url.startsWith('http');
    }).length;
    return { total, withVideo, allReady: withVideo === total && total > 0 };
  }, [storyboards]);

  const hasVideosToMerge = videoCounts.withVideo > 0;

  const isLegacyPlaylist = useMemo(() => {
    if (!mergedVideoUrl) return false;
    const trimmed = mergedVideoUrl.trim();
    return trimmed.startsWith('{') || trimmed.startsWith('[') || trimmed.endsWith('.json');
  }, [mergedVideoUrl]);

  const handleDownloadMP4 = useCallback(async () => {
    if (isDownloading) return;
    if (!mergedVideoUrl || typeof mergedVideoUrl !== 'string') {
      toast.error('请先合并分镜视频');
      return;
    }

    const trimmed = mergedVideoUrl.trim();
    if (trimmed.startsWith('{') || trimmed.startsWith('[') || trimmed.endsWith('.json')) {
      toast.info('当前为旧版播放列表格式，请点击"重新合并"生成完整MP4文件后再下载');
      return;
    }

    if (!trimmed.startsWith('http')) {
      toast.error('视频地址无效，请重新合并');
      return;
    }

    setIsDownloading(true);
    const toastId = toast.loading('正在下载视频文件...');

    try {
      const resp = await fetch(trimmed);
      if (!resp.ok) throw new Error(`下载失败: HTTP ${resp.status}`);

      const blob = await resp.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = `第${episode.episodeNumber || 1}集-完整视频.mp4`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);

      const sizeMB = (blob.size / 1024 / 1024).toFixed(1);
      toast.success(`下载完成！(${sizeMB}MB)`, { id: toastId });
    } catch (error: unknown) {
      console.error('[StoryboardVideoMerger] Download MP4 error:', error);
      toast.error('下载失败：' + getErrorMessage(error), { id: toastId });
    } finally {
      setIsDownloading(false);
    }
  }, [mergedVideoUrl, episode.episodeNumber, isDownloading]);

  const handleMergeEpisodeVideos = async () => {
    if (!hasVideosToMerge) {
      toast.error('没有可合并的视频！请先生成分镜视频。');
      return;
    }

    setIsMergingEpisode(true);
    setMergeDiag(null);
    setAutoFixProgress(null);
    
    try {
      toast.info(`正在合并 ${videoCounts.withVideo} 个分镜视频为完整MP4...`);
      
      const result = await mergeEpisodeVideos(seriesId, episode.id, userPhone);
      
      if (result.success && result.videoUrl) {
        const d = result.data;
        const totalVideos = d?.totalVideos || videoCounts.withVideo;
        const method = d?.mergeMethod || 'mp4';
        const fileSize = d?.fileSize;
        const sizeMB = fileSize ? `${(fileSize / 1024 / 1024).toFixed(1)}MB` : '';
        const methodLabel = method.includes('fallback') ? '(单段兜底)' : '(完整合并)';
        const failed: number[] = d?.failedScenes || [];

        setMergeDiag({
          failedScenes: failed,
          totalStoryboards: d?.totalStoryboards || videoCounts.total,
          downloadedCount: d?.downloadedCount || totalVideos,
          mergedSegments: d?.mergedSegments,
          mergeMethod: method,
        });

        if (failed.length > 0) {
          toast.warning(
            `合并完成但有 ${failed.length} 个分镜缺失！缺失场景: ${failed.join(', ')}。点击\"重新合并\"可重试。`,
            { duration: 8000 }
          );
        } else {
          toast.success(`${totalVideos} 个分镜合并成功！${methodLabel} ${sizeMB}`);
        }
        setMergedVideoUrl(result.videoUrl);
        onMergeComplete?.(result.videoUrl);
      } else {
        // v6.0.88: Auto-fix resolution mismatch
        const d = result.data;
        if (d?.resolutionMismatch) {
          const scenes: number[] = d.mismatchedScenes || [];
          if (scenes.length === 0) {
            toast.error('检测到分辨率不一致但无法确定具体场景，请手动检查。');
            setIsMergingEpisode(false);
            return;
          }

          const mismatchedSbs = storyboards.filter(sb => scenes.includes(sb.sceneNumber));
          if (mismatchedSbs.length === 0) {
            toast.error(`分辨率不一致的场景(${scenes.join(',')})在当前分镜列表中未找到。`);
            setIsMergingEpisode(false);
            return;
          }

          console.log(`[StoryboardVideoMerger] Auto-fix: ${mismatchedSbs.length} storyboards with resolution mismatch: scenes [${scenes.join(',')}]`);
          const toastId = toast.loading(
            `检测到 ${mismatchedSbs.length} 个分镜分辨率不一致，正在自动修复...`,
            { duration: Infinity }
          );

          setAutoFixProgress({ status: 'regenerating', total: mismatchedSbs.length, current: 0 });

          let fixedCount = 0;
          let failedFix: number[] = [];
          const fixedUpdates: Array<{ id: string; videoUrl: string }> = [];

          for (let i = 0; i < mismatchedSbs.length; i++) {
            const sb = mismatchedSbs[i];
            setAutoFixProgress({ status: 'regenerating', total: mismatchedSbs.length, current: i + 1, currentScene: sb.sceneNumber });
            toast.loading(
              `正在重新生成场景${sb.sceneNumber}的视频 (${i + 1}/${mismatchedSbs.length})...`,
              { id: toastId }
            );

            try {
              let newVideoUrl: string | null = null;
              let lastFixErr: unknown = null;
              for (let fixAttempt = 0; fixAttempt < 2; fixAttempt++) {
                if (fixAttempt > 0) {
                  console.log(`[StoryboardVideoMerger] Retrying scene ${sb.sceneNumber} regeneration (attempt ${fixAttempt + 1}/2)...`);
                  toast.loading(
                    `场景${sb.sceneNumber}重新生成失败，10秒后重试 (${i + 1}/${mismatchedSbs.length})...`,
                    { id: toastId }
                  );
                  await new Promise(r => setTimeout(r, 10000));
                }
                try {
                  newVideoUrl = await generateStoryboardVideo(
                    seriesId, userPhone, sb, episode.episodeNumber, undefined, true
                  );
                  lastFixErr = null;
                  break;
                } catch (err: unknown) {
                  lastFixErr = err;
                  // v6.0.183: 使用 PollingTimeoutError 类型判断替代字符串匹配
                  if (isPollingTimeoutError(err)) break;
                }
              }
              if (!newVideoUrl) throw lastFixErr;

              await apiRequest(`/series/${seriesId}/storyboards/${sb.id}`, {
                method: 'PATCH',
                body: JSON.stringify({
                  videoUrl: newVideoUrl,
                  status: 'completed',
                  episodeNumber: episode.episodeNumber,
                  sceneNumber: sb.sceneNumber,
                }),
              });

              fixedCount++;
              fixedUpdates.push({ id: sb.id, videoUrl: newVideoUrl });
              console.log(`[StoryboardVideoMerger] Scene ${sb.sceneNumber} regenerated: ${newVideoUrl.substring(0, 60)}...`);
            } catch (err: unknown) {
              console.error(`[StoryboardVideoMerger] Scene ${sb.sceneNumber} regeneration failed:`, getErrorMessage(err));
              failedFix.push(sb.sceneNumber);
            }
          }

          if (fixedCount === 0) {
            toast.error(
              `所有 ${mismatchedSbs.length} 个分镜重新生成均失败，请稍后重试合并。`,
              { id: toastId, duration: 8000 }
            );
            setAutoFixProgress(null);
            setMergeDiag({
              failedScenes: failedFix,
              totalStoryboards: videoCounts.total,
              downloadedCount: 0,
              mergeMethod: 'autofix_all_fail',
            });
            setIsMergingEpisode(false);
            return;
          }

          if (failedFix.length > 0) {
            toast.loading(
              `${fixedCount} 个分镜已修复（${failedFix.length} 个失败），正在合并成功的分镜...`,
              { id: toastId }
            );
            console.warn(`[StoryboardVideoMerger] Partial fix: ${fixedCount} ok, ${failedFix.length} failed [${failedFix.join(',')}], attempting merge anyway`);
          }

          setAutoFixProgress({ status: 'remerging', total: mismatchedSbs.length, current: mismatchedSbs.length });
          toast.loading(
            `${fixedCount} 个分镜已修复，正在重新合并...`,
            { id: toastId }
          );

          const retryResult = await mergeEpisodeVideos(seriesId, episode.id, userPhone);

          if (retryResult.success && retryResult.videoUrl) {
            const rd = retryResult.data;
            const totalVideos = rd?.totalVideos || videoCounts.withVideo;
            const fileSize = rd?.fileSize;
            const sizeMB = fileSize ? `${(fileSize / 1024 / 1024).toFixed(1)}MB` : '';

            setMergeDiag({
              failedScenes: rd?.failedScenes || [],
              totalStoryboards: rd?.totalStoryboards || videoCounts.total,
              downloadedCount: rd?.downloadedCount || totalVideos,
              mergedSegments: rd?.mergedSegments,
              mergeMethod: rd?.mergeMethod || 'mp4',
            });

            toast.success(
              `自动修复完成！${fixedCount} 个分镜已修正，${totalVideos} 个分镜合并成功${sizeMB ? ` (${sizeMB})` : ''}`,
              { id: toastId, duration: 6000 }
            );
            setMergedVideoUrl(retryResult.videoUrl);
            onMergeComplete?.(retryResult.videoUrl);

            if (onStoryboardsUpdated && fixedUpdates.length > 0) {
              onStoryboardsUpdated(fixedUpdates);
            }
          } else {
            toast.error(
              `分镜已修复但合并仍然失败：${retryResult.error || '未知错误'}`,
              { id: toastId, duration: 8000 }
            );
          }

          setAutoFixProgress(null);
        } else if (d?.useClientMerge) {
          // v6.0.205: 服务端超段数限制时，自动回退到本地合并
          console.log(`[EpisodeMerge] Server returned useClientMerge, falling back to client-side merge (${videoCounts.withVideo} segments)...`);
          toast.info('分镜较多，正在使用本地合并...', { duration: 3000 });
          try {
            const { blobUrl, sizeMB, warnings } = await clientMergeEpisode(
              episode,
              storyboards,
              undefined,
              { seriesId }
            );
            if (warnings?.length) {
              toast.warning(`本地合并完成但有警告：\n${warnings.join('\n')}`, { duration: 8000 });
            } else {
              toast.success(`${videoCounts.withVideo} 个分镜本地合并成功！(${sizeMB}MB)`);
            }
            setMergedVideoUrl(blobUrl);
            onMergeComplete?.(blobUrl);
          } catch (clientErr: unknown) {
            console.error('[EpisodeMerge] Client merge also failed:', clientErr);
            toast.error('本地合并也失败了：' + getErrorMessage(clientErr));
          }
        } else {
          toast.error('视频合并失败：' + (result.error || '未知错误'));
        }
      }
    } catch (error: unknown) {
      console.error('[StoryboardVideoMerger] Failed to merge episode:', error);
      toast.error('视频合并失败：' + getErrorMessage(error));
      setAutoFixProgress(null);
    } finally {
      setIsMergingEpisode(false);
    }
  };

  return {
    isMergingEpisode,
    isDownloading,
    mergeDiag,
    autoFixProgress,
    videoCounts,
    hasVideosToMerge,
    isLegacyPlaylist,
    handleDownloadMP4,
    handleMergeEpisodeVideos,
  };
}