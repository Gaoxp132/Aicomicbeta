/**
 * AI路由（重构版）
 * 已重构：拆分为4个Handler模块
 * - handlers/ai_image_analysis.tsx: 图片分析
 * - handlers/ai_story_generation.tsx: 故事生成
 * - handlers/ai_script_generation.tsx: 剧本生成
 * - handlers/ai_image_generation.tsx: 图像生成
 * 
 * 注意：此文件为 routes_ai.tsx 的重构版本
 * 原文件(485行)保留为备份
 */

import type { Hono } from "npm:hono";
import { createDualRouteRegistrar } from "./utils.tsx";

// 导入Handler模块
import { 
  handleAnalyzeImage, 
  handleAnalyzeImages 
} from "./routes/handlers/ai_image_analysis.tsx";

import { 
  handleGenerateStory, 
  handleGenerateStoryEnhancedWrapper 
} from "./routes/handlers/ai_story_generation.tsx";

import { 
  handleGenerateEpisodes, 
  handleGenerateCharactersAndEpisodes 
} from "./routes/handlers/ai_script_generation.tsx";

import { 
  handleTextToImageWrapper,
  handleAliyunTextToImageWrapper,
  handleAliyunTextToImageSyncWrapper,
  handlePolishImagePromptWrapper
} from "./routes/handlers/ai_image_generation.tsx";

console.log('[routes_ai_refactored.tsx] ✅ AI routes module loaded');

/**
 * 注册AI路由
 */
export function registerAIRoutes(app: Hono) {
  // 使用双路由注册器
  const register = createDualRouteRegistrar(app);
  
  console.log('[routes_ai_refactored.tsx] 📝 Registering AI routes...');
  
  // ==================== 图片分析 ====================
  
  // AI图片分析 - 根据上传的图片生成故事描述
  register('post', '/ai/analyze-image', handleAnalyzeImage);
  
  // AI多图片分析 - 根据多张图片生成连贯故事
  register('post', '/ai/analyze-images', handleAnalyzeImages);
  
  // ==================== 故事生成 ====================
  
  // AI随机故事生成 - 创建随机故事描述
  register('post', '/ai/generate-story', handleGenerateStory);
  
  // AI增强型故事生成 - 使用高级算法生成
  register('post', '/ai/generate-story-enhanced', handleGenerateStoryEnhancedWrapper);
  
  // ==================== 剧本生成 ====================
  
  // 生成剧集大纲
  register('post', '/ai/generate-episodes', handleGenerateEpisodes);
  
  // 生成角色和剧集大纲（完整版）
  register('post', '/ai/generate-characters-episodes', handleGenerateCharactersAndEpisodes);
  
  // ==================== 图像生成 ====================
  
  // 火山引擎文生图
  register('post', '/ai/text-to-image', handleTextToImageWrapper);
  
  // 阿里云通义文生图（异步）
  register('post', '/ai/aliyun/text-to-image', handleAliyunTextToImageWrapper);
  
  // 阿里云通义文生图（同步）
  register('post', '/ai/aliyun/text-to-image-sync', handleAliyunTextToImageSyncWrapper);
  
  // AI提示词优化
  register('post', '/ai/polish-image-prompt', handlePolishImagePromptWrapper);
  
  console.log('[routes_ai_refactored.tsx] ✅ All AI routes registered successfully');
  console.log('[routes_ai_refactored.tsx] 📋 Route summary:');
  console.log('[routes_ai_refactored.tsx]   Image Analysis: 2 routes');
  console.log('[routes_ai_refactored.tsx]   Story Generation: 2 routes');
  console.log('[routes_ai_refactored.tsx]   Script Generation: 2 routes');
  console.log('[routes_ai_refactored.tsx]   Image Generation: 4 routes');
  console.log('[routes_ai_refactored.tsx]   Total: 10 routes');
}
