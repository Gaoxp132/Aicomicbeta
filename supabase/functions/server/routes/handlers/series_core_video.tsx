/**
 * 漫剧视频生成处理器
 * 从 routes_series_core.tsx 提取的视频生成逻辑
 */

import type { Context } from "npm:hono";
import { generateVideoForStoryboard } from "../../services/video_generation_service.tsx";

/**
 * 异步生成分镜视频
 */
async function generateStoryboardVideo(
  storyboardId: string,
  prompt: string,
  style: string
) {
  try {
    console.log('[SeriesCore Video] 🎬 Starting video generation for storyboard:', storyboardId);

    await generateVideoForStoryboard(storyboardId, {
      prompt,
      style,
    });

    console.log('[SeriesCore Video] ✅ Video generation completed for storyboard:', storyboardId);
  } catch (error: any) {
    console.error('[SeriesCore Video] ❌ Video generation failed:', error);
    throw error;
  }
}

/**
 * 为分镜生成视频
 */
export async function generateVideo(c: Context) {
  try {
    const storyboardId = c.req.param('id');
    const { userPhone, seriesId, prompt, style = 'comic', duration = 8 } = await c.req.json();

    console.log('[SeriesCore] 🎬 Generating video for storyboard:', storyboardId);
    console.log('[SeriesCore] Prompt:', prompt);
    console.log('[SeriesCore] Style:', style);
    console.log('[SeriesCore] Duration:', duration);

    if (!prompt) {
      return c.json({
        success: false,
        error: '缺少视频描述',
      }, 400);
    }

    // 异步生成视频（不阻塞请求）
    generateStoryboardVideo(storyboardId, prompt, style).catch(error => {
      console.error('[SeriesCore] Background video generation error:', error);
    });

    return c.json({
      success: true,
      message: '视频生成任务已启动',
    });
  } catch (error: any) {
    console.error('[SeriesCore] Error starting video generation:', error);
    return c.json({
      success: false,
      error: error.message || '启动视频生成失败',
    }, 500);
  }
}
