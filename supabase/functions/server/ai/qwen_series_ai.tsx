/**
 * 从故事大纲提取角色
 */

import { callVolcengineAI } from './volcengine_ai_engine.tsx';
import { 
  preModerateUserInput, 
  postModerateGeneratedContent,
  performFullModeration,
  AUDIENCE_GROUPS,
  VALUE_THEMES
} from './content_moderation.tsx';

// 类型定义
interface Character {
  name: string;
  description: string;
  appearance: string;
  personality: string;
  role: string;
  growthArc: string;
  coreValues: string[];
}

async function extractCharacters(storyOutline: string): Promise<Character[]> {
  console.log('[VolcengineSeriesAI] Extracting characters from story outline...');
  
  const systemPrompt = `你是一个专业的角色设计师。从故事大纲中识别并详细描述所有主要角色。

要求：
1. 提取所有主要角色（3-5个）
2. 每个角色要有名字、描述、外貌、性格、角色定位
3. 确保角色符合正向价值观
4. 返回JSON数组

返回格式：
[
  {
    "name": "角色名",
    "description": "角色简介",
    "appearance": "外貌描述",
    "personality": "性格特点",
    "role": "主角|配角|反派",
    "growthArc": "成长弧线",
    "coreValues": ["价值观1", "价值观2"]
  }
]`;

  const prompt = `故事大纲：${storyOutline}\n\n请分析并提取所有主要角色，返回JSON格式。`;
  
  try {
    const response = await callVolcengineAI(prompt, systemPrompt, {
      modelType: 'creative',
      maxTokens: 2000,
      temperature: 0.7,
      timeoutMs: 60000
    });
    
    let jsonText = response.trim();
    const jsonMatch = jsonText.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      jsonText = jsonMatch[0];
    }
    
    const characters = JSON.parse(jsonText);
    console.log('[VolcengineSeriesAI] ✅ Extracted', characters.length, 'characters');
    
    return characters;
  } catch (error: any) {
    console.error('[VolcengineSeriesAI] Failed to extract characters:', error);
    // 返回默认角色
    return generateDefaultCharacters(storyOutline);
  }
}

/**
 * 生成分集大纲
 */
async function generateEpisodes(
  storyOutline: string,
  totalEpisodes: number,
  characters: Character[]
): Promise<any[]> {
  console.log('[VolcengineSeriesAI] Generating', totalEpisodes, 'episodes...');
  
  const characterList = characters.map(c => c.name).join('、');
  
  const systemPrompt = `你是一个专业的编剧。将故事大纲拆分为${totalEpisodes}集，每集包含完整的剧情和场景。

要求：
1. 每集有明确的主题和目标
2. 剧情连贯，逐步推进
3. 每集包含4个场景
4. 每个场景要详细描述画面
5. 返回JSON数组

返回格式：
[
  {
    "episodeNumber": 1,
    "title": "集标题",
    "synopsis": "剧情简介",
    "scenes": [
      {
        "sceneNumber": 1,
        "description": "场景描述",
        "dialogue": "对话",
        "characters": ["角色名"],
        "location": "地点",
        "timeOfDay": "morning|noon|afternoon|evening|night",
        "cameraAngle": "close-up|medium|wide",
        "duration": 8
      }
    ]
  }
]`;

  const prompt = `故事大纲：${storyOutline}\n\n可用角色：${characterList}\n\n请将故事拆分为${totalEpisodes}集，每集4个场景，返回JSON格式。`;
  
  try {
    const response = await callVolcengineAI(prompt, systemPrompt, {
      modelType: 'creative',
      maxTokens: 3000,
      temperature: 0.75,
      timeoutMs: 90000
    });
    
    let jsonText = response.trim();
    const jsonMatch = jsonText.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      jsonText = jsonMatch[0];
    }
    
    const episodes = JSON.parse(jsonText);
    console.log('[VolcengineSeriesAI] ✅ Generated', episodes.length, 'episodes');
    
    return episodes;
  } catch (error: any) {
    console.error('[VolcengineSeriesAI] Failed to generate episodes:', error);
    // 返回默认剧集
    return generateDefaultEpisodes(storyOutline, totalEpisodes);
  }
}

/**
 * 生成默认角色（备用方案）
 */
