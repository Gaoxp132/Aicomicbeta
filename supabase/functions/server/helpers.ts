/**
 * 辅助函数模块 - 电影学辅助功能 + JSON修复 + 空dialogue补填
 * v6.0.85: 新增 repairTruncatedStoryboardJSON, detectAndFillEmptyDialogues
 * v6.0.77: getCinematographyBlock
 */

import { PRODUCTION_TYPE_PROMPTS } from "./constants.ts";

/**
 * 根据作品类型生成专业化的分镜提示词增强块
 */
export function getCinematographyBlock(productionType?: string): string {
  const pt = productionType && PRODUCTION_TYPE_PROMPTS[productionType]
    ? PRODUCTION_TYPE_PROMPTS[productionType]
    : PRODUCTION_TYPE_PROMPTS.short_drama;

  return `
【作品类型：${pt.label}】
- 叙事风格：${pt.narrativeStyle}
- 镜头语言：${pt.shotStyle}
- 剪辑节奏：${pt.editingStyle}
- 色彩基调：${pt.colorTone}

【专业镜头语言规范——必须遵守】
景别运用（必须在cameraAngle字段使用以下术语）：
- 大远景/远景：建立空间感和场景氛围（每集开场和结尾必用）
- 中景：展示人物互动和肢体语言（对话场景标配）
- 中近景/近景：捕捉表情变化和情感传递（情感高潮必用）
- 特写/大特写：强调关键物品或微表情（反转时刻必用）

镜头角度（融入description描述中）：
- 平视：客观叙，日常对话场景
- 仰拍：强化角色气势、权威、胜利感
- 俯拍：暗示渺小、压迫、孤独
- 倾斜(荷兰角)：不安、疯狂、心理失衡
- POV主观：代入角色视角，恐怖/悬疑场景

构图原则：
- 三分法：人物置于画面三分线交叉点
- 引导线：利用道路/走廊/光线引导视觉焦点
- 框架构图：门框/窗框/树枝框住主体增加层次
- 负空间：留白制造孤独/开阔/期待感`;
}

/**
 * v6.0.84: 修复被截断的分镜JSON
 * AI输出经常在max_tokens限制处被截断，导致JSON不完整。
 * 此函数尝试恢复尽可能多的已完成场景数据。
 * 
 * 支持两种结构：
 * 1. [{episodeNumber, scenes: [...]}] — generate-full-ai批量格式
 * 2. [{sceneNumber, description, ...}] — generate-storyboards-ai单集格式
 */
export function repairTruncatedStoryboardJSON(raw: string): { parsed: any | null; repaired: boolean; scenesRecovered: number } {
  let cleaned = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
  
  // 先尝试直接解析
  try {
    const parsed = JSON.parse(cleaned);
    return { parsed, repaired: false, scenesRecovered: -1 };
  } catch (_) {
    // 继续修复
  }

  console.log(`[JSON-Repair] Attempting repair, length=${cleaned.length}, first100=${cleaned.substring(0, 100)}`);
  
  let repaired = false;
  let scenesRecovered = 0;

  // 策略1: 嵌套结构 [{episodeNumber, scenes: [{...},...]}]
  // 找到所有完整的场景对象并重新构建
  if (cleaned.includes('"scenes"') || cleaned.includes('"episodeNumber"')) {
    try {
      // 找到所有完整的episode块
      const episodes: any[] = [];
      // 匹配 {"episodeNumber":N,"scenes":[ ... 的模式
      const epRegex = /\{"episodeNumber"\s*:\s*(\d+)[^}]*"scenes"\s*:\s*\[/g;
      let match;
      const epStarts: { index: number; epNum: number }[] = [];
      while ((match = epRegex.exec(cleaned)) !== null) {
        epStarts.push({ index: match.index, epNum: parseInt(match[1]) });
      }
      
      for (let i = 0; i < epStarts.length; i++) {
        const start = epStarts[i].index;
        const end = i < epStarts.length - 1 ? epStarts[i + 1].index : cleaned.length;
        const epChunk = cleaned.substring(start, end);
        
        // 从这个chunk中提取完整的scene对象
        const scenes = extractCompleteSceneObjects(epChunk);
        if (scenes.length > 0) {
          episodes.push({ episodeNumber: epStarts[i].epNum, scenes });
          scenesRecovered += scenes.length;
        }
      }
      
      if (episodes.length > 0) {
        console.log(`[JSON-Repair] Recovered ${episodes.length} episodes with ${scenesRecovered} total scenes`);
        return { parsed: episodes, repaired: true, scenesRecovered };
      }
    } catch (e) {
      console.warn(`[JSON-Repair] Strategy 1 (nested) failed:`, e);
    }
  }

  // 策略2: 扁平数组 [{sceneNumber:1,...}, {sceneNumber:2,...}]
  if (cleaned.includes('"sceneNumber"')) {
    try {
      const scenes = extractCompleteSceneObjects(cleaned);
      if (scenes.length > 0) {
        console.log(`[JSON-Repair] Strategy 2: recovered ${scenes.length} flat scenes`);
        return { parsed: scenes, repaired: true, scenesRecovered: scenes.length };
      }
    } catch (e) {
      console.warn(`[JSON-Repair] Strategy 2 (flat) failed:`, e);
    }
  }

  // 策略3: 暴力修复——找到最后一个完整的 } 并闭合所有括号
  try {
    let attempt = cleaned;
    // 移除尾部不完整的字符串值（截断在字符串中间）
    const lastQuote = attempt.lastIndexOf('"');
    if (lastQuote > 0) {
      // 检查这个引号后面是否有闭合结构
      const afterQuote = attempt.substring(lastQuote + 1).trim();
      if (!afterQuote.match(/^[,\]\}]/)) {
        // 截断在字符串中间，找到上一个完整的键值对
        const lastCompleteComma = attempt.lastIndexOf(',', lastQuote);
        if (lastCompleteComma > 0) {
          attempt = attempt.substring(0, lastCompleteComma);
        }
      }
    }
    
    // 计算未闭合的括号
    let braces = 0, brackets = 0;
    let inString = false;
    for (let i = 0; i < attempt.length; i++) {
      const ch = attempt[i];
      if (ch === '"' && (i === 0 || attempt[i - 1] !== '\\')) { inString = !inString; continue; }
      if (inString) continue;
      if (ch === '{') braces++;
      else if (ch === '}') braces--;
      else if (ch === '[') brackets++;
      else if (ch === ']') brackets--;
    }
    
    // 移除尾部逗号
    attempt = attempt.replace(/,\s*$/, '');
    // 闭合
    for (let i = 0; i < braces; i++) attempt += '}';
    for (let i = 0; i < brackets; i++) attempt += ']';
    
    const parsed = JSON.parse(attempt);
    console.log(`[JSON-Repair] Strategy 3 (bracket-balance) succeeded`);
    return { parsed, repaired: true, scenesRecovered: -1 };
  } catch (e) {
    console.warn(`[JSON-Repair] Strategy 3 (bracket-balance) failed:`, e);
  }

  console.warn(`[JSON-Repair] All strategies failed, returning null`);
  return { parsed: null, repaired: false, scenesRecovered: 0 };
}

