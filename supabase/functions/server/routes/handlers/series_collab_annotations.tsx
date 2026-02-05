/**
 * 漫剧批注系统Handler
 * 从 routes_series_collab.tsx 提取
 * 负责：添加批注、获取批注、解决批注
 */

import type { Context } from "npm:hono";
import * as kv from "../../kv_store.tsx";

interface Annotation {
  id: string;
  seriesId: string;
  episodeId: string;
  storyboardId: string;
  userPhone: string;
  userName: string;
  type: 'note' | 'suggestion' | 'issue';
  content: string;
  position?: { x: number; y: number }; // 标注位置
  resolved: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * 添加批注
 * POST /series/:seriesId/annotations
 */
export async function handleAddAnnotation(c: Context) {
  try {
    const seriesId = c.req.param("seriesId");
    const { userPhone, userName, episodeId, storyboardId, type, content, position } =
      await c.req.json();

    console.log("[SeriesCollabAnnotations] Adding annotation:", seriesId);

    const annotation: Annotation = {
      id: `annotation-${Date.now()}`,
      seriesId,
      episodeId,
      storyboardId,
      userPhone,
      userName: userName || userPhone,
      type: type || 'note',
      content,
      position,
      resolved: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const annotationsKey = `series:${seriesId}:annotations`;
    const annotationsData = await kv.get(annotationsKey);
    const annotations: Annotation[] = annotationsData ? JSON.parse(annotationsData) : [];

    annotations.push(annotation);
    await kv.set(annotationsKey, JSON.stringify(annotations));

    console.log("[SeriesCollabAnnotations] ✅ Annotation added");

    return c.json({
      success: true,
      data: annotation,
    });
  } catch (error: any) {
    console.error("[SeriesCollabAnnotations] Error adding annotation:", error);
    return c.json({
      success: false,
      error: error.message || "Failed to add annotation",
    }, 500);
  }
}

/**
 * 获取批注列表
 * GET /series/:seriesId/annotations
 */
export async function handleGetAnnotations(c: Context) {
  try {
    const seriesId = c.req.param("seriesId");
    const episodeId = c.req.query("episodeId");
    const storyboardId = c.req.query("storyboardId");

    const annotationsKey = `series:${seriesId}:annotations`;
    const annotationsData = await kv.get(annotationsKey);

    let annotations: Annotation[] = annotationsData ? JSON.parse(annotationsData) : [];

    // 筛选
    if (episodeId) {
      annotations = annotations.filter(a => a.episodeId === episodeId);
    }
    if (storyboardId) {
      annotations = annotations.filter(a => a.storyboardId === storyboardId);
    }

    return c.json({
      success: true,
      data: annotations,
    });
  } catch (error: any) {
    console.error("[SeriesCollabAnnotations] Error fetching annotations:", error);
    return c.json({
      success: false,
      error: error.message || "Failed to fetch annotations",
    }, 500);
  }
}

/**
 * 解决批注
 * PUT /series/:seriesId/annotations/:annotationId/resolve
 */
export async function handleResolveAnnotation(c: Context) {
  try {
    const seriesId = c.req.param("seriesId");
    const annotationId = c.req.param("annotationId");

    const annotationsKey = `series:${seriesId}:annotations`;
    const annotationsData = await kv.get(annotationsKey);

    if (!annotationsData) {
      return c.json({
        success: false,
        error: "Annotations not found",
      }, 404);
    }

    const annotations: Annotation[] = JSON.parse(annotationsData);
    const annotation = annotations.find(a => a.id === annotationId);

    if (!annotation) {
      return c.json({
        success: false,
        error: "Annotation not found",
      }, 404);
    }

    annotation.resolved = true;
    annotation.updatedAt = new Date().toISOString();

    await kv.set(annotationsKey, JSON.stringify(annotations));

    console.log("[SeriesCollabAnnotations] ✅ Annotation resolved");

    return c.json({
      success: true,
      data: annotation,
    });
  } catch (error: any) {
    console.error("[SeriesCollabAnnotations] Error resolving annotation:", error);
    return c.json({
      success: false,
      error: error.message || "Failed to resolve annotation",
    }, 500);
  }
}
