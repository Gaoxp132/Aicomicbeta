// 视频生成相关常量
export const STYLE_PROMPTS: Record<string, string> = {
  anime: "日系动漫风格",
  cyberpunk: "赛博朋克未来科技风格",
  fantasy: "奇幻魔法世界风格",
  realistic: "真实写实风格",
  cartoon: "卡通动画风格",
  comic: "漫画分镜风格",
};

export const MODELS = {
  // ✅ 使用最新的1.5专业版作为默认模型（最高质量）
  // 文档: https://www.volcengine.com/docs/6791/1347698
  HIGH_QUALITY: "doubao-seedance-1-5-pro-251215",  // 🆕 最新1.5专业版（音画同生）
  LEGACY_PRO: "doubao-seedance-1-0-pro-250528",     // 旧版专业版（支持1080p但无音频）
  FAST: "doubao-seedance-1-0-pro-fast-251015",      // 快速版（首帧模式）
  MULTI_IMAGE: "doubao-seedance-1-0-lite-i2v-250428", // 多图生视频
  TEXT_TO_VIDEO: "doubao-seedance-1-0-lite-t2v-250428", // 轻量文生视频
  WAN_2_1_14B: "doubao-wan2-1-14b-250110",          // 🆕 Wan2.1-14B（火山引擎最新高性能模型）
};

/**
 * 模型能力配置
 * 定义每个模型支持的分辨率、时长、帧率等参数
 */
export const MODEL_CAPABILITIES = {
  "doubao-seedance-1-5-pro-251215": {
    name: "SeedAnce 1.5 Pro",
    maxDuration: 12,        // 最大时长（秒）- 根据官方文档
    minDuration: 5,         // 最小时长（秒）
    resolutions: ["720p", "1080p"],
    defaultResolution: "1080p",
    fps: [24, 30],
    defaultFps: 30,
    supportsAudio: true,    // 支持音频
    supportsMultiImage: true, // 支持多图
    maxImages: 4,           // 最多支持4张图片
    quality: "high",        // 质量等级
    speed: "medium",        // 生成速度
  },
  "doubao-seedance-1-0-pro-250528": {
    name: "SeedAnce 1.0 Pro",
    maxDuration: 10,
    minDuration: 5,
    resolutions: ["720p", "1080p"],
    defaultResolution: "1080p",
    fps: [24, 30],
    defaultFps: 30,
    supportsAudio: false,   // 不支持音频
    supportsMultiImage: false,
    maxImages: 1,
    quality: "high",
    speed: "medium",
  },
  "doubao-seedance-1-0-pro-fast-251015": {
    name: "SeedAnce 1.0 Pro Fast",
    maxDuration: 12,
    minDuration: 5,
    resolutions: ["720p", "1080p"],
    defaultResolution: "1080p",
    fps: [24, 30],
    defaultFps: 30,
    supportsAudio: false,   // 不支持音频
    supportsMultiImage: false,
    maxImages: 1,           // 仅支持首帧模式
    quality: "high",
    speed: "fast",          // 快速生成
  },
  "doubao-seedance-1-0-lite-i2v-250428": {
    name: "SeedAnce 1.0 Lite I2V",
    maxDuration: 10,
    minDuration: 5,
    resolutions: ["720p"],
    defaultResolution: "720p",
    fps: [24],
    defaultFps: 24,
    supportsAudio: false,
    supportsMultiImage: true,
    maxImages: 8,           // 最多支持8张图片
    quality: "medium",
    speed: "fast",
  },
  "doubao-seedance-1-0-lite-t2v-250428": {
    name: "SeedAnce 1.0 Lite T2V",
    maxDuration: 12,
    minDuration: 5,
    resolutions: ["720p"],
    defaultResolution: "720p",
    fps: [24],
    defaultFps: 24,
    supportsAudio: false,   // 不支持音频
    supportsMultiImage: false,
    maxImages: 0,           // 仅文生视频，不支持图片
    quality: "medium",
    speed: "fast",          // 快速生成
  },
  "doubao-wan2-1-14b-250110": {
    name: "Wan2.1-14B",
    maxDuration: 12,
    minDuration: 5,
    resolutions: ["720p", "1080p"],
    defaultResolution: "1080p",
    fps: [24, 30],
    defaultFps: 30,
    supportsAudio: true,    // 支持音频
    supportsMultiImage: true, // 支持多图
    maxImages: 4,           // 最多支持4张图片
    quality: "high",        // 质量等级
    speed: "medium",        // 生成速度
  },
};

/**
 * 智能选择最优模型
 * 根据用户需求自动选择最合适的模型
 */
