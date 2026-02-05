/**
 * 批处理优化工具
 * 
 * 功能：
 * - 数据库批量操作
 * - API批量调用
 * - 数据批量处理
 * - 自动合并相似请求
 * 
 * 目标：减少数据库往返次数，提升性能
 */

import { supabase } from '../database/client.tsx';

// ==================== 配置 ====================

const BATCH_CONFIG = {
  // 批量大小
  DEFAULT_BATCH_SIZE: 100,
  MAX_BATCH_SIZE: 1000,
  
  // 等待时间（毫秒）
  DEFAULT_WAIT_TIME: 50, // 50ms内的请求会被合并
  MAX_WAIT_TIME: 500,
  
  // 重试配置
  MAX_RETRIES: 3,
  RETRY_DELAY: 1000,
};

// ==================== 类型定义 ====================

interface BatchRequest<T> {
  id: string;
  data: T;
  resolve: (result: any) => void;
  reject: (error: Error) => void;
  timestamp: number;
}

// ==================== 批处理器基类 ====================

class BatchProcessor<TInput, TOutput> {
  private queue: BatchRequest<TInput>[] = [];
  private timer: NodeJS.Timeout | null = null;
  private processing = false;
  
  constructor(
    private processBatch: (items: TInput[]) => Promise<TOutput[]>,
    private options: {
      batchSize?: number;
      waitTime?: number;
      maxRetries?: number;
    } = {}
  ) {
    this.options = {
      batchSize: BATCH_CONFIG.DEFAULT_BATCH_SIZE,
      waitTime: BATCH_CONFIG.DEFAULT_WAIT_TIME,
      maxRetries: BATCH_CONFIG.MAX_RETRIES,
      ...options,
    };
  }

  /**
   * 添加任务到批处理队列
   */
  async add(data: TInput): Promise<TOutput> {
    return new Promise((resolve, reject) => {
      const id = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      this.queue.push({
        id,
        data,
        resolve,
        reject,
        timestamp: Date.now(),
      });

      // 如果队列已满，立即处理
      if (this.queue.length >= (this.options.batchSize || BATCH_CONFIG.DEFAULT_BATCH_SIZE)) {
        this.flush();
      } else {
        // 否则，设置延迟处理
        this.scheduleFlush();
      }
    });
  }

  /**
   * 调度刷新
   */
  private scheduleFlush(): void {
    if (this.timer) {
      return; // 已经有调度的刷新
    }

    this.timer = setTimeout(() => {
      this.flush();
    }, this.options.waitTime);
  }

  /**
   * 立即刷新队列
   */
  private async flush(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    if (this.processing || this.queue.length === 0) {
      return;
    }

    this.processing = true;

    // 取出当前队列
    const batch = this.queue.splice(0, this.queue.length);
    const items = batch.map(req => req.data);

    try {
      // 处理批量请求
      const results = await this.processBatch(items);

      // 返回结果
      batch.forEach((req, index) => {
        req.resolve(results[index]);
      });
    } catch (error) {
      // 批量失败，全部拒绝
      batch.forEach(req => {
        req.reject(error as Error);
      });
    } finally {
      this.processing = false;
      
      // 如果队列中还有任务，继续处理
      if (this.queue.length > 0) {
        this.scheduleFlush();
      }
    }
  }

  /**
   * 获取队列统计
   */
  getStats() {
    return {
      queueLength: this.queue.length,
      processing: this.processing,
    };
  }
}

// ==================== 数据库批处理器 ====================

/**
 * 批量插入
 */
export class BatchInserter<T> {
  private processor: BatchProcessor<T, any>;

  constructor(
    private tableName: string,
    options: {
      batchSize?: number;
      waitTime?: number;
    } = {}
  ) {
    this.processor = new BatchProcessor(
      async (items: T[]) => {
        const { data, error } = await supabase
          .from(tableName)
          .insert(items)
          .select();

        if (error) {
          throw new Error(`Batch insert failed: ${error.message}`);
        }

        return data || [];
      },
      options
    );
  }

  async insert(item: T): Promise<any> {
    return this.processor.add(item);
  }

