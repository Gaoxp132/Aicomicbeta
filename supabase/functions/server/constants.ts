/**
 * 常量配置模块
 * v6.0.175
 */

import type { ProductionTypeConfig } from "./types.ts";

export const APP_VERSION = "v6.0.175";
export const PREFIX = '/make-server-fc31472c';

// v6.0.176: 管理员账号已从硬编码迁移到环境变量 ADMIN_PHONES（逗号分隔）+ KV 动态列表
// ADMIN_PHONE 常量已移除，改用 app.tsx 中的 isAdminPhone() 异步函数

// v6.0.107: 服务端合并阈值（merge-videos + merge-all-videos 共享）
// Edge Function 内存限制约 150MB，超过阈值时指示前端走本地合并
export const MAX_SERVER_MERGE_SEGMENTS = 4;      // v6.0.193: 降至4段（6段仍OOM，concat峰值 ≈ 3×totalSize）
export const MAX_SERVER_MERGE_SIZE_MB = 40;       // v6.0.193: 降至40MB（实际段大小常超10MB估算）
export const ESTIMATED_SEGMENT_SIZE_MB = 12;      // v6.0.193: 上调至12MB（720p 10s H265更准确）

// 环境变量（路由中需要做特性检查的导出）
export const VOLCENGINE_API_KEY = Deno.env.get('VOLCENGINE_API_KEY') || '';
export const ALIYUN_BAILIAN_API_KEY = Deno.env.get('ALIYUN_BAILIAN_API_KEY') || '';
export const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') || '';

// 火山引擎配置 — 支持通过环境变量覆盖，以便使用代理或国际端点
const VOLC_DEFAULT_BASE = "https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks";
const VOLC_DEFAULT_CHAT = "https://ark.cn-beijing.volces.com/api/v3/chat/completions";
export const VOLCENGINE_BASE_URL = Deno.env.get('VOLCENGINE_BASE_URL') || VOLC_DEFAULT_BASE;
export const DOUBAO_CHAT_URL = Deno.env.get('VOLCENGINE_CHAT_URL') || VOLC_DEFAULT_CHAT;

// 阿里云百炼 API URLs
export const DASHSCOPE_CHAT_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions";
export const DASHSCOPE_IMAGE_URL = "https://dashscope.aliyuncs.com/api/v1/services/aigc/text2image/image-synthesis";
export const DASHSCOPE_TASKS_BASE_URL = "https://dashscope.aliyuncs.com/api/v1/tasks";

export const IMAGE_BUCKET = 'make-fc31472c-images';

// Doubao 型配置
export const DOUBAO_MODELS = {
  pro:  'doubao-seed-2-0-pro-260215',
  mini: 'doubao-seed-2-0-mini-260215',
  lite: 'doubao-seed-2-0-lite-260215',
} as const;

// 模型耗尽冷却时间（30钟
export const EXHAUSTION_COOLDOWN_MS = 30 * 60 * 1000;

// Seedance 2.0 视频生成专业提示词约束 (v6.0.69: 增强角色一致性+中国审美+反重复)
export const SEEDANCE_BASE_SUFFIX = '稳定运镜，画面流畅丝滑，动作自然连贯不僵硬，高清细节丰富，五官清晰端正、面部稳定对称、不扭曲不变形，人体结构比例自然协调，皮肤质感细腻有光泽，人物面容精致优美符合东方审美，眼睛明亮有神不空洞，表情自然生动有感染力';
export const SEEDANCE_I2V_EXTRA = '，同一角色全程保持：相同五官轮廓（眉形/眼形/鼻形/唇形全一致）、相同发型发色（刘海长度/分线位置/卷曲程度不变）、相同服装配饰（颜色/款式/佩戴位置不变）、相同体型比例、相同皮肤痣/疤痕/胎记位置（如有，严禁角色外貌在帧间发生任何化——面微特征（痣/酒窝/雀斑）的位置和大小必须逐帧锁定';

