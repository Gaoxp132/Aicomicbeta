/**
 * 漫剧系统统一类型定义
 * 避免在多个文件中重复定义相同的类型
 */

// ==================== 角色类型 ====================

export interface Character {
  id: string;
  name: string;
  description: string;
  avatar?: string;
  appearance: string;
  personality: string;
  role: 'protagonist' | 'supporting' | 'antagonist' | 'extra';
  series_id?: string;
  created_at?: string | Date;
}

export interface CharacterInput {
  name: string;
  description: string;
  appearance: string;
  personality: string;
  role: 'protagonist' | 'supporting' | 'antagonist' | 'extra';
  avatar?: string;
}

// ==================== 分镜类型 ====================

export interface Storyboard {
  id: string;
  episode_id: string;
  scene_number: number;
  description: string;
  dialogue?: string;
  characters: string[];
  location: string;
  time_of_day?: 'morning' | 'noon' | 'afternoon' | 'evening' | 'night';
  camera_angle?: 'close-up' | 'medium' | 'wide' | 'overhead' | 'low-angle';
  duration: number;
  image_url?: string;
  video_url?: string;
  status: 'draft' | 'generating' | 'completed' | 'failed';
  video_task_id?: string; // 🔧 修正：数据库列名是video_task_id
  created_at?: string | Date;
  updated_at?: string | Date;
}

export interface StoryboardInput {
  scene_number: number;
  description: string;
  dialogue?: string;
  characters: string[];
  location: string;
  time_of_day?: 'morning' | 'noon' | 'afternoon' | 'evening' | 'night';
  camera_angle?: 'close-up' | 'medium' | 'wide' | 'overhead' | 'low-angle';
  duration: number;
}

// ==================== 剧集类型 ====================

export interface Episode {
  id: string;
  series_id: string;
  episode_number: number;
  title: string;
  synopsis: string;
  storyboards?: Storyboard[];
  total_duration: number;
  status: 'draft' | 'generating' | 'completed' | 'failed';
  // 🆕 视频合成相关字段
  merged_video_url?: string; // 合并后的完整剧集视频URL
  merge_task_id?: string; // 视频合成任务ID
  merge_status?: 'pending' | 'merging' | 'completed' | 'failed'; // 视频合成状态
  merge_error?: string; // 视频合成错误信息
  thumbnail_url?: string; // 剧集缩略图URL
  created_at: string | Date;
  updated_at: string | Date;
}

export interface EpisodeInput {
  episode_number: number;
  title: string;
  synopsis: string;
  total_duration?: number;
}

// ==================== 漫剧系列类型 ====================

export interface Series {
  id: string;
  title: string;
  description: string;
  genre: string;
  style: string;
  characters?: Character[];
  episodes?: Episode[];
  total_episodes: number;
  cover_image_url?: string;  // ✅ 修正：实际列名是 cover_image_url
  user_phone: string;
  status: 'draft' | 'in-progress' | 'completed';
  created_at: string | Date;
  updated_at: string | Date;
  // 统计字段
  views?: number;
  likes_count?: number;
  comments_count?: number;
  shares_count?: number;
}

export interface SeriesInput {
  title: string;
  description: string;
  genre: string;
  style: string;
  total_episodes: number;
  cover_image_url?: string;  // ✅ 修正：实际列名是 cover_image_url
}

// ==================== 生成相关类型 ====================

export interface GenerationProgress {
  series_id: string;
  current_step: number;
  total_steps: number;
  step_name: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  error?: string;
  updated_at: string | Date;
}

export interface GenerationTask {
  series_id: string;
  user_phone: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  started_at?: string;
  completed_at?: string;
  error?: string;
}

// ==================== AI生成相关类型 ====================

export interface AICharacterInput {
  name: string;
  description: string;
  appearance?: string;
  personality?: string;
  role?: 'protagonist' | 'supporting' | 'antagonist' | 'extra';
}

export interface AIEpisodeOutline {
  episode_number: number;
  title: string;
  synopsis: string;
  scenes?: {
    scene_number: number;
    description: string;
    location: string;
    characters: string[];
  }[];
}