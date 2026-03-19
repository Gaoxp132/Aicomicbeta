/**
 * v6.0.159: AI提示词构建器模块
 * 将编剧级创意提示词提取为独立函数，融入创意种子库+文学叙事理论+视觉叙事学
 * 解决app.tsx中因Unicode编码问题无法原位编辑的限制
 */

import { PRODUCTION_TYPE_PROMPTS } from "./constants.ts";

// ============================================================
// 1. 剧集大纲 Prompt 构建器
// ============================================================
export function buildEpisodeOutlinePrompt(params: {
  ptLabel: string;
  ptNarrative: string;
  totalEpisodes: number;
  series: { title: string; description?: string; genre?: string; theme?: string; story_outline?: string; coherence_check?: Record<string, unknown> | null };
  creativeSeed: { archetype: string; motif: string; cultural: string };
}): string {
  const { ptLabel, ptNarrative, totalEpisodes, series, creativeSeed } = params;

  // v6.0.90: 品牌/产品宣传片使用专属提示词
  const cc = series.coherence_check || {};
  const productionType = (cc.productionType as string) || '';
  const isPromo = productionType === 'brand_promo' || productionType === 'product_promo' || productionType === 'advertisement';

  if (isPromo) {
    return buildPromoOutlinePrompt({ ptLabel, ptNarrative, totalEpisodes, series, cc });
  }

  const lines = [
    `你是一位兼具文学素养与商业嗅觉的顶级${ptLabel}编剧。你的作品曾让观众在深夜追完全集后久久不能入睡——不是因为恐惧，而是因为那些角色的命运像针一样扎在心里拔不出来。现在请为这部${ptLabel}创作${totalEpisodes}集的详细大纲。`,
    ``,
    `作品主题：${series.title}`,
    `剧集简介：${series.description || '未提供'}`,
    series.genre ? `类型：${series.genre}` : '',
    series.theme ? `主题：${series.theme}` : '',
    series.story_outline ? `故事大纲：${(series.story_outline || '').substring(0, 600)}` : '',
    `作品类型叙事要求：${ptNarrative}`,
    ``,
    `【本次创作的灵魂种子——你的创意DNA，必须融入故事骨架】`,
    `叙事原型：${creativeSeed.archetype}`,
    `核心母题：${creativeSeed.motif}`,
    `文化底蕴：${creativeSeed.cultural}`,
    `（以上三个维度是你这次创作的独特基因。不是生搬硬套，而是让它们像盐溶于水般融入故事——观众感受得到味道，但看不见盐粒。）`,
    ``,
    `【语言要求——最高优先级】`,
    `所有输出内容必须使用中文！包括title、synopsis、growthTheme、keyMoments、cliffhanger、previousEpisodeLink等所有JSON字段的值，全部使用中文书写。严禁出现英文内容（角色名如为英文原名则保留）。这是面向中文用户的作��，每一个字都必须是中文。`,
    ``,
    `请严格按以下JSON格式回复（不要包含markdown标记），返回一个数组：`,
    `[{"episodeNumber":1,"title":"集标题(4-8字,像一首诗的标题——既有画面感又藏悬念,如'雨中的第七封信'而非'真相大白')","synopsis":"80-120字简介,必须含:本集核心事件+具体角色名+关键转折+情感高潮。写法要求：用'某人做了某事导致某后果'的因果链叙述，禁止'开始了新的旅程''面临着挑战'等空话","growthTheme":"本集主题(不超过6字)","keyMoments":["具体场景1(含角色名+动作+情感反应,如'林晚发现父亲的日记本藏在假墙后,双手颤抖地翻开第一页')","具体场景2"],"cliffhanger":"本集结尾的具体悬念画面(20-30字,必须是一个冻结的画面——如'她拨通了那个十年未打的号码,听到的却是自己的声音')","previousEpisodeLink":"本集开头如何承接上集(第1集写开端背景)"}]`,
    ``,
    `【编剧的十诫——违反任何一条都是对观众的不尊重】`,
    ``,
    `一、【反陈词滥调 - 最高优先级】`,
    `以下句式一旦出现，整个大纲作废重写：`,
    `x "迎接挑战" x "获得成长与领悟" x "在困境中找到力量" x "命运的齿轮开始转动"`,
    `x "坚定了信念" x "踏上了新的征程" x "一切都不一样了" x "故事才刚刚开始"`,
    `x "揭开了神秘面纱" x "发现了惊人的秘密" x "做出了艰难的选择"`,
    `替代方案：用具体事件替代抽象描述。不写"她做出了艰难的选择"，写"她把离婚协议书塞进碎纸机，然后给律师发了一条六个字的短信：撤诉，我不离了"。`,
    ``,
    `二、【叙事原型深度运用】`,
    `你选到的叙事原型是"${creativeSeed.archetype.split('(')[0]}"。这不是一个标签，而是故事的骨骼：`,
    `- 第1集必须种下这个原型的"种子场景"（一个看似无关紧要但会在后续爆炸的细节）`,
    `- 中段（第${Math.ceil(totalEpisodes * 0.4)}-${Math.ceil(totalEpisodes * 0.6)}集）原型力量全面爆发`,
    `- 结局要么完成原型（角色接受命运），要么颠覆原型（角色改写命运），不允许悬而未决`,
    ``,
    `三、【母题编织术】`,
    `核心母题"${creativeSeed.motif.split('\u2014\u2014')[0]}"要像一条暗河贯穿全剧：`,
    `- 每集至少有一个场景/对话/道具在呼应这个母题`,
    `- 同一母题在不同集中要有"变奏"——同样的东西在不同语境下含义完全不同`,
    ``,
    `四、【文化肌理】`,
    `文化底蕴"${creativeSeed.cultural.split('(')[0]}"为故事提供历史纵深感：`,
    `- 不是掉书袋式引用，而是让角色的处境与历史形成互文——古人面临过相似困境，但做出了不同选择`,
    `- 至少在1-2集的synopsis中体现这种古今映照`,
    ``,
    `五、【人物不是棋子】`,
    `每个出现在synopsis中的角色必须有"不得不这样做"的内在动机。反派的行为要合乎他的逻辑——站在他的角度，他是自己故事里的主角。`,
    `主角必须在某一集做出让观众想骂他的决定（因为真实的人就是会犯蠢），然后在后续承担后果。`,
    ``,
    `六、【钩子是一门手艺】`,
    `每集cliffhanger不是"悬念"而是一颗"定时炸弹"：观众不仅想知道"接下来怎样"，更想知道"他/她会怎么选"。`,
    `最好的cliffhanger类型：不可能的选择/身份暴露的瞬间/信任崩塌的证据/意外闯入的第三方/一封改变一切的信`,
    `禁止：没有具体内容的"震惊发现"/没有情感重量的"意外出现"`,
    ``,
    `七、【因果链是叙事的脊椎】`,
    `每集synopsis中的事件必须是上一集的"果"和下一集的"因"。测试方法：挡住任何一集，前后文应该出现逻辑断裂。`,
    `第3集的谎言第5集必须被揭穿；第2集种下的善意第7集必须开花（或结出毒果）。`,
    ``,
    `八、【节奏是呼吸】`,
    `${totalEpisodes}集的情感曲线：1-${Math.ceil(totalEpisodes * 0.2)}集(钩子+铺垫,快速建立世界和核心冲突) -> ${Math.ceil(totalEpisodes * 0.2) + 1}-${Math.ceil(totalEpisodes * 0.5)}集(升级+反转,每集推翻观众一个以为正确的判断) -> ${Math.ceil(totalEpisodes * 0.5) + 1}-${Math.ceil(totalEpisodes * 0.8)}集(高潮连环,角色被逼到绝境) -> 最后${totalEpisodes - Math.ceil(totalEpisodes * 0.8)}集(收束+余韵,好的结局不是句号而是省略号)`,
    `每集核心冲突类型必须不同：发现秘密/被迫抉择/信任崩塌/意外重逢/真相大白/背叛与原谅/身份暴露/生死抉择/道德困境/旧债偿还——不可重复`,
    ``,
    `九、【剧情连贯性红线】`,
    `1.所有创作必须100%围绕标题「${series.title}」和简介展开`,
    `2.每集synopsis必须包含具体角色名和具体事件（"谁做了什么导致了什么"）`,
    `3.配角不是工具人——至少1个配角有独立于主角的个人困境`,
    `4.已发生的重大事件必须在后续被角色记住和提及`,
    `5.不同角色说话方式必须有明显差异,体现各自性格身份`,
    `6.cliffhanger字段:最后1集写"故事完结",其余集写具体悬念画面`,
    ``,
    `十、【终极检验】`,
    `写完后自问：如果把角色名字遮住，能分得清谁是谁吗？如果把集标题遮住，能猜出是哪一���吗？如果答案是"不能"，说明你的创作还不够独特。`,
  ].filter(Boolean).join('\n');
  return lines;
}


