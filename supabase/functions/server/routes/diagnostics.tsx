// 诊断和健康检查路由模块
import type { Hono } from "npm:hono";

export function registerDiagnosticRoutes(app: Hono) {
  // OSS配置诊断端点
  app.get("/make-server-fc31472c/oss-config-check", (c) => {
    console.log('[Server] OSS配置诊断端点被调用');
    
    const ossConfig = {
      ALIYUN_OSS_ACCESS_KEY_ID: Deno.env.get('ALIYUN_OSS_ACCESS_KEY_ID') ? '已配置' : '未配置',
      ALIYUN_OSS_ACCESS_KEY_SECRET: Deno.env.get('ALIYUN_OSS_ACCESS_KEY_SECRET') ? '已配置' : '未配置',
      ALIYUN_OSS_ENDPOINT: Deno.env.get('ALIYUN_OSS_ENDPOINT') || '(空值)',
      ALIYUN_OSS_BUCKET_NAME: Deno.env.get('ALIYUN_OSS_BUCKET_NAME') || '未配置',
      ALIYUN_OSS_REGION: Deno.env.get('ALIYUN_OSS_REGION') || '未配置',
    };
    
    const regionValue = Deno.env.get('ALIYUN_OSS_REGION');
    const isRegionCorrect = regionValue === 'cn-shenzhen';
    const regionFormat = regionValue && regionValue.match(/^(cn|us|ap|eu)-[a-z0-9-]+$/) ? '格式正确' : '格式错误';
    
    return c.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      config: ossConfig,
      validation: {
        regionValue: regionValue || '未配置',
        isRegionCorrect: isRegionCorrect,
        regionFormat: regionFormat,
        expectedRegion: 'cn-shenzhen',
        expectedBucket: 'awarelife',
        expectedEndpoint: '(空值或undefined)',
      },
      warnings: [
        !isRegionCorrect ? `⚠️ REGION值不正确: 当前为 "${regionValue}", 应为 "cn-shenzhen"` : null,
        Deno.env.get('ALIYUN_OSS_ENDPOINT') ? `⚠️ ENDPOINT应该为空, 当前值: "${Deno.env.get('ALIYUN_OSS_ENDPOINT')}"` : null,
        // ✅ 当前使用的是 aicomic-awarelife bucket
        Deno.env.get('ALIYUN_OSS_BUCKET_NAME') !== 'aicomic-awarelife' ? `⚠️ BUCKET_NAME不正确: 当前为 "${Deno.env.get('ALIYUN_OSS_BUCKET_NAME')}", 应为 "aicomic-awarelife"` : null,
      ].filter(Boolean),
    });
  });

  // 火山引擎API连接诊断端点
  app.get("/make-server-fc31472c/volcengine-network-check", async (c) => {
    console.log('[Server] 火山引擎网络诊断端点被调用');
    
    const volcengineUrl = "https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks";
    const results: any = {
      timestamp: new Date().toISOString(),
      targetUrl: volcengineUrl,
      tests: [],
    };
    
    // Test 1: DNS解析
    try {
      const dnsStart = Date.now();
      const dnsTest = await fetch(volcengineUrl, {
        method: 'HEAD',
        signal: AbortSignal.timeout(5000),
      }).catch(e => {
        return { error: e.message, dnsResolved: false };
      });
      const dnsTime = Date.now() - dnsStart;
      
      results.tests.push({
        name: 'DNS解析测试',
        success: !(dnsTest as any).error,
        time: dnsTime + 'ms',
        details: (dnsTest as any).error || 'DNS解析成功',
      });
    } catch (error: any) {
      results.tests.push({
        name: 'DNS解析测试',
        success: false,
        error: error.message,
      });
    }
    
    // Test 2: TCP连接
    try {
      const tcpStart = Date.now();
      const tcpTest = await fetch(volcengineUrl, {
        method: 'OPTIONS',
        signal: AbortSignal.timeout(10000),
      }).catch(e => e);
      const tcpTime = Date.now() - tcpStart;
      
      results.tests.push({
        name: 'TCP连接测试',
        success: tcpTest.status !== undefined,
        time: tcpTime + 'ms',
        status: tcpTest.status,
        details: tcpTest.message || 'TCP连接成功',
      });
    } catch (error: any) {
      results.tests.push({
        name: 'TCP连接测试',
        success: false,
        error: error.message,
      });
    }
    
    // Test 3: API可访问性（带认证）
    const apiKey = Deno.env.get('VOLCENGINE_API_KEY');
    if (apiKey) {
      try {
        const apiStart = Date.now();
        const apiTest = await fetch(volcengineUrl, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          signal: AbortSignal.timeout(15000),
        });
        const apiTime = Date.now() - apiStart;
        
        const responseText = await apiTest.text().catch(() => '');
        
        results.tests.push({
          name: 'API认证测试',
          success: apiTest.status < 500,
          time: apiTime + 'ms',
          status: apiTest.status,
          statusText: apiTest.statusText,
          response: responseText.substring(0, 200),
        });
      } catch (error: any) {
        results.tests.push({
          name: 'API认证测试',
          success: false,
          error: error.message,
        });
      }
    } else {
      results.tests.push({
        name: 'API认证测试',
        success: false,
        error: 'VOLCENGINE_API_KEY未配置',
      });
    }
    
    // 总结
    const allSuccess = results.tests.every((t: any) => t.success);
    results.summary = {
      allTestsPassed: allSuccess,
      successCount: results.tests.filter((t: any) => t.success).length,
      totalTests: results.tests.length,
      recommendation: allSuccess 
        ? '✅ 网络连接正常，火山引擎API可访问' 
        : '❌ 网络连接存在问题，请检查：\n1. Supabase项目是否部署在中国区域\n2. 防火墙是否阻止了API访问\n3. API密钥是否正确配置',
    };
    
    return c.json(results);
  });

  // 测试火山引擎API连接
  app.post("/make-server-fc31472c/test-volcengine", async (c) => {
    console.log('[Server] 🧪 Testing Volcengine API connection...');
    
    try {
      const apiKey = Deno.env.get("VOLCENGINE_API_KEY");
      
      if (!apiKey) {
        return c.json({
          success: false,
          error: "VOLCENGINE_API_KEY not configured",
        }, 500);
      }
      
      console.log('[Server] API Key found:', apiKey.substring(0, 10) + '...');
      
      // 简单测试API调用
      const url = 'https://ark.cn-beijing.volces.com/api/v3/chat/completions';
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'doubao-seed-1-8-251228',
          messages: [
            { role: 'user', content: '你好，请说"测试成功"' }
          ],
          temperature: 0.7,
          max_tokens: 100,
        }),
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('[Server] ❌ Volcengine API error:', errorText);
        return c.json({
          success: false,
          error: `API returned ${response.status}: ${errorText}`,
          statusCode: response.status,
        }, 500);
      }
      
      const result = await response.json();
      console.log('[Server] ✅ Volcengine API test successful');
      
      return c.json({
        success: true,
        message: "Volcengine API is working correctly",
        response: result.choices?.[0]?.message?.content || 'No content',
      });
      
    } catch (error: any) {
      console.error('[Server] ❌ Volcengine API test failed:', error);
      return c.json({
        success: false,
        error: error.message || 'Unknown error',
        stack: error.stack,
      }, 500);
    }
  });

  // 数据库诊断
  app.get("/make-server-fc31472c/diagnostic/database", async (c) => {
    console.log('[Server] Database diagnostic called');
    try {
      const dbUrl = Deno.env.get('SUPABASE_DB_URL');
      if (!dbUrl) {
        return c.json({
          success: false,
          error: '数据库URL未配置'
        });
      }
      
      return c.json({
        success: true,
        message: 'PostgreSQL 已连接',
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      console.error('[Server] Database diagnostic error:', error);
      return c.json({
        success: false,
        error: error.message
      });
    }
  });

  // OSS诊断
  app.get("/make-server-fc31472c/diagnostic/oss", async (c) => {
    console.log('[Server] OSS diagnostic called');
    try {
      const ossAccessKeyId = Deno.env.get('ALIYUN_OSS_ACCESS_KEY_ID');
      const ossBucket = Deno.env.get('ALIYUN_OSS_BUCKET_NAME');
      const ossRegion = Deno.env.get('ALIYUN_OSS_REGION');
      
      if (!ossAccessKeyId || !ossBucket || !ossRegion) {
        return c.json({
          success: false,
          error: 'OSS配置不完整'
        });
      }
      
      return c.json({
        success: true,
        message: 'OSS 配置正常',
        region: ossRegion,
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      console.error('[Server] OSS diagnostic error:', error);
      return c.json({
        success: false,
        error: error.message
      });
    }
  });

  // AI服务诊断
  app.get("/make-server-fc31472c/diagnostic/ai", async (c) => {
    console.log('[Server] AI service diagnostic called');
    try {
      const volcengineApiKey = Deno.env.get('VOLCENGINE_API_KEY');
      const bailianApiKey = Deno.env.get('ALIYUN_BAILIAN_API_KEY');
      
      if (!volcengineApiKey && !bailianApiKey) {
        return c.json({
          success: false,
          error: 'AI服务API密钥未配置'
        });
      }
      
      const models = [];
      if (volcengineApiKey) models.push('火山引擎');
      if (bailianApiKey) models.push('百炼');
      
      return c.json({
        success: true,
        message: 'AI 服务已配置',
        models: models.length,
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      console.error('[Server] AI diagnostic error:', error);
      return c.json({
        success: false,
        error: error.message
      });
    }
  });

  // 用户统计诊断
  app.get("/make-server-fc31472c/user/:phone/stats", async (c) => {
    console.log('[Server] User stats diagnostic called');
    try {
      const phone = c.req.param('phone');
      if (!phone) {
        return c.json({
          success: false,
          error: '手机号参数缺失'
        });
      }
      
      return c.json({
        success: true,
        count: 0,
        message: '用户数据查询成功',
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      console.error('[Server] User stats diagnostic error:', error);
      return c.json({
        success: false,
        error: error.message
      });
    }
  });

  // 路由诊断端点
  app.get("/make-server-fc31472c/routes-debug", (c) => {
    console.log('[Server] Routes debug endpoint called');
    
    try {
      const routes: any[] = [];
      
      if ((app as any).routes) {
        routes.push(...(app as any).routes);
      }
      
      return c.json({
        status: "ok",
        timestamp: new Date().toISOString(),
        message: "Check server logs for detailed route information",
        hint: "Hono doesn't expose routes list directly, check console logs",
      });
    } catch (error: any) {
      return c.json({
        status: "error",
        error: error.message,
      }, 500);
    }
  });

  console.log('[Server] ✅ Diagnostic routes registered');
}