/**
 * AI剧本生成Handler
 * 从 routes_ai.tsx 提取
 * 负责：剧集大纲生成和角色+剧集生成
 */

import type { Context } from "npm:hono";
import { generateEpisodeOutlines, generateCharactersAndEpisodes } from "../../ai/script_generator_refactored.tsx";

/**
 * 生成剧集大纲
 */
export async function handleGenerateEpisodes(c: Context) {
  try {
    const request = await c.req.json();
    
    console.log("[ScriptGeneration] Generating episode outlines:", {
      seriesTitle: request.seriesTitle,
      totalEpisodes: request.totalEpisodes,
      genre: request.genre,
    });

    // 验证必填字段
    if (!request.seriesTitle || !request.seriesDescription || !request.totalEpisodes || !request.genre) {
      return c.json({
        success: false,
        error: "缺少必填字段：seriesTitle, seriesDescription, totalEpisodes, genre",
      }, 400);
    }

    // 调用AI生成剧集大纲
    const result = await generateEpisodeOutlines(request);

    if (!result.success) {
      return c.json(result, 500);
    }

    console.log("[ScriptGeneration] ✅ Episode outlines generated successfully");

    return c.json({
      success: true,
      episodes: result.episodes,
    });

  } catch (error: any) {
    console.error("[ScriptGeneration] Error generating episodes:", error);
    return c.json({
      success: false,
      error: error.message || "生成剧集大纲失败",
    }, 500);
  }
}

/**
 * 生成角色和剧集大纲（完整版）
 */
export async function handleGenerateCharactersAndEpisodes(c: Context) {
  try {
    const request = await c.req.json();
    
    console.log("[ScriptGeneration] Generating characters and episodes:", {
      seriesTitle: request.seriesTitle,
      totalEpisodes: request.totalEpisodes,
      genre: request.genre,
    });

    // 验证必填字段
    if (!request.seriesTitle || !request.seriesDescription || !request.totalEpisodes || !request.genre) {
      return c.json({
        success: false,
        error: "缺少必填字段：seriesTitle, seriesDescription, totalEpisodes, genre",
      }, 400);
    }

    // 调用AI生成角色和剧集
    const result = await generateCharactersAndEpisodes(request);

    if (!result.success) {
      return c.json(result, 500);
    }

    console.log("[ScriptGeneration] ✅ Characters and episodes generated successfully");

    return c.json({
      success: true,
      characters: result.characters,
      episodes: result.episodes,
    });

  } catch (error: any) {
    console.error("[ScriptGeneration] Error generating characters and episodes:", error);
    return c.json({
      success: false,
      error: error.message || "生成角色和剧集失败",
    }, 500);
  }
}