// ============================================================
// 1b. 品牌/产品宣传片专属 Prompt 构建器 (v6.0.90)
// ============================================================
function buildPromoOutlinePrompt(params: {
  ptLabel: string;
  ptNarrative: string;
  totalEpisodes: number;
  series: { title: string; description?: string; genre?: string; theme?: string; story_outline?: string };
  cc: Record<string, unknown>;
}): string {
  const { ptLabel, ptNarrative, totalEpisodes, series, cc } = params;
  const brandName = (cc.brandName as string) || series.title || '';
  const slogan = (cc.slogan as string) || '';
  const sellingPoints = (cc.sellingPoints as string[]) || [];
  const promoTone = (cc.promoTone as string) || 'cinematic';
  const callToAction = (cc.callToAction as string) || '';
  const targetAudience = (cc.targetAudience as string) || '';
  const isProduct = (cc.productionType as string) === 'product_promo';

  const toneMap: Record<string, string> = {
    luxury: '高端奢华——每一帧都散发着Cartier广告般的极致质感，光影如流金，节奏如呼吸',
    tech: '科技前沿——Apple发布会式的简洁力量，用最少的画面传递最大的冲击',
    warm: '温暖人文——像NHK纪录片般的细腻触感，用真实细节打动人心',
    energetic: '活力动感——Nike式的肾上腺素飙升，节奏明快，画面充满张力',
    minimal: '极简高级——无印良品式的留白美学，少即是多，沉默比喧嚣更有力',
    cinematic: '电影质感——像Ridley Scott执导的大片，每个镜头都可以截图做海报',
    documentary: '纪实叙述——BBC级别的深度呈现，真实故事的力量胜过一切修饰',
    playful: '趣味创意——Old Spice式的出人意料，让观众在笑声中记住品牌',
  };

  const lines = [
    `你是世界顶级${ptLabel}创意总监，曾为Apple、Nike、Louis Vuitton、华为、蔚来等世界一流品牌操刀过震撼全球的宣传片。你深信：一支伟大的${isProduct ? '产品' : '品牌'}宣传片，不是在"介绍"${isProduct ? '产品' : '品牌'}，而是在"定义"一种新的生活方式和价值主张。`,
    ``,
    `现在请为以下${isProduct ? '产品' : '品牌'}创作${totalEpisodes}段${ptLabel}的详细分段脚本。`,
    ``,
    `${isProduct ? '产品' : '品牌'}名称：${brandName}`,
    `${isProduct ? '产品' : '品牌'}描述：${series.description || '未提供'}`,
    slogan ? `广告语/Slogan：${slogan}` : '',
    sellingPoints.length > 0 ? `核心卖点：${sellingPoints.join('、')}` : '',
    targetAudience ? `目标受众：${targetAudience}` : '',
    callToAction ? `行动号召(CTA)：${callToAction}` : '',
    series.story_outline ? `创意描述：${(series.story_outline || '').substring(0, 800)}` : '',
    ``,
    `视觉调性：${toneMap[promoTone] || toneMap.cinematic}`,
    `叙事规范：${ptNarrative}`,
    ``,
    `【语言要求——最高优先级】`,
    `所有输出内容必须使用中文！这是面向中文用户的作品。`,
    ``,
    `请严格按以下JSON格式回复（不要包含markdown标记），返回一个数组：`,
    `[{"episodeNumber":1,"title":"段落标题(2-6字,如'源起'/'锋芒'/'新生')","synopsis":"80-120字脚本描述,必须包含:①开场画面(精确到镜头语言)②核心展示内容③情感递进节奏④结尾定格画面。用画面语言写，不用抽象描述","growthTheme":"本段主题(不超过6字,如'匠心传承'/'科技之美')","keyMoments":["具体画面1(含镜头描述,如'微距镜头缓缓推过产品表面纹理,金属光泽在侧光下流动如水')","具体画面2"],"cliffhanger":"本段结尾画面(最后一段写品牌Logo+Slogan定格)","previousEpisodeLink":"本段开头如何承接(第1段写开场方式)"}]`,
    ``,
    `【世界一流${ptLabel}的创作铁律】`,
    ``,
    `一、【开场3秒决定一切】`,
    `第一段开场必须在3秒内抓住注意力：`,
    `- 可以是一个出人意料的画面（从极微观到极宏观的一个镜头拉伸）`,
    `- 可以是一句直击灵魂的旁白（如"在你翻开这页之前，世界不是这样的"）`,
    `- 可以是一个让人屏住呼吸的视觉奇观（延时摄影/航拍/微距的极致运用）`,
    `- 严禁：公司大楼外景开场/创始人正襟危坐/产品平铺直叙展示`,
    ``,
    `二、【每一帧都是广告牌】`,
    `宣传片的每一个画面都要达到可以截图做海报的水准：`,
    `- 构图必须有电影级的美感（对称/黄金分割/引导线/框架构图）`,
    `- 光影必须有情感（清晨侧光=希望/逆光剪影=力量/暖色调=温度/冷色调=科技）`,
    `- 色彩必须统一且有品牌辨识度`,
    ``,
    `三、【情感先于信息】`,
    `观众记住的不是参数和功能，而是这个${isProduct ? '产品' : '品牌'}让他们感受到了什么：`,
    `- 先建立情感连接，再传递核心信息`,
    `- 用"展示"而非"告诉"——不说"我们很创新"，展示创新的画面和成果`,
    `- 真实的用户故事/真实的使用场景比任何口号都有说服力`,
    ``,
    isProduct ? [
      `四、【产品是英雄】`,
      `产品宣传片中，产品就是故事的主角：`,
      `- 产品出场要有仪式感（悬念→揭幕→360度展示→功能演示）`,
      `- 每个核心卖点用一个完整的场景来展现，而不是文字罗列`,
      `- 使用前/使用后的对比要巧妙而不生硬`,
      sellingPoints.length > 0 ? `- 必须覆盖以下全部卖点：${sellingPoints.join('、')}` : '',
    ].filter(Boolean).join('\n') : [
      `四、【品牌是信仰】`,
      `品牌宣传片的终极目标是让观众说"我想成为这个品牌故事的一部分"：`,
      `- 品牌历史不是年份罗列，而是"每一个关键选择背后的故事"`,
      `- 品牌愿景不是空洞口号，而是"正在被一群人实践的理想"`,
      `- 品牌价值不是自我标榜，而是"用户因为选择了我们而获得了什么"`,
    ].join('\n'),
    ``,
    `五、【收尾是记忆锚点】`,
    `最后一段结尾必须让人过目不忘：`,
    slogan ? `- 品牌Logo + "${slogan}" 以最优雅的方式呈现` : '- 品牌Logo以最优雅的方式呈现',
    callToAction ? `- 行动号召"${callToAction}"要自然融入而非生硬贴片` : '',
    `- 结尾画面要有"余韵"——关掉视频后画面还在脑海里回响`,
    `- 配乐在结尾处的处理：渐弱留白 > 戛然而止 > 高潮定格`,
    ``,
    `六、【整体节奏如交响乐】`,
    totalEpisodes === 1 ? `单段结构：引子(10%悬念)→展开(30%铺垫)→高潮(40%核心展示)→尾声(20%情感升华+CTA)` :
    totalEpisodes === 2 ? `两段结构：第1段——铺垫与悬念(60%情感建立+问题提出)；第2段——揭幕与升华(60%解决方案+品牌价值+CTA)` :
    `${totalEpisodes}段结构：每段有独立主题但整体递进，从"认知→理解→认同→行动"层层推进`,
    ``,
    `七、【全部内容必须100%围绕「${brandName}」展开，严禁跑题】`,
  ].filter(Boolean).join('\n');
  return lines;
}


