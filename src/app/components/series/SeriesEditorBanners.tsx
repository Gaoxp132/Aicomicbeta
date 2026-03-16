/**
 * SeriesEditorBanners — Banner components and helper functions for SeriesEditor
 * Extracted from SeriesEditor.tsx for maintainability
 */

import { Loader2, RotateCcw, AlertTriangle, Sparkles } from 'lucide-react';
import { Button } from '../ui';
import type { Series } from '../../types';

// Re-export StyleAnchorPanel from its own file for backward compatibility
export { StyleAnchorPanel } from './StyleAnchorPanel';

// ── Helper functions ──────────────────────────────────────────────

// v6.0.142: Check if generation is stale (no progress update for N minutes)
export function checkGenerationStale(series: Series, staleMinutes: number = 5): boolean {
  if (series.status !== 'generating') return false;
  const updatedAt = series.updatedAt;
  if (!updatedAt) return false;
  const updatedTime = new Date(updatedAt).getTime();
  if (isNaN(updatedTime)) return false;
  const elapsedMs = Date.now() - updatedTime;
  return elapsedMs > staleMinutes * 60 * 1000;
}

// v6.0.164: Adaptive poll interval based on elapsed time
export function getAdaptivePollInterval(pollStartTime: number): number {
  const elapsedMs = Date.now() - pollStartTime;
  const elapsedMin = elapsedMs / 60000;
  if (elapsedMin < 1) return 3000;
  if (elapsedMin < 3) return 5000;
  if (elapsedMin < 5) return 8000;
  return 12000;
}

// v6.0.146: Check if generation is effectively complete
export function isGenerationEffectivelyComplete(series: Series): boolean {
  if (!series.episodes || series.episodes.length === 0) return false;
  if (series.totalEpisodes > 0 && series.episodes.length < series.totalEpisodes) return false;

  // Path 1: checkpoint signal
  const progress = typeof series.generationProgress === 'object' && series.generationProgress !== null ? series.generationProgress : null;
  if (progress && typeof progress.currentStep === 'number' && progress.currentStep >= 5) {
    const allEpsHaveStoryboards = series.episodes.every(
      ep => ep.storyboards && ep.storyboards.length > 0
    );
    if (allEpsHaveStoryboards) {
      console.log(`[isGenerationEffectivelyComplete] Path 1: checkpoint signal (currentStep=${progress.currentStep}) + all episodes have storyboards`);
      return true;
    }
  }

  // Path 2: all storyboards have images
  for (const ep of series.episodes) {
    if (!ep.storyboards || ep.storyboards.length === 0) return false;
    for (const sb of ep.storyboards) {
      if (!sb.imageUrl && !sb.thumbnailUrl) return false;
    }
    if (ep.status === 'generating') return false;
  }
  return true;
}

// v6.0.164: AI generation 6-step flow
const AI_GENERATION_STEPS = [
  { step: 1, label: '剧情大纲', icon: '📝' },
  { step: 2, label: '角色设计', icon: '👤' },
  { step: 3, label: '风格指南', icon: '🎨' },
  { step: 4, label: '写入剧本', icon: '💾' },
  { step: 5, label: '分镜生成', icon: '🎬' },
  { step: 6, label: '收尾完成', icon: '✅' },
];

// ── GeneratingBanner ──────────────────────────────────────────────

