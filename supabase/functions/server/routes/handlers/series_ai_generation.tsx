/**
 * 系列AI生成Handler
 * 负责：基本信息生成、大纲生成、从创意创建漫剧
 */

import type { Context } from "npm:hono";
import { 
  callSmartAI, 
  generateBasicInfo as smartGenerateBasicInfo, 
  generateOutline as smartGenerateOutline, 
  AIScenario 
} from "../../ai/smart_ai_router.tsx";

/**
 * AI生成基本信息（剧名、简介、角色、风格）
 */
export async function generateBasicInfo(c: Context) {
  console.log("[Series] ✅ POST /series/generate-basic-info called!");
  
  try {
    const body = await c.req.json();
    const { userInput } = body; // 可能为空或有内容
    
    console.log("[Series] User input:", userInput || "无输入（随机生成）");

    let prompt: string;
    
    if (userInput && userInput.trim().length > 0) {
      // 有输入：结合输入生成
      prompt = `用户创意：${userInput}

请根据用户的创意，生成一个完整的漫剧方案，要求：
1. 积极向上，传递正能量和中国价值观
2. 适合全年龄段观众
3. 标题吸引人（15字以内）
4. 简介详细生动（80-120字）

返回JSON格式：
{
  "title": "漫剧标题",
  "description": "详细的剧集简介，包含故事背景、主要矛盾、成长主题等"
}`;
    } else {
      // 无输入：随机生成
      const randomThemes = [
        "少年追梦成长",
        "家庭温情故事", 
        "友谊与责任",
        "勇气与担当",
        "奋斗与坚持",
        "梦想与现实",
        "师生情谊",
        "青春校园"
      ];
      const randomTheme = randomThemes[Math.floor(Math.random() * randomThemes.length)];
      
      prompt = `请随机生成一个"${randomTheme}"主题的漫剧方案，要求：
1. 积极向上，传递正能量和中国价值观
2. 适合全年龄段观众
3. 标题吸引人（15字以内）
4. 简介详细生动（80-120字）
5. 故事要有新意，避免俗套

返回JSON格式：
{
  "title": "漫剧标题",
  "description": "详细的剧集简介，包含故事背景、主要矛盾、成长主题等"
}`;
    }

    console.log("[Series] 🤖 Calling AI to generate basic info...");
    
    const aiResult = await smartGenerateBasicInfo(
      prompt,
      '你是专业编剧和策划师，擅长创作正能量故事。直接返回JSON，不要额外说明。',
      { maxTokens: 1500, temperature: 0.8 }
    );

    if (!aiResult.success || !aiResult.content) {
      console.error("[Series] ❌ AI generation failed:", aiResult.error);
      return c.json({
        success: false,
        error: aiResult.error || "AI生成失败",
      }, 500);
    }

    const aiResponse = aiResult.content;
    console.log(`[Series] ✅ AI responded using ${aiResult.engine} (fallback: ${aiResult.fallbackUsed})`);
    console.log("[Series] ✅ AI returned response:", aiResponse.substring(0, 150));

    // 解析AI返回
    let result;
    try {
      const jsonMatch = aiResponse.match(/\{[\s\S]*?\}/);
      result = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
    } catch (e) {
      console.warn("[Series] Failed to parse AI JSON");
      result = null;
    }

    if (result && result.title && result.description) {
      console.log("[Series] ✅ Successfully generated:", result.title);
      return c.json({
        success: true,
        data: {
          title: result.title.substring(0, 50),
          description: result.description.substring(0, 300),
        },
      });
    } else {
      throw new Error("AI返回格式无效");
    }

  } catch (error: any) {
    console.error("[Series] Error generating basic info:", error);
    
    // Fallback: 返回默认值
    const fallbackThemes = [
      {
        title: "青春逐梦：奋斗的力量",
        description: "讲述一群年轻人为梦想拼搏的故事。他们面对挫折不放弃，用坚持和努力书写属于自己的精彩人生。传递积极向上的价值观，展现新时代青年的责任与担当。"
      },
      {
        title: "温暖的家：爱与成长",
        description: "一个普通家庭的温情故事。通过日常生活中的点滴小事，展现亲情的力量、家庭教育的智慧，以及每个家庭成员的共同成长。"
      },
      {
        title: "友谊的力量：携手前行",
        description: "讲述几位好友相互扶持、共同成长的故事。在面对学习、生活中的各种挑战时，他们用真诚和信任化解矛盾，用友谊的力量战胜困难。"
      }
    ];
    
    const fallback = fallbackThemes[Math.floor(Math.random() * fallbackThemes.length)];
    
    return c.json({
      success: true,
      data: fallback,
      fallback: true,
      message: "AI生成失败，使用默认方案",
    });
  }
}

/**
 * 生成故事大纲
 */
