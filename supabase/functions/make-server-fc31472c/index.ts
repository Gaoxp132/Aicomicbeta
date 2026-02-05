// Supabase Edge Function 入口文件
// 🔥🔥🔥 BUILD: v4.2.46_ENV_FIX_FORCE_REDEPLOY 🔥🔥🔥
// FIX: 修复环境变量读取问题，强制重新部署清除缓存
// CACHE_BUSTER: 1738497600000

console.log('🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥');
console.log('[Entry] ===== Edge Function Starting =====');
console.log('[Entry] 🔥 VERSION: v4.2.46_ENV_FIX_FORCE_REDEPLOY');
console.log('[Entry] 🔥 FIX: 环境变量读取 + 强制缓存清除');
console.log('[Entry] 🔥 BUILD TIMESTAMP:', Date.now());
console.log('[Entry] 🔥 CACHE_BUSTER: 1738497600000');
console.log('[Entry] Time:', new Date().toISOString());
console.log('[Entry] Deno version:', Deno.version.deno);
console.log('🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥');

// 导入应用和路由加载器
import app, { loadAllRoutes } from "../server/app.tsx";

console.log('[Entry] ===== Loading All Routes (with 60s timeout) =====');

// 🔥 先加载路由（带总超时保护，增加到60秒）
const loadingPromise = loadAllRoutes();
const timeoutPromise = new Promise((_, reject) => 
  setTimeout(() => reject(new Error('Route loading timeout after 60s')), 60000) // 从30秒增加到60秒
);

try {
  await Promise.race([loadingPromise, timeoutPromise]);
  console.log('[Entry] ✅ All routes loaded successfully');
} catch (error: any) {
  const errorMessage = error?.message || String(error) || 'Unknown error';
  console.error('[Entry] ⚠️ Route loading failed or timeout:', errorMessage);
  if (error?.stack) {
    console.error('[Entry] Stack trace:', error.stack);
  }
  console.error('[Entry] ⚠️ Starting server anyway with partial routes...');
}

console.log('[Entry] ===== Starting Deno Server =====');

// 🚀 现在启动服务器（路由已加载）
Deno.serve((req) => {
  const url = new URL(req.url);
  console.log('[Entry] Request:', req.method, url.pathname);
  return app.fetch(req);
});

console.log('[Entry] ✅ Server started and ready!');