function generateDefaultCharacters(storyOutline: string): Character[] {
  console.log('[VolcengineSeriesAI] Using default characters...');
  
  return [
    {
      name: '主角',
      description: '故事的主人公，积极向上，勇于面对挑战',
      appearance: '年轻、充满活力',
      personality: '乐观、坚韧、善良',
      role: '主角',
      growthArc: '从迷茫到自信，从依赖到独立',
      coreValues: ['勇气', '坚持', '善良'],
    },
    {
      name: '导师',
      description: '经验丰富的引路人，给予主角指导和帮助',
      appearance: '成熟稳重',
      personality: '睿智、耐心、关怀',
      role: '配角',
      growthArc: '传承智慧，见证成长',
      coreValues: ['智慧', '奉献', '责任'],
    },
  ];
}

/**
 * 生成默认剧集（备用方案）
 */
function generateDefaultEpisodes(storyOutline: string, totalEpisodes: number): any[] {
  console.log('[VolcengineSeriesAI] Using default episodes structure...');
  
  const episodes = [];
  
  for (let i = 0; i < totalEpisodes; i++) {
    episodes.push({
      episodeNumber: i + 1,
      title: `第${i + 1}集：${storyOutline.slice(0, 10)}...`,
      synopsis: `${storyOutline.slice(0, 100)}...`,
      scenes: [
        {
          sceneNumber: 1,
          description: `第${i + 1}集开场场景`,
          dialogue: '对话内容',
          characters: ['主角'],
          location: '场景地点',
          timeOfDay: 'morning',
          cameraAngle: 'medium',
          duration: 8,
        },
        {
          sceneNumber: 2,
          description: `第${i + 1}集发展场景`,
          dialogue: '对话内容',
          characters: ['主角', '配角'],
          location: '场景地点',
          timeOfDay: 'noon',
          cameraAngle: 'medium',
          duration: 8,
        },
        {
          sceneNumber: 3,
          description: `第${i + 1}集高潮场景`,
          dialogue: '对话内容',
          characters: ['主角'],
          location: '场景地点',
          timeOfDay: 'afternoon',
          cameraAngle: 'close-up',
          duration: 8,
        },
        {
          sceneNumber: 4,
          description: `第${i + 1}集结尾场景`,
          dialogue: '对话内容',
          characters: ['主角', '配角'],
          location: '场景地点',
          timeOfDay: 'evening',
          cameraAngle: 'wide',
          duration: 8,
        },
      ],
    });
  }
  
  return episodes;
}

// ==================== 导出函数 ====================

/**
 * 综合分析故事大纲（主入口）
 */
export async function analyzeStoryOutline(
  storyOutline: string,
  seriesId: string,
  totalEpisodes: number
): Promise<{ characters: Character[]; episodes: Episode[] }> {
  console.log('[VolcengineSeriesAI] Starting comprehensive story analysis...');

  try {
    // 第一步：提取角色
    const characters = await extractCharacters(storyOutline);
    
    // 第二步：生成分集大纲
    const episodesData = await generateEpisodes(storyOutline, totalEpisodes, characters);
    
    // 第三步：转换为完整的Episode对象
    const now = new Date().toISOString();
    const episodes: any[] = episodesData.map((ep, index) => ({
      id: `ep-${Date.now()}-${index}`,
      seriesId,
      episodeNumber: ep.episodeNumber,
      title: ep.title,
      synopsis: ep.synopsis,
      storyboards: ep.scenes.map((scene, idx) => ({
        id: `sb-${Date.now()}-${index}-${idx}`,
        episodeId: `ep-${Date.now()}-${index}`,
        sceneNumber: scene.sceneNumber,
        description: scene.description,
        dialogue: scene.dialogue,
        characters: scene.characters,
        location: scene.location,
        timeOfDay: scene.timeOfDay,
        cameraAngle: scene.cameraAngle,
        duration: scene.duration,
        status: 'draft',
      })),
      totalDuration: ep.scenes.reduce((sum: number, s: any) => sum + s.duration, 0),
      status: 'draft',
      createdAt: now,
      updatedAt: now,
    }));

    console.log('[VolcengineSeriesAI] ✅ Comprehensive analysis completed');
    
    return { characters, episodes };
    
  } catch (error: any) {
    console.error('[VolcengineSeriesAI] Analysis failed, using fallback:', error);
    
    // 使用备用方案
    const characters = await extractCharacters(storyOutline);
    const episodes = generateDefaultEpisodes(storyOutline, totalEpisodes).map((ep, index) => {
      const now = new Date().toISOString();
      return {
        id: `ep-${Date.now()}-${index}`,
        seriesId,
        episodeNumber: ep.episodeNumber,
        title: ep.title,
        synopsis: ep.synopsis,
        storyboards: ep.scenes.map((scene: any, idx: number) => ({
          id: `sb-${Date.now()}-${index}-${idx}`,
          episodeId: `ep-${Date.now()}-${index}`,
          sceneNumber: scene.sceneNumber,
          description: scene.description,
          dialogue: scene.dialogue,
          characters: scene.characters,
          location: scene.location,
          timeOfDay: scene.timeOfDay,
          cameraAngle: scene.cameraAngle,
          duration: scene.duration,
          status: 'draft',
        })),
        totalDuration: ep.scenes.reduce((sum: number, s: any) => sum + s.duration, 0),
        status: 'draft',
        createdAt: now,
        updatedAt: now,
      };
    });
    
    return { characters, episodes };
  }
}

