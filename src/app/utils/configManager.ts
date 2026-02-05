/**
 * 配置管理器
 * 
 * 功能：
 * - 集中管理应用配置
 * - 环境变量管理
 * - 运行时配置
 * - 配置验证
 */

// ==================== 类型定义 ====================

export interface AppConfig {
  // 应用信息
  app: {
    name: string;
    version: string;
    environment: 'development' | 'staging' | 'production';
    debug: boolean;
  };

  // API配置
  api: {
    baseUrl: string;
    timeout: number;
    retries: number;
    rateLimitPerMinute: number;
  };

  // 功能开关
  features: {
    enableAnalytics: boolean;
    enableErrorTracking: boolean;
    enableDevTools: boolean;
    enableHealthCheck: boolean;
    enableOfflineMode: boolean;
    enablePWA: boolean;
  };

  // 性能配置
  performance: {
    enableOptimizations: boolean;
    enableLazyLoading: boolean;
    enableCodeSplitting: boolean;
    enableCaching: boolean;
    cacheMaxAge: number; // 毫秒
    maxConcurrentRequests: number;
  };

  // 视频生成配置
  video: {
    defaultDuration: string;
    defaultStyle: string;
    maxRetries: number;
    pollInterval: number;
    pollMaxAttempts: number;
  };

  // 剧集创作配置
  series: {
    minEpisodes: number;
    maxEpisodes: number;
    defaultEpisodes: number;
    maxTitleLength: number;
    maxDescriptionLength: number;
  };

  // 存储配置
  storage: {
    enableLocalStorage: boolean;
    enableSessionStorage: boolean;
    autoCleanup: boolean;
    cleanupInterval: number; // 毫秒
  };

  // 无障碍配置
  accessibility: {
    enableKeyboardNav: boolean;
    enableScreenReader: boolean;
    enableHighContrast: boolean;
    enableFocusIndicator: boolean;
  };

  // SEO配置
  seo: {
    defaultTitle: string;
    defaultDescription: string;
    defaultKeywords: string[];
    enableStructuredData: boolean;
  };
}

// ==================== 默认配置 ====================

const defaultConfig: AppConfig = {
  app: {
    name: 'AI漫剧创作工具',
    version: '3.6.0',
    environment: (import.meta.env.MODE as any) || 'development',
    debug: import.meta.env.DEV || false,
  },

  api: {
    baseUrl: import.meta.env.VITE_API_BASE_URL || '',
    timeout: 120000, // 2分钟
    retries: 3,
    rateLimitPerMinute: 60,
  },

  features: {
    enableAnalytics: true,
    enableErrorTracking: true,
    enableDevTools: import.meta.env.DEV || false,
    enableHealthCheck: true,
    enableOfflineMode: true,
    enablePWA: true,
  },

  performance: {
    enableOptimizations: true,
    enableLazyLoading: true,
    enableCodeSplitting: true,
    enableCaching: true,
    cacheMaxAge: 5 * 60 * 1000, // 5分钟
    maxConcurrentRequests: 6,
  },

  video: {
    defaultDuration: '5s',
    defaultStyle: '动漫风格',
    maxRetries: 3,
    pollInterval: 2000, // 2秒
    pollMaxAttempts: 150, // 最多轮询5分钟
  },

  series: {
    minEpisodes: 3,
    maxEpisodes: 80,
    defaultEpisodes: 12,
    maxTitleLength: 50,
    maxDescriptionLength: 500,
  },

  storage: {
    enableLocalStorage: true,
    enableSessionStorage: true,
    autoCleanup: true,
    cleanupInterval: 60 * 60 * 1000, // 1小时
  },

  accessibility: {
    enableKeyboardNav: true,
    enableScreenReader: true,
    enableHighContrast: false,
    enableFocusIndicator: true,
  },

  seo: {
    defaultTitle: 'AI漫剧创作工具 - 让创意变成现实',
    defaultDescription: '专业的AI漫剧创作平台，支持12种风格和多种时长，引导用户生命价值成长，传递优秀的中国价值观',
    defaultKeywords: ['AI漫剧', '短剧生成', '视频创作', '人工智能', '价值观教育'],
    enableStructuredData: true,
  },
};

// ==================== 配置管理器 ====================

class ConfigManager {
  private config: AppConfig;
  private overrides: Partial<AppConfig> = {};

  constructor() {
    this.config = { ...defaultConfig };
    this.loadFromLocalStorage();
  }

  /**
   * 获取完整配置
   */
  getConfig(): Readonly<AppConfig> {
    return { ...this.config, ...this.overrides } as AppConfig;
  }

  /**
   * 获取应用配置
   */
  getAppConfig() {
    return this.getConfig().app;
  }

  /**
   * 获取API配置
   */
  getApiConfig() {
    return this.getConfig().api;
  }

  /**
   * 获取功能开关
   */
  getFeatures() {
    return this.getConfig().features;
  }

  /**
   * 获取性能配置
   */
  getPerformanceConfig() {
    return this.getConfig().performance;
  }

  /**
   * 获取视频配置
   */
  getVideoConfig() {
    return this.getConfig().video;
  }

  /**
   * 获取剧集配置
   */
  getSeriesConfig() {
    return this.getConfig().series;
  }

