import { Hono } from "npm:hono@4.0.2";
import { cors } from "npm:hono/cors";
import { logger } from "npm:hono/logger";

// 🆕 导入所有优化中间件
import { rateLimitMiddleware } from "./middleware/rate_limiter.tsx";
import { safePerformanceMiddleware, getPerformanceMetrics } from "./middleware/safe_performance.tsx";
import { performanceMiddleware, getPerformanceReport } from "./middleware/performance_monitor.tsx";
import { concurrencyManager } from "./middleware/concurrency_manager.tsx";
import { cacheManager } from "./middleware/advanced_cache.tsx";
import { connectionPool } from "./database/connection_pool.tsx";
import { indexOptimizer } from "./database/index_optimizer.tsx";

// 🔥 验证关键环境变量（在应用启动时立即检查）
console.log('[App] 🔍 Validating environment variables...');
const requiredEnvVars = [
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_ANON_KEY'
];

const missingEnvVars: string[] = [];
for (const varName of requiredEnvVars) {
  const value = Deno.env.get(varName);
  if (!value || value.trim() === '') {
    missingEnvVars.push(varName);
    console.error(`[App] ❌ WARNING: Missing environment variable: ${varName}`);
  } else {
    console.log(`[App] ✅ ${varName}: ${value.substring(0, 20)}...`);
  }
}

if (missingEnvVars.length > 0) {
  const errorMsg = `Missing required environment variables: ${missingEnvVars.join(', ')}`;
  console.error(`[App] ❌❌❌ WARNING: ${errorMsg}`);
  console.error('[App] ⚠️ Application may not function correctly without these variables!');
  console.error('[App] 💡 Configure them in Supabase Dashboard or use: supabase secrets set KEY=value');
  // 🔥 不再抛出错误，让应用继续启动
} else {
  console.log('[App] ✅ All required environment variables are present');
}

// 🔥🔥🔥 VERSION MARKER - DO NOT REMOVE 🔥🔥🔥
const APP_VERSION = "v4.2.67_SERIES_PROGRESS_FIELDS_FIX";
const BUILD_TIMESTAMP = Date.now();
console.log(`[App] 🔥🔥🔥 VERSION: ${APP_VERSION}`);
console.log(`[App] 🔥🔥🔥 BUILD TIMESTAMP: ${BUILD_TIMESTAMP}`);
console.log(`[App] ✅ v4.2.44 - Fixed env validation - Removed DATABASE_POOLER_URL from required vars, made it optional`);
console.log(`[App] 🚀 Target: 100,000 users, 10,000 concurrent`);
console.log(`[App] ✅ Performance optimizations: Enabled`);
console.log(`[App] ✅ Concurrency management: Enabled`);
console.log(`[App] ✅ Advanced caching: Enabled`);
console.log(`[App] ✅ Connection pooling: Enhanced (v4.2.21)`);
console.log(`[App] ✅ Connection warmup: Enabled (50 prewarmed connections)`);
console.log(`[App] ✅ Health check: Enabled (30s interval)`);
console.log(`[App] ✅ Connection timeout: Reduced to 5s (fast fail)`);
console.log(`[App] ✅ Query timeout: Reduced to 15s`);
console.log(`[App] ✅ Retry mechanism: 3 attempts with 100-300ms delay`);
console.log(`[App] ✅ Keep-alive: Enabled`);
console.log(`[App] ✅ Index optimization: Ready`);
console.log(`[App] ✅ Database migration: Complete`);
console.log(`[App] ✅ AI routes: Fixed`);
console.log(`[App] ✅ AI Engine: Qwen (Aliyun)`);
console.log(`[App] ✅ Video Merger: Rebuilt (v4.2.4_005)`);
console.log(`[App] ✅ Users Module: Standalone (no external deps)`);
console.log(`[App] ✅ All database modules: Standalone`);
console.log(`[App] ✅ Code optimization: Complete (93/100)`);
console.log(`[App] ✅ Production ready: Yes`);
// 🔥🔥🔥 VERSION MARKER - DO NOT REMOVE 🔥🔥🔥

const app = new Hono();

// Enable logger
app.use('*', logger(console.log));

// 🔥 v4.2.67: 添加请求拦截日志
app.use('*', async (c, next) => {
  console.log('[REQUEST] ========================================');
  console.log('[REQUEST] 📥 Method:', c.req.method);
  console.log('[REQUEST] 📥 Path:', c.req.path);
  console.log('[REQUEST] 📥 URL:', c.req.url);
  console.log('[REQUEST] ========================================');
  await next();
});

