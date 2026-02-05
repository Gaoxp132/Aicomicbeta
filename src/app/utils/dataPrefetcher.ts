/**
 * 数据预取服务
 * 
 * 功能：
 * - 智能预取用户可能需要的数据
 * - 预测式数据加载
 * - 后台数据同步
 * - 数据优先级管理
 */

import { cachedFetch } from './requestCache';
import { configManager } from './configManager';

// ==================== 类型定义 ====================

export type PrefetchPriority = 'critical' | 'high' | 'normal' | 'low';

export interface PrefetchTask {
  id: string;
  url: string;
  priority: PrefetchPriority;
  params?: Record<string, any>;
  cacheTime?: number;
  prefetchedAt?: number;
  status: 'pending' | 'fetching' | 'completed' | 'failed';
}

export interface PrefetchOptions {
  priority?: PrefetchPriority;
  params?: Record<string, any>;
  cacheTime?: number;
  force?: boolean;
}

// ==================== 数据预取器 ====================

class DataPrefetcher {
  private tasks: Map<string, PrefetchTask> = new Map();
  private queue: PrefetchTask[] = [];
  private isProcessing: boolean = false;
  private maxConcurrent: number = 3;
  private currentFetching: number = 0;

  constructor() {
    // 根据网络状况调整并发数
    this.adjustConcurrency();
  }

  /**
   * 添加预取任务
   */
  prefetch(url: string, options: PrefetchOptions = {}): void {
    const taskId = this.generateTaskId(url, options.params);

    // 如果任务已存在且不强制刷新，则跳过
    if (this.tasks.has(taskId) && !options.force) {
      const existingTask = this.tasks.get(taskId)!;
      if (existingTask.status === 'completed') {
        console.log(`[DataPrefetcher] Task already completed: ${url}`);
        return;
      }
    }

    const task: PrefetchTask = {
      id: taskId,
      url,
      priority: options.priority || 'normal',
      params: options.params,
      cacheTime: options.cacheTime || configManager.getPerformanceConfig().cacheMaxAge,
      status: 'pending',
    };

    this.tasks.set(taskId, task);
    this.queue.push(task);

    // 按优先级排序
    this.sortQueue();

    console.log(`[DataPrefetcher] ➕ Task added: ${url} (${task.priority})`);

    // 开始处理队列
    this.processQueue();
  }

  /**
   * 批量预取
   */
  prefetchBatch(requests: Array<{ url: string; options?: PrefetchOptions }>): void {
    requests.forEach(({ url, options }) => {
      this.prefetch(url, options);
    });
  }

  /**
   * 处理队列
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessing) {
      return;
    }

    this.isProcessing = true;

    while (this.queue.length > 0 && this.currentFetching < this.maxConcurrent) {
      const task = this.queue.shift();
      if (!task) break;

      // 启动预取任务
      this.currentFetching++;
      this.fetchTask(task).finally(() => {
        this.currentFetching--;
        // 继续处理队列
        if (this.queue.length > 0) {
          this.processQueue();
        }
      });
    }

    this.isProcessing = false;
  }

  /**
   * 执行预取任务
   */
  private async fetchTask(task: PrefetchTask): Promise<void> {
    try {
      task.status = 'fetching';
      console.log(`[DataPrefetcher] 🔄 Fetching: ${task.url}`);

      await cachedFetch(
        task.url,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        },
        task.cacheTime,
        task.params
      );

      task.status = 'completed';
      task.prefetchedAt = Date.now();
      console.log(`[DataPrefetcher] ✅ Completed: ${task.url}`);
    } catch (error) {
      task.status = 'failed';
      console.error(`[DataPrefetcher] ❌ Failed: ${task.url}`, error);
    }
  }

  /**
   * 按优先级排序队列
   */
  private sortQueue(): void {
    const priorityOrder: Record<PrefetchPriority, number> = {
      critical: 0,
      high: 1,
      normal: 2,
      low: 3,
    };

    this.queue.sort((a, b) => {
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });
  }

  /**
   * 生成任务ID
   */
  private generateTaskId(url: string, params?: Record<string, any>): string {
    const paramsStr = params ? JSON.stringify(params) : '';
    return `${url}:${paramsStr}`;
  }

  /**
   * 根据网络状况调整并发数
   */
  private adjustConcurrency(): void {
    const connection = (navigator as any).connection;
    if (!connection) return;

    const { effectiveType, downlink } = connection;

    if (effectiveType === 'slow-2g' || effectiveType === '2g') {
      this.maxConcurrent = 1;
    } else if (effectiveType === '3g') {
      this.maxConcurrent = 2;
    } else if (effectiveType === '4g' && downlink >= 10) {
      this.maxConcurrent = 5;
    } else {
      this.maxConcurrent = 3;
    }

    console.log(`[DataPrefetcher] 🌐 Concurrency adjusted to: ${this.maxConcurrent}`);
  }

  /**
   * 取消所有任务
   */
  cancelAll(): void {
    this.queue = [];
    this.tasks.clear();
    console.log('[DataPrefetcher] ❌ All tasks canceled');
  }

  /**
   * 取消指定任务
   */
  cancel(url: string, params?: Record<string, any>): void {
    const taskId = this.generateTaskId(url, params);
    const task = this.tasks.get(taskId);

    if (task && task.status === 'pending') {
      this.queue = this.queue.filter(t => t.id !== taskId);
      this.tasks.delete(taskId);
      console.log(`[DataPrefetcher] ❌ Task canceled: ${url}`);
    }
  }

  /**
   * 获取任务状态
   */
  getTaskStatus(url: string, params?: Record<string, any>): PrefetchTask | null {
    const taskId = this.generateTaskId(url, params);
    return this.tasks.get(taskId) || null;
  }

  /**
   * 获取统计信息
   */
  getStats() {
    const tasks = Array.from(this.tasks.values());
    return {
      total: tasks.length,
      pending: tasks.filter(t => t.status === 'pending').length,
      fetching: tasks.filter(t => t.status === 'fetching').length,
      completed: tasks.filter(t => t.status === 'completed').length,
      failed: tasks.filter(t => t.status === 'failed').length,
      queueLength: this.queue.length,
      currentFetching: this.currentFetching,
      maxConcurrent: this.maxConcurrent,
    };
  }

  /**
   * 清理已完成的任务
   */
  cleanup(olderThan: number = 5 * 60 * 1000): void {
    const now = Date.now();
    let cleaned = 0;

    for (const [id, task] of this.tasks.entries()) {
      if (
        task.status === 'completed' &&
        task.prefetchedAt &&
        now - task.prefetchedAt > olderThan
      ) {
        this.tasks.delete(id);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      console.log(`[DataPrefetcher] 🧹 Cleaned ${cleaned} old tasks`);
    }
  }
}

