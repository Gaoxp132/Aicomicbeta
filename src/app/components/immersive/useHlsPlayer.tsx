/**
 * useHlsPlayer hook - HLS video playback with MP4 fallback
 * Split from consolidated immersive/index.tsx (v6.0.67)
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import Hls from '../../lib/hls-shim';
import { preloadHls } from '../../lib/hls-shim';

interface UseHlsPlayerOptions {
  videoUrl: string;
  onError?: () => void;
}

interface UseHlsPlayerResult {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  isLoading: boolean;
  videoError: string | null;
  errorHandlingDisabledRef: React.MutableRefObject<boolean>;
  handleError: (e: React.SyntheticEvent<HTMLVideoElement>) => void;
  handleLoadStart: () => void;
  handleCanPlay: () => void;
}

export function useHlsPlayer({ videoUrl, onError }: UseHlsPlayerOptions): UseHlsPlayerResult {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const fallbackAttemptedRef = useRef(false);
  const hlsErrorCountRef = useRef(0);
  const errorHandlingDisabledRef = useRef(false);

  const [isLoading, setIsLoading] = useState(true);
  const [videoError, setVideoError] = useState<string | null>(null);
  const [useDirectMp4, setUseDirectMp4] = useState(false);

  const extractMp4FromM3u8 = useCallback(async (m3u8Url: string): Promise<string[]> => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      try {
        const response = await fetch(m3u8Url, { signal: controller.signal, mode: 'cors', cache: 'no-cache' });
        clearTimeout(timeoutId);
        if (!response.ok) { console.error('[useHlsPlayer] Failed to fetch M3U8:', response.status); return []; }
        const playlistText = await response.text();
        const mp4Urls: string[] = [];
        const lines = playlistText.split('\n');
        const baseUrl = m3u8Url.substring(0, m3u8Url.lastIndexOf('/') + 1);
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith('#')) continue;
          if (trimmed.includes('.mp4')) {
            mp4Urls.push(trimmed.startsWith('http') ? trimmed : baseUrl + trimmed);
          }
        }
        if (mp4Urls.length === 0) console.error('[useHlsPlayer] No MP4 URLs found in M3U8 playlist');
        return mp4Urls;
      } catch (fetchError: any) {
        clearTimeout(timeoutId);
        if (fetchError.name === 'AbortError') throw new Error('视频播放列表获取超时');
        throw fetchError;
      }
    } catch (error: any) {
      console.error('[useHlsPlayer] Failed to parse M3U8:', error.message || error);
      return [];
    }
  }, []);

  const fallbackToDirectMp4 = useCallback(async () => {
    if (fallbackAttemptedRef.current) {
      errorHandlingDisabledRef.current = true;
      if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; }
      const video = videoRef.current;
      if (video && video.src && video.src.includes('.m3u8')) { video.removeAttribute('src'); video.load(); }
      setVideoError('视频文件不可用，请稍后重试');
      setIsLoading(false);
      if (onError) onError();
      return;
    }
    fallbackAttemptedRef.current = true;
    try {
      const mp4Urls = await extractMp4FromM3u8(videoUrl);
      if (mp4Urls.length > 0) {
        if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; }
        setUseDirectMp4(true);
        const video = videoRef.current;
        if (video) {
          video.src = mp4Urls[0];
          video.load();
          video.addEventListener('loadeddata', () => { setIsLoading(false); setVideoError(null); }, { once: true });
          video.addEventListener('error', () => { setVideoError('视频文件无法播放'); setIsLoading(false); }, { once: true });
          video.play().catch(() => {});
        }
      } else {
        if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; }
        const video = videoRef.current;
        if (video) { video.removeAttribute('src'); video.load(); }
        setVideoError('视频文件不可用，请稍后重试');
        setIsLoading(false);
        if (onError) onError();
      }
    } catch (error) {
      console.error('[useHlsPlayer] Fallback failed:', error);
      if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; }
      const video = videoRef.current;
      if (video) { video.removeAttribute('src'); video.load(); }
      setVideoError('视频加载失败');
      setIsLoading(false);
      if (onError) onError();
    }
  }, [videoUrl, onError, extractMp4FromM3u8]);

  useEffect(() => {
    if (!videoUrl || videoUrl.trim() === '') { setVideoError('视频URL为空'); setIsLoading(false); return; }
    if (videoUrl.trim().startsWith('{') || videoUrl.trim().startsWith('[')) {
      setVideoError('此视频为播放列表格式，请使用播放列表播放器'); setIsLoading(false); if (onError) onError(); return;
    }
    setVideoError(null); setIsLoading(true);
  }, [videoUrl]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !videoUrl) return;
    let cancelled = false;
    (async () => {
      await preloadHls();
      if (cancelled) return;
      if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; }
      const isM3U8 = videoUrl.endsWith('.m3u8') || videoUrl.includes('.m3u8?');
      if (isM3U8 && Hls.isSupported()) {
        const hls = new Hls({
          enableWorker: true, lowLatencyMode: false, debug: false,
          maxBufferLength: 30, maxMaxBufferLength: 60, maxBufferSize: 60 * 1000 * 1000, maxBufferHole: 0.5,
          manifestLoadingTimeOut: 20000, manifestLoadingMaxRetry: 6, manifestLoadingRetryDelay: 1000,
          levelLoadingTimeOut: 20000, levelLoadingMaxRetry: 6, levelLoadingRetryDelay: 1000,
          fragLoadingTimeOut: 30000, fragLoadingMaxRetry: 6, fragLoadingRetryDelay: 1000,
          autoStartLoad: true, startPosition: -1,
        });
        hlsRef.current = hls;
        hls.loadSource(videoUrl);
        hls.attachMedia(video);
        hls.on(Hls.Events.MANIFEST_PARSED, () => { setIsLoading(false); setVideoError(null); });
        hls.on(Hls.Events.ERROR, (_event, data) => {
          hlsErrorCountRef.current++;
          console.error('[useHlsPlayer] HLS error:', data);
          if (data.details === 'fragParsingError') {
            if (data.fatal || hlsErrorCountRef.current >= 3) { fallbackToDirectMp4(); return; }
            return;
          }
          if (data.fatal) {
            switch (data.type) {
              case Hls.ErrorTypes.NETWORK_ERROR: setVideoError('网络错误，正在重试...'); hls.startLoad(); break;
              case Hls.ErrorTypes.MEDIA_ERROR:
                setVideoError('媒体错误，正在重试...');
                try { hls.recoverMediaError(); } catch { fallbackToDirectMp4(); }
                break;
              default: fallbackToDirectMp4(); break;
            }
            if (onError) onError();
          }
        });
        hls.on(Hls.Events.MEDIA_ATTACHED, () => {});
        hls.on(Hls.Events.LEVEL_LOADED, () => {});
      } else if (isM3U8 && video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = videoUrl;
      } else {
        video.src = videoUrl;
      }
    })();
    return () => { cancelled = true; if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; } };
  }, [videoUrl, onError, fallbackToDirectMp4]);

  useEffect(() => {
    const video = videoRef.current;
    return () => { if (video) { video.pause(); video.src = ''; video.load(); } };
  }, []);

  const handleError = useCallback((e: React.SyntheticEvent<HTMLVideoElement>) => {
    if (errorHandlingDisabledRef.current) return;
    const target = e.target as HTMLVideoElement;
    const error = target.error;
    let errorMessage = '视频加载失败';
    if (error) {
      switch (error.code) {
        case MediaError.MEDIA_ERR_ABORTED: errorMessage = '视频加载被中止'; break;
        case MediaError.MEDIA_ERR_NETWORK: errorMessage = '网络错误，请检查网络连接'; break;
        case MediaError.MEDIA_ERR_DECODE: errorMessage = '视频解码失败，可能是格式不支持'; break;
        case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED: errorMessage = '不支持的视频格式或URL无效'; break;
        default: errorMessage = error.message || '未知错误';
      }
    }
    console.error('[useHlsPlayer] Video error:', { errorCode: error?.code, videoUrl, networkState: target.networkState });
    setVideoError(errorMessage); setIsLoading(false); if (onError) onError();
  }, [videoUrl, onError]);

  const handleLoadStart = useCallback(() => setIsLoading(true), []);
  const handleCanPlay = useCallback(() => setIsLoading(false), []);

  return { videoRef, isLoading, videoError, errorHandlingDisabledRef, handleError, handleLoadStart, handleCanPlay };
}