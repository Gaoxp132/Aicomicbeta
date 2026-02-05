/**
 * ID生成工具
 * 用于生成唯一的ID标识符
 */

/**
 * 生成唯一ID
 * @param prefix ID前缀
 * @returns 格式: prefix-timestamp-random
 */
export function generateId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * 生成系列ID
 */
export function generateSeriesId(): string {
  return generateId('series');
}

/**
 * 生成剧集ID
 */
export function generateEpisodeId(): string {
  return generateId('episode');
}

/**
 * 生成角色ID
 */
export function generateCharacterId(): string {
  return generateId('character');
}

/**
 * 生成分镜ID
 */
export function generateStoryboardId(): string {
  return generateId('storyboard');
}