// 风格提示词
export const STYLE_PROMPTS: Record<string, string> = {
  anime: "日系动漫风格，线条清晰流畅，大眼睛特征明显，色彩鲜艳明亮，背景细腻有层次感，人物比例修长，表情夸张生动，光影对比柔和，整体画风统一干净",
  cyberpunk: "赛博朋克未来科技风格，霓虹灯光与暗色调对比强烈，金属质感突出，城市充满高科技元素，色调以蓝紫青为主，人物穿戴科技感服饰，画面有雨雾光晕效果",
  fantasy: "奇幻魔法世界风格，色彩瑰丽梦幻，光效华丽，自然元素与魔法融合，建筑宏伟神秘，人物服饰古典华丽，画面充满奇幻氛围，光影温暖而神秘",
  realistic: "真实写实风格，画面如电影级质感，光影自然逼真，人物比例真实，皮肤纹理细腻，服装材质感强，场景环境细节丰富，色调真实自然，镜头语言专业",
  cartoon: "卡通动画风格线条圆润爱，色彩饱和度高，人物造型Q版圆润，表情丰富夸张，背景简明快，整体画面活泼欢乐，色调温暖明亮",
  comic: "漫画分镜风格，黑白线稿为主搭配适度上色，线条力度感强，分镜构图有张力，人物动态夸张，阴影对比鲜明，画面有漫画网点效果",
  chinese: "中国风水墨风，笔触写意灵动，墨色浓淡相宜，留白意境深远，人物古典端庄，服饰飘逸华美，场景融合山水园林元素，色调素雅古朴",
  pixel: "像素艺术风格，方块像素构成画面，色彩鲜明复古，8-bit游戏画面感，角色方头方脑可爱呆萌，场景简洁像素化，整体怀旧游戏氛围浓厚",
  threed: "3D渲染风格，模型精致光滑，材质质感真实，光影层次丰富，环境建模立体感强，人物表情自然细腻，皮克斯/迪士尼级别的高品质三维动画效果",
  oil_painting: "古典油画风格，笔触厚重有质感，色彩层次浓郁饱满，光影伦勃朗般戏剧化，人物肖像庄重优雅，背景氛围感强烈，整体画面如同文艺复兴时期大师之作",
  watercolor: "水彩画风格，色彩透明清新淡雅，颜料晕染自然流畅，留白灵动有意境，笔触轻柔飘逸，人物轮廓柔和梦幻，背景如水中倒影般朦胧，整体画面诗意盎然",
  noir: "黑白电影风格，高对比度黑白画面，光影戏剧化如胶片质感，人物剪影分明，场景充神秘悬疑氛围，烟雾弥漫的街道，百叶窗投下的条纹光影，复古胶片颗粒感",
  steampunk: "蒸汽朋克风格，维多利亚时代工业美学，黄铜齿轮蒸汽管道遍布，机械装置精密复杂，人物身着复古机械风服饰佩戴护镜，色调暖铜与深棕交织画面充满工业浪漫感",
  xianxia: "古侠风格，仙气飘渺的东方玄幻世界，云海仙山气势恢宏，人物白衣飘飘仙风道骨，法术特效华丽绚目，场景融合道教与东方神话元素，色调青蓝紫搭配金光，画面超凡脱俗",
  ghibli: "吉卜力动画风格，宫崎骏式温暖治愈画风，色彩柔和自然如手绘，背景细腻有生活气息，云朵蓬松草地翠绿，人物造型朴素亲切，表情温柔生动，整体画面充满童话般的温馨与奇思",
  ukiyoe: "日本浮世绘风格，粗犷有力的墨线勾勒，色彩平涂对比鲜明，波浪纹样装饰感强，人物姿态戏剧化，背景融合自然山水与浮世百态，整体画面如同江户时代木版画的精致艺术",
};

