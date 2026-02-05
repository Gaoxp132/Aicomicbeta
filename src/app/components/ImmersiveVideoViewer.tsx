import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X } from 'lucide-react';
import { toast } from 'sonner';
import * as communityAPI from '../services/community';
import { VideoPlayer } from './immersive/VideoPlayer';
import { InteractionBar } from './immersive/InteractionBar';
import { CommentSection } from './immersive/CommentSection';
import { ShareMenu } from './immersive/ShareMenu';
import { useFullscreen } from '../hooks/useFullscreen';
import { useLike } from '../hooks/useLike';
import { useComments } from '../hooks/useComments';
import { useVideoPlayer } from '../hooks/useVideoPlayer';
import { projectId, publicAnonKey } from '/utils/supabase/info';

interface ImmersiveVideoViewerProps {
  work: any;
  allWorks?: any[]; // 所有视频列表
  userPhone?: string;
  onClose: () => void;
  onWorkChange?: (work: any) => void; // 切换视频的回调
}

export function ImmersiveVideoViewer({ work, allWorks, userPhone, onClose, onWorkChange }: ImmersiveVideoViewerProps) {
  // 使用自定义hooks
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  // 视频URL状态
  const [currentVideoUrl, setCurrentVideoUrl] = useState(work.videoUrl || work.video_url);
  const [urlExpired, setUrlExpired] = useState(false);
  const [isLoadingVideo, setIsLoadingVideo] = useState(false); // ✨ 添加视频加载状态
  // 🆕 签名URL状态
  const [signedVideoUrl, setSignedVideoUrl] = useState<string>('');
  const [isSigningUrl, setIsSigningUrl] = useState(false);
  
  // 🆕 滑动相关状态
  const touchStartY = useRef(0);
  const touchStartTime = useRef(0);
  const [isSwiping, setIsSwiping] = useState(false);
  const lastWheelTime = useRef(0); // 🆕 用于防抖的时间戳
  const isSwitching = useRef(false); // ✨ 添加切换锁，避免快速连续切换
  const isClosing = useRef(false); // 🆕 添加关闭标志，防止关闭时触发事件
  
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
  
  // 分享状态
  const [showShareMenu, setShowShareMenu] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);

  // 🆕 获取OSS签名URL
  const getSignedUrl = async (url: string): Promise<string> => {
    try {
      // 只处理OSS URL
      if (!url.includes('aliyuncs.com')) {
        return url;
      }

      console.log('[ImmersiveVideoViewer] Getting signed URL for:', url.substring(0, 100) + '...');
      setIsSigningUrl(true);

      const response = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-fc31472c/oss/sign-url`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${publicAnonKey}`,
        },
        body: JSON.stringify({ url }),
      });

      if (!response.ok) {
        console.error('[ImmersiveVideoViewer] Failed to sign URL:', response.status, await response.text());
        return url; // 返回原URL作为fallback
      }

      const result = await response.json();
      if (result.success && result.data?.signedUrl) {
        console.log('[ImmersiveVideoViewer] ✅ Got signed URL');
        return result.data.signedUrl;
      }
      
      console.error('[ImmersiveVideoViewer] Sign URL response invalid:', result);
      return url;
    } catch (error: any) {
      console.error('[ImmersiveVideoViewer] Error signing URL:', error);
      return url;
    } finally {
      setIsSigningUrl(false);
    }
  };

  // ✨ 检查URL是否过期
  const checkUrlExpired = (url: string): boolean => {
    const urlDateMatch = url.match(/X-Tos-Date=(\d{8})/);
    if (!urlDateMatch) return false;
    
    const urlDate = urlDateMatch[1];
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    
    return urlDate < today;
  };

  // 🆕 初始化 - 获取签名URL
  useEffect(() => {
    const initializeVideo = async () => {
      // 调试：打印 work 数据
      console.log('[ImmersiveVideoViewer] Work data:', {
        id: work.id,
        title: work.title,
        videoUrl: work.videoUrl,
        video_url: work.video_url,
        thumbnail: work.thumbnail,
        prompt: work.prompt,
        task_id: work.task_id,
        taskId: work.taskId,
      });
      
      // 🎬 自动播放视频
      setIsPlaying(true);
      
      // 检查URL是否已过期
      const urlString = work.videoUrl || work.video_url || '';
      setCurrentVideoUrl(urlString);
      
      // 如果URL已经是OSS URL，获取签名URL
      if (urlString.includes('aliyuncs.com') || urlString.includes('oss-')) {
        console.log('[ImmersiveVideoViewer] ✅ Video is on OSS, getting signed URL');
        const signed = await getSignedUrl(urlString);
        setSignedVideoUrl(signed);
        communityAPI.incrementViews(work.id).catch(() => {});
        return;
      }
      
      // 否则检查是否过期
      const isExpired = checkUrlExpired(urlString);
      
      if (isExpired) {
        const urlDateMatch = urlString.match(/X-Tos-Date=(\d{8})/);
        const urlDate = urlDateMatch ? urlDateMatch[1] : 'unknown';
        const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        
        console.error('[ImmersiveVideoViewer] ❌ Video URL is expired (from', urlDate, ', today is', today, ')');
        console.error('[ImmersiveVideoViewer] This video should have been filtered out');
        
        // ❌ 直接关闭查看器，不显示过期视频
        toast.error('视频链接已过期');
        onClose();
        return;
      } else {
        console.log('[ImmersiveVideoViewer] ✅ Video URL is fresh');
        setSignedVideoUrl(urlString);
        // 增加浏览量
        communityAPI.incrementViews(work.id).catch(() => {});
      }
    };

    initializeVideo();
  }, [work.id, work.videoUrl, work.video_url, onClose]);

  const handleVideoError = async () => {
    console.log('[ImmersiveVideoViewer] 🔄 Video playback error detected');
    
    // 检查是否是因为URL过期
    const urlString = currentVideoUrl || '';
    const isExpired = checkUrlExpired(urlString);
    
    if (isExpired || urlString.includes('volces.com')) {
      console.error('[ImmersiveVideoViewer] ❌ Video URL is expired or from Volcengine');
      console.error('[ImmersiveVideoViewer] This video should have been auto-transferred to OSS');
      setUrlExpired(true);
    } else {
      console.error('[ImmersiveVideoViewer] ❌ Video playback failed for unknown reason');
      setUrlExpired(true);
    }
  };

  const handleShare = async () => {
    setShowShareMenu(!showShareMenu);
  };

  const handleDownload = async () => {
    try {
      const videoUrl = work.videoUrl || work.video_url;
      
      // 方案1: 尝试使用 <a> 标签直接下载（适用于同源或配置了CORS的资源）
      const a = document.createElement('a');
      a.href = videoUrl;
      a.download = `${work.title || 'video'}.mp4`;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      
      // 某些浏览器需要将元素添加到DOM
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      
      console.log('Download initiated for:', work.title);
    } catch (error) {
      console.error('Failed to download video:', error);
      // 如果下载失败，在新标签页打开视频
      window.open(work.videoUrl || work.video_url, '_blank');
    }
  };

  const handleCopyLink = async () => {
    const url = window.location.href;
    
    // 优先使用 Clipboard API
    if (navigator.clipboard && navigator.clipboard.writeText) {
      try {
        await navigator.clipboard.writeText(url);
        setLinkCopied(true);
        setTimeout(() => setLinkCopied(false), 2000);
        return; // 成功则直接返回
      } catch (clipboardError) {
        // 静默处理 Clipboard API 错误，直接降级
        // 不打印错误日志，避免控制台报错
      }
    }
    
    // 降级方案1：使用传统的 document.execCommand
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
        return; // 成功则返回
      }
    } catch (err) {
      // execCommand 失败也静默处理
    }
    
    document.body.removeChild(textArea);
    
    // 降级方案2：显示链接让用户手动复制
    try {
      prompt('请复制以下链接：', url);
    } catch (promptError) {
      // 如果连 prompt 都失败，则完全静默（极少见）
    }
  };

  const handleWeChatShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: work.title || '精彩视频',
          text: work.prompt || '快来看看这个精彩视频！',
          url: window.location.href,
        });
      } catch (error) {
        console.error('Failed to share:', error);
      }
    }
  };

  // 🎯 切换视频的核心逻辑
  const switchVideo = (direction: 'up' | 'down') => {
    // ✨ 使用切换锁，避免快速连续切换导致卡顿
    if (isSwitching.current) {
      console.log('[ImmersiveVideoViewer] ⏭️ Already switching, ignoring');
      return;
    }
    
    console.log('[ImmersiveVideoViewer] 🔄 switchVideo called, direction:', direction);
    console.log('[ImmersiveVideoViewer] Current work:', { id: work.id, title: work.title });
    console.log('[ImmersiveVideoViewer] allWorks:', allWorks);
    console.log('[ImmersiveVideoViewer] allWorks length:', allWorks?.length);
    console.log('[ImmersiveVideoViewer] allWorks IDs:', allWorks?.map(w => w.id));
    console.log('[ImmersiveVideoViewer] onWorkChange:', typeof onWorkChange);
    
    if (!allWorks || allWorks.length === 0) {
      console.log('[ImmersiveVideoViewer] ❌ No videos available for switching');
      return;
    }
    
    if (allWorks.length === 1) {
      console.log('[ImmersiveVideoViewer] ⚠️ Only one video available, cannot switch');
      return;
    }

    if (!onWorkChange) {
      console.log('[ImmersiveVideoViewer] ❌ onWorkChange callback not provided');
      return;
    }

    const currentIndex = allWorks.findIndex(w => w.id === work.id);
    console.log('[ImmersiveVideoViewer] Current work id:', work.id);
    console.log('[ImmersiveVideoViewer] Current index:', currentIndex);
    
    if (currentIndex === -1) {
      console.log('[ImmersiveVideoViewer] ❌ Current video not found in list');
      console.log('[ImmersiveVideoViewer] Looking for ID:', work.id);
      console.log('[ImmersiveVideoViewer] Available IDs:', allWorks.map(w => w.id));
      return;
    }

    let nextIndex: number;
    if (direction === 'up') {
      // 上滑 = 看上一个视频（索引-1）
      nextIndex = currentIndex - 1;
      if (nextIndex < 0) {
        console.log('[ImmersiveVideoViewer] ⚠️ Already at first video');
        return;
      }
    } else {
      // 下滑 = 看下一个视频（索引+1）
      nextIndex = currentIndex + 1;
      if (nextIndex >= allWorks.length) {
        console.log('[ImmersiveVideoViewer] ⚠️ Already at last video');
        return;
      }
    }

    const nextWork = allWorks[nextIndex];
    console.log('[ImmersiveVideoViewer] ✅ Switching to video at index', nextIndex, ':', nextWork.id, nextWork.title);
    
    // ✨ 设置切换锁
    isSwitching.current = true;
    setIsLoadingVideo(true);
    
    // ✨ 先暂停当前视频
    setIsPlaying(false);
    
    // 切换视频
    onWorkChange(nextWork);
    setCurrentVideoUrl(nextWork.videoUrl || nextWork.video_url);
    setUrlExpired(false);
    
    // ✨ 延迟解锁，给视频加载留出时间
    setTimeout(() => {
      isSwitching.current = false;
      setIsLoadingVideo(false);
      // 自动播放新视频
      setIsPlaying(true);
      setCurrentTime(0);
    }, 500); // 500ms 后解锁
  };

  // 🆕 处理触摸滑动
  const handleTouchStart = (e: React.TouchEvent) => {
    // 如果评论区打开，不处理滑动
    if (showComments) {
      return;
    }
    
    console.log('[ImmersiveVideoViewer] 👆 Touch start detected');
    touchStartY.current = e.touches[0].clientY;
    touchStartTime.current = Date.now();
    setIsSwiping(false);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (showComments) return;
    
    const deltaY = e.touches[0].clientY - touchStartY.current;
    
    console.log('[ImmersiveVideoViewer] 👉 Touch move, deltaY:', deltaY);
    
    // ✨ 降低阈值，让触摸更灵敏（类似抖音，20px就能触发）
    if (Math.abs(deltaY) > 20) {
      setIsSwiping(true);
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (showComments || !isSwiping) {
      setIsSwiping(false);
      return;
    }
    
    const touchEndY = e.changedTouches[0].clientY;
    const deltaY = touchEndY - touchStartY.current;
    const deltaTime = Date.now() - touchStartTime.current;
    
    // ✨ 降低滑动阈值：滑动距离>50px 或 快速滑动>30px且时间<300ms
    const isValidSwipe = Math.abs(deltaY) > 50 || (Math.abs(deltaY) > 30 && deltaTime < 300);
    
    console.log('[ImmersiveVideoViewer] 🎯 Touch end, deltaY:', deltaY, 'deltaTime:', deltaTime, 'valid:', isValidSwipe);
    
    if (isValidSwipe) {
      if (deltaY > 0) {
        // 向下滑动 = 看上一个视频
        console.log('[ImmersiveVideoViewer] ⬇️ Swipe down detected, switching to previous video');
        switchVideo('up');
      } else {
        // 向上滑动 = 看下一个视频
        console.log('[ImmersiveVideoViewer] ⬆️ Swipe up detected, switching to next video');
        switchVideo('down');
      }
    }
    
    setIsSwiping(false);
  };

  // 🆕 处理鼠标滚轮（桌面端）
  const handleWheel = (e: React.WheelEvent) => {
    // 🚨 如果组件正在关闭，忽略所有交互
    if (isClosing.current) {
      console.log('[ImmersiveVideoViewer] ⏭️ Component is closing, ignoring wheel event');
      return;
    }
    
    // 如果评论区打开，不处理滚轮
    if (showComments) {
      return;
    }
    
    console.log('[ImmersiveVideoViewer] 🖱️ Wheel event, deltaY:', e.deltaY);
    
    // ✨ 降低阈值，让滚轮更灵敏（类似抖音）
    if (Math.abs(e.deltaY) < 10) {
      console.log('[ImmersiveVideoViewer] ⏭️ Wheel delta too small, ignoring');
      return;
    }
    
    // 防抖：避免滚轮事件过于频繁
    const currentTime = Date.now();
    if (currentTime - lastWheelTime.current < 300) {
      console.log('[ImmersiveVideoViewer] ⏭️ Wheel debounced (too fast)');
      return;
    }
    
    // 更新防抖时间戳
    lastWheelTime.current = currentTime;
    
    console.log('[ImmersiveVideoViewer] 🎯 Valid wheel event, switching video, deltaY:', e.deltaY);
    
    if (e.deltaY < 0) {
      // 向上滚动 = 看上一个视频
      console.log('[ImmersiveVideoViewer] ⬆️ Wheel up detected, switching to previous video');
      switchVideo('up');
    } else {
      // 向下滚动 = 看下一个视频
      console.log('[ImmersiveVideoViewer] ⬇️ Wheel down detected, switching to next video');
      switchVideo('down');
    }
  };
  
  // ✨ 禁用body滚动，组件卸载时恢复
  useEffect(() => {
    console.log('[ImmersiveVideoViewer] 🔒 Disabling body scroll');
    
    // 保存原始样式
    const originalOverflow = document.body.style.overflow;
    const originalPosition = document.body.style.position;
    
    // 禁用body滚动
    document.body.style.overflow = 'hidden';
    document.body.style.position = 'fixed';
    document.body.style.width = '100%';
    document.body.style.height = '100%';
    
    // 清理函数：恢复滚动
    return () => {
      console.log('[ImmersiveVideoViewer] 🔓 Restoring body scroll');
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
          console.log('[ImmersiveVideoViewer] 🚪 Close button clicked, setting closing flag');
          isClosing.current = true; // 设置关闭标志，阻止所有后续交互
          onClose();
        }}
        className="absolute top-4 left-4 z-50 w-10 h-10 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center text-white hover:bg-black/70 transition-all"
      >
        <X className="w-6 h-6" />
      </button>

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
                  <div className="text-6xl">⚠️</div>
                  <h3 className="text-2xl font-bold text-white">视频链接已过期</h3>
                  <p className="text-gray-300 leading-relaxed">
                    由于火山引擎的安全策略，视频签名URL有效期仅为24时。<br />
                    {currentVideoUrl && currentVideoUrl.match(/X-Tos-Date=(\d{8})/) ? (
                      <>该视频生成于 <span className="font-mono text-yellow-400">{currentVideoUrl.match(/X-Tos-Date=(\d{8})/)?.[1]}</span>，已无法访问。</>
                    ) : (
                      <>视频URL无效或已过期。</>
                    )}
                  </p>
                  <div className="pt-4 space-y-2">
                    <p className="text-sm text-gray-400">建议操作：</p>
                    <ul className="text-left text-sm text-gray-300 space-y-1">
                      <li>• 重新生成一个新视频</li>
                      <li>• 或联系技术支持获取帮助</li>
                    </ul>
                  </div>
                  <button
                    onClick={onClose}
                    className="mt-6 px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-lg font-medium hover:from-purple-700 hover:to-pink-700 transition-all"
                  >
                    关闭
                  </button>
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
      </div>
    </motion.div>
  );
}