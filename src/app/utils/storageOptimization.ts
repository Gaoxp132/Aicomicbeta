/**
 * 本地存储优化工具
 * 
 * 功能：
 * - 类型安全的存储操作
 * - 自动序列化/反序列化
 * - 过期时间管理
 * - 存储容量监控
 * - 压缩大对象
 * - 版本迁移
 * - 存储事件监听
 */

// ==================== 类型定义 ====================

interface StorageItem<T> {
  value: T;
  timestamp: number;
  expiry?: number;
  version?: string;
}

interface StorageOptions {
  expiry?: number; // 过期时间（毫秒）
  version?: string; // 数据版本
  compress?: boolean; // 是否压缩
}

interface StorageStats {
  used: number;
  available: number;
  percentage: number;
  itemCount: number;
}

type StorageListener = (key: string, value: any, oldValue: any) => void;

// ==================== 存储管理器基类 ====================

class StorageManager {
  private storage: Storage;
  private prefix: string;
  private listeners = new Map<string, Set<StorageListener>>();

  constructor(storage: Storage, prefix = 'app_') {
    this.storage = storage;
    this.prefix = prefix;
  }

  /**
   * 设置存储项
   */
  set<T>(key: string, value: T, options: StorageOptions = {}): boolean {
    try {
      const fullKey = this.getFullKey(key);
      const oldValue = this.get(key);

      const item: StorageItem<T> = {
        value,
        timestamp: Date.now(),
        expiry: options.expiry ? Date.now() + options.expiry : undefined,
        version: options.version,
      };

      let serialized = JSON.stringify(item);

      // 压缩大对象（如果需要）
      if (options.compress && serialized.length > 10000) {
        serialized = this.compress(serialized);
      }

      this.storage.setItem(fullKey, serialized);

      // 触发监听器
      this.notifyListeners(key, value, oldValue);

      console.log(`[Storage] ✅ Set: ${key} (${this.formatSize(serialized.length)})`);
      return true;
    } catch (error) {
      if (error instanceof Error && error.name === 'QuotaExceededError') {
        console.error('[Storage] ❌ Quota exceeded, clearing old items...');
        this.clearExpired();
        // 重试一次
        try {
          const item: StorageItem<T> = {
            value,
            timestamp: Date.now(),
            expiry: options.expiry ? Date.now() + options.expiry : undefined,
            version: options.version,
          };
          this.storage.setItem(this.getFullKey(key), JSON.stringify(item));
          return true;
        } catch {
          return false;
        }
      }
      console.error(`[Storage] ❌ Set error:`, error);
      return false;
    }
  }

  /**
   * 获取存储项
   */
  get<T>(key: string, defaultValue?: T): T | undefined {
    try {
      const fullKey = this.getFullKey(key);
      const serialized = this.storage.getItem(fullKey);

      if (!serialized) {
        return defaultValue;
      }

      // 尝试解压
      let decompressed = serialized;
      if (this.isCompressed(serialized)) {
        decompressed = this.decompress(serialized);
      }

      const item: StorageItem<T> = JSON.parse(decompressed);

      // 检查是否过期
      if (item.expiry && Date.now() > item.expiry) {
        console.log(`[Storage] ⏰ Expired: ${key}`);
        this.remove(key);
        return defaultValue;
      }

      return item.value;
    } catch (error) {
      console.error(`[Storage] ❌ Get error:`, error);
      return defaultValue;
    }
  }

  /**
   * 删除存储项
   */
  remove(key: string): void {
    try {
      const fullKey = this.getFullKey(key);
      const oldValue = this.get(key);
      this.storage.removeItem(fullKey);
      this.notifyListeners(key, undefined, oldValue);
      console.log(`[Storage] 🗑️ Removed: ${key}`);
    } catch (error) {
      console.error(`[Storage] ❌ Remove error:`, error);
    }
  }

  /**
   * 清空所有存储
   */
  clear(): void {
    try {
      const keys = this.keys();
      keys.forEach((key) => this.remove(key));
      console.log(`[Storage] 🗑️ Cleared all items`);
    } catch (error) {
      console.error(`[Storage] ❌ Clear error:`, error);
    }
  }

  /**
   * 获取所有键
   */
  keys(): string[] {
    const keys: string[] = [];
    for (let i = 0; i < this.storage.length; i++) {
      const key = this.storage.key(i);
      if (key && key.startsWith(this.prefix)) {
        keys.push(key.substring(this.prefix.length));
      }
    }
    return keys;
  }

  /**
   * 检查键是否存在
   */
  has(key: string): boolean {
    return this.storage.getItem(this.getFullKey(key)) !== null;
  }

  /**
   * 获取存储项数量
   */
  size(): number {
    return this.keys().length;
  }