// ============================================================
// 2. 分镜(Storyboard) Prompt 构建器
// ============================================================
export function buildStoryboardPrompt(params: {
  productionType: string;
  series: { title: string; description?: string; genre?: string; theme?: string };
  scenesPerEp: number;
  cinematographyBlock: string;
  styleGuideBlock: string;
  charAppearanceBlock: string;
  contextBlock: string;
  batchEpInfo: string;
  creativeSeed: { archetype: string; motif: string; cultural: string };
  referenceAssets?: Array<{ url: string; type: string; name: string; tag?: string }>;
}): string {
  const { productionType, series, scenesPerEp, cinematographyBlock, styleGuideBlock, charAppearanceBlock, contextBlock, batchEpInfo, creativeSeed, referenceAssets } = params;
  const ptInfo = PRODUCTION_TYPE_PROMPTS[productionType] || PRODUCTION_TYPE_PROMPTS.short_drama;
  const isPromo = productionType === 'brand_promo' || productionType === 'product_promo' || productionType === 'advertisement';
  const hasCharacters = charAppearanceBlock && charAppearanceBlock.trim() !== '' && charAppearanceBlock.trim() !== '角色待定';

  // v6.0.192: 构建参考素材描述块
  const refAssetsBlock = buildRefAssetsBlock(referenceAssets);

  // v6.0.190: 宣传片纯视觉驱动模式——无角色时使用旁白+画面驱动的分镜格式
  if (isPromo && !hasCharacters) {
    return buildPromoStoryboardPrompt({ productionType, series, scenesPerEp, cinematographyBlock, styleGuideBlock, contextBlock, batchEpInfo, creativeSeed, ptInfo });
  }

  return `你是一位将文学想象力转化为视觉语言的${ptInfo.label}级分镜大师。你深谙一个道理：好的分镜不是"画面的罗列"，而是"用画面讲故事"——每一个镜头都是一个句子，每一次转场都是一个标点符号。请为以下作品的每集创作${scenesPerEp}个电影级分镜场景描述。

作品标题：${series.title}
故事简介：${series.description || '未提供'}
${series.genre ? `类型：${series.genre}` : ''}
${series.theme ? `主题：${series.theme}` : ''}
${cinematographyBlock}
${styleGuideBlock}
【角色外貌卡——场景描述中必须使用以下外貌特征】
${charAppearanceBlock || '角色待定'}
${contextBlock}
${refAssetsBlock}
需要创作分镜的剧集：
${batchEpInfo}

【本次视觉叙事的灵魂种子】
叙事原型：${creativeSeed.archetype.split('(')[0]}
核心母题：${creativeSeed.motif.split('\u2014\u2014')[0]}
（分镜是故事的视觉化身，上述原型和母题应体现在画面意象中——比如"宿命"主题可以用反复出现的十字路口画面来暗示，"秘密"母题可以用门缝中的光线来象征。）

【语言要求】所有输出内容（包括description、dialogue、location、emotionalTone、transitionFromPrevious、endingVisualState等所有JSON字段值）必须使用中文书写，严禁出现英文（角色英文原名除外）。

请严格按以下JSON格式回复（不要包含markdown标记），对每集返回${scenesPerEp}个场景：
[{"episodeNumber":1,"scenes":[{"sceneNumber":1,"description":"具体场景描述(50-80字,含角色全名+外貌+连续动作3步+环境+光影)","dialogue":"角色全名：具体对话内容(每场景至少2-4句推动剧情的对话,多人对话用换行分隔,格式如:林小雨：我不会放弃的\\n张明：你确定吗)","characters":["本场景出场角色全名1","角色全名2"],"location":"具体地点(如林小雨家的客厅)","timeOfDay":"早晨/上午/中午/下午/傍晚/夜晚","cameraAngle":"近景/中景/远景/全景/特写/俯拍/仰拍","emotionalTone":"���感基调","transitionFromPrevious":"与上一个场景的镜头衔接方式(第1个场景写开场)","endingVisualState":"本场景结束时的画面状态(20-30字,角色姿态+表情+环境)"}]}]

【分镜大师的14条军规】

1. 【画面即叙事】每个场景描述必须紧扣该集标题和剧情简介。描述中的每个细节都要"说话"——角色手中的道具暗示身份、墙上的照片暗示过去、窗外的天气映射心情。不要写通用描述。

2. 【角色视觉锁定】描述中必须出现具体角色名和外貌特征（参照角色外貌卡），不要用"主角""配角"等泛称。characters字段必须列出本场景所有出场角色的全名，与dialogue中的说话人一致。

3. 【对白是灵魂——核心要求】dialogue字段严禁为空！每个场景至少2-4句角色对话。对白三层境界：
   表层——传递信息（"明天开会"）
   中层——揭示性格（"又开会？上次的方案你们连看都没看"）
   深层——暗藏冲突（"开吧，反正决定早就做好了，我们只是来演民主的"）
   你的对白必须至少达到中层。格式"角色全名：对话内容\\n角色全名：回应"。
   唯一例外：纯动作追逐场景可写"角色名：(内心)独白"。严禁出现未在characters中列出的角色说话。

4. 【语言指纹不可混淆】每���角色的对话风格必须独一无二——学者角色可能引经据典、底层角色说话直接粗粝、压抑角色惜字如金但每句都重、话痨角色用废话掩饰不安。读对白就能猜出说话人身份。

5. 【六幕节奏编排】${scenesPerEp}个场景依次为：开场建立(抓住眼球的第一个画面) -> 角色互动(关系张力浮现) -> 情节推进(新信息/新事件打破平衡) -> 冲突/转折(观众的预期被打破) -> 高潮时刻(情感和事件同时到达顶点) -> 结尾悬念(冻结在一个让人揪心的画面上)

6. 【场景衔接——最重要的技术活】相邻场景必须视觉和叙事连贯：
   a. 同一角色跨场景出场时，服装/发型/配饰描述必须完全一致
   b. 场景地点不变时，环境细节（天气/光线/陈设）不能突变
   c. endingVisualState必须与下一场景开头自然衔接——如角色"转身离开教室"则下一场景从"走廊"开始
   d. 情感基调变化必须渐进，禁止跳跃（如温馨不能直接跳暴怒）
   e. transitionFromPrevious描述镜头语言：如"镜头跟随角色移动到YY""时间推移淡入""从特写拉远到全景"
   f. 场景描述的前10个字必须在空间或时间上承接上一场景的endingVisualState
   g. 每个场景的location字段必须具体（如"林小雨家的客厅"而非"室内"），同一地点在不同场景中使用完全相同的location值
   h. 每个场景的timeOfDay必须明确且与上一场景合理衔接
   ${contextBlock ? `i. 如果有【前集摘要】，第一个场景必须自然衔接前集结尾` : ''}

7. 【画面质量——电影级4要素】description必须含：(a)光线设计(光源方向+色温,如"落地窗投入的冷白日光") (b)构图位置(人物画面位置+前景/背景层次) (c)环境氛围(至少2个感官细节——视觉+听觉/触觉/嗅觉) (d)色彩情绪(主色调与情感映射)

8. 【视觉隐喻——高级技巧】每集至少1个场景使用视觉隐喻：镜子暗示自我认知/雨水暗示洗涤或悲伤/笼中鸟暗示束缚/十字路口暗示抉择/碎裂的杯子暗示关系破碎。隐喻要自然融入场景，不要生硬。

9. 【动作描写——视频生成关键】将大动作拆成3-4个连续小步骤（如不写"她跳舞"，写"右脚轻点地面 -> 身体缓缓旋转 -> 裙摆随惯性展开 -> 双臂向两侧舒展"），禁止模糊动作词（如"打斗""奔跑"），必须拆解为具体肢体动作

10. 【景别编排节奏】每集场景cameraAngle必须有节奏变化：开场远景 -> 中景互动 -> 中近景情感 -> 特写高潮 -> 中景推进 -> 远景收尾，禁止连续3场景相同景别

11. 【蒙太奇技法】transitionFromPrevious运用专业蒙太奇：对比蒙太奇(贫富/明暗对比)、平行蒙太奇(双线交叉)、隐喻蒙太奇(笼中鸟暗喻束缚)、积累蒙太奇(同类画面叠加)

12. 【严禁重复——最关键】(a)不同场景的description禁止出现相同或近似的动作/对话/情节，每个场景必须推进新的剧情事件；(b)dialogue字段中同一角色不可在不同场景重复相似语句；(c)同一集内禁止出现相同location+相同动作的场景组合；(d)如果上一场景角色"对话"了，下一场景优先用"行动"推进

13. 【环境叙事】场景的环境不是背景板而是"沉默的角色"——凌乱的房间暗示心理状态、总是关着的窗帘暗示封闭、桌上冷掉的咖啡暗示等待。每个场景至少1个环境细节在"讲故事"。

14. 【中国审美与价值观】人物形象优美端庄、气质自然不夸张；情节传递正向价值观(勇气/善良/成长/责任)；场景环境精致美观；避免低俗/恐怖/暴力等不适内容`;
}