// ==================== 导出单例 ====================

export const dataPrefetcher = new DataPrefetcher();

// ==================== 预设预取策略 ====================

/**
 * 预取社区数据
 */
export function prefetchCommunityData(): void {
  console.log('[DataPrefetcher] 📦 Prefetching community data...');

  // 预取社区作品列表
  dataPrefetcher.prefetch('/api/community/works', {
    priority: 'high',
    params: {
      page: 1,
      pageSize: 20,
      sort: 'hot',
    },
  });

  // 预取热门剧集
  dataPrefetcher.prefetch('/api/community/series', {
    priority: 'normal',
    params: {
      page: 1,
      pageSize: 20,
      sort: 'hot',
    },
  });
}

/**
 * 预取用户数据
 */
export function prefetchUserData(userPhone: string): void {
  if (!userPhone) return;

  console.log('[DataPrefetcher] 👤 Prefetching user data...');

  // 预取用户作品
  dataPrefetcher.prefetch('/api/user/works', {
    priority: 'high',
    params: { userPhone },
  });

  // 预取用户剧集
  dataPrefetcher.prefetch('/api/user/series', {
    priority: 'normal',
    params: { userPhone },
  });

  // 预取用户点赞
  dataPrefetcher.prefetch('/api/user/likes', {
    priority: 'low',
    params: { userPhone },
  });
}

/**
 * 预取剧集详情
 */
export function prefetchSeriesDetail(seriesId: string): void {
  console.log(`[DataPrefetcher] 📺 Prefetching series detail: ${seriesId}`);

  // 预取剧集详情
  dataPrefetcher.prefetch(`/api/series/${seriesId}`, {
    priority: 'high',
  });

  // 预取剧集剧集列表
  dataPrefetcher.prefetch(`/api/series/${seriesId}/episodes`, {
    priority: 'normal',
  });

  // 预取剧集互动数据
  dataPrefetcher.prefetch(`/api/series/${seriesId}/interactions`, {
    priority: 'low',
  });
}

/**
 * 智能预取相关内容
 */
export function prefetchRelatedContent(currentWorkId: string): void {
  console.log(`[DataPrefetcher] 🔗 Prefetching related content for: ${currentWorkId}`);

  // 预取相关作品
  dataPrefetcher.prefetch('/api/works/related', {
    priority: 'normal',
    params: { workId: currentWorkId },
  });

  // 预取推荐作品
  dataPrefetcher.prefetch('/api/works/recommended', {
    priority: 'low',
    params: { workId: currentWorkId },
  });
}

/**
 * 预取下一页数据
 */
export function prefetchNextPage(endpoint: string, currentPage: number, pageSize: number = 20): void {
  console.log(`[DataPrefetcher] 📄 Prefetching next page: ${endpoint} page ${currentPage + 1}`);

  dataPrefetcher.prefetch(endpoint, {
    priority: 'low',
    params: {
      page: currentPage + 1,
      pageSize,
    },
  });
}

/**
 * 初始化数据预取
 */
export function initializeDataPrefetching(): void {
  console.log('[DataPrefetcher] 🚀 Initializing...');

  // 设置定期清理
  setInterval(() => {
    dataPrefetcher.cleanup();
  }, 5 * 60 * 1000); // 每5分钟清理一次

  // 监听网络状态变化
  if ((navigator as any).connection) {
    (navigator as any).connection.addEventListener('change', () => {
      console.log('[DataPrefetcher] 🌐 Network changed, adjusting strategy...');
      (dataPrefetcher as any).adjustConcurrency();
    });
  }

  console.log('[DataPrefetcher] ✅ Initialized');
}

console.log('[DataPrefetcher] ✅ Data prefetcher loaded');