// 作品类型配置
export const PRODUCTION_TYPE_PROMPTS: Record<string, ProductionTypeConfig> = {
  comic_drama: {
    label: '漫剧', narrativeStyle: '分镜感强的漫画叙事，画面间留白营造节奏，关键帧定格强化情感',
    shotStyle: '大量特写和中景，强调人物表情；分镜构图有漫画框架感；关键时刻使用速度线和冲击构图',
    editingStyle: '快节奏剪辑，分镜间硬切为主；高潮时慢动作定格；使用漫画式文字特效强调情绪',
    colorTone: '饱和度较高的明快色彩，角色发色/眼色作为视觉锚点，阴影使用纯色而非灰度',
  },
  short_drama: {
    label: '短剧', narrativeStyle: '前3秒必须抓住注意力的钩子式开场；每集以悬念/反转结尾；节奏紧凑无冗余',
    shotStyle: '竖屏9:16构图优先；中景和近景为主保持人物占满画面；快速推拉镜头制造紧迫感',
    editingStyle: '平均镜头时长2-4秒；频繁使用跳切(jump cut)加速叙事；情绪高潮使用交叉剪辑',
    colorTone: '高对比度、高饱和度吸引手机屏观看；暖色调偏甜/冷色调偏酷的极端化色彩策略',
  },
  micro_film: {
    label: '微电影', narrativeStyle: '三幕结构紧凑版：快速建置→核心冲突→情感高潮；注重情感共鸣和意境',
    shotStyle: '电影级宽银幕构图2.35:1；大量使用浅深虚化背景突出主体；长镜头营造沉浸感',
    editingStyle: '镜头时长4-8秒偏长；溶解(dissolve)过渡营造诗意；蒙太奇段落浓缩时间流逝',
    colorTone: '调色偏电影级LUT，暗部保留细节；使用互补色对比强化主题；关键物品使用调色',
  },
  movie: {
    label: '电影', narrativeStyle: '经典三结构或英雄之旅：建置(25%)→对抗(50%)→解决(25%)；深度角色弧光',
    shotStyle: '宽银幕2.39:1；系统化景别编排(ELS建立→LS场景→MS互动→CU情感→ECU细节)；大师级构图(黄金分割/引导线/框架构图)',
    editingStyle: '头时长6-12秒大师节奏；反打(shot-reverse-shot)对话场景；平行蒙太奇/交叉剪辑推进多线叙事',
    colorTone: '精细调色，每幕有独立色彩主题；低饱和度真实感基调；使用色温变化暗示时间和情感转变',
  },
  tv_series: {
    label: '电视剧', narrativeStyle: '多线叙事+主线副线交织；每集有独立小高潮+整季长线悬念；人物关系网复杂',
    shotStyle: '16:9标准电视构图；大量对话场景使用正反打+过肩镜头(OTS)；建立镜头(establishing shot)每场必有',
    editingStyle: '镜头时长3-6秒标准电视节奏；场景转换使用叠化或硬切；A/B故事线交叉剪辑',
    colorTone: '全季统一的视觉基调，不同场景空间使用辨识度色彩(办公室冷色/家中暖色)；光线写实自然',
  },
  documentary: {
    label: '纪录片', narrativeStyle: '观察式/参与式/解说式叙事；用真实细节构建情感；留白给观众思考空间',
    shotStyle: '手持镜头营造真实感；大量环境全景和细节特写交替；采访场景遵循三分法构图',
    editingStyle: 'B-roll(辅助画面)与主线交替；长镜头记录完整过程；使用字幕卡和时间线标注',
    colorTone: '自然真实色调，避免过度调色；纪实质感的胶片颗粒(grain)；环境自然光为主',
  },
  music_video: {
    label: 'MV', narrativeStyle: '音乐节奏驱动画面切换事/表演/概念三种段落穿插；情感先于逻辑',
    shotStyle: '创意角度(倾斜/极低/极高)；大量使用浅景深光斑(bokeh)；慢动作+快动作对比',
    editingStyle: '严格按BPM节拍剪辑(每拍/每小节一切)；快速蒙太奇段落；创意转场(匹配剪辑/形状转场)',
    colorTone: '高度风格化的色彩方案(单色调/霓虹/胶片)；频繁使用色彩闪烁和渐变；光影戏剧化',
  },
  advertisement: {
    label: '告片', narrativeStyle: '5秒内传达核心信息；产品/品牌作为故事解决方案出场；最后3秒明确CTA',
    shotStyle: '产品特写使用微距+光滑运镜(slider)；人物使用中景展示使用场景；品牌logo始终保持视觉位置',
    editingStyle: '镜头时长1-3秒极快节奏；使用speed ramp(变速)制造冲击力；最后定格在品牌画面',
    colorTone: '品牌色贯穿全片；高明度高饱和度吸引注意力；白色/浅色背景突出品质感',
  },
  brand_promo: {
    label: '品牌宣传片', narrativeStyle: '宏大叙事+情感共鸣；以品牌使命/愿景为核心驱动力；从历史传承到未来愿景的时间线叙事；用真实故事与画面传递品牌温度与格局',
    shotStyle: '大量航拍+延时摄影展现规模与格局；工匠/团队特写传递专业精神；产品线微距展示工艺细节；品牌标志性建筑/场景使用对称构图彰显大气',
    editingStyle: '镜头时长4-8秒沉稳大气节奏；使用平滑溶解(dissolve)过渡暗示时间流逝；配合交响乐/钢琴渐入强化情感递进；结尾品牌LOGO+Slogan定格3-5秒',
    colorTone: '品牌主色调贯穿全片作为视觉锚点；暗部保留细节的电影级调色；暖色调传递人文关怀/冷色调传递科技实力；高端质感的低饱和度金属光泽',
  },
  product_promo: {
    label: '产品宣传片', narrativeStyle: '悬念揭幕式开场→核心功能逐一展示→真实场景体验→震撼数据/对比→CTA行动号召；每个镜头服务于一个核心卖点',
    shotStyle: '产品360度旋转展示使用微距+slider运镜；功能演示使用分屏对比/画中画；使用场景中景展示产品与人的交互；科技内核使用X光/透视/粒子特效可视化',
    editingStyle: '节奏紧凑1-3秒快切与4-6秒慢展交替；使用speed ramp(变速)突出关键功能瞬间；核心数据使用动态字幕(motion graphics)强化记忆；结尾产品+价格+CTA定格',
    colorTone: '产品本体使用高光泽/高对比度突出质感；场景背景低饱和度避免抢夺视线；功能演示使用品牌色高亮标注；整体画面干净通透有科技感',
  },
};

