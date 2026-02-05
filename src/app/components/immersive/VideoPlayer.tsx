import { useRef, useState, useEffect } from 'react';
import { Play, Pause, Volume2, VolumeX, Maximize2, Minimize2, AlertCircle } from 'lucide-react';
import { formatTime } from '../../utils/formatters';
import Hls from 'hls.js';

interface VideoPlayerProps {
  videoUrl: string;
  isPlaying: boolean;
  isMuted: boolean;
  currentTime: number;
  duration: number;
  isFullscreen: boolean;
  fullscreenSupported: boolean;
  onPlayPause: () => void;
  onMuteToggle: () => void;
  onTimeUpdate: (time: number) => void;
  onLoadedMetadata: (duration: number) => void;
  onToggleFullscreen: () => void;
  onVideoRef: (ref: HTMLVideoElement | null) => void;
  onError?: () => void; // 添加错误回调
  // ✅ 添加触摸事件支持
  onTouchStart?: (e: React.TouchEvent) => void;
  onTouchMove?: (e: React.TouchEvent) => void;
  onTouchEnd?: (e: React.TouchEvent) => void;
}

export function VideoPlayer({
  videoUrl,
  isPlaying,
  isMuted,
  currentTime,
  duration,
  isFullscreen,
  fullscreenSupported,
  onPlayPause,
  onMuteToggle,
  onTimeUpdate,
  onLoadedMetadata,
  onToggleFullscreen,
  onVideoRef,
  onError,
  onTouchStart,
  onTouchMove,
  onTouchEnd,
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const fallbackAttemptedRef = useRef(false);
  const hlsErrorCountRef = useRef(0);
  const errorHandlingDisabledRef = useRef(false); // 🆕 标记是否禁用error处理
  
  // 状态管理
  const [isLoading, setIsLoading] = useState(true);
  const [videoError, setVideoError] = useState<string | null>(null);
  const [useDirectMp4, setUseDirectMp4] = useState(false);

  // 🆕 从M3U8提取MP4文件
  const extractMp4FromM3u8 = async (m3u8Url: string): Promise<string[]> => {
    try {
      console.log('[VideoPlayer] 📥 Fetching M3U8 playlist to extract MP4 URLs...');
      console.log('[VideoPlayer] M3U8 URL:', m3u8Url);
      
      // 🆕 添加超时控制
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10秒超时
      
      try {
        const response = await fetch(m3u8Url, { 
          signal: controller.signal,
          // 添加CORS和缓存控制
          mode: 'cors',
          cache: 'no-cache'
        });
        clearTimeout(timeoutId);
        
        if (!response.ok) {
          console.error('[VideoPlayer] ❌ Failed to fetch M3U8:', response.status, response.statusText);
          return [];
        }
        
        const playlistText = await response.text();
        console.log('[VideoPlayer] 📄 M3U8 content preview:', playlistText.substring(0, 500));
        
        const mp4Urls: string[] = [];
        const lines = playlistText.split('\n');
        const baseUrl = m3u8Url.substring(0, m3u8Url.lastIndexOf('/') + 1);
        console.log('[VideoPlayer] Base URL:', baseUrl);
        
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith('#')) continue;
          
          if (trimmed.includes('.mp4')) {
            let mp4Url = trimmed;
            if (!mp4Url.startsWith('http')) {
              mp4Url = baseUrl + mp4Url;
            }
            console.log('[VideoPlayer] ✅ Found MP4:', mp4Url);
            mp4Urls.push(mp4Url);
          }
        }
        
        console.log(`[VideoPlayer] ✅ Total MP4 files found: ${mp4Urls.length}`);
        if (mp4Urls.length === 0) {
          console.error('[VideoPlayer] ❌ No MP4 URLs found in M3U8 playlist');
          console.error('[VideoPlayer] Playlist content:', playlistText);
        }
        
        return mp4Urls;
      } catch (fetchError: any) {
        clearTimeout(timeoutId);
        if (fetchError.name === 'AbortError') {
          console.error('[VideoPlayer] ❌ M3U8 fetch timed out after 10 seconds');
          throw new Error('视频播放列表获取超时');
        }
        throw fetchError;
      }
    } catch (error: any) {
      console.error('[VideoPlayer] ❌ Failed to parse M3U8:', error.message || error);
      return [];
    }
  };

  // 🆕 回退到直接MP4播放
  const fallbackToDirectMp4 = async () => {
    if (fallbackAttemptedRef.current) {
      console.warn('[VideoPlayer] ⚠️ Fallback already attempted, cleaning up video source...');
      
      // 🆕 禁用error处理，避免清除video源后仍触发error事件
      errorHandlingDisabledRef.current = true;
      
      // 🆕 即使已尝试回退，也要确保清除video源，停止无限重试
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
      
      const video = videoRef.current;
      if (video && video.src && video.src.includes('.m3u8')) {
        video.removeAttribute('src');
        video.load();
        console.log('[VideoPlayer] 🛑 Video source cleared on repeat fallback attempt');
      }
      
      setVideoError('视频文件不可用，请稍后重试');
      setIsLoading(false);
      if (onError) onError();
      return;
    }
    
    fallbackAttemptedRef.current = true;
    console.log('[VideoPlayer] 🔄 HLS failed, attempting fallback to direct MP4 playback...');
    console.log('[VideoPlayer] Current video source:', videoUrl);
    
    try {
      const mp4Urls = await extractMp4FromM3u8(videoUrl);
      
      if (mp4Urls.length > 0) {
        const firstMp4 = mp4Urls[0];
        console.log('[VideoPlayer] ✅ Falling back to first MP4:', firstMp4);
        
        if (hlsRef.current) {
          console.log('[VideoPlayer] 🗑️ Destroying HLS instance...');
          hlsRef.current.destroy();
          hlsRef.current = null;
        }
        
        setUseDirectMp4(true);
        const video = videoRef.current;
        if (video) {
          console.log('[VideoPlayer] 🎬 Setting video source to MP4...');
          video.src = firstMp4;
          video.load();
          
          video.addEventListener('loadeddata', () => {
            console.log('[VideoPlayer] ✅ MP4 loaded successfully!');
            setIsLoading(false);
            setVideoError(null);
          }, { once: true });
          
          video.addEventListener('error', (e) => {
            console.error('[VideoPlayer] ❌ MP4 load failed:', {
              error: video.error,
              src: video.src,
              networkState: video.networkState,
              readyState: video.readyState
            });
            setVideoError('视频文件无法播放');
            setIsLoading(false);
          }, { once: true });
          
          video.play().catch(e => {
            console.log('[VideoPlayer] ℹ️ Auto-play prevented:', e.message);
          });
        }
      } else {
        console.error('[VideoPlayer] ❌ No MP4 files found, cannot fallback');
        
        // 🆕 清除失败的video源，停止加载
        if (hlsRef.current) {
          console.log('[VideoPlayer] 🗑️ Destroying HLS instance...');
          hlsRef.current.destroy();
          hlsRef.current = null;
        }
        
        const video = videoRef.current;
        if (video) {
          // 清除src，停止尝试加载
          video.removeAttribute('src');
          video.load(); // 重置video元素
          console.log('[VideoPlayer] 🛑 Video source cleared to stop loading attempts');
        }
        
        setVideoError('视频文件不可用，请稍后重试');
        setIsLoading(false);
        if (onError) onError();
      }
    } catch (error) {
      console.error('[VideoPlayer] ❌ Fallback failed:', error);
      
      // 🆕 清除失败的video源
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
      
      const video = videoRef.current;
      if (video) {
        video.removeAttribute('src');
        video.load();
        console.log('[VideoPlayer] 🛑 Video source cleared after fallback exception');
      }
      
      setVideoError('视频加载失败');
      setIsLoading(false);
      if (onError) onError();
    }
  };

  // 记录视频URL用于调试
  useEffect(() => {
    console.log('[VideoPlayer] Video URL:', videoUrl);
    console.log('[VideoPlayer] URL type:', typeof videoUrl);
    console.log('[VideoPlayer] URL valid:', !!videoUrl && videoUrl.trim() !== '');
    
    // 检查URL是否为空
    if (!videoUrl || videoUrl.trim() === '') {
      setVideoError('视频URL为空');
      setIsLoading(false);
      return;
    }
    
    // 重置错误状态
    setVideoError(null);
    setIsLoading(true);
  }, [videoUrl]);

  // 🔥 HLS支持 - 当URL改变时初始化HLS播放器
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !videoUrl) return;

    console.log('[VideoPlayer] Initializing video with URL:', videoUrl);
    
    // 清理之前的HLS实例
    if (hlsRef.current) {
      console.log('[VideoPlayer] Destroying previous HLS instance');
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    // 检查是否是M3U8文件
    const isM3U8 = videoUrl.endsWith('.m3u8') || videoUrl.includes('.m3u8?');

    if (isM3U8 && Hls.isSupported()) {
      console.log('[VideoPlayer] Using HLS.js for M3U8 playback');
      
      // 使用HLS.js播放M3U8，增强配置
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: false,
        debug: false,
        // 🆕 增强媒体容错能力
        maxBufferLength: 30,  // 最大缓冲30秒
        maxMaxBufferLength: 60,  // 绝对最大60秒
        maxBufferSize: 60 * 1000 * 1000,  // 60MB
        maxBufferHole: 0.5,  // 允许0.5秒的缓冲空洞
        // 🆕 增加重试配置
        manifestLoadingTimeOut: 20000,  // 20秒加载超时
        manifestLoadingMaxRetry: 6,  // 最多重试6次
        manifestLoadingRetryDelay: 1000,  // 重试延迟1秒
        levelLoadingTimeOut: 20000,
        levelLoadingMaxRetry: 6,
        levelLoadingRetryDelay: 1000,
        fragLoadingTimeOut: 30000,  // 片段加载30秒超时
        fragLoadingMaxRetry: 6,
        fragLoadingRetryDelay: 1000,
        // 🆕 启用自动媒体错误恢复
        autoStartLoad: true,
        startPosition: -1,
      });
      
      hlsRef.current = hls;
      
      hls.loadSource(videoUrl);
      hls.attachMedia(video);
      
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        console.log('[VideoPlayer] ✅ M3U8 manifest parsed successfully');
        setIsLoading(false);
        setVideoError(null);
      });
      
      // 🆕 增强错误处理
      hls.on(Hls.Events.ERROR, (event, data) => {
        hlsErrorCountRef.current++;
        console.error('[VideoPlayer] HLS error:', data);
        
        // 🆕 特殊处理：fragParsingError 错误
        if (data.details === 'fragParsingError') {
          console.error(`[VideoPlayer] ⚠️ Fragment parsing error (#${hlsErrorCountRef.current}):`, data.reason || 'Unknown');
          
          // 如果是致命错误，或者连续错误超过3次，触发回退
          if (data.fatal || hlsErrorCountRef.current >= 3) {
            console.error('[VideoPlayer] 🚨 Too many fragment errors or fatal error, falling back to MP4...');
            fallbackToDirectMp4();
            return;
          }
          
          // 非致命错误，继续播放
          return;
        }
        
        // 🆕 其他HLS错误处理
        if (data.fatal) {
          console.error('[VideoPlayer] 🚨 Fatal HLS error:', data.type, data.details);
          
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              console.error('[VideoPlayer] Fatal network error, attempting recovery...');
              setVideoError('网络错误，正在重试...');
              hls.startLoad();
              break;
              
            case Hls.ErrorTypes.MEDIA_ERROR:
              console.error('[VideoPlayer] Fatal media error, attempting recovery...');
              setVideoError('媒体错误，正在重试...');
              try {
                hls.recoverMediaError();
              } catch (recoverError) {
                console.error('[VideoPlayer] Recovery failed, falling back to MP4...');
                fallbackToDirectMp4();
              }
              break;
              
            default:
              console.error('[VideoPlayer] Unrecoverable fatal error, falling back to MP4...');
              fallbackToDirectMp4();
              break;
          }
          
          if (onError) {
            onError();
          }
        } else {
          // 非致命错误
          console.warn('[VideoPlayer] ⚠️ Non-fatal HLS error:', data.type, data.details);
        }
      });
      
      // 🆕 添加媒体附加成功事件
      hls.on(Hls.Events.MEDIA_ATTACHED, () => {
        console.log('[VideoPlayer] ✅ Media attached to video element');
      });
      
      // 🆕 添加流加载事件
      hls.on(Hls.Events.LEVEL_LOADED, (event, data) => {
        console.log('[VideoPlayer] ✅ Level loaded, details:', data.details);
      });
    } else if (isM3U8 && video.canPlayType('application/vnd.apple.mpegurl')) {
      // iOS/Safari原生支持HLS
      console.log('[VideoPlayer] Using native HLS support');
      video.src = videoUrl;
    } else {
      // 普通MP4或其他格式
      console.log('[VideoPlayer] Using native video playback');
      video.src = videoUrl;
    }

    return () => {
      if (hlsRef.current) {
        console.log('[VideoPlayer] Cleaning up HLS instance');
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [videoUrl, onError]);

  useEffect(() => {
    if (videoRef.current) {
      onVideoRef(videoRef.current);
    }
  }, []);

  useEffect(() => {
    if (videoRef.current) {
      if (isPlaying) {
        // ✨ 使用 promise 处理播放，避免 AbortError
        const playPromise = videoRef.current.play();
        if (playPromise !== undefined) {
          playPromise.catch((error) => {
            // 忽略 AbortError，这通常发生在组件快速切换时
            if (error.name !== 'AbortError') {
              console.error('[VideoPlayer] Play failed:', error);
            }
          });
        }
      } else {
        videoRef.current.pause();
      }
    }
  }, [isPlaying]);

  // ✨ 组件卸载时清理
  useEffect(() => {
    const video = videoRef.current;
    return () => {
      if (video) {
        video.pause();
        video.src = '';
        video.load();
      }
    };
  }, []);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.muted = isMuted;
    }
  }, [isMuted]);

  const handleTimeUpdate = () => {
    if (videoRef.current && onTimeUpdate) {
      onTimeUpdate(videoRef.current.currentTime);
    }
  };

  const handleLoadedMetadata = () => {
    if (videoRef.current && onLoadedMetadata) {
      onLoadedMetadata(videoRef.current.duration);
    }
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (videoRef.current) {
      const rect = e.currentTarget.getBoundingClientRect();
      const pos = (e.clientX - rect.left) / rect.width;
      videoRef.current.currentTime = pos * duration;
    }
  };

  const handleError = (e: React.SyntheticEvent<HTMLVideoElement>) => {
    // 🆕 如果error处理已禁用，直接返回（避免清除video源后仍处理error事件）
    if (errorHandlingDisabledRef.current) {
      console.log('[VideoPlayer] ⏭️ Error handling disabled, skipping error event');
      return;
    }
    
    const target = e.target as HTMLVideoElement;
    const error = target.error;
    
    let errorMessage = '视频加载失败';
    if (error) {
      switch (error.code) {
        case MediaError.MEDIA_ERR_ABORTED:
          errorMessage = '视频加载被中止';
          break;
        case MediaError.MEDIA_ERR_NETWORK:
          errorMessage = '网络错误，请检查网络连接';
          break;
        case MediaError.MEDIA_ERR_DECODE:
          errorMessage = '视频解码失败，可能是格式不支持';
          break;
        case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
          errorMessage = '不支持的视频格式或URL无效';
          break;
        default:
          errorMessage = error.message || '未知错误';
      }
    }
    
    console.error('[VideoPlayer] Video error:', {
      errorCode: error?.code,
      errorMessage: error?.message,
      MediaError_ABORTED: MediaError.MEDIA_ERR_ABORTED,
      MediaError_NETWORK: MediaError.MEDIA_ERR_NETWORK,
      MediaError_DECODE: MediaError.MEDIA_ERR_DECODE,
      MediaError_SRC_NOT_SUPPORTED: MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED,
      videoUrl,
      videoSrc: target.src,
      networkState: target.networkState,
      readyState: target.readyState,
    });
    
    setVideoError(errorMessage);
    setIsLoading(false);
    
    // 调用错误回调（如果提供
    if (onError) {
      console.log('[VideoPlayer] Calling onError callback...');
      onError();
    }
  };

  const handleLoadStart = () => {
    setIsLoading(true);
  };

  const handleCanPlay = () => {
    setIsLoading(false);
  };

  return (
    <div className="relative w-full h-full flex items-center justify-center bg-black">
      {/* 视频元素 */}
      <video
        ref={videoRef}
        className="w-full h-full object-contain"
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onCanPlay={handleCanPlay}
        onLoadStart={handleLoadStart}
        onError={handleError}
        playsInline
        webkit-playsinline="true"
        preload="metadata"
        crossOrigin="anonymous"
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        <source src={videoUrl} type="video/mp4" />
        您的浏览器不支持视频播放
      </video>

      {/* 播放/暂停按钮（中央） */}
      <button
        onClick={onPlayPause}
        className="absolute inset-0 flex items-center justify-center bg-transparent group"
      >
        <div className={`w-20 h-20 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center transition-opacity ${
          isPlaying ? 'opacity-0 group-hover:opacity-100' : 'opacity-100'
        }`}>
          {isPlaying ? (
            <Pause className="w-10 h-10 text-white" fill="white" />
          ) : (
            <Play className="w-10 h-10 text-white ml-1" fill="white" />
          )}
        </div>
      </button>

      {/* 视频控制栏 */}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4 space-y-2">
        {/* 进度条 */}
        <div
          onClick={handleSeek}
          className="w-full h-1 bg-white/20 rounded-full cursor-pointer group"
        >
          <div
            className="h-full bg-gradient-to-r from-purple-500 to-pink-500 rounded-full transition-all group-hover:h-1.5"
            style={{ width: `${(currentTime / duration) * 100 || 0}%` }}
          />
        </div>

        {/* 控制按钮 */}
        <div className="flex items-center justify-between text-white">
          <div className="flex items-center gap-3">
            <button onClick={onPlayPause} className="hover:scale-110 transition-transform">
              {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
            </button>
            <button onClick={onMuteToggle} className="hover:scale-110 transition-transform">
              {isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
            </button>
            <span className="text-sm">
              {formatTime(currentTime)} / {formatTime(duration)}
            </span>
          </div>

          {fullscreenSupported && (
            <button onClick={onToggleFullscreen} className="hover:scale-110 transition-transform">
              {isFullscreen ? <Minimize2 className="w-5 h-5" /> : <Maximize2 className="w-5 h-5" />}
            </button>
          )}
        </div>
      </div>

      {/* 加载中或错误提示 */}
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="animate-spin w-10 h-10 text-white">
            <Play className="w-10 h-10" />
          </div>
        </div>
      )}
      {videoError && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="flex flex-col items-center text-white">
            <AlertCircle className="w-10 h-10" />
            <p className="mt-2 text-sm">{videoError}</p>
          </div>
        </div>
      )}
    </div>
  );
}