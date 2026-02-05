/**
 * 工具函数统一导出
 * 
 * 便捷导入所有优化工具
 */

// ==================== 网络优化 ====================
export {
  optimizedFetch,
  cancelRequest,
  cancelAllRequests,
  addInterceptor,
  getNetworkStats,
  loggerInterceptor,
  createAuthInterceptor,
  retryInterceptor,
  performanceInterceptor,
  batchRequest,
  pollRequest,
  prefetchResource,
  prefetchBatch,
} from './networkOptimization';

// ==================== 本地存储 ====================
export {
  localStorageManager,
  sessionStorageManager,
  setLocal,
  getLocal,
  removeLocal,
  setSession,
  getSession,
  removeSession,
  userPreferences,
  authStorage,
  cacheStorage,
  monitorStorage,
  autoCleanupExpired,
  syncAcrossTabs,
  initializeStorage,
} from './storageOptimization';

// ==================== 移动端优化 ====================
export {
  getDeviceInfo,
  useIsMobile,
  useDeviceInfo,
  useSwipeGesture,
  useLongPress,
  useDoubleTap,
  useScrollToTop,
  useScrollToBottom,
  useVirtualKeyboard,
  useIOSInputFix,
  usePWAInstall,
  preventTouchThrough,
  disableIOSDoubleTapZoom,
  disableLongPressMenu,
  enableHardwareAcceleration,
  disableScrollChaining,
  enableSmoothScroll,
  getSafeArea,
  applySafeAreaCSS,
  initializeMobileOptimization,
} from './mobileOptimization';

// ==================== 无障碍优化 ====================
export {
  useFocusTrap,
  useFocusVisible,
  useAutoFocus,
  useKeyboardShortcuts,
  useArrowKeyNavigation,
  useUniqueId,
  useAriaLive,
  useAriaDescription,
  announceToScreenReader,
  isScreenReaderActive,
  getContrastRatio,
  checkContrastCompliance,
  getSkipToContentProps,
  getScreenReaderOnlyProps,
  addAccessibilityCSS,
  isFocusable,
  getFocusableElements,
  setPageLanguage,
  setPageTitle,
  initializeAccessibility,
} from './accessibilityOptimization';

// ==================== SEO优化 ====================
export {
  updatePageTitle,
  updateMetaTag,
  updateMetaTags,
  setSEOConfig,
  setVideoSEO,
  setSeriesSEO,
  addStructuredData,
  addBreadcrumbStructuredData,
  resetSEO,
  setCanonicalUrl,
  preloadResource, // 从seoOptimization导出（创建preload link标签）
  preconnect,
  dnsPrefetch,
  optimizeThirdPartyLoading,
  initializeSEO,
  SEO_PRESETS,
} from './seoOptimization';

// ==================== React优化 ====================
export {
  // 智能Memo
  smartMemo,
  deepCompareProps,
  shallowCompareProps,
  
  // 懒加载
  createLazyComponent,
  LazyLoadWrapper,
  
  // Callback辅助
  useStableCallback,
  useCallbacks,
  
  // Memo辅助
  useDeepMemo,
  useConditionalMemo,
  
  // 虚拟滚动
  useVirtualScroll,
  
  // 图片懒加载
  LazyImage,
  
  // 性能监控
  PerformanceMonitor,
  
  // 防抖Hook
  useDebounce,
  useDebouncedCallback,
  
  // 节流Hook
  useThrottledCallback,
  
  // 窗口尺寸
  useWindowSize,
  
  // 元素可见性
  useIntersectionObserver,
  
  // 前一个值
  usePrevious,
  
  // 批量更新
  useBatchedState,
  
  // 类型导出
  type MemoComponent,
  type LazyComponent,
} from './reactOptimization';

// ==================== 性能优化 ====================
export {
  debounce,
  throttle,
  requestDeduplicator,
  memoryLeakDetector,
  performanceMonitor,
  BatchProcessor,
  makeCancelable,
  delay,
  withTimeout,
  retry,
} from './performanceOptimizer';

// ==================== API客户端 ====================
export {
  apiClient,
  communityApiClient,
  volcengineApiClient,
  aiApiClient,
  createApiClient,
  buildQueryString,
  getApiUrl,
  getDefaultHeaders,
} from './optimizedApiClient';

// ==================== 请求缓存 ====================
export {
  cachedFetch,
  clearCache,
  clearAllCache,
  clearExpiredCache,
  prefetchCache,
  getCacheStats,
} from './requestCache';

// ==================== 懒加载组件 ====================
export {
  LazyGeneratePanel,
  LazySeriesCreationPanel,
  LazyCommunityPanel,
  LazyProfilePanel,
  LazyImmersiveVideoViewer,
  LazyTaskStatusFloating,
} from './lazyComponents';

// ==================== 系统健康检查 ====================
// 注释掉：文件已删除
// export {
//   systemHealthChecker,
//   quickHealthCheck,
// } from './systemHealthCheck';

// ==================== 错误追踪 ====================
export {
  errorTracker,
  createLogger,
  captureNetworkError,
  captureAPIError,
  captureUIError,
  captureDataError,
  getErrorStats,
  clearAllErrors,
} from './errorTracking';

// ==================== 生产就绪检查 ====================
// 注释掉：文件已删除
// export {
//   productionReadinessChecker,
//   quickReadinessCheck,
//   printReadinessReport,
// } from './productionReadinessCheck';

// ==================== 用户分析 ====================
export {
  analytics,
  trackPageView,
  trackEvent,
  trackVideoGeneration,
  trackSeriesCreation,
  trackSocialInteraction,
  trackError,
  trackPerformance,
} from './userAnalytics';

// ==================== 初始化 ====================
export {
  initializeAllOptimizations,
  getOptimizationStats,
} from './initializeOptimizations';

// ==================== 配置管理 ====================
export {
  configManager,
  getConfig,
  getApiTimeout,
  getMaxRetries,
  getCacheMaxAge,
  isOptimizationEnabled,
  isLazyLoadingEnabled,
  isAnalyticsEnabled,
  isErrorTrackingEnabled,
  isDevToolsEnabled,
  getVideoDefaults,
  getSeriesLimits,
  type AppConfig,
} from './configManager';

// ==================== 资源预加载 ====================
export {
  resourcePreloader,
  preloadCriticalOrigins,
  preloadCriticalFonts,
  preloadCriticalImages,
  initializeResourcePreloading,
  type ResourceType,
  type ResourcePriority,
  type PreloadOptions,
} from './resourcePreloader';

// ==================== 数据预取 ====================
export {
  dataPrefetcher,
  prefetchCommunityData,
  prefetchUserData,
  prefetchSeriesDetail,
  prefetchRelatedContent,
  prefetchNextPage,
  initializeDataPrefetching,
  type PrefetchPriority,
  type PrefetchTask,
  type PrefetchOptions as DataPrefetchOptions,
} from './dataPrefetcher';

// ==================== 数据库健康检查 ====================
// 注意：此模块已移除对apiClient的依赖，使用原生fetch避免循环依赖
export {
  checkDatabaseHealth,
  checkRequiredTables,
  showMigrationHint,
  performStartupHealthCheck,
} from './databaseHealthCheck';

// ==================== 类型导出 ====================
export type { ApiClientConfig, ApiResponse } from './optimizedApiClient';
export type { ErrorLevel, ErrorCategory } from './errorTracking';
export type { EventCategory } from './userAnalytics';

console.log('[Utils] ✅ All utility functions exported');