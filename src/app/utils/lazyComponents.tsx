/**
 * 懒加载组件配置
 * 使用代码分割优化打包大小和初始加载速度
 */

import React from 'react';
import { lazy } from 'react';
import { createLazyComponent } from './reactOptimization';

// ==================== 主要面板组件（按需加载） ====================

/**
 * 创作面板 - 使用频率较低，可以懒加载
 */
export const LazyGeneratePanel = createLazyComponent(
  () => import('../components/GeneratePanel'),
  {
    fallback: <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-500"></div>
    </div>,
  }
);

/**
 * 漫剧创作面板 - 功能复杂，建议懒加载
 */
export const LazySeriesCreationPanel = createLazyComponent(
  () => import('../components/SeriesCreationPanel'),
  {
    fallback: <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-500"></div>
    </div>,
  }
);

/**
 * 社区面板 - 默认首页，但内容丰富，可考虑懒加载
 */
export const LazyCommunityPanel = createLazyComponent(
  () => import('../components/CommunityPanel'),
  {
    fallback: <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-500"></div>
    </div>,
  }
);

/**
 * 个人资料面板 - 使用频率适中
 */
export const LazyProfilePanel = createLazyComponent(
  () => import('../components/ProfilePanel'),
  {
    fallback: <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-500"></div>
    </div>,
  }
);

// ==================== 弹窗组件（按需加载） ====================

/**
 * 沉浸式视频查看器 - 只在点击视频时加载
 */
export const LazyImmersiveVideoViewer = createLazyComponent(
  () => import('../components/ImmersiveVideoViewer'),
  {
    fallback: <div className="fixed inset-0 bg-black flex items-center justify-center">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white"></div>
    </div>,
  }
);

/**
 * 设置对话框 - 低频使用
 */
export const LazySettingsDialog = createLazyComponent(
  () => import('../components/SettingsDialog'),
  {
    fallback: null,
  }
);

// ==================== 任务管理组件 ====================

/**
 * 任务状态浮窗 - 只在点击时加载
 */
export const LazyTaskStatusFloating = createLazyComponent(
  () => import('../components/TaskStatusFloating'),
  {
    fallback: null,
  }
);

// ==================== 使用示例 ====================

/*
使用方法：

import { LazyGeneratePanel, LazyImmersiveVideoViewer } from '@/app/utils/lazyComponents';

function App() {
  return (
    <>
      <Suspense fallback={<Loading />}>
        <LazyGeneratePanel />
      </Suspense>
      
      {showViewer && (
        <Suspense fallback={<ViewerLoading />}>
          <LazyImmersiveVideoViewer />
        </Suspense>
      )}
    </>
  );
}
*/

// ==================== 预加载函数 ====================

/**
 * 预加载所有懒加载组件
 * 在空闲时间调用，提前加载组件
 */
export function preloadAllComponents() {
  if ('requestIdleCallback' in window) {
    requestIdleCallback(() => {
      console.log('[LazyComponents] Preloading components in idle time...');
      
      // 预加载所有懒加载组件
      import('../components/GeneratePanel');
      import('../components/SeriesCreationPanel');
      import('../components/CommunityPanel');
      import('../components/ProfilePanel');
      import('../components/ImmersiveVideoViewer');
      import('../components/SettingsDialog');
      import('../components/TaskStatusFloating');
      
      console.log('[LazyComponents] All components preloaded');
    });
  } else {
    // 降级方案：使用setTimeout
    setTimeout(() => {
      console.log('[LazyComponents] Preloading components (fallback)...');
      
      import('../components/GeneratePanel');
      import('../components/SeriesCreationPanel');
      import('../components/CommunityPanel');
      import('../components/ProfilePanel');
      import('../components/ImmersiveVideoViewer');
      import('../components/SettingsDialog');
      import('../components/TaskStatusFloating');
      
      console.log('[LazyComponents] All components preloaded');
    }, 2000);
  }
}

/**
 * 预加载特定组件
 */
export function preloadComponent(componentName: string) {
  console.log(`[LazyComponents] Preloading ${componentName}...`);
  
  switch (componentName) {
    case 'GeneratePanel':
      return import('../components/GeneratePanel');
    case 'SeriesCreationPanel':
      return import('../components/SeriesCreationPanel');
    case 'CommunityPanel':
      return import('../components/CommunityPanel');
    case 'ProfilePanel':
      return import('../components/ProfilePanel');
    case 'ImmersiveVideoViewer':
      return import('../components/ImmersiveVideoViewer');
    case 'SettingsDialog':
      return import('../components/SettingsDialog');
    case 'TaskStatusFloating':
      return import('../components/TaskStatusFloating');
    default:
      console.warn(`[LazyComponents] Unknown component: ${componentName}`);
      return Promise.resolve();
  }
}

/**
 * 根据tab预加载对应组件
 */
export function preloadByTab(tab: 'create' | 'series' | 'community' | 'profile') {
  const componentMap = {
    create: 'GeneratePanel',
    series: 'SeriesCreationPanel',
    community: 'CommunityPanel',
    profile: 'ProfilePanel',
  };
  
  const componentName = componentMap[tab];
  if (componentName) {
    preloadComponent(componentName);
  }
}

console.log('[LazyComponents] ✅ Lazy component loading configured');
