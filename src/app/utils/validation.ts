/**
 * 数据验证工具函数
 */

/**
 * 验证手机号格式（中国大陆）
 */
export function isValidPhone(phone: string): boolean {
  const phoneRegex = /^1[3-9]\d{9}$/;
  return phoneRegex.test(phone);
}

/**
 * 验证UUID格式
 */
export function isValidUUID(uuid: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
}

/**
 * 验证URL格式
 */
export function isValidUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * 验证视频文件URL（支持常见视频格式）
 */
export function isValidVideoUrl(url: string): boolean {
  if (!isValidUrl(url)) return false;
  
  const videoExtensions = ['.mp4', '.webm', '.ogg', '.mov', '.avi', '.mkv'];
  const urlLower = url.toLowerCase();
  
  return videoExtensions.some(ext => urlLower.includes(ext)) || 
         urlLower.includes('video') ||
         urlLower.includes('cloudinary') ||
         urlLower.includes('supabase');
}

/**
 * 验证文本长度
 */
export function isValidLength(text: string, min: number = 1, max: number = 1000): boolean {
  const length = text.trim().length;
  return length >= min && length <= max;
}

/**
 * 清理和验证用户输入
 */
export function sanitizeInput(input: string): string {
  return input
    .trim()
    .replace(/[<>]/g, '') // 移除尖括号防止XSS
    .substring(0, 1000); // 限制最大长度
}

/**
 * 验证视频时长范围（秒）
 */
export function isValidDuration(duration: number): boolean {
  return duration >= 4 && duration <= 60;
}

/**
 * 验证分辨率格式
 */
export function isValidResolution(resolution: string): boolean {
  const validResolutions = ['720p', '1080p', '1440p', '2160p'];
  return validResolutions.includes(resolution);
}

/**
 * 验证FPS值
 */
export function isValidFPS(fps: number): boolean {
  const validFPS = [24, 25, 30, 60];
  return validFPS.includes(fps);
}

/**
 * 批量验证必需字段
 */
export function validateRequiredFields(
  data: Record<string, any>, 
  requiredFields: string[]
): { valid: boolean; missing?: string[] } {
  const missing = requiredFields.filter(field => {
    const value = data[field];
    return value === undefined || value === null || value === '';
  });

  if (missing.length > 0) {
    return { valid: false, missing };
  }

  return { valid: true };
}