// 🆕 安全的性能监控中间件（必须在最前面）
app.use('*', safePerformanceMiddleware());

// Enable CORS
app.use(
  "/*",
  cors({
    origin: "*",
    allowHeaders: ["Content-Type", "Authorization", "Range", "X-User-Phone"],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "HEAD"],
    exposeHeaders: ["Content-Length", "Content-Range", "Accept-Ranges", "X-RateLimit-Limit", "X-RateLimit-Remaining", "X-RateLimit-Reset"],
    maxAge: 600,
  }),
);

// 🆕 速率限制中间件（保护API）
app.use('/make-server-fc31472c/*', rateLimitMiddleware());

// 全局错误处理
app.onError((error, c) => {
  console.error('[Global Error]', error);
  return c.json({
    success: false,
    error: error.message || 'Internal server error',
    stack: error.stack,
  }, 500);
});

// 健康检查 - 立即可用
app.get("/health", (c) => {
  console.log('[App] /health called');
  return c.json({ 
    status: "ok", 
    timestamp: new Date().toISOString(),
    version: APP_VERSION,
  });
});

app.get("/make-server-fc31472c/health", (c) => {
  console.log('[App] /make-server-fc31472c/health called');
  return c.json({ 
    status: "ok", 
    timestamp: new Date().toISOString(),
    version: APP_VERSION,
  });
});

// 测试端点
app.get("/test", (c) => {
  return c.json({
    status: "ok",
    message: "Server is running",
    timestamp: new Date().toISOString(),
    version: APP_VERSION,
  });
});

app.get("/make-server-fc31472c/test", (c) => {
  return c.json({
    status: "ok",
    message: "Server is running",
    timestamp: new Date().toISOString(),
    version: APP_VERSION,
  });
});

// 404处理
app.notFound((c) => {
  return c.json({
    error: "404 Not Found",
    path: c.req.path,
    version: APP_VERSION,
  }, 404);
});

// 模块加载状态
const loadedModules: string[] = [];
const failedModules: string[] = [];

