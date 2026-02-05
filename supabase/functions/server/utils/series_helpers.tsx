/**
 * 漫剧系统辅助函数
 * 提供通用的辅助工具和ID生成等功能
 */
import * as db from "../database/series.tsx";

console.log('[series_helpers.tsx] ✅ Helper utilities loaded');

// ==================== ID生成 ====================

/**
 * 生成唯一ID
 * @param prefix ID前缀
 * @returns 唯一ID字符串
 */
export function generateId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// ==================== 用户数据管理 ====================

/**
 * 获取用户的所有漫剧ID列表（PostgreSQL）
 * @param userPhone 用户手机号
 * @returns 漫剧ID列表
 */
export async function getUserSeriesIds(userPhone: string): Promise<string[]> {
  const series = await db.getUserSeries(userPhone);
  return series.map(s => s.id);
}

/**
 * 更新用户的漫剧ID列表（PostgreSQL自动管理，无需单独操作）
 * @param userPhone 用户手机号
 * @param seriesIds 漫剧ID列表
 */
export async function updateUserSeriesIds(userPhone: string, seriesIds: string[]): Promise<void> {
  // No-op: PostgreSQL通过user_phone外键自动管理关系
  return;
}

// ==================== 进度管理 ====================

/**
 * 更新漫剧生成进度（PostgreSQL）
 * @param seriesId 漫剧ID
 * @param step 当前步骤
 * @param stepName 步骤名称
 */
export async function updateSeriesProgress(seriesId: string, step: number, stepName: string): Promise<void> {
  await db.updateSeriesProgress(seriesId, step, stepName);
}
