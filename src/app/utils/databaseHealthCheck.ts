/**
 * 数据库健康检查工具
 * 
 * 用于启动时检查数据库连接和表结构
 */

interface HealthCheckResult {
  isHealthy: boolean;
  message: string;
  details?: {
    tablesExist: boolean;
    indexesExist: boolean;
    canQuery: boolean;
  };
}

/**
 * 获取Supabase配置（避免导入受保护文件）
 */
function getSupabaseConfig() {
  // 从环境变量或window对象获取配置
  if (typeof window !== 'undefined' && (window as any).__SUPABASE_CONFIG__) {
    return (window as any).__SUPABASE_CONFIG__;
  }
  
  // 默认配置（开发环境）
  return {
    projectId: import.meta.env.VITE_SUPABASE_PROJECT_ID || '',
    publicAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY || '',
  };
}

/**
 * 检查数据库健康状态
 */
export async function checkDatabaseHealth(): Promise<HealthCheckResult> {
  try {
    console.log('[DatabaseHealth] 🔍 开始数据库健康检查...');
    
    const { projectId, publicAnonKey } = getSupabaseConfig();
    
    if (!projectId || !publicAnonKey) {
      console.warn('[DatabaseHealth] ⚠️ Supabase配置未找到，跳过健康检查');
      return {
        isHealthy: false,
        message: 'Supabase配置未找到',
      };
    }
    
    // 尝试一个简单的查询来测试连接
    const url = `https://${projectId}.supabase.co/functions/v1/make-server-fc31472c/health/database`;
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${publicAnonKey}`,
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(5000), // 5秒超时
    });
    
    if (response.ok) {
      const data = await response.json();
      
      if (data.success) {
        console.log('[DatabaseHealth] ✅ 数据库连接正常');
        console.log('[DatabaseHealth] 📊 表状态:', data.tables || '正常');
        
        return {
          isHealthy: true,
          message: '数据库连接正常',
          details: data.details,
        };
      } else {
        console.warn('[DatabaseHealth] ⚠️ 数据库响应异常:', data.message);
        
        return {
          isHealthy: false,
          message: data.message || '数据库响应异常',
        };
      }
    } else {
      console.error('[DatabaseHealth] ❌ 数据库连接失败:', response.status);
      
      return {
        isHealthy: false,
        message: `数据库连接失败: HTTP ${response.status}`,
      };
    }
  } catch (error: any) {
    console.error('[DatabaseHealth] ❌ 数据库健康检查失败:', error);
    
    // 数据库连接失败不应该阻止应用启动，只记录警告
    return {
      isHealthy: false,
      message: error.message || '无法连接到数据库',
    };
  }
}

/**
 * 检查必需的表是否存在
 */
export async function checkRequiredTables(): Promise<{
  allExist: boolean;
  missingTables: string[];
}> {
  const requiredTables = [
    'users',
    'works_refactored',
    'video_tasks',
    'likes',
    'comments',
    'series',
    'series_episodes',
    'series_storyboards',
  ];
  
  try {
    console.log('[DatabaseHealth] 🔍 检查必需的表...');
    
    const { projectId, publicAnonKey } = getSupabaseConfig();
    
    if (!projectId || !publicAnonKey) {
      console.warn('[DatabaseHealth] ⚠️ Supabase配置未找到，跳过表检查');
      return {
        allExist: false,
        missingTables: requiredTables,
      };
    }
    
    const url = `https://${projectId}.supabase.co/functions/v1/make-server-fc31472c/health/tables`;
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${publicAnonKey}`,
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(5000),
    });
    
    if (response.ok) {
      const data = await response.json();
      
      if (data.success && data.tables) {
        const existingTables = new Set(data.tables);
        const missingTables = requiredTables.filter(
          table => !existingTables.has(table)
        );
        
        if (missingTables.length === 0) {
          console.log('[DatabaseHealth] ✅ 所有必需的表都存在');
          return {
            allExist: true,
            missingTables: [],
          };
        } else {
          console.warn('[DatabaseHealth] ⚠️ 缺失的表:', missingTables);
          return {
            allExist: false,
            missingTables,
          };
        }
      }
    }
    
    // 如果检查失败，假设表不存在
    console.warn('[DatabaseHealth] ⚠️ 无法检查表状态');
    return {
      allExist: false,
      missingTables: requiredTables,
    };
  } catch (error) {
    console.error('[DatabaseHealth] ❌ 检查表失败:', error);
    return {
      allExist: false,
      missingTables: requiredTables,
    };
  }
}

/**
 * 显示数据库迁移提示
 */
export function showMigrationHint() {
  console.log('');
  console.log('========================================');
  console.log('📋 数据库迁移指南');
  console.log('========================================');
  console.log('');
  console.log('请在Supabase Dashboard中执行以下SQL文件：');
  console.log('');
  console.log('1️⃣ /supabase/migrations/00_CREATE_BASE_TABLES.sql');
  console.log('   创建所有基础表结构');
  console.log('');
  console.log('2️⃣ /supabase/migrations/CREATE_PERFORMANCE_INDEXES.sql');
  console.log('   创建性能优化索引');
  console.log('');
  console.log('详细指南请查看：');
  console.log('📖 /supabase/migrations/QUICK_START.md');
  console.log('');
  console.log('========================================');
  console.log('');
}

/**
 * 在应用启动时执行的完整健康检查
 */
export async function performStartupHealthCheck() {
  console.log('');
  console.log('========================================');
  console.log('🏥 启动数据库健康检查');
  console.log('========================================');
  console.log('');
  
  // 检查数据库连接
  const healthResult = await checkDatabaseHealth();
  
  if (!healthResult.isHealthy) {
    console.warn('[DatabaseHealth] ⚠️ 数据库健康检查未通过');
    console.warn('[DatabaseHealth] 原因:', healthResult.message);
    console.warn('[DatabaseHealth] 应用将继续运行，但某些功能可能不可用');
    showMigrationHint();
    return false;
  }
  
  // 检查表结构
  const tablesResult = await checkRequiredTables();
  
  if (!tablesResult.allExist) {
    console.warn('[DatabaseHealth] ⚠️ 某些必需的表不存在');
    console.warn('[DatabaseHealth] 缺失的表:', tablesResult.missingTables.join(', '));
    showMigrationHint();
    return false;
  }
  
  console.log('[DatabaseHealth] ✅ 所有健康检查通过！');
  console.log('');
  console.log('========================================');
  console.log('');
  
  return true;
}

export default {
  checkDatabaseHealth,
  checkRequiredTables,
  showMigrationHint,
  performStartupHealthCheck,
};