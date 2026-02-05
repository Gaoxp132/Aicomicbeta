/**
 * 内容审核与价值观保障系统
 * v3.7.0 新增功能
 * 
 * 核心功能：
 * 1. 智能内容审核引擎（前置+后置）
 * 2. 价值观主题标签系统
 * 3. 8大受众群体内容分级
 * 4. AI生成内容质量评估
 * 5. 不良内容自动过滤
 */

import { callQwenAPI } from './aliyun_tongyi.tsx';

/**
 * 受众群体定义（8大群体）
 */
export const AUDIENCE_GROUPS = {
  toddler: {
    code: 'toddler',
    label: '幼儿',
    ageRange: '0-5岁',
    description: '早期启蒙阶段，内容需极度温和、积极、简单',
    contentRules: [
      '绝对禁止：暴力、恐怖、悬疑元素',
      '必须包含：亲情、友善、探索世界',
      '语言要求：简单易懂、重复性强、富有韵律',
      '情节要求：温馨、快乐、安全感',
      '教育价值：基础认知、情感启蒙、行为习惯',
    ],
    sensitivityLevel: 10, // 1-10，10最敏感
  },
  children: {
    code: 'children',
    label: '儿童',
    ageRange: '6-12岁',
    description: '启蒙教育阶段，培养正确价值观和品格',
    contentRules: [
      '限制：温和冲突（如误会、小挫折）',
      '鼓励：团队合作、诚实善良、勇敢尝试',
      '语言要求：清晰易懂、富有启发性',
      '情节要求：有趣生动、富有教育意义',
      '教育价值：道德品格、知识学习、社交能力',
    ],
    sensitivityLevel: 8,
  },
  teenager: {
    code: 'teenager',
    label: '青少年',
    ageRange: '13-18岁',
    description: '价值观塑造关键期，引导正确人生观',
    contentRules: [
      '可包含：学业压力、友情困境、自我探索',
      '必须传递：努力奋斗、坚持梦想、正义勇气',
      '语言要求：贴近青少年、富有感染力',
      '情节要求：现实关联、引发思考',
      '教育价值：理想信念、责任担当、创新精神',
    ],
    sensitivityLevel: 6,
  },
  youth: {
    code: 'youth',
    label: '青年',
    ageRange: '19-35岁',
    description: '奋斗拼搏阶段，激励积极向上',
    contentRules: [
      '可包含：职场竞争、情感挫折、创业艰辛',
      '必须传递：奋斗精神、社会责任、家国情怀',
      '语言要求：真实感人、激励人心',
      '情节要求：贴近生活、引发共鸣',
      '教育价值：职业发展、社会贡献、家庭责任',
    ],
    sensitivityLevel: 4,
  },
  middle_aged: {
    code: 'middle_aged',
    label: '中年',
    ageRange: '36-55岁',
    description: '价值创造高峰期，传递使命担当',
    contentRules: [
      '可包含：职业挑战、���庭责任、社会贡献',
      '必须传递：责任担当、传承智慧、回馈社会',
      '语言要求：沉稳有力、富有深度',
      '情节要求：现实厚重、引发反思',
      '教育价值：社会责任、文化传承、领导力',
    ],
    sensitivityLevel: 3,
  },
  senior: {
    code: 'senior',
    label: '老年',
    ageRange: '56岁+',
    description: '智慧传承阶段，温暖感人',
    contentRules: [
      '可包含：人生感悟、代际沟通、健康养老',
      '必须传递：乐观向上、智慧传承、家庭和睦',
      '语言要求：温暖亲切、通俗易懂',
      '情节要求：温馨感人、正能量',
      '教育价值：人生智慧、代际和谐、积极养老',
    ],
    sensitivityLevel: 5,
  },
  family: {
    code: 'family',
    label: '全家',
    ageRange: '老少皆宜',
    description: '合家欢类型，适合全家观看',
    contentRules: [
      '绝对禁止：不适合儿童的任何内容',
      '必须包含：家庭和睦、代际沟通、共同成长',
      '语言要求：老少皆宜、通俗易懂',
      '情节要求：温馨有趣、寓教于乐',
      '教育价值：家庭价值、文化传承、代际理解',
    ],
    sensitivityLevel: 8,
  },
  universal: {
    code: 'universal',
    label: '全民',
    ageRange: '所有人',
    description: '主旋律内容，弘扬社会主义核心价值观',
    contentRules: [
      '必须符合：社会主义核心价值观',
      '必须传递：爱国、敬业、诚信、友善',
      '语言要求：准确规范、积极向上',
      '情节要求：正能量、主旋律',
      '教育价值：家国情怀、社会责任、文化自信',
    ],
    sensitivityLevel: 7,
  },
};

