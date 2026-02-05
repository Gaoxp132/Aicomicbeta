import { Hono } from 'npm:hono@4.0.2';
import { supabase } from '../database/client.tsx';

const app = new Hono();

/**
 * 健康检查端点 - 测试数据库连接
 */
app.get('/make-server-fc31472c/health', async (c) => {
  console.log('[Health] 🏥 Running health check...');
  
  const health: any = {
    timestamp: new Date().toISOString(),
    status: 'checking',
    checks: {},
  };
  
  // 1. 检查环境变量
  health.checks.envVars = {
    SUPABASE_URL: !!Deno.env.get('SUPABASE_URL'),
    SUPABASE_SERVICE_ROLE_KEY: !!Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
    SUPABASE_ANON_KEY: !!Deno.env.get('SUPABASE_ANON_KEY'),
    DATABASE_POOLER_URL: !!Deno.env.get('DATABASE_POOLER_URL'),
    SUPABASE_DB_URL: !!Deno.env.get('SUPABASE_DB_URL'),
  };
  
  // 2. 检查 Supabase 客户端
  health.checks.supabaseClient = {
    exists: !!supabase,
    hasFromMethod: typeof supabase?.from === 'function',
  };
  
  // 3. 测试数据库连接
  try {
    console.log('[Health] 🔍 Testing database connection...');
    const { data, error, count } = await supabase
      .from('series')
      .select('id', { count: 'exact', head: true })
      .limit(1);
    
    health.checks.databaseConnection = {
      success: !error,
      error: error?.message,
      code: error?.code,
      hint: error?.hint,
      canQuery: !error,
    };
    
    console.log('[Health] ✅ Database connection test:', !error ? 'PASS' : 'FAIL');
  } catch (err: any) {
    console.error('[Health] ❌ Database connection test failed:', err);
    health.checks.databaseConnection = {
      success: false,
      error: err.message,
      stack: err.stack,
    };
  }
  
  // 4. 测试插入操作（使用测试表）
  try {
    console.log('[Health] 🔍 Testing write permission...');
    
    // 尝试创建一个测试记录（立即删除）
    const testData = {
      title: '__health_check_test__',
      description: 'Health check test entry',
      genre: 'test',
      style: 'test',
      user_phone: 'test',
      total_episodes: 1,
      status: 'draft',
    };
    
    const { data: inserted, error: insertError } = await supabase
      .from('series')
      .insert(testData)
      .select()
      .single();
    
    if (insertError) {
      health.checks.writePermission = {
        success: false,
        error: insertError.message,
        code: insertError.code,
        hint: insertError.hint,
      };
    } else if (inserted) {
      // 删除测试记录
      await supabase
        .from('series')
        .delete()
        .eq('id', inserted.id);
      
      health.checks.writePermission = {
        success: true,
        message: 'Can insert and delete records',
      };
    }
    
    console.log('[Health] ✅ Write permission test:', insertError ? 'FAIL' : 'PASS');
  } catch (err: any) {
    console.error('[Health] ❌ Write permission test failed:', err);
    health.checks.writePermission = {
      success: false,
      error: err.message,
    };
  }
  
  // 5. 总结状态
  const allChecks = Object.values(health.checks);
  const failedChecks = allChecks.filter((check: any) => 
    check.success === false || 
    Object.values(check).some(v => v === false)
  );
  
  health.status = failedChecks.length === 0 ? 'healthy' : 'unhealthy';
  health.failedChecks = failedChecks.length;
  
  const httpStatus = health.status === 'healthy' ? 200 : 503;
  
  console.log('[Health] 📋 Health check result:', health.status);
  
  return c.json(health, httpStatus);
});

export default app;
