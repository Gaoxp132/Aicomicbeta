/**
 * 应用全局类型定义
 */

// 基础类型
export type TaskStatus = 'generating' | 'completed' | 'failed';

// v6.0.36: 作品类型（全品类影视）
export type ProductionType = 'comic_drama' | 'short_drama' | 'micro_film' | 'movie' | 'tv_series' | 'documentary' | 'music_video' | 'advertisement' | 'brand_promo' | 'product_promo';

// 影视作品
export interface Comic {
  id: string;
  title: string;
  prompt: string;
  style: string;
  duration: string;
  thumbnail: string;
  videoUrl: string;
  createdAt: Date;
  status: TaskStatus;
  taskId?: string;
  imageUrls?: string[];
  resolution?: string;
  aspectRatio?: string; // v6.0.80: 视频画面比例（从metadata提取）
  fps?: number;
  enableAudio?: boolean;
  model?: string;
  userPhone?: string;
  metadata?: Record<string, unknown> | null; // v6.0.6: generation_metadata from backend
  seriesId?: string; // v6.0.6: extracted from metadata for task cleanup on series deletion
  error?: string; // 后端返回的错误信息（status=failed时）
}

// 社区影视系列作品
export interface CommunitySeriesWork {
  id: string; // series ID
  type: 'series'; // 标识这是影视系列
  user_phone: string;
  user_nickname?: string;
  title: string;
  description: string;
  genre: string;
  style: string;
  coverImage?: string;
  totalEpisodes: number;
  completedEpisodes: number; // 已成的集数
  episodes: {
    id: string;
    episodeNumber: number;
    title: string;
    synopsis: string;
    thumbnail?: string;
    videoUrl?: string; // 合成后的完整视频URL（如果有的话）
    mergedVideoUrl?: string; // v6.0.17: 合并视频URL
    totalDuration: number;
    status: 'draft' | 'generating' | 'completed' | 'failed';
    storyboardCount: number;
    completedStoryboardCount: number;
  }[];
  likes: number;
  views: number;
  shares: number;
  comments: number;
  isLiked?: boolean; // 当前用户是否已点赞
  aspectRatio?: string; // v6.0.83: 画面比例（从后端coherence_check提取）
  continueWatching?: {
    episodeNumber: number;
    lastPosition: number;
    duration: number;
    completed: boolean;
  };
  created_at: string;
  updated_at: string;
}

// API响应
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

// ==================== 影视创作系统类型 ====================

// 角色定义
export interface Character {
  id: string;
  seriesId?: string;
  name: string;
  description: string;
  avatar?: string; // 角色形象图片URL
  appearance: string; // 外貌描述（用于AI生成）
  personality: string; // 性格特征
  role: 'protagonist' | 'supporting' | 'antagonist' | 'mentor' | 'extra'; // 角色类型
  growthArc?: string; // 成长弧线
  coreValues?: string[]; // 核心价值观
  createdAt?: Date | string;
  updatedAt?: Date | string;
}

// 分镜
export interface Storyboard {
  id: string;
  episodeId: string;
  sceneNumber: number; // 场景序号
  description: string; // 场景描述
  dialogue?: string; // 对白
  characters: string[]; // 涉及的角色ID列表
  location?: string; // 场景位置
  timeOfDay?: string; // 时间（早晨/上午/中午/下午/傍晚/夜晚，支持中英文）
  cameraAngle?: string; // 镜头角度/景别（支持PRO_SHOT_MAP全部中英文值）
  duration: number; // 预计时长（秒）
  emotionalTone?: string; // 情感基调
  growthInsight?: string; // 成长洞察
  imageUrl?: string; // 生成的分镜图片
  thumbnailUrl?: string; // 分镜缩略图
  videoUrl?: string; // 生成的视频片段
  videoTaskId?: string; // 视频生成任务ID（新字段名）
  status: 'draft' | 'generating' | 'completed' | 'failed';
  error?: string; // 错误信息
  taskId?: string; // 视频生成任务ID（旧字段名，保留兼容）
  createdAt?: Date | string;
  updatedAt?: Date | string;
}

// 剧集
export interface Episode {
  id: string;
  seriesId: string;
  episodeNumber: number;
  title: string;
  synopsis: string; // 剧情简介
  growthTheme?: string; // 成长主题
  growthInsight?: string; // 成长洞察
  keyMoment?: string; // 关键时刻
  storyboards: Storyboard[];
  totalDuration: number; // 总时长（秒）
  status: 'draft' | 'generating' | 'completed' | 'failed';
  // 视频合成相关字段
  mergedVideoUrl?: string; // 合并后的视频URL（播放列表JSON或M3U8）
  mergeTaskId?: string; // 视频合成任务ID
  mergeStatus?: 'pending' | 'merging' | 'completed' | 'failed'; // 视频合成状态
  mergeError?: string; // 视频合成错误信息
  thumbnailUrl?: string; // 剧集缩略图
  createdAt: Date | string;
  updatedAt: Date | string;
}