  /**
   * 获取存储配置
   */
  getStorageConfig() {
    return this.getConfig().storage;
  }

  /**
   * 获取无障碍配置
   */
  getAccessibilityConfig() {
    return this.getConfig().accessibility;
  }

  /**
   * 获取SEO配置
   */
  getSEOConfig() {
    return this.getConfig().seo;
  }

  /**
   * 设置配置覆盖
   */
  setOverride<K extends keyof AppConfig>(
    key: K,
    value: Partial<AppConfig[K]>
  ): void {
    this.overrides[key] = {
      ...this.overrides[key],
      ...value,
    } as any;
    this.saveToLocalStorage();
  }

  /**
   * 清除配置覆盖
   */
  clearOverrides(): void {
    this.overrides = {};
    this.saveToLocalStorage();
  }

  /**
   * 重置为默认配置
   */
  reset(): void {
    this.config = { ...defaultConfig };
    this.overrides = {};
    this.saveToLocalStorage();
  }

  /**
   * 验证配置
   */
  validate(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    const config = this.getConfig();

    // 验证API配置
    if (config.api.timeout < 1000) {
      errors.push('API超时时间不能小于1秒');
    }

    if (config.api.retries < 0) {
      errors.push('API重试次数不能为负数');
    }

    // 验证视频配置
    if (config.video.pollInterval < 500) {
      errors.push('轮询间隔不能小于500毫秒');
    }

    // 验证剧集配置
    if (config.series.minEpisodes < 1) {
      errors.push('最小集数不能小于1');
    }

    if (config.series.maxEpisodes < config.series.minEpisodes) {
      errors.push('最大集数不能小于最小集数');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * 从localStorage加载配置
   */
  private loadFromLocalStorage(): void {
    try {
      const stored = localStorage.getItem('app_config_overrides');
      if (stored) {
        this.overrides = JSON.parse(stored);
      }
    } catch (error) {
      console.warn('[ConfigManager] Failed to load config from localStorage:', error);
    }
  }

  /**
   * 保存配置到localStorage
   */
  private saveToLocalStorage(): void {
    try {
      localStorage.setItem('app_config_overrides', JSON.stringify(this.overrides));
    } catch (error) {
      console.warn('[ConfigManager] Failed to save config to localStorage:', error);
    }
  }

  /**
   * 检查功能是否启用
   */
  isFeatureEnabled(feature: keyof AppConfig['features']): boolean {
    return this.getFeatures()[feature];
  }

  /**
   * 是否为开发环境
   */
  isDevelopment(): boolean {
    return this.getAppConfig().environment === 'development';
  }

  /**
   * 是否为生产环境
   */
  isProduction(): boolean {
    return this.getAppConfig().environment === 'production';
  }

  /**
   * 是否启用调试
   */
  isDebug(): boolean {
    return this.getAppConfig().debug;
  }

  /**
   * 打印配置信息
   */
  printConfig(): void {
    const config = this.getConfig();
    console.group('📋 应用配置');
    console.log('应用名称:', config.app.name);
    console.log('版本:', config.app.version);
    console.log('环境:', config.app.environment);
    console.log('调试模式:', config.app.debug);
    console.log('API地址:', config.api.baseUrl);
    console.log('功能开关:', config.features);
    console.log('性能配置:', config.performance);
    console.groupEnd();
  }
}

// ==================== 导出单例 ====================

export const configManager = new ConfigManager();

// ==================== 便捷方法 ====================

/**
 * 获取完整配置
 */
export function getConfig(): Readonly<AppConfig> {
  return configManager.getConfig();
}

/**
 * 获取API超时时间
 */
export function getApiTimeout(): number {
  return configManager.getApiConfig().timeout;
}

/**
 * 获取最大重试次数
 */
export function getMaxRetries(): number {
  return configManager.getApiConfig().retries;
}

/**
 * 获取缓存最大存活时间
 */
export function getCacheMaxAge(): number {
  return configManager.getPerformanceConfig().cacheMaxAge;
}

/**
 * 是否启用性能优化
 */
export function isOptimizationEnabled(): boolean {
  return configManager.getPerformanceConfig().enableOptimizations;
}

/**
 * 是否启用懒加载
 */
export function isLazyLoadingEnabled(): boolean {
  return configManager.getPerformanceConfig().enableLazyLoading;
}

/**
 * 是否启用分析
 */
export function isAnalyticsEnabled(): boolean {
  return configManager.isFeatureEnabled('enableAnalytics');
}

/**
 * 是否启用错误追踪
 */
export function isErrorTrackingEnabled(): boolean {
  return configManager.isFeatureEnabled('enableErrorTracking');
}

/**
 * 是否启用开发工具
 */
export function isDevToolsEnabled(): boolean {
  return configManager.isFeatureEnabled('enableDevTools');
}

/**
 * 获取视频默认配置
 */
export function getVideoDefaults() {
  const config = configManager.getVideoConfig();
  return {
    duration: config.defaultDuration,
    style: config.defaultStyle,
  };
}

/**
 * 获取剧集限制
 */
export function getSeriesLimits() {
  const config = configManager.getSeriesConfig();
  return {
    min: config.minEpisodes,
    max: config.maxEpisodes,
    default: config.defaultEpisodes,
  };
}

console.log('[ConfigManager] ✅ Configuration manager initialized');
