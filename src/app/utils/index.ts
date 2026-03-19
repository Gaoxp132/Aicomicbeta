/**
 * Consolidated utils module (v6.0.67)
 * Merged from: apiClient.ts, formatters.ts, shareUtils.ts, workConverters.ts
 * Reduces Rollup module count by 3.
 * v6.0.112: Rebuilt after accidental truncation
 */

import { getApiUrl, getDefaultApiHeaders, projectId } from '../constants';
import type { Comic } from '../types';

// Re-export for infrastructure components (EdgeFunctionError, etc.)
export { getApiUrl, projectId };

// ═══════════════════════════════════════════════════════════════════
// [0] Error utility
// ═══════════════════════════════════════════════════════════════════

/** Safely extract error message from unknown catch value */
export function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  return String(err);
}

// ═══════════════════════════════════════════════════════════════════
// [0.1] Auto-defaults: 根据作品类型自动推断画面比例、分辨率、集数
// ═══════════════════════════════════════════════════════════════════

export interface AutoDefaults {
  aspectRatio: string;
  resolution: string;
  episodeCount: number;
}

export function getAutoDefaults(productionType?: string): AutoDefaults {
  switch (productionType) {
    case 'brand_promo':
    case 'product_promo':
    case 'advertisement':
      return { aspectRatio: '16:9', resolution: '720p', episodeCount: 1 };
    case 'movie':
    case 'documentary':
      return { aspectRatio: '16:9', resolution: '720p', episodeCount: 1 };
    case 'music_video':
      return { aspectRatio: '9:16', resolution: '720p', episodeCount: 1 };
    case 'tv_series':
      return { aspectRatio: '16:9', resolution: '720p', episodeCount: 12 };
    case 'micro_film':
      return { aspectRatio: '16:9', resolution: '720p', episodeCount: 1 };
    case 'comic_drama':
    case 'short_drama':
    default:
      return { aspectRatio: '9:16', resolution: '720p', episodeCount: 6 };
  }
}

/** Check if production type is a promo/ad type */
export function isPromoType(productionType?: string): boolean {
  return productionType === 'brand_promo' || productionType === 'product_promo' || productionType === 'advertisement';
}

// ═══════════════════════════════════════════════════════════════════
// [A] API Client (was: apiClient.ts)
// ══════════════════════════════════════════════════════════════════

// Network status tracking
let _edgeFunctionReachable = true;
let _lastNetworkSuccessTime = 0;

export function isEdgeFunctionReachable(): boolean {
  return _edgeFunctionReachable;
}

export function markNetworkSuccess(): void {
  _edgeFunctionReachable = true;
  _lastNetworkSuccessTime = Date.now();
}

function markNetworkFailure(): void {
  _edgeFunctionReachable = false;
}

interface ApiRequestOptions {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
  timeout?: number;
  maxRetries?: number;
  silent?: boolean;
}

/**
 * API 通用返回类型 — data 形状因端点而异，使用 index signature 兼容后端动态字段
 * data 使用 Record<string, unknown> 允许属性访问但返回 unknown，强制调用方窄化
 */
export type ApiResult = { success: boolean; data?: Record<string, unknown>; error?: string; [key: string]: unknown };

/** Type-safe accessor for ApiResult.data — avoids scattered `as` casts at call sites */
export function getResultData<T>(result: ApiResult): T | undefined {
  return result.data as T | undefined;
}

/**
 * Core API request function with retry, timeout, and error handling
 */
