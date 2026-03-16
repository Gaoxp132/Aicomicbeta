/**
 * StoryboardEditorToolbar — Header actions and batch selection toolbar
 * Extracted from StoryboardEditor.tsx for maintainability
 */

import { AnimatePresence, motion } from 'motion/react';
import {
  ArrowLeft, Plus, Wand2, Play, Loader2, Download, RefreshCw,
  CheckSquare, Square, Trash2, RotateCcw, Film, X, Sparkles
} from 'lucide-react';
import { Button } from '../ui';
import { toast } from 'sonner';
import { StoryboardVideoMerger } from './StoryboardVideoMerger';
import type { Episode, Storyboard } from '../../types';

interface ToolbarProps {
  episode: Episode;
  storyboards: Storyboard[];
  seriesId: string;
  userPhone: string;
  aspectRatio?: string;
  onBack: () => void;

  // Counts
  pendingCount: number;
  completedCount: number;
  generatingCount: number;

  // Form state
  isAdding: boolean;
  editingId: string | null;
  setIsAdding: (v: boolean) => void;

  // AI generation
  isGeneratingAI: boolean;
  handleGenerateAIScript: () => void;

  // Batch generation
  isBatchGenerating: boolean;
  batchProgress: { completed: number; failed: number; total: number };
  handleBatchGenerate: () => void;

  // Quota
  quota: { isAdmin: boolean; totalRemaining: number } | null;

  // Selection mode
  isSelectionMode: boolean;
  setIsSelectionMode: (fn: (prev: boolean) => boolean) => void;
  selectedIds: Set<string>;
  setSelectedIds: (s: Set<string>) => void;
  handleSelectAll: () => void;
  clearSelection: () => void;
  selectedCount: number;
  selectedCompletedCount: number;
  selectedGeneratingCount: number;

  // Batch actions
  handleBatchDelete: (ids: Set<string>, done: () => void) => void;
  handleBatchRegenerate: (ids: Set<string>, sbs: Storyboard[], done: () => void) => void;
  handleBatchReset: (ids: Set<string>, sbs: Storyboard[], done: () => void) => void;
  handleBatchPolish: (ids: Set<string>, sbs: Storyboard[], done: () => void) => void;

  // Preview
  setPreviewIndex: (i: number) => void;

  // Auto-merge
  autoMergeStatus: string;
  autoMergePct: number;
  mergeBlobUrl: string | null;
  mergedVideoUrl: string | null;
  setMergedVideoUrl: (u: string | null) => void;
  isDownloading: boolean;
  setPendingDownload: (v: boolean) => void;
  handleDownloadEpisode: () => void;
  autoMergeTriggered: React.MutableRefObject<boolean>;
  setAutoMergeStatus: (s: string) => void;
  handleStoryboardsUpdatedByMerger: (sbs: Storyboard[]) => void;
}

