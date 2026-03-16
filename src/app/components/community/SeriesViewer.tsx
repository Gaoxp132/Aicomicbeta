/**
 * SeriesViewer - Full-screen series episode player
 * Split sub-components into ViewerWidgets.tsx, hooks into viewerHooks.ts (v6.0.71)
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, List } from 'lucide-react';
import { toast } from 'sonner';
import { VideoPlayer, InteractionBar, CommentSection } from '../immersive';
import { PlaylistVideoPlayer } from '../PlaylistVideoPlayer';
import { useFullscreen, useVideoPlayer } from '../../hooks';
import { apiPost, apiGet } from '../../utils';
import type { CommunitySeriesWork } from '../../types';

import {
  ViewerCountdown, ViewerEpisodeList, ViewerExpiredOverlay,
  ViewerFinale, ViewerMobileBar, ViewerNoVideo, ViewerShortcutHelp,
} from './ViewerWidgets';
import {
  useAutoAdvance, useSwipeNavigation, useViewerKeyboard, useSeriesViewerInteractions,
} from './viewerHooks';

interface SeriesViewerProps {
  series: CommunitySeriesWork;
  userPhone?: string;
  onClose: () => void;
  onNavigateToSeries?: (seriesId: string) => void;
}

export function SeriesViewer({ series, userPhone, onClose, onNavigateToSeries }: SeriesViewerProps) {
  const episodes = series.episodes || [];
  // v6.0.82: 提取画面比例
  const aspectRatio = series.aspectRatio || undefined;

  const [currentEpisodeIndex, setCurrentEpisodeIndex] = useState(() => {
    if (episodes.length === 0) return 0;
    if (series.continueWatching && series.continueWatching.episodeNumber > 0) {
      const index = series.continueWatching.episodeNumber - 1;
      return Math.min(index, episodes.length - 1);
    }
    return 0;
  });
  const [showEpisodeList, setShowEpisodeList] = useState(false);
  const [showShortcutHelp, setShowShortcutHelp] = useState(false);
  const [similarSeries, setSimilarSeries] = useState<any[]>([]);
  const [isLoadingSimilar, setIsLoadingSimilar] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const currentEpisode = episodes[currentEpisodeIndex];

  const getEpisodeVideoUrl = (episode: any) => {
    if (episode?.mergedVideoUrl) return episode.mergedVideoUrl;
    if (episode?.videoUrl) return episode.videoUrl;
    console.warn('[SeriesViewer] No video URL found for episode:', episode?.episodeNumber);
    return '';
  };

  const [currentVideoUrl, setCurrentVideoUrl] = useState(getEpisodeVideoUrl(currentEpisode));

  const {
    isPlaying, isMuted, currentTime, duration,
    setIsPlaying, setIsMuted, setCurrentTime, setDuration,
  } = useVideoPlayer();

  const { isFullscreen, fullscreenSupported, toggleFullscreen } = useFullscreen(containerRef);

  const interactions = useSeriesViewerInteractions({
    series, userPhone, currentEpisodeIndex, episodes,
    currentTime, duration, setIsPlaying, setCurrentTime,
  });

  const handleAdvanceToEpisode = useCallback((nextIndex: number) => {
    setCurrentEpisodeIndex(nextIndex);
  }, []);

  const {
    autoAdvanceCountdown,
    showSeriesFinale,
    setShowSeriesFinale,
    handleVideoEnded: handleAutoAdvance,
    cancelAutoAdvance,
    skipToNextNow,
  } = useAutoAdvance({
    currentEpisodeIndex,
    episodes,
    canAdvanceToNext: !!getEpisodeVideoUrl(episodes[currentEpisodeIndex + 1]),
    onAdvance: handleAdvanceToEpisode,
  });

  // Update video URL when episode changes (including OSS signing)
  useEffect(() => {
    const episode = episodes[currentEpisodeIndex];
    const newVideoUrl = getEpisodeVideoUrl(episode);
    if (!newVideoUrl) return;

    interactions.setUrlExpired(false);
    setIsPlaying(true);
    setCurrentTime(0);

    // JSON playlist handled by PlaylistVideoPlayer internally
    const trimmed = newVideoUrl.trim();
    if (trimmed.startsWith('{') || trimmed.startsWith('[') || trimmed.endsWith('.json')) {
      setCurrentVideoUrl(newVideoUrl);
      return;
    }

    // Direct video URL → sign first then set
    const signAndSet = async () => {
      let signedUrl = newVideoUrl;
      if (newVideoUrl.includes('aliyuncs.com') || newVideoUrl.includes('oss-')) {
        const result = await apiPost('/oss/sign-url', { url: newVideoUrl });
        if (result.success && result.data?.signedUrl) {
          signedUrl = result.data.signedUrl;
          console.log('[SeriesViewer] Signed OSS video URL for episode', episode?.episodeNumber);
        }
      }
      setCurrentVideoUrl(signedUrl);
    };
    signAndSet();
  }, [currentEpisodeIndex, episodes]);

  // Lock body scroll
  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.body.style.position = 'fixed';
    document.body.style.width = '100%';
    document.body.style.height = '100%';
    return () => {
      document.body.style.overflow = originalOverflow;
      document.body.style.position = '';
      document.body.style.width = '';
      document.body.style.height = '';
    };
  }, []);

  const handlePreviousEpisode = useCallback(() => {
    if (currentEpisodeIndex > 0) {
      setCurrentEpisodeIndex(currentEpisodeIndex - 1);
      setShowEpisodeList(false);
    }
  }, [currentEpisodeIndex]);

  const handleNextEpisode = useCallback(() => {
    if (currentEpisodeIndex < episodes.length - 1) {
      setCurrentEpisodeIndex(currentEpisodeIndex + 1);
      setShowEpisodeList(false);
    }
  }, [currentEpisodeIndex, episodes.length]);

  // Fetch similar series on finale
  useEffect(() => {
    if (!showSeriesFinale || similarSeries.length > 0 || isLoadingSimilar) return;
    setIsLoadingSimilar(true);
    apiGet(`/community/series/${series.id}/similar?limit=4`)
      .then(res => {
        if (res.success && res.data?.length) {
          setSimilarSeries(res.data);
        }
      })
      .catch((err: unknown) => console.warn('[SeriesViewer] Failed to fetch similar:', err instanceof Error ? err.message : err))
      .finally(() => setIsLoadingSimilar(false));
  }, [showSeriesFinale, series.id]);

  const handleSelectEpisode = useCallback((index: number) => {
    setCurrentEpisodeIndex(index); setShowEpisodeList(false);
  }, []);

  const handleToggleComments = useCallback(() => {
    interactions.setShowComments(!interactions.showComments);
    if (!interactions.showComments) setShowEpisodeList(false);
  }, [interactions.showComments, interactions.setShowComments]);

  const isOwner = !!(userPhone && series.user_phone && userPhone === series.user_phone);

  const handleDownloadCurrent = useCallback(() => {
    if (!isOwner) {
      toast.info('仅作品制作者可以下载视频');
      return;
    }
    interactions.handleDownload(currentVideoUrl);
  }, [interactions.handleDownload, currentVideoUrl, isOwner]);

  useViewerKeyboard({
    showShortcutHelp, setShowShortcutHelp, showSeriesFinale, setShowSeriesFinale,
    autoAdvanceCountdown, showEpisodeList, setShowEpisodeList, onClose,
    cancelAutoAdvance, skipToNextNow, setIsPlaying,
    handleNextEpisode, handlePreviousEpisode,
    episodesLength: episodes.length, currentEpisodeIndex,
  });

  const { handleTouchStart, handleTouchMove, handleTouchEnd } = useSwipeNavigation({
    onSwipeUp: handleNextEpisode,
    onSwipeDown: handlePreviousEpisode,
  });

  if (!currentEpisode || !getEpisodeVideoUrl(currentEpisode)) {
    return (
      <ViewerNoVideo
        ref={containerRef}
        episodeNumber={currentEpisode?.episodeNumber || 1}
        onClose={onClose}
      />
    );
  }

  return (
    <motion.div
      ref={containerRef}
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black"
    >
      {/* Close button */}
      <button onClick={onClose} className="absolute top-4 left-4 z-50 w-10 h-10 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center text-white hover:bg-black/70 transition-all">
        <X className="w-6 h-6" />
      </button>

      {/* Episode list button */}
      <button
        onClick={() => setShowEpisodeList(!showEpisodeList)}
        className="absolute top-4 right-4 z-50 px-4 py-2 rounded-full bg-black/50 backdrop-blur-sm flex items-center gap-2 text-white hover:bg-black/70 transition-all"
      >
        <List className="w-5 h-5" />
        <span className="text-sm">第{currentEpisode.episodeNumber}集</span>
      </button>

      <div className="w-full h-full flex flex-col lg:flex-row">
        {/* Video area */}
        <div className="flex-1 relative">
          {interactions.urlExpired && (
            <ViewerExpiredOverlay
              isLoadingVideo={interactions.isLoadingVideo}
              onRecover={interactions.handleRecoverVideo}
              onClose={onClose}
            />
          )}

          {(() => {
            const trimmed = currentVideoUrl?.trim() || '';
            if (!trimmed) {
              return (
                <div className="w-full h-full flex items-center justify-center bg-black/60">
                  <div className="text-center space-y-4 p-8 max-w-sm">
                    <div className="text-5xl">🎬</div>
                    <h3 className="text-xl font-bold text-white">视频制作中</h3>
                    <p className="text-gray-400 text-sm leading-relaxed">
                      第{currentEpisode?.episodeNumber || '?'}集的视频尚未生成完成，请稍后再来观看。
                    </p>
                    <button onClick={onClose} className="px-6 py-2.5 bg-white/10 text-white rounded-lg text-sm hover:bg-white/20 transition-all">
                      返回
                    </button>
                  </div>
                </div>
              );
            }

            const isJsonPlaylist = (trimmed.startsWith('{') || trimmed.startsWith('[') || trimmed.endsWith('.json'));
            if (isJsonPlaylist) {
              return (
                <div className="w-full h-full">
                  <PlaylistVideoPlayer
                    playlistUrl={currentVideoUrl}
                    className="w-full h-full"
                    autoPlay={true}
                    onPlay={() => setIsPlaying(true)}
                    onPause={() => setIsPlaying(false)}
                    onPlaylistEnded={handleAutoAdvance}
                  />
                </div>
              );
            }

            return (
              <VideoPlayer
                videoUrl={currentVideoUrl}
                isPlaying={isPlaying}
                isMuted={isMuted}
                currentTime={currentTime}
                duration={duration}
                isFullscreen={isFullscreen}
                fullscreenSupported={fullscreenSupported}
                onPlayPause={() => setIsPlaying(!isPlaying)}
                onMuteToggle={() => setIsMuted(!isMuted)}
                onTimeUpdate={setCurrentTime}
                onLoadedMetadata={setDuration}
                onToggleFullscreen={toggleFullscreen}
                onVideoRef={(ref) => { videoRef.current = ref; }}
                onError={interactions.handleVideoError}
                onEnded={handleAutoAdvance}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
                aspectRatio={aspectRatio}
              />
            );
          })()}

          <AnimatePresence>
            {autoAdvanceCountdown !== null && autoAdvanceCountdown > 0 && currentEpisodeIndex < episodes.length - 1 && (
              <ViewerCountdown
                countdown={autoAdvanceCountdown}
                nextEpisode={episodes[currentEpisodeIndex + 1]}
                onSkip={skipToNextNow}
                onCancel={cancelAutoAdvance}
              />
            )}
          </AnimatePresence>

          <AnimatePresence>
            {showSeriesFinale && (
              <ViewerFinale
                series={series}
                episodes={episodes}
                onReplay={() => {
                  setShowSeriesFinale(false);
                  setCurrentEpisodeIndex(0);
                  toast('从第1集开始重播', { duration: 2000 });
                }}
                onSelectEpisode={() => {
                  setShowSeriesFinale(false);
                  setShowEpisodeList(true);
                }}
                onClose={onClose}
                onNavigateToSeries={onNavigateToSeries}
                similarSeries={similarSeries}
                isLoadingSimilar={isLoadingSimilar}
              />
            )}
          </AnimatePresence>
        </div>

        {/* Episode list sidebar */}
        <AnimatePresence>
          {showEpisodeList && (
            <ViewerEpisodeList
              episodes={episodes}
              currentEpisodeIndex={currentEpisodeIndex}
              onSelectEpisode={handleSelectEpisode}
              onClose={() => setShowEpisodeList(false)}
            />
          )}
        </AnimatePresence>

        {/* Comments panel */}
        {interactions.showComments && !showEpisodeList && (
          <motion.div
            initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="fixed lg:relative bottom-0 right-0 w-full lg:w-96 h-2/3 lg:h-full bg-gradient-to-br from-slate-950/95 via-purple-950/95 to-slate-950/95 backdrop-blur-xl border-l border-white/10 z-40"
          >
            <CommentSection
              comments={interactions.comments}
              commentText={interactions.commentText}
              isLoadingComments={interactions.isLoadingComments}
              onCommentTextChange={interactions.setCommentText}
              onSubmitComment={interactions.handleComment}
            />
          </motion.div>
        )}

        {/* Desktop interaction bar */}
        <div className="hidden lg:block absolute bottom-24 right-4">
          <InteractionBar
            isLiked={interactions.isLiked}
            likes={interactions.likes}
            commentsCount={interactions.comments.length}
            onLike={interactions.handleLike}
            onComment={handleToggleComments}
            onShare={interactions.handleShare}
            onDownload={handleDownloadCurrent}
          />
        </div>

        {/* Mobile bottom bar */}
        <ViewerMobileBar
          isLiked={interactions.isLiked}
          likes={interactions.likes}
          commentsCount={interactions.comments.length}
          onLike={interactions.handleLike}
          onComment={handleToggleComments}
          onShare={interactions.handleShare}
          onDownload={handleDownloadCurrent}
        />
      </div>

      {/* Keyboard shortcut help panel */}
      <AnimatePresence>
        {showShortcutHelp && <ViewerShortcutHelp onClose={() => setShowShortcutHelp(false)} />}
      </AnimatePresence>

      {/* Keyboard hint button (desktop) */}
      <button
        onClick={() => setShowShortcutHelp(true)}
        className="hidden lg:flex absolute bottom-4 left-4 z-50 w-8 h-8 rounded-full bg-black/40 backdrop-blur-sm items-center justify-center text-gray-500 hover:text-white hover:bg-black/60 transition-all"
        title="键盘快捷键 (?)"
      >
        <span className="text-xs font-mono">?</span>
      </button>
    </motion.div>
  );
}