/**
 * 价值观主题标签系统
 */
export const VALUE_THEMES = {
  // 个人层面
  SELF_GROWTH: {
    key: 'SELF_GROWTH',
    name: '个人成长',
    category: '个人层面',
    keywords: ['自我提升', '突破自我', '学习进步', '潜能发掘', '目标达成'],
    coreValues: ['努力', '坚持', '自律', '创新', '进取'],
    educationalValue: '激励个人不断学习和成长，实现自我价值',
  },
  RESILIENCE: {
    key: 'RESILIENCE',
    name: '逆境成长',
    category: '个人层面',
    keywords: ['面对挫折', '克服困难', '心理韧性', '东山再起', '化危为机'],
    coreValues: ['坚韧', '乐观', '勇气', '毅力', '希望'],
    educationalValue: '培养面对困难的勇气和克服逆境的能力',
  },
  CAREER_DEVELOPMENT: {
    key: 'CAREER_DEVELOPMENT',
    name: '职业发展',
    category: '个人层面',
    keywords: ['职场励志', '技能提升', '工匠精神', '团队协作', '专业成长'],
    coreValues: ['敬业', '专注', '卓越', '合作', '创造'],
    educationalValue: '引导正确的职业观和敬业精神',
  },

  // 家庭层面
  FAMILY_BONDS: {
    key: 'FAMILY_BONDS',
    name: '家庭亲情',
    category: '家庭层面',
    keywords: ['家庭和睦', '亲子关系', '代际沟通', '孝道', '感恩'],
    coreValues: ['孝顺', '关爱', '责任', '包容', '感恩'],
    educationalValue: '弘扬中华传统家庭美德，促进家庭和谐',
  },
  RELATIONSHIPS: {
    key: 'RELATIONSHIPS',
    name: '人际关系',
    category: '家庭层面',
    keywords: ['友情', '信任', '真诚待人', '社交沟通', '邻里和睦'],
    coreValues: ['诚信', '友善', '尊重', '理解', '互助'],
    educationalValue: '培养良好的人际交往能力和社会适应能力',
  },

  // 社会层面
  SOCIAL_RESPONSIBILITY: {
    key: 'SOCIAL_RESPONSIBILITY',
    name: '社会责任',
    category: '社会层面',
    keywords: ['志愿服务', '公益事业', '乡村振兴', '环保', '奉献'],
    coreValues: ['奉献', '担当', '公益', '环保', '互助'],
    educationalValue: '培养社会责任感和奉献精神',
  },
  PATRIOTISM: {
    key: 'PATRIOTISM',
    name: '爱国情怀',
    category: '国家层面',
    keywords: ['爱国主义', '民族自豪', '文化自信', '国家建设', '使命担当'],
    coreValues: ['爱国', '奉献', '忠诚', '自豪', '使命'],
    educationalValue: '弘扬爱国主义精神，增强文化自信',
  },
  CULTURAL_HERITAGE: {
    key: 'CULTURAL_HERITAGE',
    name: '文化传承',
    category: '国家层面',
    keywords: ['传统文化', '非遗保护', '国学经典', '文化创新', '民族精神'],
    coreValues: ['传承', '创新', '自信', '尊重', '弘扬'],
    educationalValue: '传承中华优秀传统文化，增强民族自信',
  },
};

/**
 * 内容审核规则
 */
