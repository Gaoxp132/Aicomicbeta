import { useState } from 'react';

/**
 * 视频播放器自定义Hook
 * 管理视频播放状态和控制逻辑
 */
export function useVideoPlayer() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  return {
    isPlaying,
    isMuted,
    currentTime,
    duration,
    setIsPlaying,
    setIsMuted,
    setCurrentTime,
    setDuration,
  };
}
