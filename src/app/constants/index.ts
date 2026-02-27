/**
 * Consolidated constants module (v6.0.67)
 * Merged from: api.ts, app.ts, videoGeneration.ts
 * Reduces Rollup module count by 2.
 */

// ═══════════════════════════════════════════════════════════════════
// [A] API配置 - Supabase Edge Function (was: api.ts)
// ═══════════════════════════════════════════════════════════════════

import { projectId, publicAnonKey } from '../../../utils/supabase/info';

export { projectId, publicAnonKey };

const API_BASE_URL = `https://${projectId}.supabase.co/functions/v1/make-server-fc31472c`;

export function getApiUrl(endpoint: string): string {
  const normalizedEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  const PREFIX = '/make-server-fc31472c';
  const cleanEndpoint = normalizedEndpoint.startsWith(PREFIX)
    ? normalizedEndpoint.slice(PREFIX.length)
    : normalizedEndpoint;
  return `${API_BASE_URL}${cleanEndpoint}`;
}

export function getDefaultApiHeaders(): Record<string, string> {
  return {
    'Authorization': `Bearer ${publicAnonKey}`,
    'Content-Type': 'application/json',
  };
}

export function getAuthOnlyHeaders(): Record<string, string> {
  return {
    'Authorization': `Bearer ${publicAnonKey}`,
  };
}

// ═══════════════════════════════════════════════════════════════════
// [B] 应用全局常量 (was: app.ts)
// ═══════════════════════════════════════════════════════════════════

export const VALIDATION = {
  PHONE_REGEX: /^1[3-9]\d{9}$/,
} as const;

export const STORAGE_KEYS = {
  USER_PHONE: 'userPhone',
  LOGIN_TIME: 'loginTime',
  VIDEO_CODEC: 'videoCodec', // v6.0.77: 已弃用（自动H265+降级，不再读取localStorage）
} as const;

// ═══════════════════════════════════════════════════════════════════
// [C] 视频生成常量 (was: videoGeneration.ts)
// ═══════════════════════════════════════════════════════════════════

export const STYLES = [
  { id: 'realistic', name: '写实风格', icon: '🎬', gradient: 'from-blue-500 to-cyan-500' },
  { id: 'cartoon', name: '卡通风格', icon: '🎨', gradient: 'from-yellow-500 to-orange-500' },
  { id: 'fantasy', name: '奇幻风格', icon: '✨', gradient: 'from-purple-500 to-pink-500' },
  { id: 'comic', name: '漫画风格', icon: '📚', gradient: 'from-green-500 to-emerald-500' },
  { id: 'cyberpunk', name: '赛博朋克', icon: '🌆', gradient: 'from-cyan-500 to-blue-500' },
  { id: 'chinese', name: '中国古风', icon: '🏮', gradient: 'from-red-500 to-amber-500' },
  { id: 'watercolor', name: '水彩画风', icon: '🌸', gradient: 'from-pink-400 to-purple-400' },
  { id: 'oil', name: '油画风格', icon: '🎨', gradient: 'from-amber-600 to-orange-600' },
  { id: 'gothic', name: '黑暗哥特', icon: '🌃', gradient: 'from-gray-700 to-purple-900' },
  { id: 'candy', name: '糖果甜美', icon: '🌈', gradient: 'from-pink-300 to-blue-300' },
  { id: 'fairy', name: '梦幻童话', icon: '✨', gradient: 'from-violet-400 to-fuchsia-400' },
  { id: 'anime', name: '日系动漫', icon: '🎌', gradient: 'from-pink-500 to-rose-500' },
];

export const STYLE_THUMBNAILS: Record<string, string> = {
  anime: 'https://images.unsplash.com/photo-1697059172415-f1e08f9151bb?w=400&h=600&fit=crop',
  cyberpunk: 'https://images.unsplash.com/photo-1688377051459-aebb99b42bff?w=400&h=600&fit=crop',
  fantasy: 'https://images.unsplash.com/photo-1593410733607-4fe72c8f3f73?w=400&h=600&fit=crop',
  realistic: 'https://images.unsplash.com/photo-1536440136628-849c177e76a1?w=400&h=600&fit=crop',
  cartoon: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=400&h=600&fit=crop',
  comic: 'https://images.unsplash.com/photo-1612036782180-6f0b6cd846fe?w=400&h=600&fit=crop',
};

// ═══════════════════════════════════════════════════════════════════
// [D] 创作向导常量 (extracted from SeriesCreationWizard.tsx v6.0.88)
// ═══════════════════════════════════════════════════════════════════

export const GENRES = [
  { id: 'romance', name: '爱情', icon: '💕', color: 'from-pink-500 to-rose-500' },
  { id: 'suspense', name: '悬疑', icon: '🔍', color: 'from-purple-500 to-indigo-500' },
  { id: 'comedy', name: '喜剧', icon: '😄', color: 'from-yellow-500 to-orange-500' },
  { id: 'action', name: '动作', icon: '⚡', color: 'from-red-500 to-orange-500' },
  { id: 'fantasy', name: '奇幻', icon: '✨', color: 'from-cyan-500 to-blue-500' },
  { id: 'horror', name: '恐怖', icon: '👻', color: 'from-gray-700 to-gray-900' },
  { id: 'scifi', name: '科幻', icon: '🚀', color: 'from-blue-500 to-purple-500' },
  { id: 'drama', name: '剧情', icon: '🎭', color: 'from-teal-500 to-green-500' },
];

export const ASPECT_RATIOS = [
  { id: '9:16', label: '9:16 竖屏', desc: '抖音/TikTok/快手/小红书', icon: '📱', color: 'from-pink-500 to-rose-500', w: 27, h: 48 },
  { id: '16:9', label: '16:9 横屏', desc: 'YouTube/B站/PC端', icon: '🖥️', color: 'from-blue-500 to-indigo-500', w: 48, h: 27 },
  { id: '1:1', label: '1:1 方形', desc: 'Instagram/朋友圈', icon: '📷', color: 'from-purple-500 to-fuchsia-500', w: 36, h: 36 },
  { id: '3:4', label: '3:4 竖屏经典', desc: 'iPad/平板竖屏', icon: '📋', color: 'from-teal-500 to-cyan-500', w: 30, h: 40 },
  { id: '4:3', label: '4:3 经典', desc: '经典电视/iPad横屏', icon: '📺', color: 'from-amber-500 to-orange-500', w: 40, h: 30 },
];

export const RESOLUTIONS = [
  { id: '480p', label: '480p', desc: '流畅', badge: '' },
  { id: '720p', label: '720p', desc: '高清', badge: '推荐' },
  { id: '1080p', label: '1080p', desc: '超清', badge: '' },
];