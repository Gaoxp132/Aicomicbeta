/**
 * 完全自动化的漫剧生成引擎（重构版）
 * 已重构：拆分为多个功能模块
 * - auto_generator/config.tsx: 配置常量
 * - auto_generator/types.tsx: 类型定义
 * - auto_generator/from_idea.tsx: 快速创作流程
 * - auto_generator/from_outline.tsx: 标准创作流程
 * - auto_generator/storyboard_generator.tsx: 分镜生成
 * - auto_generator/video_generator.tsx: 视频生成
 * 
 * 注意：此文件为ai/auto_series_generator.tsx的重构版本
 * 原文件(657行)保留为备份
 */

// 导出配置
export { AUTO_GENERATION_CONFIG } from './auto_generator/config.tsx';

// 导出类型
export type { GenerationOptions } from './auto_generator/types.tsx';

// 导出主流程
export { autoGenerateSeriesFromIdea } from './auto_generator/from_idea.tsx';
export { autoGenerateSeriesFromOutline } from './auto_generator/from_outline.tsx';

// 导出子模块（可选，用于高级用途）
export { generateStoryboardsForEpisode } from './auto_generator/storyboard_generator.tsx';
export {
  autoGenerateAllVideos,
  generateVideoForStoryboard,
  pollVideoCompletion,
} from './auto_generator/video_generator.tsx';

console.log('[auto_series_generator_refactored.tsx] ✅ All auto-generator modules loaded successfully');
console.log('[auto_series_generator_refactored.tsx] 📋 Module summary:');
console.log('[auto_series_generator_refactored.tsx]   Main flows: 2 functions');
console.log('[auto_series_generator_refactored.tsx]   Storyboard: 1 function');
console.log('[auto_series_generator_refactored.tsx]   Video: 3 functions');
console.log('[auto_series_generator_refactored.tsx]   Total: 6 exported functions');
