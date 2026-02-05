/**
 * 应用全局类型定义
 */

// 基础类型
export type TabType = 'create' | 'series' | 'community' | 'profile';
export type CategoryType = 'all' | 'series' | 'anime' | 'cyberpunk' | 'fantasy' | 'realistic' | 'cartoon' | 'comic';
export type SortType = 'latest' | 'popular';
export type TaskStatus = 'generating' | 'completed' | 'failed';

// 漫剧作品
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
  fps?: number;
  enableAudio?: boolean;
  model?: string;
  userPhone?: string;
}

// 社区作品
export interface CommunityWork {
  id: string;
  task_id: string;
  user_phone: string;
  user_nickname?: string;
  title: string;
  prompt: string;
  style: string;
  duration: string;
  thumbnail?: string;
  video_url: string;
  likes: number;
  views: number;
  shares: number;
  created_at: string;
}

// 🆕 社区漫剧系列作品
export interface CommunitySeriesWork {
  id: string; // series ID
  type: 'series'; // 标识这是漫剧系列
  user_phone: string;
  user_nickname?: string;
  title: string;
  description: string;
  genre: string;
  style: string;
  coverImage?: string;
  totalEpisodes: number;
  completedEpisodes: number; // 已完成的集数
  episodes: {
    id: string;
    episodeNumber: number;
    title: string;
    synopsis: string;
    thumbnail?: string;
    videoUrl?: string; // 合成后的完整视频URL（如果有的话）
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
  continueWatching?: {
    episodeNumber: number;
    lastPosition: number;
    duration: number;
    completed: boolean;
  };
  created_at: string;
  updated_at: string;
}

// 评论
export interface Comment {
  id: string;
  work_id: string;
  user_phone: string;
  user_nickname?: string;
  content: string;
  created_at: string;
  replies?: CommentReply[];
}

// 评论回复
export interface CommentReply {
  id: string;
  comment_id: string;
  user_phone: string;
  user_nickname?: string;
  content: string;
  created_at: string;
}

// 用户信息
export interface UserInfo {
  phone: string;
  nickname?: string;
  avatar?: string;
  created_at?: string;
}

// 作品交互数据
export interface WorkInteractions {
  likes: number;
  shares: number;
  comments: number;
  views: number;
  isLiked: boolean;
}

// 视频生成任务
export interface GenerateTask {
  id: string;
  taskId: string;
  status: TaskStatus;
  progress?: number;
  prompt: string;
  style: string;
  duration: string;
  resolution?: string;
  fps?: number;
  enableAudio?: boolean;
  createdAt: Date;
  updatedAt?: Date;
}

// API响应
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

// 分页参数
export interface PaginationParams {
  page: number;
  limit: number;
}

// 分页响应
export interface PaginatedResponse<T> {
  success: boolean;
  data: T[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

// 社区作品查询参数
export interface CommunityWorksParams extends PaginationParams {
  category?: CategoryType;
  sort?: SortType;
  search?: string;
}

// 视频生成参数
export interface VideoGenerateParams {
  prompt: string;
  style: string;
  duration: number;
  resolution?: string;
  fps?: number;
  enableAudio?: boolean;
  model?: string;
}

// 组件Props类型
export interface BaseComponentProps {
  className?: string;
  style?: React.CSSProperties;
}

// 对话框Props
export interface DialogProps {
  isOpen: boolean;
  onClose: () => void;
}

// 视频播放器Props
export interface VideoPlayerProps {
  src: string;
  poster?: string;
  autoPlay?: boolean;
  controls?: boolean;
  muted?: boolean;
  loop?: boolean;
  className?: string;
}

// 表单字段
export interface FormField<T = string> {
  value: T;
  error?: string;
  touched: boolean;
}

// 表单状态
export interface FormState {
  [key: string]: FormField;
}

// 验证结果
export interface ValidationResult {
  valid: boolean;
  error?: string;
  errors?: Record<string, string>;
}

// 火山引擎API响应
export interface VolcengineResponse {
  code: number;
  message: string;
  data?: any;
  request_id?: string;
}

// 火山引擎任务状态
export interface VolcengineTaskStatus {
  task_id: string;
  status: 'pending' | 'processing' | 'success' | 'failed';
  progress?: number;
  result_url?: string;
  error_message?: string;
}

// ==================== 漫剧创作系统类型 ====================

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
  timeOfDay?: 'morning' | 'noon' | 'afternoon' | 'evening' | 'night'; // 时间
  cameraAngle?: 'close-up' | 'medium' | 'wide' | 'overhead' | 'low-angle'; // 镜头角度
  duration: number; // 预计时长（秒）
  emotionalTone?: string; // 情感基调
  growthInsight?: string; // 成长洞察
  imageUrl?: string; // 生成的分镜图片
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
  // 🆕 视频合成相关字段
  mergedVideoUrl?: string; // 合并后的视频URL（播放列表JSON或M3U8）
  mergeTaskId?: string; // 视频合成任务ID
  mergeStatus?: 'pending' | 'merging' | 'completed' | 'failed'; // 视频合成状态
  mergeError?: string; // 视频合成错误信息
  thumbnailUrl?: string; // 剧集缩略图
  createdAt: Date | string;
  updatedAt: Date | string;
}

// 剧集系列（完整的漫剧作品）
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
  coverImageUrl?: string; // 🔧 数据库字段映射
  userPhone?: string;
  createdAt: Date | string;
  updatedAt: Date | string;
  status: 'draft' | 'generating' | 'in-progress' | 'completed' | 'failed';
  // 🆕 统计信息（从后端返回）
  stats?: {
    charactersCount: number;
    episodesCount: number;
    storyboardsCount: number;
    completedVideosCount: number;
  };
  // 🆕 排队状态
  queueStatus?: 'queued' | 'processing';
  // 🆕 AI生成进度信息
  generationProgress?: {
    currentStep: number;
    totalSteps: number;
    stepName: string;
    error?: string;
    startedAt?: string;
    completedAt?: string;
    failedAt?: string;
  };
  // 🆕 故事大纲
  storyOutline?: string;
  // 🆕 主题
  theme?: string;
  // 🆕 目标受众
  targetAudience?: string;
  // 🆕 核心价值观
  coreValues?: string[];
  // 🆕 一致性检查结果
  coherenceCheck?: any;
  // 🆕 章节管理（用于长剧30-80集）
  chapters?: Chapter[];
  // 🆕 是否为长剧（>15集）
  isLongSeries?: boolean;
}

// 🆕 章节（用于长剧组织，每章包含多集）
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

// 漫剧创作表单数据
export interface SeriesFormData {
  title: string;
  description: string;
  genre: string;
  style: string;
  episodeCount: number;
  storyOutline: string; // 故事大纲
}

// AI分析结果
export interface AIAnalysisResult {
  characters: Character[];
  episodes: {
    episodeNumber: number;
    title: string;
    synopsis: string;
    scenes: {
      sceneNumber: number;
      description: string;
      dialogue?: string;
      characters: string[];
      location: string;
      duration: number;
    }[];
  }[];
}

// 分镜生成参数
export interface StoryboardGenerateParams {
  seriesId: string;
  episodeId: string;
  storyboard: Storyboard;
  characters: Character[];
  style: string;
}