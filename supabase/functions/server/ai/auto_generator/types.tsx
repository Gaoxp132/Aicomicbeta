/**
 * 自动生成器类型定义
 * 从 ai/auto_series_generator.tsx 提取
 * 负责：自动生成相关的TypeScript类型
 */

export interface GenerationOptions {
  userPhone: string;
  userInput?: string; // 快速创作用
  storyOutline?: string; // 传统创作用
  totalEpisodes?: number;
  targetAudience?: string;
  preferredThemes?: string[];
  scriptGenre?: string;
  style?: string;
  enableAudio?: boolean;
}
