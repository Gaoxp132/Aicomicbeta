/**
 * 播放列表视频播放器
 * 支持连续播放多个视频（虚拟合并方案）
 * v6.0.13: 双缓冲方案——预加载下一个视频，切换时无缝衔接
 *          iOS Safari 兼容：检测 iOS 后降级为单 video 顺序切换
 * v6.0.23: 拆分为 usePlaylistLoader + usePlaylistPlayback hooks
 * v6.0.58: handleVideoError DRY重构——提取reloadAndPlay/updateCurrentVideoUrl helper
 */

import { useState } from 'react';
import { apiPost } from '../utils';
import { usePlaylistLoader, usePlaylistPlayback } from '../hooks/media';
import { PlaylistErrorView, PlaylistControls, PlaylistOverlays } from './playlist';

const MAX_RETRIES = 2;

interface PlaylistVideoPlayerProps {
  playlistUrl: string;
  className?: string;
  autoPlay?: boolean;
  style?: React.CSSProperties;
  onPlay?: () => void;
  onPause?: () => void;
  onPlaylistEnded?: () => void;
}

export function PlaylistVideoPlayer({
  playlistUrl,
  className = '',
  autoPlay = false,
  style,
  onPlay,
  onPause,
  onPlaylistEnded,
}: PlaylistVideoPlayerProps) {
  const { playlist, setPlaylist, isLoading, error, setError } = usePlaylistLoader(playlistUrl);
  const [retryCount, setRetryCount] = useState<Map<number, number>>(new Map());
  const [showQuickTest, setShowQuickTest] = useState(false);

  const playback = usePlaylistPlayback({
    playlist,
    autoPlay,
    onPlay,
    onPause,
    onPlaylistEnded,
  });

  // --- 错误恢复 helpers ---

  /** 重新加载视频并在需要时自动播放 */
  const reloadAndPlay = (video: HTMLVideoElement) => {
    video.load();
    if (playback.isPlaying || autoPlay) {
      setTimeout(() => { video.play().catch(() => {}); }, 500);
    }
  };

  /** 更新当前视频的URL（同步playlist state + video element） */
  const updateCurrentVideoUrl = (video: HTMLVideoElement, newUrl: string) => {
    if (playlist) {
      const updatedVideos = [...playlist.videos];
      updatedVideos[playback.currentIndex] = { ...playback.currentVideo!, url: newUrl };
      setPlaylist({ ...playlist, videos: updatedVideos });
    }
    video.src = newUrl;
  };

  // 视频错误处理
  const handleVideoError = async (e: React.SyntheticEvent<HTMLVideoElement>) => {
    const video = e.currentTarget;
    const errorCode = video.error?.code;

    const errorExplanations: Record<number, string> = {
      1: '视频加载中止',
      2: '网络错误，请检查网络连接',
      3: '视频解码失败，可能文件已损坏',
      4: '视频格不支持或URL无效',
    };
    const errorExplanation = errorExplanations[errorCode || 0] || '未知错误';
    const currentRetries = retryCount.get(playback.currentIndex) || 0;

    // 更新重试计数的 helper
    const bumpRetry = () => {
      const m = new Map(retryCount);
      m.set(playback.currentIndex, currentRetries + 1);
      setRetryCount(m);
    };

    // 策略1: 移除crossOrigin重试
    if (errorCode === 4 && currentRetries === 0) {
      bumpRetry();
      video.removeAttribute('crossOrigin');
      reloadAndPlay(video);
      return;
    }

    // 策略2&3: OSS URL修复
    if (errorCode === 4 && playback.currentVideo?.url.includes('aliyuncs.com') && currentRetries < MAX_RETRIES) {
      bumpRetry();
      try {
        // 策略2: 重新签名URL
        if (currentRetries === 0) {
          const signResult = await apiPost('oss/sign-urls', {
            urls: [playback.currentVideo!.url],
            expiresIn: 7200,
          });
          if (signResult.success && signResult.data?.results?.[0]?.success && signResult.data.results[0].signedUrl) {
            updateCurrentVideoUrl(video, signResult.data.results[0].signedUrl);
            reloadAndPlay(video);
            return;
          }
        }
        // 策略3: 剥离过期签名参数
        if (currentRetries === 1) {
          const urlObj = new URL(playback.currentVideo!.url);
          ['OSSAccessKeyId', 'Expires', 'Signature', 'security-token',
            'response-content-type', 'response-content-disposition', 'x-oss-process'].forEach(p =>
            urlObj.searchParams.delete(p)
          );
          const cleanUrl = urlObj.toString();
          if (cleanUrl !== playback.currentVideo!.url) {
            updateCurrentVideoUrl(video, cleanUrl);
            reloadAndPlay(video);
            return;
          }
        }
      } catch {
        // URL修复失败，继续到下方fallback逻辑
      }
    }

    // Fallback: 跳到下一个视频或显示错误
    const retries = retryCount.get(playback.currentIndex) || 0;
    if ((errorCode === 4 || errorCode === 2) && playback.currentIndex < playlist!.videos.length - 1) {
      const retriesText = retries >= MAX_RETRIES ? ` (已重试${retries}次)` : '';
      setError(`分镜 ${playback.currentIndex + 1} ${errorExplanation}${retriesText}，自动跳到下一个`);
      setTimeout(() => { playback.nextVideo(); setError(null); }, 2000);
    } else {
      const retriesText = retries > 0 ? ` (已重试${retries}次)` : '';
      setError(`分镜 ${playback.currentIndex + 1} 播放失败: ${errorExplanation}${retriesText}`);
    }
  };

  // --- Render ---

  if (isLoading) {
    return (
      <div className={`flex items-center justify-center bg-black ${className}`}>
        <div className="text-white">加载播放列表...</div>
      </div>
    );
  }

  if ((error && !playlist) || !playlist || !playback.currentVideo) {
    return (
      <PlaylistErrorView
        error={error}
        playlist={playlist}
        currentVideo={playback.currentVideo}
        className={className}
        onLoadingChange={() => {}}
      />
    );
  }

  // 为双缓冲视频元素生成事件 handler
  const slotHandlers = (slot: 'A' | 'B') => {
    const isActive = playback.activeSlot === slot;
    return {
      onEnded: isActive ? playback.handleVideoEnded : undefined,
      onTimeUpdate: isActive ? playback.handleTimeUpdate : undefined,
      onPlay: isActive ? () => { playback.setIsPlaying(true); onPlay?.(); } : undefined,
      onPause: isActive ? () => { playback.setIsPlaying(false); onPause?.(); } : undefined,
      onLoadStart: isActive ? () => playback.setIsVideoLoading(true) : undefined,
      onLoadedMetadata: isActive ? () => playback.setIsVideoLoading(false) : undefined,
      onWaiting: isActive ? () => playback.setIsBuffering(true) : undefined,
      onPlaying: isActive ? () => playback.setIsBuffering(false) : undefined,
      onError: isActive ? handleVideoError : undefined,
    };
  };

  return (
    <div className={`relative bg-black ${className}`} style={style}>
      {/* 双缓冲视频播放器 — crossfade 过渡 */}
      <video
        ref={playback.videoRefA}
        className={`w-full h-full object-contain absolute inset-0 transition-opacity duration-700 ease-in-out ${playback.activeSlot === 'A' ? 'z-[1] opacity-100' : 'z-0 opacity-0 pointer-events-none'}`}
        playsInline
        preload="auto"
        muted={playback.isMuted}
        webkit-playsinline="true"
        x5-playsinline="true"
        controlsList="nodownload"
        {...slotHandlers('A')}
      />
      <video
        ref={playback.videoRefB}
        className={`w-full h-full object-contain absolute inset-0 transition-opacity duration-700 ease-in-out ${playback.activeSlot === 'B' ? 'z-[1] opacity-100' : 'z-0 opacity-0 pointer-events-none'}`}
        playsInline
        preload="auto"
        muted={playback.isMuted}
        webkit-playsinline="true"
        x5-playsinline="true"
        controlsList="nodownload"
        {...slotHandlers('B')}
      />

      {/* 控制栏 */}
      <PlaylistControls
        playlist={playlist}
        currentIndex={playback.currentIndex}
        isPlaying={playback.isPlaying}
        isMuted={playback.isMuted}
        progress={playback.progress}
        videoRef={playback.videoRef}
        onTogglePlay={playback.togglePlay}
        onToggleMute={playback.toggleMute}
        onNext={playback.nextVideo}
        onPrevious={playback.previousVideo}
        onSeekTo={playback.handleSeekTo}
      />

      {/* 叠加层 */}
      <PlaylistOverlays
        playlist={playlist}
        currentIndex={playback.currentIndex}
        isPlaying={playback.isPlaying}
        isVideoLoading={playback.isVideoLoading}
        isBuffering={playback.isBuffering}
        error={error}
        showQuickTest={showQuickTest}
        onTogglePlay={playback.togglePlay}
        onShowQuickTest={setShowQuickTest}
      />
    </div>
  );
}