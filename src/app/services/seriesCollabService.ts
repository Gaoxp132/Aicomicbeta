/**
 * 漫剧协作服务
 * 包含：版本历史、评论、批注
 */

import { projectId, publicAnonKey } from '/utils/supabase/info';

const API_BASE_URL = `https://${projectId}.supabase.co/functions/v1/make-server-fc31472c`;

async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<{ success: boolean; data?: T; error?: string }> {
  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${publicAnonKey}`,
        ...options.headers,
      },
    });

    const result = await response.json();
    return result;
  } catch (error: any) {
    console.error('[SeriesCollabService] API request failed:', error);
    return {
      success: false,
      error: error.message || 'Network error',
    };
  }
}

// ==================== 版本历史 ====================

export interface SeriesVersion {
  id: string;
  versionNumber: number;
  changedBy: string;
  changeDescription: string;
  createdAt: string;
}

/**
 * 创建新版本
 */
export async function createVersion(
  seriesId: string,
  userPhone: string,
  changeDescription: string
): Promise<{ success: boolean; data?: SeriesVersion; error?: string }> {
  return apiRequest(`/series/${seriesId}/versions`, {
    method: 'POST',
    body: JSON.stringify({ userPhone, changeDescription }),
  });
}

/**
 * 获取版本历史
 */
export async function getVersionHistory(
  seriesId: string
): Promise<{ success: boolean; data?: SeriesVersion[]; error?: string }> {
  return apiRequest(`/series/${seriesId}/versions`, {
    method: 'GET',
  });
}

/**
 * 恢复到指定版本
 */
export async function restoreVersion(
  seriesId: string,
  versionId: string
): Promise<{ success: boolean; data?: any; error?: string }> {
  return apiRequest(`/series/${seriesId}/versions/${versionId}/restore`, {
    method: 'POST',
  });
}

// ==================== 评论系统 ====================

export interface Comment {
  id: string;
  userPhone: string;
  userName: string;
  content: string;
  replies: CommentReply[];
  createdAt: string;
  updatedAt: string;
}

export interface CommentReply {
  id: string;
  userPhone: string;
  userName: string;
  content: string;
  createdAt: string;
}

/**
 * 添加评论
 */
export async function addComment(
  seriesId: string,
  userPhone: string,
  userName: string,
  content: string,
  episodeId?: string,
  storyboardId?: string
): Promise<{ success: boolean; data?: Comment; error?: string }> {
  return apiRequest(`/series/${seriesId}/comments`, {
    method: 'POST',
    body: JSON.stringify({ userPhone, userName, content, episodeId, storyboardId }),
  });
}

/**
 * 获取评论列表
 */
export async function getComments(
  seriesId: string,
  episodeId?: string,
  storyboardId?: string
): Promise<{ success: boolean; data?: Comment[]; error?: string }> {
  let url = `/series/${seriesId}/comments?`;
  if (episodeId) url += `episodeId=${episodeId}&`;
  if (storyboardId) url += `storyboardId=${storyboardId}`;

  return apiRequest(url, {
    method: 'GET',
  });
}

/**
 * 回复评论
 */
export async function replyToComment(
  seriesId: string,
  commentId: string,
  userPhone: string,
  userName: string,
  content: string
): Promise<{ success: boolean; data?: CommentReply; error?: string }> {
  return apiRequest(`/series/${seriesId}/comments/${commentId}/replies`, {
    method: 'POST',
    body: JSON.stringify({ userPhone, userName, content }),
  });
}

// ==================== 批注系统 ====================

export interface Annotation {
  id: string;
  userPhone: string;
  userName: string;
  type: 'note' | 'suggestion' | 'issue';
  content: string;
  position?: { x: number; y: number };
  resolved: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * 添加批注
 */
export async function addAnnotation(
  seriesId: string,
  episodeId: string,
  storyboardId: string,
  userPhone: string,
  userName: string,
  type: 'note' | 'suggestion' | 'issue',
  content: string,
  position?: { x: number; y: number }
): Promise<{ success: boolean; data?: Annotation; error?: string }> {
  return apiRequest(`/series/${seriesId}/annotations`, {
    method: 'POST',
    body: JSON.stringify({
      userPhone,
      userName,
      episodeId,
      storyboardId,
      type,
      content,
      position,
    }),
  });
}

/**
 * 获取批注列表
 */
export async function getAnnotations(
  seriesId: string,
  episodeId?: string,
  storyboardId?: string
): Promise<{ success: boolean; data?: Annotation[]; error?: string }> {
  let url = `/series/${seriesId}/annotations?`;
  if (episodeId) url += `episodeId=${episodeId}&`;
  if (storyboardId) url += `storyboardId=${storyboardId}`;

  return apiRequest(url, {
    method: 'GET',
  });
}

/**
 * 解决批注
 */
export async function resolveAnnotation(
  seriesId: string,
  annotationId: string
): Promise<{ success: boolean; data?: Annotation; error?: string }> {
  return apiRequest(`/series/${seriesId}/annotations/${annotationId}/resolve`, {
    method: 'PUT',
  });
}

// ==================== 协作者管理 ====================

export interface Collaborator {
  userPhone: string;
  userName: string;
  role: 'owner' | 'editor' | 'viewer';
  joinedAt: string;
}

/**
 * 添加协作者
 */
export async function addCollaborator(
  seriesId: string,
  userPhone: string,
  userName: string,
  role: 'owner' | 'editor' | 'viewer'
): Promise<{ success: boolean; data?: Collaborator; error?: string }> {
  return apiRequest(`/series/${seriesId}/collaborators`, {
    method: 'POST',
    body: JSON.stringify({ userPhone, userName, role }),
  });
}

/**
 * 获取协作者列表
 */
export async function getCollaborators(
  seriesId: string
): Promise<{ success: boolean; data?: Collaborator[]; error?: string }> {
  return apiRequest(`/series/${seriesId}/collaborators`, {
    method: 'GET',
  });
}
