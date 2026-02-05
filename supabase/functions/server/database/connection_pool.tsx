/**
 * 数据库连接池配置
 * 优化高并发场景下的数据库连接管理
 * 
 * 目标：支持10,000并发用户
 * v4.2.47: 优化连接池配置 - 减少不必要的健康检查警告
 */

import { createClient } from 'jsr:@supabase/supabase-js@2';

// 连接池配置
const POOL_CONFIG = {
  // 最大连接数（Supabase Pro支持最多500个连接）
  maxConnections: 400,
  
  // 🔧 最小空闲连接数（降低到10，减少不必要的预热连接）
  minConnections: 10,
  
  // 连接超时（毫秒）- 从10秒减少到5秒，快速失败
  connectionTimeout: 5000,
  
  // 🔧 空闲连接超时（毫秒）- 从15秒增加到5分钟，减少频繁重建
  idleTimeout: 300000, // 5分钟
  
  // 查询超时（毫秒）- 从30秒减少到15秒
  statementTimeout: 15000,
  
  // 🔧 健康检查间隔（毫秒）- 从30秒增加到2分钟
  healthCheckInterval: 120000, // 2分钟
  
  // 🆕 连接重试次数
  maxRetries: 3,
  
  // 🆕 重试延迟（毫秒）
  retryDelay: 100,
};

/**
 * 连接池管理器
 */
class ConnectionPool {
  private clients: Map<string, any> = new Map();
  private activeConnections = 0;
  private waitQueue: Array<{
    resolve: (client: any) => void;
    reject: (error: Error) => void;
    timestamp: number;
  }> = [];
  
  // 🆕 连接健康状态追踪
  private connectionHealth: Map<string, {
    lastUsed: number;
    errorCount: number;
  }> = new Map();
  
  // 🆕 统计信息
  private stats = {
    totalAcquires: 0,
    totalReleases: 0,
    totalTimeouts: 0,
    totalErrors: 0,
    avgAcquireTime: 0,
  };
  
  constructor() {
    // 🆕 启动时预热连接池
    this.warmup().catch(err => {
      console.error('[ConnectionPool] ❌ Warmup failed:', err);
    });
    
    // 🆕 定期健康检查
    this.startHealthCheck();
  }

  /**
   * 🆕 预热连接池 - 启动时创建最小连接数
   */
  private async warmup(): Promise<void> {
    console.log(`[ConnectionPool] 🔥 Warming up connection pool (target: ${POOL_CONFIG.minConnections} connections)...`);
    const startTime = Date.now();
    
    const warmupPromises: Promise<void>[] = [];
    
    for (let i = 0; i < POOL_CONFIG.minConnections; i++) {
      warmupPromises.push(
        (async () => {
          try {
            const client = this.createClient();
            const key = `warmup-${i}-${Date.now()}`;
            this.clients.set(key, client);
            this.connectionHealth.set(key, {
              lastUsed: Date.now(),
              errorCount: 0,
            });
          } catch (error) {
            console.error(`[ConnectionPool] ❌ Failed to create warmup connection ${i}:`, error);
          }
        })()
      );
    }
    
    await Promise.all(warmupPromises);
    
    const duration = Date.now() - startTime;
    console.log(`[ConnectionPool] ✅ Warmup complete: ${this.clients.size}/${POOL_CONFIG.minConnections} connections in ${duration}ms`);
  }
  
