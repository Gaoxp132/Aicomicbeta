/**
 * 剧本生成配置
 * 从 ai/script_generator.tsx 提取
 */

export const VOLCENGINE_API_URL = 'https://ark.cn-beijing.volces.com/api/v3/chat/completions';
export const MODEL_NAME = 'doubao-seed-1-8-251228';

export const SYSTEM_PROMPT = '你是一位专业的儿童教育编剧，擅长创作积极向上、富有教育意义的漫剧故事。你的作品传递正确的价值观，关注孩子的成长和品格培养。';

// API调用配置
export const API_CONFIG = {
  timeout: 60000,        // 60秒超时
  maxRetries: 3,         // 最多重试3次
  retryDelays: [3000, 5000, 10000], // 重试延迟（3秒、5秒、10秒）
  temperature: 0.8,      // 创作温度
};

// Token限制
export const TOKEN_LIMITS = {
  episodesOnly: 4000,    // 仅生成剧集大纲
  complete: 6000,        // 生成角色和剧集
};