// ============================================================
// 2b. 宣传片纯视觉驱动分镜 Prompt 构建器 (v6.0.190)
// ============================================================
function buildPromoStoryboardPrompt(params: {
  productionType: string;
  series: { title: string; description?: string; genre?: string; theme?: string };
  scenesPerEp: number;
  cinematographyBlock: string;
  styleGuideBlock: string;
  contextBlock: string;
  batchEpInfo: string;
  creativeSeed: { archetype: string; motif: string; cultural: string };
  ptInfo: { label: string };
}): string {
  const { series, scenesPerEp, cinematographyBlock, styleGuideBlock, contextBlock, batchEpInfo, creativeSeed, ptInfo, productionType } = params;
  const isProduct = productionType === 'product_promo';

  return `你是一位世界一流的${ptInfo.label}视觉总监兼分镜师。你深谙行业主流${isProduct ? '产品' : '品牌'}宣传片的制作精髓：以产品特写、品牌意象、航拍、延时摄影、微距、动态文字排版、旁白叙事为核心驱动力——无需依赖人物角色，纯粹用画面的力量打动观众。请为以下作品的每段创作${scenesPerEp}个电影级分镜场景描述。

作品标题：${series.title}
作品简介：${series.description || '未提供'}
${series.genre ? `类型：${series.genre}` : ''}
${series.theme ? `主题：${series.theme}` : ''}
${cinematographyBlock}
${styleGuideBlock}
【注意】本宣传片为纯视觉驱动模式，无出镜人物角色。所有场景以产品/品牌/环境/抽象意象为主体。
${contextBlock}
需要创作分镜的段落：
${batchEpInfo}

【本次视觉叙事的灵魂种子】
叙事原型：${creativeSeed.archetype.split('(')[0]}
核心母题：${creativeSeed.motif.split('\u2014\u2014')[0]}

【语言要求】所有输出内容必须使用中文书写，严禁出现英文。

请严格按以下JSON格式回复（不要包含markdown标记），对每段返回${scenesPerEp}个场景：
[{"episodeNumber":1,"scenes":[{"sceneNumber":1,"description":"画面详细描述(60-100字,含主体物/产品+运镜动作3步+环境+光影+色调。如'微距镜头缓缓推过产品表面钛合金纹理，侧光在拉丝金属上流淌如水银，焦点从边缘渐移至品牌Logo')","dialogue":"旁白文案(20-50字的旁白/文案，用于配音或字幕叠加。如'在精密与美学的交汇处，每一道弧线都经过上千次推敲')","characters":[],"location":"拍摄场景(如纯白无限远影棚/城市天际线航拍/实验室微距台)","timeOfDay":"早晨/上午/中午/下午/傍晚/夜晚/不限","cameraAngle":"近景/中景/远景/全景/特写/俯拍/仰拍/航拍/微距/slider","emotionalTone":"情感基调","transitionFromPrevious":"与上一个场景的镜头衔接方式(第1个场景写开场)","endingVisualState":"本场景结束时的画面状态(20-30字)"}]}]

【${ptInfo.label}纯视觉分镜的10条军规】

1. 【主体即英雄】没有人物角色时，${isProduct ? '产品' : '品牌意象'}就是画面的绝对主角。每个镜头都要赋予主体"生命感"——产品不是静物而是有呼吸的存在：光影在表面流动、材质在镜头下展现肌理、形态在运动中展示设计语言。

2. 【旁白是灵魂】dialogue字段用于旁白文案/画面文字，每个场景必填。旁白风格统一——可以是诗意独白（如Apple风格）、数据驱动（如科技产品）、情感叙事（如品牌故事）、哲学思辨（如高端品牌）。旁白要与画面形成"和弦"而非"重复"——画面展示产品时旁白讲理念，画面展示场景时旁白讲情感。

3. 【运镜即叙事】没有人物对话推进剧情，完全依靠运镜节奏讲故事：
   - 慢推(slow push)=悬念与发现
   - 环绕(orbital)=全方位展示
   - slider水平滑动=优雅过渡
   - 微距推近=细节揭秘
   - 航拍俯冲=格局与震撼
   - speed ramp变速=戏剧性转折

4. 【光影造情绪】没有角色表演传递情感，光影是唯一的"演员"：
   - 侧光=质感与立体感
   - 逆光剪影=力量与神秘
   - 点光源=聚焦与仪式感
   - 自然光=真实与温度
   - 霓虹/彩色光=未来感与科技感

5. 【节奏如呼吸】${scenesPerEp}个场景的节奏编排：
   开场(悬念/震撼画面) → 铺展(多角度展示/场景切换) → 递进(核心卖点/品牌价值) → 高潮(最震撼的视觉奇观) → 定格(Logo+Slogan收尾)

6. 【场景衔接——视觉蒙太奇】无人物串联时��场景衔接更依赖视觉蒙太奇：
   - 形状匹配剪辑(match cut)：上一镜头的圆形产品→下一镜头的太阳/月亮
   - 运动匹配：上一镜头向右滑动→下一镜头继续向右
   - 色彩过渡：暖色调场景→冷色调场景用溶解过渡
   - endingVisualState必须为下一场景提供视觉桥梁

7. 【画面质量——广告级5要素】description必须含：(a)光线设计(光源方向+色温+质感) (b)构图方式(对称/三分/引导线/负空间) (c)主体状态(材质/纹理/动态/特效) (d)环境氛围(背景+前景层次) (e)色彩情绪(主色调与品牌色的关系)

8. 【文字排版场景】宣传片中至少1-2个场景应包含动态文字排版(motion typography)：品牌Slogan出现、核心数据展示、关键词动态呈现等。在description中明确描述文字的出现方式和排版风格。

9. 【严禁重复】每个场景必须有不同的主体/角度/运镜/光影组合。禁止出现两个场景使用相同的构图+相同的运镜方式。每个场景要展示不同维度的信息。

10. 【收尾定格】最后一个场景必须以品牌Logo/产品hero shot定格收尾，配合最凝练的品牌旁白。定格画面要有"余韵"——简洁、有力、过目不忘。`;
}


