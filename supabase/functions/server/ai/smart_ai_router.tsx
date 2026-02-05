/**
 * 🚀 智能AI路由器 - 统一管理AI引擎调用
 * 
 * 核心功能：
 * 1. 火山引擎优先策略
 * 2. 根据功能类型智能选择最优模型
 * 3. 异常时自动降级到阿里百炼
 * 4. 完整的日志追踪和错误处理
 * 
 * @version 1.0.0
 * @date 2025-01-27
 */

import { callVolcengineAI } from './volcengine_ai_engine.tsx';
import { callQwenAPI } from './aliyun_tongyi.tsx';

// ============= 配置部分 =============

/**
 * AI引擎枚举
 */
export enum AIEngine {
  VOLCENGINE = 'volcengine', // 火山引擎（优先）
  ALIYUN_QWEN = 'aliyun_qwen', // 阿里百炼（降级）
}

/**
 * 应用场景类型
 */
export enum AIScenario {
  // 创作类（需要高创意）
  STORY_GENERATION = 'story_generation',           // 故事生成
  EPISODE_GENERATION = 'episode_generation',       // 剧集生成
  CHARACTER_CREATION = 'character_creation',       // 角色创建
  STORYBOARD_GENERATION = 'storyboard_generation', // 分镜生成
  
  // 分析类（需要高理解）
  CONTENT_ANALYSIS = 'content_analysis',           // 内容分析
  SERIES_ANALYSIS = 'series_analysis',             // 剧集分析
  
  // 优化类（需要高准确）
  PROMPT_POLISH = 'prompt_polish',                 // 提示词优化
  CONTENT_MODERATION = 'content_moderation',       // 内容审核
  
  // 生成类（需要结构化）
  BASIC_INFO_GENERATION = 'basic_info_generation', // 基本信息生成
  OUTLINE_GENERATION = 'outline_generation',       // 大纲生成
  
  // 通用类
  GENERAL = 'general',                             // 通用场景
}

/**
 * 引擎配置策略
 */
interface EngineStrategy {
  primary: AIEngine;      // 主引擎（优先使用）
  fallback: AIEngine;     // 备用引擎（降级使用）
  reason: string;         // 选择原因
}

/**
 * 场景 → 引擎策略映射
 * 🎯 核心规则：火山引擎优先，根据场景特点选择最优模型
 */
const SCENARIO_ENGINE_MAP: Record<AIScenario, EngineStrategy> = {
  // 创作类：火山引擎擅长中文创作，优先使用
  [AIScenario.STORY_GENERATION]: {
    primary: AIEngine.VOLCENGINE,
    fallback: AIEngine.ALIYUN_QWEN,
    reason: '火山引擎豆包模型在中文故事创作方面表现优秀',
  },
  [AIScenario.EPISODE_GENERATION]: {
    primary: AIEngine.VOLCENGINE,
    fallback: AIEngine.ALIYUN_QWEN,
    reason: '火山引擎对长篇剧集结构理解更好',
  },
  [AIScenario.CHARACTER_CREATION]: {
    primary: AIEngine.VOLCENGINE,
    fallback: AIEngine.ALIYUN_QWEN,
    reason: '火山引擎在角色设定和性格描述方面更出色',
  },
  [AIScenario.STORYBOARD_GENERATION]: {
    primary: AIEngine.VOLCENGINE,
    fallback: AIEngine.ALIYUN_QWEN,
    reason: '火山引擎对画面感和镜头语言理解更准确',
  },
  
  // 分析类：火山引擎优先，理解能力强
  [AIScenario.CONTENT_ANALYSIS]: {
    primary: AIEngine.VOLCENGINE,
    fallback: AIEngine.ALIYUN_QWEN,
    reason: '火山引擎在内容理解和分析方面表现稳定',
  },
  [AIScenario.SERIES_ANALYSIS]: {
    primary: AIEngine.VOLCENGINE,
    fallback: AIEngine.ALIYUN_QWEN,
    reason: '火山引擎对剧集结构分析更准确',
  },
  
  // 优化类：阿里百炼在prompt理解和内容审核方面有优势，但仍优先火山
  [AIScenario.PROMPT_POLISH]: {
    primary: AIEngine.VOLCENGINE,
    fallback: AIEngine.ALIYUN_QWEN,
    reason: '火山引擎优先，百炼作为备选',
  },
  [AIScenario.CONTENT_MODERATION]: {
    primary: AIEngine.VOLCENGINE,
    fallback: AIEngine.ALIYUN_QWEN,
    reason: '火山引擎优先，百炼内容审核作为备选',
  },
  
  // 生成类：火山引擎在结构化生成方面表现好
  [AIScenario.BASIC_INFO_GENERATION]: {
    primary: AIEngine.VOLCENGINE,
    fallback: AIEngine.ALIYUN_QWEN,
    reason: '火山引擎JSON格式生成更稳定',
  },
  [AIScenario.OUTLINE_GENERATION]: {
    primary: AIEngine.VOLCENGINE,
    fallback: AIEngine.ALIYUN_QWEN,
    reason: '火山引擎在大纲生成方面结构更清晰',
  },
  
  // 通用类：默认火山引擎
  [AIScenario.GENERAL]: {
    primary: AIEngine.VOLCENGINE,
    fallback: AIEngine.ALIYUN_QWEN,
    reason: '通用场景默认使用火山引擎',
  },
};