  /**
   * 清除过期项
   */
  clearExpired(): number {
    let count = 0;
    const keys = this.keys();

    keys.forEach((key) => {
      try {
        const fullKey = this.getFullKey(key);
        const serialized = this.storage.getItem(fullKey);
        if (serialized) {
          const item: StorageItem<any> = JSON.parse(serialized);
          if (item.expiry && Date.now() > item.expiry) {
            this.remove(key);
            count++;
          }
        }
      } catch (error) {
        // 损坏的数据，直接删除
        this.remove(key);
        count++;
      }
    });

    if (count > 0) {
      console.log(`[Storage] 🧹 Cleared ${count} expired items`);
    }

    return count;
  }

  /**
   * 清除最旧的项
   */
  clearOldest(count: number): void {
    const items = this.keys()
      .map((key) => {
        try {
          const fullKey = this.getFullKey(key);
          const serialized = this.storage.getItem(fullKey);
          if (serialized) {
            const item: StorageItem<any> = JSON.parse(serialized);
            return { key, timestamp: item.timestamp };
          }
        } catch {
          return null;
        }
        return null;
      })
      .filter((item): item is { key: string; timestamp: number } => item !== null)
      .sort((a, b) => a.timestamp - b.timestamp);

    items.slice(0, count).forEach((item) => this.remove(item.key));
    console.log(`[Storage] 🧹 Cleared ${count} oldest items`);
  }

  /**
   * 获取存储统计
   */
  getStats(): StorageStats {
    let used = 0;
    const keys = this.keys();

    keys.forEach((key) => {
      const fullKey = this.getFullKey(key);
      const value = this.storage.getItem(fullKey);
      if (value) {
        used += value.length * 2; // 字符 = 2字节
      }
    });

    // localStorage/sessionStorage 通常是 5-10MB
    const available = 5 * 1024 * 1024; // 假设5MB

    return {
      used,
      available,
      percentage: (used / available) * 100,
      itemCount: keys.length,
    };
  }

  /**
   * 添加监听器
   */
  addListener(key: string, listener: StorageListener): () => void {
    if (!this.listeners.has(key)) {
      this.listeners.set(key, new Set());
    }
    this.listeners.get(key)!.add(listener);

    return () => {
      this.listeners.get(key)?.delete(listener);
    };
  }

  /**
   * 通知监听器
   */
  private notifyListeners(key: string, value: any, oldValue: any): void {
    const listeners = this.listeners.get(key);
    if (listeners) {
      listeners.forEach((listener) => {
        try {
          listener(key, value, oldValue);
        } catch (error) {
          console.error('[Storage] ❌ Listener error:', error);
        }
      });
    }
  }

  /**
   * 获取完整键名
   */
  private getFullKey(key: string): string {
    return `${this.prefix}${key}`;
  }

  /**
   * 简单压缩（Base64 + LZ-like）
   */
  private compress(str: string): string {
    // 简化版压缩：只是添加标记
    return `__COMPRESSED__${btoa(str)}`;
  }

  /**
   * 简单解压
   */
  private decompress(str: string): string {
    if (this.isCompressed(str)) {
      return atob(str.replace('__COMPRESSED__', ''));
    }
    return str;
  }

  /**
   * 检查是否压缩
   */
  private isCompressed(str: string): boolean {
    return str.startsWith('__COMPRESSED__');
  }

