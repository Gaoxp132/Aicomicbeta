export type PencilUiIcon =
  | 'book-open'
  | 'palette'
  | 'play'
  | 'users'
  | 'megaphone'
  | 'grid-3x3';

export interface PencilUiFeatureCardSpec {
  id: string;
  title: string;
  desc: string;
  icon: PencilUiIcon;
  colorClass: string;
  bgClass: string;
}

export interface PencilUiHomeBlueprint {
  screenId: 'home-creation';
  purpose: string;
  hero: {
    badge: string;
    titlePrefix: string;
    titleHighlight: string;
    description: string;
  };
  composer: {
    placeholder: string;
    shortcutDesktop: string;
    shortcutMobile: string;
    advancedLabels: {
      productionType: string;
      visualStyle: string;
      episodeCount: string;
    };
    submitIdleLabel: string;
    submitLoadingLabel: string;
  };
  sections: {
    templatesTitle: string;
    recentTitle: string;
    recentActionLabel: string;
  };
  features: PencilUiFeatureCardSpec[];
  pencilNotes: string[];
}

export interface PencilUiWorkbenchBlueprint {
  screenId: 'series-workbench';
  purpose: string;
  header: {
    title: string;
    subtitle: string;
  };
  actions: {
    createLabel: string;
    refreshLabel: string;
  };
  features: PencilUiFeatureCardSpec[];
  pencilNotes: string[];
}

export const HOME_CREATION_PENCIL_BLUEPRINT: PencilUiHomeBlueprint = {
  screenId: 'home-creation',
  purpose: '用一句话驱动 AI 生成漫剧、短剧和宣传片内容。',
  hero: {
    badge: 'AI驱动 · 一键生成',
    titlePrefix: '用一句话',
    titleHighlight: '创作影视',
    description: '描述你想要的故事，AI将自动生成剧本、角色、分镜和视频',
  },
  composer: {
    placeholder: '描述你想创作的内容... 故事、品牌介绍、产品亮点、广告创意，任何想法都可以',
    shortcutDesktop: 'Enter 发送 · Shift+Enter 换行',
    shortcutMobile: 'Enter 发送',
    advancedLabels: {
      productionType: '作品类型',
      visualStyle: '视觉风格',
      episodeCount: '集数设置',
    },
    submitIdleLabel: '开始创作',
    submitLoadingLabel: '创作中...',
  },
  sections: {
    templatesTitle: '灵感模板 · 点击快速填充',
    recentTitle: '最近创作',
    recentActionLabel: '查看全部',
  },
  features: [
    {
      id: 'script-generation',
      title: 'AI剧本创作',
      desc: '自动生成角色、分集剧情、分镜脚本',
      icon: 'book-open',
      colorClass: 'text-blue-400',
      bgClass: 'from-blue-500/10 to-cyan-500/10',
    },
    {
      id: 'visual-style',
      title: '多样视觉风格',
      desc: '日漫、写实、赛博朋克等多种风格',
      icon: 'palette',
      colorClass: 'text-purple-400',
      bgClass: 'from-purple-500/10 to-pink-500/10',
    },
    {
      id: 'video-generation',
      title: '自动视频生成',
      desc: 'AI将分镜自动转化为连续视频',
      icon: 'play',
      colorClass: 'text-pink-400',
      bgClass: 'from-pink-500/10 to-orange-500/10',
    },
  ],
  pencilNotes: [
    'Hero、输入区、模板区、最近作品区和能力卡片区是主界面的五个稳定区块。',
    'Pencil 更新时优先改文案、卡片顺序和区块层级，不要改变创作主 CTA 的位置。',
    '创作按钮、更多选项和最近作品入口属于高频交互，设计更新时需保持辨识度。',
  ],
};

export const SERIES_WORKBENCH_PENCIL_BLUEPRINT: PencilUiWorkbenchBlueprint = {
  screenId: 'series-workbench',
  purpose: '集中管理用户作品、进入新建流程并浏览 AI 生成进度。',
  header: {
    title: '影视创作',
    subtitle: '创作属于你的影视作品',
  },
  actions: {
    createLabel: '新建作品',
    refreshLabel: '刷新',
  },
  features: [
    {
      id: 'episodes',
      title: '分集创作',
      desc: '支持多集连续剧情，完整故事线',
      icon: 'book-open',
      colorClass: 'text-blue-400',
      bgClass: 'from-blue-500/10 to-cyan-500/10',
    },
    {
      id: 'characters',
      title: '智能角色',
      desc: 'AI自动提取和管理角色信息',
      icon: 'users',
      colorClass: 'text-purple-400',
      bgClass: 'from-purple-500/10 to-pink-500/10',
    },
    {
      id: 'promo',
      title: '品牌宣传',
      desc: '世界一流的产品与品牌宣传素材',
      icon: 'megaphone',
      colorClass: 'text-amber-400',
      bgClass: 'from-amber-500/10 to-orange-500/10',
    },
    {
      id: 'storyboards',
      title: '分镜编辑',
      desc: '可视化分镜编辑和视频生成',
      icon: 'grid-3x3',
      colorClass: 'text-pink-400',
      bgClass: 'from-pink-500/10 to-rose-500/10',
    },
  ],
  pencilNotes: [
    '作品列表页保留“头部 + 操作按钮 + 能力卡片 + 列表”四层结构。',
    'Pencil 更新时优先保持新建作品按钮为页面第一主操作。',
    '能力卡片承担产品导览作用，可换文案和图标，但建议维持四卡节奏。',
  ],
};

export const PENCIL_UI_BLUEPRINTS = {
  homeCreation: HOME_CREATION_PENCIL_BLUEPRINT,
  seriesWorkbench: SERIES_WORKBENCH_PENCIL_BLUEPRINT,
} as const;

export const PENCIL_UI_SYNC_STATUS = {
  sourceOfTruth: 'src/app/constants/pencilUi.ts',
  preparedAt: '2026-03-23',
  requiresPencilConnection: true,
  note: '当前仓库已具备 Pencil-ready 蓝图；连接 Pencil 编辑器后即可据此生成/更新 .pen UI 源文件。',
} as const;