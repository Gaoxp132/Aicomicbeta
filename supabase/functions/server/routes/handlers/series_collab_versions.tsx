/**
 * 漫剧版本历史Handler
 * 从 routes_series_collab.tsx 提取
 * 负责：版本创建、版本列表、版本恢复
 */

import type { Context } from "npm:hono";
import * as kv from "../../kv_store.tsx";

interface SeriesVersion {
  id: string;
  seriesId: string;
  versionNumber: number;
  data: any; // 完整的series数据快照
  changedBy: string;
  changeDescription: string;
  createdAt: string;
}

/**
 * 创建新版本
 * POST /series/:seriesId/versions
 */
export async function handleCreateVersion(c: Context) {
  try {
    const seriesId = c.req.param("seriesId");
    const { userPhone, changeDescription } = await c.req.json();

    console.log("[SeriesCollabVersions] Creating new version:", seriesId);

    // 获取当前series数据
    const seriesKey = `series:${seriesId}`;
    const seriesData = await kv.get(seriesKey);

    if (!seriesData) {
      return c.json({
        success: false,
        error: "Series not found",
      }, 404);
    }

    const series = JSON.parse(seriesData);

    // 获取现有版本数
    const versionsKey = `series:${seriesId}:versions`;
    const versionsData = await kv.get(versionsKey);
    const versions: SeriesVersion[] = versionsData ? JSON.parse(versionsData) : [];

    // 创建新版本
    const newVersion: SeriesVersion = {
      id: `version-${Date.now()}`,
      seriesId,
      versionNumber: versions.length + 1,
      data: series,
      changedBy: userPhone,
      changeDescription: changeDescription || '保存版本',
      createdAt: new Date().toISOString(),
    };

    versions.push(newVersion);

    // 只保留最近20个版本
    if (versions.length > 20) {
      versions.shift();
    }

    await kv.set(versionsKey, JSON.stringify(versions));

    console.log("[SeriesCollabVersions] ✅ Version created:", newVersion.versionNumber);

    return c.json({
      success: true,
      data: newVersion,
    });
  } catch (error: any) {
    console.error("[SeriesCollabVersions] Error creating version:", error);
    return c.json({
      success: false,
      error: error.message || "Failed to create version",
    }, 500);
  }
}

/**
 * 获取版本历史列表
 * GET /series/:seriesId/versions
 */
export async function handleGetVersions(c: Context) {
  try {
    const seriesId = c.req.param("seriesId");

    const versionsKey = `series:${seriesId}:versions`;
    const versionsData = await kv.get(versionsKey);

    const versions: SeriesVersion[] = versionsData ? JSON.parse(versionsData) : [];

    // 不返回完整数据，只返回元信息
    const versionList = versions.map(v => ({
      id: v.id,
      versionNumber: v.versionNumber,
      changedBy: v.changedBy,
      changeDescription: v.changeDescription,
      createdAt: v.createdAt,
    }));

    return c.json({
      success: true,
      data: versionList,
    });
  } catch (error: any) {
    console.error("[SeriesCollabVersions] Error fetching versions:", error);
    return c.json({
      success: false,
      error: error.message || "Failed to fetch versions",
    }, 500);
  }
}

/**
 * 恢复到指定版本
 * POST /series/:seriesId/versions/:versionId/restore
 */
export async function handleRestoreVersion(c: Context) {
  try {
    const seriesId = c.req.param("seriesId");
    const versionId = c.req.param("versionId");

    console.log("[SeriesCollabVersions] Restoring version:", versionId);

    const versionsKey = `series:${seriesId}:versions`;
    const versionsData = await kv.get(versionsKey);

    if (!versionsData) {
      return c.json({
        success: false,
        error: "No versions found",
      }, 404);
    }

    const versions: SeriesVersion[] = JSON.parse(versionsData);
    const targetVersion = versions.find(v => v.id === versionId);

    if (!targetVersion) {
      return c.json({
        success: false,
        error: "Version not found",
      }, 404);
    }

    // 恢复数据
    const seriesKey = `series:${seriesId}`;
    await kv.set(seriesKey, JSON.stringify(targetVersion.data));

    console.log("[SeriesCollabVersions] ✅ Version restored:", targetVersion.versionNumber);

    return c.json({
      success: true,
      data: targetVersion.data,
    });
  } catch (error: any) {
    console.error("[SeriesCollabVersions] Error restoring version:", error);
    return c.json({
      success: false,
      error: error.message || "Failed to restore version",
    }, 500);
  }
}