export const CONTENT_MODERATION_RULES = {
  // 🚫 绝对禁止的内容
  FORBIDDEN: {
    violence: {
      name: '暴力血腥',
      keywords: ['血腥', '暴力', '杀戮', '虐待', '残忍', '恐怖', '惊悚'],
      severity: 'critical',
    },
    political: {
      name: '政治敏感',
      keywords: ['反动', '分裂', '邪教', '颠覆', '敏感政治'],
      severity: 'critical',
    },
    pornography: {
      name: '色情低俗',
      keywords: ['色情', '淫秽', '性暗示', '裸露', '低俗'],
      severity: 'critical',
    },
    gambling: {
      name: '赌博毒品',
      keywords: ['赌博', '毒品', '吸毒', '贩毒', '博彩'],
      severity: 'critical',
    },
    illegal: {
      name: '违法犯罪',
      keywords: ['犯罪教唆', '违法行为', '诈骗', '盗窃', '抢劫'],
      severity: 'critical',
    },
    superstition: {
      name: '封建迷信',
      keywords: ['迷信', '占卜', '算命', '风水', '鬼怪'],
      severity: 'high',
    },
  },

  // ⚠️ 需要审慎处理的内容
  SENSITIVE: {
    discrimination: {
      name: '歧视性内容',
      keywords: ['歧视', '偏见', '刻板印象', '地域黑'],
      severity: 'high',
    },
    negativity: {
      name: '过度负面',
      keywords: ['绝望', '自杀', '厌世', '极端负面'],
      severity: 'medium',
    },
    commercialization: {
      name: '过度商业化',
      keywords: ['拜金', '炫富', '奢侈', '物质主义'],
      severity: 'medium',
    },
  },

  // ✅ 必须包含的价值观
  REQUIRED_VALUES: {
    positive: {
      name: '积极向上',
      keywords: ['正能量', '积极', '乐观', '向上', '美好'],
      weight: 10,
    },
    patriotic: {
      name: '爱国主义',
      keywords: ['爱国', '民族', '中国', '传统', '文化'],
      weight: 8,
    },
    family: {
      name: '家庭美德',
      keywords: ['家庭', '亲情', '孝顺', '关爱', '和睦'],
      weight: 7,
    },
    social: {
      name: '社会公德',
      keywords: ['诚信', '友善', '互助', '奉献', '责任'],
      weight: 7,
    },
    educational: {
      name: '教育意义',
      keywords: ['成长', '学习', '启发', '教育', '价值'],
      weight: 9,
    },
  },
};

/**
 * 前置审核：检查用户输入的创意是否合规
 */
export async function preModerateUserInput(
  userInput: string,
  targetAudience: string
): Promise<{
  passed: boolean;
  issues: string[];
  suggestions: string[];
  severity: 'safe' | 'warning' | 'danger';
}> {
  console.log('[ContentModeration] 🔍 Starting pre-moderation check...');
  console.log('[ContentModeration] User input:', userInput);
  console.log('[ContentModeration] Target audience:', targetAudience);

  const issues: string[] = [];
  const suggestions: string[] = [];
  let severity: 'safe' | 'warning' | 'danger' = 'safe';

  // 1. 检查禁止内容
  for (const [category, rule] of Object.entries(CONTENT_MODERATION_RULES.FORBIDDEN)) {
    for (const keyword of rule.keywords) {
      if (userInput.toLowerCase().includes(keyword.toLowerCase())) {
        issues.push(`包含禁止内容：${rule.name}（${keyword}）`);
        severity = 'danger';
      }
    }
  }

  // 2. 检查敏感内容
  for (const [category, rule] of Object.entries(CONTENT_MODERATION_RULES.SENSITIVE)) {
    for (const keyword of rule.keywords) {
      if (userInput.toLowerCase().includes(keyword.toLowerCase())) {
        issues.push(`包含敏感内容：${rule.name}（${keyword}）`);
        if (severity === 'safe') severity = 'warning';
      }
    }
  }

  // 3. 受众群体特定检查
  const audienceRules = AUDIENCE_GROUPS[targetAudience as keyof typeof AUDIENCE_GROUPS];
  if (audienceRules) {
    if (audienceRules.sensitivityLevel >= 8) {
      // 高敏感度群体（幼儿、儿童、全家）
      const childUnsafeKeywords = ['战争', '死亡', '恐怖', '悲剧', '灾难'];
      for (const keyword of childUnsafeKeywords) {
        if (userInput.toLowerCase().includes(keyword)) {
          issues.push(`对${audienceRules.label}不适宜：包含"${keyword}"`);
          suggestions.push(`建议改为更温和、积极的表述`);
        }
      }
    }
  }

  // 4. 如果有严重问题，直接返回
  if (severity === 'danger') {
    console.log('[ContentModeration] ❌ Pre-moderation FAILED - Critical issues found');
    return {
      passed: false,
      issues,
      suggestions: ['请修改创意，移除不当内容后重试'],
      severity,
    };
  }

  // 5. 如果有警告，提供建议但允许继续
  if (severity === 'warning') {
    console.log('[ContentModeration] ⚠️ Pre-moderation WARNING - Sensitive content detected');
    suggestions.push('AI将自动优化内容，确保符合价值观要求');
  }

  console.log('[ContentModeration] ✅ Pre-moderation passed');
  return {
    passed: true,
    issues,
    suggestions,
    severity,
  };
}

