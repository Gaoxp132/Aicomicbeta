/**
 * AI提示词构建模块
 * 从 ai/script_generator.tsx 提取
 * 负责：构建AI生成剧本的提示词
 */

import type { GenerateEpisodesRequest } from './types.tsx';

/**
 * 构建剧集大纲提示词
 */
export function buildEpisodesPrompt(request: GenerateEpisodesRequest): string {
  const parts = [];

  parts.push(`请为以下漫剧创作${request.totalEpisodes}集的剧集大纲：`);
  parts.push('');
  parts.push(`【漫剧信息】`);
  parts.push(`标题：${request.seriesTitle}`);
  parts.push(`简介：${request.seriesDescription}`);
  parts.push(`类型：${request.genre}`);
  
  if (request.theme) {
    parts.push(`核心主题：${request.theme}`);
  }
  
  if (request.targetAudience) {
    parts.push(`目标受众：${request.targetAudience}`);
  }

  parts.push('');
  parts.push(`【创作要求】`);
  parts.push(`1. 每集都要有明确的成长主题和教育意义`);
  parts.push(`2. 故事情节积极向上，符合中国主流价值观`);
  parts.push(`3. 适合儿童到老年的全年龄段受众`);
  parts.push(`4. 每集标题要吸引人，简介要概括核心情节`);
  parts.push(`5. 成长主题要具体，关注品格、能力、情感等方面`);
  parts.push(`6. 关键时刻要设计精彩的转折和高潮`);

  parts.push('');
  parts.push(`【输出格式】`);
  parts.push(`请严格按照以下JSON格式输出（不要包含其他文字）：`);
  parts.push(`[`);
  parts.push(`  {`);
  parts.push(`    "episodeNumber": 1,`);
  parts.push(`    "title": "第一集标题",`);
  parts.push(`    "synopsis": "本集剧情概要，100-200字",`);
  parts.push(`    "growthTheme": "本集成长主题，如：团队协作、勇气、责任感等",`);
  parts.push(`    "keyMoments": [`);
  parts.push(`      "关键时刻1：具体描述",`);
  parts.push(`      "关键时刻2：具体描述",`);
  parts.push(`      "关键时刻3：具体描述"`);
  parts.push(`    ]`);
  parts.push(`  },`);
  parts.push(`  ...`);
  parts.push(`]`);

  return parts.join('\n');
}

/**
 * 构建包含角色的完整提示词
 */
export function buildCompletePrompt(request: GenerateEpisodesRequest): string {
  const parts = [];

  parts.push(`请为以下漫剧创作完整的角色和${request.totalEpisodes}集的剧集大纲：`);
  parts.push('');
  parts.push(`【漫剧信息】`);
  parts.push(`标题：${request.seriesTitle}`);
  parts.push(`简介：${request.seriesDescription}`);
  parts.push(`类型：${request.genre}`);
  
  if (request.theme) {
    parts.push(`核心主题：${request.theme}`);
  }
  
  if (request.targetAudience) {
    parts.push(`目标受众：${request.targetAudience}`);
  }

  parts.push('');
  parts.push(`【创作要求】`);
  parts.push(`1. 创建2-4个主要角色，每个角色都有完整的人设`);
  parts.push(`2. 每集都要有明确的成长主题和教育意义`);
  parts.push(`3. 故事情节积极向上，符合中国主流价值观`);
  parts.push(`4. 适合儿童到老年的全年龄段受众`);

  parts.push('');
  parts.push(`【输出格式】`);
  parts.push(`请严格按照以下JSON格式输出（不要包含其他文字）：`);
  parts.push(`{`);
  parts.push(`  "characters": [`);
  parts.push(`    {`);
  parts.push(`      "name": "角色名",`);
  parts.push(`      "description": "角色简介（30字左右）",`);
  parts.push(`      "appearance": "外貌特征",`);
  parts.push(`      "personality": "性格特点",`);
  parts.push(`      "role": "protagonist|supporting|antagonist",`);
  parts.push(`      "growthArc": "成长轨迹",`);
  parts.push(`      "coreValues": ["价值观1", "价值观2"]`);
  parts.push(`    }`);
  parts.push(`  ],`);
  parts.push(`  "episodes": [`);
  parts.push(`    {`);
  parts.push(`      "episodeNumber": 1,`);
  parts.push(`      "title": "第一集标题",`);
  parts.push(`      "synopsis": "本集剧情概要，100-200字",`);
  parts.push(`      "growthTheme": "本集成长主题",`);
  parts.push(`      "keyMoments": ["关键时刻1", "关键时刻2", "关键时刻3"]`);
  parts.push(`    }`);
  parts.push(`  ]`);
  parts.push(`}`);

  return parts.join('\n');
}
