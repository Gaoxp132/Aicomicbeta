/**
 * 网络诊断服务
 * 用于检测和修复网络连接问题
 */

import { projectId, publicAnonKey } from '/utils/supabase/info';

export interface DiagnosticResult {
  success: boolean;
  message: string;
  details?: any;
  suggestions?: string[];
}

/**
 * 检查基本网络连接
 */
export async function checkNetworkConnection(): Promise<DiagnosticResult> {
  if (!navigator.onLine) {
    return {
      success: false,
      message: '无网络连接',
      suggestions: [
        '请检查您的网络连接',
        '确保WiFi或移动数据已开启',
      ],
    };
  }

  return {
    success: true,
    message: '网络连接正常',
  };
}

/**
 * 检查 Supabase 配置
 */
export async function checkSupabaseConfig(): Promise<DiagnosticResult> {
  if (!projectId || projectId === 'undefined') {
    return {
      success: false,
      message: 'Supabase 项目ID未配置',
      suggestions: [
        '请检查 /utils/supabase/info.tsx 文件',
        '确保 projectId 已正确设置',
      ],
    };
  }

  if (!publicAnonKey || publicAnonKey === 'undefined') {
    return {
      success: false,
      message: 'Supabase API密钥未配置',
      suggestions: [
        '请检查 /utils/supabase/info.tsx 文件',
        '确保 publicAnonKey 已正确设置',
      ],
    };
  }

  return {
    success: true,
    message: 'Supabase 配置正常',
    details: {
      projectId: projectId.substring(0, 8) + '...',
      keyLength: publicAnonKey.length,
    },
  };
}

/**
 * 检查 Edge Function 健康状态
 */
export async function checkEdgeFunctionHealth(): Promise<DiagnosticResult> {
  const url = `https://${projectId}.supabase.co/functions/v1/health`;
  
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    
    const startTime = Date.now();
    const response = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);
    const duration = Date.now() - startTime;
    
    if (!response.ok) {
      return {
        success: false,
        message: `Edge Function 返回错误: HTTP ${response.status}`,
        details: {
          status: response.status,
          statusText: response.statusText,
          duration,
        },
        suggestions: [
          'Edge Function 可能未部署或已停止',
          '请检查 Supabase Dashboard 中的 Edge Functions',
          '尝试重新部署 Edge Function',
        ],
      };
    }
    
    const data = await response.json();
    
    return {
      success: true,
      message: 'Edge Function 运行正常',
      details: {
        status: data.status,
        duration,
        version: data.deploymentVersion,
      },
    };
  } catch (error: any) {
    if (error.name === 'AbortError') {
      return {
        success: false,
        message: 'Edge Function 请求超时(10秒)',
        suggestions: [
          'Edge Function 响应太慢',
          '可能是服务器负载过高',
          '尝试稍后再试',
        ],
      };
    }
    
    return {
      success: false,
      message: `Edge Function 连接失败: ${error.message}`,
      suggestions: [
        '检查 Supabase 项目是否正常运行',
        '确认 Edge Function 已部署',
        '检查网络防火墙设置',
      ],
    };
  }
}

/**
 * 检查 API 认证
 */
