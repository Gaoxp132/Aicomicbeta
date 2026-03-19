import { memo, useState } from 'react';
import { PlaylistVideoPlayer } from '../PlaylistVideoPlayer';
import { Button } from '../ui';
import { Play, Edit, Calendar, ChevronDown, ChevronUp, Film, Clock, AlertTriangle, Wrench, Loader2 } from 'lucide-react';
import { VideoPlayer } from '../VideoPlayer';
import { motion, AnimatePresence } from 'motion/react';
import type { Episode } from '../../types';
import { formatDuration, getAspectCssValue, epMergedVideoUrl, getEffectiveEpisodeStatus } from '../../utils';

// ── Inline: VideoErrorFallback (was ../VideoErrorFallback.tsx) ───
function VideoErrorFallback({ episode, error, onRepair }: {
  episode: Episode; error?: { errorType?: string; networkState?: number; readyState?: number }; onRepair?: (episodeId: string) => Promise<void>;
}) {
  const [isRepairing, setIsRepairing] = useState(false);
  const handleRepair = async () => { if (!onRepair) return; setIsRepairing(true); try { await onRepair(episode.id); } finally { setIsRepairing(false); } };
  return (
    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-red-900/20 to-orange-900/20 border-2 border-red-500/30 rounded-lg p-6">
      <div className="text-center">
        <div className="w-20 h-20 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-6"><AlertTriangle className="w-10 h-10 text-red-400" /></div>
        <h3 className="text-2xl font-bold text-red-300 mb-6">视频无法播放</h3>
        {onRepair && (
          <Button onClick={handleRepair} disabled={isRepairing}
            className="bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 text-white font-semibold px-10 py-4 text-lg shadow-xl">
            {isRepairing ? <><Loader2 className="w-6 h-6 mr-2 animate-spin" />修复中...</> : <><Wrench className="w-6 h-6 mr-2" />修复视频</>}
          </Button>
        )}
      </div>
    </div>
  );
}
// ── End inline VideoErrorFallback ────────────────────────────────

// --- Episode utility functions (pure, no React deps) ---

/** 获取剧集缩略图（优先thumbnailUrl → 第一个有图的分镜 → null） */
function getEpisodeThumbnail(episode: Episode): string | null {
  if (episode.thumbnailUrl) return episode.thumbnailUrl;
  const firstWithImage = episode.storyboards?.find(sb => sb.imageUrl);
  return firstWithImage?.imageUrl || null;
}

/** 获取剧集视频总时长（totalDuration优先，否则累加分镜duration） */
function getEpisodeVideoDuration(episode: Episode): number {
  if (episode.totalDuration > 0) return episode.totalDuration;
  return episode.storyboards?.reduce((sum, sb) => sum + (sb.duration || 0), 0) || 0;
}

/** 获取视频完成度统计 */
function getVideoCompletionStats(episode: Episode) {
  const total = episode.storyboards?.length || 0;
  const withVideo = episode.storyboards?.filter(sb => sb.videoUrl).length || 0;
  return { total, withVideo, percentage: total > 0 ? Math.round((withVideo / total) * 100) : 0 };
}

interface EpisodeCardProps {
  episode: Episode;
  isVideoExpanded: boolean;
  isCurrentlyPlaying: boolean;
  videoError: Record<string, unknown> | null;
  aspectRatio?: string; // v6.0.82: 画面比例
  onSelect: () => void;
  onToggleVideoExpand: () => void;
  onCollapseVideo: () => void;
  onSetPlaying: (id: string | null) => void;
  onVideoError: (episodeId: string, errorInfo: Record<string, unknown>) => void;
  onVideoLoaded: (episodeId: string) => void;
  onRepair: (episodeId: string) => Promise<void>;
}

