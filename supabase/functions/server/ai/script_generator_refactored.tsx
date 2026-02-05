/**
 * AI剧本生成服务（重构版）
 * 已重构：拆分为5个功能模块
 * - script/types.tsx: 类型定义
 * - script/config.tsx: 配置常量
 * - script/prompt_builder.tsx: 提示词构建
 * - script/response_parser.tsx: 响应解析
 * - script/episodes_generator.tsx: 剧集生成
 * - script/complete_generator.tsx: 完整剧本生成
 * 
 * 注意：此文件为 script_generator.tsx 的重构版本
 * 原文件(502行)保留为备份
 */

// ==================== 类型定义 ====================
export type {
  EpisodeOutline,
  CharacterInfo,
  GenerateEpisodesRequest,
} from './script/types.tsx';

// ==================== 剧集大纲生成 ====================
export {
  generateEpisodeOutlines,
} from './script/episodes_generator.tsx';

// ==================== 完整剧本生成（角色+剧集）====================
export {
  generateCharactersAndEpisodes,
} from './script/complete_generator.tsx';

console.log('[script_generator_refactored.tsx] ✅ All script modules loaded successfully');
console.log('[script_generator_refactored.tsx] 📋 Module summary:');
console.log('[script_generator_refactored.tsx]   Types: 3 interfaces');
console.log('[script_generator_refactored.tsx]   Config: API settings');
console.log('[script_generator_refactored.tsx]   Prompt Builder: 2 functions');
console.log('[script_generator_refactored.tsx]   Response Parser: 3 functions');
console.log('[script_generator_refactored.tsx]   Episodes Generator: 1 function');
console.log('[script_generator_refactored.tsx]   Complete Generator: 1 function');
console.log('[script_generator_refactored.tsx]   Total: 2 exported functions + 3 types');
