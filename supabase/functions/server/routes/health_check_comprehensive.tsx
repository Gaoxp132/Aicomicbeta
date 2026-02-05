/**
 * 综合健康检查路由
 * 提供详细的系统健康状态报告
 */

import { Hono } from "npm:hono";
import type { Context } from "npm:hono";
import { supabase } from "../database/client.tsx";

const PREFIX = '/make-server-fc31472c';
const app = new Hono();

/**
 * 全面健康检查
 */
app.get(`${PREFIX}/health/comprehensive`, async (c: Context) => {
  const startTime = Date.now();
  const report: any = {
    timestamp: new Date().toISOString(),
    version: 'v3.1.0',
    status: 'healthy',
    checks: {},
  };

  // 1. 数据库健康检查
  try {
    const dbStart = Date.now();
    const { data, error } = await supabase
      .from('users')
      .select('phone', { count: 'exact', head: true })
      .limit(1);

    report.checks.database = {
      status: error ? 'unhealthy' : 'healthy',
      responseTime: Date.now() - dbStart + 'ms',
      error: error?.message,
    };
  } catch (error: any) {
    report.checks.database = {
      status: 'unhealthy',
      error: error.message,
    };
    report.status = 'degraded';
  }

  // 2. 环境变量检查
  const envVars = {
    VOLCENGINE_API_KEY: !!Deno.env.get('VOLCENGINE_API_KEY'),
    ALIYUN_OSS_ACCESS_KEY_ID: !!Deno.env.get('ALIYUN_OSS_ACCESS_KEY_ID'),
    ALIYUN_OSS_ACCESS_KEY_SECRET: !!Deno.env.get('ALIYUN_OSS_ACCESS_KEY_SECRET'),
    ALIYUN_OSS_BUCKET_NAME: !!Deno.env.get('ALIYUN_OSS_BUCKET_NAME'),
    ALIYUN_OSS_REGION: !!Deno.env.get('ALIYUN_OSS_REGION'),
    ALIYUN_BAILIAN_API_KEY: !!Deno.env.get('ALIYUN_BAILIAN_API_KEY'),
    SUPABASE_URL: !!Deno.env.get('SUPABASE_URL'),
    SUPABASE_ANON_KEY: !!Deno.env.get('SUPABASE_ANON_KEY'),
    SUPABASE_SERVICE_ROLE_KEY: !!Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
    SUPABASE_DB_URL: !!Deno.env.get('SUPABASE_DB_URL'),
  };

  const missingEnvVars = Object.entries(envVars)
    .filter(([_, value]) => !value)
    .map(([key]) => key);

  report.checks.environment = {
    status: missingEnvVars.length === 0 ? 'healthy' : 'degraded',
    configured: Object.keys(envVars).length - missingEnvVars.length,
    missing: missingEnvVars,
    total: Object.keys(envVars).length,
  };

  if (missingEnvVars.length > 0) {
    report.status = 'degraded';
  }

  // 3. 性能指标检查
  try {
    const { getPerformanceMetrics } = await import("../middleware/performance.tsx");
    const metrics = getPerformanceMetrics();
    
    report.checks.performance = {
      status: 'healthy',
      metrics: {
        requests: metrics.performance.requests.total,
        errorRate: metrics.performance.requests.errorRate,
        avgDuration: metrics.performance.performance.avgDuration,
        concurrency: metrics.performance.concurrency.current,
        maxConcurrency: metrics.performance.concurrency.max,
      },
    };

    // 检查错误率
    const errorRate = parseFloat(metrics.performance.requests.errorRate);
    if (errorRate > 10) {
      report.checks.performance.status = 'degraded';
      report.checks.performance.warning = 'High error rate detected';
      report.status = 'degraded';
    }
  } catch (error: any) {
    report.checks.performance = {
      status: 'unknown',
      error: error.message,
    };
  }

  // 4. 缓存健康检查
  try {
    const { globalCache } = await import("../middleware/cache.tsx");
    const cacheStats = globalCache.getStats();
    
    report.checks.cache = {
      status: 'healthy',
      stats: {
        size: cacheStats.cacheSize,
        hitRate: cacheStats.hitRate,
        memoryUsage: cacheStats.memoryUsage,
      },
    };

    // 检查缓存使用率
    const usage = parseFloat(cacheStats.memoryUsage);
    if (usage > 90) {
      report.checks.cache.status = 'degraded';
      report.checks.cache.warning = 'Cache usage is high';
    }
  } catch (error: any) {
    report.checks.cache = {
      status: 'unknown',
      error: error.message,
    };
  }

  // 5. AI服务检查（快速ping）
  try {
    const volcengineKey = Deno.env.get('VOLCENGINE_API_KEY');
    if (volcengineKey) {
      const aiStart = Date.now();
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      try {
        const response = await fetch(
          'https://ark.cn-beijing.volces.com/api/v3/chat/completions',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${volcengineKey}`,
            },
            body: JSON.stringify({
              model: 'doubao-seed-1-8-251228',
              messages: [{ role: 'user', content: 'ping' }],
              max_tokens: 1,
            }),
            signal: controller.signal,
          }
        );

        clearTimeout(timeoutId);

        report.checks.ai_service = {
          status: response.ok ? 'healthy' : 'degraded',
          responseTime: Date.now() - aiStart + 'ms',
          statusCode: response.status,
        };

        if (!response.ok) {
          report.status = 'degraded';
        }
      } catch (fetchError: any) {
        clearTimeout(timeoutId);
        report.checks.ai_service = {
          status: 'unhealthy',
          error: fetchError.message,
        };
        report.status = 'degraded';
      }
    } else {
      report.checks.ai_service = {
        status: 'not_configured',
        message: 'VOLCENGINE_API_KEY not set',
      };
    }
  } catch (error: any) {
    report.checks.ai_service = {
      status: 'error',
      error: error.message,
    };
  }

  // 6. OSS服务检查
  const ossConfig = {
    accessKeyId: Deno.env.get('ALIYUN_OSS_ACCESS_KEY_ID'),
    bucket: Deno.env.get('ALIYUN_OSS_BUCKET_NAME'),
    region: Deno.env.get('ALIYUN_OSS_REGION'),
  };

  report.checks.oss_service = {
    status: ossConfig.accessKeyId && ossConfig.bucket && ossConfig.region
      ? 'configured'
      : 'not_configured',
    configured: !!(ossConfig.accessKeyId && ossConfig.bucket && ossConfig.region),
    region: ossConfig.region || 'not_set',
  };

  // 7. 数据库表检查
  try {
    const tables = [
      'users',
      'video_tasks',
      'works',
      'likes',
      'comments',
      'series',
      'characters',
      'episodes',
      'storyboards',
    ];

    const tableChecks = await Promise.all(
      tables.map(async (table) => {
        try {
          const { error } = await supabase
            .from(table)
            .select('*', { count: 'exact', head: true })
            .limit(1);

          return {
            table,
            status: error ? 'error' : 'ok',
            error: error?.message,
          };
        } catch (e: any) {
          return {
            table,
            status: 'error',
            error: e.message,
          };
        }
      })
    );

    const healthyTables = tableChecks.filter((t) => t.status === 'ok').length;
    report.checks.database_tables = {
      status: healthyTables === tables.length ? 'healthy' : 'degraded',
      total: tables.length,
      healthy: healthyTables,
      tables: tableChecks,
    };

    if (healthyTables < tables.length) {
      report.status = 'degraded';
    }
  } catch (error: any) {
    report.checks.database_tables = {
      status: 'error',
      error: error.message,
    };
  }

  // 总耗时
  report.totalResponseTime = Date.now() - startTime + 'ms';

  // 确定最终状态
  const checkStatuses = Object.values(report.checks).map((check: any) => check.status);
  if (checkStatuses.includes('unhealthy') || checkStatuses.includes('error')) {
    report.status = 'unhealthy';
  } else if (checkStatuses.includes('degraded')) {
    report.status = 'degraded';
  }

  const httpStatus = report.status === 'healthy' ? 200 : report.status === 'degraded' ? 503 : 500;

  return c.json(report, httpStatus);
});

/**
 * 快速健康检查（仅基础信息）
 */
app.get(`${PREFIX}/health/quick`, (c: Context) => {
  return c.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: 'v3.1.0',
    uptime: process.uptime ? process.uptime() + 's' : 'N/A',
  });
});

/**
 * 数据库连接池状态
 */
app.get(`${PREFIX}/health/database`, async (c: Context) => {
  try {
    const startTime = Date.now();
    
    // 测试查询
    const { data, error } = await supabase
      .from('users')
      .select('phone', { count: 'exact' })
      .limit(1);

    if (error) throw error;

    const responseTime = Date.now() - startTime;

    return c.json({
      status: 'healthy',
      responseTime: responseTime + 'ms',
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    return c.json({
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date().toISOString(),
    }, 500);
  }
});

/**
 * 系统资源状态
 */
app.get(`${PREFIX}/health/resources`, async (c: Context) => {
  try {
    // Deno内存使用情况
    const memoryUsage = Deno.memoryUsage();

    const report = {
      status: 'ok',
      timestamp: new Date().toISOString(),
      memory: {
        heapTotal: (memoryUsage.heapTotal / 1024 / 1024).toFixed(2) + ' MB',
        heapUsed: (memoryUsage.heapUsed / 1024 / 1024).toFixed(2) + ' MB',
        external: (memoryUsage.external / 1024 / 1024).toFixed(2) + ' MB',
        rss: (memoryUsage.rss / 1024 / 1024).toFixed(2) + ' MB',
      },
    };

    return c.json(report);
  } catch (error: any) {
    return c.json({
      status: 'error',
      error: error.message,
    }, 500);
  }
});

console.log('[HealthCheck] ✅ Comprehensive health check routes initialized');

export function registerHealthCheckRoutes(parentApp: Hono) {
  parentApp.route("/", app);
}
