/**
 * Playback hooks — useHlsPlayer, usePlaylistLoader, usePlaylistPlayback
 * Extracted from media.ts for maintainability
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import Hls from '../lib/hls-shim';
import { preloadHls } from '../lib/hls-shim';
import { apiPost } from '../utils';
import { getErrorMessage } from '../utils';

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
          } catch (fetchError: unknown) {
            clearTimeout(timeoutId);
            throw fetchError;
          }
        }
        if (!data.videos || !Array.isArray(data.videos) || data.videos.length === 0) throw new Error('Playlist has no videos');
        data.videos = await batchSignOssUrls(data.videos);
        if (!cancelled) setPlaylist(data);
      } catch (err: unknown) { console.error('[PlaylistLoader] Failed:', getErrorMessage(err)); if (!cancelled) setError(getErrorMessage(err) || 'Failed to load playlist'); }
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
      const playNext = () => { const pp = incoming.play(); if (pp) pp.then(() => setIsPlaying(true)).catch((e: unknown) => { if (e instanceof Error && e.name !== 'AbortError') console.error('[Playback] Switch play failed:', getErrorMessage(e)); }); };
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