export async function apiRequest(
  endpoint: string,
  options: ApiRequestOptions = {}
): Promise<ApiResult> {
  const {
    method = 'GET',
    body,
    headers: extraHeaders = {},
    timeout = 30000,
    maxRetries = 2,
    silent = false,
  } = options;

  const url = getApiUrl(endpoint);
  const defaultHeaders = getDefaultApiHeaders();
  const headers: Record<string, string> = { ...defaultHeaders, ...extraHeaders };

  // Don't set Content-Type for FormData (let browser set boundary)
  if (body instanceof FormData) {
    delete headers['Content-Type'];
  }

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      const fetchOptions: RequestInit = {
        method,
        headers,
        signal: controller.signal,
      };

      if (body !== undefined && method !== 'GET' && method !== 'HEAD') {
        fetchOptions.body = body instanceof FormData ? body : (typeof body === 'string' ? body : JSON.stringify(body));
      }

      const response = await fetch(url, fetchOptions);
      clearTimeout(timeoutId);

      markNetworkSuccess();

      // Parse response
      const contentType = response.headers.get('content-type') || '';
      let data: unknown;

      if (contentType.includes('application/json')) {
        data = await response.json();
      } else {
        const text = await response.text();
        try { data = JSON.parse(text); } catch { data = text; }
      }

      if (!response.ok) {
        // Return structured error for non-2xx responses
        const dataObj = (typeof data === 'object' && data !== null ? data : {}) as Record<string, unknown>;
        const errorMessage = String(dataObj.error || dataObj.message || `HTTP ${response.status}`);
        if (!silent) {
          console.error(`[apiRequest] ${method} ${endpoint} → ${response.status}:`, errorMessage);
        }
        return {
          success: false,
          error: errorMessage,
          status: response.status,
          ...dataObj,
        };
      }

      // Handle success — some endpoints return { success, data, ... } wrapper
      if (typeof data === 'object' && data !== null && 'success' in data) {
        return data as ApiResult;
      }

      return { success: true, data: (typeof data === 'object' && data !== null ? data : { _raw: data }) as Record<string, unknown> };
    } catch (err: unknown) {
      lastError = err instanceof Error ? err : new Error(String(err));

      if (err instanceof Error && err.name === 'AbortError') {
        if (!silent) console.error(`[apiRequest] ${method} ${endpoint} → timeout after ${timeout}ms`);
        if (attempt < maxRetries) continue;
        return { success: false, error: `请求超时 (${Math.round(timeout / 1000)}秒)` };
      }

      const errMsg = getErrorMessage(err);
      if (errMsg.includes('Failed to fetch') || errMsg.includes('NetworkError')) {
        markNetworkFailure();
      }

      if (!silent) {
        console.error(`[apiRequest] ${method} ${endpoint} attempt ${attempt + 1}/${maxRetries + 1}:`, errMsg);
      }

      if (attempt < maxRetries) {
        await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt)));
        continue;
      }
    }
  }

  return { success: false, error: lastError?.message || '网络请求失败' };
}

/**
 * GET shorthand
 */
export async function apiGet(
  endpoint: string,
  options: Omit<ApiRequestOptions, 'method' | 'body'> = {}
): Promise<ApiResult> {
  return apiRequest(endpoint, { ...options, method: 'GET' });
}

/**
 * POST shorthand
 */
export async function apiPost(
  endpoint: string,
  body?: unknown,
  options: Omit<ApiRequestOptions, 'method' | 'body'> = {}
): Promise<ApiResult> {
  return apiRequest(endpoint, { ...options, method: 'POST', body });
}

/**
 * DELETE shorthand
 */
export async function apiDelete(
  endpoint: string,
  body?: unknown,
  options: Omit<ApiRequestOptions, 'method' | 'body'> = {}
): Promise<ApiResult> {
  return apiRequest(endpoint, { ...options, method: 'DELETE', body });
}

/**
 * PUT shorthand
 */
export async function apiPut(
  endpoint: string,
  body?: unknown,
  options: Omit<ApiRequestOptions, 'method' | 'body'> = {}
): Promise<ApiResult> {
  return apiRequest(endpoint, { ...options, method: 'PUT', body });
}

/**
 * Upload (FormData) shorthand
 */
export async function apiUpload(
  endpoint: string,
  formData: FormData,
  options: Omit<ApiRequestOptions, 'method' | 'body'> = {}
): Promise<ApiResult> {
  return apiRequest(endpoint, {
    ...options,
    method: 'POST',
    body: formData,
    timeout: options.timeout || 60000,
  });
}

// ═══════════════════════════════════════════════════════════════════
// [A-2] Video Codec Preference (v6.0.77)
// ═══════════════════════════════════════════════════════════════════

/**
 * Returns the preferred video codec — always 'h265' for better compression.
 * v6.0.77: H265 auto-default + fallback
 */
