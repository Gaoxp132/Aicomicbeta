/**
 * Consolidated hooks - Group B: Media/Series (v6.0.67)
 * Merged 6 hooks: useHlsPlayer, usePlaylistLoader, usePlaylistPlayback, useSeries, useTaskRecovery, useVideoGeneration
 * Combined with Group A (index.ts) saves 14 Rollup modules total.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { toast } from 'sonner';
import Hls from '../lib/hls-shim';
import { preloadHls } from '../lib/hls-shim';
import { apiGet, apiPost, apiRequest, isEdgeFunctionReachable } from '../utils';
import { STYLE_THUMBNAILS } from '../constants';
import { getUserSeries, pollSeriesProgress } from '../services';
import * as volcengine from '../services';
import { CancelledTaskError } from '../services';
import { publishToCommunity } from '../services';
import { useCachedData } from './index';
import type { Comic } from '../types/index';

// ═══════════════════════════════════════════════════════════════════
// [1] useHlsPlayer
// ═══════════════════════════════════════════════════════════════════

interface UseHlsPlayerOptions { videoUrl: string | undefined; currentIndex: number; isMuted: boolean; isPlaying: boolean; }

export function useHlsPlayer({ videoUrl, currentIndex, isMuted, isPlaying }: UseHlsPlayerOptions) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const [signedVideoUrl, setSignedVideoUrl] = useState<string>('');
  const [isSigningUrl, setIsSigningUrl] = useState(false);
  const isMutedRef = useRef(isMuted);
  const isPlayingRef = useRef(isPlaying);
  useEffect(() => { isMutedRef.current = isMuted; }, [isMuted]);
  useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);

  const getSignedUrl = async (url: string): Promise<string> => {
    if (!url.includes('aliyuncs.com')) return url;
    setIsSigningUrl(true);
    const result = await apiPost('oss/sign-url', { url });
    setIsSigningUrl(false);
    if (result.success && result.data?.signedUrl) return result.data.signedUrl;
    console.warn('[useHlsPlayer] Sign URL response invalid');
    return url;
  };

  useEffect(() => {
    const initializeVideo = async () => {
      if (!videoUrl || !videoRef.current) return;
      await preloadHls();
      if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; }
      const finalUrl = await getSignedUrl(videoUrl);
      setSignedVideoUrl(finalUrl);
      const video = videoRef.current;
      const isM3U8 = finalUrl.endsWith('.m3u8') || finalUrl.includes('.m3u8?');
      if (isM3U8 && Hls.isSupported()) {
        const hls = new Hls({ enableWorker: true, lowLatencyMode: false });
        hlsRef.current = hls;
        hls.loadSource(finalUrl); hls.attachMedia(video);
        hls.on(Hls.Events.MANIFEST_PARSED, () => { video.muted = isMutedRef.current; if (isPlayingRef.current) video.play().catch(() => {}); });
        hls.on(Hls.Events.ERROR, (event, data) => {
          if (data.fatal) {
            switch (data.type) {
              case Hls.ErrorTypes.NETWORK_ERROR: console.warn('[useHlsPlayer] Fatal network error, retrying...'); hls.startLoad(); break;
              case Hls.ErrorTypes.MEDIA_ERROR: console.warn('[useHlsPlayer] Fatal media error, recovering...'); hls.recoverMediaError(); break;
              default: hls.destroy(); break;
            }
          }
        });
      } else if (isM3U8 && video.canPlayType('application/vnd.apple.mpegurl')) { video.src = finalUrl; }
      else { video.src = finalUrl; }
    };
    initializeVideo();
    return () => { if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; } };
  }, [currentIndex, videoUrl]);

  return { videoRef, signedVideoUrl, isSigningUrl };
}

// ═══════════════════════════════════════════════════════════════════
// [2] usePlaylistLoader
// ═══════════════════════════════════════════════════════════════════

export interface PlaylistVideo { sceneNumber: number; url: string; duration: number; title?: string; thumbnail?: string | null; }
export interface Playlist { type?: string; version?: string; episodeId: string; totalVideos: number; totalDuration: number; createdAt: string; videos: PlaylistVideo[]; }

async function signOssUrl(url: string): Promise<string> { const r = await apiPost('oss/sign-url', { url }); return r.success && r.data?.signedUrl ? r.data.signedUrl : url; }
async function fetchViaProxy(url: string): Promise<any> { const r = await apiPost('oss/fetch-json', { url }); if (r.success && r.data) return r.data; throw new Error(r.error || 'Backend proxy fetch failed'); }

async function batchSignOssUrls(videos: PlaylistVideo[]): Promise<PlaylistVideo[]> {
  const ossUrls = videos.filter(v => v.url && (v.url.includes('aliyuncs.com') || v.url.includes('oss-'))).map(v => v.url);
  if (ossUrls.length === 0) return videos;
  const result = await apiPost('oss/sign-urls', { urls: ossUrls, expiresIn: 7200 }, { timeout: 10000 });
  if (result.success && result.data?.results) {
    const urlMap = new Map<string, string>();
    result.data.results.forEach((r: any) => { if (r.success && r.signedUrl) urlMap.set(r.originalUrl, r.signedUrl); });
    return videos.map(v => urlMap.has(v.url) ? { ...v, url: urlMap.get(v.url)! } : v);
  }
  return videos.map(v => { try { const u = new URL(v.url); ['OSSAccessKeyId', 'Expires', 'Signature', 'security-token'].forEach(p => u.searchParams.delete(p)); return { ...v, url: u.toString() }; } catch { return v; } });
}

function normalizePlaylist(data: any): Playlist {
  if (!data.videos && Array.isArray(data.segments)) {
    data.videos = data.segments.map((seg: any) => ({ sceneNumber: seg.sceneNumber, url: seg.videoUrl || seg.url, duration: seg.duration || 10, title: seg.description || seg.title, thumbnail: seg.thumbnailUrl || seg.thumbnail || null }));
    data.totalVideos = data.videos.length;
  }
  if (data.videos) { data.videos = data.videos.map((v: any) => ({ ...v, url: v.url || v.videoUrl, title: v.title || v.description, thumbnail: v.thumbnail || v.thumbnailUrl || null })); }
  return data as Playlist;
}

export function usePlaylistLoader(playlistUrl: string) {
  const [playlist, setPlaylist] = useState<Playlist | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const loadPlaylist = async () => {
      try {
        setIsLoading(true); setError(null);
        if (!playlistUrl || typeof playlistUrl !== 'string') throw new Error('Invalid playlist URL');
        let data: Playlist;
        if (playlistUrl.trim().startsWith('{') || playlistUrl.trim().startsWith('[')) {
          data = normalizePlaylist(JSON.parse(playlistUrl));
          console.log(`[PlaylistLoader] Inline JSON: ${data.videos?.length || 0} videos, ${data.totalDuration || 0}s`);
        } else {
          let fetchUrl = playlistUrl;
          if (fetchUrl.includes('aliyuncs.com') || fetchUrl.includes('oss-')) fetchUrl = await signOssUrl(fetchUrl);
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 10000);
          try {
            const response = await fetch(fetchUrl, { signal: controller.signal });
            clearTimeout(timeoutId);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            data = normalizePlaylist(await response.json());
          } catch (fetchError: any) {
            clearTimeout(timeoutId);
            if (fetchError.name === 'AbortError') throw new Error('加载超时，请检查网络连接');
            console.warn('[PlaylistLoader] Direct fetch failed, trying proxy:', fetchError.message);
            try { data = normalizePlaylist(await fetchViaProxy(playlistUrl)); } catch { throw fetchError; }
          }
        }
        if (!data.videos || !Array.isArray(data.videos) || data.videos.length === 0) throw new Error('Playlist has no videos');
        data.videos = await batchSignOssUrls(data.videos);
        if (!cancelled) setPlaylist(data);
      } catch (err: any) { console.error('[PlaylistLoader] Failed:', err.message); if (!cancelled) setError(err.message || 'Failed to load playlist'); }
      finally { if (!cancelled) setIsLoading(false); }
    };
    loadPlaylist();
    return () => { cancelled = true; };
  }, [playlistUrl]);

  return { playlist, setPlaylist, isLoading, error, setError };
}

// ═══════════════════════════════════════════════════════════════════
// [3] usePlaylistPlayback
// ═══════════════════════════════════════════════════════════════════

const isIOS = typeof navigator !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent);

interface UsePlaylistPlaybackParams { playlist: Playlist | null; autoPlay?: boolean; onPlay?: () => void; onPause?: () => void; onPlaylistEnded?: () => void; }

export function usePlaylistPlayback({ playlist, autoPlay = false, onPlay, onPause, onPlaylistEnded }: UsePlaylistPlaybackParams) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoLoading, setIsVideoLoading] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [progress, setProgress] = useState(0);
  const videoRefA = useRef<HTMLVideoElement>(null);
  const videoRefB = useRef<HTMLVideoElement>(null);
  const [activeSlot, setActiveSlot] = useState<'A' | 'B'>('A');
  const videoRef = activeSlot === 'A' ? videoRefA : videoRefB;
  const nextVideoRef = activeSlot === 'A' ? videoRefB : videoRefA;
  const preloadedIndexRef = useRef<number>(-1);
  const currentVideo = playlist?.videos[currentIndex] ?? null;

  useEffect(() => { return () => { [videoRefA.current, videoRefB.current].forEach(vid => { if (vid) { vid.pause(); vid.removeAttribute('src'); vid.load(); } }); }; }, []);

  const preloadNext = useCallback((fromIndex: number) => {
    if (!playlist || isIOS) return;
    const nextIdx = fromIndex + 1;
    if (nextIdx >= playlist.videos.length || preloadedIndexRef.current === nextIdx) return;
    const nextVid = nextVideoRef.current; const nextData = playlist.videos[nextIdx];
    if (!nextVid || !nextData?.url) return;
    nextVid.preload = 'auto'; nextVid.src = nextData.url; nextVid.load(); preloadedIndexRef.current = nextIdx;
  }, [playlist, nextVideoRef]);

  const togglePlay = useCallback(() => {
    if (!videoRef.current) return;
    if (isPlaying) { videoRef.current.pause(); setIsPlaying(false); onPause?.(); }
    else { const p = videoRef.current.play(); if (p) p.then(() => { setIsPlaying(true); onPlay?.(); }).catch(() => setIsPlaying(false)); else { setIsPlaying(true); onPlay?.(); } }
  }, [isPlaying, videoRef, onPlay, onPause]);

  const toggleMute = useCallback(() => {
    if (videoRefA.current) videoRefA.current.muted = !isMuted;
    if (videoRefB.current) videoRefB.current.muted = !isMuted;
    setIsMuted(!isMuted);
  }, [isMuted]);

  const switchToNext = useCallback((nextIdx: number) => {
    if (!playlist || nextIdx >= playlist.videos.length) return;
    const incoming = nextVideoRef.current; const outgoing = videoRef.current;
    if (outgoing) outgoing.pause();
    if (incoming) {
      const isPreloaded = !isIOS && preloadedIndexRef.current === nextIdx;
      if (!isPreloaded) { const nextData = playlist.videos[nextIdx]; if (nextData?.url) { incoming.src = nextData.url; incoming.load(); } }
      incoming.currentTime = 0; incoming.muted = isMuted;
      const playNext = () => { const pp = incoming.play(); if (pp) pp.then(() => setIsPlaying(true)).catch(e => { if (e.name !== 'AbortError') console.error('[Playback] Switch play failed:', e.message); }); };
      if (incoming.readyState >= 3) playNext();
      else { setIsVideoLoading(true); incoming.addEventListener('canplay', () => { setIsVideoLoading(false); playNext(); }, { once: true }); }
    }
    if (isIOS && outgoing) { outgoing.removeAttribute('src'); outgoing.load(); }
    setActiveSlot(prev => prev === 'A' ? 'B' : 'A'); setCurrentIndex(nextIdx); setProgress(0); preloadedIndexRef.current = -1;
  }, [playlist, isMuted, videoRef, nextVideoRef]);

  const nextVideo = useCallback(() => {
    if (!playlist) return;
    if (currentIndex < playlist.videos.length - 1) switchToNext(currentIndex + 1);
    else { setIsPlaying(false); setCurrentIndex(0); setActiveSlot('A'); setProgress(0); preloadedIndexRef.current = -1; onPlaylistEnded?.(); }
  }, [playlist, currentIndex, switchToNext, onPlaylistEnded]);

  const previousVideo = useCallback(() => {
    if (currentIndex > 0) {
      const prevIdx = currentIndex - 1;
      const prevRef = nextVideoRef.current;
      if (prevRef && playlist?.videos[prevIdx]) { prevRef.src = playlist.videos[prevIdx].url; prevRef.load(); preloadedIndexRef.current = prevIdx; }
      switchToNext(prevIdx);
    }
  }, [currentIndex, playlist, nextVideoRef, switchToNext]);

  const handleSeekTo = useCallback((targetIndex: number, seekTime: number) => {
    if (!playlist || targetIndex < 0 || targetIndex >= playlist.videos.length) return;
    if (targetIndex === currentIndex) { const vid = activeSlot === 'A' ? videoRefA.current : videoRefB.current; if (vid) vid.currentTime = seekTime; }
    else {
      const incoming = nextVideoRef.current; const outgoing = videoRef.current;
      if (outgoing) outgoing.pause();
      if (incoming) {
        const targetData = playlist.videos[targetIndex];
        if (targetData?.url) { incoming.src = targetData.url; incoming.load(); }
        incoming.muted = isMuted;
        const onReady = () => { incoming.currentTime = seekTime; incoming.play().then(() => setIsPlaying(true)).catch(() => {}); };
        if (incoming.readyState >= 3) onReady();
        else { setIsVideoLoading(true); incoming.addEventListener('canplay', () => { setIsVideoLoading(false); onReady(); }, { once: true }); }
      }
      if (isIOS && outgoing) { outgoing.removeAttribute('src'); outgoing.load(); }
      setActiveSlot(prev => prev === 'A' ? 'B' : 'A'); setCurrentIndex(targetIndex); preloadedIndexRef.current = -1;
    }
  }, [playlist, currentIndex, activeSlot, isMuted, videoRef, nextVideoRef]);

  const handleVideoEnded = useCallback(() => {
    if (!playlist) return;
    if (currentIndex < playlist.videos.length - 1) switchToNext(currentIndex + 1);
    else {
      setCurrentIndex(0); setActiveSlot('A'); setProgress(0); preloadedIndexRef.current = -1;
      if (isIOS && videoRefB.current) { videoRefB.current.pause(); videoRefB.current.removeAttribute('src'); videoRefB.current.load(); }
      if (!isIOS && videoRefB.current) videoRefB.current.pause();
      if (videoRefA.current && playlist.videos[0]) { videoRefA.current.src = playlist.videos[0].url; videoRefA.current.load(); videoRefA.current.play().catch(() => {}); }
      setIsPlaying(true); onPlaylistEnded?.();
    }
  }, [playlist, currentIndex, switchToNext, onPlaylistEnded]);

  const handleTimeUpdate = useCallback(() => {
    const vid = activeSlot === 'A' ? videoRefA.current : videoRefB.current;
    if (!vid || !playlist) return;
    const current = vid.currentTime; const dur = vid.duration;
    if (dur > 0 || current > 0) {
      const completedDuration = playlist.videos.slice(0, currentIndex).reduce((sum, v) => sum + v.duration, 0);
      setProgress(Math.min(100, ((completedDuration + current) / playlist.totalDuration) * 100));
      if (dur > 0 && dur - current < 2) preloadNext(currentIndex);
    }
  }, [playlist, currentIndex, activeSlot, preloadNext]);

  useEffect(() => {
    if (!playlist || !currentVideo) return;
    const vid = activeSlot === 'A' ? videoRefA.current : videoRefB.current;
    if (!vid) return;
    if (!currentVideo.url || typeof currentVideo.url !== 'string') return;
    if (!currentVideo.url.startsWith('http://') && !currentVideo.url.startsWith('https://')) return;
    const currentSrc = vid.src || '';
    const needsLoad = !currentSrc || !currentSrc.includes(currentVideo.url.split('?')[0].split('/').pop() || '__no_match__');
    if (needsLoad) { vid.src = currentVideo.url; vid.load(); }
    const shouldAutoPlay = isPlaying || autoPlay;
    if (shouldAutoPlay && vid.readyState >= 3) vid.play().catch(() => {});
    else if (shouldAutoPlay) vid.addEventListener('canplay', () => { vid.play().then(() => setIsPlaying(true)).catch(() => {}); }, { once: true });
  }, [playlist]);

  return {
    currentIndex, currentVideo, isPlaying, isMuted, isVideoLoading, isBuffering, progress, activeSlot,
    videoRefA, videoRefB, videoRef,
    togglePlay, toggleMute, nextVideo, previousVideo, handleSeekTo, handleVideoEnded, handleTimeUpdate,
    setIsPlaying, setIsVideoLoading, setIsBuffering,
  };
}

// ═══════════════════════════════════════════════════════════════════
// [4] useSeries
// ═══════════════════════════════════════════════════════════════════

export function useSeries(userPhone?: string) {
  const [series, setSeries] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasLoadedRef = useRef(false);
  const generatingIdsRef = useRef<string>('');

  const cacheKey = `user-series-${userPhone || 'anonymous'}`;
  const { data: cachedData, isLoading: isCacheLoading, load: loadFromAPI, refresh: refreshFromAPI } = useCachedData(
    async () => {
      if (!userPhone) return [];
      const result = await getUserSeries(userPhone);
      return result.success ? result.data || [] : [];
    },
    { cacheKey, ttl: 5 * 60 * 1000, autoLoad: false }
  );

  useEffect(() => { if (cachedData) setSeries(cachedData); }, [cachedData]);
  useEffect(() => { setIsLoading(isCacheLoading); }, [isCacheLoading]);

  const loadSeries = useCallback(async () => { if (!userPhone) return; hasLoadedRef.current = true; await loadFromAPI(); }, [userPhone, loadFromAPI]);

  useEffect(() => { if (userPhone && !hasLoadedRef.current) loadSeries(); }, [userPhone, loadSeries]);

  const generatingIds = Array.isArray(series) ? series.filter(s => s.status === 'generating' || s.status === 'in-progress').map(s => s.id).sort().join(',') : '';
  generatingIdsRef.current = generatingIds;

  useEffect(() => {
    if (!generatingIds || !userPhone) return;
    if (!isEdgeFunctionReachable()) return;
    const ids = generatingIds.split(',').filter(Boolean);
    const seriesToPoll = ids.slice(0, 5); // v6.0.124: 从2提升至5，防止多剧并发生成时后续剧集无法轮询
    const cancelFunctions = seriesToPoll.map(id =>
      pollSeriesProgress(id, userPhone, (updatedSeries) => {
        setSeries(prev => { const a = Array.isArray(prev) ? prev : []; return a.map(item => item.id === updatedSeries.id ? updatedSeries : item); });
      }, 5000)
    );
    return () => { cancelFunctions.forEach(cancel => cancel()); };
  }, [generatingIds, userPhone]);

  const addSeries = useCallback((newSeries: any) => { setSeries(prev => { const a = Array.isArray(prev) ? prev : []; return [newSeries, ...a]; }); }, []);
  const updateSeriesLocal = useCallback((updatedSeries: any) => { setSeries(prev => { const a = Array.isArray(prev) ? prev : []; return a.map(s => s.id === updatedSeries.id ? updatedSeries : s); }); }, []);
  const removeSeriesLocal = useCallback((seriesId: string) => { setSeries(prev => { const a = Array.isArray(prev) ? prev : []; return a.filter(s => s.id !== seriesId); }); }, []);

  return { series, isLoading, error, addSeries, updateSeriesLocal, removeSeriesLocal, loadSeries, refresh: refreshFromAPI };
}

// ═══════════════════════════════════════════════════════════════════
// [5] useTaskRecovery
// ═══════════════════════════════════════════════════════════════════

export function useTaskRecovery(userPhone: string | null) {
  const [recoveredTasks, setRecoveredTasks] = useState<Comic[]>([]);
  const [isRecovering, setIsRecovering] = useState(false);
  const backoffRef = useRef(15000);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recoverFnRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!userPhone) { setRecoveredTasks([]); return; }
    let isMounted = true;
    const pollingTaskIds = new Set<string>();

    const recoverTasks = async () => {
      if (!isMounted) return;
      setIsRecovering(true);
      try {
        const result = await apiRequest(`/volcengine/tasks?userPhone=${encodeURIComponent(userPhone)}`, { method: 'GET', timeout: 30000, maxRetries: 2, silent: true });
        if (!isMounted) return;
        if (!result.success || !(result as any).tasks) { backoffRef.current = Math.min(backoffRef.current * 2, 120000); scheduleNext(); return; }
        backoffRef.current = 15000;
        const dbTasks = (result as any).tasks;
        const tasks: Comic[] = dbTasks.map((task: any, idx: number) => {
          const thumbnail = task.thumbnail || STYLE_THUMBNAILS[task.style as keyof typeof STYLE_THUMBNAILS] || STYLE_THUMBNAILS.anime;
          const videoUrl = task.videoUrl || task.video_url || '';
          const taskIdVal = task.taskId || task.task_id || '';
          const metadata = task.generationMetadata || task.generation_metadata || null;
          let extractedSeriesId = '';
          if (metadata) { try { const meta = typeof metadata === 'string' ? JSON.parse(metadata) : metadata; extractedSeriesId = meta.seriesId || meta.series_id || ''; } catch {} }
          let mappedStatus: 'generating' | 'completed' | 'failed';
          if (task.status === 'completed') mappedStatus = 'completed';
          else if (task.status === 'failed' || task.status === 'cancelled') mappedStatus = 'failed';
          else if (task.status === 'processing' || task.status === 'pending' || task.status === 'generating') mappedStatus = 'generating';
          else mappedStatus = videoUrl ? 'completed' : 'generating';
          const finalTaskId = taskIdVal || task.id || `recovered-${idx}-${Date.now()}`;
          // v6.0.77: 优先使用DB title字段（包含系列名-E集-场景号），避免用enriched prompt作标题
          const displayTitle = task.title || task.prompt?.slice(0, 30) + '...' || '未命名作品';
          return { id: finalTaskId, taskId: finalTaskId, title: displayTitle, prompt: task.prompt || '', style: task.style || 'anime', duration: task.duration?.toString() || '5', thumbnail, videoUrl, createdAt: new Date(task.createdAt || task.created_at || Date.now()), status: mappedStatus, userPhone: task.userPhone || task.user_phone, metadata, seriesId: extractedSeriesId };
        });
        if (!isMounted) return;
        // v6.0.77: 前端二次检查——超过25分钟仍为generating的任务直接标记failed（与后端20min自动过期互补）
        const STALE_MS = 25 * 60 * 1000;
        const nowMs = Date.now();
        for (const t of tasks) {
          if (t.status === 'generating' && t.createdAt) {
            const age = nowMs - new Date(t.createdAt).getTime();
            if (age > STALE_MS) { t.status = 'failed'; (t as any).error = '任务超时（超过25分钟未完成）'; }
          }
        }
        setRecoveredTasks(tasks);
        const generatingTasks = tasks.filter(t => t.status === 'generating' && t.taskId && !pollingTaskIds.has(t.taskId));
        generatingTasks.forEach(task => {
          pollingTaskIds.add(task.taskId!);
          volcengine.pollTaskStatus(task.taskId!, (status) => {
            if (!isMounted) return;
            if (status.status === 'cancelled') { setRecoveredTasks(prev => prev.filter(t => t.taskId !== task.taskId)); return; }
            setRecoveredTasks(prev => prev.map(t => {
              if (t.taskId !== task.taskId) return t;
              if (t.status === 'completed' || t.status === 'failed') return t;
              const newStatus = status.status === 'completed' || status.status === 'success' ? 'completed' : status.status === 'failed' || status.status === 'error' ? 'failed' : 'generating';
              return { ...t, status: newStatus, videoUrl: status.videoUrl || t.videoUrl };
            }));
          }, 40, 15000).then(finalStatus => {
            if (!isMounted) return;
            pollingTaskIds.delete(task.taskId!);
            setRecoveredTasks(prev => prev.map(t => t.taskId === task.taskId ? { ...t, status: 'completed', videoUrl: finalStatus.videoUrl || t.videoUrl } : t));
          }).catch(error => {
            pollingTaskIds.delete(task.taskId!);
            if (!isMounted) return;
            if (error instanceof CancelledTaskError || error.message?.includes('已取消')) { setRecoveredTasks(prev => prev.filter(t => t.taskId !== task.taskId)); return; }
            const isTaskNotFound = error.message?.includes('任务不存在') || error.message?.includes('Task not found') || error.message?.includes('not found in database') || error.message?.includes('已过期');
            if (isTaskNotFound) { setRecoveredTasks(prev => prev.map(t => t.taskId === task.taskId ? { ...t, status: 'failed', error: '任务已过期或不存在' } as any : t)); return; }
            // v6.0.77: 兜底——轮询超时/网络错误等未知错误也标记为failed，防止任务永久卡在generating
            console.warn(`[TaskRecovery] Task ${task.taskId} poll failed (marking as failed):`, error.message);
            setRecoveredTasks(prev => prev.map(t => t.taskId === task.taskId ? { ...t, status: 'failed', error: error.message || '任务超时' } as any : t));
          });
        });
        scheduleNext();
      } catch (error: any) { backoffRef.current = Math.min(backoffRef.current * 2, 120000); scheduleNext(); }
      finally { if (isMounted) setIsRecovering(false); }
    };

    const scheduleNext = () => { if (!isMounted) return; if (timerRef.current) clearTimeout(timerRef.current); timerRef.current = setTimeout(recoverTasks, backoffRef.current); };
    recoverFnRef.current = recoverTasks;
    recoverTasks();
    return () => { isMounted = false; recoverFnRef.current = null; if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; } };
  }, [userPhone]);

  const forceRefresh = useCallback(() => { if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; } backoffRef.current = 15000; recoverFnRef.current?.(); }, []);
  const removeTasksForSeries = useCallback((seriesId: string) => { setRecoveredTasks(prev => prev.filter(t => t.seriesId !== seriesId)); }, []);

  return { recoveredTasks, isRecovering, setRecoveredTasks, forceRefresh, removeTasksForSeries };
}

// ═══════════════════════════════════════════════════════════════════
// [6] useVideoGeneration
// ═══════════════════════════════════════════════════════════════════

interface GenerateParams { prompt: string; style: string; duration: string; imageUrls?: string[]; resolution?: string; fps?: number; enableAudio?: boolean; model?: string; }

export function useVideoGeneration(userPhone: string) {
  const [comics, setComics] = useState<Comic[]>([]);
  const { recoveredTasks, isRecovering, setRecoveredTasks, forceRefresh, removeTasksForSeries } = useTaskRecovery(userPhone);

  useEffect(() => {
    if (recoveredTasks.length > 0) setComics(recoveredTasks);
    else if (!userPhone) setComics([]);
  }, [recoveredTasks, userPhone]);

  const handleGenerate = async (data: GenerateParams) => {
    const activeTasksCount = comics.filter(c => c.status === 'generating').length;
    if (activeTasksCount >= 3) { toast.error('已达到并发上限（3个），请等待当前任务完成'); return false; }
    if (!userPhone) { toast.error('请先登录后再生成视频'); return false; }
    const healthResult = await apiGet('/health', { timeout: 10000, maxRetries: 0, silent: true });
    if (!healthResult.success) {
      const errMsg = healthResult.error || '';
      if (errMsg.includes('timeout') || errMsg.includes('超时')) toast.error('服务器响应超时，请稍后重试');
      else toast.error('无法连接到服务器，请检查网络');
      return false;
    }
    const thumbnail = data.imageUrls?.[0] || STYLE_THUMBNAILS[data.style as keyof typeof STYLE_THUMBNAILS] || STYLE_THUMBNAILS.anime;
    const newComic: Comic = { id: Date.now().toString(), title: data.prompt.slice(0, 30) + '...', prompt: data.prompt, style: data.style, duration: data.duration, thumbnail, videoUrl: '', createdAt: new Date(), status: 'generating', imageUrls: data.imageUrls, resolution: data.resolution, fps: data.fps, enableAudio: data.enableAudio, model: data.model, userPhone };
    setComics(prev => [newComic, ...prev]);
    try {
      const result = await volcengine.createVideoTask({ prompt: data.prompt, title: data.prompt?.substring(0, 100) || '视频生成任务', style: data.style, duration: data.duration, imageUrls: data.imageUrls, resolution: data.resolution, fps: data.fps, enableAudio: data.enableAudio, model: data.model, userPhone });
      if (!result) throw new Error('服务器返回空数据，请重试');
      const taskId = result.id || result.task_id;
      if (!taskId) { console.error('[Video Generation] Cannot extract taskId from result:', result); toast.error('服务异常：无法获取任务ID'); throw new Error('无法获取任务ID，请检查后端服务'); }
      toast.success('视频生成任务已提交！预计 1-3 分钟完成');
      setComics(prev => prev.map(c => c.id === newComic.id ? { ...c, id: taskId, taskId } : c));
      volcengine.pollTaskStatus(taskId, (status) => {
        if (status.status === 'cancelled') { setComics(prev => prev.filter(c => c.taskId !== taskId && c.id !== taskId)); return; }
        setComics(prev => prev.map(c => {
          if (c.taskId !== taskId && c.id !== taskId) return c;
          if (c.status === 'completed' || c.status === 'failed') return c;
          const newStatus = status.status === 'completed' || status.status === 'success' ? 'completed' : status.status === 'failed' || status.status === 'error' ? 'failed' : 'generating';
          return { ...c, status: newStatus, videoUrl: status.videoUrl || c.videoUrl };
        }));
      }, 120, 5000).then(async (finalStatus) => {
        const updatedComic = { ...newComic, id: taskId, status: 'completed' as const, videoUrl: finalStatus.videoUrl || '', taskId };
        setComics(prev => prev.map(c => (c.taskId === taskId || c.id === taskId ? updatedComic : c)));
        if (finalStatus.videoUrl && userPhone) {
          try {
            const isValidUrl = finalStatus.videoUrl.startsWith('http://') || finalStatus.videoUrl.startsWith('https://');
            if (!isValidUrl) {
              console.error('[Video Generation] Invalid videoUrl (not a URL):', finalStatus.videoUrl);
              await publishToCommunity({ phone: userPhone, taskId, title: newComic.title, prompt: newComic.prompt, style: newComic.style, duration: newComic.duration, thumbnail: newComic.thumbnail, videoUrl: finalStatus.videoUrl });
              return;
            }
            const transferResult = await apiPost('/video/transfer', { taskId, volcengineUrl: finalStatus.videoUrl });
            let finalVideoUrl = finalStatus.videoUrl;
            if (transferResult.success && transferResult.data?.ossUrl) {
              finalVideoUrl = transferResult.data.ossUrl;
              setComics(prev => prev.map(c => (c.taskId === taskId || c.id === taskId) ? { ...c, videoUrl: finalVideoUrl } : c));
            } else { console.warn('[Video Generation] Video transfer failed, using original URL:', transferResult.error); }
            await publishToCommunity({ phone: userPhone, taskId, title: newComic.title, prompt: newComic.prompt, style: newComic.style, duration: newComic.duration, thumbnail: newComic.thumbnail, videoUrl: finalVideoUrl });
          } catch (publishError) { console.error('[Video Generation] Auto-publish failed:', publishError); }
        }
      }).catch(error => {
        if (error instanceof CancelledTaskError || error.message?.includes('已取消')) { setComics(prev => prev.filter(c => c.taskId !== taskId && c.id !== taskId)); }
        else if (error.message?.includes('网络连接问题') || error.message?.includes('轮询超时') || error.message?.includes('请求超时') || error.message?.includes('timeout')) {
          // v6.0.77: 轮询超时也标记为failed（之前静默忽略导致任务永久卡在generating）
          console.warn(`[Video Generation] Poll timeout for task ${taskId}, marking as failed:`, error.message);
          setComics(prev => prev.map(c => (c.taskId === taskId || c.id === taskId) ? { ...c, status: 'failed' as const } : c));
        }
        else { console.error('[Video Generation] Video generation failed:', error.message); setComics(prev => prev.map(c => (c.taskId === taskId || c.id === taskId) ? { ...c, status: 'failed' as const } : c)); }
      });
      return true;
    } catch (error: any) {
      console.error('[Video Generation] Failed to create task:', error.message);
      toast.error(`生成失败: ${error.message}`);
      setComics(prev => prev.map(c => c.id === newComic.id ? { ...c, status: 'failed' as const } : c));
      return false;
    }
  };

  const activeTasks = comics.filter(c => c.status === 'generating');
  const onSeriesDeleted = useCallback((seriesId: string) => {
    removeTasksForSeries(seriesId); setComics(prev => prev.filter(c => c.seriesId !== seriesId));
    setTimeout(() => forceRefresh(), 1500);
  }, [removeTasksForSeries, forceRefresh]);

  return { comics, setComics, activeTasks, handleGenerate, onSeriesDeleted };
}