/**
 * 从一段可能不完整的JSON文本中提取所有完整的scene对象
 */
function extractCompleteSceneObjects(chunk: string): any[] {
  const scenes: any[] = [];
  // 找每个 {"sceneNumber" 的起始位置
  let searchFrom = 0;
  while (true) {
    const sceneStart = chunk.indexOf('"sceneNumber"', searchFrom);
    if (sceneStart < 0) break;
    // 回退到这个对象的 { 
    let objStart = chunk.lastIndexOf('{', sceneStart);
    if (objStart < 0) { searchFrom = sceneStart + 1; continue; }
    
    // 向前扫描找到匹配的 }
    let depth = 0;
    let inStr = false;
    let objEnd = -1;
    for (let i = objStart; i < chunk.length; i++) {
      const ch = chunk[i];
      if (ch === '"' && (i === 0 || chunk[i - 1] !== '\\')) { inStr = !inStr; continue; }
      if (inStr) continue;
      if (ch === '{') depth++;
      else if (ch === '}') {
        depth--;
        if (depth === 0) { objEnd = i; break; }
      }
    }
    
    if (objEnd > objStart) {
      try {
        const sceneObj = JSON.parse(chunk.substring(objStart, objEnd + 1));
        if (sceneObj.sceneNumber || sceneObj.scene_number) {
          scenes.push(sceneObj);
        }
      } catch (_) {
        // 这个scene对象内部也有损坏，跳过
      }
    }
    searchFrom = (objEnd > 0 ? objEnd : sceneStart) + 1;
  }
  return scenes;
}

/**
 * v6.0.85: 检测并补填空dialogue的分镜
 * 返回需要补填的场景索引列表和补填建议内容
 */
export function detectAndFillEmptyDialogues(
  allSbRows: any[],
  characterRows: any[],
  episodeOutlines: any[]
): { filledCount: number; totalEmpty: number } {
  const hero = characterRows[0]?.name || '主角';
  const ally = characterRows[1]?.name || '配角';
  let totalEmpty = 0;
  let filledCount = 0;

  for (const row of allSbRows) {
    if (!row.dialogue || row.dialogue.trim().length < 3) {
      totalEmpty++;
      // 根据场景描述和emotionalTone自动生成基础对话
      const epOutline = episodeOutlines.find((ep: any) => ep.episodeNumber === row.episode_number);
      const epTitle = epOutline?.title || '';
      const tone = row.emotional_tone || '';
      const desc = row.description || '';
      
      // 基于情感基调和场景位置生成对话模板
      let autoDialogue = '';
      const sceneNum = row.scene_number || 1;
      
      if (sceneNum === 1) {
        // 开场
        autoDialogue = `${hero}：（看向远方）一切都要从这里开始了……\n${ally}：${hero}，你准备好了吗？`;
      } else if (tone.includes('紧张') || tone.includes('冲突') || tone.includes('愤怒')) {
        autoDialogue = `${hero}：这件事没有退路了！\n${ally}：冷静点，我们还有机会。`;
      } else if (tone.includes('温暖') || tone.includes('感动') || tone.includes('温馨')) {
        autoDialogue = `${hero}：谢谢你一直陪在我身边。\n${ally}：这是我应该做的。`;
      } else if (tone.includes('悬念') || tone.includes('悬疑') || tone.includes('神秘')) {
        autoDialogue = `${hero}：总觉得有什么不对劲……\n${ally}：嘘，别出声。`;
      } else if (sceneNum >= 5) {
        // 高潮/结尾
        autoDialogue = `${hero}：原来真相是这样的……\n${ally}：接下来该怎么办？`;
      } else {
        // 通用对话
        autoDialogue = `${hero}：关于「${epTitle}」这件事，我有了新的想法。\n${ally}：说来听听？`;
      }
      
      row.dialogue = autoDialogue;
      filledCount++;
    }
  }

  return { filledCount, totalEmpty };
}