// 剧集系列（完整的影视作品）
export interface Series {
  id: string;
  title: string;
  description: string;
  genre: string; // 类型（爱情、悬疑、喜剧等）
  style: string; // 视觉风格
  characters: Character[];
  episodes: Episode[];
  totalEpisodes: number;
  coverImage?: string;
  coverImageUrl?: string; // 数据库字段映射
  userPhone?: string;
  createdAt: Date | string;
  updatedAt: Date | string;
  status: 'draft' | 'generating' | 'in-progress' | 'completed' | 'failed';
  // 统计信息（从后端返回）
  stats?: {
    charactersCount: number;
    episodesCount: number;
    storyboardsCount: number;
    completedVideosCount: number;
  };
  // 排队状态
  queueStatus?: 'queued' | 'processing';
  // AI生成进度信息（数据库中可能为数字、null或对象）
  generationProgress?: {
    currentStep: number;
    totalSteps: number;
    stepName: string;
    error?: string;
    startedAt?: string;
    completedAt?: string;
    failedAt?: string;
  } | number | null;
  // 故事大纲
  storyOutline?: string;
  // 主题
  theme?: string;
  // 目标受众
  targetAudience?: string;
  // 核心价值观
  coreValues?: string[];
  // v6.0.8: 视觉一致性——视觉风格指南 + 角色外貌锁定
  coherenceCheck?: {
    visualStyleGuide?: string; // AI生成的完整视觉风格指南文本
    characterAppearances?: { name: string; role: string; appearance: string }[]; // 角色外貌卡
    baseStyle?: string; // 基础风格 key (e.g. 'anime', 'realistic')
    baseStylePrompt?: string; // 基础风格的详细prompt描述
    generatedAt?: string; // 生成时间
    referenceImageUrl?: string; // v6.0.16: 参考图URL
    productionType?: ProductionType; // v6.0.36: 作品类型
    isPublic?: boolean; // v6.0.70: 是否发布到社区
    resolution?: string; // v6.0.78: 视频分辨率（720p/1080p/480p）
    aspectRatio?: string; // v6.0.79: 视频比例（16:9/9:16/1:1/4:3/3:4）
    styleAnchorImageUrl?: string; // v6.0.118: 风格锚定图URL
    styleAnchorScene?: string; // v6.0.118: 锚定来源（'user-upload' | 'E1S1' 等）
    styleAnchorSetAt?: string; // v6.0.118: 锚定时间
    styleAnchorUpgradedFrom?: string; // v6.0.118: 升级来源追踪
  } | null;
  // 章节管理（用于长剧30-80集）
  chapters?: Chapter[];
  // 是否为长剧（>15集）
  isLongSeries?: boolean;
  // v6.0.70: 是否发布到社区（默认true，存储在coherence_check.isPublic）
  isPublic?: boolean;
}

// 章节（用于长剧组织，每章包含多集）
export interface Chapter {
  id: string;
  seriesId: string;
  chapterNumber: number;
  title: string;
  description: string; // 本章主题描述
  episodeRange: {
    start: number; // 起始集数
    end: number; // 结束集数
  };
  theme?: string; // 本章成长主题
  status: 'draft' | 'in-progress' | 'completed';
  createdAt: Date | string;
  updatedAt: Date | string;
}

// 影视创作表单数据
export interface SeriesFormData {
  title: string;
  description: string;
  genre: string;
  style: string;
  episodeCount: number;
  storyOutline: string; // 故事大纲
  theme?: string; // 主题
  targetAudience?: string; // 目标受众
  referenceImageUrl?: string; // v6.0.16: 参考图URL
  productionType?: ProductionType; // v6.0.36: 作品类型
  isPublic?: boolean; // v6.0.70: 是否发布到社区（默认true）
  resolution?: string; // v6.0.78: 视频分辨率（720p/1080p/480p）
  aspectRatio?: string; // v6.0.79: 视频比例（16:9/9:16/1:1/4:3/3:4）
  // v6.0.90: 品牌/产品宣传片专属字段
  brandName?: string; // 品牌/产品名称
  slogan?: string; // 广告语/口号
  sellingPoints?: string[]; // 核心卖点
  promoTone?: string; // 宣传调性（luxury/tech/warm/energetic/minimal/cinematic）
  callToAction?: string; // 行动号召（如"立即购买"、"预约体验"等）
  // v6.0.192: 多素材上传（图片+视频），AI创作时自动参考
  referenceAssets?: ReferenceAsset[];
}

// v6.0.192: 用户上传的参考素材（图片/视频）
export interface ReferenceAsset {
  url: string;           // OSS URL
  type: 'image' | 'video'; // 素材类型
  name: string;          // 原始文件名
  size: number;          // 文件大小(bytes)
  thumbnailUrl?: string; // 视频缩略图URL
  tag?: 'logo' | 'product' | 'scene' | 'general'; // 素材标签（logo保持原形象）
}