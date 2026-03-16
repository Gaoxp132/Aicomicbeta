/**
 * StoryboardPreview — 分镜预览模式
 * v6.0.165: 幻灯片+胶片条式预览，已完成视频连续自动播放，键盘导航
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X, ChevronLeft, ChevronRight, Play, Pause,
  Maximize2, Image as ImageIcon, Film, SkipForward, SkipBack
} from 'lucide-react';
import { VideoPlayer } from '../VideoPlayer';
import type { Storyboard, Character } from '../../types';
import { sbVideoUrl as getSbVideoUrl, sbThumbnailUrl as getSbThumbnailUrl } from '../../utils';

interface StoryboardPreviewProps {
  storyboards: Storyboard[];
  characters: Character[];
  initialIndex?: number;
  aspectRatio?: string;
  episodeNumber: number;
  onClose: () => void;
}

export function StoryboardPreview({
  storyboards,
  characters,
  initialIndex = 0,
  aspectRatio,
  episodeNumber,
  onClose,
}: StoryboardPreviewProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [isAutoPlaying, setIsAutoPlaying] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const filmstripRef = useRef<HTMLDivElement>(null);

  const current = storyboards[currentIndex];
  const videoUrl = current ? getSbVideoUrl(current) : '';
  const thumbnailUrl = current ? getSbThumbnailUrl(current) : '';
  const hasVideo = !!videoUrl;

  // Navigate to next/prev
  const goNext = useCallback(() => {
    setCurrentIndex(prev => Math.min(prev + 1, storyboards.length - 1));
  }, [storyboards.length]);

  const goPrev = useCallback(() => {
    setCurrentIndex(prev => Math.max(prev - 1, 0));
  }, []);

  // Auto-play: when a video ends, go to next
  const handleVideoEnded = useCallback(() => {
    if (isAutoPlaying && currentIndex < storyboards.length - 1) {
      goNext();
    } else if (isAutoPlaying && currentIndex >= storyboards.length - 1) {
      setIsAutoPlaying(false); // Stop at the end
    }
  }, [isAutoPlaying, currentIndex, storyboards.length, goNext]);

  // Auto-play for non-video slides (show for 3s then advance)
  useEffect(() => {
    if (!isAutoPlaying || hasVideo) return;
    const timer = setTimeout(goNext, 3000);
    return () => clearTimeout(timer);
  }, [isAutoPlaying, hasVideo, currentIndex, goNext]);

  // Keyboard navigation
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowLeft':
          e.preventDefault();
          goPrev();
          break;
        case 'ArrowRight':
          e.preventDefault();
          goNext();
          break;
        case 'Escape':
          e.preventDefault();
          if (isFullscreen) {
            document.exitFullscreen?.();
          } else {
            onClose();
          }
          break;
        case ' ':
          e.preventDefault();
          setIsAutoPlaying(prev => !prev);
          break;
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [goNext, goPrev, onClose, isFullscreen]);

  // v6.0.170: Touch swipe navigation for mobile
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    touchStartRef.current = { x: touch.clientX, y: touch.clientY, time: Date.now() };
  }, []);
  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (!touchStartRef.current) return;
    const touch = e.changedTouches[0];
    const dx = touch.clientX - touchStartRef.current.x;
    const dy = touch.clientY - touchStartRef.current.y;
    const dt = Date.now() - touchStartRef.current.time;
    touchStartRef.current = null;
    // Require horizontal swipe: |dx| > 50px, |dx| > |dy|, within 500ms
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) && dt < 500) {
      if (dx < 0) goNext();
      else goPrev();
    }
  }, [goNext, goPrev]);

  // Scroll filmstrip to keep current thumb visible
  useEffect(() => {
    if (filmstripRef.current) {
      const thumb = filmstripRef.current.children[currentIndex] as HTMLElement;
      if (thumb) {
        thumb.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
      }
    }
  }, [currentIndex]);

  // Fullscreen toggle
  const toggleFullscreen = useCallback(() => {
    if (!containerRef.current) return;
    if (document.fullscreenElement) {
      document.exitFullscreen();
      setIsFullscreen(false);
    } else {
      containerRef.current.requestFullscreen();
      setIsFullscreen(true);
    }
  }, []);

  useEffect(() => {
    const onFSChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFSChange);
    return () => document.removeEventListener('fullscreenchange', onFSChange);
  }, []);

  // Get character names for current scene
  const charNames = (current?.characters || [])
    .map(cid => characters.find(c => c.id === cid)?.name)
    .filter(Boolean);

  // Aspect ratio class
  const aspectClass = (() => {
    switch (aspectRatio) {
      case '9:16': return 'aspect-[9/16] max-h-[70vh]';
      case '1:1': return 'aspect-square max-h-[70vh]';
      case '3:4': return 'aspect-[3/4] max-h-[70vh]';
      case '4:3': return 'aspect-[4/3] max-h-[70vh]';
      default: return 'aspect-video max-h-[70vh]';
    }
  })();

  return (
    <motion.div
      ref={containerRef}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/95 backdrop-blur-xl flex flex-col"
    >
      {/* Top bar */}
      <div className="flex items-center justify-between px-6 py-3 bg-black/50 border-b border-white/10 flex-shrink-0">
        <div className="flex items-center gap-3">
          <Film className="w-5 h-5 text-purple-400" />
          <h3 className="text-white font-semibold">
            第{episodeNumber}集 - 分镜预览
          </h3>
          <span className="text-gray-400 text-sm">
            {currentIndex + 1} / {storyboards.length}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {/* Auto-play toggle */}
          <button
            onClick={() => setIsAutoPlaying(prev => !prev)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-colors ${
              isAutoPlaying
                ? 'bg-purple-500/20 border border-purple-500/30 text-purple-300'
                : 'bg-white/5 border border-white/10 text-gray-400 hover:text-white'
            }`}
          >
            {isAutoPlaying ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
            {isAutoPlaying ? '暂停' : '自动播放'}
          </button>
          <button
            onClick={toggleFullscreen}
            className="p-2 rounded-lg bg-white/5 border border-white/10 text-gray-400 hover:text-white transition-colors"
            title="全屏"
          >
            <Maximize2 className="w-4 h-4" />
          </button>
          <button
            onClick={onClose}
            className="p-2 rounded-lg bg-white/5 border border-white/10 text-gray-400 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* v6.0.170: Progress bar */}
      <div className="flex-shrink-0 h-1 bg-white/5 w-full">
        <motion.div
          className="h-full bg-gradient-to-r from-purple-500 to-pink-500"
          animate={{ width: `${((currentIndex + 1) / storyboards.length) * 100}%` }}
          transition={{ duration: 0.3 }}
        />
      </div>

      {/* Main content area */}
      <div
        className="flex-1 flex items-center justify-center px-4 relative overflow-hidden min-h-0"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {/* Left arrow */}
        <button
          onClick={goPrev}
          disabled={currentIndex === 0}
          className="absolute left-4 z-10 p-3 rounded-full bg-white/10 hover:bg-white/20 text-white transition-all disabled:opacity-20 disabled:cursor-not-allowed"
        >
          <ChevronLeft className="w-6 h-6" />
        </button>

        {/* Main slide */}
        <div className="flex-1 flex flex-col items-center justify-center gap-4 max-w-5xl mx-auto min-h-0">
          <AnimatePresence mode="wait">
            <motion.div
              key={current?.id || currentIndex}
              initial={{ opacity: 0, x: 50 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -50 }}
              transition={{ duration: 0.2 }}
              className={`w-full ${aspectClass} bg-gray-900 rounded-xl overflow-hidden relative mx-auto`}
              style={{ maxWidth: aspectRatio === '9:16' || aspectRatio === '3:4' ? '400px' : undefined }}
            >
              {hasVideo ? (
                <VideoPlayer
                  src={videoUrl}
                  className="w-full h-full object-contain"
                  controls
                  autoPlay={isAutoPlaying}
                  preload="auto"
                  onEnded={handleVideoEnded}
                />
              ) : thumbnailUrl ? (
                <img src={thumbnailUrl} alt={`Scene ${current?.sceneNumber}`} className="w-full h-full object-contain" />
              ) : current?.imageUrl ? (
                <img src={current.imageUrl} alt={`Scene ${current?.sceneNumber}`} className="w-full h-full object-contain" />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <ImageIcon className="w-20 h-20 text-gray-700" />
                </div>
              )}
              {/* Scene number badge */}
              <div className="absolute top-3 left-3 px-3 py-1 bg-black/60 backdrop-blur rounded-lg">
                <span className="text-white font-bold text-sm">场景 {current?.sceneNumber}</span>
              </div>
              {/* Status badge */}
              {hasVideo && (
                <div className="absolute top-3 right-3 px-2.5 py-1 bg-green-500/20 backdrop-blur border border-green-500/30 rounded-lg">
                  <span className="text-green-400 text-xs">已完成</span>
                </div>
              )}
            </motion.div>
          </AnimatePresence>

          {/* Scene info */}
          <div className="w-full max-w-3xl text-center space-y-2 px-4 flex-shrink-0">
            <p className="text-white text-sm leading-relaxed line-clamp-3">{current?.description}</p>
            {current?.dialogue && (
              <p className="text-gray-400 text-xs italic">"{current.dialogue}"</p>
            )}
            <div className="flex items-center justify-center gap-2 text-xs text-gray-500">
              {current?.location && <span className="px-2 py-0.5 bg-white/5 rounded">{current.location}</span>}
              {current?.cameraAngle && <span className="px-2 py-0.5 bg-white/5 rounded">{current.cameraAngle}</span>}
              {current?.duration && <span className="px-2 py-0.5 bg-white/5 rounded">{current.duration}s</span>}
              {charNames.length > 0 && (
                <span className="px-2 py-0.5 bg-white/5 rounded">{charNames.join(', ')}</span>
              )}
            </div>
          </div>
        </div>

        {/* Right arrow */}
        <button
          onClick={goNext}
          disabled={currentIndex >= storyboards.length - 1}
          className="absolute right-4 z-10 p-3 rounded-full bg-white/10 hover:bg-white/20 text-white transition-all disabled:opacity-20 disabled:cursor-not-allowed"
        >
          <ChevronRight className="w-6 h-6" />
        </button>
      </div>

      {/* Filmstrip bottom bar */}
      <div className="flex-shrink-0 bg-black/60 border-t border-white/10 px-4 py-3">
        <div
          ref={filmstripRef}
          className="flex gap-2 overflow-x-auto scrollbar-thin scrollbar-track-transparent scrollbar-thumb-white/20 pb-1"
        >
          {storyboards.map((sb, idx) => {
            const sbVUrl = getSbVideoUrl(sb);
            const sbThumbUrl = getSbThumbnailUrl(sb);
            const isActive = idx === currentIndex;
            const hasSbVideo = !!sbVUrl;

            return (
              <button
                key={sb.id}
                onClick={() => setCurrentIndex(idx)}
                className={`flex-shrink-0 w-20 h-14 rounded-lg overflow-hidden relative transition-all ${
                  isActive
                    ? 'ring-2 ring-purple-500 scale-105'
                    : 'ring-1 ring-white/10 opacity-60 hover:opacity-100'
                }`}
              >
                {sbThumbUrl ? (
                  <img src={sbThumbUrl} alt={`Scene ${sb.sceneNumber}`} className="w-full h-full object-cover" />
                ) : sb.imageUrl ? (
                  <img src={sb.imageUrl} alt={`Scene ${sb.sceneNumber}`} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full bg-gray-800 flex items-center justify-center">
                    <span className="text-gray-500 text-[10px]">{sb.sceneNumber}</span>
                  </div>
                )}
                {/* Video indicator */}
                {hasSbVideo && (
                  <div className="absolute bottom-0.5 right-0.5 w-3 h-3 rounded-full bg-green-500/80 flex items-center justify-center">
                    <Play className="w-1.5 h-1.5 text-white fill-white" />
                  </div>
                )}
                {/* Active indicator */}
                {isActive && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-purple-500" />
                )}
              </button>
            );
          })}
        </div>
        {/* Keyboard hints */}
        <div className="flex items-center justify-center gap-4 mt-2 text-[10px] text-gray-600">
          <span><kbd className="px-1 py-0.5 bg-white/5 rounded text-gray-500">←</kbd> 上一张</span>
          <span><kbd className="px-1 py-0.5 bg-white/5 rounded text-gray-500">→</kbd> 下一张</span>
          <span><kbd className="px-1 py-0.5 bg-white/5 rounded text-gray-500">Space</kbd> 自动播放</span>
          <span><kbd className="px-1 py-0.5 bg-white/5 rounded text-gray-500">Esc</kbd> 退出</span>
        </div>
      </div>
    </motion.div>
  );
}