export function GeneratingBanner({ series, isStale, onRetry, isRetrying }: {
  series: Series; isStale: boolean; onRetry: () => void; isRetrying: boolean;
}) {
  if (series.status !== 'generating') return null;
  const progress = typeof series.generationProgress === 'object' && series.generationProgress !== null ? series.generationProgress : null;

  if (isStale) {
    return (
      <div className="mb-4 p-4 rounded-xl bg-amber-500/10 border border-amber-500/30">
        <div className="flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
          <div className="flex-1">
            <p className="text-amber-300 font-medium">AI创作可能已中断</p>
            <p className="text-amber-400/70 text-sm mt-1">长时间未检测到进度更新，请尝试重新开始</p>
            <p className="text-amber-400/50 text-xs mt-1.5">可能的原因: 服务器超时、网络波动、后端进程异常终止。重新创作将从上次断点续接，已完成的内容不会丢失。</p>
          </div>
          <Button
            onClick={onRetry}
            disabled={isRetrying}
            className="bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 border border-amber-500/40"
          >
            {isRetrying ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <RotateCcw className="w-4 h-4 mr-1.5" />}
            {isRetrying ? '重试中...' : '重新创作'}
          </Button>
        </div>
      </div>
    );
  }

  const currentStep = progress && typeof progress === 'object' ? (progress.currentStep || 1) : 1;

  return (
    <div className="mb-4 p-4 rounded-xl bg-purple-500/10 border border-purple-500/30">
      <div className="flex items-center gap-3 mb-3">
        <Sparkles className="w-5 h-5 text-purple-400 animate-pulse" />
        <div className="flex-1">
          <p className="text-purple-300 font-medium">AI正在创作中...</p>
          {progress && typeof progress === 'object' && (
            <p className="text-purple-400/70 text-sm mt-1">
              步骤 {progress.currentStep}/{progress.totalSteps}: {progress.stepName || '处理中'}
            </p>
          )}
        </div>
        <Loader2 className="w-5 h-5 text-purple-400 animate-spin" />
      </div>
      <div className="flex items-center gap-0.5 mt-1">
        {AI_GENERATION_STEPS.map(({ step, label, icon }) => {
          const isCompleted = step < currentStep;
          const isCurrent = step === currentStep;
          return (
            <div key={step} className="flex-1 flex flex-col items-center gap-1">
              <div className={`w-full h-1.5 rounded-full transition-all duration-500 ${
                isCompleted ? 'bg-purple-500' : isCurrent ? 'bg-purple-500/60 animate-pulse' : 'bg-white/10'
              }`} />
              <span className={`text-[9px] leading-tight text-center transition-colors ${
                isCompleted ? 'text-purple-300' : isCurrent ? 'text-purple-400 font-medium' : 'text-gray-600'
              }`}>
                {icon} {label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── FailedBanner ──────────────────────────────────────────────────

export function FailedBanner({ series, isRetrying, onRetry }: {
  series: Series; isRetrying: boolean; onRetry: () => void;
}) {
  if (series.status !== 'failed') return null;
  const progress = typeof series.generationProgress === 'object' ? series.generationProgress : null;

  const failedStep = progress && typeof progress === 'object' ? progress.currentStep : null;
  const recoveryHint = failedStep && failedStep <= 4
    ? '失败发生在前期准备阶段，重新创作将完整重新开始。'
    : failedStep && failedStep >= 5
    ? '失败发生在分镜生成阶段，重新创作将从断点续接，已完成的分镜不会丢失。'
    : '重新创作将尝试从断点续接，尽可能保留已完成的内容。';

  return (
    <div className="mb-4 p-4 rounded-xl bg-red-500/10 border border-red-500/30">
      <div className="flex items-center gap-3">
        <AlertTriangle className="w-5 h-5 text-red-400 shrink-0" />
        <div className="flex-1">
          <p className="text-red-300 font-medium">AI创作失败</p>
          {progress && typeof progress === 'object' && progress.error && (
            <p className="text-red-400/70 text-sm mt-1 line-clamp-2">{progress.error}</p>
          )}
          <p className="text-red-400/50 text-xs mt-1.5">{recoveryHint}</p>
        </div>
        <Button
          onClick={onRetry}
          disabled={isRetrying}
          className="bg-red-500/20 text-red-300 hover:bg-red-500/30 border border-red-500/40"
        >
          {isRetrying ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <RotateCcw className="w-4 h-4 mr-1.5" />}
          {isRetrying ? '重试中...' : '重新创作'}
        </Button>
      </div>
    </div>
  );
}