/**
 * API配置 - Supabase Edge Function
 * 
 * Edge Function配置：
 * - Function Name: make-server-fc31472c
 * - 部署在: /supabase/functions/server/
 * 
 * URL格式：
 * Base URL: https://{projectId}.supabase.co/functions/v1/make-server-fc31472c
 * 完整路径: {Base URL}/{endpoint}
 * 
 * 示例：
 * - 健康检查: /make-server-fc31472c/health
 * - 视频生成: /make-server-fc31472c/volcengine/generate
 * - 社区作品: /make-server-fc31472c/community/works
 */

import { projectId, publicAnonKey } from '../../../utils/supabase/info';

// Edge Function基础URL
// Edge Function的名称是 make-server-fc31472c
export const API_BASE_URL = `https://${projectId}.supabase.co/functions/v1/make-server-fc31472c`;

/**
 * 构建完整的API URL
 * @param endpoint - API端点路径（会自动去除开头的斜杠）
 * @returns 完整的API URL
 * 
 * @example
 * buildApiUrl('health') => 'https://xxx.supabase.co/functions/v1/make-server-fc31472c/health'
 * buildApiUrl('/health') => 'https://xxx.supabase.co/functions/v1/make-server-fc31472c/health'
 */
export function buildApiUrl(endpoint: string): string {
  // 去除开头的斜杠
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint.slice(1) : endpoint;
  return `${API_BASE_URL}/${cleanEndpoint}`;
}

/**
 * 获取完整的API URL（getApiUrl是buildApiUrl的别名）
 * @param endpoint - API端点路径（会自动标准化斜杠）
 * @returns 完整的API URL
 * 
 * @example
 * getApiUrl('health') => 'https://xxx.supabase.co/functions/v1/make-server-fc31472c/health'
 * getApiUrl('/health') => 'https://xxx.supabase.co/functions/v1/make-server-fc31472c/health'
 */
export function getApiUrl(endpoint: string): string {
  // 标准化endpoint：确保以斜杠开头
  const normalizedEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  return `${API_BASE_URL}${normalizedEndpoint}`;
}

/**
 * 获取默认的API请求头
 * @returns 包含Authorization和Content-Type的请求头对象
 */
export function getDefaultApiHeaders(): Record<string, string> {
  return {
    'Authorization': `Bearer ${publicAnonKey}`,
    'Content-Type': 'application/json',
  };
}

console.log('[API Config] Initialized with:', {
  projectId: projectId,
  baseUrl: API_BASE_URL,
  hasAnonKey: !!publicAnonKey
});