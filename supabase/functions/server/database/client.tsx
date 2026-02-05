/**
 * 数据库客户端工具
 * v4.2.50: 修复API key缺失问题
 * 
 * 严格验证环境变量，确保API密钥正确加载
 * CACHE_BUSTER: FIX_APIKEY_HEADERS_V50
 */

import { createClient } from "npm:@supabase/supabase-js@2";
import postgres from "npm:postgres@3";

// 🔥 CACHE BUSTER - 强制重新读取环境变量 - v4.2.50
const CACHE_BUSTER = 'FIX_APIKEY_HEADERS_V50';
console.log('[Database Client] 🔥🔥🔥 CACHE BUSTER v4.2.50:', CACHE_BUSTER);
console.log('[Database Client] 🔥🔥🔥 ENV FIX: Explicit apikey headers in all requests');

// 🔥 直接PostgreSQL连接 - 使用 Connection Pooler
// 优先使用自定义的 pooler URL，否则使用系统的 DB_URL
let pgConnectionString = Deno.env.get('DATABASE_POOLER_URL') || Deno.env.get('POOLER_URL') || Deno.env.get('SUPABASE_DB_URL');

let sql: any = null;

// 🚫 临时禁用直接PostgreSQL连接，强制使用REST API（更稳定）
// 原因：密码认证错误导致连接失败
const DISABLE_DIRECT_PG = true;

// 🚀 启用直接PostgreSQL连接（使用 Connection Pooler）
if (pgConnectionString && !DISABLE_DIRECT_PG) {
  try {
    console.log('[Database Client] 🚀 Creating PostgreSQL connection via Supabase Pooler...');
    console.log('[Database Client] 📋 Connection string check:', pgConnectionString ? 'present' : 'missing');
    
    const envVarUsed = Deno.env.get('DATABASE_POOLER_URL') ? 'DATABASE_POOLER_URL' : 
                       Deno.env.get('POOLER_URL') ? 'POOLER_URL' : 
                       'SUPABASE_DB_URL';
    console.log('[Database Client] 📋 Using env var:', envVarUsed);
    
    // 🔍 详细检测连接字符串类型
    const isUsingPooler = pgConnectionString.includes('pooler.supabase.com');
    const isTransactionMode = pgConnectionString.includes(':6543/');
    const isSessionMode = pgConnectionString.includes('pooler.supabase.com:5432/');
    const isDirectConnection = pgConnectionString.includes('db.') && !pgConnectionString.includes('pooler');
    
    console.log('[Database Client] 🔍 Connection Type Detection:');
    console.log('[Database Client]   - Using Pooler:', isUsingPooler ? '✅ YES' : '❌ NO');
    console.log('[Database Client]   - Transaction Mode (port 6543):', isTransactionMode ? '✅ YES' : '❌ NO');
    console.log('[Database Client]   - Session Mode (port 5432):', isSessionMode ? '✅ YES' : '❌ NO');
    console.log('[Database Client]   - Direct Connection:', isDirectConnection ? '⚠️ YES (not recommended)' : '✅ NO');
    
    if (isTransactionMode) {
      console.log('[Database Client] 🎉 Perfect! Using Transaction Mode pooler (optimal for Edge Functions)');
    } else if (isSessionMode) {
      console.log('[Database Client] ⚠️ Using Session Mode. Consider switching to Transaction Mode (port 6543)');
    } else if (isDirectConnection) {
      console.warn('[Database Client] ⚠️⚠️ Using direct connection (not pooler)');
      console.warn('[Database Client] 💡 Recommendation: Set SUPABASE_POOLER_URL with Transaction Mode connection string');
      console.warn('[Database Client] 💡 Format: postgresql://postgres.[REF]:[PASS]@aws-0-[REGION].pooler.supabase.com:6543/postgres');
    }
    
    let connectionConfig: any;
    
    if (pgConnectionString.startsWith('postgresql://') || pgConnectionString.startsWith('postgres://')) {
      connectionConfig = pgConnectionString;
      console.log('[Database Client] ✅ Using full connection string');
    } else {
      console.warn('[Database Client] ⚠️ Invalid connection string format, expected postgresql:// or postgres://');
      console.warn('[Database Client] ⚠️ Will use REST API only');
      sql = null;
    }
    
    if (connectionConfig) {
      sql = postgres(connectionConfig, {
        // 🔥 优化的连接池配置（适合 Transaction Mode）
        max: 5, // 🔥 减少到5个连接（Transaction Mode 可以处理更多并发）
        idle_timeout: 10, // 🔥 10秒空闲超时
        connect_timeout: 5, // 🔥 5秒连接超时
        max_lifetime: 60 * 5, // 🔥 5分钟最大生命周期
        prepare: false, // Transaction Mode 不支持 prepared statements
        debug: false,
        onnotice: () => {},
        connection: {
          application_name: 'make-server-pooler', // 标识使用 pooler
        },
      });
      
      console.log('[Database Client] ✅ PostgreSQL connection pool created (max: 5, idle_timeout: 10s)');
      
      // 测试连接
      sql`SELECT 1 as test`.then(() => {
        console.log('[Database Client] ✅ PostgreSQL connection test successful via pooler');
      }).catch((testError: any) => {
        console.error('[Database Client] ❌ PostgreSQL connection test failed:', testError);
        console.error('[Database Client] ⚠️ Will fall back to REST API for all queries');
        sql = null;
      });
    }
  } catch (error) {
    console.error('[Database Client] ❌ Failed to create PostgreSQL connection:', error);
    sql = null;
  }
} else {
  if (DISABLE_DIRECT_PG) {
    console.log('[Database Client] 🚫 Direct PostgreSQL connection DISABLED (using REST API only)');
    console.log('[Database Client] 💡 This is a temporary fix for password authentication error');
    console.log('[Database Client] ✅ REST API is stable and production-ready');
  } else {
    console.warn('[Database Client] ⚠️ SUPABASE_DB_URL not configured');
    console.warn('[Database Client] 💡 Add Connection Pooler URL to use direct PostgreSQL:');
    console.warn('[Database Client] 💡 Format: postgresql://postgres.[PROJECT-REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres');
    console.warn('[Database Client] 💡 Will use REST API only');
  }
}