// 专业景别映射（中英文 + Seedance 2.0运镜指令）
export const PRO_SHOT_MAP: Record<string, string> = {
  // 英文专业景别
  'extreme-long-shot': '大远景(ELS)，超广角镜头缓缓平移，展现宏大全貌，人物是环境中的渺小存在',
  'long-shot': '远景(LS)，固定或缓慢拉远，展示人物全身与环境关系，建空间感',
  'medium-shot': '中景(MS)，平稳跟拍人物膝上半身，展现肢语言和人物互动',
  'medium-close-up': '中近景(MCU)，缓慢推镜至胸部以上，捕捉面部表情与手势细节',
  'close-up': '近景特写(CU)，缓慢推镜聚焦面部/关键物品，传达深层情感',
  'extreme-close-up': '极特写(ECU)，微距镜头聚焦眼睛/嘴唇/手指等极小细节，强化戏剧张力',
  // 中文景别（AI常返回）
  '大远景': '大远景(ELS)，超广角镜头缓缓平移，展现宏大全貌，人物是环境中的渺小存在',
  '远景': '远景(LS)，固定或缓慢拉远，展人物全身与环境关系，建立空间感',
  '全景': '全景(FS)，固定镜头展示完整场景与所有人物关系',
  '中景': '中景(MS)，平稳跟拍人物膝上半身，展现肢体语言和人物互动',
  '中近景': '中近景(MCU)，缓慢推镜至胸部以上，捕捉面部表情与手势细节',
  '近景': '近景特写(CU)，缓慢推镜聚焦面部，传深层情感与微表情',
  '特写': '特写(CU)，缓慢推镜聚焦面部/关键物品，传达深层情感',
  '大特写': '极特写(ECU)，微距镜头聚焦极小细节，强化戏剧张力',
  // 角度类
  '俯拍': '高角度俯拍(HA)，鸟瞰视角固定拍摄，暗示角色渺小或被压迫',
  '仰拍': '低角度仰拍(LA)，缓慢上推镜头增强角色气势与权威感',
  '平拍': '平视角(EL)，与角色视齐平，平稳跟拍，最自然实的视角',
  'POV': '第一人称主观镜头(POV)，手持微晃模拟角色视线，营造代入感',
  '倾斜': '荷兰角(Dutch Angle)，倾斜构图制造不安/紧张/疯狂的心理暗示',
  // 旧值兼容
  'medium': '中景(MS)，平稳跟拍人物膝上半身',
  'wide': '远景(LS)，展示人物全身与环境关系',
  'overhead': '高角度俯拍(HA)，鸟瞰视角',
  'low-angle': '低角度仰拍(LA)，增强角色气势',
};

// v6.0.159: 创意种子库——叙事原型 × 文学母题 × 历史典故
// 每次生成从三个维度随机抽取组合，确保每部作品都有独特的"创意DNA"
export const NARRATIVE_ARCHETYPES = [
  '普罗米修斯式反叛(为众人盗火者必自焚——角色为理想付出惨痛代价但永不后悔)',
  '拉什蒙式多视角(同一事件在不同角色口中面目全非——真相藏在叙述的缝隙里)',
  '俄狄浦斯式宿命(越想逃避的命运越会应验——角色的每一步自救都在走向深渊)',
  '堂吉诃德式理想主义(在现实的风车前头破血流——荒诞中见崇高，可笑中见可敬)',
  '浮士德式交易(以灵魂为赌注换取欲望——获得一切的瞬间失去最珍贵的东西)',
  '奥德赛式归途(十年漂泊归家路——物理距离越近、心理距离越远的回归悖论)',
  '变形记式异化(某天醒来发现自己变成了甲虫——身份认在诞处境中的瓦解与重建)',
  '西西弗斯式抗争(明知巨石会滚落仍推向山顶——在注定失败中寻找存在的意义)',
  '窃听者式旁观(站在监控室的人——权力、窥私与良知的三角博弈)',
  '十二怒汉式辩论(封闭空间+时间压力+一人对抗所有人——偏见如何被逐个瓦解)',
  '罗生门式博弈(人人都在说谎，但每个谎言里藏着一份真实——动机比事实更重要)',
  '赵氏孤儿式牺牲(一命换一命的终极选择——托孤者的信念vs灭门者的恐惧)',
  '霸王别姬式痴迷(戏里戏外分不清——当热爱变成执念，执念变成毁灭)',
  '桃花源式幻灭(找到了理想之地却再也回不去——得到又失去比从未拥有更残酷)',
  '红楼梦式盛极而(锦绣堆里看大厦将倾——繁华落尽后每个人的命运沉浮)',
] as const;

