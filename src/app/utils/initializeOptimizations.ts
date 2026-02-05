/**
 * 统一初始化所有优化模块
 * 
 * 集成：
 * - SEO优化
 * - 存储优化
 * - 移动端优化
 * - 无障碍优化
 * - 网络优化
 * - 资源预加载
 * - 数据预取
 * - 配置管理
 */

import { initializeSEO } from './seoOptimization';
import { initializeStorage } from './storageOptimization';
import { initializeMobileOptimization } from './mobileOptimization';
import { initializeAccessibility } from './accessibilityOptimization';
import { addInterceptor, loggerInterceptor, performanceInterceptor } from './networkOptimization';
import { initializeResourcePreloading } from './resourcePreloader';
import { initializeDataPrefetching } from './dataPrefetcher';
import { configManager } from './configManager';

/**
 * 初始化所有优化
 */
export function initializeAllOptimizations() {
  console.log('[Optimizations] 🚀 Initializing all optimizations...');

  try {
    // 0. 配置管理器
    configManager.printConfig();
    console.log('[Optimizations] ✅ Configuration manager initialized');

    // 1. SEO优化
    initializeSEO();
    console.log('[Optimizations] ✅ SEO optimization initialized');

    // 2. 存储优化
    initializeStorage();
    console.log('[Optimizations] ✅ Storage optimization initialized');

    // 3. 移动端优化
    initializeMobileOptimization();
    console.log('[Optimizations] ✅ Mobile optimization initialized');

    // 4. 无障碍优化
    initializeAccessibility();
    console.log('[Optimizations] ✅ Accessibility optimization initialized');

    // 5. 网络优化拦截器
    if (process.env.NODE_ENV === 'development') {
      addInterceptor(loggerInterceptor);
      console.log('[Optimizations] ✅ Network logger interceptor added');
    }
    addInterceptor(performanceInterceptor);
    console.log('[Optimizations] ✅ Network performance interceptor added');

    // 6. 资源预加载
    if (configManager.getPerformanceConfig().enableOptimizations) {
      initializeResourcePreloading();
      console.log('[Optimizations] ✅ Resource preloading initialized');
    }

    // 7. 数据预取
    if (configManager.getPerformanceConfig().enableOptimizations) {
      initializeDataPrefetching();
      console.log('[Optimizations] ✅ Data prefetching initialized');
    }

    console.log('[Optimizations] 🎉 All optimizations initialized successfully!');
  } catch (error) {
    console.error('[Optimizations] ❌ Initialization error:', error);
  }
}

/**
 * 获取优化统计
 */
export function getOptimizationStats() {
  const config = configManager.getConfig();
  
  return {
    timestamp: new Date().toISOString(),
    version: config.app.version,
    environment: config.app.environment,
    optimizations: {
      seo: true,
      storage: true,
      mobile: true,
      accessibility: true,
      network: true,
      resourcePreloading: true,
      dataPrefetching: true,
      configManagement: true,
    },
    features: config.features,
    performance: config.performance,
  };
}

console.log('[InitializeOptimizations] ✅ Optimization initializer loaded');