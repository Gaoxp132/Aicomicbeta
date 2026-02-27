import { useState, useMemo, useCallback } from 'react';
import { Loader2, Download, Film, RefreshCw, AlertTriangle } from 'lucide-react';
import { Button } from '../ui';
import { VideoPlayer } from '../VideoPlayer';
import { PlaylistVideoPlayer } from '../PlaylistVideoPlayer';
import { toast } from 'sonner';
import { mergeEpisodeVideos, generateStoryboardVideo } from '../../services';
import { apiRequest } from '../../utils';
import type { Episode, Storyboard } from '../../types';
import { getAspectCssValue } from '../../utils';

/** v6.0.64: 合并结果诊断信息 */
interface MergeDiagnostics {
  failedScenes: number[];
  totalStoryboards: number;
  downloadedCount: number;
  mergedSegments?: number;
  mergeMethod?: string;
}

interface StoryboardVideoMergerProps {
  episode: Episode;
  storyboards: Storyboard[];
  seriesId: string;
  userPhone: string;
  aspectRatio?: string; // v6.0.82: 画面比例
  onMergeComplete?: (videoUrl: string) => void;
  /** v6.0.88: 分辨率自动修复后通知父组件更新分镜列表 */
  onStoryboardsUpdated?: (updates: Array<{ id: string; videoUrl: string }>) => void;
  /** Control what to render: 'button' = merge button only, 'player' = video player only, 'all' = both (default) */
  mode?: 'button' | 'player' | 'all';
  /** Externally controlled mergedVideoUrl (lifted state) */
  mergedVideoUrl?: string | null;
  /** Callback when mergedVideoUrl changes */
  onMergedVideoUrlChange?: (url: string | null) => void;
}