export function StoryboardEditorToolbar(props: ToolbarProps) {
  const {
    episode, storyboards, seriesId, userPhone, aspectRatio, onBack,
    pendingCount, completedCount, generatingCount,
    isAdding, editingId, setIsAdding,
    isGeneratingAI, handleGenerateAIScript,
    isBatchGenerating, batchProgress, handleBatchGenerate,
    quota,
    isSelectionMode, setIsSelectionMode, selectedIds, setSelectedIds,
    handleSelectAll, clearSelection,
    selectedCount, selectedCompletedCount, selectedGeneratingCount,
    handleBatchDelete, handleBatchRegenerate, handleBatchReset, handleBatchPolish,
    setPreviewIndex,
    autoMergeStatus, autoMergePct, mergeBlobUrl, mergedVideoUrl, setMergedVideoUrl,
    isDownloading, setPendingDownload,
    handleDownloadEpisode, autoMergeTriggered, setAutoMergeStatus,
    handleStoryboardsUpdatedByMerger,
  } = props;

  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Button onClick={onBack} variant="ghost" size="sm" className="text-gray-400 hover:text-white">
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div>
            <h2 className="text-xl font-bold text-white mb-1">
              第 {episode.episodeNumber} 集 - 分镜编辑
            </h2>
            <p className="text-sm text-gray-400">{storyboards.length} 个分镜</p>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          {storyboards.length === 0 && (
            <Button
              onClick={handleGenerateAIScript}
              disabled={isGeneratingAI}
              className="bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 disabled:opacity-50"
            >
              {isGeneratingAI ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" />生成中...</>
              ) : (
                <><Wand2 className="w-4 h-4 mr-2" />AI生成分镜</>
              )}
            </Button>
          )}
          {!isAdding && !editingId && (
            <>
              <Button
                onClick={() => setIsAdding(true)}
                className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600"
              >
                <Plus className="w-4 h-4 mr-2" />添加分镜
              </Button>
              {storyboards.length > 0 && (
                <Button
                  onClick={handleBatchGenerate}
                  disabled={isBatchGenerating || pendingCount === 0}
                  className="bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 disabled:opacity-50"
                >
                  {isBatchGenerating ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      生成中 ({batchProgress.completed + batchProgress.failed}/{batchProgress.total})
                    </>
                  ) : (
                    <>
                      <Play className="w-4 h-4 mr-2" />
                      {pendingCount > 0
                        ? `一键生成视频 (${pendingCount})`
                        : '全部已完成'}
                    </>
                  )}
                </Button>
              )}
              {quota && !quota.isAdmin && !isBatchGenerating && pendingCount > 0 && (
                <span className={`text-xs px-2 py-1 rounded-lg border ${
                  quota.totalRemaining === 0
                    ? 'bg-red-500/10 border-red-500/20 text-red-400'
                    : quota.totalRemaining < 3
                    ? 'bg-orange-500/10 border-orange-500/20 text-orange-400'
                    : 'bg-white/5 border-white/10 text-gray-400'
                }`}>
                  今日剩余 {quota.totalRemaining} 次
                </span>
              )}

              {storyboards.length > 1 && (
                <Button
                  onClick={() => {
                    setIsSelectionMode(prev => !prev);
                    if (isSelectionMode) setSelectedIds(new Set());
                  }}
                  variant="ghost"
                  size="sm"
                  className={`text-xs ${isSelectionMode ? 'text-blue-400 bg-blue-500/10 border-blue-500/20' : 'text-gray-400 hover:text-white'}`}
                >
                  {isSelectionMode ? <><X className="w-3 h-3 mr-1" />退出选择</> : <><CheckSquare className="w-3 h-3 mr-1" />批量操作</>}
                </Button>
              )}

              {storyboards.length > 0 && (
                <Button
                  onClick={() => setPreviewIndex(0)}
                  variant="ghost"
                  size="sm"
                  className="text-gray-400 hover:text-white text-xs"
                >
                  <Film className="w-3 h-3 mr-1" />预览
                </Button>
              )}

              {storyboards.length > 0 && (
                autoMergeStatus === 'merging' ? (
                  <Button
                    onClick={() => { toast.info('正在自动合并，完成后自动下载...'); setPendingDownload(true); }}
                    className="bg-purple-500/15 border border-purple-500/25 text-purple-300 hover:bg-purple-500/25"
                  >
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    合并中 {autoMergePct > 5 ? `${autoMergePct}%` : '...'}
                  </Button>
                ) : autoMergeStatus === 'done' || mergedVideoUrl || mergeBlobUrl ? (
                  <Button
                    onClick={handleDownloadEpisode}
                    disabled={isDownloading}
                    className="bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 disabled:opacity-50"
                  >
                    {isDownloading ? (
                      <><Loader2 className="w-4 h-4 mr-2 animate-spin" />下载中...</>
                    ) : (
                      <><Download className="w-4 h-4 mr-2" />下载分集视频</>
                    )}
                  </Button>
                ) : autoMergeStatus === 'error' ? (
                  <Button
                    onClick={() => { autoMergeTriggered.current = false; setAutoMergeStatus('idle'); }}
                    className="bg-orange-500/10 border border-orange-500/20 text-orange-300 hover:bg-orange-500/20"
                  >
                    <RefreshCw className="w-4 h-4 mr-2" />重试合并
                  </Button>
                ) : (
                  <Button
                    disabled
                    className="bg-white/5 border border-white/10 text-gray-500 cursor-not-allowed opacity-60"
                  >
                    <Download className="w-4 h-4 mr-2 opacity-40" />
                    下载分集视频
                    {storyboards.length > 0 && (
                      <span className="ml-1.5 text-[10px] opacity-70">({completedCount}/{storyboards.length})</span>
                    )}
                  </Button>
                )
              )}
              <StoryboardVideoMerger
                episode={episode}
                storyboards={storyboards}
                seriesId={seriesId}
                userPhone={userPhone}
                aspectRatio={aspectRatio}
                mode="button"
                mergedVideoUrl={mergedVideoUrl}
                onMergedVideoUrlChange={setMergedVideoUrl}
                onStoryboardsUpdated={handleStoryboardsUpdatedByMerger}
              />
            </>
          )}
        </div>
      </div>

      {/* Batch operation toolbar */}
      <AnimatePresence>
        {isSelectionMode && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="bg-blue-500/8 border border-blue-500/20 rounded-xl px-4 py-3 flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-3">
                <button
                  onClick={handleSelectAll}
                  className="flex items-center gap-1.5 text-xs text-blue-300 hover:text-blue-200 transition-colors"
                >
                  {selectedIds.size === storyboards.length
                    ? <><CheckSquare className="w-3.5 h-3.5" />取消全选</>
                    : <><Square className="w-3.5 h-3.5" />全选</>
                  }
                </button>
                <span className="text-xs text-gray-400">
                  已选 {selectedCount} 个
                  {selectedCompletedCount > 0 && ` (${selectedCompletedCount}个已完成)`}
                  {selectedGeneratingCount > 0 && ` (${selectedGeneratingCount}个生成中)`}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => handleBatchDelete(selectedIds, clearSelection)} disabled={selectedCount === 0}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-red-500/15 hover:bg-red-500/25 text-red-300 transition-colors disabled:opacity-30 border border-red-500/20">
                  <Trash2 className="w-3 h-3" />删除 ({selectedCount})
                </button>
                <button onClick={() => handleBatchRegenerate(selectedIds, storyboards, clearSelection)} disabled={selectedCompletedCount === 0}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-blue-500/15 hover:bg-blue-500/25 text-blue-300 transition-colors disabled:opacity-30 border border-blue-500/20">
                  <RefreshCw className="w-3 h-3" />重新生成 ({selectedCompletedCount})
                </button>
                <button onClick={() => handleBatchReset(selectedIds, storyboards, clearSelection)} disabled={selectedGeneratingCount === 0}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 transition-colors disabled:opacity-30 border border-amber-500/20">
                  <RotateCcw className="w-3 h-3" />重置状态 ({selectedGeneratingCount})
                </button>
                <button onClick={() => handleBatchPolish(selectedIds, storyboards, clearSelection)} disabled={selectedCount === 0}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-violet-500/15 hover:bg-violet-500/25 text-violet-300 transition-colors disabled:opacity-30 border border-violet-500/20">
                  <Sparkles className="w-3 h-3" />AI润色 ({selectedCount})
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