/**
 * AI调用选项
 */
export interface SmartAIOptions {
  scenario?: AIScenario;           // 应用场景（推荐指定）
  temperature?: number;             // 温度参数 (0-1)
  maxTokens?: number;               // 最大token数
  modelType?: 'simple' | 'creative' | 'complex' | 'reasoning'; // 模型类型（兼容旧版）
  timeoutMs?: number;               // 超时时间（毫秒）
  enableFallback?: boolean;         // 是否启用降级（默认true）
  forceEngine?: AIEngine;           // 强制使用指定引擎（调试用）
}

/**
 * AI调用结果
 */
export interface SmartAIResult {
  success: boolean;
  content?: string;
  engine: AIEngine;
  fallbackUsed: boolean;
  error?: string;
  executionTime: number;
}

// ============= 核心功能 =============

/**
 * 🚀 智能AI调用 - 主入口函数
 * 
 * @param prompt 用户提示词
 * @param systemPrompt 系统提示词（可选）
 * @param options 调用选项
 * @returns AI生成结果
 */
export async function callSmartAI(
  prompt: string,
  systemPrompt?: string,
  options: SmartAIOptions = {}
): Promise<SmartAIResult> {
  const startTime = Date.now();
  
  // 1. 确定使用场景
  const scenario = options.scenario || AIScenario.GENERAL;
  
  // 2. 获取引擎策略
  const strategy = SCENARIO_ENGINE_MAP[scenario];
  
  // 3. 确定主引擎和备用引擎
  const primaryEngine = options.forceEngine || strategy.primary;
  const fallbackEngine = strategy.fallback;
  const enableFallback = options.enableFallback !== false;
  
  console.log(`[SmartAI] ========== AI调用开始 ==========`);
  console.log(`[SmartAI] 场景: ${scenario}`);
  console.log(`[SmartAI] 主引擎: ${primaryEngine}`);
  console.log(`[SmartAI] 备用引擎: ${fallbackEngine}`);
  console.log(`[SmartAI] 策略原因: ${strategy.reason}`);
  console.log(`[SmartAI] 降级开关: ${enableFallback ? '启用' : '禁用'}`);
  
  // 4. 尝试使用主引擎
  try {
    console.log(`[SmartAI] 🔥 调用主引擎: ${primaryEngine}`);
    const content = await callEngine(primaryEngine, prompt, systemPrompt, options);
    
    const executionTime = Date.now() - startTime;
    console.log(`[SmartAI] ✅ 主引擎调用成功 (${executionTime}ms)`);
    
    return {
      success: true,
      content,
      engine: primaryEngine,
      fallbackUsed: false,
      executionTime,
    };
    
  } catch (primaryError: any) {
    console.error(`[SmartAI] ❌ 主引擎调用失败: ${primaryError.message}`);
    
    // 5. 如果启用降级，尝试备用引擎
    if (enableFallback) {
      console.log(`[SmartAI] 🔄 启动自动降级: ${primaryEngine} → ${fallbackEngine}`);
      
      try {
        const content = await callEngine(fallbackEngine, prompt, systemPrompt, options);
        
        const executionTime = Date.now() - startTime;
        console.log(`[SmartAI] ✅ 备用引擎调用成功 (${executionTime}ms)`);
        
        return {
          success: true,
          content,
          engine: fallbackEngine,
          fallbackUsed: true,
          executionTime,
        };
        
      } catch (fallbackError: any) {
        console.error(`[SmartAI] ❌ 备用引擎也失败: ${fallbackError.message}`);
        
        const executionTime = Date.now() - startTime;
        return {
          success: false,
          engine: fallbackEngine,
          fallbackUsed: true,
          error: `主引擎和备用引擎均失败。主引擎错误: ${primaryError.message}; 备用引擎错误: ${fallbackError.message}`,
          executionTime,
        };
      }
    } else {
      // 降级未启用，直接返回失败
      const executionTime = Date.now() - startTime;
      return {
        success: false,
        engine: primaryEngine,
        fallbackUsed: false,
        error: primaryError.message,
        executionTime,
      };
    }
  }
}