  getStats() {
    return this.processor.getStats();
  }
}

/**
 * 批量更新
 */
export class BatchUpdater<T extends { id: string }> {
  private processor: BatchProcessor<T, any>;

  constructor(
    private tableName: string,
    options: {
      batchSize?: number;
      waitTime?: number;
    } = {}
  ) {
    this.processor = new BatchProcessor(
      async (items: T[]) => {
        // Supabase不支持批量更新，所以我们并行更新
        const results = await Promise.all(
          items.map(async (item) => {
            const { id, ...updates } = item;
            const { data, error } = await supabase
              .from(tableName)
              .update(updates)
              .eq('id', id)
              .select()
              .single();

            if (error) {
              throw new Error(`Update failed for id ${id}: ${error.message}`);
            }

            return data;
          })
        );

        return results;
      },
      options
    );
  }

  async update(item: T): Promise<any> {
    return this.processor.add(item);
  }

  getStats() {
    return this.processor.getStats();
  }
}

/**
 * 批量查询
 */
export class BatchFetcher<T> {
  private processor: BatchProcessor<string, T>;

  constructor(
    private tableName: string,
    private idColumn: string = 'id',
    options: {
      batchSize?: number;
      waitTime?: number;
    } = {}
  ) {
    this.processor = new BatchProcessor(
      async (ids: string[]) => {
        const { data, error } = await supabase
          .from(tableName)
          .select('*')
          .in(idColumn, ids);

        if (error) {
          throw new Error(`Batch fetch failed: ${error.message}`);
        }

        // 按请求顺序返回结果
        return ids.map(id => 
          data?.find((item: any) => item[idColumn] === id) || null
        );
      },
      options
    );
  }

  async fetch(id: string): Promise<T> {
    return this.processor.add(id);
  }

  getStats() {
    return this.processor.getStats();
  }
}

// ==================== DataLoader模式实现 ====================

/**
 * DataLoader - 解决N+1查询问题
 * 自动批量化和缓存数据库查询
 */
export class DataLoader<K, V> {
  private cache: Map<K, Promise<V>> = new Map();
  private queue: Array<{
    key: K;
    resolve: (value: V) => void;
    reject: (error: Error) => void;
  }> = [];
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private batchLoadFn: (keys: K[]) => Promise<V[]>,
    private options: {
      cacheEnabled?: boolean;
      batchSize?: number;
      waitTime?: number;
    } = {}
  ) {
    this.options = {
      cacheEnabled: true,
      batchSize: BATCH_CONFIG.DEFAULT_BATCH_SIZE,
      waitTime: BATCH_CONFIG.DEFAULT_WAIT_TIME,
      ...options,
    };
  }

  /**
   * 加载单个值
   */
  async load(key: K): Promise<V> {
    // 检查缓存
    if (this.options.cacheEnabled && this.cache.has(key)) {
      return this.cache.get(key)!;
    }

    // 创建Promise并加入队列
    const promise = new Promise<V>((resolve, reject) => {
      this.queue.push({ key, resolve, reject });

      // 如果队列已满，立即处理
      if (this.queue.length >= (this.options.batchSize || BATCH_CONFIG.DEFAULT_BATCH_SIZE)) {
        this.dispatch();
      } else {
        // 否则，设置延迟处理
        this.scheduleDispatch();
      }
    });

    // 缓存Promise
    if (this.options.cacheEnabled) {
      this.cache.set(key, promise);
    }

    return promise;
  }

  /**
   * 批量加载
   */
  async loadMany(keys: K[]): Promise<V[]> {
    return Promise.all(keys.map(key => this.load(key)));
  }

  /**
   * 调度分发
   */
  private scheduleDispatch(): void {
    if (this.timer) {
      return;
    }

    this.timer = setTimeout(() => {
      this.dispatch();
    }, this.options.waitTime);
  }

  /**
   * 立即分发
   */
  private async dispatch(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    if (this.queue.length === 0) {
      return;
    }

    // 取出当前队列
    const batch = this.queue.splice(0, this.queue.length);
    const keys = batch.map(item => item.key);

    try {
      // 批量加载
      const values = await this.batchLoadFn(keys);

      // 返回结果
      batch.forEach((item, index) => {
        item.resolve(values[index]);
      });
    } catch (error) {
      // 批量失败，全部拒绝
      batch.forEach(item => {
        item.reject(error as Error);
        
        // 清除缓存
        if (this.options.cacheEnabled) {
          this.cache.delete(item.key);
        }
      });
    }
  }

  /**
   * 清除缓存
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * 清除单个缓存
   */
  clearKey(key: K): void {
    this.cache.delete(key);
  }

  /**
   * 预加载
   */
  prime(key: K, value: V): void {
    if (this.options.cacheEnabled) {
      this.cache.set(key, Promise.resolve(value));
    }
  }
}

