/**
 * useImmersiveNavigation hook - Touch/wheel video switching
 * Split from consolidated immersive/index.tsx (v6.0.67)
 */

import { useState, useRef, useCallback } from 'react';

interface UseImmersiveNavigationOptions {
  work: any;
  allWorks?: any[];
  onWorkChange?: (work: any) => void;
  showComments: boolean;
  setIsPlaying: (v: boolean) => void;
  setCurrentTime: (v: number) => void;
  setCurrentVideoUrl: (url: string) => void;
  setUrlExpired: (v: boolean) => void;
  setIsLoadingVideo: (v: boolean) => void;
}

export function useImmersiveNavigation({
  work, allWorks, onWorkChange, showComments,
  setIsPlaying, setCurrentTime, setCurrentVideoUrl, setUrlExpired, setIsLoadingVideo,
}: UseImmersiveNavigationOptions) {
  const [isSwiping, setIsSwiping] = useState(false);
  const touchStartY = useRef(0);
  const touchStartTime = useRef(0);
  const lastWheelTime = useRef(0);
  const isSwitching = useRef(false);
  const isClosing = useRef(false);

  const switchVideo = useCallback((direction: 'up' | 'down') => {
    if (isSwitching.current || !allWorks || allWorks.length <= 1 || !onWorkChange) return;
    const currentIndex = allWorks.findIndex(w => w.id === work.id);
    if (currentIndex === -1) return;
    const nextIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (nextIndex < 0 || nextIndex >= allWorks.length) return;
    const nextWork = allWorks[nextIndex];
    isSwitching.current = true;
    setIsLoadingVideo(true); setIsPlaying(false);
    onWorkChange(nextWork);
    setCurrentVideoUrl(nextWork.videoUrl || nextWork.video_url);
    setUrlExpired(false);
    setTimeout(() => { isSwitching.current = false; setIsLoadingVideo(false); setIsPlaying(true); setCurrentTime(0); }, 500);
  }, [work.id, allWorks, onWorkChange, setIsPlaying, setCurrentTime, setCurrentVideoUrl, setUrlExpired, setIsLoadingVideo]);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (showComments) return; touchStartY.current = e.touches[0].clientY; touchStartTime.current = Date.now(); setIsSwiping(false);
  }, [showComments]);
  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (showComments) return; if (Math.abs(e.touches[0].clientY - touchStartY.current) > 20) setIsSwiping(true);
  }, [showComments]);
  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (showComments || !isSwiping) { setIsSwiping(false); return; }
    const deltaY = e.changedTouches[0].clientY - touchStartY.current;
    const deltaTime = Date.now() - touchStartTime.current;
    if (Math.abs(deltaY) > 50 || (Math.abs(deltaY) > 30 && deltaTime < 300)) switchVideo(deltaY > 0 ? 'up' : 'down');
    setIsSwiping(false);
  }, [showComments, isSwiping, switchVideo]);
  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (isClosing.current || showComments || Math.abs(e.deltaY) < 10) return;
    const now = Date.now(); if (now - lastWheelTime.current < 300) return; lastWheelTime.current = now;
    switchVideo(e.deltaY < 0 ? 'up' : 'down');
  }, [showComments, switchVideo]);
  const markClosing = useCallback(() => { isClosing.current = true; }, []);

  return { isSwiping, handleTouchStart, handleTouchMove, handleTouchEnd, handleWheel, markClosing };
}