export function getVideoCodecPreference(): 'h265' | 'h264' {
  return 'h265';
}

// ═══════════════════════════════════════════════════════════════════
// [B] Formatters (was: formatters.ts)
// ═══════════════════════════════════════════════════════════════════

/**
 * Format seconds to MM:SS or HH:MM:SS
 */
export function formatTime(seconds: number): string {
  if (!seconds || isNaN(seconds)) return '0:00';
  const s = Math.floor(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

/**
 * Format duration in seconds to human-readable (e.g. "2分30秒")
 */
export function formatDuration(seconds: number): string {
  if (!seconds || isNaN(seconds)) return '0秒';
  const s = Math.floor(seconds);
  if (s < 60) return `${s}秒`;
  const m = Math.floor(s / 60);
  const remainSec = s % 60;
  if (m < 60) return remainSec > 0 ? `${m}分${remainSec}秒` : `${m}分`;
  const h = Math.floor(m / 60);
  const remainMin = m % 60;
  return remainMin > 0 ? `${h}时${remainMin}分` : `${h}时`;
}

/**
 * Format large numbers (e.g. 12000 → "1.2万")
 */
export function formatNumber(num: number): string {
  if (num >= 100000000) return (num / 100000000).toFixed(1).replace(/\.0$/, '') + '亿';
  if (num >= 10000) return (num / 10000).toFixed(1).replace(/\.0$/, '') + '万';
  if (num >= 1000) return (num / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
  return String(num);
}

// ═══════════════════════════════════════════════════════════════════
// [C] Share Utils (was: shareUtils.ts)
// ═══════════════════════════════════════════════════════════════════

type ShareResult = 'shared' | 'copied' | 'cancelled' | 'failed';

/**
 * Share content using Web Share API with clipboard fallback
 */
export async function shareContent(opts: {
  title: string;
  text: string;
  url: string;
}): Promise<ShareResult> {
  // Level 1: Web Share API (mobile)
  if (navigator.share) {
    try {
      await navigator.share(opts);
      return 'shared';
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') return 'cancelled';
      // Fall through to clipboard
    }
  }

  // Level 2: Clipboard API
  try {
    await navigator.clipboard.writeText(opts.url);
    return 'copied';
  } catch {
    // Level 3: Legacy fallback
    try {
      const textarea = document.createElement('textarea');
      textarea.value = opts.url;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      return 'copied';
    } catch {
      return 'failed';
    }
  }
}

// ═══════════════════════════════════════════════════════════════════
// [D] Work Converters (was: workConverters.ts)
// ═══════════════════════════════════════════════════════════════════

/**
 * v6.0.83: 画面比例中文标签（EpisodePlayer / ImmersiveVideoViewer 显示用）
 */
export const ASPECT_RATIO_LABELS: Record<string, string> = {
  '9:16': '竖屏',
  '16:9': '横屏',
  '1:1': '方形',
  '3:4': '竖屏经典',
  '4:3': '经典',
};

/**
 * v6.0.111: 画面比例 → 推荐分辨率映射（客户端+服务端统一）
 */
export const ASPECT_TO_RESOLUTION: Record<string, string> = {
  '9:16': '720x1280',
  '16:9': '1280x720',
  '1:1': '720x720',
  '3:4': '720x960',
  '4:3': '960x720',
};

/**
 * v6.0.83: 获取 CSS aspect-ratio 值
 */
export function getAspectCssValue(aspectRatio?: string): string {
  if (!aspectRatio) return '9/16';
  return aspectRatio.replace(':', '/');
}

/** API 原始作品数据（双命名兼容，支持 camelCase / snake_case） */
export interface RawWork {
  [key: string]: unknown;
  id?: string; task_id?: string; title?: string; prompt?: string;
  style?: string; thumbnail?: string; thumbnailUrl?: string; image_url?: string;
  videoUrl?: string; video_url?: string; duration?: string;
  createdAt?: string; created_at?: string;
  status?: string; metadata?: Record<string, unknown> | null; generation_metadata?: Record<string, unknown> | null;
  likes?: number; like_count?: number; views?: number; view_count?: number;
  shares?: number; share_count?: number; comments?: number; comment_count?: number;
  userPhone?: string; user_phone?: string; userNickname?: string; user_nickname?: string;
  aspectRatio?: string; aspect_ratio?: string;
  taskId?: string; imageUrls?: string[]; image_urls?: string[];
  resolution?: string; fps?: number; enableAudio?: boolean; model?: string;
  seriesId?: string; series_id?: string;
  type?: string;
}

/**
 * Normalize raw works array from API
 */
export function normalizeWorks(works: RawWork[]): RawWork[] {
  if (!Array.isArray(works)) return [];
  return works.map(work => ({
    ...work,
    id: work.id || work.task_id || '',
    title: work.title || work.prompt || '无标题',
    prompt: work.prompt || work.title || '',
    style: work.style || '',
    thumbnail: work.thumbnail || work.thumbnailUrl || work.image_url || '',
    videoUrl: work.videoUrl || work.video_url || '',
    createdAt: work.createdAt || work.created_at || new Date().toISOString(),
    status: work.status || 'completed',
    metadata: work.metadata || work.generation_metadata || null,
    likes: work.likes || work.like_count || 0,
    views: work.views || work.view_count || 0,
    shares: work.shares || work.share_count || 0,
    comments: work.comments || work.comment_count || 0,
    userPhone: work.userPhone || work.user_phone || '',
    userNickname: work.userNickname || work.user_nickname || '',
    aspectRatio: work.aspectRatio || work.aspect_ratio || '',
  }));
}

/**
 * Convert a raw work object to Comic type for ImmersiveVideoViewer
 */
export function convertWorkToComic(work: RawWork): Comic {
  return {
    id: work.id || work.task_id || '',
    title: work.title || work.prompt || '无标题',
    prompt: work.prompt || work.title || '',
    style: work.style || '',
    duration: work.duration || '',
    thumbnail: work.thumbnail || work.thumbnailUrl || work.image_url || '',
    videoUrl: work.videoUrl || work.video_url || '',
    createdAt: work.createdAt ? new Date(work.createdAt) : (work.created_at ? new Date(work.created_at) : new Date()),
    status: work.status || 'completed',
    taskId: work.taskId || work.task_id,
    imageUrls: work.imageUrls || work.image_urls,
    resolution: work.resolution,
    aspectRatio: work.aspectRatio || work.aspect_ratio,
    fps: work.fps,
    enableAudio: work.enableAudio,
    model: work.model,
    userPhone: work.userPhone || work.user_phone,
    metadata: work.metadata || work.generation_metadata,
    seriesId: work.seriesId || work.series_id,
  };
}

// ═══════════════════════════════════════════════════════════════════
// [E] Field Accessors — snake_case/camelCase 双兼容
// ═══════════════════════════════════════════════════════════════════

import type { Storyboard, Episode } from '../types';

type RawStoryboard = Storyboard & { video_url?: string; thumbnail_url?: string; image_url?: string };
type RawEpisode = Episode & { merged_video_url?: string };

export function sbVideoUrl(sb: Storyboard): string {
  return sb.videoUrl || (sb as RawStoryboard).video_url || '';
}

export function sbThumbnailUrl(sb: Storyboard): string {
  return sb.thumbnailUrl || (sb as RawStoryboard).thumbnail_url || '';
}

export function sbImageUrl(sb: Storyboard): string {
  return sb.imageUrl || (sb as RawStoryboard).image_url || '';
}

export function epMergedVideoUrl(ep: Episode): string {
  return ep.mergedVideoUrl || (ep as RawEpisode).merged_video_url || '';
}

/**
 * 智能推断 episode 的实际状态：
 * 如果有合并视频或所有分镜都有 videoUrl，视为 completed
 */
export function getEffectiveEpisodeStatus(ep: Episode): string {
  if (ep.status === 'completed') return 'completed';
  const merged = epMergedVideoUrl(ep);
  if (merged && merged.trim().length > 0) return 'completed';
  const sbs = ep.storyboards;
  if (sbs && sbs.length > 0 && sbs.every(sb => sb.videoUrl)) return 'completed';
  return ep.status;
}