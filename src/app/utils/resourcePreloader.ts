/**
 * 资源预加载优化器
 * 
 * 功能：
 * - 智能预加载关键资源
 * - DNS预解析
 * - 资源优先级管理
 * - 带宽自适应
 */

// ==================== 类型定义 ====================

export type ResourceType = 'script' | 'style' | 'font' | 'image' | 'video' | 'audio' | 'fetch' | 'document';
export type ResourcePriority = 'critical' | 'high' | 'medium' | 'low';

export interface PreloadOptions {
  type: ResourceType;
  priority?: ResourcePriority;
  crossOrigin?: 'anonymous' | 'use-credentials';
  as?: string;
  media?: string;
}

export interface PreconnectOptions {
  crossOrigin?: boolean;
}

// ==================== 资源预加载器 ====================

class ResourcePreloader {
  private preloadedResources: Set<string> = new Set();
  private preconnectedOrigins: Set<string> = new Set();
  private loadingResources: Map<string, Promise<any>> = new Map();

  /**
   * 预加载资源
   */
  preload(url: string, options: PreloadOptions): void {
    if (this.preloadedResources.has(url)) {
      console.log(`[ResourcePreloader] Already preloaded: ${url}`);
      return;
    }

    const link = document.createElement('link');
    link.rel = 'preload';
    link.href = url;
    link.as = options.as || this.getAsAttribute(options.type);

    // 设置优先级
    if (options.priority === 'critical') {
      link.setAttribute('importance', 'high');
    } else if (options.priority === 'low') {
      link.setAttribute('importance', 'low');
    }

    // 设置CORS
    if (options.crossOrigin) {
      link.crossOrigin = options.crossOrigin;
    }

    // 设置媒体查询
    if (options.media) {
      link.media = options.media;
    }

    document.head.appendChild(link);
    this.preloadedResources.add(url);

    console.log(`[ResourcePreloader] ⚡ Preloaded: ${url} (${options.type}, ${options.priority || 'normal'})`);
  }

  /**
   * 预连接到域名
   */
  preconnect(origin: string, options: PreconnectOptions = {}): void {
    if (this.preconnectedOrigins.has(origin)) {
      console.log(`[ResourcePreloader] Already preconnected: ${origin}`);
      return;
    }

    const link = document.createElement('link');
    link.rel = 'preconnect';
    link.href = origin;

    if (options.crossOrigin) {
      link.crossOrigin = 'anonymous';
    }

    document.head.appendChild(link);
    this.preconnectedOrigins.add(origin);

    console.log(`[ResourcePreloader] 🔗 Preconnected: ${origin}`);
  }

  /**
   * DNS预解析
   */
  dnsPrefetch(origin: string): void {
    const link = document.createElement('link');
    link.rel = 'dns-prefetch';
    link.href = origin;

    document.head.appendChild(link);

    console.log(`[ResourcePreloader] 🌐 DNS prefetched: ${origin}`);
  }

  /**
   * 预获取资源（低优先级）
   */
  prefetch(url: string): void {
    const link = document.createElement('link');
    link.rel = 'prefetch';
    link.href = url;

    document.head.appendChild(link);

    console.log(`[ResourcePreloader] 📦 Prefetched: ${url}`);
  }

  /**
   * 预渲染页面
   */
  prerender(url: string): void {
    const link = document.createElement('link');
    link.rel = 'prerender';
    link.href = url;

    document.head.appendChild(link);

    console.log(`[ResourcePreloader] 🎨 Prerendered: ${url}`);
  }

  /**
   * 批量预加载
   */
  preloadBatch(resources: Array<{ url: string; options: PreloadOptions }>): void {
    resources.forEach(({ url, options }) => {
      this.preload(url, options);
    });
  }

  /**
   * 预加载图片
   */
  preloadImage(url: string, priority: ResourcePriority = 'medium'): Promise<void> {
    // 检查是否已经在加载
    if (this.loadingResources.has(url)) {
      return this.loadingResources.get(url)!;
    }

    // 创建加载Promise
    const loadPromise = new Promise<void>((resolve, reject) => {
      const img = new Image();
      
      img.onload = () => {
        this.loadingResources.delete(url);
        console.log(`[ResourcePreloader] ✅ Image loaded: ${url}`);
        resolve();
      };
      
      img.onerror = () => {
        this.loadingResources.delete(url);
        console.error(`[ResourcePreloader] ❌ Image failed: ${url}`);
        reject(new Error(`Failed to load image: ${url}`));
      };
      
      img.src = url;
    });

    this.loadingResources.set(url, loadPromise);
    
    // 同时使用link标签预加载
    this.preload(url, { type: 'image', priority });

    return loadPromise;
  }

  /**
   * 批量预加载图片
   */
  async preloadImages(urls: string[], priority: ResourcePriority = 'medium'): Promise<void[]> {
    return Promise.all(urls.map(url => this.preloadImage(url, priority)));
  }

  /**
   * 预加载字体
   */
  preloadFont(url: string, crossOrigin: boolean = true): void {
    this.preload(url, {
      type: 'font',
      priority: 'high',
      crossOrigin: crossOrigin ? 'anonymous' : undefined,
    });
  }

