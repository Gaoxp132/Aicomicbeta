/**
 * 用户行为分析系统
 * 
 * 功能：
 * - 页面访问追踪
 * - 用户行为记录
 * - 转化漏斗分析
 * - 用户留存分析
 * - 性能指标收集
 * - 隐私友好（不收集敏感信息）
 */

// ==================== 类型定义 ====================

export type EventCategory = 
  | 'page_view'
  | 'user_action'
  | 'video_generation'
  | 'series_creation'
  | 'social_interaction'
  | 'error'
  | 'performance';

interface AnalyticsEvent {
  id: string;
  timestamp: number;
  category: EventCategory;
  action: string;
  label?: string;
  value?: number;
  metadata?: Record<string, any>;
  sessionId: string;
  userId?: string;
}

interface UserSession {
  id: string;
  startTime: number;
  lastActivityTime: number;
  pageViews: number;
  events: number;
  referrer: string;
  landingPage: string;
  deviceType: string;
  browser: string;
}

interface AnalyticsConfig {
  enabled: boolean;
  debug: boolean;
  sessionTimeout: number; // 毫秒
  batchSize: number;
  batchInterval: number; // 毫秒
  endpoint?: string;
}

interface ConversionFunnel {
  name: string;
  steps: string[];
  conversions: Map<string, number>;
}

// ==================== 用户分析系统 ====================

export class UserAnalytics {
  private config: AnalyticsConfig;
  private events: AnalyticsEvent[] = [];
  private session: UserSession | null = null;
  private batchTimer: number | null = null;
  private funnels: Map<string, ConversionFunnel> = new Map();
  private sessionId: string;
  private userId: string | null = null;

  constructor(config: Partial<AnalyticsConfig> = {}) {
    this.config = {
      enabled: true,
      debug: process.env.NODE_ENV === 'development',
      sessionTimeout: 30 * 60 * 1000, // 30分钟
      batchSize: 10,
      batchInterval: 30000, // 30秒
      ...config,
    };

    this.sessionId = this.getOrCreateSessionId();
    this.initializeSession();
    this.setupEventListeners();
    this.startBatchTimer();

    if (this.config.debug) {
      console.log('[Analytics] Initialized with config:', this.config);
    }
  }

  /**
   * 获取或创建会话ID
   */
  private getOrCreateSessionId(): string {
    const stored = sessionStorage.getItem('analytics_session_id');
    if (stored) {
      return stored;
    }
    
    const newId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    sessionStorage.setItem('analytics_session_id', newId);
    return newId;
  }

  /**
   * 初始化会话
   */
  private initializeSession() {
    this.session = {
      id: this.sessionId,
      startTime: Date.now(),
      lastActivityTime: Date.now(),
      pageViews: 0,
      events: 0,
      referrer: document.referrer,
      landingPage: window.location.pathname,
      deviceType: this.getDeviceType(),
      browser: this.getBrowser(),
    };

    // 从localStorage恢复用户ID
    const storedUserId = localStorage.getItem('analytics_user_id');
    if (storedUserId) {
      this.userId = storedUserId;
    }

    if (this.config.debug) {
      console.log('[Analytics] Session initialized:', this.session);
    }
  }

  /**
   * 设置用户ID
   */
  setUserId(userId: string) {
    this.userId = userId;
    localStorage.setItem('analytics_user_id', userId);
    
    if (this.config.debug) {
      console.log('[Analytics] User ID set:', userId);
    }
  }

  /**
   * 清除用户ID
   */
  clearUserId() {
    this.userId = null;
    localStorage.removeItem('analytics_user_id');
  }

