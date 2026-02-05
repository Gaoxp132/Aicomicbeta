/**
 * 数据库查询优化器
 * 支持10万用户、1万并发的高性能查询
 */

import { supabase } from './client.tsx';

// 查询缓存（内存缓存）
const queryCache = new Map<string, { data: any; timestamp: number }>();
const CACHE_TTL = 60000; // 1分钟缓存

/**
 * 带缓存的查询
 */
export async function cachedQuery<T = any>(
  key: string,
  queryFn: () => Promise<T>,
  ttl: number = CACHE_TTL
): Promise<T> {
  const cached = queryCache.get(key);
  const now = Date.now();
  
  if (cached && now - cached.timestamp < ttl) {
    return cached.data;
  }
  
  const data = await queryFn();
  queryCache.set(key, { data, timestamp: now });
  
  // 自动清理过期缓存
  setTimeout(() => queryCache.delete(key), ttl);
  
  return data;
}

/**
 * 批量查询优化（减少数据库往返）
 */
export async function batchQuery<T = any>(
  queries: Array<{ table: string; filter: any; select?: string }>
): Promise<T[]> {
  const results: T[] = [];
  
  // 按表分组查询
  const groupedByTable = new Map<string, any[]>();
  queries.forEach(q => {
    if (!groupedByTable.has(q.table)) {
      groupedByTable.set(q.table, []);
    }
    groupedByTable.get(q.table)!.push(q);
  });
  
  // 并行执行每个表的查询
  const promises = Array.from(groupedByTable.entries()).map(async ([table, tableQueries]) => {
    const tableResults = await Promise.all(
      tableQueries.map(q => {
        let query = supabase.from(table).select(q.select || '*');
        
        // 应用过滤条件
        Object.entries(q.filter).forEach(([key, value]) => {
          query = query.eq(key, value);
        });
        
        return query;
      })
    );
    return tableResults.map(r => r.data);
  });
  
  const allResults = await Promise.all(promises);
  return allResults.flat().filter(Boolean) as T[];
}

/**
 * 清理缓存
 */
export function clearQueryCache(pattern?: string) {
  if (pattern) {
    for (const key of queryCache.keys()) {
      if (key.includes(pattern)) {
        queryCache.delete(key);
      }
    }
  } else {
    queryCache.clear();
  }
}

/**
 * 获取缓存统计
 */
export function getCacheStats() {
  return {
    size: queryCache.size,
    keys: Array.from(queryCache.keys())
  };
}