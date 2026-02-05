/**
 * 阿里云OSS配置常量
 * 
 * 集中管理所有OSS相关的配置常量，避免硬编码分散
 * 
 * @version 3.22.5
 * @date 2026-01-26
 */

// ═══════════════════════════════════════════════════════════════
// Bucket配置
// ═══════════════════════════════════════════════════════════════

/**
 * 旧bucket名称（已弃用）
 * @deprecated 仅用于数据迁移，不应在新代码中使用
 */
export const OLD_BUCKET_NAME = 'awarelife';

/**
 * 当前使用的bucket名称
 * ✅ 所有新上传的文件都应该使用这个bucket
 */
export const CURRENT_BUCKET_NAME = 'aicomic-awarelife';

/**
 * 默认的OSS region（不带oss-前缀）
 * 注意：环境变量中应该配置为 "cn-shenzhen"，不带"oss-"前缀
 */
export const DEFAULT_REGION = 'cn-shenzhen';

/**
 * 默认的签名URL过期时间（秒）
 */
export const DEFAULT_SIGNED_URL_EXPIRY = 3600; // 1小时

// ═══════════════════════════════════════════════════════════════
// 目录结构配置
// ═══════════════════════════════════════════════════════════════

/**
 * OSS文件路径前缀
 */
export const OSS_PATH_PREFIXES = {
  /** 所有文件的根目录 */
  ROOT: 'aicomic',
  
  /** 视频文件目录 */
  VIDEO: 'aicomic/video-doubao',
  
  /** 图片文件目录 */
  IMAGE: 'aicomic/images',
  
  /** 封面图目录 */
  COVER: 'aicomic/covers',
  
  /** 临时文件目录 */
  TEMP: 'aicomic/temp',
} as const;

// ═══════════════════════════════════════════════════════════════
// 验证规则
// ═══════════════════════════════════════════════════════════════

/**
 * Bucket名称验证正则表达式
 * 规则：3-63字符，只能包含小写字母、数字和连字符，必须以字母或数字开头和结尾
 */
export const BUCKET_NAME_REGEX = /^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/;

/**
 * Region格式验证正则表达式（不带oss-前缀）
 * 示例：cn-shenzhen, cn-beijing, us-west-1, ap-southeast-1
 */
export const REGION_WITHOUT_PREFIX_REGEX = /^(cn|us|ap|eu)-[a-z0-9-]+$/;

/**
 * Region格式验证正则表达式（带oss-前缀）
 * 示例：oss-cn-shenzhen, oss-cn-beijing
 */
export const REGION_WITH_PREFIX_REGEX = /^oss-(cn|us|ap|eu)-[a-z0-9-]+$/;

// ═══════════════════════════════════════════════════════════════
// 环境变量键名
// ═══════════════════════════════════════════════════════════════

/**
 * 环境变量键名常量
 */
export const OSS_ENV_KEYS = {
  ACCESS_KEY_ID: 'ALIYUN_OSS_ACCESS_KEY_ID',
  ACCESS_KEY_SECRET: 'ALIYUN_OSS_ACCESS_KEY_SECRET',
  BUCKET_NAME: 'ALIYUN_OSS_BUCKET_NAME',
  REGION: 'ALIYUN_OSS_REGION',
  ENDPOINT: 'ALIYUN_OSS_ENDPOINT',
} as const;

// ═══════════════════════════════════════════════════════════════
// 工具函数
// ═══════════════════════════════════════════════════════════════

/**
 * 获取当前bucket名称（从环境变量或返回默认值）
 */
export function getCurrentBucketName(): string {
  return Deno.env.get(OSS_ENV_KEYS.BUCKET_NAME) || CURRENT_BUCKET_NAME;
}

/**
 * 检查是否为旧bucket
 */
export function isOldBucket(bucketName: string): boolean {
  return bucketName === OLD_BUCKET_NAME;
}

/**
 * 检查是否为当前bucket
 */
export function isCurrentBucket(bucketName: string): boolean {
  return bucketName === CURRENT_BUCKET_NAME;
}

/**
 * 规范化region格式（移除oss-前缀）
 * @param region - 原始region字符串
 * @returns 规范化后的region（不带oss-前缀）
 */
export function normalizeRegion(region: string): string {
  return region.startsWith('oss-') ? region.replace(/^oss-/, '') : region;
}

/**
 * 添加oss-前缀到region（用于构建endpoint）
 * @param region - 规范化的region（不带oss-前缀）
 * @returns 带oss-前缀的region
 */
export function addOssPrefix(region: string): string {
  return region.startsWith('oss-') ? region : `oss-${region}`;
}

/**
 * 验证bucket名称格式
 */
export function isValidBucketName(bucketName: string): boolean {
  return BUCKET_NAME_REGEX.test(bucketName);
}

/**
 * 验证region格式
 */
export function isValidRegion(region: string): boolean {
  return REGION_WITHOUT_PREFIX_REGEX.test(region) || REGION_WITH_PREFIX_REGEX.test(region);
}

/**
 * 构建OSS endpoint URL
 * @param bucketName - Bucket名称
 * @param region - Region（可以带或不带oss-前缀）
 * @returns 完整的OSS endpoint URL
 */
export function buildOSSEndpoint(bucketName: string, region: string): string {
  const normalizedRegion = normalizeRegion(region);
  const regionWithPrefix = addOssPrefix(normalizedRegion);
  return `https://${bucketName}.${regionWithPrefix}.aliyuncs.com`;
}

/**
 * 从OSS URL中提取bucket名称
 * @param url - OSS URL
 * @returns Bucket名称或null
 */
export function extractBucketFromUrl(url: string): string | null {
  // 匹配格式：https://bucket-name.oss-region.aliyuncs.com/path
  const match = url.match(/https?:\/\/([a-z0-9-]+)\.oss-[a-z0-9-]+\.aliyuncs\.com/i);
  return match ? match[1] : null;
}

/**
 * 从OSS URL中提取对象路径
 * @param url - OSS URL
 * @returns 对象路径或null
 */
export function extractPathFromUrl(url: string): string | null {
  try {
    const urlObj = new URL(url);
    return urlObj.pathname.substring(1); // 移除开头的 /
  } catch {
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════
// 错误消息常量
// ═══════════════════════════════════════════════════════════════

export const OSS_ERROR_MESSAGES = {
  MISSING_CONFIG: 'OSS配置缺失。请设置环境变量：ALIYUN_OSS_ACCESS_KEY_ID, ALIYUN_OSS_ACCESS_KEY_SECRET, ALIYUN_OSS_BUCKET_NAME',
  INVALID_BUCKET_NAME: 'Bucket名称格式不正确。必须是3-63字符，只能包含小写字母、数字和连字符',
  INVALID_REGION: 'Region格式不正确。应该是 cn-shenzhen, us-west-1 等格式',
  UPLOAD_FAILED: 'OSS上传失败',
  DOWNLOAD_FAILED: '从源URL下载失败',
  SIGNATURE_FAILED: 'OSS签名生成失败',
} as const;