// ============================================================
// 3. 风格指南 Prompt 构建器
// ============================================================
export function buildStyleGuidePrompt(params: {
  series: { title: string; description?: string; genre?: string };
  seriesStyle: string;
  baseStylePrompt: string;
  charAppearanceList: string;
  referenceImageUrl?: string;
}): string {
  const { series, seriesStyle, baseStylePrompt, charAppearanceList, referenceImageUrl } = params;

  return `你是一位在吉卜力工作室和Pixar都历练过的视觉艺术总监，擅长为每个故事找到"只属于它的画面语言"。请为以下作品创建一份统一的视觉风格指南，确保全系列画面风格一致且具有辨识度。

作品标题：${series.title}
故事简介：${series.description || '未提供'}
${series.genre ? `类型：${series.genre}` : ''}
视觉风格方向：${baseStylePrompt}
${referenceImageUrl ? `用户提供了参考图（已附在消息中）。请仔细分析参考图的：(a)整体色调与色彩搭配 (b)人物形象风格与服饰特征 (c)光影质感与画面氛围 (d)构图方式与景深效果，并以此作为风格指南的核心基准。` : ''}
主要角色：
${charAppearanceList || '暂无角色信息'}

请按以下格式输出视觉风格指南（纯文本，不要JSON格式）：

【角色外貌卡】
为每个角色写出60-100字的详细视觉描述，包含：发型发色(刘海方向/长度)、瞳色、面部五官���例(脸型/眉形/鼻形/唇形)、面部微特征(痣/疤痕/酒窝/雀斑的精确位置，如"右嘴角上方1cm有小痣"，没有则写"面部无痣无疤")、体型身高、标志性服装/配饰。
关键：每个角色的视觉设计必须"说话"——服装颜色映射性格(如总穿灰色=压抑/偏爱红色=热烈)、标志性配饰暗示过去(如永远不摘的手链=某人的遗物)、姿态暗示心理(如习惯性低头=自卑/总是叉腰=控制欲强)。

【色彩方案】
定义全系列的主色调、辅色调、情绪色彩映射（如紧张=冷蓝灰、温馨=暖琥珀、危险=暗红褐），以及"标志色"——一种贯穿全剧在关键时刻出现的颜色(如某件红围巾/某盏绿灯)。30-50字。

【构图与光影规范】
定义常用构图方式、光影风格、画面质感。关键：光影要有"情感温度"——温暖场景用侧光/柔光，冲突场景用底光/硬光，回忆场景用逆光/柔焦。30-50字。

【环境风格基准】
定义场景环境的整体美术风格——环境不是背景板而是"沉默的角色"。每个主要场景空间(家/学校/办公室)应有独特的视觉个性。30-50字。

要求：
1. 所有描述必须与「${seriesStyle}」风格（${baseStylePrompt}）高度统一
2. 角色外貌描述必须极其具体，能作为AI视频生成的精确参考，包含可量化的视觉��点
3. 控制总字数在300-500字以内，言简意赅
4. 角色形象设计符合当代中国主流审美：五官精致端正、身材比例协调、气质自然得体、衣着有品位感
5. 【面部微特征锁定】痣/疤痕/胎记/酒窝的位置一旦设定，全系列所有场景必须完全一致——绝不允许左右脸互换或位置漂移
6. 每个角色至少2个独特的视觉辨识标志(如独特发型/标志性配饰/特殊服装颜色)，确保视频生成时不会混淆不同角色`;
}