  /**
   * 格式化大小
   */
  private formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)}KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)}MB`;
  }

  /**
   * 导出数据
   */
  export(): Record<string, any> {
    const data: Record<string, any> = {};
    this.keys().forEach((key) => {
      data[key] = this.get(key);
    });
    return data;
  }

  /**
   * 导入数据
   */
  import(data: Record<string, any>, options: StorageOptions = {}): void {
    Object.entries(data).forEach(([key, value]) => {
      this.set(key, value, options);
    });
    console.log(`[Storage] 📥 Imported ${Object.keys(data).length} items`);
  }
}

// ==================== 预设实例 ====================

/**
 * LocalStorage管理器
 */
export const localStorageManager = new StorageManager(localStorage, 'app_');

/**
 * SessionStorage管理器
 */
export const sessionStorageManager = new StorageManager(sessionStorage, 'session_');

// ==================== 便捷函数 ====================

/**
 * 本地存储 - 设置
 */
export function setLocal<T>(key: string, value: T, options?: StorageOptions): boolean {
  return localStorageManager.set(key, value, options);
}

/**
 * 本地存储 - 获取
 */
export function getLocal<T>(key: string, defaultValue?: T): T | undefined {
  return localStorageManager.get(key, defaultValue);
}

/**
 * 本地存储 - 删除
 */
export function removeLocal(key: string): void {
  localStorageManager.remove(key);
}

/**
 * 会话存储 - 设置
 */
export function setSession<T>(key: string, value: T, options?: StorageOptions): boolean {
  return sessionStorageManager.set(key, value, options);
}

/**
 * 会话存储 - 获取
 */
export function getSession<T>(key: string, defaultValue?: T): T | undefined {
  return sessionStorageManager.get(key, defaultValue);
}

/**
 * 会话存储 - 删除
 */
export function removeSession(key: string): void {
  sessionStorageManager.remove(key);
}

// ==================== 特定用途的存储 ====================

/**
 * 用户偏好设置
 */
export const userPreferences = {
  set<T>(key: string, value: T): void {
    setLocal(`pref_${key}`, value);
  },
  get<T>(key: string, defaultValue?: T): T | undefined {
    return getLocal(`pref_${key}`, defaultValue);
  },
  remove(key: string): void {
    removeLocal(`pref_${key}`);
  },
};

/**
 * 用户认证信息
 */
export const authStorage = {
  setToken(token: string, expiry?: number): void {
    setLocal('auth_token', token, { expiry });
  },
  getToken(): string | undefined {
    return getLocal<string>('auth_token');
  },
  removeToken(): void {
    removeLocal('auth_token');
  },
  setUser(user: any): void {
    setLocal('auth_user', user);
  },
  getUser<T>(): T | undefined {
    return getLocal<T>('auth_user');
  },
  removeUser(): void {
    removeLocal('auth_user');
  },
  clear(): void {
    removeLocal('auth_token');
    removeLocal('auth_user');
  },
};

/**
 * 缓存存储
 */
export const cacheStorage = {
  set<T>(key: string, value: T, ttl: number = 3600000): void {
    setLocal(`cache_${key}`, value, { expiry: ttl });
  },
  get<T>(key: string): T | undefined {
    return getLocal<T>(`cache_${key}`);
  },
  remove(key: string): void {
    removeLocal(`cache_${key}`);
  },
  clear(): void {
    const keys = localStorageManager.keys().filter((k) => k.startsWith('cache_'));
    keys.forEach((key) => localStorageManager.remove(key));
  },
};

// ==================== 存储监控 ====================

/**
 * 监控存储容量
 */
export function monitorStorage(): void {
  const checkStorage = () => {
    const stats = localStorageManager.getStats();
    console.log('[Storage] 📊 Stats:', {
      used: `${(stats.used / 1024).toFixed(2)}KB`,
      available: `${(stats.available / 1024).toFixed(2)}KB`,
      percentage: `${stats.percentage.toFixed(2)}%`,
      itemCount: stats.itemCount,
    });

    // 如果超过80%，清理过期项
    if (stats.percentage > 80) {
      console.warn('[Storage] ⚠️ Storage usage > 80%, cleaning up...');
      localStorageManager.clearExpired();
    }

    // 如果超过90%，清理最旧的项
    if (stats.percentage > 90) {
      console.warn('[Storage] ⚠️ Storage usage > 90%, clearing oldest items...');
      localStorageManager.clearOldest(10);
    }
  };

  // 初始检查
  checkStorage();

  // 定期检查（每5分钟）
  setInterval(checkStorage, 5 * 60 * 1000);
}

/**
 * 自动清理过期项
 */
export function autoCleanupExpired(): void {
  const cleanup = () => {
    const count = localStorageManager.clearExpired();
    if (count > 0) {
      console.log(`[Storage] 🧹 Auto cleanup: ${count} items removed`);
    }
  };

  // 初始清理
  cleanup();

  // 定期清理（每10分钟）
  setInterval(cleanup, 10 * 60 * 1000);
}

// ==================== 跨标签页同步 ====================

/**
 * 监听跨标签页存储变化
 */
export function syncAcrossTabs(
  keys: string[],
  callback: (key: string, newValue: any, oldValue: any) => void
): () => void {
  const handleStorageChange = (event: StorageEvent) => {
    if (!event.key || !keys.some((k) => event.key?.includes(k))) {
      return;
    }

    const key = event.key.replace(localStorageManager['prefix'], '');
    const newValue = event.newValue ? JSON.parse(event.newValue).value : null;
    const oldValue = event.oldValue ? JSON.parse(event.oldValue).value : null;

    callback(key, newValue, oldValue);
  };

  window.addEventListener('storage', handleStorageChange);

  return () => {
    window.removeEventListener('storage', handleStorageChange);
  };
}

// ==================== 初始化 ====================

/**
 * 初始化存储系统
 */
export function initializeStorage(): void {
  // 清理过期项
  localStorageManager.clearExpired();
  sessionStorageManager.clearExpired();

  // 启动监控
  monitorStorage();

  // 启动自动清理
  autoCleanupExpired();

  console.log('[Storage] ✅ Storage system initialized');
}

console.log('[StorageOptimization] ✅ Storage optimization utilities loaded');