/**
 * 生成分镜（简化版，用于单个剧集）
 */
export async function generateStoryboards(
  synopsis: string,
  episodeId: string,
  characters: Character[]
): Promise<any[]> {
  console.log('[VolcengineSeriesAI] Generating storyboards from synopsis...');

  const characterList = characters.map(c => c.name).join('、');
  
  const systemPrompt = `你是一个专业的分镜师。将剧情简介拆分为8-12个具体的场景分镜。

要求：
1. 每个场景要有明确的画面感
2. 描述要详细且适合AI视频生成
3. 包含场景位置、时间段、镜头角度
4. 合理分配角色出场
5. 返回JSON数组

返回格式：
[
  {
    "sceneNumber": 1,
    "description": "详细的场景描述",
    "dialogue": "对话内容（可选）",
    "characters": ["角色名"],
    "location": "场景位置",
    "timeOfDay": "morning|noon|afternoon|evening|night",
    "cameraAngle": "close-up|medium|wide|overhead|low-angle",
    "duration": 8
  }
]`;

  const prompt = `剧情简介：${synopsis}

可用角色：${characterList}

请将这个剧情拆分为8-12个场景分镜，返回JSON格式。`;

  try {
    const response = await callVolcengineAI(prompt, systemPrompt, {
      modelType: 'creative',
      maxTokens: 2500,
      temperature: 0.75,
      timeoutMs: 60000
    });
    
    let jsonText = response.trim();
    const jsonMatch = jsonText.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      jsonText = jsonMatch[0];
    }
    
    const scenesData = JSON.parse(jsonText);
    
    return scenesData.map((scene: any, index: number) => ({
      id: `sb-${Date.now()}-${index}`,
      episodeId,
      sceneNumber: scene.sceneNumber || (index + 1),
      description: scene.description,
      dialogue: scene.dialogue,
      characters: scene.characters || [],
      location: scene.location || `场景${index + 1}`,
      timeOfDay: scene.timeOfDay || 'morning',
      cameraAngle: scene.cameraAngle || 'medium',
      duration: scene.duration || 8,
      status: 'draft',
    }));
    
  } catch (error: any) {
    console.error('[VolcengineSeriesAI] Failed to generate storyboards:', error);
    throw error;
  }
}

/**
 * 从简单想法创建完整漫剧（快速创作模式）
 */