/**
 * 调用指定AI引擎
 */
async function callEngine(
  engine: AIEngine,
  prompt: string,
  systemPrompt?: string,
  options: SmartAIOptions = {}
): Promise<string> {
  switch (engine) {
    case AIEngine.VOLCENGINE:
      return await callVolcengineAI(prompt, systemPrompt, {
        temperature: options.temperature,
        maxTokens: options.maxTokens,
        modelType: options.modelType,
        timeoutMs: options.timeoutMs,
      });
      
    case AIEngine.ALIYUN_QWEN:
      // 阿里百炼使用 qwen-max 模型
      return await callQwenAPI(prompt, systemPrompt, 'qwen-max');
      
    default:
      throw new Error(`不支持的AI引擎: ${engine}`);
  }
}

// ============= 便捷函数 =============

/**
 * 故事生成（优先火山引擎）
 */
export async function generateStory(
  prompt: string,
  systemPrompt?: string,
  options: SmartAIOptions = {}
): Promise<SmartAIResult> {
  return callSmartAI(prompt, systemPrompt, {
    ...options,
    scenario: AIScenario.STORY_GENERATION,
  });
}

/**
 * 剧集生成（优先火山引擎）
 */
export async function generateEpisodes(
  prompt: string,
  systemPrompt?: string,
  options: SmartAIOptions = {}
): Promise<SmartAIResult> {
  return callSmartAI(prompt, systemPrompt, {
    ...options,
    scenario: AIScenario.EPISODE_GENERATION,
  });
}

/**
 * 角色创建（优先火山引擎）
 */
export async function createCharacter(
  prompt: string,
  systemPrompt?: string,
  options: SmartAIOptions = {}
): Promise<SmartAIResult> {
  return callSmartAI(prompt, systemPrompt, {
    ...options,
    scenario: AIScenario.CHARACTER_CREATION,
  });
}

/**
 * 分镜生成（优先火山引擎）
 */
export async function generateStoryboard(
  prompt: string,
  systemPrompt?: string,
  options: SmartAIOptions = {}
): Promise<SmartAIResult> {
  return callSmartAI(prompt, systemPrompt, {
    ...options,
    scenario: AIScenario.STORYBOARD_GENERATION,
  });
}

/**
 * 基本信息生成（优先火山引擎）
 */
export async function generateBasicInfo(
  prompt: string,
  systemPrompt?: string,
  options: SmartAIOptions = {}
): Promise<SmartAIResult> {
  return callSmartAI(prompt, systemPrompt, {
    ...options,
    scenario: AIScenario.BASIC_INFO_GENERATION,
  });
}

/**
 * 大纲生成（优先火山引擎）
 */
export async function generateOutline(
  prompt: string,
  systemPrompt?: string,
  options: SmartAIOptions = {}
): Promise<SmartAIResult> {
  return callSmartAI(prompt, systemPrompt, {
    ...options,
    scenario: AIScenario.OUTLINE_GENERATION,
  });
}

/**
 * 内容审核（优先火山引擎）
 */
export async function moderateContent(
  prompt: string,
  systemPrompt?: string,
  options: SmartAIOptions = {}
): Promise<SmartAIResult> {
  return callSmartAI(prompt, systemPrompt, {
    ...options,
    scenario: AIScenario.CONTENT_MODERATION,
  });
}

/**
 * 检查AI引擎是否可用
 */
export async function checkEngineAvailability(engine: AIEngine): Promise<boolean> {
  try {
    const testPrompt = '测试';
    await callEngine(engine, testPrompt, undefined, { 
      maxTokens: 10,
      timeoutMs: 5000,
    });
    return true;
  } catch (error) {
    console.error(`[SmartAI] 引擎 ${engine} 不可用:`, error);
    return false;
  }
}

/**
 * 获取当前引擎状态
 */
export async function getEngineStatus() {
  const volcengineAvailable = await checkEngineAvailability(AIEngine.VOLCENGINE);
  const qwenAvailable = await checkEngineAvailability(AIEngine.ALIYUN_QWEN);
  
  return {
    volcengine: {
      available: volcengineAvailable,
      engine: AIEngine.VOLCENGINE,
      priority: 'primary',
    },
    aliyun_qwen: {
      available: qwenAvailable,
      engine: AIEngine.ALIYUN_QWEN,
      priority: 'fallback',
    },
  };
}

console.log('[SmartAI] ✅ 智能AI路由器已加载');
console.log('[SmartAI] 🔥 默认策略: 火山引擎优先，异常时自动降级到阿里百炼');
