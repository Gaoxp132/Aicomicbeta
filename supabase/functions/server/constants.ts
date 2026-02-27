/**
 * 常量配置模块
 * v6.0.132
 */

import type { ProductionTypeConfig } from "./types.ts";

export const APP_VERSION = "v6.0.132";
export const PREFIX = '/make-server-fc31472c';

// 管理员账号
export const ADMIN_PHONE = '18565821136';

// v6.0.107: 服务端合并阈值（merge-videos + merge-all-videos 共享）
// Edge Function 内存限制约 150MB，超过阈值时指示前端走本地合并
export const MAX_SERVER_MERGE_SEGMENTS = 6;      // 分镜数上限
export const MAX_SERVER_MERGE_SIZE_MB = 60;       // 预估总大小上限（每段约 10MB）
export const ESTIMATED_SEGMENT_SIZE_MB = 10;      // 每段视频预估大小（720p 10s MP4 典型值）

// 环境变量（路由中需要做特性检查的导出）
export const VOLCENGINE_API_KEY = Deno.env.get('VOLCENGINE_API_KEY') || '';
export const ALIYUN_BAILIAN_API_KEY = Deno.env.get('ALIYUN_BAILIAN_API_KEY') || '';
export const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') || '';

// 火山引擎配置
export const VOLCENGINE_BASE_URL = "https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks";
export const DOUBAO_CHAT_URL = "https://ark.cn-beijing.volces.com/api/v3/chat/completions";

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
export const SEEDANCE_I2V_EXTRA = '，同一角色全程保持：相同五官轮廓（眉形/眼形/鼻形/唇形��全一致）、相同发型发色（刘海长度/分线位置/卷曲程度不变）、相同服装配饰（颜色/款式/佩戴位置不变）、相同体型比例、相同皮肤痣/疤痕/胎记位置（如有），严禁角色外貌在帧间发生任何化——面微特征（痣/酒窝/雀斑）的位置和大小必须逐帧锁定';

// 风格提示词
export const STYLE_PROMPTS: Record<string, string> = {
  anime: "日系动漫风格，线条清晰流畅，大眼睛特征明显，色彩鲜艳明亮，背景细腻有层次感，人物比例修长，表情夸张生动，光影对比柔和，整体画风统一干净",
  cyberpunk: "赛博朋克未来科技风格，霓虹灯光与暗色调对比强烈，金属质感突出，城市充满高科技元素，色调以蓝紫青为主，人物穿戴科技感服饰，画面有雨雾光晕效果",
  fantasy: "奇幻魔法世界风格，色彩瑰丽梦幻，光效华丽，自然元素与魔法融合，建筑宏伟神秘，人物服饰古典华丽，画面充满奇幻氛围，光影温暖而神秘",
  realistic: "真实写实风格，画面如电影级质感，光影自然逼真，人物比例真实，皮肤纹理细腻，服装材质感强，场景环境细节丰富，色调真实自然，镜头语言专业",
  cartoon: "卡通动画风格线条圆润爱，色彩饱和度高，人物造型Q版圆润，表情丰富夸张，背景简���明快，整体画面活泼欢乐，色调温暖明亮",
  comic: "漫画分镜风格，黑白线稿为主搭配适度上色，线条力度感强，分镜构图有张力，人物动态夸张，阴影对比鲜明，画面有漫画网点效果",
  chinese: "中国风水墨风，笔触写意灵动，墨色浓淡相宜，白意境深远，人物古典端庄，服饰飘逸华美，场景融合山水园林元素，色调素雅古朴",
  pixel: "像素艺术风格，方块像素构成画面，色彩鲜明复古，8-bit游戏画面感，角色方头方脑可爱呆萌，场景简洁像素化，整体怀旧游戏氛围浓厚",
  threed: "3D渲染风格，模型精致光滑，材质质感真实，光影层次丰富，环境建模立体感强，人物表情自然细腻，皮克斯/迪士尼级别的高品质三维动画效果",
  oil_painting: "古典油画风格，笔触厚重有质感，色彩层次浓郁饱满，光影伦勃朗般戏剧化，人物肖像庄重优雅，背景氛围感强烈，整体画面如同文艺复兴时期大师之作",
  watercolor: "水彩画风格，色彩透明清新淡雅，颜料晕染自然流畅，留白灵动有意境，笔触轻柔飘逸，人物轮廓柔和梦幻，背景如水中倒影般朦胧，整体画面诗意盎然",
  noir: "黑白电影风格，高对比度黑白画面，光影戏剧化如胶片质感，人物剪影分明，场景充��神秘悬疑氛围，烟雾弥漫的街道，百叶窗投下的条纹光影，复古胶片颗粒感",
  steampunk: "蒸汽朋克风格，维多利亚时代工业美学，黄铜齿轮与蒸汽管道遍布，机械装置精密复杂，人物身着复古机械风服饰佩戴护镜，色调暖铜与深棕交织，画面充满工业浪漫感",
  xianxia: "古风仙侠风格，仙气飘渺的东方玄幻世界，云海仙山气势恢宏，人物白衣飘飘仙风道骨，法术特效华丽绚目，场景融合道教与东方神话元素，色调青蓝紫搭配金光，画面超凡脱俗",
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
    label: '电影', narrativeStyle: '经典三幕结构或英雄之旅：建置(25%)→对抗(50%)→解决(25%)；深度角色弧光',
    shotStyle: '宽银幕2.39:1；系统化景别编排(ELS建立→LS场景→MS互动→CU情感→ECU细节)；大师级构图(黄金分割/引导线/框架构图)',
    editingStyle: '镜头时长6-12秒大师节奏；正反打(shot-reverse-shot)对话场景；平行蒙太奇/交叉剪辑推进多线叙事',
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
    label: 'MV', narrativeStyle: '音乐节奏驱动画面切换；叙事/表演/概念三种段落穿插；情感先于逻辑',
    shotStyle: '创意角度(倾斜/极低/极高)；大量使用浅景深光斑(bokeh)；慢动作+快动作对比',
    editingStyle: '严格按BPM节拍剪辑(每拍/每小节一切)；快速蒙太奇段落；创意转场(匹配剪辑/形状转场)',
    colorTone: '高度风格化的色彩方案(单色调/霓虹/胶片)；频繁使用色彩闪烁和渐变；光影戏剧化',
  },
  advertisement: {
    label: '告片', narrativeStyle: '5秒内传达核心信息；产品/品牌作为故事解决方案出场；最后3秒明确CTA',
    shotStyle: '产品特写使用微距+光滑运镜(slider)；人物使用中景展示使用场景；品牌logo始终保持视觉位置',
    editingStyle: '镜头时长1-3秒极快节奏；使用speed ramp(变速)制造冲击力；最后定格在品牌画面',
    colorTone: '品牌色贯穿全片；高明度高饱和度吸引注意力；白色/浅色背景突出产品质感',
  },
};