// 导出直接PostgreSQL连接（用于性能关键的查询）
export { sql };

// 创建Supabase客户端（用于Storage、Auth等功能）
const supabaseUrl = Deno.env.get('SUPABASE_URL');
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

// 🚨 调试：检查环境变量
console.log('[Database Client] 🔍 Environment Check:');
console.log('[Database Client] - SUPABASE_URL:', supabaseUrl ? `${supabaseUrl.substring(0, 30)}...` : '❌ MISSING');
console.log('[Database Client] - SUPABASE_SERVICE_ROLE_KEY:', supabaseServiceKey ? `${supabaseServiceKey.substring(0, 20)}...` : '❌ MISSING');

// 🔥 验证环境变量 - 如果真的缺失则抛出错误
if (!supabaseUrl || !supabaseServiceKey || supabaseUrl.trim() === '' || supabaseServiceKey.trim() === '') {
  const errorMsg = '[Database Client] ❌ CRITICAL: Missing required environment variables!';
  console.error(errorMsg);
  console.error('[Database Client]   - SUPABASE_URL:', supabaseUrl ? 'SET' : '❌ MISSING');
  console.error('[Database Client]   - SUPABASE_SERVICE_ROLE_KEY:', supabaseServiceKey ? 'SET' : '❌ MISSING');
  console.error('[Database Client] ⚠️ These environment variables MUST be set in Supabase Dashboard!');
  console.error('[Database Client] 💡 Location: Supabase Dashboard > Edge Functions > Secrets');
  console.error('[Database Client] 💡 Required vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY');
  
  throw new Error(
    'Missing required environment variables: SUPABASE_URL and/or SUPABASE_SERVICE_ROLE_KEY. ' +
    'Please configure them in Supabase Dashboard > Edge Functions > Secrets.'
  );
}

console.log('[Database Client] ✅ All required credentials present');

// 🔥 创建客户端（现在可以确保有有效的凭据）
export const supabase = createClient(
  supabaseUrl,
  supabaseServiceKey,
  {
    db: {
      schema: 'public',
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    // 🔥 添加全局请求配置 - 优化连接池
    global: {
      headers: {
        'Connection': 'keep-alive', // 保持连接活跃
        'apikey': supabaseServiceKey, // 🔥 明确设置apikey header
        'Authorization': `Bearer ${supabaseServiceKey}`, // 🔥 明确设置Authorization header
        'Accept': 'application/json', // 🔥 v4.2.67: 明确设置Accept header
        'Content-Type': 'application/json', // 🔥 v4.2.67: 明确设置Content-Type header
      },
      fetch: (url, options = {}) => {
        // 🔥 在发送请求前检查凭据
        if (!supabaseUrl || !supabaseServiceKey) {
          return Promise.reject(new Error(
            'Database credentials not configured. ' +
            'Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables.'
          ));
        }
        
        // 添加超时控制
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000); // 🔥 增加到30秒超时（之前10秒）
        
        return fetch(url, {
          ...options,
          signal: controller.signal,
          headers: {
            'Connection': 'keep-alive',
            'apikey': supabaseServiceKey, // 🔥 确保每个请求都有apikey
            'Authorization': `Bearer ${supabaseServiceKey}`, // 🔥 确保每个请求都有Authorization
            'Accept': 'application/json', // 🔥 v4.2.67: 强制Accept JSON
            'Content-Type': 'application/json', // 🔥 v4.2.67: 强制Content-Type JSON
            ...options.headers,
          },
        }).finally(() => {
          clearTimeout(timeoutId);
        });
      },
    },
  }
);

console.log('[Database Client] ✅ Supabase REST client created with optimized connection pool');
console.log('[Database Client] 🔍 Client validation:', supabaseUrl && supabaseServiceKey ? '✅ READY' : '❌ NOT CONFIGURED');

// ⚠️ 验证 supabase 客户端可用性
console.log('[Database Client] 🔍 Supabase client validation:');
console.log('[Database Client]   - Client object exists:', !!supabase);
console.log('[Database Client]   - Client.from exists:', typeof supabase?.from === 'function');
console.log('[Database Client]   - Credentials valid:', supabaseUrl && supabaseServiceKey);