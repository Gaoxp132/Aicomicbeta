/**
 * 漫剧协作者管理Handler
 * 从 routes_series_collab.tsx 提取
 * 负责：添加协作者、获取协作者列表
 */

import type { Context } from "npm:hono";
import * as kv from "../../kv_store.tsx";

interface Collaborator {
  userPhone: string;
  userName: string;
  role: 'owner' | 'editor' | 'viewer';
  joinedAt: string;
}

/**
 * 添加协作者
 * POST /series/:seriesId/collaborators
 */
export async function handleAddCollaborator(c: Context) {
  try {
    const seriesId = c.req.param("seriesId");
    const { userPhone, userName, role } = await c.req.json();

    console.log("[SeriesCollabCollaborators] Adding collaborator:", userPhone);

    const collaborator: Collaborator = {
      userPhone,
      userName: userName || userPhone,
      role: role || 'viewer',
      joinedAt: new Date().toISOString(),
    };

    const collabKey = `series:${seriesId}:collaborators`;
    const collabData = await kv.get(collabKey);
    const collaborators: Collaborator[] = collabData ? JSON.parse(collabData) : [];

    // 检查是否已存在
    const existing = collaborators.find(c => c.userPhone === userPhone);
    if (existing) {
      existing.role = role || existing.role;
    } else {
      collaborators.push(collaborator);
    }

    await kv.set(collabKey, JSON.stringify(collaborators));

    console.log("[SeriesCollabCollaborators] ✅ Collaborator added");

    return c.json({
      success: true,
      data: collaborator,
    });
  } catch (error: any) {
    console.error("[SeriesCollabCollaborators] Error adding collaborator:", error);
    return c.json({
      success: false,
      error: error.message || "Failed to add collaborator",
    }, 500);
  }
}

/**
 * 获取协作者列表
 * GET /series/:seriesId/collaborators
 */
export async function handleGetCollaborators(c: Context) {
  try {
    const seriesId = c.req.param("seriesId");

    const collabKey = `series:${seriesId}:collaborators`;
    const collabData = await kv.get(collabKey);

    const collaborators: Collaborator[] = collabData ? JSON.parse(collabData) : [];

    return c.json({
      success: true,
      data: collaborators,
    });
  } catch (error: any) {
    console.error("[SeriesCollabCollaborators] Error fetching collaborators:", error);
    return c.json({
      success: false,
      error: error.message || "Failed to fetch collaborators",
    }, 500);
  }
}
