/**
 * 检查环境变量配置
 */
export async function checkEnvironmentVariables(c: Context) {
  console.log('[EnvDiagnostics] 🔍 Checking environment variables...');
  
  const requiredVars = [
    'SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'SUPABASE_ANON_KEY',
  ];
  
  const optionalVars = [
    'DATABASE_POOLER_URL',
    'SUPABASE_DB_URL',
    'VOLCENGINE_API_KEY',
    'ALIYUN_OSS_ACCESS_KEY_ID',
    'ALIYUN_OSS_ACCESS_KEY_SECRET',
    'ALIYUN_OSS_BUCKET_NAME',
    'ALIYUN_OSS_REGION',
    'ALIYUN_BAILIAN_API_KEY',
  ];
  
  const results: any = {
    timestamp: new Date().toISOString(),
    required: {},
    optional: {},
    summary: {
      requiredPresent: 0,
      requiredMissing: 0,
      optionalPresent: 0,
      optionalMissing: 0,
    },
    // 🔥 添加环境变量原始值检查（只显示前20个字符）
    rawValues: {},
  };
  
  // 检查必需的环境变量
  for (const varName of requiredVars) {
    const value = Deno.env.get(varName);
    const isPresent = !!(value && value.trim() !== '');
    
    results.required[varName] = {
      present: isPresent,
      length: value ? value.length : 0,
      preview: value ? `${value.substring(0, 20)}...` : null,
      isEmpty: value === '',
      isUndefined: value === undefined,
      isNull: value === null,
    };
    
    // 🔥 记录原始类型信息
    results.rawValues[varName] = {
      type: typeof value,
      value: value ? `${value.substring(0, 15)}...` : String(value),
    };
    
    if (isPresent) {
      results.summary.requiredPresent++;
      console.log(`[EnvDiagnostics] ✅ ${varName}: Present (${value.length} chars)`);
    } else {
      results.summary.requiredMissing++;
      console.error(`[EnvDiagnostics] ❌ ${varName}: MISSING (type: ${typeof value}, value: ${value})`);
    }
  }
  
  // 检查可选的环境变量
  for (const varName of optionalVars) {
    const value = Deno.env.get(varName);
    const isPresent = !!(value && value.trim() !== '');
    
    results.optional[varName] = {
      present: isPresent,
      length: value ? value.length : 0,
      preview: value ? `${value.substring(0, 20)}...` : null,
    };
    
    if (isPresent) {
      results.summary.optionalPresent++;
    } else {
      results.summary.optionalMissing++;
    }
  }
  
  // 判断总体状态
  const allRequiredPresent = results.summary.requiredMissing === 0;
  results.summary.status = allRequiredPresent ? 'OK' : 'ERROR';
  results.summary.message = allRequiredPresent
    ? 'All required environment variables are configured'
    : `Missing ${results.summary.requiredMissing} required environment variables`;
  
  // 添加修复建议
  if (!allRequiredPresent) {
    results.recommendations = [
      '1. Check your Supabase project settings',
      '2. Verify environment variables are set in the Edge Function configuration',
      '3. Ensure secrets are properly linked to your function',
      '4. Try redeploying the Edge Function',
      '5. Use: supabase secrets set KEY=value',
    ];
    
    // 列出缺失的变量
    const missingVars = Object.entries(results.required)
      .filter(([_, info]: any) => !info.present)
      .map(([name, _]) => name);
    
    results.missingVariables = missingVars;
  }
  
  console.log('[EnvDiagnostics] Summary:', results.summary);
  
  return c.json({
    success: allRequiredPresent,
    data: results,
  }, allRequiredPresent ? 200 : 500);
}

/**
 * 测试 Supabase 客户端连接
 */
export async function testSupabaseConnection(c: Context) {
  console.log('[EnvDiagnostics] 🧪 Testing Supabase connection...');
  
  try {
    // 动态导入以避免初始化错误
    const { supabase } = await import('../database/client.tsx');
    
    if (!supabase) {
      return c.json({
        success: false,
        error: 'Supabase client not initialized',
        recommendation: 'Check SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables',
      }, 500);
    }
    
    // 测试简单查询
    const { data, error } = await supabase
      .from('series')
      .select('id', { count: 'exact', head: true })
      .limit(1);
    
    if (error) {
      console.error('[EnvDiagnostics] ❌ Query failed:', error);
      return c.json({
        success: false,
        error: {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code,
        },
        recommendation: error.message.includes('API key')
          ? 'Check if SUPABASE_SERVICE_ROLE_KEY is correctly set'
          : 'Check if the series table exists in your database',
      }, 500);
    }
    
    console.log('[EnvDiagnostics] ✅ Query successful');
    return c.json({
      success: true,
      message: 'Supabase connection is working',
      testQuery: 'SELECT id FROM series LIMIT 1',
      timestamp: new Date().toISOString(),
    });
    
  } catch (error: any) {
    console.error('[EnvDiagnostics] ❌ Connection test failed:', error);
    return c.json({
      success: false,
      error: error.message || String(error),
      stack: error.stack,
    }, 500);
  }
}

/**
 * 注册诊断路由
 */
export function registerEnvDiagnosticsRoutes(app: any) {
  const prefix = '/make-server-fc31472c';
  
  // GET /make-server-fc31472c/diagnostics/env - 检查环境变量
  app.get(`${prefix}/diagnostics/env`, checkEnvironmentVariables);
  
  // GET /make-server-fc31472c/diagnostics/supabase - 测试 Supabase 连接
  app.get(`${prefix}/diagnostics/supabase`, testSupabaseConnection);
  
  console.log('[EnvDiagnostics] ✅ Routes registered');
}