  /**
   * 🆕 健康检查 - 定期验证连接可用性
   */
  private startHealthCheck(): void {
    setInterval(async () => {
      const now = Date.now();
      const keysToRemove: string[] = [];
      
      // 检查空闲连接是否超时
      for (const [key, client] of this.clients.entries()) {
        const health = this.connectionHealth.get(key);
        if (!health) continue;
        
        const idleTime = now - health.lastUsed;
        
        // 移除超时或错误过多的连接
        if (idleTime > POOL_CONFIG.idleTimeout || health.errorCount > 3) {
          keysToRemove.push(key);
          console.log(`[ConnectionPool] 🗑️ Removing unhealthy connection: ${key} (idle: ${idleTime}ms, errors: ${health.errorCount})`);
        }
      }
      
      // 移除不健康的连接
      for (const key of keysToRemove) {
        this.clients.delete(key);
        this.connectionHealth.delete(key);
      }
      
      // 如果连接数低于最小值，补充新连接
      const deficit = POOL_CONFIG.minConnections - this.clients.size;
      if (deficit > 0) {
        console.log(`[ConnectionPool] 🔧 Replenishing ${deficit} connections...`);
        for (let i = 0; i < deficit; i++) {
          try {
            const client = this.createClient();
            const key = `replenish-${Date.now()}-${i}`;
            this.clients.set(key, client);
            this.connectionHealth.set(key, {
              lastUsed: Date.now(),
              errorCount: 0,
            });
          } catch (error) {
            console.error('[ConnectionPool] ❌ Failed to replenish connection:', error);
          }
        }
      }
    }, POOL_CONFIG.healthCheckInterval);
  }

  /**
   * 获取数据库连接（带重试机制）
   */
  async acquire(): Promise<any> {
    const startTime = Date.now();
    this.stats.totalAcquires++;
    
    for (let attempt = 0; attempt < POOL_CONFIG.maxRetries; attempt++) {
      try {
        const client = await this._acquireInternal();
        
        // 更新统计
        const acquireTime = Date.now() - startTime;
        this.stats.avgAcquireTime = (this.stats.avgAcquireTime * 0.9) + (acquireTime * 0.1);
        
        return client;
      } catch (error) {
        console.error(`[ConnectionPool] ❌ Acquire attempt ${attempt + 1}/${POOL_CONFIG.maxRetries} failed:`, error);
        
        if (attempt < POOL_CONFIG.maxRetries - 1) {
          // 等待后重试
          await new Promise(resolve => setTimeout(resolve, POOL_CONFIG.retryDelay * (attempt + 1)));
        } else {
          this.stats.totalErrors++;
          throw error;
        }
      }
    }
    
    throw new Error('Failed to acquire connection after all retries');
  }
  
