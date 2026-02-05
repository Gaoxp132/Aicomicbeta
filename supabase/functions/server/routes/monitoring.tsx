// 性能监控和缓存管理路由模块
import type { Hono } from "npm:hono";

export function registerMonitoringRoutes(app: Hono) {
  // 性能监控端点
  app.get("/make-server-fc31472c/metrics", async (c) => {
    console.log('[Server] Performance metrics endpoint called');
    try {
      const { getPerformanceMetrics } = await import("../middleware/performance.tsx");
      const metrics = getPerformanceMetrics();
      return c.json({
        success: true,
        ...metrics
      });
    } catch (error: any) {
      console.error('[Server] Metrics error:', error);
      return c.json({
        success: false,
        error: error.message
      }, 500);
    }
  });

  // 缓存统计端点
  app.get("/make-server-fc31472c/cache/stats", async (c) => {
    console.log('[Server] Cache stats endpoint called');
    try {
      const { globalCache } = await import("../middleware/cache.tsx");
      const stats = globalCache.getStats();
      return c.json({
        success: true,
        cache: stats,
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      console.error('[Server] Cache stats error:', error);
      return c.json({
        success: false,
        error: error.message
      }, 500);
    }
  });

  // 缓存清理端点
  app.post("/make-server-fc31472c/cache/clear", async (c) => {
    console.log('[Server] Cache clear endpoint called');
    try {
      const { globalCache } = await import("../middleware/cache.tsx");
      globalCache.clear();
      return c.json({
        success: true,
        message: 'Cache cleared successfully',
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      console.error('[Server] Cache clear error:', error);
      return c.json({
        success: false,
        error: error.message
      }, 500);
    }
  });

  console.log('[Server] ✅ Monitoring routes registered');
}
