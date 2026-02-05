/**
 * SEO优化工具
 * 
 * 功能：
 * - 动态更新页面标题
 * - 动态更新meta标签
 * - 结构化数据（JSON-LD）
 * - Open Graph优化
 * - Twitter Card优化
 */

interface SEOConfig {
  title?: string;
  description?: string;
  keywords?: string[];
  image?: string;
  url?: string;
  type?: 'website' | 'article' | 'video.other';
  author?: string;
  publishedTime?: string;
  modifiedTime?: string;
}

/**
 * 更新页面标题
 */
export function updatePageTitle(title: string, suffix = ' - AI漫剧创作平台'): void {
  document.title = title + suffix;
  
  // 更新Open Graph标题
  updateMetaTag('og:title', title);
  
  // 更新Twitter标题
  updateMetaTag('twitter:title', title);
}

/**
 * 更新meta标签
 */
export function updateMetaTag(name: string, content: string): void {
  // 检查是property还是name
  const isProperty = name.startsWith('og:') || name.startsWith('fb:');
  const attribute = isProperty ? 'property' : 'name';
  
  let meta = document.querySelector(`meta[${attribute}="${name}"]`);
  
  if (!meta) {
    meta = document.createElement('meta');
    meta.setAttribute(attribute, name);
    document.head.appendChild(meta);
  }
  
  meta.setAttribute('content', content);
}

/**
 * 批量更新meta标签
 */
export function updateMetaTags(tags: Record<string, string>): void {
  Object.entries(tags).forEach(([name, content]) => {
    updateMetaTag(name, content);
  });
}

/**
 * 设置页面SEO配置
 */
export function setSEOConfig(config: SEOConfig): void {
  const {
    title = 'AI漫剧创作平台',
    description = '使用AI技术创作精彩漫剧，支持多种风格和时长，一键生成专属视频作品',
    keywords = ['AI漫剧', '视频生成', '创作平台', '短剧制作', 'AI创作'],
    image = '/og-image.jpg',
    url = window.location.href,
    type = 'website',
    author = 'AI漫剧团队',
    publishedTime,
    modifiedTime,
  } = config;

  // 基础SEO
  updatePageTitle(title, '');
  updateMetaTag('description', description);
  updateMetaTag('keywords', keywords.join(', '));

  // Open Graph
  const ogTags: Record<string, string> = {
    'og:title': title,
    'og:description': description,
    'og:image': image,
    'og:url': url,
    'og:type': type,
    'og:site_name': 'AI漫剧创作平台',
  };

  if (publishedTime) {
    ogTags['article:published_time'] = publishedTime;
  }

  if (modifiedTime) {
    ogTags['article:modified_time'] = modifiedTime;
  }

  if (author) {
    ogTags['article:author'] = author;
  }

  updateMetaTags(ogTags);

  // Twitter Card
  const twitterTags: Record<string, string> = {
    'twitter:card': 'summary_large_image',
    'twitter:title': title,
    'twitter:description': description,
    'twitter:image': image,
  };

  updateMetaTags(twitterTags);
}

/**
 * 为视频作品设置SEO
 */
export function setVideoSEO(video: {
  title: string;
  description: string;
  thumbnail: string;
  videoUrl: string;
  createdAt: Date;
  author?: string;
}): void {
  setSEOConfig({
    title: video.title,
    description: video.description,
    image: video.thumbnail,
    url: window.location.href,
    type: 'video.other',
    author: video.author,
    publishedTime: video.createdAt.toISOString(),
  });

  // 添加视频结构化数据
  addStructuredData({
    '@context': 'https://schema.org',
    '@type': 'VideoObject',
    name: video.title,
    description: video.description,
    thumbnailUrl: video.thumbnail,
    contentUrl: video.videoUrl,
    uploadDate: video.createdAt.toISOString(),
    ...(video.author && { author: { '@type': 'Person', name: video.author } }),
  });
}

/**
 * 为漫剧系列设置SEO
 */
export function setSeriesSEO(series: {
  title: string;
  description: string;
  coverImage: string;
  episodeCount: number;
  genre: string;
}): void {
  setSEOConfig({
    title: series.title,
    description: series.description,
    image: series.coverImage,
    keywords: ['AI漫剧', series.genre, '连续剧', '短剧'],
    type: 'website',
  });

  // 添加系列结构化数据
  addStructuredData({
    '@context': 'https://schema.org',
    '@type': 'TVSeries',
    name: series.title,
    description: series.description,
    image: series.coverImage,
    numberOfEpisodes: series.episodeCount,
    genre: series.genre,
  });
}

/**
 * 添加结构化数据（JSON-LD）
 */
