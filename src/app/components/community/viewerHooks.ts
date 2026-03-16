/**
 * SeriesViewer hooks - Auto-advance, swipe, keyboard, interactions
 * Split from community/SeriesViewer.tsx (v6.0.67)
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { toast } from 'sonner';
import { incrementSeriesViews, updateViewingHistory, likeSeries, getSeriesComments, commentSeries, recoverAllTasks } from '../../services';
import { shareContent } from '../../utils';
import type { CommunitySeriesWork } from '../../types';

// [V-H] useAutoAdvance
export function useAutoAdvance({ currentEpisodeIndex, episodes, canAdvanceToNext, onAdvance }: { currentEpisodeIndex: number; episodes: Array<{ episodeNumber?: number }>; canAdvanceToNext: boolean; onAdvance: (i: number) => void }) {
  const [autoAdvanceCountdown, setAutoAdvanceCountdown] = useState<number | null>(null);
  const [showSeriesFinale, setShowSeriesFinale] = useState(false);
  const countdownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const clearCountdownTimer = useCallback(() => { if (countdownTimerRef.current) { clearInterval(countdownTimerRef.current); countdownTimerRef.current = null; } }, []);
  const handleVideoEnded = useCallback(() => {
    if (currentEpisodeIndex >= episodes.length - 1) { setShowSeriesFinale(true); return; }
    if (!canAdvanceToNext) return;
    clearCountdownTimer(); setAutoAdvanceCountdown(3);
    countdownTimerRef.current = setInterval(() => { setAutoAdvanceCountdown(prev => { if (prev === null || prev <= 1) { clearCountdownTimer(); return 0; } return prev - 1; }); }, 1000);
  }, [currentEpisodeIndex, episodes.length, canAdvanceToNext, clearCountdownTimer]);
  useEffect(() => { if (autoAdvanceCountdown === 0) { const nextIdx = currentEpisodeIndex + 1; if (nextIdx < episodes.length) { toast(`正在播放第${episodes[nextIdx].episodeNumber}集`, { duration: 2000 }); onAdvance(nextIdx); } else setShowSeriesFinale(true); setAutoAdvanceCountdown(null); } }, [autoAdvanceCountdown, currentEpisodeIndex, episodes, onAdvance]);
  const cancelAutoAdvance = useCallback(() => { clearCountdownTimer(); setAutoAdvanceCountdown(null); }, [clearCountdownTimer]);
  const skipToNextNow = useCallback(() => { clearCountdownTimer(); setAutoAdvanceCountdown(null); const nextIdx = currentEpisodeIndex + 1; if (nextIdx < episodes.length) { toast(`正在播放第${episodes[nextIdx].episodeNumber}集`, { duration: 2000 }); onAdvance(nextIdx); } }, [clearCountdownTimer, currentEpisodeIndex, episodes, onAdvance]);
  useEffect(() => { clearCountdownTimer(); setAutoAdvanceCountdown(null); return () => clearCountdownTimer(); }, [currentEpisodeIndex, clearCountdownTimer]);
  return { autoAdvanceCountdown, showSeriesFinale, setShowSeriesFinale, handleVideoEnded, cancelAutoAdvance, skipToNextNow };
}

// [V-I] useSwipeNavigation
const MIN_SWIPE_DISTANCE = 50;
export function useSwipeNavigation({ onSwipeUp, onSwipeDown }: { onSwipeUp: () => void; onSwipeDown: () => void }) {
  const touchStartY = useRef(0); const touchEndY = useRef(0); const isSwipeHandled = useRef(false);
  const handleTouchStart = useCallback((e: React.TouchEvent) => { touchStartY.current = e.touches[0].clientY; isSwipeHandled.current = false; }, []);
  const handleTouchMove = useCallback((e: React.TouchEvent) => { touchEndY.current = e.touches[0].clientY; }, []);
  const handleTouchEnd = useCallback(() => { if (isSwipeHandled.current) return; const d = touchStartY.current - touchEndY.current; if (d > MIN_SWIPE_DISTANCE) { onSwipeUp(); isSwipeHandled.current = true; } else if (d < -MIN_SWIPE_DISTANCE) { onSwipeDown(); isSwipeHandled.current = true; } }, [onSwipeUp, onSwipeDown]);
  return { handleTouchStart, handleTouchMove, handleTouchEnd };
}

// [V-J] useViewerKeyboard
export function useViewerKeyboard({ showShortcutHelp, setShowShortcutHelp, showSeriesFinale, setShowSeriesFinale, autoAdvanceCountdown, showEpisodeList, setShowEpisodeList, onClose, cancelAutoAdvance, skipToNextNow, setIsPlaying, handleNextEpisode, handlePreviousEpisode, episodesLength, currentEpisodeIndex }: { showShortcutHelp: boolean; setShowShortcutHelp: (v: boolean | ((p: boolean) => boolean)) => void; showSeriesFinale: boolean; setShowSeriesFinale: (v: boolean) => void; autoAdvanceCountdown: number | null; showEpisodeList: boolean; setShowEpisodeList: (v: boolean | ((p: boolean) => boolean)) => void; onClose: () => void; cancelAutoAdvance: () => void; skipToNextNow: () => void; setIsPlaying: (v: boolean | ((p: boolean) => boolean)) => void; handleNextEpisode: () => void; handlePreviousEpisode: () => void; episodesLength: number; currentEpisodeIndex: number }) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName; if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      switch (e.key) {
        case 'Escape': if (showShortcutHelp) setShowShortcutHelp(false); else if (showSeriesFinale) setShowSeriesFinale(false); else if (autoAdvanceCountdown !== null) cancelAutoAdvance(); else if (showEpisodeList) setShowEpisodeList(false); else onClose(); break;
        case 'ArrowRight': e.preventDefault(); autoAdvanceCountdown !== null ? skipToNextNow() : handleNextEpisode(); break;
        case 'ArrowLeft': e.preventDefault(); handlePreviousEpisode(); break;
        case ' ': e.preventDefault(); if (autoAdvanceCountdown === null && !showSeriesFinale) setIsPlaying((prev: boolean) => !prev); break;
        case 'Enter': if (autoAdvanceCountdown !== null) { e.preventDefault(); skipToNextNow(); } break;
        case 'l': case 'L': setShowEpisodeList((prev: boolean) => !prev); break;
        case '?': setShowShortcutHelp((prev: boolean) => !prev); break;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showShortcutHelp, showSeriesFinale, autoAdvanceCountdown, showEpisodeList, onClose, cancelAutoAdvance, skipToNextNow, setIsPlaying, currentEpisodeIndex, episodesLength, setShowShortcutHelp, setShowSeriesFinale, setShowEpisodeList, handleNextEpisode, handlePreviousEpisode]);
}

// useSeriesViewerInteractions
export function useSeriesViewerInteractions({
  series, userPhone, currentEpisodeIndex, episodes, currentTime, duration, setIsPlaying, setCurrentTime,
}: {
  series: CommunitySeriesWork; userPhone?: string; currentEpisodeIndex: number; episodes: any[];
  currentTime: number; duration: number; setIsPlaying: (v: boolean) => void; setCurrentTime: (v: number) => void;
}) {
  const [isLiked, setIsLiked] = useState(series.isLiked || false);
  const [likes, setLikes] = useState(series.likes || 0);
  const [comments, setComments] = useState<any[]>([]);
  const [commentText, setCommentText] = useState('');
  const [showComments, setShowComments] = useState(false);
  const [isLoadingComments, setIsLoadingComments] = useState(false);
  const [urlExpired, setUrlExpired] = useState(false);
  const [isLoadingVideo, setIsLoadingVideo] = useState(false);
  const currentEpisode = episodes[currentEpisodeIndex];
  const currentTimeRef = useRef(currentTime);
  const durationRef = useRef(duration);
  useEffect(() => { currentTimeRef.current = currentTime; }, [currentTime]);
  useEffect(() => { durationRef.current = duration; }, [duration]);

  useEffect(() => { if (showComments && comments.length === 0) loadComments(); }, [showComments]);

  const loadComments = async () => {
    setIsLoadingComments(true);
    try { const result = await getSeriesComments(series.id, 1, 20); if (result.success) setComments(result.data || []); }
    catch (error: unknown) { console.error('[SeriesViewer] Failed to load comments:', error); }
    finally { setIsLoadingComments(false); }
  };

  const handleLike = async () => {
    if (!userPhone) return;
    try { const result = await likeSeries(series.id, userPhone); if (result.success && result.data) { setIsLiked(result.data.isLiked); setLikes(result.data.likes); } }
    catch (error: unknown) { console.error('[SeriesViewer] Like failed:', error); }
  };

  const handleComment = async () => {
    if (!userPhone || !commentText.trim()) return;
    try { const result = await commentSeries(series.id, userPhone, commentText.trim()); if (result.success) { setCommentText(''); await loadComments(); } }
    catch (error: unknown) { console.error('[SeriesViewer] Comment failed:', error); }
  };

  useEffect(() => {
    const episode = episodes[currentEpisodeIndex];
    if (!episode) return;
    if (currentEpisodeIndex === 0) incrementSeriesViews(series.id).catch(() => {});
    if (userPhone && episode.id) {
      updateViewingHistory({ seriesId: series.id, episodeId: episode.id, episodeNumber: episode.episodeNumber, userPhone }).catch((error) => console.error('[SeriesViewer] Failed to save viewing history:', error));
    }
  }, [currentEpisodeIndex, episodes, series.id, userPhone]);

  useEffect(() => {
    if (!userPhone || !currentEpisode?.id) return;
    const interval = setInterval(() => {
      const ct = currentTimeRef.current; const dur = durationRef.current;
      if (ct > 0 && dur > 0) {
        updateViewingHistory({ seriesId: series.id, episodeId: currentEpisode.id, episodeNumber: currentEpisode.episodeNumber, userPhone, lastPosition: ct, duration: dur, completed: ct >= dur * 0.9 }).catch((error) => console.error('[SeriesViewer] Failed to update progress:', error));
      }
    }, 10000);
    return () => clearInterval(interval);
  }, [userPhone, currentEpisode?.id, currentEpisode?.episodeNumber, series.id]);

  const handleVideoError = async () => { setUrlExpired(true); };
  const handleRecoverVideo = async () => {
    setIsLoadingVideo(true);
    try { await recoverAllTasks(series.id); setTimeout(() => { setUrlExpired(false); setIsLoadingVideo(false); window.location.reload(); }, 2000); }
    catch (error: unknown) { console.error('[SeriesViewer] Failed to recover video:', error); setIsLoadingVideo(false); }
  };

  const handleShare = async () => {
    const epInfo = currentEpisode ? ` 第${currentEpisode.episodeNumber}集` : '';
    const result = await shareContent({ title: series.title || 'AI漫剧', text: `${series.title}${epInfo} - 快来看看这部AI漫剧!`, url: window.location.href });
    if (result === 'shared') toast.success('分享成功');
    else if (result === 'copied') toast.success('链接已复制到剪贴板');
    else if (result === 'cancelled') { /* silent */ }
    else toast.error('分享失败，请手动复制链接');
  };

  const handleDownload = async (videoUrl: string) => {
    try { const a = document.createElement('a'); a.href = videoUrl; a.download = `${series.title}-${currentEpisode?.episodeNumber}集.mp4`; a.target = '_blank'; a.rel = 'noopener noreferrer'; document.body.appendChild(a); a.click(); document.body.removeChild(a); }
    catch (error: unknown) { console.error('Failed to download video:', error); window.open(videoUrl, '_blank'); }
  };

  return { isLiked, likes, comments, commentText, setCommentText, showComments, setShowComments, isLoadingComments, urlExpired, setUrlExpired, isLoadingVideo, handleLike, handleComment, handleVideoError, handleRecoverVideo, handleShare, handleDownload };
}