export async function createCompleteSeriesFromIdea(
  userInput: string,
  options: {
    targetAudience?: string;
    preferredThemes?: string[];
    totalEpisodes?: number;
    scriptGenre?: string;
  }
): Promise<{
  title: string;
  theme: string;
  storyOutline: string;
  characters: Character[];
  episodes: any[];
  coreValues: string[];
  coherenceCheck: string;
  moderationResult?: any; // 新增：审核结果
}> {
  console.log('[VolcengineSeriesAI] Creating complete series from idea...');
  console.log('[VolcengineSeriesAI] User input:', userInput);
  console.log('[VolcengineSeriesAI] Options:', options);

  const totalEpisodes = options.totalEpisodes || 5;
  const targetAudience = options.targetAudience || 'universal';
  
  // ⭐ 新增：前置审核 - 检查用户输入
  console.log('[VolcengineSeriesAI] 🔍 Step 0: Pre-moderation check...');
  const preModeration = await preModerateUserInput(userInput, targetAudience);
  
  if (!preModeration.passed) {
    console.error('[VolcengineSeriesAI] ❌ Pre-moderation failed:', preModeration.issues);
    throw new Error(`内容审核未通过：${preModeration.issues.join('; ')}`);
  }
  
  if (preModeration.severity === 'warning') {
    console.warn('[VolcengineSeriesAI] ⚠️ Pre-moderation warning:', preModeration.issues);
  }
  
  try {
    // 步骤1：根据用户输入生成完整的故事大纲
    // 获取受众群体的内容规则
    const audienceRules = AUDIENCE_GROUPS[targetAudience as keyof typeof AUDIENCE_GROUPS];
    const audienceContentRules = audienceRules ? audienceRules.contentRules.join('\n') : '';
    
    const systemPrompt = `你是一个专业的编剧和故事创作专家。基于用户的简短想法，创作一个完整的漫剧故事大纲。

⚠️ 重要：内容必须符合中国价值观要求和受众适配性！

要求：
1. 故事要有明确的主题和价值观
2. 适合${audienceRules?.label || '所有受众'}（${audienceRules?.ageRange || '所有年龄'}）观看
3. 类型：${options.scriptGenre || '现实生活'}
4. 共${totalEpisodes}集
5. 传递正向价值观：积极向上、符合社会主义核心价值观
6. 受众内容规则：
${audienceContentRules}
7. 返回JSON格式

返回格式：
{
  "title": "故事标题",
  "theme": "故事主题",
  "storyOutline": "完整的故事大纲（200-300字）",
  "coreValues": ["核心价值观1", "核心价值观2"],
  "coherenceCheck": "故事连贯性检查说明"
}`;

    const prompt = `用户想法：${userInput}\n\n请基于这个想法，创作一个完整的${totalEpisodes}集漫剧故事大纲，返回JSON格式。`;
    
    const response = await callVolcengineAI(prompt, systemPrompt, {
      modelType: 'creative',
      maxTokens: 2000,
      temperature: 0.8,
      timeoutMs: 60000
    });
    
    // 解析AI返回的JSON
    let jsonText = response.trim();
    const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      jsonText = jsonMatch[0];
    }
    
    const storyData = JSON.parse(jsonText);
    
    console.log('[VolcengineSeriesAI] ✅ Story outline generated:', storyData.title);
    
    // 步骤2：基于故事大纲提取角色和生成剧集
    const tempSeriesId = `temp-${Date.now()}`;
    const analysis = await analyzeStoryOutline(
      storyData.storyOutline,
      tempSeriesId,
      totalEpisodes
    );
    
    // ⭐ 新增：后置审核 - 检查AI生成的内容
    console.log('[VolcengineSeriesAI] 🔍 Step 3: Post-moderation check...');
    const postModeration = await postModerateGeneratedContent(
      {
        title: storyData.title,
        storyOutline: storyData.storyOutline,
        theme: storyData.theme,
        episodes: analysis.episodes,
      },
      targetAudience
    );
    
    console.log('[VolcengineSeriesAI] 📊 Post-moderation result:');
    console.log('[VolcengineSeriesAI]   Passed:', postModeration.passed);
    console.log('[VolcengineSeriesAI]   Score:', postModeration.score);
    console.log('[VolcengineSeriesAI]   Themes:', postModeration.valueAnalysis.detectedThemes);
    
    if (!postModeration.passed) {
      console.warn('[VolcengineSeriesAI] ⚠️ Post-moderation issues:', postModeration.issues);
      // 不阻止创建，但记录问题
    }
    
    // 返回完整结果
    return {
      title: storyData.title || '未命名故事',
      theme: storyData.theme || '成长故事',
      storyOutline: storyData.storyOutline,
      coreValues: storyData.coreValues || ['积极向上', '勇气', '坚持'],
      coherenceCheck: storyData.coherenceCheck || '故事结构完整',
      characters: analysis.characters,
      episodes: analysis.episodes,
      moderationResult: {
        pre: preModeration,
        post: postModeration,
        finalScore: (postModeration.score * 0.8) + (preModeration.passed ? 20 : 0),
        detectedThemes: postModeration.valueAnalysis.detectedThemes,
      }, // 新增：完整审核结果
    };
    
  } catch (error: any) {
    console.error('[VolcengineSeriesAI] Failed to create series from idea:', error);
    
    // 返回备用方案
    const tempSeriesId = `temp-${Date.now()}`;
    const fallbackOutline = `这是一个关于${userInput}的故事。主人公通过一系列冒险和挑战，最终实现了自我成长和价值实现。`;
    
    const analysis = await analyzeStoryOutline(fallbackOutline, tempSeriesId, totalEpisodes);
    
    return {
      title: `${userInput}的故事`,
      theme: '成长与挑战',
      storyOutline: fallbackOutline,
      coreValues: ['勇气', '坚持', '成长'],
      coherenceCheck: '故事结构完整',
      characters: analysis.characters,
      episodes: analysis.episodes,
      moderationResult: preModeration, // 新增：审核结果
    };
  }
}