export const EpisodeCard = memo(function EpisodeCard({
  episode,
  isVideoExpanded,
  isCurrentlyPlaying,
  videoError,
  aspectRatio,
  onSelect,
  onToggleVideoExpand,
  onCollapseVideo,
  onSetPlaying,
  onVideoError,
  onVideoLoaded,
  onRepair,
}: EpisodeCardProps) {
  // Check if episode has merged video
  const mergedVideoUrl = epMergedVideoUrl(episode);
  const hasValidMergedVideo = mergedVideoUrl && typeof mergedVideoUrl === 'string' && mergedVideoUrl.trim().length > 0;

  // 智能推断实际状态
  const effectiveStatus = getEffectiveEpisodeStatus(episode);

  return (
    <motion.div
      whileHover={{ x: 4 }}
      onClick={() => !hasValidMergedVideo && onSelect()}
      className={`bg-white/5 backdrop-blur-xl rounded-2xl p-4 sm:p-6 border border-white/10 group hover:border-purple-500/30 transition-all ${hasValidMergedVideo ? '' : 'cursor-pointer'}`}
    >
      <div className="flex items-start gap-3 sm:gap-4">
        {/* Episode number badge */}
        <div className="flex-shrink-0 w-12 h-12 sm:w-16 sm:h-16 bg-gradient-to-br from-purple-500/20 to-pink-500/20 rounded-xl flex items-center justify-center border border-purple-500/30">
          <span className="text-xl sm:text-2xl font-bold text-white">{episode.episodeNumber}</span>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
            <h3 className="text-base sm:text-lg font-bold text-white group-hover:text-purple-400 transition-colors min-w-0">
              {episode.title}
            </h3>
            <div className="flex items-center gap-2 shrink-0">
              <span className={`px-2 sm:px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap ${
                effectiveStatus === 'completed'
                  ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                  : effectiveStatus === 'generating'
                  ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                  : 'bg-gray-500/20 text-gray-400 border border-gray-500/30'
              }`}>
                {effectiveStatus === 'completed' ? '已完成' : effectiveStatus === 'generating' ? '生成中' : '草稿'}
              </span>
              <Button
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  onSelect();
                }}
                className="opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <Edit className="w-4 h-4 mr-1" />
                编辑
              </Button>
            </div>
          </div>

          {episode.synopsis && (
            <p className="text-sm text-gray-400 mb-3 line-clamp-2">
              {episode.synopsis}
            </p>
          )}

          {/* Video lazy-load section */}
          {hasValidMergedVideo && (() => {
            const isJsonString = mergedVideoUrl.trim().startsWith('{');
            const isJsonUrl = mergedVideoUrl.trim().endsWith('.json');
            const isPlaylist = isJsonString || isJsonUrl;
            const isProbablyCorrupted = mergedVideoUrl.length < 100 || (isJsonString && !mergedVideoUrl.includes('"videos"'));

            if (isProbablyCorrupted) {
              return (
                <div className="mb-3 bg-yellow-900/20 border border-yellow-600 rounded-lg p-4 text-center">
                  <p className="text-yellow-400 text-sm mb-2">Warning: video data may need an update</p>
                  <p className="text-yellow-300 text-xs">Please click the "Merge Videos" button to regenerate</p>
                </div>
              );
            }

            return (
              <div className="mb-3">
                {/* Expand/collapse button with thumbnail + duration + completion */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleVideoExpand();
                  }}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all ${
                    isVideoExpanded
                      ? 'bg-purple-500/20 border border-purple-500/40 text-purple-300'
                      : 'bg-white/5 border border-white/10 text-gray-400 hover:bg-white/10 hover:text-white hover:border-white/20'
                  }`}
                >
                  {/* Thumbnail preview */}
                  {(() => {
                    const thumb = getEpisodeThumbnail(episode);
                    return thumb ? (
                      <div className="relative flex-shrink-0 w-14 h-10 rounded-lg overflow-hidden bg-black/40 border border-white/10">
                        <img src={thumb} alt="" className="w-full h-full object-cover" loading="lazy" />
                        {/* Play icon overlay */}
                        {!isVideoExpanded && (
                          <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                            <Play className="w-4 h-4 text-white/80 fill-white/80" />
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="flex-shrink-0 w-14 h-10 rounded-lg bg-gradient-to-br from-purple-500/10 to-pink-500/10 border border-white/10 flex items-center justify-center">
                        <Film className="w-5 h-5 opacity-40" />
                      </div>
                    );
                  })()}

                  {/* Text info area */}
                  <div className="flex-1 flex flex-col items-start gap-0.5 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">
                        {isVideoExpanded ? '收起视频' : '播放视频'}
                      </span>
                      {/* Duration badge */}
                      {(() => {
                        const duration = getEpisodeVideoDuration(episode);
                        return duration > 0 ? (
                          <span className="flex items-center gap-1 text-xs bg-white/10 px-1.5 py-0.5 rounded-md">
                            <Clock className="w-3 h-3" />
                            {formatDuration(duration)}
                          </span>
                        ) : null;
                      })()}
                    </div>
                    {/* Video completion stats */}
                    {isPlaylist && (() => {
                      const stats = getVideoCompletionStats(episode);
                      return (
                        <div className="flex items-center gap-2 w-full">
                          <span className="text-xs opacity-60">
                            {stats.withVideo}/{stats.total} 段视频
                          </span>
                          {stats.total > 0 && (
                            <div className="flex-1 max-w-[80px] h-1.5 bg-white/10 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all ${
                                  stats.percentage === 100 ? 'bg-green-400' : 'bg-blue-400'
                                }`}
                                style={{ width: `${stats.percentage}%` }}
                              />
                            </div>
                          )}
                          {stats.percentage === 100 && (
                            <span className="text-[10px] text-green-400 font-medium">完整</span>
                          )}
                        </div>
                      );
                    })()}
                  </div>

                  {/* Chevron */}
                  {isVideoExpanded ? (
                    <ChevronUp className="w-4 h-4 flex-shrink-0" />
                  ) : (
                    <ChevronDown className="w-4 h-4 flex-shrink-0" />
                  )}
                </button>

                {/* Video player - only mounted when expanded */}
                <AnimatePresence>
                  {isVideoExpanded && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.3, ease: 'easeInOut' }}
                      className="overflow-hidden"
                    >
                      <div className="mt-2 bg-black rounded-lg overflow-hidden" style={{ aspectRatio: getAspectCssValue(aspectRatio), maxWidth: '100%' }}>
                        {videoError ? (
                          <VideoErrorFallback
                            episode={episode}
                            error={videoError}
                            onRepair={onRepair}
                          />
                        ) : isPlaylist ? (
                          <PlaylistVideoPlayer
                            key={`${episode.id}-${mergedVideoUrl.substring(0, 50)}`}
                            playlistUrl={mergedVideoUrl}
                            className="w-full h-full"
                            autoPlay={false}
                            onPlay={() => onSetPlaying(episode.id)}
                            onPause={() => {
                              if (isCurrentlyPlaying) onSetPlaying(null);
                            }}
                          />
                        ) : (
                          <VideoPlayer
                            key={`${episode.id}-${mergedVideoUrl}`}
                            src={mergedVideoUrl}
                            controls
                            preload="metadata"
                            className="w-full h-full object-contain"
                            style={{ maxHeight: '400px' }}
                            onPlay={(e) => {
                              onSetPlaying(episode.id);
                              const allVideos = document.querySelectorAll('video');
                              allVideos.forEach((video) => {
                                if (video !== e.currentTarget && !video.paused) {
                                  video.pause();
                                }
                              });
                            }}
                            onPause={() => {
                              if (isCurrentlyPlaying) onSetPlaying(null);
                            }}
                            onError={(e) => {
                              const target = e.currentTarget;
                              const errorInfo = {
                                episodeId: episode.id,
                                url: mergedVideoUrl,
                                errorType: e.type,
                                networkState: target?.networkState ?? 'unknown',
                                readyState: target?.readyState ?? 'unknown',
                              };
                              console.error('[EpisodeCard] Video load error:', errorInfo);
                              onVideoError(episode.id, errorInfo);
                            }}
                            onLoadedMetadata={() => onVideoLoaded(episode.id)}
                          />
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })()}

          {/* Footer stats */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500">
            <span className="flex items-center gap-1">
              <Play className="w-3 h-3" />
              {episode.storyboards?.length || 0} 个分镜
            </span>
            <span className="flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              {new Date(episode.updatedAt).toLocaleDateString()}
            </span>
            {episode.totalDuration > 0 && (
              <span>预计时长 {episode.totalDuration}秒</span>
            )}
            {hasValidMergedVideo && (
              <span className="text-green-400 flex items-center gap-1">
                已合并视频
              </span>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
});