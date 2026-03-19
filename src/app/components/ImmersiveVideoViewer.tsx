import { useState, useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import { X, Heart, MessageCircle, Share2, Download } from 'lucide-react';
import { toast } from 'sonner';
import * as communityAPI from '../services';
import { VideoPlayer, InteractionBar, CommentSection, useImmersiveSharing, useImmersiveNavigation } from './immersive';
import { useFullscreen, useLike, useComments, useVideoPlayer } from '../hooks';
import { apiPost, ASPECT_RATIO_LABELS, getErrorMessage } from '../utils';
import type { RawWork } from '../utils';

interface ImmersiveVideoViewerProps {
  work: RawWork;
  allWorks?: RawWork[]; // 所有视频列表
  userPhone?: string;
  onClose: () => void;
  onWorkChange?: (work: RawWork) => void; // 切换视频的回调
}

export function ImmersiveVideoViewer({ work, allWorks, userPhone, onClose, onWorkChange }: ImmersiveVideoViewerProps) {
  // 使用自定义hooks
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  // v6.0.80: 从work对象提取画面比例（可能来自metadata或直接字段）
  const aspectRatio = work.aspectRatio || work.metadata?.aspectRatio || undefined;
  
  // 视频URL状态
  const [currentVideoUrl, setCurrentVideoUrl] = useState(() => {
    const url = work.videoUrl || work.video_url || '';
    return url;
  });
  const [urlExpired, setUrlExpired] = useState(false);
  const [isLoadingVideo, setIsLoadingVideo] = useState(false);
  const [videoError, setVideoError] = useState<string | null>(null);
  // 签名URL状态
  const [signedVideoUrl, setSignedVideoUrl] = useState<string>('');
  const [isSigningUrl, setIsSigningUrl] = useState(false);
  
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
  
  const {
    isLiked,
    likes,
    handleLike,
  } = useLike(work.id, userPhone);
  
  const {
    comments,
    commentText,
    showComments,
    isLoadingComments,
    setCommentText,
    setShowComments,
    handleComment,
  } = useComments(work.id, userPhone);

  // 分享逻辑 hook
  const {
    handleShare,
    handleDownload,
  } = useImmersiveSharing({ work });

  // 导航逻辑 hook
  const {
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
    handleWheel,
    markClosing,
  } = useImmersiveNavigation({
    work,
    allWorks,
    onWorkChange,
    showComments,
    setIsPlaying,
    setCurrentTime,
    setCurrentVideoUrl,
    setUrlExpired,
    setIsLoadingVideo,
  });

  // 获取OSS签名URL
  const getSignedUrl = async (url: string): Promise<string> => {
    if (!url.includes('aliyuncs.com')) {
      return url;
    }

    setIsSigningUrl(true);
    const result = await apiPost('oss/sign-url', { url });
    setIsSigningUrl(false);

    if (result.success && result.data?.signedUrl) {
      return result.data.signedUrl;
    }
    
    return url;
  };

  // 检查URL是否过期
  const checkUrlExpired = (url: string): boolean => {
    const urlDateMatch = url.match(/X-Tos-Date=(\d{8})/);
    if (!urlDateMatch) return false;
    
    const urlDate = urlDateMatch[1];
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    
    return urlDate < today;
  };

  // 初始化 - 获取签名URL
  useEffect(() => {
    const initializeVideo = async () => {
      const urlString = work.videoUrl || work.video_url || '';
      
      if (!urlString || urlString.trim() === '' || !urlString.startsWith('http')) {
        console.warn('[ImmersiveVideoViewer] No valid video URL for work:', work.id, 'url:', urlString);
        setVideoError('视频尚未生成或URL不可用');
        return;
      }
      
      setCurrentVideoUrl(urlString);
      setIsPlaying(true);
      
      // 如果URL是OSS URL，获取签名URL
      if (urlString.includes('aliyuncs.com') || urlString.includes('oss-')) {
        const signed = await getSignedUrl(urlString);
        setSignedVideoUrl(signed);
        communityAPI.incrementViews(work.id).catch(() => {});
        return;
      }
      
      // 检查是否过期
      const isExpired = checkUrlExpired(urlString);
      
      if (isExpired) {
        // 不要直接关闭，而是显示过期覆盖层让用户尝试恢复
        setSignedVideoUrl(urlString); // 仍然设置URL，让恢复按钮有context
        setUrlExpired(true);
        communityAPI.incrementViews(work.id).catch(() => {});
      } else {
        setSignedVideoUrl(urlString);
        communityAPI.incrementViews(work.id).catch(() => {});
      }
    };

    initializeVideo();
  }, [work.id, work.videoUrl, work.video_url, onClose]);

  const handleVideoError = async () => {
    const urlString = currentVideoUrl || '';
    const isExpired = checkUrlExpired(urlString);
    
    if (isExpired || urlString.includes('volces.com')) {
      console.error('[ImmersiveVideoViewer] Video URL is expired or from Volcengine');
      setUrlExpired(true);
    } else {
      console.error('[ImmersiveVideoViewer] Video playback failed for unknown reason');
      setUrlExpired(true);
    }
  };

  // 尝试刷新视频URL
  const handleRefreshVideo = async () => {
    setIsLoadingVideo(true);
    try {
      const result = await communityAPI.refreshVideoUrl(work.id);
      if (result.success && result.videoUrl) {
        setCurrentVideoUrl(result.videoUrl);
        const signed = await getSignedUrl(result.videoUrl);
        setSignedVideoUrl(signed);
        setUrlExpired(false);
        setIsPlaying(true);
        toast.success('视频已恢复');
      } else {
        toast.error(result.error || '恢复失败，请重新生成视频');
      }
    } catch (err: unknown) {
      console.error('[ImmersiveVideoViewer] Refresh failed:', err);
      toast.error('恢复失败: ' + getErrorMessage(err));
    } finally {
      setIsLoadingVideo(false);
    }
  };

  // 禁用body滚动，组件卸载时恢复
  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    const originalPosition = document.body.style.position;
    
    document.body.style.overflow = 'hidden';
    document.body.style.position = 'fixed';
    document.body.style.width = '100%';
    document.body.style.height = '100%';
    
    return () => {
      document.body.style.overflow = originalOverflow;
      document.body.style.position = originalPosition;
      document.body.style.width = '';
      document.body.style.height = '';
    };
  }, []);

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
        onClick={() => {
          markClosing();
          onClose();
        }}
        className="absolute top-4 left-4 z-50 w-10 h-10 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center text-white hover:bg-black/70 transition-all"
      >
        <X className="w-6 h-6" />
      </button>

      {/* v6.0.83: 画面比例标签 */}
      {aspectRatio && (
        <span className="absolute top-4 right-4 z-50 px-2 py-1 rounded-lg bg-black/50 backdrop-blur-sm text-[11px] text-white/80 font-medium pointer-events-none">
          {aspectRatio} {ASPECT_RATIO_LABELS[aspectRatio] || ''}
        </span>
      )}

      <div className="w-full h-full flex flex-col lg:flex-row">
        {/* 视频播放区 */}
        <div 
          className="flex-1 relative"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onWheel={handleWheel}
        >
          {/* 视频过期提示 */}
          {urlExpired && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="absolute inset-0 z-30 flex items-center justify-center bg-black/80 backdrop-blur-sm"
            >
              <div className="max-w-md mx-4 p-8 bg-gradient-to-br from-red-500/20 to-orange-500/20 backdrop-blur-xl rounded-2xl border border-red-500/30 shadow-2xl">
                <div className="text-center space-y-4">
                  <div className="text-6xl">&#9888;&#65039;</div>
                  <h3 className="text-2xl font-bold text-white">视频链接已过期</h3>
                  <p className="text-gray-300 leading-relaxed">
                    视频临时URL已过期。点击下方按钮尝试恢复视频。
                  </p>
                  <div className="flex gap-3 justify-center">
                    <button
                      onClick={handleRefreshVideo}
                      disabled={isLoadingVideo}
                      className="px-6 py-3 bg-gradient-to-r from-blue-600 to-cyan-600 text-white rounded-lg font-medium hover:from-blue-700 hover:to-cyan-700 transition-all disabled:opacity-50"
                    >
                      {isLoadingVideo ? '恢复中...' : '尝试恢复视频'}
                    </button>
                    <button
                      onClick={() => { markClosing(); onClose(); }}
                      className="px-6 py-3 bg-white/10 text-white rounded-lg font-medium hover:bg-white/20 transition-all"
                    >
                      关闭
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          )
          }
          <VideoPlayer
            videoUrl={signedVideoUrl}
            isPlaying={isPlaying}
            isMuted={isMuted}
            currentTime={currentTime}
            duration={duration}
            isFullscreen={isFullscreen}
            fullscreenSupported={fullscreenSupported}
            aspectRatio={aspectRatio}
            onPlayPause={() => setIsPlaying(!isPlaying)}
            onMuteToggle={() => setIsMuted(!isMuted)}
            onTimeUpdate={setCurrentTime}
            onLoadedMetadata={setDuration}
            onToggleFullscreen={toggleFullscreen}
            onVideoRef={(ref) => { videoRef.current = ref; }}
            onError={handleVideoError}
          />
        </div>

        {/* 右侧评论区（桌面端）或底部抽屉（动端） */}
        {showComments && (
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
            onComment={() => setShowComments(!showComments)}
            onShare={handleShare}
            onDownload={handleDownload}
          />
        </div>

        {/* v6.0.19: 移动端底部互动栏 */}
        <div className="lg:hidden absolute bottom-0 left-0 right-0 z-40" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
          <div className="flex items-center justify-around px-4 py-2.5 bg-black/70 backdrop-blur-xl border-t border-white/10">
            <button onClick={handleLike} className="flex flex-col items-center gap-0.5 active:scale-95 transition-transform">
              <Heart className={`w-5 h-5 ${isLiked ? 'fill-pink-500 text-pink-500' : 'text-white'}`} />
              <span className="text-[10px] text-white/70">{likes || '赞'}</span>
            </button>
            <button onClick={() => setShowComments(!showComments)} className="flex flex-col items-center gap-0.5 active:scale-95 transition-transform">
              <MessageCircle className="w-5 h-5 text-white" />
              <span className="text-[10px] text-white/70">{comments.length || '评论'}</span>
            </button>
            <button onClick={handleShare} className="flex flex-col items-center gap-0.5 active:scale-95 transition-transform">
              <Share2 className="w-5 h-5 text-white" />
              <span className="text-[10px] text-white/70">分享</span>
            </button>
            <button onClick={handleDownload} className="flex flex-col items-center gap-0.5 active:scale-95 transition-transform">
              <Download className="w-5 h-5 text-white" />
              <span className="text-[10px] text-white/70">下载</span>
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}