export const LITERARY_MOTIFS = [
  '秘密与谎言——每个角色至少守着一个秘密，秘密之间互相牵制形成暗网',
  '身份错位——角色身处错误的位置(如冒名顶替/灵魂互换/阶层穿越)，真实身份随时可能暴露',
  '时间压力——倒计时机制(72小时/最后一个学期/术前三天)让每个决定都无法撤回',
  '密室困境——物理或心理的封闭空间(困在电梯/被困小镇/无法离开的关系)迫使角色直面彼此',
  '镜像对——两个角色是彼此的镜像(同一起点不同选择/表面相反实则相同)形成命运互文',
  '麦格芬驱动——一个所有人都在追逐的东西(遗嘱/录音/消失的孩子)串联所有角色线',
  '不可靠叙述——叙事者(或关键角色)一直在误导观众，结局揭示完全不同的真相版本',
  '代际创伤——父辈的选择像诅咒一样降临在子辈身上，打破循环需要付出巨大代价',
  '道德灰区——没有纯粹的好人坏人，每个选择都有代价，观众会为"该支持谁"争论不休',
  '蝴蝶效应——一个微小的日常决定(多看了一眼手机/迟到了5分钟)引发不可逆连锁灾难',
  '禁忌之恋——不是简单的爱情阻碍，而是社会结构/伦理/时代造成的根本不可能',
  '回忆迷宫——过去与现在交织叙事，每次回忆都揭示新细节，改写观众对"当下"的理解',
] as const;

export const CULTURAL_REFERENCES = [
  '春秋战国纵横术(合纵连横的权谋智慧——多方博弈中的结盟与背叛)',
  '三国演义式群雄逐鹿(每个阵营都有正当理由——没有绝对的正邪)',
  '聊斋志异式人鬼情未了(超自然元素折射人间冷暖——狐妖比人更有人情味)',
  '水浒传式被迫上梁山(体制把好人逼成反叛者——当守法不再能守正义时)',
  '西游记式修行路(八十一难各有寓意——外的妖怪其实是内心的魔障)',
  '世说新语式名士风流(极端年代中的人格魅力——乱世中的风骨与放达)',
  '敦煌壁画式文明密码(千年遗迹中藏着改变当下的线索——古今对话)',
  '丝绸之路式东西碰撞(不同文明的价值观冲突与融合——跨文化理解的艰难与美好)',
  '民国乱世式家国选择(大时代裹挟小人物——历史洪流中个人命运的无奈与抗争)',
  '改革开放式时代浪潮(旧秩序崩塌新规则未立——所有人都在摸着石头过河)',
  '当代互联网式信息迷雾(数字时代的隐私/信任/真假——一条热搜毁掉一个人)',
  '全球化困境式文化冲突(传统vs现代/东方vs西方/效率vs人情——没有标准答案)',
] as const;

/**
 * v6.0.159: 获取本次生成的"创意种子"——三维组合确保每次创作独特
 * 使用Date.now()作为伪随机源，同一秒内创建的系列获得相同种子（可复现）
 */
export function getCreativeSeed(seriesId?: string): { archetype: string; motif: string; cultural: string } {
  // 用seriesId做hash以获得确定性随机（同一系列续接时种子不变）
  let seed = Date.now();
  if (seriesId) {
    let hash = 0;
    for (let i = 0; i < seriesId.length; i++) {
      hash = ((hash << 5) - hash + seriesId.charCodeAt(i)) | 0;
    }
    seed = Math.abs(hash);
  }
  return {
    archetype: NARRATIVE_ARCHETYPES[seed % NARRATIVE_ARCHETYPES.length],
    motif: LITERARY_MOTIFS[(seed >> 3) % LITERARY_MOTIFS.length],
    cultural: CULTURAL_REFERENCES[(seed >> 6) % CULTURAL_REFERENCES.length],
  };
}