/**
 * 后置审核：检查AI生成的内容是否合规
 */
export async function postModerateGeneratedContent(
  content: {
    title?: string;
    storyOutline?: string;
    theme?: string;
    episodes?: Array<{ title: string; scenes: Array<{ description: string }> }>;
  },
  targetAudience: string
): Promise<{
  passed: boolean;
  score: number; // 0-100分
  issues: string[];
  valueAnalysis: {
    detectedThemes: string[];
    positiveScore: number;
    educationalValue: number;
  };
  suggestions: string[];
}> {
  console.log('[ContentModeration] 🔍 Starting post-moderation check...');

  const issues: string[] = [];
  const suggestions: string[] = [];
  let totalScore = 100;
  const detectedThemes: string[] = [];

  // 合并所有文本用于检查
  const allText = [
    content.title || '',
    content.storyOutline || '',
    content.theme || '',
    ...(content.episodes || []).map(ep => ep.title),
    ...(content.episodes || []).flatMap(ep => ep.scenes?.map(s => s.description) || []),
  ].join(' ');

  // 1. 检查禁止内容（严格）
  for (const [category, rule] of Object.entries(CONTENT_MODERATION_RULES.FORBIDDEN)) {
    for (const keyword of rule.keywords) {
      if (allText.toLowerCase().includes(keyword.toLowerCase())) {
        issues.push(`生成内容包含禁止词：${keyword}`);
        totalScore -= 50;
      }
    }
  }

  // 2. 检查敏感内容
  for (const [category, rule] of Object.entries(CONTENT_MODERATION_RULES.SENSITIVE)) {
    for (const keyword of rule.keywords) {
      if (allText.toLowerCase().includes(keyword.toLowerCase())) {
        issues.push(`包含敏感词：${keyword}`);
        totalScore -= 15;
      }
    }
  }

  // 3. 检测价值观主题
  let positiveScore = 0;
  for (const [key, theme] of Object.entries(VALUE_THEMES)) {
    for (const keyword of theme.keywords) {
      if (allText.toLowerCase().includes(keyword.toLowerCase())) {
        if (!detectedThemes.includes(theme.name)) {
          detectedThemes.push(theme.name);
        }
        positiveScore += 5;
      }
    }
  }

  // 4. 检查必须包含的价值观
  let requiredValueScore = 0;
  for (const [key, value] of Object.entries(CONTENT_MODERATION_RULES.REQUIRED_VALUES)) {
    let found = false;
    for (const keyword of value.keywords) {
      if (allText.toLowerCase().includes(keyword.toLowerCase())) {
        found = true;
        requiredValueScore += value.weight;
        break;
      }
    }
    if (!found && value.weight >= 8) {
      issues.push(`缺少关键价值观：${value.name}`);
      totalScore -= 10;
    }
  }

  // 5. 受众适配性检查
  const audienceRules = AUDIENCE_GROUPS[targetAudience as keyof typeof AUDIENCE_GROUPS];
  if (audienceRules && audienceRules.sensitivityLevel >= 8) {
    // 高敏感度受众，额外检查
    const positiveWords = ['快乐', '幸福', '爱', '温暖', '友善', '成长'];
    let positiveCount = 0;
    for (const word of positiveWords) {
      if (allText.includes(word)) positiveCount++;
    }
    if (positiveCount < 2) {
      issues.push('内容积极性不足，适合儿童的正面元素较少');
      totalScore -= 15;
    }
  }

  // 6. 计算教育价值
  const educationalValue = Math.min(100, (detectedThemes.length * 15) + (positiveScore / 2));

  // 7. 综合评分
  const finalScore = Math.max(0, Math.min(100, totalScore + (requiredValueScore / 2)));

  console.log('[ContentModeration] 📊 Post-moderation complete:');
  console.log('[ContentModeration]   Score:', finalScore);
  console.log('[ContentModeration]   Themes:', detectedThemes);
  console.log('[ContentModeration]   Issues:', issues.length);

  const passed = finalScore >= 60 && issues.filter(i => i.includes('禁止')).length === 0;

  if (!passed) {
    suggestions.push('内容需要优化，建议重新生成或手动调整');
  } else if (finalScore < 80) {
    suggestions.push('内容基本合格，但可以增加更多正面价值观元素');
  }

  return {
    passed,
    score: finalScore,
    issues,
    valueAnalysis: {
      detectedThemes,
      positiveScore: Math.min(100, positiveScore),
      educationalValue,
    },
    suggestions,
  };
}