export async function generateOutline(c: Context) {
  console.log("[Series] ✅ POST /series/generate-outline called!");
  
  try {
    const body = await c.req.json();
    const { title, description, genre, style, totalEpisodes } = body;
    
    if (!title || !description) {
      return c.json({
        success: false,
        error: 'Title and description are required'
      }, 400);
    }

    console.log("[Series] Generating outline for:", title);

    // 🎯 优化提示词，使其更加明确和结构化
    const prompt = `请为以下漫剧生成详细的故事大纲：

【漫剧信息】
标题：${title}
简介：${description}
类型：${genre || '成长励志'}
风格：${style || '温馨治愈'}
总集数：${totalEpisodes || 10}集
${body.existingOutline ? `\n【用户已提供的大纲】\n${body.existingOutline}\n` : ''}

【创作要求】
1. 故事主线清晰完整，体现积极向上的核心价值观
2. 每集都有明确的主题、冲突和成长点
3. 角色成长轨迹清晰可见，情感真实细腻
4. 情节紧凑有吸引力，适合全年龄段观众
5. ${body.existingOutline ? '基于用户提供的大纲进行深化和完善' : '完全原创创作'}

【输出格式】
严格返回以下JSON格式（不要包含markdown代码块标记）：
{
  "mainPlot": "核心故事主线（100-200字）",
  "growthTheme": "角色成长主题（30-50字）",
  "outline": "完整故事大纲（500-1000字，包含主要角色、故事背景、主要冲突、成长路径）",
  "episodes": [
    {
      "episodeNumber": 1,
      "title": "第一集标题",
      "synopsis": "剧情梗概（80-120字）",
      "theme": "本集核心主题"
    }
  ]
}`;

    const aiResult = await smartGenerateOutline(
      prompt,
      '你是专业的影视编剧，擅长创作温暖治愈、积极向上的故事。你的作品深受观众喜爱，情感真实、情节紧凑、价值观正确。请严格按照JSON格式返回，不要添加任何额外说明或markdown标记。',
      { maxTokens: 3000, temperature: 0.85 }
    );

    if (!aiResult.success || !aiResult.content) {
      console.error("[Series] ❌ AI outline generation failed:", aiResult.error);
      return c.json({
        success: false,
        error: aiResult.error || "AI大纲生成失败",
      }, 500);
    }

    const aiResponse = aiResult.content;
    console.log(`[Series] ✅ Outline generated using ${aiResult.engine} (fallback: ${aiResult.fallbackUsed})`);
    console.log('[Series] AI Response received, length:', aiResponse?.length || 0);
    console.log('[Series] AI Response preview:', aiResponse?.substring(0, 500));

    // 解析AI返回
    let result;
    try {
      // 1. 尝试提取JSON（可能包含在markdown代码块中）
      let jsonText = aiResponse;
      
      // 移除markdown代码块标记
      jsonText = jsonText.replace(/```json\s*/g, '').replace(/```\s*/g, '');
      
      // 提取JSON对象
      const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        console.error('[Series] ❌ No JSON found in AI response');
        console.error('[Series] Full response:', aiResponse);
        throw new Error('AI response does not contain valid JSON');
      }
      
      result = JSON.parse(jsonMatch[0]);
      console.log('[Series] ✅ Successfully parsed JSON:', {
        hasMainPlot: !!result.mainPlot,
        hasGrowthTheme: !!result.growthTheme,
        hasEpisodes: !!result.episodes,
        episodesCount: result.episodes?.length || 0
      });
    } catch (e) {
      console.error('[Series] ❌ Failed to parse outline JSON:', e);
      console.error('[Series] AI Response:', aiResponse);
      result = null;
    }

    if (result && result.mainPlot && result.episodes) {
      return c.json({
        success: true,
        data: result
      });
    } else {
      // 提供更详细的错误信息
      const missingFields = [];
      if (!result) missingFields.push('整个JSON对象');
      else {
        if (!result.mainPlot) missingFields.push('mainPlot');
        if (!result.episodes) missingFields.push('episodes');
      }
      
      console.error('[Series] ❌ AI返回格式无效，缺少字段:', missingFields);
      console.error('[Series] 解析结果:', result);
      
      throw new Error(`AI返回格式无效，缺少必需字段: ${missingFields.join(', ')}`);
    }

  } catch (error: any) {
    console.error("[Series] Error generating outline:", error);
    
    return c.json({
      success: false,
      error: error.message || 'Failed to generate outline',
      fallback: true
    }, 500);
  }
}

/**
 * 从创意直接创建漫剧（一键生成）
 */
export async function createFromIdea(c: Context) {
  console.log("[Series] ✅ POST /series/create-from-idea called!");
  
  try {
    const body = await c.req.json();
    const { idea, userPhone, genre, style, totalEpisodes } = body;
    
    if (!idea || !userPhone) {
      return c.json({
        success: false,
        error: 'Idea and userPhone are required'
      }, 400);
    }

    console.log("[Series] Creating series from idea:", idea.substring(0, 50));

    // 第一步：生成基本信息
    const basicInfoPrompt = `用户创意：${idea}

生成漫剧方案，要求积极向上，适合全年龄观众。

返回JSON：
{
  "title": "标题（15字内）",
  "description": "简介（80-120字）"
}`;

    const basicInfoResult = await smartGenerateBasicInfo(
      basicInfoPrompt,
      '你是专业编剧。直接返回JSON。',
      { maxTokens: 1500, temperature: 0.8 }
    );

    if (!basicInfoResult.success || !basicInfoResult.content) {
      console.error("[Series] ❌ Basic info generation failed:", basicInfoResult.error);
      return c.json({
        success: false,
        error: basicInfoResult.error || "基本信息生成失败",
      }, 500);
    }

    const basicInfoResponse = basicInfoResult.content;
    console.log(`[Series] ✅ Basic info generated using ${basicInfoResult.engine}`);

    let basicInfo;
    try {
      const jsonMatch = basicInfoResponse.match(/\{[\s\S]*?\}/);
      basicInfo = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
    } catch (e) {
      throw new Error("生成基本信息失败");
    }

    if (!basicInfo?.title || !basicInfo?.description) {
      throw new Error("AI返回的基本信息不完整");
    }

    // 返回生成的信息，让前端决定是否继续
    return c.json({
      success: true,
      data: {
        title: basicInfo.title,
        description: basicInfo.description,
        genre: genre || '成长励志',
        style: style || '温馨治愈',
        totalEpisodes: totalEpisodes || 10
      },
      message: "基本信息生成成功，请继续完善并创建"
    });

  } catch (error: any) {
    console.error("[Series] Error creating from idea:", error);
    
    return c.json({
      success: false,
      error: error.message || 'Failed to create from idea'
    }, 500);
  }
}