// 专业景别映射（中英文 + Seedance 2.0运镜指令）
export const PRO_SHOT_MAP: Record<string, string> = {
  // 英文专业景别
  'extreme-long-shot': '大远景(ELS)，超广角镜头缓缓平移，展现宏大全貌，人物是环境中的渺小存在',
  'long-shot': '远景(LS)，固定或缓慢拉远，展示人物全身与环境关系，建立空间感',
  'medium-shot': '中景(MS)，平稳跟拍人物膝上半身，展现肢体语言和人物互动',
  'medium-close-up': '中近景(MCU)，缓慢推镜至胸部以上，捕捉面部表情与手势细节',
  'close-up': '近景特写(CU)，缓慢推镜聚焦面部/关键物品，传达深层情感',
  'extreme-close-up': '极特写(ECU)，微距镜头聚焦眼睛/嘴唇/手指等极小细节，强化戏剧张力',
  // 中文景别（AI常返回）
  '大远景': '大远景(ELS)，超广角镜头缓缓平移，展现宏大全貌，人物是环境中的渺小存在',
  '远景': '远景(LS)，固定或缓慢拉远，展人物全身与环境关系，建立空间感',
  '全景': '全景(FS)，固定镜头展示完整场景与所有人物关系',
  '中景': '中景(MS)，平稳跟拍人物膝上半身，展现肢体语言和人物互动',
  '中近景': '中近景(MCU)，缓慢推镜至胸部以上，捕捉面部表情与手势细节',
  '近景': '近景特写(CU)，缓慢推镜聚焦面部，传达深层情感与微表情',
  '特写': '特写(CU)，缓慢推镜聚焦面部/关键物品，传达深层情感',
  '大特写': '极特写(ECU)，微距镜头聚焦极小细节，强化戏剧张力',
  // 角度类
  '俯拍': '高角度俯拍(HA)，鸟瞰视角固定拍摄，暗示角色渺小或被压迫',
  '仰拍': '低角度仰拍(LA)，缓慢上推镜头增强角色气势与权威感',
  '平拍': '平视角(EL)，与角色视线齐平，平稳跟拍，最自然真实的视角',
  'POV': '第一人称主观镜头(POV)，手持微晃模拟角色视线，营造代入感',
  '倾斜': '荷兰角(Dutch Angle)，倾斜构图制造不安/紧张/疯狂的心理暗示',
  // 旧值兼容
  'medium': '中景(MS)，平稳跟拍人物膝上半身',
  'wide': '远景(LS)，展示人物全身与环境关系',
  'overhead': '高角度俯拍(HA)，鸟瞰视角',
  'low-angle': '低角度仰拍(LA)，增强角色气势',
};