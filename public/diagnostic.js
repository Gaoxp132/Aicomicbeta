/**
 * 网络诊断脚本
 * 在浏览器控制台中运行此脚本进行快速诊断
 * 
 * 使用方法：
 * 1. 按 F12 打开浏览器控制台
 * 2. 复制并粘贴此脚本到控制台
 * 3. 按 Enter 运行
 */

(async function runDiagnostics() {
  console.clear();
  console.log('%c🔍 AI漫剧应用 - 网络诊断工具', 'color: #3b82f6; font-size: 20px; font-weight: bold;');
  console.log('%c═══════════════════════════════════════', 'color: #6b7280;');
  console.log('');

  const results = [];
  let passedTests = 0;
  const totalTests = 6;

  // 辅助函数
  const logTest = (name, status, message, details = null) => {
    const icon = status === 'success' ? '✅' : status === 'error' ? '❌' : '⚠️';
    const color = status === 'success' ? '#10b981' : status === 'error' ? '#ef4444' : '#f59e0b';
    
    console.log(`%c${icon} ${name}`, `color: ${color}; font-weight: bold;`);
    console.log(`  ${message}`);
    if (details) {
      console.log(`  详情:`, details);
    }
    console.log('');

    results.push({ name, status, message, details });
    if (status === 'success') passedTests++;
  };

  const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

  // 测试 1: 网络连接
  try {
    if (!navigator.onLine) {
      throw new Error('无网络连接');
    }
    logTest('网络连接', 'success', '网络连接正常');
  } catch (error) {
    logTest('网络连接', 'error', error.message, '请检查您的网络连接');
  }

  await sleep(100);

  // 测试 2: Supabase 配置
  try {
    // 尝试从页面中获取配置
    const scripts = Array.from(document.querySelectorAll('script'));
    let projectId = null;
    let publicAnonKey = null;

    // 检查是否有全局变量
    if (window.__SUPABASE_CONFIG__) {
      projectId = window.__SUPABASE_CONFIG__.projectId;
      publicAnonKey = window.__SUPABASE_CONFIG__.publicAnonKey;
    }

    // 从脚本内容中查找
    if (!projectId) {
      for (const script of scripts) {
        if (script.textContent && script.textContent.includes('supabase.co')) {
          const match = script.textContent.match(/([a-z]{20})\.supabase\.co/);
          if (match) {
            projectId = match[1];
            break;
          }
        }
      }
    }

    if (!projectId) {
      throw new Error('未找到项目ID配置');
    }

    window.__TEST_PROJECT_ID__ = projectId;
    window.__TEST_PUBLIC_ANON_KEY__ = publicAnonKey;

    logTest('Supabase 配置', 'success', '配置已找到', {
      projectId: projectId.substring(0, 8) + '...',
      hasAnonKey: !!publicAnonKey
    });
  } catch (error) {
    logTest('Supabase 配置', 'error', error.message, '请检查 /utils/supabase/info.tsx 文件');
  }

  await sleep(100);

  // 测试 3: Edge Function 健康检查
  if (window.__TEST_PROJECT_ID__) {
    try {
      const startTime = Date.now();
      const url = `https://${window.__TEST_PROJECT_ID__}.supabase.co/functions/v1/health`;
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      
      const response = await fetch(url, {
        method: 'GET',
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      const duration = Date.now() - startTime;
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      logTest('Edge Function', 'success', 'Edge Function 运行正常', {
        status: data.status,
        duration: `${duration}ms`,
        version: data.deploymentVersion
      });
    } catch (error) {
      if (error.name === 'AbortError') {
        logTest('Edge Function', 'error', '请求超时(10秒)', 'Edge Function 可能未启动或响应缓慢');
      } else {
        logTest('Edge Function', 'error', error.message, '请检查 Edge Function 是否已部署');
      }
    }

    await sleep(100);

    // 测试 4: API 认证
    if (window.__TEST_PUBLIC_ANON_KEY__) {
      try {
        const startTime = Date.now();
        const url = `https://${window.__TEST_PROJECT_ID__}.supabase.co/functions/v1/make-server-fc31472c/health`;
        
        const response = await fetch(url, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${window.__TEST_PUBLIC_ANON_KEY__}`,
            'Content-Type': 'application/json',
          },
        });
        
        const duration = Date.now() - startTime;
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        
        logTest('API 认证', 'success', '认证成功', {
          duration: `${duration}ms`,
          modulesLoaded: data.modulesLoaded,
          version: data.deploymentVersion
        });
      } catch (error) {
        logTest('API 认证', 'error', error.message, '请检查 API 密钥配置');
      }

      await sleep(100);

      // 测试 5: 数据库连接
      try {
        const startTime = Date.now();
        const url = `https://${window.__TEST_PROJECT_ID__}.supabase.co/functions/v1/make-server-fc31472c/db-health`;
        
        const response = await fetch(url, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${window.__TEST_PUBLIC_ANON_KEY__}`,
            'Content-Type': 'application/json',
          },
        });
        
        const duration = Date.now() - startTime;
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.status !== 'ok') {
          throw new Error(data.error || '数据库不健康');
        }
        
        logTest('数据库连接', 'success', '数据库连接正常', {
          duration: `${duration}ms`
        });
      } catch (error) {
        logTest('数据库连接', 'error', error.message, '请检查数据库配置');
      }

      await sleep(100);

      // 测试 6: 社区 API
      try {
        const startTime = Date.now();
        const url = `https://${window.__TEST_PROJECT_ID__}.supabase.co/functions/v1/make-server-fc31472c/community/series?page=1&limit=1`;
        
        const response = await fetch(url, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${window.__TEST_PUBLIC_ANON_KEY__}`,
            'Content-Type': 'application/json',
          },
        });
        
        const duration = Date.now() - startTime;
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        
        const data = await response.json();
        
        logTest('社区 API', 'success', 'API 正常运行', {
          duration: `${duration}ms`,
          itemsReturned: data.data?.length || 0
        });
      } catch (error) {
        logTest('社区 API', 'error', error.message, '请检查后端路由配置');
      }
    } else {
      logTest('API 认证', 'error', '缺少 API 密钥', '跳过后续测试');
      logTest('数据库连接', 'error', '缺少 API 密钥', '跳过此测试');
      logTest('社区 API', 'error', '缺少 API 密钥', '跳过此测试');
    }
  } else {
    logTest('Edge Function', 'error', '缺少项目ID', '跳过此测试');
    logTest('API 认证', 'error', '缺少项目ID', '跳过此测试');
    logTest('数据库连接', 'error', '缺少项目ID', '跳过此测试');
    logTest('社区 API', 'error', '缺少项目ID', '跳过此测试');
  }

  // 总结
  console.log('%c═══════════════════════════════════════', 'color: #6b7280;');
  console.log('%c📊 诊断结果总结', 'color: #3b82f6; font-size: 16px; font-weight: bold;');
  console.log('');

  const successRate = ((passedTests / totalTests) * 100).toFixed(0);
  const status = passedTests === totalTests ? '🎉 全部通过' : 
                 passedTests >= totalTests / 2 ? '⚠️ 部分通过' : 
                 '❌ 大部分失败';

  console.log(`%c${status}`, 'font-size: 18px; font-weight: bold;');
  console.log(`通过率: ${passedTests}/${totalTests} (${successRate}%)`);
  console.log('');

  // 建议
  const failedTests = results.filter(r => r.status === 'error');
  if (failedTests.length > 0) {
    console.log('%c💡 修复建议:', 'color: #f59e0b; font-weight: bold;');
    console.log('');
    
    failedTests.forEach(test => {
      console.log(`%c${test.name}:`, 'font-weight: bold;');
      if (test.details) {
        console.log(`  ${test.details}`);
      }
      console.log('');
    });

    console.log('%c查看完整修复指南:', 'font-weight: bold;');
    console.log('  https://your-app-url/NETWORK_FIX_GUIDE.md');
    console.log('');
    console.log('%c或者点击应用右下角的蓝色 Activity 按钮使用可视化诊断工具', 'color: #3b82f6;');
  } else {
    console.log('%c✅ 所有检查都通过了！应用应该可以正常工作。', 'color: #10b981; font-weight: bold;');
  }

  console.log('');
  console.log('%c═══════════════════════════════════════', 'color: #6b7280;');

  // 导出结果供后续使用
  window.__DIAGNOSTIC_RESULTS__ = results;
  console.log('%c提示: 诊断结果已保存到 window.__DIAGNOSTIC_RESULTS__', 'color: #6b7280; font-style: italic;');
})();