// ==================== 创建常用的批处理器实例 ====================

// 作品批量插入器
export const worksBatchInserter = new BatchInserter('works', {
  batchSize: 50,
  waitTime: 100,
});

// 点赞批量插入器
export const likesBatchInserter = new BatchInserter('likes', {
  batchSize: 100,
  waitTime: 50,
});

// 评论批量插入器
export const commentsBatchInserter = new BatchInserter('comments', {
  batchSize: 100,
  waitTime: 50,
});

// 视频任务批量更新器
export const videoTasksBatchUpdater = new BatchUpdater<{ id: string; [key: string]: any }>('video_tasks', {
  batchSize: 50,
  waitTime: 100,
});

// ==================== DataLoader实例 ====================

/**
 * 作品DataLoader - 解决N+1查询问题
 */
export const worksDataLoader = new DataLoader<string, any>(
  async (ids: string[]) => {
    const { data, error } = await supabase
      .from('works')
      .select('*')
      .in('id', ids);

    if (error) {
      throw new Error(`Failed to load works: ${error.message}`);
    }

    // 按请求顺序返回结果
    return ids.map(id => data?.find(item => item.id === id) || null);
  },
  { batchSize: 100, waitTime: 50 }
);

/**
 * 用户DataLoader
 */
export const usersDataLoader = new DataLoader<string, any>(
  async (phones: string[]) => {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .in('phone', phones);

    if (error) {
      throw new Error(`Failed to load users: ${error.message}`);
    }

    // 按请求顺序返回结果
    return phones.map(phone => data?.find(item => item.phone === phone) || null);
  },
  { batchSize: 100, waitTime: 50 }
);

/**
 * 剧集DataLoader
 */
export const seriesDataLoader = new DataLoader<string, any>(
  async (ids: string[]) => {
    const { data, error } = await supabase
      .from('series')
      .select('*')
      .in('id', ids);

    if (error) {
      throw new Error(`Failed to load series: ${error.message}`);
    }

    // 按请求顺序返回结果
    return ids.map(id => data?.find(item => item.id === id) || null);
  },
  { batchSize: 100, waitTime: 50 }
);

// ==================== 工具函数 ====================

/**
 * 数组分批处理
 */
export async function processBatches<T, R>(
  items: T[],
  batchSize: number,
  processor: (batch: T[]) => Promise<R[]>
): Promise<R[]> {
  const results: R[] = [];
  
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await processor(batch);
    results.push(...batchResults);
  }
  
  return results;
}

/**
 * 并行批处理
 */
export async function processBatchesParallel<T, R>(
  items: T[],
  batchSize: number,
  concurrency: number,
  processor: (batch: T[]) => Promise<R[]>
): Promise<R[]> {
  const batches: T[][] = [];
  
  // 分批
  for (let i = 0; i < items.length; i += batchSize) {
    batches.push(items.slice(i, i + batchSize));
  }
  
  // 并行处理
  const results: R[] = [];
  for (let i = 0; i < batches.length; i += concurrency) {
    const concurrentBatches = batches.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      concurrentBatches.map(batch => processor(batch))
    );
    results.push(...batchResults.flat());
  }
  
  return results;
}

console.log('[BatchProcessor] ✅ Batch processor initialized');
console.log('[BatchProcessor] 🚀 Config:', BATCH_CONFIG);