export async function checkApiAuth(): Promise<DiagnosticResult> {
  const url = `https://${projectId}.supabase.co/functions/v1/make-server-fc31472c/health`;
  
  try {
    const startTime = Date.now();
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${publicAnonKey}`,
        'Content-Type': 'application/json',
      },
    });
    
    const duration = Date.now() - startTime;
    
    if (!response.ok) {
      return {
        success: false,
        message: `API 认证失败: HTTP ${response.status}`,
        details: {
          status: response.status,
          statusText: response.statusText,
          duration,
        },
        suggestions: [
          '检查 API 密钥是否正确',
          '确认 Edge Function 的 CORS 配置',
          '检查 Supabase 项目设置',
        ],
      };
    }
    
    const data = await response.json();
    
    return {
      success: true,
      message: 'API 认证成功',
      details: {
        status: data.status,
        duration,
        modulesLoaded: data.modulesLoaded,
        version: data.deploymentVersion,
      },
    };
  } catch (error: any) {
    return {
      success: false,
      message: `API 认证请求失败: ${error.message}`,
      suggestions: [
        '检查网络连接',
        '确认 API 端点正确',
        '尝试刷新页面',
      ],
    };
  }
}

/**
 * 检查数据库连接
 */
export async function checkDatabaseConnection(): Promise<DiagnosticResult> {
  const url = `https://${projectId}.supabase.co/functions/v1/make-server-fc31472c/db-health`;
  
  try {
    const startTime = Date.now();
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${publicAnonKey}`,
        'Content-Type': 'application/json',
      },
    });
    
    const duration = Date.now() - startTime;
    
    if (!response.ok) {
      return {
        success: false,
        message: `数据库连接检查失败: HTTP ${response.status}`,
        details: {
          status: response.status,
          duration,
        },
        suggestions: [
          '数据库可能未配置',
          '检查 Supabase 数据库状态',
          '确认环境变量设置',
        ],
      };
    }
    
    const data = await response.json();
    
    if (data.status !== 'ok') {
      return {
        success: false,
        message: '数据库不健康',
        details: data,
        suggestions: [
          '数据库连接有问题',
          '检查数据库日志',
          '联系技术支持',
        ],
      };
    }
    
    return {
      success: true,
      message: '数据库连接正常',
      details: {
        status: data.status,
        duration,
      },
    };
  } catch (error: any) {
    return {
      success: false,
      message: `数据库连接失败: ${error.message}`,
      suggestions: [
        '数据库服务可能不可用',
        '检查 Supabase 服务状态',
        '尝试稍后再试',
      ],
    };
  }
}

/**
 * 检查社区API
 */
export async function checkCommunityApi(): Promise<DiagnosticResult> {
  const url = `https://${projectId}.supabase.co/functions/v1/make-server-fc31472c/community/series?page=1&limit=1`;
  
  try {
    const startTime = Date.now();
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${publicAnonKey}`,
        'Content-Type': 'application/json',
      },
    });
    
    const duration = Date.now() - startTime;
    
    if (!response.ok) {
      return {
        success: false,
        message: `社区API请求失败: HTTP ${response.status}`,
        details: {
          status: response.status,
          duration,
        },
        suggestions: [
          '社区服务可能未启动',
          '检查后端路由配置',
          '查看服务器日志',
        ],
      };
    }
    
    const data = await response.json();
    
    return {
      success: true,
      message: '社区API正常',
      details: {
        duration,
        itemsReturned: data.data?.length || 0,
      },
    };
  } catch (error: any) {
    return {
      success: false,
      message: `社区API连接失败: ${error.message}`,
      suggestions: [
        '网络连接可能中断',
        '后端服务可能未运行',
        '尝试刷新页面',
      ],
    };
  }
}

/**
 * 执行完整诊断
 */
export async function performFullDiagnostics(): Promise<{
  overallSuccess: boolean;
  results: Record<string, DiagnosticResult>;
  summary: string;
}> {
  console.log('[NetworkDiagnostics] Starting full diagnostics...');
  
  const results: Record<string, DiagnosticResult> = {};
  
  // 依次执行所有检查
  results.network = await checkNetworkConnection();
  results.config = await checkSupabaseConfig();
  
  // 如果基础配置有问题，不继续后续检查
  if (!results.config.success) {
    return {
      overallSuccess: false,
      results,
      summary: '配置错误 - 无法继续检查',
    };
  }
  
  results.edgeFunction = await checkEdgeFunctionHealth();
  results.apiAuth = await checkApiAuth();
  results.database = await checkDatabaseConnection();
  results.communityApi = await checkCommunityApi();
  
  // 计算总体成功率
  const totalChecks = Object.keys(results).length;
  const successfulChecks = Object.values(results).filter(r => r.success).length;
  const overallSuccess = successfulChecks === totalChecks;
  
  const summary = `${successfulChecks}/${totalChecks} 检查通过`;
  
  console.log('[NetworkDiagnostics] Diagnostics complete:', summary);
  
  return {
    overallSuccess,
    results,
    summary,
  };
}

/**
 * 获取修复建议
 */
export function getFixSuggestions(results: Record<string, DiagnosticResult>): string[] {
  const suggestions: string[] = [];
  
  for (const [key, result] of Object.entries(results)) {
    if (!result.success && result.suggestions) {
      suggestions.push(`【${key}】`, ...result.suggestions, '');
    }
  }
  
  if (suggestions.length === 0) {
    suggestions.push('所有检查都通过了！');
  }
  
  return suggestions;
}
