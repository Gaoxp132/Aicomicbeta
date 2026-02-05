import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, ChevronLeft, ChevronRight, List, Play, Clock, Film } from 'lucide-react';
import { incrementSeriesViews, updateViewingHistory, shareSeries, likeSeries, getSeriesComments, commentSeries } from '@/app/services/community/series';
import { VideoPlayer } from '../immersive/VideoPlayer';
import { InteractionBar } from '../immersive/InteractionBar';
import { CommentSection } from '../immersive/CommentSection';
import { ShareMenu } from '../immersive/ShareMenu';
import { useFullscreen } from '@/app/hooks/useFullscreen';
import { useVideoPlayer } from '@/app/hooks/useVideoPlayer';
import type { CommunitySeriesWork } from '@/app/types';

interface SeriesViewerProps {
  series: CommunitySeriesWork;
  userPhone?: string;
  onClose: () => void;
}

export function SeriesViewer({ series, userPhone, onClose }: SeriesViewerProps) {
  // 🛡️ 安全检查：确保episodes数组存在
  const episodes = series.episodes || [];
  
  // 当前播放的集数（从0开始的索引）
  const [currentEpisodeIndex, setCurrentEpisodeIndex] = useState(() => {
    // 如果没有剧集，返回0
    if (episodes.length === 0) {
      return 0;
    }
    // 从播放历史恢复
    if (series.continueWatching && series.continueWatching.episodeNumber > 0) {
      const index = series.continueWatching.episodeNumber - 1;
      // 确保索引在有效范围内
      return Math.min(index, episodes.length - 1);
    }
    return 0;
  });
  const [showEpisodeList, setShowEpisodeList] = useState(false);
  
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  // ✅ 上下滑动手势支持
  const touchStartY = useRef(0);
  const touchEndY = useRef(0);
  const isSwipeHandled = useRef(false);
  
  // 当前剧集（安全访问）
  const currentEpisode = episodes[currentEpisodeIndex];
  
  // 🔥 优先使用合并后的视频URL（播放列表JSON），其次使用单个视频URL
  const getEpisodeVideoUrl = (episode: any) => {
    // 优先级：mergedVideoUrl > videoUrl
    if (episode?.mergedVideoUrl) {
      console.log('[SeriesViewer] Using merged video URL for episode:', episode.episodeNumber);
      return episode.mergedVideoUrl;
    }
    if (episode?.videoUrl) {
      console.log('[SeriesViewer] Using single video URL for episode:', episode.episodeNumber);
      return episode.videoUrl;
    }
    console.warn('[SeriesViewer] No video URL found for episode:', episode?.episodeNumber);
    return '';
  };
  
  // 视频URL状态
  const [currentVideoUrl, setCurrentVideoUrl] = useState(getEpisodeVideoUrl(currentEpisode));
  const [urlExpired, setUrlExpired] = useState(false);
  const [isLoadingVideo, setIsLoadingVideo] = useState(false);
  
  // 点赞和评论状态
  const [isLiked, setIsLiked] = useState(series.isLiked || false);
  const [likes, setLikes] = useState(series.likes || 0);
  const [comments, setComments] = useState<any[]>([]);
  const [commentText, setCommentText] = useState('');
  const [showComments, setShowComments] = useState(false);
  const [isLoadingComments, setIsLoadingComments] = useState(false);
  
  // 使用自定义hooks
  const {
    isPlaying,
    isMuted,
    currentTime,
    duration,
    setIsPlaying,
    setIsMuted,
    setCurrentTime,
    setDuration,
  } = useVideoPlayer();
  
  const {
    isFullscreen,
    fullscreenSupported,
    toggleFullscreen,
  } = useFullscreen(containerRef);
  
  // 分享状态
  const [showShareMenu, setShowShareMenu] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);

  // 加载评论
  useEffect(() => {
    if (showComments && comments.length === 0) {
      loadComments();
    }
  }, [showComments]);

  const loadComments = async () => {
    setIsLoadingComments(true);
    try {
      const result = await getSeriesComments(series.id, 1, 20);
      if (result.success) {
        setComments(result.data || []);
      }
    } catch (error) {
      console.error('[SeriesViewer] Failed to load comments:', error);
    } finally {
      setIsLoadingComments(false);
    }
  };

  const handleLike = async () => {
    if (!userPhone) {
      console.log('[SeriesViewer] User not logged in');
      return;
    }

    try {
      const result = await likeSeries(series.id, userPhone);
      if (result.success && result.data) {
        setIsLiked(result.data.isLiked);
        setLikes(result.data.likes);
      }
    } catch (error) {
      console.error('[SeriesViewer] Like failed:', error);
    }
  };

  const handleComment = async () => {
    if (!userPhone || !commentText.trim()) {
      return;
    }

    try {
      const result = await commentSeries(series.id, userPhone, commentText.trim());
      if (result.success) {
        setCommentText('');
        await loadComments(); // 重新加载评论列表
      }
    } catch (error) {
      console.error('[SeriesViewer] Comment failed:', error);
    }
  };

  // 切换剧集时更新视频URL
  useEffect(() => {
    const episode = episodes[currentEpisodeIndex];
    const newVideoUrl = getEpisodeVideoUrl(episode);
    
    if (newVideoUrl) {
      setCurrentVideoUrl(newVideoUrl);
      setUrlExpired(false);
      setIsPlaying(true);
      setCurrentTime(0);
      
      // 增加浏览量（仅首次播放第一集时）
      if (currentEpisodeIndex === 0) {
        incrementSeriesViews(series.id).catch(() => {});
      }

      // 保存播放历史
      if (userPhone && episode.id) {
        updateViewingHistory({
          seriesId: series.id,
          episodeId: episode.id,
          episodeNumber: episode.episodeNumber,
          userPhone,
        }).catch((error) => {
          console.error('[SeriesViewer] Failed to save viewing history:', error);
        });
      }
    }
  }, [currentEpisodeIndex, episodes, series.id, userPhone]);

  // 定期保存播放进度（每10秒）
  useEffect(() => {
    if (!userPhone || !currentEpisode?.id) return;

    const interval = setInterval(() => {
      if (currentTime > 0 && duration > 0) {
        const completed = currentTime >= duration * 0.9; // 播放90%视为完成
        
        updateViewingHistory({
          seriesId: series.id,
          episodeId: currentEpisode.id,
          episodeNumber: currentEpisode.episodeNumber,
          userPhone,
          lastPosition: currentTime,
          duration,
          completed,
        }).catch((error) => {
          console.error('[SeriesViewer] Failed to update progress:', error);
        });
      }
    }, 10000); // 每10秒保存一次

    return () => clearInterval(interval);
  }, [userPhone, currentEpisode, currentTime, duration, series.id]);

  // 禁用body滚动
  useEffect(() => {
    console.log('[SeriesViewer] 🔒 Disabling body scroll');
    
    const originalOverflow = document.body.style.overflow;
    const originalPosition = document.body.style.position;
    
    document.body.style.overflow = 'hidden';
    document.body.style.position = 'fixed';
    document.body.style.width = '100%';
    document.body.style.height = '100%';
    
    return () => {
      console.log('[SeriesViewer] 🔓 Restoring body scroll');
      document.body.style.overflow = originalOverflow;
      document.body.style.position = originalPosition;
      document.body.style.width = '';
      document.body.style.height = '';
    };
  }, []);

  const handleVideoError = async () => {
    console.log('[SeriesViewer] 🔄 Video playback error detected');
    setUrlExpired(true);
  };

  // 切换到上一集
  const handlePreviousEpisode = () => {
    if (currentEpisodeIndex > 0) {
      setCurrentEpisodeIndex(currentEpisodeIndex - 1);
      setShowEpisodeList(false);
    }
  };

  // 切换到下一集
  const handleNextEpisode = () => {
    if (currentEpisodeIndex < episodes.length - 1) {
      setCurrentEpisodeIndex(currentEpisodeIndex + 1);
      setShowEpisodeList(false);
    }
  };

  // 切换到指定集数
  const handleSelectEpisode = (index: number) => {
    setCurrentEpisodeIndex(index);
    setShowEpisodeList(false);
  };

  // ✅ 上下滑动手势处理
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
    isSwipeHandled.current = false;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    touchEndY.current = e.touches[0].clientY;
  };

  const handleTouchEnd = () => {
    if (isSwipeHandled.current) return;
    
    const swipeDistance = touchStartY.current - touchEndY.current;
    const minSwipeDistance = 50; // 最小滑动距离（像素）
    
    // 向上滑动：切换到下一集
    if (swipeDistance > minSwipeDistance && currentEpisodeIndex < episodes.length - 1) {
      console.log('[SeriesViewer] Swipe up - Next episode');
      handleNextEpisode();
      isSwipeHandled.current = true;
    }
    // 向下滑动：切换到上一集
    else if (swipeDistance < -minSwipeDistance && currentEpisodeIndex > 0) {
      console.log('[SeriesViewer] Swipe down - Previous episode');
      handlePreviousEpisode();
      isSwipeHandled.current = true;
    }
  };

  const handleShare = async () => {
    setShowShareMenu(!showShareMenu);
  };

  const handleDownload = async () => {
    try {
      const videoUrl = currentVideoUrl;
      
      const a = document.createElement('a');
      a.href = videoUrl;
      a.download = `${series.title}-第${currentEpisode.episodeNumber}集.mp4`;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      
      console.log('Download initiated for:', series.title);
    } catch (error) {
      console.error('Failed to download video:', error);
      window.open(currentVideoUrl, '_blank');
    }
  };

  const handleCopyLink = async () => {
    const url = window.location.href;
    
    if (navigator.clipboard && navigator.clipboard.writeText) {
      try {
        await navigator.clipboard.writeText(url);
        setLinkCopied(true);
        setTimeout(() => setLinkCopied(false), 2000);
        return;
      } catch (clipboardError) {
        // 降级处理
      }
    }
    
    const textArea = document.createElement('textarea');
    textArea.value = url;
    textArea.style.position = 'fixed';
    textArea.style.left = '-999999px';
    textArea.style.top = '-999999px';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    
    try {
      const successful = document.execCommand('copy');
      if (successful) {
        setLinkCopied(true);
        setTimeout(() => setLinkCopied(false), 2000);
        document.body.removeChild(textArea);
        return;
      }
    } catch (err) {
      // 静默处理
    }
    
    document.body.removeChild(textArea);
    
    try {
      prompt('请复制以下链接：', url);
    } catch (promptError) {
      // 静默处理
    }
  };

  const handleWeChatShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: `${series.title} - 第${currentEpisode.episodeNumber}集`,
          text: currentEpisode.synopsis || '快来看看这部精彩漫剧！',
          url: window.location.href,
        });
      } catch (error) {
        console.error('Failed to share:', error);
      }
    }
  };

  // 如果当前剧集没有视频，显示提示
  if (!currentEpisode || !getEpisodeVideoUrl(currentEpisode)) {
    return (
      <motion.div
        ref={containerRef}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-black flex items-center justify-center"
      >
        <button
          onClick={onClose}
          className="absolute top-4 left-4 z-50 w-10 h-10 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center text-white hover:bg-black/70 transition-all"
        >
          <X className="w-6 h-6" />
        </button>
        
        <div className="max-w-md mx-4 p-8 bg-gradient-to-br from-purple-500/20 to-pink-500/20 backdrop-blur-xl rounded-2xl border border-purple-500/30 shadow-2xl">
          <div className="text-center space-y-4">
            <div className="text-6xl">📺</div>
            <h3 className="text-2xl font-bold text-white">视频生成中</h3>
            <p className="text-gray-300 leading-relaxed">
              第{currentEpisode?.episodeNumber || 1}集正在生成中，请稍后再来查看。
            </p>
            <button
              onClick={onClose}
              className="mt-6 px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-lg font-medium hover:from-purple-700 hover:to-pink-700 transition-all"
            >
              关闭
            </button>
          </div>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      ref={containerRef}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black"
    >
      {/* 关闭按钮 */}
      <button
        onClick={onClose}
        className="absolute top-4 left-4 z-50 w-10 h-10 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center text-white hover:bg-black/70 transition-all"
      >
        <X className="w-6 h-6" />
      </button>

      {/* 剧集列表按钮 */}
      <button
        onClick={() => setShowEpisodeList(!showEpisodeList)}
        className="absolute top-4 right-4 z-50 px-4 py-2 rounded-full bg-black/50 backdrop-blur-sm flex items-center gap-2 text-white hover:bg-black/70 transition-all"
      >
        <List className="w-5 h-5" />
        <span className="text-sm">第{currentEpisode.episodeNumber}集</span>
      </button>

      <div className="w-full h-full flex flex-col lg:flex-row">
        {/* 视频播放区 */}
        <div className="flex-1 relative">
          {/* 视频过期提示 */}
          {urlExpired && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="absolute inset-0 z-30 flex items-center justify-center bg-black/80 backdrop-blur-sm"
            >
              <div className="max-w-md mx-4 p-8 bg-gradient-to-br from-red-500/20 to-orange-500/20 backdrop-blur-xl rounded-2xl border border-red-500/30 shadow-2xl">
                <div className="text-center space-y-4">
                  <div className="text-6xl">⚠️</div>
                  <h3 className="text-2xl font-bold text-white">视频链接已过期</h3>
                  <p className="text-gray-300 leading-relaxed">
                    视频签名URL有效期已过，请重新生成视频。
                  </p>
                  <button
                    onClick={onClose}
                    className="mt-6 px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-lg font-medium hover:from-purple-700 hover:to-pink-700 transition-all"
                  >
                    关闭
                  </button>
                </div>
              </div>
            </motion.div>
          )}

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
            onError={handleVideoError}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
          />

          {/* 视频信息覆盖层 */}
          <div className="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-black/80 via-black/50 to-transparent pointer-events-none">
            <div className="max-w-2xl">
              <h2 className="text-white text-2xl font-bold mb-2">
                {series.title}
              </h2>
              <h3 className="text-gray-300 text-lg mb-2">
                第{currentEpisode.episodeNumber}集: {currentEpisode.title}
              </h3>
              <p className="text-gray-400 text-sm line-clamp-2">
                {currentEpisode.synopsis}
              </p>
            </div>
          </div>

          {/* 上一集/下一集按钮 */}
          <div className="absolute top-1/2 left-0 right-0 flex justify-between px-4 transform -translate-y-1/2 pointer-events-none z-40">
            {currentEpisodeIndex > 0 && (
              <button
                onClick={handlePreviousEpisode}
                className="pointer-events-auto w-12 h-12 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center text-white hover:bg-black/70 transition-all"
              >
                <ChevronLeft className="w-8 h-8" />
              </button>
            )}
            <div className="flex-1" />
            {currentEpisodeIndex < episodes.length - 1 && (
              <button
                onClick={handleNextEpisode}
                className="pointer-events-auto w-12 h-12 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center text-white hover:bg-black/70 transition-all"
              >
                <ChevronRight className="w-8 h-8" />
              </button>
            )}
          </div>
        </div>

        {/* 剧集列表侧边栏 */}
        <AnimatePresence>
          {showEpisodeList && (
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              className="fixed lg:relative top-0 right-0 w-full lg:w-96 h-full bg-gradient-to-br from-slate-950/95 via-purple-950/95 to-slate-950/95 backdrop-blur-xl border-l border-white/10 z-40 overflow-y-auto"
            >
              <div className="p-6">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-white text-lg font-bold flex items-center gap-2">
                    <Film className="w-5 h-5" />
                    选集
                  </h3>
                  <button
                    onClick={() => setShowEpisodeList(false)}
                    className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-gray-400 hover:text-white transition-all"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="space-y-3">
                  {episodes.map((episode, index) => (
                    <button
                      key={episode.id}
                      onClick={() => handleSelectEpisode(index)}
                      className={`w-full p-4 rounded-xl text-left transition-all ${
                        index === currentEpisodeIndex
                          ? 'bg-gradient-to-r from-purple-500/30 to-pink-500/30 border border-purple-500/50'
                          : 'bg-white/5 hover:bg-white/10 border border-white/10'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <div className={`flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold ${
                          index === currentEpisodeIndex
                            ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white'
                            : 'bg-white/10 text-gray-400'
                        }`}>
                          {episode.episodeNumber}
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className="text-white font-medium mb-1 truncate">
                            {episode.title}
                          </h4>
                          <p className="text-gray-400 text-xs line-clamp-2 mb-2">
                            {episode.synopsis}
                          </p>
                          <div className="flex items-center gap-3 text-xs text-gray-500">
                            {episode.status === 'completed' ? (
                              <>
                                <span className="flex items-center gap-1">
                                  <Play className="w-3 h-3" />
                                  {episode.completedStoryboardCount}个分镜
                                </span>
                                <span className="flex items-center gap-1">
                                  <Clock className="w-3 h-3" />
                                  {Math.floor(episode.totalDuration / 60)}分钟
                                </span>
                              </>
                            ) : (
                              <span className="text-yellow-400">生成中...</span>
                            )}
                          </div>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* 评论区 */}
        {showComments && !showEpisodeList && (
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="fixed lg:relative bottom-0 right-0 w-full lg:w-96 h-2/3 lg:h-full bg-gradient-to-br from-slate-950/95 via-purple-950/95 to-slate-950/95 backdrop-blur-xl border-l border-white/10 z-40"
          >
            <CommentSection
              comments={comments}
              commentText={commentText}
              isLoadingComments={isLoadingComments}
              onCommentTextChange={setCommentText}
              onSubmitComment={handleComment}
            />
          </motion.div>
        )}

        {/* 桌面端互动栏 */}
        <div className="hidden lg:block absolute bottom-24 right-4">
          <InteractionBar
            isLiked={isLiked}
            likes={likes}
            commentsCount={comments.length}
            onLike={handleLike}
            onComment={() => {
              setShowComments(!showComments);
              if (!showComments) setShowEpisodeList(false);
            }}
            onShare={handleShare}
            onDownload={handleDownload}
          />
        </div>
      </div>
    </motion.div>
  );
}