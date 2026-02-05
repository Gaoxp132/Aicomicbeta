import { supabase } from './client.tsx';
import { connectionPool } from './connection_pool.tsx';

// 🔥 CACHE BUSTER
export const HEALTH_MODULE_VERSION = 'v4.2.47_POOL_OPTIMIZE_2026-02-02';

/**
 * 获取当前北京时间（内联实现，避免模块导入问题）
 * @returns 北京时间的ISO字符串
 */
function getBeijingTime(): string {
  const now = new Date();
  // 转换为北京时间（UTC+8）
  const beijingTime = new Date(now.getTime() + (8 * 60 * 60 * 1000));
  return beijingTime.toISOString();
}

// ==================== 健康检查 ====================

export async function checkDatabaseHealth() {
  try {
    // 🆕 获取连接池统计
    const poolStats = connectionPool.getStats();
    
    // 测试查询
    const { data, error } = await supabase
      .from('users')
      .select('phone')
      .limit(1);

    if (error) throw error;

    return {
      status: 'ok',
      database: 'connected',
      // 🆕 添加连接池信息
      connectionPool: poolStats,
      timestamp: getBeijingTime(),
    };
  } catch (error: any) {
    console.error('Database health check failed:', error);
    
    // 检测是否是表不存在的错误
    const errorMessage = error.message || String(error);
    const isTableNotFound = 
      errorMessage.includes('relation') && errorMessage.includes('does not exist') ||
      errorMessage.includes('table') && errorMessage.includes('not found');

    return {
      status: 'error',
      database: 'disconnected',
      error: errorMessage,
      needsInitialization: isTableNotFound,
      errorType: isTableNotFound ? 'TABLE_NOT_FOUND' : 'UNKNOWN',
      help: isTableNotFound
        ? '数据库表未创建，请访问 Supabase SQL Editor 执行初始化脚本'
        : '数据库连接失败，请检查配置',
      timestamp: getBeijingTime(),
    };
  }
}