/**
 * 辅助函数模块 - 电影学辅助功能 + JSON修复 + 空dialogue补填
 * v6.0.159: 重写dialogue补填——注入文学级对白模板，消除"soap opera"感
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
export function repairTruncatedStoryboardJSON(raw: string): { parsed: ParsedScene[] | ParsedEpisode[] | unknown | null; repaired: boolean; scenesRecovered: number } {
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
      const episodes: ParsedEpisode[] = [];
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
function extractCompleteSceneObjects(chunk: string): ParsedScene[] {
  const scenes: ParsedScene[] = [];
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
 * v6.0.159: 彻底重写——从"填空题"升级为"文学级对白生成"
 * 每个情感基调配备多套对白模板，随机选取避免重复，对白注重潜台词和性格差异
 */
export function detectAndFillEmptyDialogues(
  allSbRows: StoryboardDialogueRow[],
  characterRows: CharacterDialogueRow[],
  episodeOutlines: EpisodeOutlineRow[]
): { filledCount: number; totalEmpty: number } {
  const hero = characterRows[0]?.name || '主角';
  const ally = characterRows[1]?.name || '配角';
  const third = characterRows[2]?.name || '第三者';
  // v6.0.159: 角色性格标签用于区分说话方式
  const heroPersona = characterRows[0]?.personality || '';
  const allyPersona = characterRows[1]?.personality || '';
  let totalEmpty = 0;
  let filledCount = 0;
  // v6.0.159: 用计数器在同类型模板间轮转，避免重复
  let templateCounter = 0;

  // v6.0.159: 文学级对白模板库——每个类别多套，注重潜台词、性格差异、具体细节
  const OPENING_TEMPLATES = [
    (h: string, a: string, ep: string) => `${h}：（站在原地，目光落在远处某个不存在的点上）……你有没有觉得，有些事一旦开始就停不下来？\n${a}：（双手插兜，侧头看他）你这话说了不下三遍了。区别是，这次你眼神不一样。`,
    (h: string, a: string, ep: string) => `${h}：（翻开一封旧信，纸张发出细微的脆响）都过去这么久了……\n${a}：（从门口探进半个身子）发什么呆呢？外面的人都到齐了。\n${h}：（迅速把信叠好塞进口袋）没什么。走吧。`,
    (h: string, a: string, ep: string) => `${a}：（递过一杯水，动作刻意轻柔）你昨晚又没睡？\n${h}：（接过杯子，指尖微微发抖）做了个梦。梦见了「${ep}」里那件事。\n${a}：（沉默片刻）梦的结局呢？\n${h}：没有结局。我被闹钟吵醒了。`,
  ];

  const TENSION_TEMPLATES = [
    (h: string, a: string) => `${h}：（声音压得很低，但每个字都像钉子）你知道这意味着什么。\n${a}：（后退半步，脊背抵上墙壁）我知道。但我选择不知道。\n${h}：（猛地抬头）你没有这个权利！`,
    (h: string, a: string) => `${a}：（把一叠文件摔在桌上，纸张四散）解释。\n${h}：（看着散落的纸，没有弯腰去捡）就算我解释了，你信吗？\n${a}：（嘴唇抿成一条线）试试看。`,
    (h: string, a: string) => `${h}：（转身，声音突然平静得可怕）我给过你机会的。\n${a}：（攥紧拳头，关节发白）那不是机会，那是你设的局。\n${h}：（回头，眼神冰冷）区别是什么？`,
  ];

  const WARM_TEMPLATES = [
    (h: string, a: string) => `${h}：（低头摆弄手里的东西，不敢对视）其实那天……我本来想说的不是那个。\n${a}：（歪头，嘴角微微上扬）哦？那你本来想说什么？\n${h}：（深吸一口气，抬起头）……算了，说了你会笑我的。`,
    (h: string, a: string) => `${a}：（把围巾绕到${h}脖子上，动作笨拙但认真）别犟了。外面零下十度。\n${h}：（愣住，喉结上下滚动）你什么时候……多带了一条围巾？\n${a}：（转身快步走开，耳尖泛红）天气预报说的，不是专门给你带的。`,
    (h: string, a: string) => `${h}：（把一盒东西推到${a}面前，假装随意）路上看到的，顺手买的。\n${a}：（打开，怔住）这……这不是我上个月随口提过一次的那个？\n${h}：（别开脸）记性好而已。没什么特别的。`,
  ];

  const SUSPENSE_TEMPLATES = [
    (h: string, a: string) => `${h}：（蹲下，手指拂过地上的痕迹）这不对……\n${a}：（警觉地环顾四周）哪里不对？\n${h}：（站起来，脸色骤变）这个痕迹是新的。五分钟之内。也就是说——\n${a}：（瞳孔收缩）他还在这里。`,
    (h: string, a: string) => `${a}：（压低声音，几乎是唇语）门后面有人。\n${h}：（慢慢把手伸向桌子下面）几个？\n${a}：（竖起两根手指）\n${h}：（闭眼，深呼吸，然后睁开——眼中恐惧已被冷静取代）你数到三。`,
    (h: string, a: string) => `${h}：（盯着手机屏幕，脸色发白）你看这个。\n${a}：（凑过来，表情从困惑变成震惊）不可能……这个人不是已经……\n${h}：（关掉屏幕，声音发颤）所以要么我们搞错了，要么——有人在用一个死人的身份。`,
  ];

  const CLIMAX_TEMPLATES = [
    (h: string, a: string, t: string) => `${h}：（声音嘶哑，眼眶泛红但一滴泪没掉）我不是你以为的那种人。我从来都不是。\n${a}：（后退，像被泼了冷水）那你到底是谁？\n${h}：（苦笑）一个一直在演戏的人。只是戏演久了，连自己都分不清了。`,
    (h: string, a: string, t: string) => `${a}：（走到窗前，背对着所有人）当初我说过，不管发生什么我都站你这边。\n${h}：（声音沙哑）但是——\n${a}：（猛地转身，眼中全是血丝）但你骗了我！你让我用信任当筹码，赌的是一场你早知道结局的戏！`,
    (h: string, a: string, t: string) => `${h}：（跪在雨中，把一样东西举过头顶）这是你一直要找的东西。拿走吧。\n${a}：（雨水模糊了视线，声音在颤抖）你为什么现在才……\n${h}：（苦笑，雨水从嘴角流过）因为直到今天我才确定——它对你比对我重要。`,
  ];

  const GENERAL_TEMPLATES = [
    (h: string, a: string, ep: string) => `${h}：你觉得「${ep}」这件事，会怎么收场？\n${a}：（想了想）最好的情况和最坏的情况，你想听哪个？\n${h}：先说最坏的。\n${a}：最坏的情况就是——它已经发生了，只是我们还不知道。`,
    (h: string, a: string, ep: string) => `${a}：（放下手里的东西，认真地看着${h}）我问你一个问题，你必须说实话。\n${h}：（警惕起来）什么问题？\n${a}：如果时间倒回去，你还会做同样的选择吗？\n${h}：（沉默了很久）……会。但会用不同的方式。`,
    (h: string, a: string, ep: string) => `${h}：（走到地图前，手指点在某个位置）从这里到那里，正常人需要三天。\n${a}：我们不是正常人。\n${h}：（嘴角勾起一个弧度）对。所以我给我们留了两天。\n${a}：（挑眉）那多出来的一天呢？\n${h}：用来犯错。计划赶不上变化，得给意外留余量。`,
  ];

  for (const row of allSbRows) {
    if (!row.dialogue || row.dialogue.trim().length < 3) {
      totalEmpty++;
      const epOutline = episodeOutlines.find((ep: EpisodeOutlineRow) => ep.episodeNumber === row.episode_number);
      const epTitle = epOutline?.title || '这件事';
      const tone = row.emotional_tone || '';
      const sceneNum = row.scene_number || 1;
      const idx = templateCounter++;

      let autoDialogue = '';

      if (sceneNum === 1) {
        const tpls = OPENING_TEMPLATES;
        autoDialogue = tpls[idx % tpls.length](hero, ally, epTitle);
      } else if (tone.includes('紧张') || tone.includes('冲突') || tone.includes('愤怒') || tone.includes('对抗')) {
        const tpls = TENSION_TEMPLATES;
        autoDialogue = tpls[idx % tpls.length](hero, ally);
      } else if (tone.includes('温暖') || tone.includes('感动') || tone.includes('温馨') || tone.includes('甜蜜')) {
        const tpls = WARM_TEMPLATES;
        autoDialogue = tpls[idx % tpls.length](hero, ally);
      } else if (tone.includes('悬念') || tone.includes('悬疑') || tone.includes('神秘') || tone.includes('恐惧')) {
        const tpls = SUSPENSE_TEMPLATES;
        autoDialogue = tpls[idx % tpls.length](hero, ally);
      } else if (sceneNum >= 4) {
        const tpls = CLIMAX_TEMPLATES;
        autoDialogue = tpls[idx % tpls.length](hero, ally, epTitle);
      } else {
        const tpls = GENERAL_TEMPLATES;
        autoDialogue = tpls[idx % tpls.length](hero, ally, epTitle);
      }

      row.dialogue = autoDialogue;
      filledCount++;
    }
  }

  return { filledCount, totalEmpty };
}

/** Parsed scene object from JSON repair */
interface ParsedScene {
  sceneNumber?: number;
  scene_number?: number;
  description?: string;
  dialogue?: string;
  [key: string]: unknown;
}

/** Parsed episode with scenes from JSON repair */
interface ParsedEpisode {
  episodeNumber: number;
  scenes: ParsedScene[];
}

/** Storyboard row shape used by detectAndFillEmptyDialogues */
interface StoryboardDialogueRow {
  dialogue?: string;
  episode_number?: number;
  emotional_tone?: string;
  scene_number?: number;
}

/** Character row shape used by detectAndFillEmptyDialogues */
interface CharacterDialogueRow {
  name?: string;
  personality?: string;
}

/** Episode outline shape used by detectAndFillEmptyDialogues */
interface EpisodeOutlineRow {
  episodeNumber?: number;
  title?: string;
}