/**
 * AI智能内容优化
 * 如果内容不合规，使用AI自动优化
 */
export async function optimizeContentWithAI(
  content: string,
  targetAudience: string,
  issues: string[]
): Promise<string> {
  console.log('[ContentModeration] 🤖 Starting AI content optimization...');

  const audienceRules = AUDIENCE_GROUPS[targetAudience as keyof typeof AUDIENCE_GROUPS];
  
  const prompt = `请优化以下内容，使其符合${audienceRules?.label || '通用'}观众的价值观要求：

原始内容：
${content}

发现的问题：
${issues.join('\n')}

优化要求：
1. 移除所有不当内容
2. 增强积极正面元素
3. 突出教育意义和成长价值
4. 符合${audienceRules?.label || '通用'}群体的内容规范：
${audienceRules?.contentRules.join('\n') || ''}

请直接返回优化后的内容，不要包含任何说明文字。`;

  try {
    const optimized = await callQwenAPI(
      prompt,
      undefined, // systemPrompt
      "qwen-max" // model
    );
    
    console.log('[ContentModeration] ✅ AI optimization complete');
    return optimized;
  } catch (error) {
    console.error('[ContentModeration] ❌ AI optimization failed:', error);
    return content; // 如果优化失败，返回原内容
  }
}

/**
 * 完整审核流程（集成前置+后置）
 */
export async function performFullModeration(
  userInput: string,
  generatedContent: any,
  targetAudience: string
): Promise<{
  success: boolean;
  preCheck: Awaited<ReturnType<typeof preModerateUserInput>>;
  postCheck: Awaited<ReturnType<typeof postModerateGeneratedContent>>;
  finalScore: number;
  recommendation: string;
}> {
  // 前置审核
  const preCheck = await preModerateUserInput(userInput, targetAudience);
  
  // 后置审核
  const postCheck = await postModerateGeneratedContent(generatedContent, targetAudience);
  
  // 综合评分
  const finalScore = (postCheck.score * 0.8) + (preCheck.passed ? 20 : 0);
  
  // 给出建议
  let recommendation = '';
  if (finalScore >= 90) {
    recommendation = '✅ 优秀！内容质量高，价值观积极正确';
  } else if (finalScore >= 75) {
    recommendation = '✅ 良好！内容合格，符合基本要求';
  } else if (finalScore >= 60) {
    recommendation = '⚠️ 及格！内容基本可用，建议优化';
  } else {
    recommendation = '❌ 不合格！需要重新生成或大幅修改';
  }
  
  return {
    success: preCheck.passed && postCheck.passed,
    preCheck,
    postCheck,
    finalScore,
    recommendation,
  };
}