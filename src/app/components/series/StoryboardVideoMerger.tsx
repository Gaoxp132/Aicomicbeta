import { useState } from 'react';
import { Loader2, Download, Film, RefreshCw, AlertTriangle } from 'lucide-react';
import { Button } from '../ui';
import { VideoPlayer } from '../VideoPlayer';
import { PlaylistVideoPlayer } from '../PlaylistVideoPlayer';
import type { Episode, Storyboard } from '../../types';
import { getAspectCssValue } from '../../utils';
import { useEpisodeMerge } from './useEpisodeMerge';

interface StoryboardVideoMergerProps {
  episode: Episode;
  storyboards: Storyboard[];
  seriesId: string;
  userPhone: string;
  aspectRatio?: string;
  onMergeComplete?: (videoUrl: string) => void;
  onStoryboardsUpdated?: (updates: Array<{ id: string; videoUrl: string }>) => void;
  mode?: 'button' | 'player' | 'all';
  mergedVideoUrl?: string | null;
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
  const [internalMergedVideoUrl, setInternalMergedVideoUrl] = useState<string | null>(episode.mergedVideoUrl || null);
  const mergedVideoUrl = externalMergedVideoUrl !== undefined ? externalMergedVideoUrl : internalMergedVideoUrl;
  const setMergedVideoUrl = (url: string | null) => {
    if (onMergedVideoUrlChange) {
      onMergedVideoUrlChange(url);
    } else {
      setInternalMergedVideoUrl(url);
    }
  };

  const {
    isMergingEpisode,
    isDownloading,
    mergeDiag,
    autoFixProgress,
    videoCounts,
    hasVideosToMerge,
    isLegacyPlaylist,
    handleDownloadMP4,
    handleMergeEpisodeVideos,
  } = useEpisodeMerge({
    episode,
    storyboards,
    seriesId,
    userPhone,
    mergedVideoUrl,
    setMergedVideoUrl,
    onMergeComplete,
    onStoryboardsUpdated,
  });

  const showButton = mode === 'button' || mode === 'all';
  const showPlayer = mode === 'player' || mode === 'all';
  const isRemerge = !!mergedVideoUrl;
  const isRealMP4 = mergedVideoUrl && !isLegacyPlaylist && mergedVideoUrl.trim().startsWith('http');

  return (
    <>
      {/* Merge button */}
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
          <span className="text-xs text-gray-400">
            {videoCounts.withVideo}/{videoCounts.total} 个分镜已就绪
            {isLegacyPlaylist && (
              <span className="text-yellow-400 ml-1">· 旧格式，建议重新合并</span>
            )}
          </span>
        </div>
      )}

      {/* Auto-fix progress bar */}
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

      {/* Merge diagnostics panel */}
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

      {/* Merged episode video player */}
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
