/**
 * 分镜自动生成模块
 * 从 ai/auto_series_generator.tsx 提取
 * 负责：为剧集生成分镜场景
 */

import * as db from '../../database/series.tsx';
import * as volcAI from '../volcengine_ai_engine.tsx';
import { AUTO_GENERATION_CONFIG } from './config.tsx';

/**
 * 🎬 为单个剧集生成分镜（调用真实AI）
 */
export async function generateStoryboardsForEpisode(
  episode: db.Episode,
  characters: db.Character[],
  style: string
): Promise<Omit<db.Storyboard, 'id' | 'created_at' | 'updated_at'>[]> {
  const targetScenes = AUTO_GENERATION_CONFIG.SCENES_PER_EPISODE;
  const sceneDuration = AUTO_GENERATION_CONFIG.SCENE_DURATION;
  
  const characterList = characters.map(c => `${c.name}（${c.description}）`).join('、');
  
  const systemPrompt = `你是专业的分镜师，擅长将故事拆分成视觉场景。

要求：
1. 创建${targetScenes}个分镜场景
2. 每个场景${sceneDuration}秒左右
3. 场景要有视觉冲击力和情感张力
4. 适合AI视频生成

返回JSON数组格式：
[
  {
    "sceneNumber": 1,
    "description": "详细的场景描述（50字以上，包含视觉细节）",
    "dialogue": "对话内容（如有）",
    "characters": ["角色名"],
    "location": "地点",
    "timeOfDay": "morning|noon|afternoon|evening|night",
    "cameraAngle": "close-up|medium|wide|overhead|low-angle",
    "duration": 8,
    "emotionalTone": "情感基调",
    "growthInsight": "成长启示"
  }
]`;

  const prompt = `剧集标题：${episode.title}
剧集简介：${episode.synopsis}
角色列表：${characterList}
风格：${style}

请为这集创建${targetScenes}个分镜场景，返回JSON数组。`;

  try {
    const response = await volcAI.callVolcengineAI(prompt, systemPrompt, {
      modelType: 'creative',
      scenario: 'STORYBOARD_GENERATION',
      maxTokens: 2000,
      temperature: 0.8,
    });
    
    // 解析AI返回的JSON
    let jsonText = response.trim();
    const jsonMatch = jsonText.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      jsonText = jsonMatch[0];
    }
    
    // 解析JSON（增强容错）
    let scenesData;
    try {
      scenesData = JSON.parse(jsonText);
    } catch (e) {
      console.warn('[StoryboardGen] JSON parse failed, using fallback');
      scenesData = [];
    }
    
    if (!Array.isArray(scenesData) || scenesData.length === 0) {
      throw new Error('AI返回的分镜数据无效');
    }
    
    // 转换为数据库格式
    return scenesData.map((scene: any, idx: number) => ({
      episode_id: episode.id,
      scene_number: scene.sceneNumber || (idx + 1),
      description: scene.description || episode.synopsis,
      dialogue: scene.dialogue,
      characters: scene.characters || [],
      location: scene.location || '场景',
      time_of_day: scene.timeOfDay || 'day',
      camera_angle: scene.cameraAngle || 'medium',
      duration: scene.duration || sceneDuration,
      emotional_tone: scene.emotionalTone,
      growth_insight: scene.growthInsight,
      status: 'draft' as const,
    }));
    
  } catch (error: any) {
    console.error('[StoryboardGen] AI storyboard generation failed:', error);
    throw error;
  }
}