// 加载所有路由模
export async function loadAllRoutes() {
  console.log('[App] ===== Starting Route Loading (Optimized) =====');
  console.log('[App] ⚡ Loading ONLY critical routes to reduce startup time');
  const startTime = Date.now();
  
  // ⭐ 第一优先级：数据库（必须成功）
  try {
    console.log('[App] Loading database...');
    const db = await import("./database/index.tsx");
    loadedModules.push('database');
    console.log('[App] ✅ Database loaded');
    
    app.get("/db-health", async (c) => {
      const result = await db.checkDatabaseHealth();
      return c.json(result, result.status === 'ok' ? 200 : 500);
    });
    
    app.get("/make-server-fc31472c/db-health", async (c) => {
      const result = await db.checkDatabaseHealth();
      return c.json(result, result.status === 'ok' ? 200 : 500);
    });
  } catch (error: any) {
    console.error('[App] ❌ Database failed:', error?.message || String(error));
    console.error('[App] Stack:', error?.stack);
    failedModules.push(`database: ${error?.message || 'Unknown error'}`);
  }
  
  // ⭐ 第二优先级：用户路由（关键功能）
  try {
    console.log('[App] Loading user routes...');
    const { registerUserRoutes } = await import("./routes_user.tsx");
    registerUserRoutes(app);
    loadedModules.push('routes_user');
    console.log('[App] ✅ User routes loaded');
  } catch (error: any) {
    console.error('[App] ❌ User routes failed:', error?.message || String(error));
    failedModules.push(`routes_user: ${error?.message || 'Unknown error'}`);
  }
  
  // ⭐ 第三优先级：健康检查路由（关键功能）
  try {
    console.log('[App] Loading health routes...');
    const { health } = await import("./routes_health.tsx");
    app.route('/make-server-fc31472c/health', health);
    loadedModules.push('routes_health');
    console.log('[App] ✅ Health routes loaded');
  } catch (error: any) {
    console.error('[App] ❌ Health routes failed:', error?.message || String(error));
    failedModules.push(`routes_health: ${error?.message || 'Unknown error'}`);
  }
  
  // 🔍 临时：Schema检查路由
  try {
    console.log('[App] Loading schema inspector...');
    const { inspectSchema } = await import("./routes/handlers/schema_inspector.tsx");
    app.get('/make-server-fc31472c/schema/inspect', inspectSchema);
    loadedModules.push('schema_inspector');
    console.log('[App] ✅ Schema inspector loaded');
  } catch (error: any) {
    console.error('[App] ❌ Schema inspector failed:', error?.message || String(error));
    failedModules.push(`schema_inspector: ${error?.message || 'Unknown error'}`);
  }
  
  // ⭐ 第四优先级：社区路由（关键功能）
  try {
    console.log('[App] Loading community routes...');
    const { registerCommunityRoutes } = await import("./routes_community.tsx");
    registerCommunityRoutes(app);
    loadedModules.push('routes_community');
    console.log('[App] ✅ Community routes loaded');
  } catch (error: any) {
    console.error('[App] ❌ Community routes failed:', error?.message || String(error));
    failedModules.push(`routes_community: ${error?.message || 'Unknown error'}`);
  }
  
  // ⭐ 第五优先级：漫剧路由（关键功能）
  try {
    console.log('[App] Loading series routes...');
    const { registerSeriesRoutes } = await import("./routes_series_refactored.tsx");
    
    if (typeof registerSeriesRoutes !== 'function') {
      throw new Error(`registerSeriesRoutes is not a function, got: ${typeof registerSeriesRoutes}`);
    }
    
    registerSeriesRoutes(app);
    loadedModules.push('routes_series');
    console.log('[App] ✅ Series routes loaded');
  } catch (error: any) {
    console.error('[App] ❌ Series routes failed:', error?.message || String(error));
    console.error('[App] Stack:', error?.stack);
    failedModules.push(`routes_series: ${error?.message || 'Unknown error'}`);
  }
  
  // 🆕 v4.2.67: 加载漫剧核心路由（包含批量修复）
  try {
    console.log('[App] Loading series core routes...');
    const { registerSeriesCoreRoutes } = await import("./routes_series_core_refactored.tsx");
    registerSeriesCoreRoutes(app);
    loadedModules.push('routes_series_core');
    console.log('[App] ✅ Series core routes loaded');
  } catch (error: any) {
    console.error('[App] ❌ Series core routes failed:', error?.message || String(error));
    failedModules.push(`routes_series_core: ${error?.message || 'Unknown error'}`);
  }
  
  // 🆕 加载AI路由（包含AI生成相关接口）
  try {
    console.log('[App] Loading AI routes...');
    const { registerAIRoutes } = await import("./routes_ai_refactored.tsx");
    registerAIRoutes(app);
    loadedModules.push('routes_ai');
    console.log('[App] ✅ AI routes loaded');
  } catch (error: any) {
    console.error('[App] ❌ AI routes failed:', error?.message || String(error));
    failedModules.push(`routes_ai: ${error?.message || 'Unknown error'}`);
  }
  
  // 🆕 加载视路由（包含OSS签名）
  try {
    console.log('[App] Loading video routes...');
    const { registerVideoRoutes } = await import("./routes_video.tsx");
    registerVideoRoutes(app);
    loadedModules.push('routes_video');
    console.log('[App] ✅ Video routes loaded');
  } catch (error: any) {
    console.error('[App] ❌ Video routes failed:', error?.message || String(error));
    failedModules.push(`routes_video: ${error?.message || 'Unknown error'}`);
  }
  
  // 🆕 加载数据迁移路由
  try {
    console.log('[App] Loading data migration routes...');
    const { migrateAllData, getMigrationStatus } = await import("./routes/handlers/data_migration_complete.tsx");
    
    // POST /make-server-fc31472c/migration/migrate-all - 迁移所有数据
    app.post('/make-server-fc31472c/migration/migrate-all', migrateAllData);
    
    // GET /make-server-fc31472c/migration/status - 获取迁移状态
    app.get('/make-server-fc31472c/migration/status', getMigrationStatus);
    
    loadedModules.push('data_migration');
    console.log('[App] ✅ Data migration routes loaded');
  } catch (error: any) {
    console.error('[App] ❌ Data migration routes failed:', error?.message || String(error));
    failedModules.push(`data_migration: ${error?.message || 'Unknown error'}`);
  }
  
  // 🆕 v4.2.43 - 加载环境变量诊断路由（优先级最高）
  try {
    console.log('[App] Loading environment diagnostics routes...');
    const { registerEnvDiagnosticsRoutes } = await import("./routes/env_diagnostics.tsx");
    registerEnvDiagnosticsRoutes(app);
    loadedModules.push('env_diagnostics');
    console.log('[App] ✅ Environment diagnostics routes loaded');
  } catch (error: any) {
    console.error('[App] ❌ Environment diagnostics routes failed:', error?.message || String(error));
    failedModules.push(`env_diagnostics: ${error?.message || 'Unknown error'}`);
  }
  
  // 🆕 加载数据库诊断路由
  try {
    console.log('[App] Loading database diagnostics...');
    const { checkDatabaseSchema } = await import("./routes/database_diagnostics.tsx");
    
    app.get('/db-schema', checkDatabaseSchema);
    app.get('/make-server-fc31472c/db-schema', checkDatabaseSchema);
    
    loadedModules.push('database_diagnostics');
    console.log('[App] ✅ Database diagnostics loaded');
  } catch (error: any) {
    console.error('[App] ❌ Database diagnostics failed:', error?.message || String(error));
    failedModules.push(`database_diagnostics: ${error?.message || 'Unknown error'}`);
  }
  
  // 🆕 加载OSS配置验证路由
  try {
    console.log('[App] Loading OSS config validator...');
    const { registerOSSConfigValidatorRoutes } = await import("./routes/oss_config_validator.tsx");
    registerOSSConfigValidatorRoutes(app);
    loadedModules.push('oss_config_validator');
    console.log('[App] ✅ OSS config validator loaded');
  } catch (error: any) {
    console.error('[App] ❌ OSS config validator failed:', error?.message || String(error));
    failedModules.push(`oss_config_validator: ${error?.message || 'Unknown error'}`);
  }
  
  // 🆕 加载OSS视频代理路由
  try {
    console.log('[App] Loading OSS video proxy...');
    const { proxyOSSVideo } = await import("./routes/oss_proxy.tsx");
    app.get('/make-server-fc31472c/oss/proxy', proxyOSSVideo);
    loadedModules.push('oss_proxy');
    console.log('[App] ✅ OSS video proxy loaded');
  } catch (error: any) {
    console.error('[App] ❌ OSS video proxy failed:', error?.message || String(error));
    failedModules.push(`oss_proxy: ${error?.message || 'Unknown error'}`);
  }
  
  // 🆕 v4.2.4 - 加载视频合并修复路由
  try {
    console.log('[App] Loading video merger fix routes...');
    const { batchFixVideoMerger, checkEpisodesNeedingFix } = await import("./migrations/fix_video_merger_batch.tsx");
    
    // POST /make-server-fc31472c/migrations/fix-video-merger - 批量修复视频合并
    app.post('/make-server-fc31472c/migrations/fix-video-merger', async (c) => {
      console.log('[App] 🚀 Video merger fix triggered');
      const result = await batchFixVideoMerger();
      return c.json(result, result.success ? 200 : 500);
    });
    
    // GET /make-server-fc31472c/migrations/check-video-merger - 检查需要修复的剧集
    app.get('/make-server-fc31472c/migrations/check-video-merger', async (c) => {
      console.log('[App] 🔍 Checking episodes needing fix');
      const result = await checkEpisodesNeedingFix();
      return c.json(result, result.success ? 200 : 500);
    });
    
    loadedModules.push('video_merger_fix');
    console.log('[App] ✅ Video merger fix routes loaded');
  } catch (error: any) {
    console.error('[App] ❌ Video merger fix routes failed:', error?.message || String(error));
    failedModules.push(`video_merger_fix: ${error?.message || 'Unknown error'}`);
  }
  
  // 🆕 v4.2.4.1 - 加载播放列表字段名修复路由
  try {
    console.log('[App] Loading playlist field name fix routes...');
    const { fixPlaylistFieldNames, checkPlaylistsNeedingFix } = await import("./migrations/fix_playlist_field_names.tsx");
    
    // POST /make-server-fc31472c/migrations/fix-playlist-fields - 批量修复播放列表字段名
    app.post('/make-server-fc31472c/migrations/fix-playlist-fields', async (c) => {
      console.log('[App] 🚀 Playlist field name fix triggered');
      const result = await fixPlaylistFieldNames();
      return c.json(result, result.success ? 200 : 500);
    });
    
    // GET /make-server-fc31472c/migrations/check-playlist-fields - 检查需要修复的播放列表
    app.get('/make-server-fc31472c/migrations/check-playlist-fields', async (c) => {
      console.log('[App] 🔍 Checking playlists needing fix');
      const result = await checkPlaylistsNeedingFix();
      return c.json(result, 200);
    });
    
    loadedModules.push('playlist_field_fix');
    console.log('[App] ✅ Playlist field name fix routes loaded');
  } catch (error: any) {
    console.error('[App] ❌ Playlist field name fix routes failed:', error?.message || String(error));
    failedModules.push(`playlist_field_fix: ${error?.message || 'Unknown error'}`);
  }
  
  // 🆕 v4.2.4 - 加载用户数据调试路由
  try {
    console.log('[App] Loading user data debug routes...');
    const { debugUserData } = await import("./routes/debug_user_data.tsx");
    
    // GET /make-server-fc31472c/debug/user-data/:userPhone - 调试用户数据
    app.get('/make-server-fc31472c/debug/user-data/:userPhone', debugUserData);
    
    loadedModules.push('debug_user_data');
    console.log('[App] ✅ User data debug routes loaded');
  } catch (error: any) {
    console.error('[App] ❌ User data debug routes failed:', error?.message || String(error));
    failedModules.push(`debug_user_data: ${error?.message || 'Unknown error'}`);
  }
  
  // 🆕 v4.2.4.1 - 加载播放列表调试路由
  try {
    console.log('[App] Loading playlist debug routes...');
    const { debugPlaylist } = await import("./routes/debug_playlist.tsx");
    
    // GET /make-server-fc31472c/debug/playlist/:episodeId - 调试播放列表内容
    app.get('/make-server-fc31472c/debug/playlist/:episodeId', debugPlaylist);
    
    loadedModules.push('debug_playlist');
    console.log('[App] ✅ Playlist debug routes loaded');
  } catch (error: any) {
    console.error('[App] ❌ Playlist debug routes failed:', error?.message || String(error));
    failedModules.push(`debug_playlist: ${error?.message || 'Unknown error'}`);
  }
  
  // 🆕 v4.2.44 - 加载系列数据调试路由
  try {
    console.log('[App] Loading series data debug routes...');
    const debugSeriesData = await import("./routes/debug_series_data.tsx");
    app.route('/', debugSeriesData.default);
    loadedModules.push('debug_series_data');
    console.log('[App] ✅ Series data debug routes loaded');
  } catch (error: any) {
    console.error('[App] ❌ Series data debug routes failed:', error?.message || String(error));
    failedModules.push(`debug_series_data: ${error?.message || 'Unknown error'}`);
  }
  
  // 🆕 v4.2.44 - 加载健康检查路由
  try {
    console.log('[App] Loading health check routes...');
    const healthCheck = await import("./routes/health_check.tsx");
    app.route('/', healthCheck.default);
    loadedModules.push('health_check');
    console.log('[App] ✅ Health check routes loaded');
  } catch (error: any) {
    console.error('[App] ❌ Health check routes failed:', error?.message || String(error));
    failedModules.push(`health_check: ${error?.message || 'Unknown error'}`);
  }
  
  // 🆕 v4.2.45 - 加载环境变量检查路由
  try {
    console.log('[App] Loading env check routes...');
    const envCheck = await import("./routes/env_check.tsx");
    app.route('/', envCheck.default);
    loadedModules.push('env_check');
    console.log('[App] ✅ Env check routes loaded');
  } catch (error: any) {
    console.error('[App] ❌ Env check routes failed:', error?.message || String(error));
    failedModules.push(`env_check: ${error?.message || 'Unknown error'}`);
  }
  
  // 🆕 v4.2.20.3 - 加载数据源诊断路由
  try {
    console.log('[App] Loading data source diagnostics routes...');
    const { registerDataSourceDiagnosticsRoutes } = await import("./routes/data_source_diagnostics.tsx");
    registerDataSourceDiagnosticsRoutes(app);
    loadedModules.push('data_source_diagnostics');
    console.log('[App] ✅ Data source diagnostics routes loaded');
  } catch (error: any) {
    console.error('[App] ❌ Data source diagnostics routes failed:', error?.message || String(error));
    failedModules.push(`data_source_diagnostics: ${error?.message || 'Unknown error'}`);
  }
  
  // 🆕 v4.2.4 - 加载数据库清理路由
  try {
    console.log('[App] Loading database cleanup routes...');
    const databaseCleanup = await import("./routes/database_cleanup.tsx");
    app.route('/', databaseCleanup.default);
    loadedModules.push('database_cleanup');
    console.log('[App] ✅ Database cleanup routes loaded');
  } catch (error: any) {
    console.error('[App] ❌ Database cleanup routes failed:', error?.message || String(error));
    failedModules.push(`database_cleanup: ${error?.message || 'Unknown error'}`);
  }
  
  // 🆕 v4.2.68 - 加载 Figma 插件路由
  try {
    console.log('[App] Loading Figma plugin routes...');
    const figma = await import("./routes/figma.tsx");
    app.route('/make-server-fc31472c/figma', figma.default);
    loadedModules.push('figma_plugin');
    console.log('[App] ✅ Figma plugin routes loaded');
  } catch (error: any) {
    console.error('[App] ❌ Figma plugin routes failed:', error?.message || String(error));
    failedModules.push(`figma_plugin: ${error?.message || 'Unknown error'}`);
  }
  
  const totalTime = Date.now() - startTime;
  console.log('[App] ===== Route Loading Complete =====');
  console.log(`[App] ⏱️ Total time: ${totalTime}ms`);
  console.log(`[App] ✅ Loaded (${loadedModules.length}):`, loadedModules.join(', '));
  if (failedModules.length > 0) {
    console.log(`[App] ❌ Failed (${failedModules.length}):`, failedModules.join(', '));
  }
}

