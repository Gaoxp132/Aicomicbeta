/**
 * 时间工具函数 - 统一使用北京时间（UTC+8）
 * 
 * v4.2.0 - 所有时间字段都使用北京时间存储和处理
 * v4.2.3 - CACHE BUSTER: MODULE_PATH_FIX_2026-01-27
 * v4.2.4 - FORCE_RECOMPILE: EXPORT_FIX_2026-01-27_001
 */

// 🔥 CACHE BUSTER - Force Deno to recompile this module
export const TIME_MODULE_VERSION = 'v4.2.4_EXPORT_FIX_2026-01-27_001';

/**
 * 获取当前北京时间（ISO格式字符串）
 * @returns 北京时间的ISO字符串
 */
export function getBeijingTime(): string {
  const now = new Date();
  // 转换为北京时间（UTC+8）
  const beijingTime = new Date(now.getTime() + (8 * 60 * 60 * 1000));
  return beijingTime.toISOString();
}

/**
 * 获取当前北京时间（Date对象）
 * @returns 北京时间的Date对象
 */
export function getBeijingDate(): Date {
  const now = new Date();
  return new Date(now.getTime() + (8 * 60 * 60 * 1000));
}

/**
 * 将UTC时间转换为北京时间
 * @param utcTime UTC时间（Date对象或ISO字符串）
 * @returns 北京时间的ISO字符串
 */
export function toBeijingTime(utcTime: Date | string): string {
  const date = typeof utcTime === 'string' ? new Date(utcTime) : utcTime;
  const beijingTime = new Date(date.getTime() + (8 * 60 * 60 * 1000));
  return beijingTime.toISOString();
}

/**
 * 格式化北京时间为可读字符串
 * @param time 时间（Date对象或ISO字符串）
 * @param format 格式类型：'full' | 'date' | 'time' | 'datetime'
 * @returns 格式化后的时间字符串
 */
export function formatBeijingTime(
  time: Date | string,
  format: 'full' | 'date' | 'time' | 'datetime' = 'datetime'
): string {
  const date = typeof time === 'string' ? new Date(time) : time;
  
  // 确保是北京时间
  const beijingDate = new Date(date.getTime() + (8 * 60 * 60 * 1000));
  
  const year = beijingDate.getUTCFullYear();
  const month = String(beijingDate.getUTCMonth() + 1).padStart(2, '0');
  const day = String(beijingDate.getUTCDate()).padStart(2, '0');
  const hours = String(beijingDate.getUTCHours()).padStart(2, '0');
  const minutes = String(beijingDate.getUTCMinutes()).padStart(2, '0');
  const seconds = String(beijingDate.getUTCSeconds()).padStart(2, '0');
  
  switch (format) {
    case 'full':
      return `${year}年${month}月${day}日 ${hours}:${minutes}:${seconds}`;
    case 'date':
      return `${year}-${month}-${day}`;
    case 'time':
      return `${hours}:${minutes}:${seconds}`;
    case 'datetime':
      return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
    default:
      return beijingDate.toISOString();
  }
}

/**
 * 检查视频链接是否过期（火山引擎链接24小时过期）
 * @param createdAt 创建时间
 * @param expiryHours 过期时间（小时），默认24小时
 * @returns 是否已过期
 */
export function isVideoExpired(createdAt: string | Date, expiryHours: number = 24): boolean {
  const createTime = typeof createdAt === 'string' ? new Date(createdAt) : createdAt;
  const now = getBeijingDate();
  const diffHours = (now.getTime() - createTime.getTime()) / (1000 * 60 * 60);
  return diffHours >= expiryHours;
}

/**
 * 获取视频剩余有效时间（分钟）
 * @param createdAt 创建时间
 * @param expiryHours 过期时间（小时），默认24小时
 * @returns 剩余分钟数，如果已过期返回0
 */
export function getVideoRemainingMinutes(
  createdAt: string | Date,
  expiryHours: number = 24
): number {
  const createTime = typeof createdAt === 'string' ? new Date(createdAt) : createdAt;
  const now = getBeijingDate();
  const expiryTime = new Date(createTime.getTime() + (expiryHours * 60 * 60 * 1000));
  const diffMinutes = Math.floor((expiryTime.getTime() - now.getTime()) / (1000 * 60));
  return Math.max(0, diffMinutes);
}

/**
 * 计算两个时间之间的差值
 * @param time1 时间1
 * @param time2 时间2
 * @returns 差值对象（天、小时、分钟、秒）
 */
export function getTimeDiff(time1: Date | string, time2: Date | string) {
  const date1 = typeof time1 === 'string' ? new Date(time1) : time1;
  const date2 = typeof time2 === 'string' ? new Date(time2) : time2;
  
  const diffMs = Math.abs(date2.getTime() - date1.getTime());
  
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((diffMs % (1000 * 60)) / 1000);
  
  return { days, hours, minutes, seconds, totalMs: diffMs };
}

/**
 * 获取相对时间描述（例如：2小时前、3天前）
 * @param time 时间
 * @returns 相对时间描述
 */
export function getRelativeTime(time: Date | string): string {
  const date = typeof time === 'string' ? new Date(time) : time;
  const now = getBeijingDate();
  const diff = getTimeDiff(date, now);
  
  if (diff.days > 0) {
    return `${diff.days}天前`;
  } else if (diff.hours > 0) {
    return `${diff.hours}小时前`;
  } else if (diff.minutes > 0) {
    return `${diff.minutes}分钟前`;
  } else {
    return '刚刚';
  }
}

/**
 * 验证时间字符串是否有效
 * @param timeStr 时间字符串
 * @returns 是否有效
 */
export function isValidTimeString(timeStr: string): boolean {
  const date = new Date(timeStr);
  return !isNaN(date.getTime());
}

/**
 * 获取今天开始时间（北京时间00:00:00）
 * @returns 今天开始的时间字符串
 */
export function getTodayStart(): string {
  const now = getBeijingDate();
  now.setUTCHours(0, 0, 0, 0);
  return now.toISOString();
}

/**
 * 获取今天结束时间（北京时间23:59:59）
 * @returns 今天结束的时间字符串
 */
export function getTodayEnd(): string {
  const now = getBeijingDate();
  now.setUTCHours(23, 59, 59, 999);
  return now.toISOString();
}

/**
 * 获取N天前的时间
 * @param days 天数
 * @returns N天前的时间字符串
 */
export function getDaysAgo(days: number): string {
  const now = getBeijingDate();
  const past = new Date(now.getTime() - (days * 24 * 60 * 60 * 1000));
  return past.toISOString();
}

/**
 * 获取N小时前的时间
 * @param hours 小时数
 * @returns N小时前的时间字符串
 */
export function getHoursAgo(hours: number): string {
  const now = getBeijingDate();
  const past = new Date(now.getTime() - (hours * 60 * 60 * 1000));
  return past.toISOString();
}

// 导出常量
export const BEIJING_TIMEZONE = 'Asia/Shanghai';
export const UTC_OFFSET_HOURS = 8;
export const VIDEO_EXPIRY_HOURS = 24; // 火山引擎视频24小时过期