/**
 * AI诊断服务
 * 用于检查AI功能是否正常工作
 */

import { apiRequest } from '@/app/utils/apiClient';

export interface AIDiagnosisResult {
  timestamp: string;
  environment: {
    VOLCENGINE_API_KEY: string;
    ALIYUN_BAILIAN_API_KEY: string;
    hasVolcKey: boolean;
    hasAliyunKey: boolean;
  };
  tests: {
    basicInfo?: {
      success: boolean;
      engine: string;
      fallbackUsed: boolean;
      executionTime: number;
      contentLength: number;
      contentPreview?: string;
      error?: string;
    };
    story?: {
      success: boolean;
      engine: string;
      fallbackUsed: boolean;
      executionTime: number;
      contentLength: number;
      error?: string;
    };
  };
  summary: {
    totalTests: number;
    passed: number;
    failed: number;
    status: string;
    recommendation: string;
    critical?: string;
  };
}

/**
 * 执行AI诊断
 */
export async function diagnoseAI(): Promise<{
  success: boolean;
  data?: AIDiagnosisResult;
  error?: string;
}> {
  try {
    console.log('[AIDiagnosisService] 🔍 Starting AI diagnosis...');
    
    const result = await apiRequest('/ai/diagnose', {
      method: 'GET',
    });
    
    if (result.success === false) {
      return {
        success: false,
        error: result.error || 'AI诊断失败',
      };
    }
    
    console.log('[AIDiagnosisService] ✅ AI diagnosis completed');
    return {
      success: true,
      data: result as AIDiagnosisResult,
    };
  } catch (error: any) {
    console.error('[AIDiagnosisService] ❌ Diagnosis error:', error);
    return {
      success: false,
      error: error.message || 'AI诊断请求失败',
    };
  }
}

/**
 * 测试特定场景
 */
export async function testScenario(
  scenario: string,
  prompt: string
): Promise<{
  success: boolean;
  result?: any;
  error?: string;
}> {
  try {
    const result = await apiRequest('/ai/test-scenario', {
      method: 'POST',
      body: JSON.stringify({ scenario, prompt }),
    });
    
    return result;
  } catch (error: any) {
    return {
      success: false,
      error: error.message,
    };
  }
}