export function addStructuredData(data: object): void {
  const scriptId = 'structured-data';
  
  // 移除旧的结构化数据
  const oldScript = document.getElementById(scriptId);
  if (oldScript) {
    oldScript.remove();
  }

  // 添加新的结构化数据
  const script = document.createElement('script');
  script.id = scriptId;
  script.type = 'application/ld+json';
  script.textContent = JSON.stringify(data);
  document.head.appendChild(script);
}

/**
 * 添加面包屑导航结构化数据
 */
export function addBreadcrumbStructuredData(breadcrumbs: Array<{ name: string; url: string }>): void {
  const data = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: breadcrumbs.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  };

  addStructuredData(data);
}

/**
 * 重置为默认SEO配置
 */
export function resetSEO(): void {
  setSEOConfig({
    title: 'AI漫剧创作平台',
    description: '使用AI技术创作精彩漫剧，支持多种风格和时长，一键生成专属视频作品',
    keywords: ['AI漫剧', '视频生成', '创作平台', '短剧制作', 'AI创作'],
  });

  // 移除结构化数据
  const script = document.getElementById('structured-data');
  if (script) {
    script.remove();
  }
}

/**
 * 添加canonical链接
 */
export function setCanonicalUrl(url: string): void {
  let link = document.querySelector('link[rel="canonical"]') as HTMLLinkElement;
  
  if (!link) {
    link = document.createElement('link');
    link.rel = 'canonical';
    document.head.appendChild(link);
  }
  
  link.href = url;
}

/**
 * 预加载重要资源
 */
export function preloadResource(href: string, as: string, type?: string): void {
  const link = document.createElement('link');
  link.rel = 'preload';
  link.href = href;
  link.as = as;
  
  if (type) {
    link.type = type;
  }
  
  document.head.appendChild(link);
}

/**
 * 预连接到域名
 */
export function preconnect(url: string, crossorigin = false): void {
  const link = document.createElement('link');
  link.rel = 'preconnect';
  link.href = url;
  
  if (crossorigin) {
    link.crossOrigin = 'anonymous';
  }
  
  document.head.appendChild(link);
}

/**
 * DNS预解析
 */
export function dnsPrefetch(url: string): void {
  const link = document.createElement('link');
  link.rel = 'dns-prefetch';
  link.href = url;
  document.head.appendChild(link);
}

/**
 * 优化第三方资源加载
 */
export function optimizeThirdPartyLoading(): void {
  // 预连接到常用CDN
  preconnect('https://ark.cn-beijing.volces.com', true);
  
  // DNS预解析
  dnsPrefetch('https://ark.cn-beijing.volces.com');
  
  console.log('[SEO] ✅ Third-party resource loading optimized');
}

/**
 * 初始化SEO优化
 */
export function initializeSEO(): void {
  // 设置默认SEO配置
  resetSEO();
  
  // 优化第三方资源
  optimizeThirdPartyLoading();
  
  // 设置canonical URL
  setCanonicalUrl(window.location.origin + window.location.pathname);
  
  // 添加网站结构化数据
  addStructuredData({
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: 'AI漫剧创作平台',
    description: '使用AI技术创作精彩漫剧，支持多种风格和时长，一键生成专属视频作品',
    url: window.location.origin,
    applicationCategory: 'MultimediaApplication',
    operatingSystem: 'Web',
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'CNY',
    },
  });
  
  console.log('[SEO] ✅ SEO optimization initialized');
}

// 导出常用SEO配置
export const SEO_PRESETS = {
  home: {
    title: 'AI漫剧创作平台 - 一键生成精彩短剧',
    description: '使用AI技术创作精彩漫剧，支持12种风格和多种时长，一键生成专属视频作品。支持30-80集长剧创作和12大剧类型。',
    keywords: ['AI漫剧', '视频生成', '创作平台', '短剧制作', 'AI创作', '长剧制作'],
  },
  create: {
    title: '创作中心 - AI漫剧创作平台',
    description: '快速创建AI漫剧，选择风格、设置时长，一键生成专属视频作品',
    keywords: ['创作中心', '视频生成', 'AI创作', '快速创建'],
  },
  series: {
    title: '漫剧创作 - AI漫剧创作平台',
    description: '创作30-80集长篇漫剧，支持12大剧类型，AI自动生成剧本、角色和分镜',
    keywords: ['漫剧创作', '长剧制作', '剧本生成', '角色设计'],
  },
  community: {
    title: '社区广场 - AI漫剧创作平台',
    description: '浏览热门漫剧作品，发现精彩内容，与创作者互动交流',
    keywords: ['社区广场', '热门作品', '内容发现', '创作者社区'],
  },
  profile: {
    title: '个人中心 - AI漫剧创作平台',
    description: '管理我的作品，查看创作历史，编辑个人资料',
    keywords: ['个人中心', '我的作品', '创作历史'],
  },
};

console.log('[SEO] ✅ SEO optimization utilities loaded');