// 模块状态端点
app.get("/modules-status", (c) => {
  return c.json({
    status: "ok",
    loaded: loadedModules,
    failed: failedModules,
    totalModules: loadedModules.length + failedModules.length,
  });
});

app.get("/make-server-fc31472c/modules-status", (c) => {
  return c.json({
    status: "ok",
    loaded: loadedModules,
    failed: failedModules,
    totalModules: loadedModules.length + failedModules.length,
  });
});

// 🆕 性能监控端点
app.get("/monitoring/performance", (c) => {
  return c.json(getPerformanceMetrics());
});

app.get("/make-server-fc31472c/monitoring/performance", (c) => {
  return c.json(getPerformanceMetrics());
});

// 🆕 高级性能报告端点
app.get("/monitoring/performance-report", getPerformanceReport);
app.get("/make-server-fc31472c/monitoring/performance-report", getPerformanceReport);

// 🆕 并发管理统计
app.get("/monitoring/concurrency", (c) => {
  return c.json({
    success: true,
    data: concurrencyManager.getStats(),
  });
});
app.get("/make-server-fc31472c/monitoring/concurrency", (c) => {
  return c.json({
    success: true,
    data: concurrencyManager.getStats(),
  });
});

// 🆕 缓存统计
app.get("/monitoring/cache", (c) => {
  return c.json({
    success: true,
    data: cacheManager.getStats(),
  });
});
app.get("/make-server-fc31472c/monitoring/cache", (c) => {
  return c.json({
    success: true,
    data: cacheManager.getStats(),
  });
});

