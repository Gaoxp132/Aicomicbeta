/**
 * 类型定义模块
 * v6.0.77
 */

export type AITaskTier = 'heavy' | 'medium' | 'light';

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfter?: number;
}

export interface ProductionTypeConfig {
  label: string;
  narrativeStyle: string;
  shotStyle: string;
  editingStyle: string;
  colorTone: string;
}