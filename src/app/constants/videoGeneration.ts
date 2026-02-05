// 风格选项
export const STYLES = [
  { id: 'realistic', name: '写实风格', icon: '🎬', gradient: 'from-blue-500 to-cyan-500' },
  { id: 'cartoon', name: '卡通风格', icon: '🎨', gradient: 'from-yellow-500 to-orange-500' },
  { id: 'fantasy', name: '奇幻风格', icon: '✨', gradient: 'from-purple-500 to-pink-500' },
  { id: 'comic', name: '漫画风格', icon: '📚', gradient: 'from-green-500 to-emerald-500' },
  { id: 'cyberpunk', name: '赛博朋克', icon: '🌆', gradient: 'from-cyan-500 to-blue-500' },
  { id: 'chinese', name: '中国古风', icon: '🏮', gradient: 'from-red-500 to-amber-500' },
  { id: 'watercolor', name: '水彩画风', icon: '🌸', gradient: 'from-pink-400 to-purple-400' },
  { id: 'oil', name: '油画风格', icon: '🎨', gradient: 'from-amber-600 to-orange-600' },
  { id: 'gothic', name: '黑暗哥特', icon: '🌃', gradient: 'from-gray-700 to-purple-900' },
  { id: 'candy', name: '糖果甜美', icon: '🌈', gradient: 'from-pink-300 to-blue-300' },
  { id: 'fairy', name: '梦幻童话', icon: '✨', gradient: 'from-violet-400 to-fuchsia-400' },
  { id: 'anime', name: '日系动漫', icon: '🎌', gradient: 'from-pink-500 to-rose-500' },
];

// 时长选项
export const ALL_DURATIONS = [
  { id: '5s', name: '5秒', desc: '快速片段' },
  { id: '8s', name: '8秒', desc: '标准长度' },
  { id: '10s', name: '10秒', desc: '标准长度+' },
  { id: '12s', name: '12秒', desc: '深度内容' },
  { id: '16s', name: '16秒', desc: '完整故事' },
  { id: '20s', name: '20秒', desc: '长视频' },
];

// 分辨率选项
export const RESOLUTIONS = [
  { id: '480p', name: '480P', desc: '流畅' },
  { id: '720p', name: '720P', desc: '标清' },
  { id: '1080p', name: '1080P', desc: '高清' },
  { id: '2k', name: '2K', desc: '超清' },
];

// FPS选项
export const FPS_OPTIONS = [
  { id: 24, name: '24fps', desc: '电影感' },
];

// 图片模式
export const IMAGE_MODES = [
  { id: 'first_frame', name: '首帧模式', desc: '上传1张首帧图', icon: '🎬', maxImages: 1 },
  { id: 'first_last', name: '首尾帧模式', desc: '上传首帧和尾帧', icon: '🎞️', maxImages: 2 },
  { id: 'reference', name: '参考图模式', desc: '上传1-4张参考图', icon: '🖼️', maxImages: 4 },
];

// 模型能力定义
export const MODEL_CAPABILITIES = {
  // 🆕 阿里云通义Wan2.1-14B模型
  'aliyun-wan-2.1-14b': {
    name: 'Wan2.1-14B',
    desc: '通义顶级模型·超高质量',
    supportsAudio: false, // ⚠️ 阿里云通义系列不支持音频
    supportsFirstFrame: true,
    supportsFirstLastFrame: true,
    supportsReferenceImages: true,
    supportsTextToVideo: true,
    minImages: 0,
    maxImages: 4,
    resolutions: ['480p', '720p', '1080p', '2k'],
    durations: ['5s', '8s', '10s', '12s', '16s', '20s'], // ⚠️ 最短5s，最长20s
    fps: [24, 30, 60],
    priority: 10, // 最高优先级
  },
  'doubao-seedance-1-5-pro-251215': {
    name: '1.5专业版',
    desc: '最高质量·音画同生',
    supportsAudio: true,
    supportsFirstFrame: true,
    supportsFirstLastFrame: true,
    supportsReferenceImages: false,
    supportsTextToVideo: true,
    minImages: 0,
    maxImages: 2,
    resolutions: ['480p', '720p'],
    durations: ['5s', '8s', '10s', '12s'], // ⚠️ 火山引擎最长12秒
    priority: 5,
  },
  'doubao-seedance-1-0-pro-250528': {
    name: '标准专业版',
    desc: '高质量',
    supportsAudio: false,
    supportsFirstFrame: true,
    supportsFirstLastFrame: true,
    supportsReferenceImages: false,
    supportsTextToVideo: true,
    minImages: 0,
    maxImages: 2,
    resolutions: ['480p', '720p', '1080p'],
    durations: ['5s', '8s', '10s'], // ⚠️ 最长10秒
    priority: 4,
  },
  'doubao-seedance-1-0-pro-fast-251015': {
    name: '快速版',
    desc: '平衡性能',
    supportsAudio: false,
    supportsFirstFrame: true,
    supportsFirstLastFrame: false,
    supportsReferenceImages: false,
    supportsTextToVideo: true,
    minImages: 0,
    maxImages: 1,
    resolutions: ['480p', '720p', '1080p'],
    durations: ['5s', '8s', '10s', '12s'], // ⚠️ 最长12秒
    priority: 3,
  },
  'doubao-seedance-1-0-lite-t2v-250428': {
    name: '轻量文生版',
    desc: '快速生成',
    supportsAudio: false,
    supportsFirstFrame: false,
    supportsFirstLastFrame: false,
    supportsReferenceImages: false,
    supportsTextToVideo: true,
    minImages: 0,
    maxImages: 0,
    resolutions: ['480p', '720p'],
    durations: ['5s', '8s', '10s', '12s'], // ⚠️ 最长12秒
    priority: 1,
  },
  'doubao-seedance-1-0-lite-i2v-250428': {
    name: '轻量图生版',
    desc: '多图参考',
    supportsAudio: false,
    supportsFirstFrame: true,
    supportsFirstLastFrame: true,
    supportsReferenceImages: true,
    supportsTextToVideo: false,
    minImages: 1,
    maxImages: 4,
    resolutions: ['480p', '720p'],
    durations: ['5s', '8s', '10s'], // ⚠️ 最长10秒
    priority: 2,
  },
  'doubao-wan2-1-14b-250110': {
    name: 'Wan2.1-14B',
    desc: '火山引擎高性能·音画同生',
    supportsAudio: true,
    supportsFirstFrame: true,
    supportsFirstLastFrame: true,
    supportsReferenceImages: true,
    supportsTextToVideo: true,
    minImages: 0,
    maxImages: 4,
    resolutions: ['480p', '720p', '1080p'],
    durations: ['5s', '8s', '10s', '12s'], // ⚠️ 火山引擎最长12秒
    fps: [24, 30],
    priority: 8, // 高优先级
  },
};