export function selectOptimalModel(params: {
  duration?: number;        // 视频时长（秒）
  resolution?: string;      // 分辨率
  fps?: number;             // 帧率
  enableAudio?: boolean;    // 是否需要音频
  imageCount?: number;      // 图片数量
  quality?: "low" | "medium" | "high" | "ultra"; // 质量要求
  speed?: "fast" | "medium" | "slow"; // 速度优先级
  model?: string;           // 用户指定的模型（优先级最高）
}): string {
  const {
    duration = 5,
    resolution = "1080p",
    fps = 30,
    enableAudio = false,
    imageCount = 1,
    quality = "high",
    speed = "medium",
    model,
  } = params;

  console.log('[Model Selection] ========== 智能模型选择 ==========');
  console.log('[Model Selection] 用户需求:', params);

  // 1. 如果用户指定了模型，直接使用
  if (model && MODELS[model]) {
    console.log('[Model Selection] ✅ 使用用户指定模型:', MODELS[model]);
    return MODELS[model];
  }

  // 2. 根据需求自动选择模型
  const candidates: Array<{ modelKey: string; score: number; reason: string[] }> = [];

  for (const [modelKey, modelValue] of Object.entries(MODELS)) {
    const capability = MODEL_CAPABILITIES[modelValue];
    if (!capability) continue;

    let score = 0;
    const reasons: string[] = [];

    // 检查是否支持所需时长
    if (duration <= capability.maxDuration && duration >= capability.minDuration) {
      score += 10;
      reasons.push(`支持${duration}秒时长`);
    } else {
      continue; // 不支持该时长，跳过
    }

    // 检查分辨率支持
    if (capability.resolutions.includes(resolution)) {
      score += 10;
      reasons.push(`支持${resolution}分辨率`);
    } else {
      score += 5; // 部分分
      reasons.push(`不完全支持${resolution}，将使用${capability.defaultResolution}`);
    }

    // 检查帧率支持
    if (capability.fps.includes(fps)) {
      score += 5;
      reasons.push(`支持${fps}fps`);
    } else {
      score += 2;
      reasons.push(`将使用${capability.defaultFps}fps`);
    }

    // 检查音频支持
    if (enableAudio) {
      if (capability.supportsAudio) {
        score += 15;
        reasons.push('✅ 支持音频');
      } else {
        score -= 20; // 需要音频但不支持，大幅降分
        reasons.push('❌ 不支持音频');
      }
    } else {
      if (!capability.supportsAudio) {
        score += 5; // 不需要音频，简单模型更快
      }
    }

    // 检查多图支持
    if (imageCount > 1) {
      if (capability.supportsMultiImage && imageCount <= capability.maxImages) {
        score += 10;
        reasons.push(`支持${imageCount}张图片`);
      } else {
        continue; // 不支持所需图片数量，跳过
      }
    }

    // 质量匹配
    const qualityScores = { low: 1, medium: 2, high: 3, ultra: 4 };
    const modelQualityScore = qualityScores[capability.quality] || 2;
    const userQualityScore = qualityScores[quality] || 3;
    
    if (modelQualityScore >= userQualityScore) {
      score += 10;
      reasons.push(`质量等级匹配(${capability.quality})`);
    } else {
      score += 5;
      reasons.push(`质量低于需求`);
    }

    // 速度匹配
    if (speed === "fast" && capability.speed === "fast") {
      score += 8;
      reasons.push('速度优先');
    } else if (speed === "medium" && capability.speed === "medium") {
      score += 5;
      reasons.push('速度均衡');
    } else if (speed === "slow" && capability.quality === "ultra") {
      score += 8;
      reasons.push('质量优先');
    }

    candidates.push({
      modelKey,
      score,
      reason: reasons,
    });
  }

  // 排序并选择最高分的模型
  candidates.sort((a, b) => b.score - a.score);

  console.log('[Model Selection] 候选模型评分:');
  candidates.forEach((c, i) => {
    console.log(`  ${i + 1}. ${MODEL_CAPABILITIES[MODELS[c.modelKey]].name} (${MODELS[c.modelKey]}) - 得分: ${c.score}`);
    console.log(`     原因: ${c.reason.join(', ')}`);
  });

  const selected = candidates[0];
  if (selected) {
    console.log('[Model Selection] ✅ 最优模型:', MODEL_CAPABILITIES[MODELS[selected.modelKey]].name, `(${MODELS[selected.modelKey]})`);
    console.log('[Model Selection] 选择理由:', selected.reason.join(', '));
    console.log('[Model Selection] ==========================================');
    return MODELS[selected.modelKey];
  }

  // 默认使用最高质量模型
  console.log('[Model Selection] ⚠️ 未找到合适模型，使用默认高质量模型');
  console.log('[Model Selection] ==========================================');
  return MODELS.HIGH_QUALITY;
}

/**
 * 根据模型调整参数
 * 确保参数在模型支持范围内
 */
export function adjustParamsForModel(modelId: string, params: {
  duration?: number;
  resolution?: string;
  fps?: number;
}): {
  duration: number;
  resolution: string;
  fps: number;
} {
  const capability = MODEL_CAPABILITIES[modelId];
  if (!capability) {
    return {
      duration: params.duration || 5,
      resolution: params.resolution || "1080p",
      fps: params.fps || 30,
    };
  }

  // 调整时长
  let duration = params.duration || capability.minDuration;
  duration = Math.max(capability.minDuration, Math.min(capability.maxDuration, duration));

  // 调整分辨率
  let resolution = params.resolution || capability.defaultResolution;
  if (!capability.resolutions.includes(resolution)) {
    console.log(`[Param Adjust] ⚠️ 分辨率 ${resolution} 不支持，使用默认 ${capability.defaultResolution}`);
    resolution = capability.defaultResolution;
  }

  // 调整帧率
  let fps = params.fps || capability.defaultFps;
  if (!capability.fps.includes(fps)) {
    console.log(`[Param Adjust] ⚠️ 帧率 ${fps} 不支持，使用默认 ${capability.defaultFps}`);
    fps = capability.defaultFps;
  }

  console.log('[Param Adjust] 调整后参数:', { duration, resolution, fps });
  return { duration, resolution, fps };
}

export const API_CONFIG = {
  // ✅ 火山引擎图生视频 API 地址（北京区域）
  // 官方文档：https://www.volcengine.com/docs/6791/1347698
  BASE_URL: "https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks",
  TIMEOUT: 300000, // 5分钟超时（跨境请求需要更长时间）
  MAX_RETRIES: 5, // 增加到5次重试
  RETRY_DELAYS: [3000, 6000, 12000, 24000, 48000], // 🔄 指数退避策略（3s, 6s, 12s, 24s, 48s）
  BUCKET_NAME: 'make-fc31472c-images',
};