/**
 * 工具函数模块
 * v6.0.77
 */

import { createClient } from "npm:@supabase/supabase-js@2.49.8";

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error(`[Utils] CRITICAL: Missing env vars. URL=${SUPABASE_URL ? 'set' : 'EMPTY'}, KEY=${SUPABASE_SERVICE_KEY ? 'set' : 'EMPTY'}`);
}

// Guard: createClient throws if URL is empty — use placeholder to prevent module crash
export const supabase = createClient(
  SUPABASE_URL || 'https://placeholder.supabase.co',
  SUPABASE_SERVICE_KEY || 'placeholder-key',
  { db: { schema: 'public' }, auth: { persistSession: false, autoRefreshToken: false } }
);

// Recursive JSON-safe value type for case-conversion utilities
type JsonValue = string | number | boolean | null | undefined | JsonValue[] | { [key: string]: JsonValue };

// Snake_case → camelCase 转换
function snakeToCamel(str: string): string {
  return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

export function toCamelCase<T extends JsonValue>(obj: T): T {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) return obj.map(item => toCamelCase(item)) as T;
  if (typeof obj === 'object' && (obj as object).constructor === Object) {
    const result: Record<string, JsonValue> = {};
    for (const key in obj as Record<string, JsonValue>) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        result[snakeToCamel(key)] = toCamelCase((obj as Record<string, JsonValue>)[key]);
      }
    }
    return result as T;
  }
  return obj;
}

// camelCase → snake_case 转换
function camelToSnake(str: string): string {
  return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
}

export function toSnakeCase<T extends JsonValue>(obj: T): T {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) return obj.map(item => toSnakeCase(item)) as T;
  if (typeof obj === 'object' && (obj as object).constructor === Object) {
    const result: Record<string, JsonValue> = {};
    for (const key in obj as Record<string, JsonValue>) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        result[camelToSnake(key)] = toSnakeCase((obj as Record<string, JsonValue>)[key]);
      }
    }
    return result as T;
  }
  return obj;
}

// 安全提取错误消息（用于 catch (error: unknown) 场景）
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object' && 'message' in error && typeof (error as { message: unknown }).message === 'string') {
    return (error as { message: string }).message;
  }
  return String(error);
}

// 安全提取错误名称（用于判断 TimeoutError/AbortError 等）
export function getErrorName(error: unknown): string {
  if (error instanceof Error) return error.name;
  if (error && typeof error === 'object' && 'name' in error && typeof (error as { name: unknown }).name === 'string') {
    return (error as { name: string }).name;
  }
  return '';
}

// 类型守卫：concatMP4 抛出的分辨率不匹配错误
export interface ResolutionMismatchDetail {
  resolutionMismatch: true;
  mismatchedSegmentIndices?: number[];
  majorityResolution?: string;
  message: string;
}
export function isResolutionMismatchError(e: unknown): e is ResolutionMismatchDetail {
  return typeof e === 'object' && e !== null && 'resolutionMismatch' in e && (e as Record<string, unknown>).resolutionMismatch === true;
}

// 错误信息截断（含 Cloudflare HTML 错误页面检测）
export function truncateErrorMsg(error: unknown): string {
  const msg = getErrorMessage(error);
  if (msg.includes('<!DOCTYPE') || msg.includes('<html')) {
    const titleMatch = msg.match(/<title[^>]*>(.*?)<\/title>/i);
    return titleMatch ? `Cloudflare: ${titleMatch[1].trim()}` : 'Cloudflare HTML error page';
  }
  return msg.length > 200 ? msg.substring(0, 200) + '...' : msg;
}

// 判断错误是否可重试
export function isRetryableError(error: unknown): boolean {
  const msg = getErrorMessage(error);
  return (
    msg.includes('upstream connect error') ||
    msg.includes('connection timeout') ||
    msg.includes('connection termination') ||
    msg.includes('connection reset') ||
    msg.includes('reset before headers') ||
    msg.includes('AbortError') ||
    msg.includes('fetch failed') ||
    msg.includes('Internal server error') ||
    msg.includes('SSL handshake failed') ||
    msg.includes('<!DOCTYPE html>') ||
    msg.includes('Error code 5')
  );
}

// Supabase 查询错误的最小类型（兼容 PostgrestError）
interface QueryError { message: string; details?: string; hint?: string; code?: string }

// 数据库查询重试（带指数退避）
export async function queryWithRetry<T>(
  queryFn: () => PromiseLike<{ data: T | null; error: QueryError | null; count?: number | null }>,
  label: string,
  maxRetries = 2,
  baseDelay = 1000
): Promise<{ data: T | null; error: QueryError | null; count?: number | null }> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const result = await queryFn();
    if (!result.error) return result;
    if (isRetryableError(result.error) && attempt < maxRetries) {
      const delay = baseDelay * (attempt + 1);
      console.log(`[DB] ${label} retrying in ${delay}ms (${attempt + 1}/${maxRetries}): ${truncateErrorMsg(result.error)}`);
      await new Promise(resolve => setTimeout(resolve, delay));
      continue;
    }
    return result;
  }
  return queryFn();
}

// 通用超时 fetch 封装——替代重复的 AbortController + setTimeout 样板代码
export async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs: number): Promise<Response> {
  const ctrl = new AbortController();
  const tid = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: ctrl.signal });
  } finally {
    clearTimeout(tid);
  }
}