  /**
   * 设置监听器
   */
  private setupEventListeners() {
    // 页面可见性变化
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.trackEvent('page_view', 'page_hidden');
        this.flush(); // 立即发送数据
      } else {
        this.trackEvent('page_view', 'page_visible');
      }
    });

    // 页面卸载
    window.addEventListener('beforeunload', () => {
      this.trackEvent('page_view', 'page_unload');
      this.flush();
    });

    // 点击事件
    document.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      
      // 追踪按钮点击
      if (target.tagName === 'BUTTON' || target.closest('button')) {
        const button = target.tagName === 'BUTTON' ? target : target.closest('button');
        const label = button?.getAttribute('aria-label') || button?.textContent?.trim() || 'unknown';
        this.trackEvent('user_action', 'button_click', label);
      }
      
      // 追踪链接点击
      if (target.tagName === 'A' || target.closest('a')) {
        const link = target.tagName === 'A' ? target : target.closest('a');
        const href = link?.getAttribute('href') || 'unknown';
        this.trackEvent('user_action', 'link_click', href);
      }
    }, true);

    // 滚动事件（节流）
    let scrollTimer: number | null = null;
    let maxScroll = 0;
    
    window.addEventListener('scroll', () => {
      const scrollPercent = (window.scrollY / (document.documentElement.scrollHeight - window.innerHeight)) * 100;
      maxScroll = Math.max(maxScroll, scrollPercent);
      
      if (scrollTimer) return;
      
      scrollTimer = window.setTimeout(() => {
        if (maxScroll > 25 && maxScroll < 50) {
          this.trackEvent('user_action', 'scroll_25');
        } else if (maxScroll > 50 && maxScroll < 75) {
          this.trackEvent('user_action', 'scroll_50');
        } else if (maxScroll > 75) {
          this.trackEvent('user_action', 'scroll_75');
        }
        scrollTimer = null;
      }, 1000);
    });
  }

  /**
   * 追踪事件
   */
  trackEvent(
    category: EventCategory,
    action: string,
    label?: string,
    value?: number,
    metadata?: Record<string, any>
  ) {
    if (!this.config.enabled) return;

    const event: AnalyticsEvent = {
      id: `event_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
      category,
      action,
      label,
      value,
      metadata,
      sessionId: this.sessionId,
      userId: this.userId || undefined,
    };

    this.events.push(event);

    // 更新会话
    if (this.session) {
      this.session.lastActivityTime = Date.now();
      this.session.events++;
    }

    if (this.config.debug) {
      console.log('[Analytics] Event tracked:', event);
    }

    // 达到批次大小立即发送
    if (this.events.length >= this.config.batchSize) {
      this.flush();
    }
  }

  /**
   * 追踪页面访问
   */
  trackPageView(path?: string, title?: string) {
    const pagePath = path || window.location.pathname;
    const pageTitle = title || document.title;

    this.trackEvent('page_view', 'page_visit', pagePath, undefined, {
      title: pageTitle,
      url: window.location.href,
    });

    if (this.session) {
      this.session.pageViews++;
    }

    if (this.config.debug) {
      console.log('[Analytics] Page view:', { path: pagePath, title: pageTitle });
    }
  }

  /**
   * 追踪视频生成
   */
  trackVideoGeneration(style: string, duration: number, success: boolean) {
    this.trackEvent(
      'video_generation',
      success ? 'generation_success' : 'generation_failure',
      style,
      duration,
      { style, duration, success }
    );
  }

  /**
   * 追踪连续剧创建
   */
  trackSeriesCreation(type: string, episodeCount: number, success: boolean) {
    this.trackEvent(
      'series_creation',
      success ? 'series_created' : 'series_failed',
      type,
      episodeCount,
      { type, episodeCount, success }
    );
  }

  /**
   * 追踪社交互动
   */
  trackSocialInteraction(action: 'like' | 'comment' | 'share', targetId: string) {
    this.trackEvent('social_interaction', action, targetId);
  }

  /**
   * 追踪错误
   */
  trackError(error: Error, context?: string) {
    this.trackEvent('error', 'error_occurred', context, undefined, {
      message: error.message,
      stack: error.stack?.substring(0, 500),
      context,
    });
  }

  /**
   * 追踪性能指标
   */
  trackPerformance(metric: string, value: number, unit: string = 'ms') {
    this.trackEvent('performance', metric, undefined, value, { unit });
  }

  /**
   * 定义转化漏斗
   */
  defineFunnel(name: string, steps: string[]) {
    this.funnels.set(name, {
      name,
      steps,
      conversions: new Map(),
    });

    if (this.config.debug) {
      console.log('[Analytics] Funnel defined:', { name, steps });
    }
  }

  /**
   * 追踪漏斗步骤
   */
  trackFunnelStep(funnelName: string, step: string) {
    const funnel = this.funnels.get(funnelName);
    if (!funnel) {
      console.warn(`[Analytics] Funnel not found: ${funnelName}`);
      return;
    }

    const stepIndex = funnel.steps.indexOf(step);
    if (stepIndex === -1) {
      console.warn(`[Analytics] Step not in funnel: ${step}`);
      return;
    }

    // 记录转化
    const current = funnel.conversions.get(step) || 0;
    funnel.conversions.set(step, current + 1);

    this.trackEvent('user_action', 'funnel_step', `${funnelName}:${step}`);

    if (this.config.debug) {
      console.log('[Analytics] Funnel step:', { funnelName, step, count: current + 1 });
    }
  }

  /**
   * 获取漏斗分析
   */
  getFunnelAnalysis(funnelName: string) {
    const funnel = this.funnels.get(funnelName);
    if (!funnel) return null;

    const analysis: any = {
      name: funnelName,
      steps: [],
      totalDropoff: 0,
    };

    let previousCount = 0;
    funnel.steps.forEach((step, index) => {
      const count = funnel.conversions.get(step) || 0;
      const conversionRate = index === 0 ? 100 : previousCount > 0 ? (count / previousCount) * 100 : 0;
      const dropoff = index === 0 ? 0 : previousCount - count;

      analysis.steps.push({
        step,
        count,
        conversionRate: conversionRate.toFixed(2) + '%',
        dropoff,
      });

      previousCount = count;
    });

    const firstCount = funnel.conversions.get(funnel.steps[0]) || 0;
    const lastCount = funnel.conversions.get(funnel.steps[funnel.steps.length - 1]) || 0;
    analysis.totalDropoff = firstCount - lastCount;
    analysis.overallConversion = firstCount > 0 ? ((lastCount / firstCount) * 100).toFixed(2) + '%' : '0%';

    return analysis;
  }

  /**
   * 获取会话信息
   */
  getSession(): UserSession | null {
    return this.session;
  }

  /**
   * 获取事件统计
   */
  getEventStats() {
    const stats: Record<string, number> = {};
    
    this.events.forEach(event => {
      const key = `${event.category}:${event.action}`;
      stats[key] = (stats[key] || 0) + 1;
    });

    return {
      total: this.events.length,
      byCategory: this.getEventsByCategory(),
      byAction: stats,
      session: this.session,
    };
  }

  /**
   * 按类别统计事件
   */
  private getEventsByCategory(): Record<EventCategory, number> {
    const stats: any = {};
    
    this.events.forEach(event => {
      stats[event.category] = (stats[event.category] || 0) + 1;
    });

    return stats;
  }

  /**
   * 启动批次定时器
   */
  private startBatchTimer() {
    if (this.batchTimer) {
      clearInterval(this.batchTimer);
    }

    this.batchTimer = window.setInterval(() => {
      if (this.events.length > 0) {
        this.flush();
      }
    }, this.config.batchInterval);
  }

  /**
   * 发送事件到服务器
   */
  private async flush() {
    if (this.events.length === 0) return;

    const eventsToSend = [...this.events];
    this.events = [];

    if (this.config.debug) {
      console.log('[Analytics] Flushing events:', eventsToSend.length);
    }

    if (!this.config.endpoint) {
      // 如果没有配置端点，只在控制台输出
      if (this.config.debug) {
        console.log('[Analytics] Events (no endpoint):', eventsToSend);
      }
      return;
    }

    try {
      await fetch(this.config.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          events: eventsToSend,
          session: this.session,
        }),
      });

      if (this.config.debug) {
        console.log('[Analytics] Events sent successfully');
      }
    } catch (error) {
      console.error('[Analytics] Failed to send events:', error);
      // 重新加入队列
      this.events.unshift(...eventsToSend);
    }
  }

  /**
   * 获取设备类型
   */
  private getDeviceType(): string {
    const ua = navigator.userAgent;
    if (/mobile/i.test(ua)) return 'mobile';
    if (/tablet|ipad/i.test(ua)) return 'tablet';
    return 'desktop';
  }

  /**
   * 获取浏览器
   */
  private getBrowser(): string {
    const ua = navigator.userAgent;
    if (ua.includes('Chrome')) return 'Chrome';
    if (ua.includes('Firefox')) return 'Firefox';
    if (ua.includes('Safari')) return 'Safari';
    if (ua.includes('Edge')) return 'Edge';
    return 'Other';
  }

  /**
   * 启用分析
   */
  enable() {
    this.config.enabled = true;
  }

  /**
   * 禁用分析
   */
  disable() {
    this.config.enabled = false;
  }

  /**
   * 清除所有数据
   */
  clear() {
    this.events = [];
    this.funnels.clear();
    sessionStorage.removeItem('analytics_session_id');
    
    if (this.config.debug) {
      console.log('[Analytics] Data cleared');
    }
  }

  /**
   * 销毁
   */
  destroy() {
    if (this.batchTimer) {
      clearInterval(this.batchTimer);
    }
    this.flush();
    this.clear();
  }
}

// ==================== 导出 ====================

export const analytics = new UserAnalytics({
  enabled: true,
  debug: process.env.NODE_ENV === 'development',
  // endpoint: '/make-server-fc31472c/analytics', // 可选：配置后端端点
});

// 便捷函数
export const trackPageView = (path?: string, title?: string) => 
  analytics.trackPageView(path, title);

export const trackEvent = (
  category: EventCategory,
  action: string,
  label?: string,
  value?: number,
  metadata?: Record<string, any>
) => analytics.trackEvent(category, action, label, value, metadata);

export const trackVideoGeneration = (style: string, duration: number, success: boolean) =>
  analytics.trackVideoGeneration(style, duration, success);

export const trackSeriesCreation = (type: string, episodeCount: number, success: boolean) =>
  analytics.trackSeriesCreation(type, episodeCount, success);

export const trackSocialInteraction = (action: 'like' | 'comment' | 'share', targetId: string) =>
  analytics.trackSocialInteraction(action, targetId);

export const trackError = (error: Error, context?: string) =>
  analytics.trackError(error, context);

export const trackPerformance = (metric: string, value: number, unit?: string) =>
  analytics.trackPerformance(metric, value, unit);

// 定义默认漏斗
analytics.defineFunnel('video_creation', [
  'landing',
  'create_panel_open',
  'parameters_set',
  'generation_started',
  'generation_complete',
  'video_viewed',
]);

analytics.defineFunnel('series_creation', [
  'landing',
  'series_panel_open',
  'series_info_filled',
  'episodes_generated',
  'series_published',
]);

console.log('[UserAnalytics] ✅ User analytics system loaded');
