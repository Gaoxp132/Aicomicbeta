/**
 * 剧集播放器 - 顺序播放所有分镜视频
 * 支持自动切换、手动控制、进度显示
 */

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Play, Pause, Volume2, VolumeX, SkipBack, SkipForward, Maximize, Minimize } from 'lucide-react';
import { apiRequest } from '@/app/utils/apiClient';
import { projectId, publicAnonKey } from '/utils/supabase/info';
import Hls from 'hls.js';

interface Storyboard {
  id: string;
  episodeId: string;
  sceneNumber: number;
  description: string;
  dialogue?: string;
  duration: number;
  videoUrl?: string;
  status: string;
}

interface EpisodePlayerProps {
  episodeId: string;
  episodeTitle: string;
  seriesTitle: string;
  onClose: () => void;
}

export function EpisodePlayer({ episodeId, episodeTitle, seriesTitle, onClose }: EpisodePlayerProps) {
  // 分镜数据
  const [storyboards, setStoryboards] = useState<Storyboard[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // 播放控制
  const [isPlaying, setIsPlaying] = useState(true);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  
  // 进度控制
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  
  // 🆕 视频URL签名状态
  const [signedVideoUrl, setSignedVideoUrl] = useState<string>('');
  const [isSigningUrl, setIsSigningUrl] = useState(false);

  // 🆕 获取OSS签名URL
  const getSignedUrl = async (url: string): Promise<string> => {
    try {
      // 只处理OSS URL
      if (!url.includes('aliyuncs.com')) {
        return url;
      }

      console.log('[EpisodePlayer] Getting signed URL for:', url.substring(0, 100) + '...');
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
        console.error('[EpisodePlayer] Failed to sign URL:', response.status, await response.text());
        return url; // 返回原URL作为fallback
      }

      const result = await response.json();
      if (result.success && result.data?.signedUrl) {
        console.log('[EpisodePlayer] ✅ Got signed URL');
        return result.data.signedUrl;
      }
      
      console.error('[EpisodePlayer] Sign URL response invalid:', result);
      return url;
    } catch (error: any) {
      console.error('[EpisodePlayer] Error signing URL:', error);
      return url;
    } finally {
      setIsSigningUrl(false);
    }
  };

  // 加载分镜数据
  useEffect(() => {
    loadStoryboards();
  }, [episodeId]);

  const loadStoryboards = async () => {
    setIsLoading(true);
    setError(null);

    try {
      console.log('[EpisodePlayer] Loading storyboards for episode:', episodeId);
      
      const result = await apiRequest(`/episodes/${episodeId}/storyboards`, {
        method: 'GET',
      });

      if (result.success && result.data) {
        // 只保留有视频的分镜，并按场景号排序
        const validStoryboards = result.data
          .filter((sb: Storyboard) => sb.videoUrl && sb.status === 'completed')
          .sort((a: Storyboard, b: Storyboard) => a.sceneNumber - b.sceneNumber);

        console.log('[EpisodePlayer] ✅ Loaded', validStoryboards.length, 'storyboards with videos');
        
        if (validStoryboards.length === 0) {
          setError('该剧集暂无可播放的视频');
        } else {
          setStoryboards(validStoryboards);
        }
      } else {
        setError(result.error || '加载失败');
      }
    } catch (err: any) {
      console.error('[EpisodePlayer] Error loading storyboards:', err);
      setError(err.message || '加载失败');
    } finally {
      setIsLoading(false);
    }
  };

  // 🆕 当当前分镜改变时，获取签名URL并初始化播放器
  useEffect(() => {
    const initializeVideo = async () => {
      if (!currentStoryboard?.videoUrl || !videoRef.current) return;

      // 清理之前的HLS实例
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }

      console.log('[EpisodePlayer] Initializing video for scene:', currentStoryboard.sceneNumber);
      
      // 获取签名URL
      const finalUrl = await getSignedUrl(currentStoryboard.videoUrl);
      setSignedVideoUrl(finalUrl);

      const video = videoRef.current;
      const isM3U8 = finalUrl.endsWith('.m3u8') || finalUrl.includes('.m3u8?');

      if (isM3U8 && Hls.isSupported()) {
        // 使用HLS.js播放M3U8
        console.log('[EpisodePlayer] Using HLS.js for M3U8');
        const hls = new Hls({
          enableWorker: true,
          lowLatencyMode: false,
        });
        
        hlsRef.current = hls;
        
        hls.loadSource(finalUrl);
        hls.attachMedia(video);
        
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          console.log('[EpisodePlayer] HLS manifest parsed');
          video.muted = isMuted;
          if (isPlaying) {
            video.play().catch(err => console.error('[EpisodePlayer] Play error:', err));
          }
        });
        
        hls.on(Hls.Events.ERROR, (event, data) => {
          console.error('[EpisodePlayer] HLS error:', data);
          if (data.fatal) {
            switch (data.type) {
              case Hls.ErrorTypes.NETWORK_ERROR:
                console.error('[EpisodePlayer] Fatal network error, retrying...');
                hls.startLoad();
                break;
              case Hls.ErrorTypes.MEDIA_ERROR:
                console.error('[EpisodePlayer] Fatal media error, recovering...');
                hls.recoverMediaError();
                break;
              default:
                console.error('[EpisodePlayer] Fatal error, destroying HLS');
                hls.destroy();
                break;
            }
          }
        });
      } else if (isM3U8 && video.canPlayType('application/vnd.apple.mpegurl')) {
        // iOS/Safari原生支持HLS
        console.log('[EpisodePlayer] Using native HLS support');
        video.src = finalUrl;
      } else {
        // 普通MP4
        console.log('[EpisodePlayer] Using standard video playback');
        video.src = finalUrl;
      }
    };

    initializeVideo();

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [currentIndex, currentStoryboard?.videoUrl]);

  // 当前分镜
  const currentStoryboard = storyboards[currentIndex];
  const hasVideo = currentStoryboard?.videoUrl;

  // 播放下一个分镜
  const playNext = () => {
    if (currentIndex < storyboards.length - 1) {
      console.log('[EpisodePlayer] Playing next storyboard');
      setCurrentIndex(currentIndex + 1);
      setCurrentTime(0);
      setIsPlaying(true);
    } else {
      console.log('[EpisodePlayer] Reached end of episode');
      // 播放完毕，暂停
      setIsPlaying(false);
    }
  };

  // 播放上一个分镜
  const playPrevious = () => {
    if (currentIndex > 0) {
      console.log('[EpisodePlayer] Playing previous storyboard');
      setCurrentIndex(currentIndex - 1);
      setCurrentTime(0);
      setIsPlaying(true);
    }
  };

  // 视频播放结束自动播放下一个
  useEffect(() => {
    if (!videoRef.current) return;

    const video = videoRef.current;
    const handleEnded = () => {
      console.log('[EpisodePlayer] Video ended, playing next');
      playNext();
    };

    video.addEventListener('ended', handleEnded);
    return () => video.removeEventListener('ended', handleEnded);
  }, [currentIndex, storyboards.length]);

  // 全屏控制
  const toggleFullscreen = async () => {
    if (!containerRef.current) return;

    try {
      if (!document.fullscreenElement) {
        await containerRef.current.requestFullscreen();
        setIsFullscreen(true);
      } else {
        await document.exitFullscreen();
        setIsFullscreen(false);
      }
    } catch (err) {
      console.error('[EpisodePlayer] Fullscreen error:', err);
    }
  };

  // 监听全屏变化
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  // 键盘快捷键
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case ' ':
        case 'k':
          e.preventDefault();
          setIsPlaying(!isPlaying);
          break;
        case 'ArrowLeft':
          e.preventDefault();
          playPrevious();
          break;
        case 'ArrowRight':
          e.preventDefault();
          playNext();
          break;
        case 'm':
          e.preventDefault();
          setIsMuted(!isMuted);
          break;
        case 'f':
          e.preventDefault();
          toggleFullscreen();
          break;
        case 'Escape':
          if (!document.fullscreenElement) {
            onClose();
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPlaying, isMuted, currentIndex]);

  // 格式化时间
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // 计算总进度
  const totalDuration = storyboards.reduce((sum, sb) => sum + (sb.duration || 0), 0);
  const elapsedDuration = storyboards.slice(0, currentIndex).reduce((sum, sb) => sum + (sb.duration || 0), 0) + currentTime;
  const totalProgress = totalDuration > 0 ? (elapsedDuration / totalDuration) * 100 : 0;

  return (
    <motion.div
      ref={containerRef}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black"
    >
      {/* 顶部信息栏 */}
      <div className="absolute top-0 left-0 right-0 z-30 bg-gradient-to-b from-black/80 to-transparent p-4">
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <h2 className="text-white text-lg font-bold truncate">{episodeTitle}</h2>
            <p className="text-gray-300 text-sm truncate">{seriesTitle}</p>
          </div>
          
          <button
            onClick={onClose}
            className="ml-4 w-10 h-10 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center text-white hover:bg-white/20 transition-all"
            title="关闭 (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 总体进度条 */}
        <div className="mt-3">
          <div className="flex items-center justify-between text-xs text-gray-300 mb-1">
            <span>第 {currentIndex + 1}/{storyboards.length} 个分镜</span>
            <span>{formatTime(elapsedDuration)} / {formatTime(totalDuration)}</span>
          </div>
          <div className="h-1 bg-white/20 rounded-full overflow-hidden">
            <div 
              className="h-full bg-gradient-to-r from-purple-500 to-pink-500 transition-all duration-300"
              style={{ width: `${totalProgress}%` }}
            />
          </div>
        </div>
      </div>

      {/* 视频播放区 */}
      <div className="w-full h-full flex items-center justify-center">
        {isLoading ? (
          <div className="text-center">
            <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-white mx-auto mb-4" />
            <p className="text-white">加载中...</p>
          </div>
        ) : error ? (
          <div className="text-center max-w-md mx-4">
            <div className="text-6xl mb-4">⚠️</div>
            <p className="text-white text-lg mb-4">{error}</p>
            <button
              onClick={loadStoryboards}
              className="px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-all"
            >
              重试
            </button>
          </div>
        ) : !hasVideo ? (
          <div className="text-center">
            <div className="text-6xl mb-4">🎬</div>
            <p className="text-white text-lg">视频生成中...</p>
          </div>
        ) : (
          <video
            ref={videoRef}
            src={signedVideoUrl}
            className="w-full h-full object-contain"
            controls={false}
            onError={() => console.error('[EpisodePlayer] Video error')}
            onLoadedMetadata={() => {
              if (videoRef.current) {
                setDuration(videoRef.current.duration);
                videoRef.current.muted = isMuted;
                if (isPlaying) {
                  videoRef.current.play().catch(err => console.error('Play error:', err));
                }
              }
            }}
            onTimeUpdate={(e) => {
              const video = e.target as HTMLVideoElement;
              setCurrentTime(video.currentTime);
              setDuration(video.duration);
            }}
          />
        )}
      </div>

      {/* 分镜信息显示（左下角） */}
      {currentStoryboard && (
        <AnimatePresence>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="absolute bottom-24 left-4 max-w-md z-20 bg-black/60 backdrop-blur-md rounded-lg p-4 text-white"
          >
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center font-bold">
                {currentStoryboard.sceneNumber}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-300 mb-1">场景描述</p>
                <p className="text-white leading-relaxed line-clamp-2">{currentStoryboard.description}</p>
                {currentStoryboard.dialogue && (
                  <p className="text-gray-300 text-sm mt-2 italic line-clamp-2">
                    "{currentStoryboard.dialogue}"
                  </p>
                )}
              </div>
            </div>
          </motion.div>
        </AnimatePresence>
      )}

      {/* 底部控制栏 */}
      <div className="absolute bottom-0 left-0 right-0 z-30 bg-gradient-to-t from-black/80 to-transparent p-4">
        {/* 当前分镜进度条 */}
        <div className="mb-3">
          <input
            type="range"
            min="0"
            max={duration || 100}
            value={currentTime}
            onChange={(e) => {
              const newTime = parseFloat(e.target.value);
              setCurrentTime(newTime);
              if (videoRef.current) {
                videoRef.current.currentTime = newTime;
              }
            }}
            className="w-full h-1 bg-white/20 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white"
          />
          <div className="flex items-center justify-between text-xs text-gray-300 mt-1">
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>

        {/* 控制按钮 */}
        <div className="flex items-center justify-between">
          {/* 左侧：播放控制 */}
          <div className="flex items-center gap-2">
            {/* 上一个分镜 */}
            <button
              onClick={playPrevious}
              disabled={currentIndex === 0}
              className="w-10 h-10 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center text-white hover:bg-white/20 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
              title="上一个分镜 (←)"
            >
              <SkipBack className="w-5 h-5" />
            </button>

            {/* 播放/暂停 */}
            <button
              onClick={() => {
                setIsPlaying(!isPlaying);
                if (videoRef.current) {
                  if (!isPlaying) {
                    videoRef.current.play().catch(err => console.error('Play error:', err));
                  } else {
                    videoRef.current.pause();
                  }
                }
              }}
              className="w-12 h-12 rounded-full bg-gradient-to-r from-purple-600 to-pink-600 flex items-center justify-center text-white hover:from-purple-700 hover:to-pink-700 transition-all shadow-lg"
              title={isPlaying ? '暂停 (Space)' : '播放 (Space)'}
            >
              {isPlaying ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6 ml-1" />}
            </button>

            {/* 下一个分镜 */}
            <button
              onClick={playNext}
              disabled={currentIndex === storyboards.length - 1}
              className="w-10 h-10 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center text-white hover:bg-white/20 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
              title="下一个分镜 (→)"
            >
              <SkipForward className="w-5 h-5" />
            </button>

            {/* 静音 */}
            <button
              onClick={() => {
                setIsMuted(!isMuted);
                if (videoRef.current) {
                  videoRef.current.muted = !isMuted;
                }
              }}
              className="w-10 h-10 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center text-white hover:bg-white/20 transition-all"
              title={isMuted ? '取消静音 (M)' : '静音 (M)'}
            >
              {isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
            </button>
          </div>

          {/* 右侧：全屏 */}
          <div className="flex items-center gap-2">
            <button
              onClick={toggleFullscreen}
              className="w-10 h-10 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center text-white hover:bg-white/20 transition-all"
              title={isFullscreen ? '退出全屏 (F)' : '全屏 (F)'}
            >
              {isFullscreen ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </div>

      {/* 缩略图导航（可选，鼠标悬停显示） */}
      {storyboards.length > 1 && (
        <div className="absolute left-1/2 bottom-32 -translate-x-1/2 z-20 opacity-0 hover:opacity-100 transition-opacity">
          <div className="flex items-center gap-2 bg-black/80 backdrop-blur-md rounded-lg p-2">
            {storyboards.map((sb, idx) => (
              <button
                key={sb.id}
                onClick={() => {
                  setCurrentIndex(idx);
                  setCurrentTime(0);
                  setIsPlaying(true);
                }}
                className={`w-2 h-2 rounded-full transition-all ${
                  idx === currentIndex 
                    ? 'bg-gradient-to-r from-purple-500 to-pink-500 w-6' 
                    : 'bg-white/30 hover:bg-white/50'
                }`}
                title={`分镜 ${sb.sceneNumber}`}
              />
            ))}
          </div>
        </div>
      )}
    </motion.div>
  );
}