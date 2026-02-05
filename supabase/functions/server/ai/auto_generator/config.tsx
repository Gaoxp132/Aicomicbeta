/**
 * 自动生成器配置模块
 * 从 ai/auto_series_generator.tsx 提取
 * 负责：自动生成相关的配置常量
 */

export const AUTO_GENERATION_CONFIG = {
  // 视频生成配置
  VIDEO_GENERATION_ENABLED: true,
  VIDEO_CONCURRENT_LIMIT: 2, // 同时生成的视频数量
  VIDEO_RETRY_LIMIT: 3, // 视频生成失败重试次数
  
  // 场景配置
  SCENES_PER_EPISODE: 4, // 每集4个场景
  SCENE_DURATION: 8, // 每个场景8秒
  
  // 总步骤
  TOTAL_STEPS: 6, // 1.分析 2.角色 3.剧集 4.分镜 5.视频 6.完成
};
