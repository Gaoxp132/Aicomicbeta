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
// [A] API Client (was: apiClient.ts)
// ═══════════════════════════════════════════════════════════════════

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
  body?: any;
  headers?: Record<string, string>;
  timeout?: number;
  maxRetries?: number;
  silent?: boolean;
}

/**
 * Core API request function with retry, timeout, and error handling
 */
export async function apiRequest(
  endpoint: string,
  options: ApiRequestOptions = {}
): Promise<{ success: boolean; data?: any; error?: string; [key: string]: any }> {
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
        fetchOptions.body = body instanceof FormData ? body : JSON.stringify(body);
      }

      const response = await fetch(url, fetchOptions);
      clearTimeout(timeoutId);

      markNetworkSuccess();

      // Parse response
      const contentType = response.headers.get('content-type') || '';
      let data: any;

      if (contentType.includes('application/json')) {
        data = await response.json();
      } else {
        const text = await response.text();
        try { data = JSON.parse(text); } catch { data = text; }
      }

      if (!response.ok) {
        // Return structured error for non-2xx responses
        const errorMessage = data?.error || data?.message || `HTTP ${response.status}`;
        if (!silent) {
          console.error(`[apiRequest] ${method} ${endpoint} → ${response.status}:`, errorMessage);
        }
        return {
          success: false,
          error: errorMessage,
          status: response.status,
          ...(typeof data === 'object' && data !== null ? data : {}),
        };
      }

      // Handle success — some endpoints return { success, data, ... } wrapper
      if (typeof data === 'object' && data !== null && 'success' in data) {
        return data;
      }

      return { success: true, data };
    } catch (err: any) {
      lastError = err;

      if (err.name === 'AbortError') {
        if (!silent) console.error(`[apiRequest] ${method} ${endpoint} → timeout after ${timeout}ms`);
        if (attempt < maxRetries) continue;
        return { success: false, error: `���求超时 (${Math.round(timeout / 1000)}秒)` };
      }

      if (err.message?.includes('Failed to fetch') || err.message?.includes('NetworkError')) {
        markNetworkFailure();
      }

      if (!silent) {
        console.error(`[apiRequest] ${method} ${endpoint} attempt ${attempt + 1}/${maxRetries + 1}:`, err.message);
      }

      if (attempt < maxRetries) {
        // Exponential backoff
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
): Promise<{ success: boolean; data?: any; error?: string; [key: string]: any }> {
  return apiRequest(endpoint, { ...options, method: 'GET' });
}

/**
 * POST shorthand
 */
export async function apiPost(
  endpoint: string,
  body?: any,
  options: Omit<ApiRequestOptions, 'method' | 'body'> = {}
): Promise<{ success: boolean; data?: any; error?: string; [key: string]: any }> {
  return apiRequest(endpoint, { ...options, method: 'POST', body });
}

/**
 * DELETE shorthand
 */
export async function apiDelete(
  endpoint: string,
  body?: any,
  options: Omit<ApiRequestOptions, 'method' | 'body'> = {}
): Promise<{ success: boolean; data?: any; error?: string; [key: string]: any }> {
  return apiRequest(endpoint, { ...options, method: 'DELETE', body });
}

/**
 * PUT shorthand
 */
export async function apiPut(
  endpoint: string,
  body?: any,
  options: Omit<ApiRequestOptions, 'method' | 'body'> = {}
): Promise<{ success: boolean; data?: any; error?: string; [key: string]: any }> {
  return apiRequest(endpoint, { ...options, method: 'PUT', body });
}

/**
 * Upload (FormData) shorthand
 */
export async function apiUpload(
  endpoint: string,
  formData: FormData,
  options: Omit<ApiRequestOptions, 'method' | 'body'> = {}
): Promise<{ success: boolean; data?: any; error?: string; [key: string]: any }> {
  return apiRequest(endpoint, {
    ...options,
    method: 'POST',
    body: formData,
    timeout: options.timeout || 60000,
  });
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
    } catch (err: any) {
      if (err.name === 'AbortError') return 'cancelled';
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