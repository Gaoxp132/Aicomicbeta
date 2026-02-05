/**
 * 应用全局常量配置
 */

// API配置
export const API_CONFIG = {
  TIMEOUT: 30000, // 30秒
  MAX_RETRIES: 3,
  RETRY_DELAY: 1000, // 1秒
} as const;

// 分页配置
export const PAGINATION = {
  DEFAULT_PAGE_SIZE: 20,
  MAX_PAGE_SIZE: 100,
  INITIAL_PAGE: 1,
} as const;

// 视频配置
export const VIDEO_CONFIG = {
  MIN_DURATION: 4, // 最小时长（秒）
  MAX_DURATION: 60, // 最大时长（秒）
  SUPPORTED_FORMATS: ['.mp4', '.webm', '.ogg', '.mov'],
  DEFAULT_RESOLUTION: '1080p',
  DEFAULT_FPS: 30,
} as const;

// 文本配置
export const TEXT_LIMITS = {
  TITLE_MIN: 1,
  TITLE_MAX: 100,
  PROMPT_MIN: 10,
  PROMPT_MAX: 1000,
  COMMENT_MIN: 1,
  COMMENT_MAX: 500,
  USERNAME_MIN: 2,
  USERNAME_MAX: 20,
} as const;

// 验证规则
export const VALIDATION = {
  PHONE_REGEX: /^1[3-9]\d{9}$/,
  UUID_REGEX: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
} as const;

// 本地存储键
export const STORAGE_KEYS = {
  USER_PHONE: 'userPhone',
  LOGIN_TIME: 'loginTime',
  WELCOME_SHOWN: 'ai_comic_welcome_shown',
  THEME: 'ai_comic_theme',
  SETTINGS: 'ai_comic_settings',
  HAS_RUN_DATA_FIXES: 'hasRunDataFixes_v2',
  LAST_AUTO_IMPORT: 'lastAutoImport',
} as const;

// 动画配置
export const ANIMATION = {
  DURATION: {
    FAST: 0.2,
    NORMAL: 0.3,
    SLOW: 0.5,
  },
  EASING: {
    EASE_IN_OUT: [0.4, 0, 0.2, 1],
    EASE_OUT: [0, 0, 0.2, 1],
    EASE_IN: [0.4, 0, 1, 1],
  },
} as const;

// 下拉刷新配置
export const PULL_REFRESH = {
  THRESHOLD: 60, // 触发刷新的距离（px）
  MAX_PULL: 100, // 最大下拉距离（px）
} as const;

// 速率限制配置
export const RATE_LIMIT = {
  MAX_REQUESTS: 100,
  WINDOW_MS: 60000, // 1分钟
} as const;

// Toast配置
export const TOAST_CONFIG = {
  DURATION: 3000, // 3秒
  POSITION: 'top-center' as const,
} as const;

// 颜色主题
export const THEME_COLORS = {
  PRIMARY: '#8B5CF6',
  SECONDARY: '#EC4899',
  SUCCESS: '#10B981',
  WARNING: '#F59E0B',
  ERROR: '#EF4444',
  INFO: '#3B82F6',
} as const;

// 屏幕断点
export const BREAKPOINTS = {
  MOBILE: 640,
  TABLET: 768,
  LAPTOP: 1024,
  DESKTOP: 1280,
} as const;

// 文件大小限制
export const FILE_SIZE = {
  MAX_VIDEO_SIZE: 100 * 1024 * 1024, // 100MB
  MAX_IMAGE_SIZE: 10 * 1024 * 1024, // 10MB
} as const;

// 社区筛选选项
export const COMMUNITY_FILTERS = {
  CATEGORIES: [
    { id: 'all', name: '全部' },
    { id: 'anime', name: '日系动漫' },
    { id: 'cyberpunk', name: '赛博朋克' },
    { id: 'fantasy', name: '奇幻魔法' },
    { id: 'realistic', name: '真实写实' },
    { id: 'cartoon', name: '卡通动画' },
    { id: 'comic', name: '漫画分镜' },
  ],
  SORT_OPTIONS: [
    { id: 'latest', name: '最新发布' },
    { id: 'popular', name: '最受欢迎' },
  ],
} as const;