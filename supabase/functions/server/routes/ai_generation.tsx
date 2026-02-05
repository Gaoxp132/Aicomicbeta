import type { Hono } from "npm:hono";
import { createDualRouteRegistrar } from "../utils.tsx";
import { generateEpisodeOutlines } from "../ai/script_generator_refactored.tsx";

/**
 * AI生成相关路由
 */
export function registerAIGenerationRoutes(app: Hono) {
  const register = createDualRouteRegistrar(app);
  
  // 🤖 生成漫剧剧集大纲
  register('post', '/ai/generate-episodes', async (c) => {
    try {
      const body = await c.req.json();
      const { 
        seriesTitle, 
        seriesDescription, 
        totalEpisodes, 
        genre,
        theme,
        targetAudience
      } = body;
      
      console.log('[AI Generation] Generating episodes:', {
        seriesTitle,
        totalEpisodes,
        genre,
      });

      // 参数验证
      if (!seriesTitle || !seriesDescription || !totalEpisodes) {
        return c.json({
          success: false,
          error: '缺少必需参数：seriesTitle, seriesDescription, totalEpisodes',
        }, 400);
      }

      if (totalEpisodes < 1 || totalEpisodes > 80) {
        return c.json({
          success: false,
          error: '集数必须在1-80之间',
        }, 400);
      }

      // 调用AI生成服务
      const result = await generateEpisodeOutlines({
        seriesTitle,
        seriesDescription,
        totalEpisodes,
        genre: genre || '成长',
        theme,
        targetAudience,
      });

      if (!result.success) {
        return c.json({
          success: false,
          error: result.error || '生成失败',
        }, 500);
      }

      console.log(`[AI Generation] ✅ Generated ${result.episodes?.length} episodes`);

      return c.json({
        success: true,
        episodes: result.episodes,
      });
    } catch (error: any) {
      console.error('[AI Generation] Error:', error);
      return c.json({
        success: false,
        error: error.message || '服务器错误',
      }, 500);
    }
  });
}