// ============================================================
// 4. 构建参考素材描述块（v6.0.192）
// 注意：URL不注入文本prompt（文本AI看不到URL），仅注入语义引导
// 图片素材通过callAI的imageUrls参数以多模态方式注入
// ============================================================
function buildRefAssetsBlock(referenceAssets?: Array<{ url: string; type: string; name: string; tag?: string }>): string {
  if (!referenceAssets || referenceAssets.length === 0) {
    return '';
  }

  const logoAssets = referenceAssets.filter(a => a.tag === 'logo');
  const productAssets = referenceAssets.filter(a => a.tag === 'product');
  const sceneAssets = referenceAssets.filter(a => a.tag === 'scene');
  const generalAssets = referenceAssets.filter(a => !a.tag || a.tag === 'general');
  const imageAssets = referenceAssets.filter(a => a.type === 'image');
  const videoAssets = referenceAssets.filter(a => a.type === 'video');

  const lines: string[] = [`【用户提供了${referenceAssets.length}个参考素材（${imageAssets.length}张图片${videoAssets.length > 0 ? `、${videoAssets.length}个视频` : ''}）——已附在消息中，请仔细分析】`];

  if (logoAssets.length > 0) {
    lines.push(`- 其中${logoAssets.length}个为公司/品牌Logo素材：必须严格保留Logo的原始形象、颜色、比例和设计风格，在适当场景中自然融入`);
  }
  if (productAssets.length > 0) {
    lines.push(`- 其中${productAssets.length}个为产品素材：仔细观察产品外观、材质、配色，在分镜中准确呈现产品特征，可进行创意化的场景扩展`);
  }
  if (sceneAssets.length > 0) {
    lines.push(`- 其中${sceneAssets.length}个为场景参考素材：参考其构图、光影、色调、氛围，在分镜中融入类似的视觉风格`);
  }
  if (generalAssets.length > 0) {
    lines.push(`- 其中${generalAssets.length}个为通用参考素材：提取其中的核心视觉元素、风格特征、色彩方案，灵活运用到分镜创作中`);
  }
  lines.push(`【素材使用原则】(a)Logo/品牌标识必须保持原始形象不可修改 (b)其他素材可提取元素进行创意扩展优化 (c)素材应分散到不同场景中自然融入，不要在单���场景堆砌所有素材 (d)重点展现品牌理念和产品价值`);

  return lines.join('\n');
}