  /**
   * 预加载脚本
   */
  async preloadScript(url: string, priority: ResourcePriority = 'medium'): Promise<void> {
    // 检查是否已经在加载
    if (this.loadingResources.has(url)) {
      return this.loadingResources.get(url)!;
    }

    // 创建加载Promise
    const loadPromise = new Promise<void>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = url;
      script.async = true;
      
      script.onload = () => {
        this.loadingResources.delete(url);
        console.log(`[ResourcePreloader] ✅ Script loaded: ${url}`);
        resolve();
      };
      
      script.onerror = () => {
        this.loadingResources.delete(url);
        console.error(`[ResourcePreloader] ❌ Script failed: ${url}`);
        reject(new Error(`Failed to load script: ${url}`));
      };
      
      document.head.appendChild(script);
    });

    this.loadingResources.set(url, loadPromise);
    
    // 同时使用link标签预加载
    this.preload(url, { type: 'script', priority });

    return loadPromise;
  }

  /**
   * 预加载样式
   */
  async preloadStyle(url: string, priority: ResourcePriority = 'high'): Promise<void> {
    // 检查是否已经在加载
    if (this.loadingResources.has(url)) {
      return this.loadingResources.get(url)!;
    }

    // 创建加载Promise
    const loadPromise = new Promise<void>((resolve, reject) => {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = url;
      
      link.onload = () => {
        this.loadingResources.delete(url);
        console.log(`[ResourcePreloader] ✅ Style loaded: ${url}`);
        resolve();
      };
      
      link.onerror = () => {
        this.loadingResources.delete(url);
        console.error(`[ResourcePreloader] ❌ Style failed: ${url}`);
        reject(new Error(`Failed to load style: ${url}`));
      };
      
      document.head.appendChild(link);
    });

    this.loadingResources.set(url, loadPromise);
    
    // 同时使用preload
    this.preload(url, { type: 'style', priority });

    return loadPromise;
  }

  /**
   * 根据网络状况智能预加载
   */
  smartPreload(url: string, options: PreloadOptions): void {
    const connection = (navigator as any).connection;
    
    // 如果不支持Network Information API，直接预加载
    if (!connection) {
      this.preload(url, options);
      return;
    }

    const { effectiveType, saveData } = connection;

    // 如果用户开启了省流量模式，只预加载critical资源
    if (saveData && options.priority !== 'critical') {
      console.log(`[ResourcePreloader] ⚠️ Save data enabled, skipping: ${url}`);
      return;
    }

    // 根据网络类型调整预加载策略
    if (effectiveType === 'slow-2g' || effectiveType === '2g') {
      // 2G网络：只预加载critical资源
      if (options.priority === 'critical') {
        this.preload(url, options);
      }
    } else if (effectiveType === '3g') {
      // 3G网络：预加载critical和high优先级资源
      if (options.priority === 'critical' || options.priority === 'high') {
        this.preload(url, options);
      }
    } else {
      // 4G及以上：预加载所有资源
      this.preload(url, options);
    }
  }

  /**
   * 获取as属性值
   */
  private getAsAttribute(type: ResourceType): string {
    const mapping: Record<ResourceType, string> = {
      script: 'script',
      style: 'style',
      font: 'font',
      image: 'image',
      video: 'video',
      audio: 'audio',
      fetch: 'fetch',
      document: 'document',
    };
    return mapping[type] || 'fetch';
  }

  /**
   * 清理已预加载的资源记录
   */
  clear(): void {
    this.preloadedResources.clear();
    this.loadingResources.clear();
    console.log('[ResourcePreloader] 🧹 Cleared all records');
  }

  /**
   * 获取统计信息
   */
  getStats() {
    return {
      preloadedCount: this.preloadedResources.size,
      loadingCount: this.loadingResources.size,
      preconnectedCount: this.preconnectedOrigins.size,
      preloadedResources: Array.from(this.preloadedResources),
      preconnectedOrigins: Array.from(this.preconnectedOrigins),
    };
  }
}

// ==================== 导出单例 ====================

export const resourcePreloader = new ResourcePreloader();

// ==================== 预设配置 ====================

/**
 * 预加载关键第三方域名
 */
export function preloadCriticalOrigins(): void {
  // Supabase
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  if (supabaseUrl) {
    const supabaseOrigin = new URL(supabaseUrl).origin;
    resourcePreloader.preconnect(supabaseOrigin, { crossOrigin: true });
  }

  // 火山引擎
  resourcePreloader.preconnect('https://ark.cn-beijing.volces.com', { crossOrigin: true });
  resourcePreloader.dnsPrefetch('https://ark.cn-beijing.volces.com');

  // 阿里云OSS（如果使用）
  if (import.meta.env.VITE_ALIYUN_OSS_BUCKET) {
    const ossOrigin = `https://${import.meta.env.VITE_ALIYUN_OSS_BUCKET}.${import.meta.env.VITE_ALIYUN_OSS_REGION}.aliyuncs.com`;
    resourcePreloader.preconnect(ossOrigin, { crossOrigin: true });
    resourcePreloader.dnsPrefetch(ossOrigin);
  }
}

/**
 * 预加载关键字体
 */
export function preloadCriticalFonts(): void {
  // 预加载系统使用的关键字体
  // 注意：实际字体URL需要根据项目配置
  const fonts = [
    // '/fonts/NotoSansSC-Regular.woff2',
    // '/fonts/NotoSansSC-Bold.woff2',
  ];

  fonts.forEach(font => {
    resourcePreloader.preloadFont(font, true);
  });
}

/**
 * 预加载首屏关键图片
 */
export function preloadCriticalImages(images: string[]): void {
  resourcePreloader.preloadImages(images, 'critical');
}

/**
 * 初始化资源预加载
 */
export function initializeResourcePreloading(): void {
  console.log('[ResourcePreloader] 🚀 Initializing...');

  // 预加载关键域名
  preloadCriticalOrigins();

  // 预加载关键字体
  preloadCriticalFonts();

  // 打印统计
  const stats = resourcePreloader.getStats();
  console.log('[ResourcePreloader] ✅ Initialized:', stats);
}

console.log('[ResourcePreloader] ✅ Resource preloader loaded');