// 示例故事
export const STYLE_STORIES: Record<string, string[]> = {
  anime: [
    '在樱花飘落的校园里，一位拥有神秘力量的少女遇见了来自异世界的守护者，一场关于命运与友情的冒险即将开始',
    '一个平凡的高中生意外获得了穿越时空的能力，他必须阻止即将发生的灾难，拯救他所珍视的人',
    '魔法学院的转学生隐藏着不为人知的秘密，当黑暗势力降临，她的真实身份将被揭开',
  ],
  cyberpunk: [
    '2077年，霓虹灯闪烁的赛博都市中，一名黑客发现了公司隐藏的黑暗真相，她必须在24小时内逃离追捕',
    '未来世界，人类意识可以上传到网络，一场关于自由意志的革命悄然展开',
    '在机械与血肉交织的都市废墟中，最后一个拥有真实记忆的人类展开了反抗',
  ],
  fantasy: [
    '古老的魔法森林深处，一位年轻的精灵发现了失落已久的龙之石，一场史诗般的冒险即将开始',
    '被遗忘的王国中，最后的魔法师守护着世界的平衡，当封印松动，黑暗再次苏醒',
    '命运选中的少年踏上寻找神器的旅程，他将穿越危险的魔法领域，面对未知的挑战',
  ],
  realistic: [
    '一位摄影师在追逐光影的旅途中，记录下城市边缘人们的真实故事，每一帧都是生活的诗篇',
    '退役运动员重返训练场，为了最后一次证明自己，他克服伤痛和质疑，向梦想发起冲击',
    '在偏远山村支教的年轻教师，用知识和爱改变着孩子们的命运，也找到了人生的意义',
  ],
  cartoon: [
    '调皮的小猫咪和机智的仓鼠成为了最好的朋友，他们在城市中展开一系列搞笑冒险',
    '森林里的动物们决定举办一场盛大的音乐会，每个小伙伴都贡献出自己的特长',
    '勇敢的小兔子为了找到传说中的彩虹胡萝卜，踏上了充满惊喜的奇妙旅程',
  ],
  comic: [
    '超能力觉醒的普通人，白天是上班族，夜晚化身守护城市的英雄，在两种身份间艰难平衡',
    '时间停止的瞬间，只有他还能行动，一场关于时间的阴谋正在暗中进行',
    '拥有读心术的侦探遇到了第一个读不懂的人，这背后隐藏着惊天秘密',
  ],
};

// 风格缩略图映射（用于预览和默认封面）
export const STYLE_THUMBNAILS: Record<string, string> = {
  anime: 'https://images.unsplash.com/photo-1697059172415-f1e08f9151bb?w=400&h=600&fit=crop',
  cyberpunk: 'https://images.unsplash.com/photo-1688377051459-aebb99b42bff?w=400&h=600&fit=crop',
  fantasy: 'https://images.unsplash.com/photo-1593410733607-4fe72c8f3f73?w=400&h=600&fit=crop',
  realistic: 'https://images.unsplash.com/photo-1536440136628-849c177e76a1?w=400&h=600&fit=crop',
  cartoon: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=400&h=600&fit=crop',
  comic: 'https://images.unsplash.com/photo-1612036782180-6f0b6cd846fe?w=400&h=600&fit=crop',
};