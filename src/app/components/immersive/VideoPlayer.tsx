/**
 * VideoPlayer component - Immersive video player with HLS support
 * Split from consolidated immersive/index.tsx (v6.0.67)
 */

import { useEffect } from 'react';
import { Play, Pause, Volume2, VolumeX, Maximize2, Minimize2, AlertCircle } from 'lucide-react';
import { useHlsPlayer } from './useHlsPlayer';
import { formatTime } from '../../utils';

interface VideoPlayerProps {
  videoUrl: string;
  isPlaying: boolean;
  isMuted: boolean;
  currentTime: number;
  duration: number;
  isFullscreen: boolean;
  fullscreenSupported: boolean;
  aspectRatio?: string; // v6.0.80: 画面比例约束
  onPlayPause: () => void;
  onMuteToggle: () => void;
  onTimeUpdate: (time: number) => void;
  onLoadedMetadata: (duration: number) => void;
  onToggleFullscreen: () => void;
  onVideoRef: (ref: HTMLVideoElement | null) => void;
  onError?: () => void;
  onEnded?: () => void;
  onTouchStart?: (e: React.TouchEvent) => void;
  onTouchMove?: (e: React.TouchEvent) => void;
  onTouchEnd?: (e: React.TouchEvent) => void;
}

// v6.0.80: 根据画面比例约束视频容器（竖屏/方形居中）
function getVideoContainerStyle(ratio?: string): React.CSSProperties {
  switch (ratio) {
    case '9:16': return { maxWidth: '56.25vh' };
    case '1:1':  return { maxWidth: '100vh' };
    case '3:4':  return { maxWidth: '75vh' };
    default:     return {};
  }
}

export function VideoPlayer({
  videoUrl, isPlaying, isMuted, currentTime, duration,
  isFullscreen, fullscreenSupported, aspectRatio,
  onPlayPause, onMuteToggle, onTimeUpdate, onLoadedMetadata,
  onToggleFullscreen, onVideoRef, onError, onEnded,
  onTouchStart, onTouchMove, onTouchEnd,
}: VideoPlayerProps) {
  const { videoRef, isLoading, videoError, handleError, handleLoadStart, handleCanPlay } = useHlsPlayer({ videoUrl, onError });

  useEffect(() => { if (videoRef.current) onVideoRef(videoRef.current); }, []);
  useEffect(() => {
    if (videoRef.current) {
      if (isPlaying) { videoRef.current.play().catch((e) => { if (e.name !== 'AbortError') console.error('[VideoPlayer] Play failed:', e); }); }
      else { videoRef.current.pause(); }
    }
  }, [isPlaying]);
  useEffect(() => { if (videoRef.current) videoRef.current.muted = isMuted; }, [isMuted]);

  const handleTimeUpdate = () => { if (videoRef.current) onTimeUpdate(videoRef.current.currentTime); };
  const handleLoadedMetadata = () => { if (videoRef.current) onLoadedMetadata(videoRef.current.duration); };
  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (videoRef.current) { const rect = e.currentTarget.getBoundingClientRect(); videoRef.current.currentTime = ((e.clientX - rect.left) / rect.width) * duration; }
  };
  const handleTouchSeek = (e: React.TouchEvent<HTMLDivElement>) => {
    e.stopPropagation();
    if (videoRef.current) {
      const rect = e.currentTarget.getBoundingClientRect();
      const touch = e.touches[0] || e.changedTouches[0];
      videoRef.current.currentTime = Math.max(0, Math.min(1, (touch.clientX - rect.left) / rect.width)) * duration;
    }
  };

  return (
    <div className="relative w-full h-full flex items-center justify-center bg-black" style={getVideoContainerStyle(aspectRatio)}>
      <video
        ref={videoRef}
        className="w-full h-full object-contain"
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onCanPlay={handleCanPlay}
        onLoadStart={handleLoadStart}
        onError={handleError}
        onEnded={onEnded}
        playsInline
        webkit-playsinline="true"
        preload="metadata"
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        <source src={videoUrl} type="video/mp4" />
        您的浏览器不支持视频播放
      </video>

      <button onClick={onPlayPause} className="absolute inset-0 flex items-center justify-center bg-transparent group">
        <div className={`w-20 h-20 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center transition-opacity ${isPlaying ? 'opacity-0 group-hover:opacity-100' : 'opacity-100'}`}>
          {isPlaying ? <Pause className="w-10 h-10 text-white" fill="white" /> : <Play className="w-10 h-10 text-white ml-1" fill="white" />}
        </div>
      </button>

      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4 space-y-2">
        <div onClick={handleSeek} onTouchStart={handleTouchSeek} onTouchMove={handleTouchSeek} onTouchEnd={handleTouchSeek} className="w-full h-6 flex items-center cursor-pointer group touch-none">
          <div className="w-full h-1 group-hover:h-1.5 bg-white/20 rounded-full transition-all relative">
            <div className="h-full bg-gradient-to-r from-purple-500 to-pink-500 rounded-full transition-[width] duration-100" style={{ width: `${(currentTime / duration) * 100 || 0}%` }} />
            <div className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full shadow-md opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" style={{ left: `calc(${(currentTime / duration) * 100 || 0}% - 6px)` }} />
          </div>
        </div>
        <div className="flex items-center justify-between text-white">
          <div className="flex items-center gap-3">
            <button onClick={onPlayPause} className="hover:scale-110 transition-transform">{isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}</button>
            <button onClick={onMuteToggle} className="hover:scale-110 transition-transform">{isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}</button>
            <span className="text-sm">{formatTime(currentTime)} / {formatTime(duration)}</span>
          </div>
          {fullscreenSupported && (
            <button onClick={onToggleFullscreen} className="hover:scale-110 transition-transform">{isFullscreen ? <Minimize2 className="w-5 h-5" /> : <Maximize2 className="w-5 h-5" />}</button>
          )}
        </div>
      </div>

      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="animate-spin w-10 h-10 text-white"><Play className="w-10 h-10" /></div>
        </div>
      )}
      {videoError && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="flex flex-col items-center text-white"><AlertCircle className="w-10 h-10" /><p className="mt-2 text-sm">{videoError}</p></div>
        </div>
      )}
    </div>
  );
}