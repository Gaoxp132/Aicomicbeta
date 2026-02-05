/**
 * AI功能诊断工具
 * 用于快速检查AI服务是否正常工作
 */

import type { Context } from "npm:hono";
import { callSmartAI, AIScenario } from "../../ai/smart_ai_router.tsx";

/**
 * 诊断AI服务状态
 */
export async function diagnoseAI(c: Context) {
  console.log('[AIDiagnosis] ========== 开始诊断AI服务 ==========');
  
  const results: any = {
    timestamp: new Date().toISOString(),
    environment: {},
    tests: {},
    summary: {
      totalTests: 0,
      passed: 0,
      failed: 0,
    }
  };
  
  try {
    // 1. 检查环境变量
    console.log('[AIDiagnosis] Step 1: 检查环境变量...');
    const volcKey = Deno.env.get('VOLCENGINE_API_KEY');
    const aliyunKey = Deno.env.get('ALIYUN_BAILIAN_API_KEY');
    
    results.environment = {
      VOLCENGINE_API_KEY: volcKey ? `${volcKey.substring(0, 10)}...${volcKey.substring(volcKey.length - 5)}` : '❌ 未配置',
      ALIYUN_BAILIAN_API_KEY: aliyunKey ? `${aliyunKey.substring(0, 10)}...${aliyunKey.substring(aliyunKey.length - 5)}` : '❌ 未配置',
      hasVolcKey: !!volcKey,
      hasAliyunKey: !!aliyunKey,
    };
    
    if (!volcKey && !aliyunKey) {
      results.summary.critical = '⚠️ 警告：未配置任何AI引擎的API密钥！';
      return c.json(results);
    }
    
    // 2. 测试基本信息生成
    console.log('[AIDiagnosis] Step 2: 测试基本信息生成...');
    results.summary.totalTests++;
    
    try {
      const basicInfoResult = await callSmartAI(
        '生成一个简单的漫剧标题和简介',
        '你是编剧，返回JSON格式：{"title": "标题", "description": "简介"}',
        {
          scenario: AIScenario.BASIC_INFO_GENERATION,
          maxTokens: 300,
          temperature: 0.7,
          timeoutMs: 30000, // 30秒超时
        }
      );
      
      results.tests.basicInfo = {
        success: basicInfoResult.success,
        engine: basicInfoResult.engine,
        fallbackUsed: basicInfoResult.fallbackUsed,
        executionTime: basicInfoResult.executionTime,
        contentLength: basicInfoResult.content?.length || 0,
        contentPreview: basicInfoResult.content?.substring(0, 100),
        error: basicInfoResult.error,
      };
      
      if (basicInfoResult.success) {
        results.summary.passed++;
      } else {
        results.summary.failed++;
      }
    } catch (error: any) {
      results.tests.basicInfo = {
        success: false,
        error: error.message,
      };
      results.summary.failed++;
    }
    
    // 3. 测试故事生成
    console.log('[AIDiagnosis] Step 3: 测试故事生成...');
    results.summary.totalTests++;
    
    try {
      const storyResult = await callSmartAI(
        '创建一个关于友谊的简单故事',
        '你是专业故事作家',
        {
          scenario: AIScenario.STORY_GENERATION,
          maxTokens: 200,
          temperature: 0.8,
          timeoutMs: 30000,
        }
      );
      
      results.tests.story = {
        success: storyResult.success,
        engine: storyResult.engine,
        fallbackUsed: storyResult.fallbackUsed,
        executionTime: storyResult.executionTime,
        contentLength: storyResult.content?.length || 0,
        error: storyResult.error,
      };
      
      if (storyResult.success) {
        results.summary.passed++;
      } else {
        results.summary.failed++;
      }
    } catch (error: any) {
      results.tests.story = {
        success: false,
        error: error.message,
      };
      results.summary.failed++;
    }
    
    // 4. 生成诊断报告
    console.log('[AIDiagnosis] Step 4: 生成诊断报告...');
    
    results.summary.status = results.summary.failed === 0 ? '✅ 所有测试通过' : '⚠️ 部分测试失败';
    results.summary.recommendation = generateRecommendation(results);
    
    console.log('[AIDiagnosis] ========== 诊断完成 ==========');
    console.log('[AIDiagnosis] 通过:', results.summary.passed);
    console.log('[AIDiagnosis] 失败:', results.summary.failed);
    
    return c.json(results);
    
  } catch (error: any) {
    console.error('[AIDiagnosis] ❌ 诊断过程出错:', error);
    
    results.summary.critical = `诊断失败: ${error.message}`;
    
    return c.json(results, 500);
  }
}

/**
 * 生成修复建议
 */
function generateRecommendation(results: any): string {
  const recommendations: string[] = [];
  
  // 检查环境变量
  if (!results.environment.hasVolcKey) {
    recommendations.push('⚠️ 未配置火山引擎API密钥 (VOLCENGINE_API_KEY)');
  }
  
  if (!results.environment.hasAliyunKey) {
    recommendations.push('⚠️ 未配置阿里百炼API密钥 (ALIYUN_BAILIAN_API_KEY)');
  }
  
  // 检查测试结果
  if (results.tests.basicInfo && !results.tests.basicInfo.success) {
    recommendations.push('❌ 基本信息生成失败，请检查API密钥是否有效');
  }
  
  if (results.tests.story && !results.tests.story.success) {
    recommendations.push('❌ 故事生成失败，请检查API配额是否充足');
  }
  
  if (recommendations.length === 0) {
    return '✅ AI服务运行正常！';
  }
  
  return recommendations.join('\n');
}

/**
 * 快速测试单个场景
 */
export async function testScenario(c: Context) {
  const { scenario = 'BASIC_INFO_GENERATION', prompt = '测试' } = await c.req.json();
  
  console.log(`[AIDiagnosis] Testing scenario: ${scenario}`);
  
  try {
    const result = await callSmartAI(
      prompt,
      '你是AI助手',
      {
        scenario: AIScenario[scenario as keyof typeof AIScenario] || AIScenario.GENERAL,
        maxTokens: 300,
        timeoutMs: 30000,
      }
    );
    
    return c.json({
      success: true,
      result,
    });
  } catch (error: any) {
    return c.json({
      success: false,
      error: error.message,
    }, 500);
  }
}
