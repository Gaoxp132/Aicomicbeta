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

// Snake_case → camelCase 转换
function snakeToCamel(str: string): string {
  return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

export function toCamelCase(obj: any): any {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) return obj.map(item => toCamelCase(item));
  if (typeof obj === 'object' && obj.constructor === Object) {
    const result: any = {};
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        result[snakeToCamel(key)] = toCamelCase(obj[key]);
      }
    }
    return result;
  }
  return obj;
}

// camelCase → snake_case 转换
function camelToSnake(str: string): string {
  return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
}

export function toSnakeCase(obj: any): any {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) return obj.map(item => toSnakeCase(item));
  if (typeof obj === 'object' && obj.constructor === Object) {
    const result: any = {};
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        result[camelToSnake(key)] = toSnakeCase(obj[key]);
      }
    }
    return result;
  }
  return obj;
}

// 错误信息截断（含 Cloudflare HTML 错误页面检测）
export function truncateErrorMsg(error: any): string {
  const msg = error?.message || String(error);
  if (msg.includes('<!DOCTYPE') || msg.includes('<html')) {
    const titleMatch = msg.match(/<title[^>]*>(.*?)<\/title>/i);
    return titleMatch ? `Cloudflare: ${titleMatch[1].trim()}` : 'Cloudflare HTML error page';
  }
  return msg.length > 200 ? msg.substring(0, 200) + '...' : msg;
}

// 判断错误是否可重试
export function isRetryableError(error: any): boolean {
  const msg = error?.message || String(error);
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

// 数据库查询重试（带指数退避）
export async function queryWithRetry<T>(
  queryFn: () => PromiseLike<{ data: T | null; error: any; count?: number | null }>,
  label: string,
  maxRetries = 2,
  baseDelay = 1000
): Promise<{ data: T | null; error: any; count?: number | null }> {
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