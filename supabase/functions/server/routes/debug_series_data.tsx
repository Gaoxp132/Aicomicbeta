import { Hono } from 'npm:hono@4.0.2';
import { supabase } from '../database/client.tsx';
import * as db from '../database/series.tsx';

const app = new Hono();

/**
 * 调试工具：检查用户系列数据
 */
app.get('/make-server-fc31472c/debug/series-data', async (c) => {
  const userPhone = c.req.query('userPhone');
  
  if (!userPhone) {
    return c.json({ error: '缺少userPhone参数' }, 400);
  }
  
  console.log(`[Debug] 🔍 Checking series data for user: ${userPhone}`);
  
  const result: any = {
    timestamp: new Date().toISOString(),
    userPhone,
    checks: {},
  };
  
  // 1. 检查环境变量
  result.checks.envVars = {
    SUPABASE_URL: !!Deno.env.get('SUPABASE_URL'),
    SUPABASE_SERVICE_ROLE_KEY: !!Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
    SUPABASE_ANON_KEY: !!Deno.env.get('SUPABASE_ANON_KEY'),
  };
  
  // 2. 检查Supabase客户端
  result.checks.supabaseClient = {
    exists: !!supabase,
    canQuery: false,
  };
  
  // 3. 测试直接查询
  try {
    console.log('[Debug] 🔍 Testing direct Supabase query...');
    const { data, error, count } = await supabase
      .from('series')
      .select('id, title, status, created_at', { count: 'exact' })
      .eq('user_phone', userPhone)
      .order('created_at', { ascending: false });
    
    result.checks.supabaseClient.canQuery = true;
    result.checks.directQuery = {
      success: !error,
      error: error?.message,
      count,
      dataCount: data?.length || 0,
      sample: data?.slice(0, 3).map((s: any) => ({
        id: s.id,
        title: s.title,
        status: s.status,
        createdAt: s.created_at,
      })),
    };
    
    console.log('[Debug] ✅ Direct query result:', {
      success: !error,
      count,
      dataLength: data?.length,
    });
  } catch (err: any) {
    console.error('[Debug] ❌ Direct query failed:', err);
    result.checks.directQuery = {
      success: false,
      error: err.message,
    };
  }
  
  // 4. 测试 database helper
  try {
    console.log('[Debug] 🔍 Testing database helper...');
    const seriesList = await db.getUserSeries(userPhone);
    
    result.checks.databaseHelper = {
      success: true,
      count: seriesList.length,
      sample: seriesList.slice(0, 3).map((s: any) => ({
        id: s.id,
        title: s.title,
        status: s.status,
      })),
    };
    
    console.log('[Debug] ✅ Database helper result:', {
      count: seriesList.length,
    });
  } catch (err: any) {
    console.error('[Debug] ❌ Database helper failed:', err);
    result.checks.databaseHelper = {
      success: false,
      error: err.message,
    };
  }
  
  // 5. 检查数据库总记录数
  try {
    console.log('[Debug] 🔍 Checking total series count...');
    const { count, error } = await supabase
      .from('series')
      .select('id', { count: 'exact', head: true });
    
    result.checks.totalSeriesCount = {
      success: !error,
      error: error?.message,
      count,
    };
    
    console.log('[Debug] ✅ Total series count:', count);
  } catch (err: any) {
    console.error('[Debug] ❌ Total count query failed:', err);
    result.checks.totalSeriesCount = {
      success: false,
      error: err.message,
    };
  }
  
  // 6. 检查user_phone列的唯一值
  try {
    console.log('[Debug] 🔍 Checking unique user_phone values...');
    const { data, error } = await supabase
      .from('series')
      .select('user_phone')
      .limit(20);
    
    if (!error && data) {
      const uniquePhones = [...new Set(data.map((d: any) => d.user_phone))];
      result.checks.userPhoneValues = {
        success: true,
        uniqueCount: uniquePhones.length,
        sample: uniquePhones.slice(0, 10),
        containsTargetPhone: uniquePhones.includes(userPhone),
      };
      
      console.log('[Debug] ✅ Found unique phones:', uniquePhones.length);
    } else {
      result.checks.userPhoneValues = {
        success: false,
        error: error?.message,
      };
    }
  } catch (err: any) {
    console.error('[Debug] ❌ User phone check failed:', err);
    result.checks.userPhoneValues = {
      success: false,
      error: err.message,
    };
  }
  
  // 总结
  const allChecksPass = Object.values(result.checks).every((check: any) => 
    check.success !== false && (check.canQuery !== false)
  );
  
  result.summary = {
    allChecksPass,
    message: allChecksPass 
      ? '所有检查通过' 
      : '发现问题，请查看详细信息',
  };
  
  console.log('[Debug] 📋 Summary:', result.summary);
  
  return c.json({
    success: true,
    data: result,
  });
});

export default app;