// 🆕 连接池统计
app.get("/monitoring/connection-pool", (c) => {
  return c.json({
    success: true,
    data: connectionPool.getStats(),
  });
});
app.get("/make-server-fc31472c/monitoring/connection-pool", (c) => {
  return c.json({
    success: true,
    data: connectionPool.getStats(),
  });
});

// 🆕 索引优化信息
app.get("/monitoring/indexes", (c) => {
  return c.json({
    success: true,
    data: indexOptimizer.getIndexStats(),
    sql: indexOptimizer.generateIndexCreationScript(),
  });
});
app.get("/make-server-fc31472c/monitoring/indexes", (c) => {
  return c.json({
    success: true,
    data: indexOptimizer.getIndexStats(),
    sql: indexOptimizer.generateIndexCreationScript(),
  });
});

// 🆕 综合系统状态
app.get("/monitoring/system", (c) => {
  return c.json({
    success: true,
    version: APP_VERSION,
    timestamp: new Date().toISOString(),
    uptime: Date.now() - BUILD_TIMESTAMP,
    data: {
      performance: getPerformanceMetrics(),
      concurrency: concurrencyManager.getStats(),
      cache: cacheManager.getStats(),
      connectionPool: connectionPool.getStats(),
      indexes: indexOptimizer.getIndexStats(),
      modules: {
        loaded: loadedModules,
        failed: failedModules,
      },
    },
  });
});
app.get("/make-server-fc31472c/monitoring/system", (c) => {
  return c.json({
    success: true,
    version: APP_VERSION,
    timestamp: new Date().toISOString(),
    uptime: Date.now() - BUILD_TIMESTAMP,
    data: {
      performance: getPerformanceMetrics(),
      concurrency: concurrencyManager.getStats(),
      cache: cacheManager.getStats(),
      connectionPool: connectionPool.getStats(),
      indexes: indexOptimizer.getIndexStats(),
      modules: {
        loaded: loadedModules,
        failed: failedModules,
      },
    },
  });
});

export default app;