export function StoryboardVideoMerger({
  episode,
  storyboards,
  seriesId,
  userPhone,
  aspectRatio,
  onMergeComplete,
  onStoryboardsUpdated,
  mode = 'all',
  mergedVideoUrl: externalMergedVideoUrl,
  onMergedVideoUrlChange,
}: StoryboardVideoMergerProps) {
  // 支持外部控制和内部状态两种模式
  const [internalMergedVideoUrl, setInternalMergedVideoUrl] = useState<string | null>(episode.mergedVideoUrl || null);
  const mergedVideoUrl = externalMergedVideoUrl !== undefined ? externalMergedVideoUrl : internalMergedVideoUrl;
  const setMergedVideoUrl = (url: string | null) => {
    if (onMergedVideoUrlChange) {
      onMergedVideoUrlChange(url);
    } else {
      setInternalMergedVideoUrl(url);
    }
  };

  const [isMergingEpisode, setIsMergingEpisode] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);

  // v6.0.64: 合并诊断——记录失败场景以便精确提示
  const [mergeDiag, setMergeDiag] = useState<MergeDiagnostics | null>(null);

  // v6.0.88: 自动修复分辨率不一致的进度
  const [autoFixProgress, setAutoFixProgress] = useState<{
    status: 'idle' | 'regenerating' | 'remerging';
    total: number;
    current: number;
    currentScene?: number;
  } | null>(null);

  // v6.0.39: 直接下载已合并的MP4文件（无后端调用，merge-videos已保证merged_video_url始终为真实MP4）
  const handleDownloadMP4 = useCallback(async () => {
    if (isDownloading) return;
    if (!mergedVideoUrl || typeof mergedVideoUrl !== 'string') {
      toast.error('请先合并分镜视频');
      return;
    }

    const trimmed = mergedVideoUrl.trim();
    // v6.0.39: 兼容旧版playlist格式——提示用户重新合并
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
    } catch (error: any) {
      console.error('[StoryboardVideoMerger] Download MP4 error:', error);
      toast.error('下载失败：' + error.message, { id: toastId });
    } finally {
      setIsDownloading(false);
    }
  }, [mergedVideoUrl, episode.episodeNumber, isDownloading]);

  // 统计有视频的分镜数量
  const videoCounts = useMemo(() => {
    const total = storyboards.length;
    const withVideo = storyboards.filter(sb => {
      const url = sb.videoUrl || (sb as any).video_url || '';
      return url && typeof url === 'string' && url.trim().length > 0 && url.startsWith('http');
    }).length;
    return { total, withVideo, allReady: withVideo === total && total > 0 };
  }, [storyboards]);

  const hasVideosToMerge = videoCounts.withVideo > 0;

  // v6.0.39: 检测merged_video_url是否为旧版playlist（需重新合并为MP4）
  const isLegacyPlaylist = useMemo(() => {
    if (!mergedVideoUrl) return false;
    const trimmed = mergedVideoUrl.trim();
    return trimmed.startsWith('{') || trimmed.startsWith('[') || trimmed.endsWith('.json');
  }, [mergedVideoUrl]);

  // 合并视频为整集（v6.0.39: 后端始终产出真实MP4）
  const handleMergeEpisodeVideos = async () => {
    if (!hasVideosToMerge) {
      toast.error('没有可合并的视频！请先生成分镜视频。');
      return;
    }

    setIsMergingEpisode(true);
    setMergeDiag(null); // v6.0.64: 重新合并时清除旧诊断
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

        // v6.0.64: 保存诊断信息（无论是否有失败场景）
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
        // v6.0.88: 分辨率不一致时自动修复——forceRegenerate异常分镜 → 重新合并
        const d = result.data;
        if (d?.resolutionMismatch) {
          const scenes: number[] = d.mismatchedScenes || [];
          if (scenes.length === 0) {
            toast.error('检测到分辨率不一致但无法确定具体场景，请手动检查。');
            setIsMergingEpisode(false);
            return;
          }

          // 找到需要重新生成的分镜对象
          const mismatchedSbs = storyboards.filter(sb => scenes.includes(sb.sceneNumber));
          if (mismatchedSbs.length === 0) {
            toast.error(`分辨率不一致的场景(${scenes.join(',')})在当前分镜列表中未找到。`);
            setIsMergingEpisode(false);
            return;
          }

          console.log(`[StoryboardVideoMerger] 🔄 Auto-fix: ${mismatchedSbs.length} storyboards with resolution mismatch: scenes [${scenes.join(',')}]`);
          const toastId = toast.loading(
            `检测到 ${mismatchedSbs.length} 个分镜分辨率不一致，正在自动修复...`,
            { duration: Infinity }
          );

          setAutoFixProgress({ status: 'regenerating', total: mismatchedSbs.length, current: 0 });

          let fixedCount = 0;
          let failedFix: number[] = [];
          const fixedUpdates: Array<{ id: string; videoUrl: string }> = []; // v6.0.88: 收集新URL用于通知父组件

          for (let i = 0; i < mismatchedSbs.length; i++) {
            const sb = mismatchedSbs[i];
            setAutoFixProgress({ status: 'regenerating', total: mismatchedSbs.length, current: i + 1, currentScene: sb.sceneNumber });
            toast.loading(
              `正在重新生成场景${sb.sceneNumber}的视频 (${i + 1}/${mismatchedSbs.length})...`,
              { id: toastId }
            );

            try {
              // v6.0.95: 自动修复时同样支持重试一次（Volcengine偶发失败可通过重试恢复）
              let newVideoUrl: string | null = null;
              let lastFixErr: any = null;
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
                    seriesId, userPhone, sb, episode.episodeNumber, undefined, true // forceRegenerate
                  );
                  lastFixErr = null;
                  break; // success
                } catch (err: any) {
                  lastFixErr = err;
                  // 不重试超时（任务可能仍在后台处理中）
                  if (err.message?.includes('视频仍在生成中')) break;
                }
              }
              if (!newVideoUrl) throw lastFixErr;

              // 写回DB——确保merge-videos能读到新的video_url
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
              fixedUpdates.push({ id: sb.id, videoUrl: newVideoUrl }); // v6.0.88: 记录新URL
              console.log(`[StoryboardVideoMerger] ✅ Scene ${sb.sceneNumber} regenerated: ${newVideoUrl.substring(0, 60)}...`);
            } catch (err: any) {
              console.error(`[StoryboardVideoMerger] ❌ Scene ${sb.sceneNumber} regeneration failed:`, err.message);
              failedFix.push(sb.sceneNumber);
            }
          }

          // v6.0.93: 即使部分场景重新生成失败，只要有成功的就尝试重新合并
          // 以前的逻辑：任何失败就直接中止。新逻辑：有成功的就继续合并，失败的场景会被跳过
          if (fixedCount === 0) {
            // 全部失败——无法继续
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
            // 部分失败——继续合并，但告知用户
            toast.loading(
              `${fixedCount} 个分镜已修复（${failedFix.length} 个失败），正在合并成功的分镜...`,
              { id: toastId }
            );
            console.warn(`[StoryboardVideoMerger] Partial fix: ${fixedCount} ok, ${failedFix.length} failed [${failedFix.join(',')}], attempting merge anyway`);
          }

          // 全部修复成功，自动重新合并
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

            // v6.0.88: 通知父组件更新分镜列表（传递新的videoUrl）
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
        } else {
          toast.error('视频合并失败：' + (result.error || '未知错误'));
        }
      }
    } catch (error: any) {
      console.error('[StoryboardVideoMerger] Failed to merge episode:', error);
      toast.error('视频合并失败：' + error.message);
      setAutoFixProgress(null);
    } finally {
      setIsMergingEpisode(false);
    }
  };

  const showButton = mode === 'button' || mode === 'all';
  const showPlayer = mode === 'player' || mode === 'all';
  const isRemerge = !!mergedVideoUrl;

  // v6.0.39: 判断当前merged_video_url是否为真实MP4（非playlist）
  const isRealMP4 = mergedVideoUrl && !isLegacyPlaylist && mergedVideoUrl.trim().startsWith('http');

  return (
    <>
      {/* 合并按钮——始终显示（已合并时显示"重新合并"） */}
      {showButton && hasVideosToMerge && (
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            onClick={handleMergeEpisodeVideos}
            disabled={isMergingEpisode}
            className={isRemerge
              ? "bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 disabled:opacity-50"
              : "bg-gradient-to-r from-green-500 to-lime-500 hover:from-green-600 hover:to-lime-600 disabled:opacity-50"
            }
          >
            {isMergingEpisode ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                合并中...
              </>
            ) : isRemerge ? (
              <>
                <RefreshCw className="w-4 h-4 mr-2" />
                重新合并
              </>
            ) : (
              <>
                <Download className="w-4 h-4 mr-2" />
                合并分镜视频
              </>
            )}
          </Button>
          {/* 分镜统计 */}
          <span className="text-xs text-gray-400">
            {videoCounts.withVideo}/{videoCounts.total} 个分镜已就绪
            {isLegacyPlaylist && (
              <span className="text-yellow-400 ml-1">· 旧格式，建议重新合并</span>
            )}
          </span>
        </div>
      )}

      {/* v6.0.99 本地合并 ClientVideoMerger 已移至 StoryboardEditor 自动合并流程，此处不再显示 */}

      {/* v6.0.88: 自动修复分辨率进度条 */}
      {autoFixProgress && (
        <div className="mt-2 p-3 rounded-xl bg-blue-500/10 border border-blue-500/30">
          <div className="flex items-center gap-2 mb-2">
            <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />
            <span className="text-sm text-blue-300 font-medium">
              {autoFixProgress.status === 'regenerating'
                ? `正在修复分辨率不一致的分镜 (${autoFixProgress.current}/${autoFixProgress.total})`
                : '修复完成，正在重新合并视频...'
              }
            </span>
          </div>
          {autoFixProgress.currentScene && autoFixProgress.status === 'regenerating' && (
            <p className="text-xs text-blue-400/70 mb-2">
              当前: 场景{autoFixProgress.currentScene} — 重新生成视频中（每个分镜约需1-3分钟）
            </p>
          )}
          <div className="w-full bg-blue-900/30 rounded-full h-1.5">
            <div
              className="bg-gradient-to-r from-blue-500 to-cyan-400 h-1.5 rounded-full transition-all duration-500"
              style={{ width: `${autoFixProgress.total > 0 ? Math.round((autoFixProgress.current / autoFixProgress.total) * 100) : 0}%` }}
            />
          </div>
        </div>
      )}

      {/* v6.0.64: 合并诊断面板——精确显示缺失分镜 + 一键重试 */}
      {mergeDiag && mergeDiag.failedScenes.length > 0 && !isMergingEpisode && (
        <div className={`mt-2 p-3 rounded-xl flex items-start gap-2.5 ${
          mergeDiag.mergeMethod === 'resolution_mismatch'
            ? 'bg-red-500/10 border border-red-500/30'
            : 'bg-amber-500/10 border border-amber-500/30'
        }`}>
          <AlertTriangle className={`w-4 h-4 shrink-0 mt-0.5 ${
            mergeDiag.mergeMethod === 'resolution_mismatch' ? 'text-red-400' : 'text-amber-400'
          }`} />
          <div className="flex-1 min-w-0">
            {mergeDiag.mergeMethod === 'resolution_mismatch' ? (
              <>
                <p className="text-sm text-red-300 font-medium">
                  视频分辨率不一致，无法合并
                </p>
                <p className="text-xs text-red-400/70 mt-1">
                  场景 {mergeDiag.failedScenes.map(s => `第${s}幕`).join('、')} 的分辨率与其他分镜不同。
                  请重新生成这些分镜的视频（会自动统一为720p），然后再次合并。
                </p>
              </>
            ) : (
              <>
                <p className="text-sm text-amber-300 font-medium">
                  {mergeDiag.failedScenes.length} 个分镜下载失败，未包含在合并视频中
                </p>
                <p className="text-xs text-amber-400/70 mt-1">
                  缺失场景: {mergeDiag.failedScenes.map(s => `第${s}幕`).join('、')}
                  <span className="text-gray-500 ml-2">
                    ({mergeDiag.downloadedCount}/{mergeDiag.totalStoryboards} 个分镜成功下载
                    {mergeDiag.mergedSegments != null && mergeDiag.mergedSegments !== mergeDiag.downloadedCount
                      ? `，${mergeDiag.mergedSegments} 个实际拼接` : ''})
                  </span>
                </p>
                <Button
                  onClick={handleMergeEpisodeVideos}
                  disabled={isMergingEpisode}
                  size="sm"
                  className="mt-2 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 h-7 text-xs px-3"
                >
                  <RefreshCw className="w-3 h-3 mr-1.5" />
                  重新合并（重试下载失败的分镜）
                </Button>
              </>
            )}
          </div>
        </div>
      )}

      {/* 合并后的完整剧集视频展示 */}
      {showPlayer && mergedVideoUrl && typeof mergedVideoUrl === 'string' && mergedVideoUrl.trim() && (() => {
        return (
          <div className="bg-white/5 backdrop-blur-xl rounded-2xl p-4 sm:p-6 border border-white/10 mb-6">
            <h3 className="text-base sm:text-lg font-bold text-white mb-3 sm:mb-4 flex items-center gap-2">
              <Film className="w-5 h-5 text-purple-400" />
              完整剧集视频
              {isRealMP4 && (
                <span className="text-xs bg-green-500/20 text-green-400 px-2 py-0.5 rounded-full">
                  MP4
                </span>
              )}
              {isLegacyPlaylist && (
                <span className="text-xs bg-yellow-500/20 text-yellow-400 px-2 py-0.5 rounded-full">
                  旧格式·建议重新合并
                </span>
              )}
              <span className="text-xs text-gray-500 font-normal ml-auto flex items-center gap-2">
                {videoCounts.withVideo} 个分镜
              </span>
            </h3>
            {isLegacyPlaylist ? (
              <PlaylistVideoPlayer
                playlistUrl={mergedVideoUrl}
                className="w-full rounded-lg"
                style={{ aspectRatio: getAspectCssValue(aspectRatio) }}
              />
            ) : (
              <VideoPlayer
                src={mergedVideoUrl}
                className="w-full rounded-lg bg-black"
                controls
                preload="metadata"
                style={{ aspectRatio: getAspectCssValue(aspectRatio) }}
              />
            )}
            {/* v6.0.39: 下载按钮——直接下载已合并的MP4（零后端调用） */}
            <div className="mt-3 flex items-center gap-3">
              <Button
                onClick={handleDownloadMP4}
                disabled={isDownloading || isLegacyPlaylist}
                variant="outline"
                className="border-purple-500/40 text-purple-300 hover:bg-purple-500/10 hover:text-purple-200 disabled:opacity-50"
              >
                {isDownloading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    下载中...
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4 mr-2" />
                    下载MP4
                  </>
                )}
              </Button>
              <span className="text-xs text-gray-500">
                {isLegacyPlaylist
                  ? '请先点击"重新合并"生成MP4后下载'
                  : '下载完整MP4视频文件'
                }
              </span>
            </div>
          </div>
        );
      })()}
    </>
  );
}