  /**
   * 内部获取连接逻辑
   */
  private async _acquireInternal(): Promise<any> {
    // 如果有空闲连接，直接返回
    if (this.clients.size > 0) {
      const [key, client] = this.clients.entries().next().value;
      this.clients.delete(key);
      this.activeConnections++;
      
      // 更新健康状态
      const health = this.connectionHealth.get(key);
      if (health) {
        health.lastUsed = Date.now();
      }
      
      return client;
    }

    // 如果未达到最大连接数，创建新连接
    if (this.activeConnections < POOL_CONFIG.maxConnections) {
      const client = this.createClient();
      this.activeConnections++;
      return client;
    }

    // 否则，等待可用连接
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        const index = this.waitQueue.findIndex(item => item.resolve === resolve);
        if (index !== -1) {
          this.waitQueue.splice(index, 1);
          this.stats.totalTimeouts++;
          reject(new Error(`Connection pool timeout after ${POOL_CONFIG.connectionTimeout}ms: no available connections`));
        }
      }, POOL_CONFIG.connectionTimeout);

      this.waitQueue.push({
        resolve: (client) => {
          clearTimeout(timeoutId);
          resolve(client);
        },
        reject,
        timestamp: Date.now(),
      });
    });
  }

  /**
   * 释放数据库连接
   */
  release(client: any, hadError = false): void {
    this.activeConnections--;
    this.stats.totalReleases++;

    // 如果有等待的请求，直接分配给它
    if (this.waitQueue.length > 0) {
      const waiter = this.waitQueue.shift()!;
      this.activeConnections++;
      waiter.resolve(client);
      return;
    }

    // 否则，放回连接池
    if (this.clients.size < POOL_CONFIG.minConnections) {
      const key = `conn-${Date.now()}-${Math.random()}`;
      this.clients.set(key, client);
      
      // 记录健康状态
      this.connectionHealth.set(key, {
        lastUsed: Date.now(),
        errorCount: hadError ? 1 : 0,
      });
    }
  }

  /**
   * 创建新的数据库客户端（优化配置）
   */
  private createClient(): any {
    return createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
        db: {
          schema: 'public',
        },
        global: {
          headers: {
            'x-connection-pool': 'true',
            'Connection': 'keep-alive',
          },
        },
        // 🆕 添加fetch配置优化
        realtime: {
          params: {
            eventsPerSecond: 10,
          },
        },
      }
    );
  }

  /**
   * 获取连接池统计信息（增强版）
   */
  getStats() {
    return {
      activeConnections: this.activeConnections,
      idleConnections: this.clients.size,
      waitingRequests: this.waitQueue.length,
      totalCapacity: POOL_CONFIG.maxConnections,
      utilization: `${((this.activeConnections / POOL_CONFIG.maxConnections) * 100).toFixed(2)}%`,
      // 🆕 新增统计
      totalAcquires: this.stats.totalAcquires,
      totalReleases: this.stats.totalReleases,
      totalTimeouts: this.stats.totalTimeouts,
      totalErrors: this.stats.totalErrors,
      avgAcquireTime: `${this.stats.avgAcquireTime.toFixed(2)}ms`,
      healthyConnections: this.clients.size - Array.from(this.connectionHealth.values()).filter(h => h.errorCount > 0).length,
    };
  }

  /**
   * 清空连接池
   */
  async drain(): Promise<void> {
    this.clients.clear();
    this.activeConnections = 0;
    
    // 拒绝所有等待的请求
    for (const waiter of this.waitQueue) {
      waiter.reject(new Error('Connection pool is being drained'));
    }
    this.waitQueue = [];
  }
}

// 创建全局连接池实例
export const connectionPool = new ConnectionPool();

/**
 * 执行数据库查询（使用连接池）
 */
export async function withConnection<T>(
  callback: (client: any) => Promise<T>
): Promise<T> {
  const client = await connectionPool.acquire();
  
  try {
    const result = await callback(client);
    return result;
  } finally {
    connectionPool.release(client);
  }
}

/**
 * 批量执行查询（事务）
 */
export async function withTransaction<T>(
  queries: Array<(client: any) => Promise<any>>
): Promise<T[]> {
  const client = await connectionPool.acquire();
  
  try {
    // Supabase不直接支持事务，但我们可以顺序执行
    const results: T[] = [];
    
    for (const query of queries) {
      const result = await query(client);
      results.push(result);
    }
    
    return results;
  } catch (error) {
    // 如果有错误，记录但不回滚（Supabase限制）
    console.error('[ConnectionPool] Transaction error:', error);
    throw error;
  } finally {
    connectionPool.release(client);
  }
}

// 定期清理过期的等待请求
setInterval(() => {
  const now = Date.now();
  const pool = connectionPool as any;
  
  pool.waitQueue = pool.waitQueue.filter((waiter: any) => {
    const age = now - waiter.timestamp;
    if (age > POOL_CONFIG.connectionTimeout) {
      waiter.reject(new Error('Connection request timeout'));
      return false;
    }
    return true;
  });
}, 5000); // 每5秒清理一次

// 定期报告连接池状态
setInterval(() => {
  const stats = connectionPool.getStats();
  if (stats.activeConnections > 0 || stats.waitingRequests > 0) {
    console.log('[ConnectionPool] Stats:', JSON.stringify(stats));
  }
}, 60000); // 每分钟报告一次

console.log('[ConnectionPool] ✅ Connection pool initialized');
console.log('[ConnectionPool] 🚀 Config:', POOL_CONFIG);