/**
 * 格式化工具函数集合
 */

/**
 * 格式化时间（秒数转为 MM:SS 格式）
 * @param seconds 秒数
 * @returns 格式化后的时间字符串
 */
export function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/**
 * 格式化文件大小
 * @param bytes 字节数
 * @returns 格式化后的文件大小字符串
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

/**
 * 格式化日期时间
 * @param date 日期对象或字符串
 * @param includeTime 是否包含时间
 * @returns 格式化后的日期字符串
 */
export function formatDateTime(date: Date | string, includeTime: boolean = true): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  
  if (includeTime) {
    return d.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  }
  
  return d.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

/**
 * 格式化数字（添加千位分隔符）
 * @param num 数字
 * @returns 格式化后的数字字符串
 */
export function formatNumber(num: number): string {
  return num.toLocaleString('zh-CN');
}

/**
 * 截断文本并添加省略号
 * @param text 原文本
 * @param maxLength 最大长度
 * @returns 截断后的文本
 */
export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
}

/**
 * 计算视频生成的预估等待时间（分钟）
 * @param durationSeconds 视频时长（秒）
 * @returns 预估等待时间（分钟）
 */
export function estimateGenerationTime(durationSeconds: number): number {
  if (durationSeconds <= 4) {
    return 1;
  } else if (durationSeconds <= 8) {
    return 2;
  } else {
    return 3;
  }
}