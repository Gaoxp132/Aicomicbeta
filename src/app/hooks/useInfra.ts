/**
 * Infrastructure hooks - Auth, CachedData, EdgeFunctionStatus, Fullscreen, VideoPlayer
 * Split from consolidated hooks/index.ts (v6.0.67)
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { STORAGE_KEYS, getApiUrl, getAuthOnlyHeaders } from '../constants';
import { markNetworkSuccess, getErrorMessage } from '../utils';

// ═══════════════════════════════════════════════════════════════════
// [1] useAuth
// ═══════════════════════════════════════════════════════════════════

export function useAuth() {
  const [userPhone, setUserPhone] = useState<string>('');
  const [showLoginDialog, setShowLoginDialog] = useState(false);

  useEffect(() => {
    const savedPhone = localStorage.getItem(STORAGE_KEYS.USER_PHONE);
    if (savedPhone) setUserPhone(savedPhone);
  }, []);

  const handleLoginSuccess = (phone: string) => { setUserPhone(phone); };
  const handleLogout = () => {
    localStorage.removeItem(STORAGE_KEYS.USER_PHONE);
    localStorage.removeItem(STORAGE_KEYS.LOGIN_TIME);
    setUserPhone('');
  };

  return { userPhone, showLoginDialog, setShowLoginDialog, handleLoginSuccess, handleLogout };
}

// ═══════════════════════════════════════════════════════════════════
// [2] useCachedData
// ═══════════════════════════════════════════════════════════════════

interface CacheEntry<T> { data: T; timestamp: number; version: number; }
interface CacheOptions { ttl?: number; autoLoad?: boolean; cacheKey: string; }

const globalCache = new Map<string, CacheEntry<any>>();
const dataVersions = new Map<string, number>();

export function useCachedData<T>(fetchFn: () => Promise<T>, options: CacheOptions) {
  const { ttl = 5 * 60 * 1000, autoLoad = false, cacheKey } = options;
  const [data, setData] = useState<T | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const isMountedRef = useRef(true);
  const isLoadingRef = useRef(false);

  useEffect(() => { isMountedRef.current = true; return () => { isMountedRef.current = false; }; }, []);

  const isCacheValid = useCallback(() => {
    const cached = globalCache.get(cacheKey);
    if (!cached) return false;
    const currentVersion = dataVersions.get(cacheKey) || 0;
    return !(Date.now() - cached.timestamp > ttl || cached.version !== currentVersion);
  }, [cacheKey, ttl]);

  const loadFromCache = useCallback(() => {
    const cached = globalCache.get(cacheKey);
    if (cached && isCacheValid()) { setData(cached.data); setLastUpdated(cached.timestamp); return true; }
    return false;
  }, [cacheKey, isCacheValid]);

  const load = useCallback(async (forceRefresh = false) => {
    if (isLoadingRef.current) return;
    if (!forceRefresh && loadFromCache()) return;
    isLoadingRef.current = true; setIsLoading(true); setError(null);
    try {
      const result = await fetchFn();
      if (!isMountedRef.current) return;
      const now = Date.now();
      const currentVersion = dataVersions.get(cacheKey) || 0;
      globalCache.set(cacheKey, { data: result, timestamp: now, version: currentVersion });
      setData(result); setLastUpdated(now); setError(null);
    } catch (err: unknown) {
      console.error(`[useCachedData] Error loading ${cacheKey}:`, err);
      if (!isMountedRef.current) return;
      setError(getErrorMessage(err));
      const cached = globalCache.get(cacheKey);
      if (cached) { setData(cached.data); setLastUpdated(cached.timestamp); }
    } finally { if (isMountedRef.current) setIsLoading(false); isLoadingRef.current = false; }
  }, [cacheKey, fetchFn, loadFromCache]);

  const refresh = useCallback(() => load(true), [load, cacheKey]);
  const clearCache = useCallback(() => { globalCache.delete(cacheKey); setData(null); setLastUpdated(null); }, [cacheKey]);
  const setDataManually = useCallback((newData: T) => {
    const now = Date.now(); const currentVersion = dataVersions.get(cacheKey) || 0;
    globalCache.set(cacheKey, { data: newData, timestamp: now, version: currentVersion });
    setData(newData); setLastUpdated(now);
  }, [cacheKey]);

  useEffect(() => { if (autoLoad) load(); }, []);

  return { data, isLoading, error, lastUpdated, load, refresh, clearCache, setData: setDataManually, isCacheValid: isCacheValid() };
}

export function invalidateCache(cacheKey: string) {
  const currentVersion = dataVersions.get(cacheKey) || 0;
  dataVersions.set(cacheKey, currentVersion + 1);
}

// ═══════════════════════════════════════════════════════════════════
// [7] useEdgeFunctionStatus
// ═══════════════════════════════════════════════════════════════════

export interface DeployVerifyResult {
  status: string; version: string; deployHash: string; totalLatencyMs: number; timestamp: string; error?: string;
  checks: { modules: Record<string, boolean>; envVars: Record<string, boolean>; database: { connected: boolean; latencyMs?: number; error?: string | null }; supabaseClient: { initialized: boolean; urlConfigured: boolean }; routing: { prefix: string; version: string; mode: string }; };
  summary: { modulesLoaded: boolean; databaseConnected: boolean; envConfigured: boolean; volcengineReady: boolean; aiReady: boolean; };
}

export function useEdgeFunctionStatus() {
  const [isConnected, setIsConnected] = useState<boolean | null>(null);
  const [isChecking, setIsChecking] = useState(true);
  const [showError, setShowError] = useState(false);
  const [serverVersion, setServerVersion] = useState<string | null>(null);
  const [deployStatus, setDeployStatus] = useState<DeployVerifyResult | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isFallbackMode, setIsFallbackMode] = useState(false);
  const [fallbackError, setFallbackError] = useState<string | null>(null);
  const consecutiveFailures = useRef(0);
  const maxConsecutiveFailures = 8;
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const hasCheckedOnce = useRef(false);
  const hasAutoVerified = useRef(false);
  const startTimeRef = useRef(Date.now());

  const fetchDeployVerify = useCallback(async () => {
    setIsVerifying(true);
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 25000);
      const response = await fetch(getApiUrl('/deploy-verify'), { method: 'GET', headers: getAuthOnlyHeaders(), signal: controller.signal });
      clearTimeout(timeoutId);
      if (response.ok) {
        const data: DeployVerifyResult = await response.json();
        setDeployStatus(data);
        if (data.status === 'error' || data.checks?.routing?.mode === 'fallback') { setIsFallbackMode(true); setFallbackError(data.error || 'app.tsx failed to load'); }
        else { setIsFallbackMode(false); setFallbackError(null); }
        console.log(`[Edge Function] Deploy verify:`, { status: data.status, version: data.version, hash: data.deployHash, db: data.summary?.databaseConnected ? 'OK' : 'FAIL', latency: `${data.totalLatencyMs}ms`, mode: data.checks?.routing?.mode || 'unknown' });
        return data;
      }
    } catch (err: unknown) { console.warn('[Edge Function] Deploy verify failed:', getErrorMessage(err)); }
    finally { setIsVerifying(false); }
    return null;
  }, []);

  const checkConnection = useCallback(async () => {
    setIsChecking(true);
    try {
      const controller = new AbortController();
      const isFirstAttempt = consecutiveFailures.current === 0;
      const timeout = isFirstAttempt ? 30000 : 15000;
      const timeoutId = setTimeout(() => controller.abort(), timeout);
      const healthUrl = getApiUrl('/health');
      if (consecutiveFailures.current <= 2) { const elapsed = Math.round((Date.now() - startTimeRef.current) / 1000); console.log(`[Edge Function] Checking (attempt ${consecutiveFailures.current + 1}, ${elapsed}s elapsed): ${healthUrl}`); }
      const response = await fetch(healthUrl, { method: 'GET', headers: getAuthOnlyHeaders(), signal: controller.signal });
      clearTimeout(timeoutId);
      if (response.ok) {
        const elapsed = Math.round((Date.now() - startTimeRef.current) / 1000);
        consecutiveFailures.current = 0; setIsConnected(true); setShowError(false); markNetworkSuccess();
        try {
          const data = await response.json();
          if (data.version) setServerVersion(data.version);
          if (data.status === 'degraded' || data.mode === 'fallback') { setIsFallbackMode(true); setFallbackError(data.error || 'Server in fallback mode'); console.warn(`[Edge Function] Server in FALLBACK mode (${elapsed}s): ${data.error || 'unknown error'}`); setShowError(true); }
          else { setIsFallbackMode(false); setFallbackError(null); console.log(`[Edge Function] Connected (${elapsed}s) - server ${data.version}, volcengine=${data.apiKeyConfigured ? 'OK' : 'N/A'}, ai=${data.aiConfigured ? 'OK' : 'N/A'}`); }
        } catch { console.log(`[Edge Function] Connected (${elapsed}s) - response not JSON but HTTP OK`); }
        if (!hasAutoVerified.current) { hasAutoVerified.current = true; fetchDeployVerify(); }
      } else {
        consecutiveFailures.current++;
        if (consecutiveFailures.current <= 3) console.error(`[Edge Function] Response error (${consecutiveFailures.current}/${maxConsecutiveFailures}): HTTP ${response.status}`);
        setIsConnected(false);
        if (consecutiveFailures.current >= maxConsecutiveFailures) setShowError(true); else scheduleRetry();
      }
    } catch (error: unknown) {
      consecutiveFailures.current++;
      if (consecutiveFailures.current <= 4) {
        const elapsed = Math.round((Date.now() - startTimeRef.current) / 1000);
        // v6.0.141: first 2 attempts use console.log (cold-start is expected), escalate to warn on attempt 3+
        const logFn = consecutiveFailures.current <= 2 ? console.log : console.warn;
        const errName = error instanceof Error ? error.name : '';
        const errMsg = error instanceof Error ? error.message : String(error);
        if (errName === 'AbortError') logFn(`[Edge Function] Timeout (attempt ${consecutiveFailures.current}, ${elapsed}s) - cold start may take 15-30s, auto-retrying...`);
        else if (errMsg === 'Failed to fetch') logFn(`[Edge Function] Waking up (attempt ${consecutiveFailures.current}, ${elapsed}s) - Edge Function cold start, auto-retrying...`);
        else console.error(`[Edge Function] Error (attempt ${consecutiveFailures.current}, ${elapsed}s):`, errMsg);
      }
      setIsConnected(false);
      if (consecutiveFailures.current >= maxConsecutiveFailures) setShowError(true); else scheduleRetry();
    } finally { setIsChecking(false); }
  }, [fetchDeployVerify]);

  const scheduleRetry = () => {
    if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current);
    // v6.0.141: faster first retry (1.5s) — Edge Function may be ready quickly after cold start
    const delays = [1500, 3000, 5000, 8000, 10000, 12000, 15000, 20000];
    const delay = delays[Math.min(consecutiveFailures.current - 1, delays.length - 1)] || 20000;
    retryTimeoutRef.current = setTimeout(() => { checkConnection(); }, delay);
  };

  useEffect(() => {
    if (!hasCheckedOnce.current) { startTimeRef.current = Date.now(); checkConnection(); hasCheckedOnce.current = true; }
    return () => { if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current); };
  }, [checkConnection]);

  const dismissError = () => { setShowError(false); consecutiveFailures.current = 0; if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current); };

  return { isConnected, isChecking, showError, dismissError, retry: checkConnection, serverVersion, deployStatus, isVerifying, fetchDeployVerify, retryCount: consecutiveFailures.current, isFallbackMode, fallbackError };
}

// ═══════════════════════════════════════════════════════════════════
// [8] useFullscreen
// ═══════════════════════════════════════════════════════════════════

export function useFullscreen(containerRef: React.RefObject<HTMLDivElement>) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [fullscreenSupported, setFullscreenSupported] = useState(true);

  useEffect(() => {
    const elem = document.createElement('div');
    const isSupported = !!(elem.requestFullscreen || elem.mozRequestFullScreen || elem.webkitRequestFullscreen || elem.msRequestFullscreen);
    try {
      const test = document.fullscreenEnabled || document.webkitFullscreenEnabled || document.mozFullScreenEnabled || document.msFullscreenEnabled;
      setFullscreenSupported(isSupported && test !== false);
    } catch { setFullscreenSupported(false); }
  }, []);

  useEffect(() => {
    const handler = () => { setIsFullscreen(!!document.fullscreenElement); };
    document.addEventListener('fullscreenchange', handler); document.addEventListener('webkitfullscreenchange', handler);
    document.addEventListener('mozfullscreenchange', handler); document.addEventListener('MSFullscreenChange', handler);
    return () => { document.removeEventListener('fullscreenchange', handler); document.removeEventListener('webkitfullscreenchange', handler); document.removeEventListener('mozfullscreenchange', handler); document.removeEventListener('MSFullscreenChange', handler); };
  }, []);

  useEffect(() => {
    const lockOrientation = async () => {
      if (isFullscreen && screen.orientation && screen.orientation.lock) { try { await screen.orientation.lock('landscape'); } catch {} }
      else if (!isFullscreen && screen.orientation && screen.orientation.unlock) { try { screen.orientation.unlock(); } catch {} }
    };
    lockOrientation();
  }, [isFullscreen]);

  const toggleFullscreen = async () => {
    if (!containerRef.current) return;
    try {
      if (!isFullscreen) {
        if (containerRef.current.requestFullscreen) await containerRef.current.requestFullscreen();
        else if (containerRef.current.mozRequestFullScreen) await containerRef.current.mozRequestFullScreen();
        else if (containerRef.current.webkitRequestFullscreen) await containerRef.current.webkitRequestFullscreen();
        else if (containerRef.current.msRequestFullscreen) await containerRef.current.msRequestFullscreen();
      } else {
        if (document.exitFullscreen) await document.exitFullscreen();
        else if (document.mozCancelFullScreen) await document.mozCancelFullScreen();
        else if (document.webkitExitFullscreen) await document.webkitExitFullscreen();
        else if (document.msExitFullscreen) await document.msExitFullscreen();
      }
    } catch (error: unknown) { console.error('全屏切换失败:', error); }
  };

  return { isFullscreen, fullscreenSupported, toggleFullscreen };
}

// ═══════════════════════════════════════════════════════════════════
// [10] useVideoPlayer
// ═══════════════════════════════════════════════════════════════════

export function useVideoPlayer() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  return { isPlaying, isMuted, currentTime, duration, setIsPlaying, setIsMuted, setCurrentTime, setDuration };
}