/**
 * StoryboardStatusBars — Status indicators for merge, OSS upload, batch progress
 * Extracted from StoryboardEditor.tsx for maintainability
 */

import { motion, AnimatePresence } from 'motion/react';
import {
  Loader2, Download, CheckCircle2, RefreshCw,
  Cloud, CloudOff, AlertTriangle, Wand2, Sparkles
} from 'lucide-react';
import type { Storyboard } from '../../types';
import { getErrorMessage } from '../../utils';

interface AutoMergeStatusBarsProps {
  autoMergeStatus: 'idle' | 'merging' | 'done' | 'error';
  autoMergePct: number;
  autoMergeDetail: string;
  mergedVideoUrl: string | null;
  mergeBlobUrl: string | null;
  pendingDownload: boolean;
  isDownloading: boolean;
  handleDownloadEpisode: () => void;
  // OSS
  ossUploadStatus: 'idle' | 'uploading' | 'done' | 'error';
  ossUploadPct: number;
  retryOssUpload: () => void;
  // Expired scenes
  mergeExpiredScenes: number[];
  isRegeneratingScene: number | null;
  storyboards: Storyboard[];
  onRegenerateScene: (sb: Storyboard, skipConfirm?: boolean) => Promise<void>;
  setMergeExpiredScenes: React.Dispatch<React.SetStateAction<number[]>>;
  setIsRegeneratingScene: React.Dispatch<React.SetStateAction<number | null>>;
}

export function AutoMergeStatusBars({
  autoMergeStatus,
  autoMergePct,
  autoMergeDetail,
  mergedVideoUrl,
  mergeBlobUrl,
  pendingDownload,
  isDownloading,
  handleDownloadEpisode,
  ossUploadStatus,
  ossUploadPct,
  retryOssUpload,
  mergeExpiredScenes,
  isRegeneratingScene,
  storyboards,
  onRegenerateScene,
  setMergeExpiredScenes,
  setIsRegeneratingScene,
}: AutoMergeStatusBarsProps) {
  return (
    <>
      {/* Auto-merge progress */}
      <AnimatePresence>
        {autoMergeStatus === 'merging' && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden"
          >
            <div className="bg-gradient-to-r from-purple-500/10 to-pink-500/10 border border-purple-500/20 rounded-xl px-4 py-2.5 flex items-center gap-3">
              <Loader2 className="w-3.5 h-3.5 text-purple-400 animate-spin flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-purple-300 truncate">{autoMergeDetail || '正在自动合并分集视频...'}</span>
                  <span className="text-xs text-purple-400/60 ml-2 flex-shrink-0">{autoMergePct}%</span>
                </div>
                <div className="h-1 bg-purple-900/30 rounded-full overflow-hidden">
                  <motion.div
                    className="h-full bg-gradient-to-r from-purple-500 to-pink-500 rounded-full"
                    animate={{ width: `${autoMergePct}%` }}
                    transition={{ duration: 0.5 }}
                  />
                </div>
              </div>
            </div>
          </motion.div>
        )}
        {autoMergeStatus === 'done' && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden"
          >
            <div className="bg-green-500/8 border border-green-500/20 rounded-xl px-4 py-2 flex items-center gap-2">
              <CheckCircle2 className="w-3.5 h-3.5 text-green-400 flex-shrink-0" />
              <span className="text-xs text-green-300 flex-1">
                {mergedVideoUrl ? '分集视频已合并（服务器）' : `分集视频已合并（本地 ${autoMergeDetail}）`}
                {pendingDownload && ' · 准备下载...'}
              </span>
              <button
                onClick={handleDownloadEpisode}
                disabled={isDownloading}
                className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg bg-green-500/20 hover:bg-green-500/30 text-green-300 transition-colors disabled:opacity-50 flex-shrink-0"
              >
                {isDownloading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
                下载
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Expired scenes panel */}
      <AnimatePresence>
        {autoMergeStatus === 'error' && mergeExpiredScenes.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden"
          >
            <div className="bg-red-500/8 border border-red-500/20 rounded-xl px-4 py-3 space-y-2.5">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-red-300 font-medium">
                    场景 {mergeExpiredScenes.join(', ')} 的视频链接已过期，无法下载合并
                  </p>
                  <p className="text-[11px] text-red-300/60 mt-0.5">
                    请重新生成这些场景的视频后再合并
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {mergeExpiredScenes.map((sceneNum) => {
                  const sb = storyboards.find(s => s.sceneNumber === sceneNum);
                  if (!sb) return null;
                  const isRegen = isRegeneratingScene === sceneNum;
                  return (
                    <button
                      key={sceneNum}
                      disabled={isRegen}
                      onClick={async () => {
                        setIsRegeneratingScene(sceneNum);
                        try {
                          await onRegenerateScene(sb, true);
                          setMergeExpiredScenes(prev => prev.filter(n => n !== sceneNum));
                        } catch (err: unknown) {
                          console.error(`[StoryboardStatusBars] Scene ${sceneNum} regen failed:`, getErrorMessage(err));
                        } finally {
                          setIsRegeneratingScene(null);
                        }
                      }}
                      className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-red-500/15 hover:bg-red-500/25 text-red-300 transition-colors disabled:opacity-50 border border-red-500/20"
                    >
                      {isRegen ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                      重新生成场景 {sceneNum}
                    </button>
                  );
                })}
                {mergeExpiredScenes.length > 1 && (
                  <button
                    disabled={isRegeneratingScene !== null}
                    onClick={async () => {
                      for (const sceneNum of mergeExpiredScenes) {
                        const sb = storyboards.find(s => s.sceneNumber === sceneNum);
                        if (!sb) continue;
                        setIsRegeneratingScene(sceneNum);
                        try {
                          await onRegenerateScene(sb, true);
                          setMergeExpiredScenes(prev => prev.filter(n => n !== sceneNum));
                        } catch {
                          break;
                        } finally {
                          setIsRegeneratingScene(null);
                        }
                      }
                    }}
                    className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-orange-500/15 hover:bg-orange-500/25 text-orange-300 transition-colors disabled:opacity-50 border border-orange-500/20"
                  >
                    <Wand2 className="w-3 h-3" />
                    全部重新生成
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* OSS upload status */}
      <AnimatePresence>
        {ossUploadStatus === 'uploading' && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden"
          >
            <div className="bg-gradient-to-r from-sky-500/10 to-blue-500/10 border border-sky-500/20 rounded-xl px-4 py-2.5 flex items-center gap-3">
              <Loader2 className="w-3.5 h-3.5 text-sky-400 animate-spin flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-sky-300 truncate flex items-center gap-1.5">
                    <Cloud className="w-3 h-3" />
                    正在保存到云端...
                  </span>
                  <span className="text-xs text-sky-400/60 ml-2 flex-shrink-0">{ossUploadPct}%</span>
                </div>
                <div className="h-1 bg-sky-900/30 rounded-full overflow-hidden">
                  <motion.div
                    className="h-full bg-gradient-to-r from-sky-500 to-blue-500 rounded-full"
                    animate={{ width: `${ossUploadPct}%` }}
                    transition={{ duration: 0.5 }}
                  />
                </div>
              </div>
            </div>
          </motion.div>
        )}
        {ossUploadStatus === 'done' && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden"
          >
            <div className="bg-sky-500/8 border border-sky-500/20 rounded-xl px-4 py-2 flex items-center gap-2">
              <Cloud className="w-3.5 h-3.5 text-sky-400 flex-shrink-0" />
              <span className="text-xs text-sky-300 flex-1">
                已保存到云端，下次打开可直接下载
              </span>
              {mergedVideoUrl && mergedVideoUrl.startsWith('http') && (
                <button
                  onClick={handleDownloadEpisode}
                  disabled={isDownloading}
                  className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 transition-colors disabled:opacity-50 flex-shrink-0"
                >
                  {isDownloading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
                  云端下载
                </button>
              )}
            </div>
          </motion.div>
        )}
        {ossUploadStatus === 'error' && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden"
          >
            <div className="bg-amber-500/8 border border-amber-500/20 rounded-xl px-4 py-2 flex items-center gap-2">
              <CloudOff className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
              <span className="text-xs text-amber-300 flex-1">
                云端保存失败（不影响本次下载）
              </span>
              <button
                onClick={retryOssUpload}
                disabled={!mergeBlobUrl}
                className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 transition-colors disabled:opacity-50 flex-shrink-0"
              >
                <RefreshCw className="w-3 h-3" />
                重试上传
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

// Batch generation progress bar
interface BatchProgressBarProps {
  isBatchGenerating: boolean;
  batchProgress: { completed: number; failed: number; total: number; currentScene: number };
}

export function BatchProgressBar({ isBatchGenerating, batchProgress }: BatchProgressBarProps) {
  if (!isBatchGenerating) return null;
  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-gradient-to-r from-orange-500/15 to-red-500/15 border border-orange-500/30 rounded-xl p-4"
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Loader2 className="w-4 h-4 text-orange-400 animate-spin" />
          <span className="text-orange-300 text-sm font-medium">
            {batchProgress.currentScene > 0
              ? `正在生成场景 ${batchProgress.currentScene}...`
              : '批量生成视频中...'}
          </span>
        </div>
        <span className="text-orange-300/80 text-xs">
          {batchProgress.completed + batchProgress.failed}/{batchProgress.total}
          {batchProgress.failed > 0 && ` (${batchProgress.failed} 失败)`}
        </span>
      </div>
      <div className="w-full bg-white/10 rounded-full h-2 overflow-hidden">
        <motion.div
          className="h-full bg-gradient-to-r from-orange-500 to-red-500"
          initial={{ width: 0 }}
          animate={{ width: `${batchProgress.total > 0 ? ((batchProgress.completed + batchProgress.failed) / batchProgress.total) * 100 : 0}%` }}
          transition={{ duration: 0.3 }}
        />
      </div>
      {batchProgress.currentScene > 0 && (
        <div className="mt-2 w-full bg-white/5 rounded-full h-1 overflow-hidden">
          <motion.div
            className="h-full bg-orange-400/50 rounded-full w-1/3"
            animate={{ x: ['0%', '200%', '0%'] }}
            transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
          />
        </div>
      )}
    </motion.div>
  );
}

// Batch polish progress bar
interface BatchPolishProgressBarProps {
  batchPolishProgress: { current: number; total: number } | null;
}

export function BatchPolishProgressBar({ batchPolishProgress }: BatchPolishProgressBarProps) {
  if (!batchPolishProgress) return null;
  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-gradient-to-r from-violet-500/15 to-fuchsia-500/15 border border-violet-500/30 rounded-xl p-4"
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-violet-300 flex items-center gap-2">
          <Sparkles className="w-4 h-4 animate-pulse" />
          AI润色中...
        </span>
        <span className="text-sm text-violet-400">
          {batchPolishProgress.current} / {batchPolishProgress.total}
        </span>
      </div>
      <div className="h-1.5 bg-violet-900/30 rounded-full overflow-hidden">
        <motion.div
          className="h-full bg-gradient-to-r from-violet-500 to-fuchsia-500 rounded-full"
          animate={{ width: `${Math.round((batchPolishProgress.current / batchPolishProgress.total) * 100)}%` }}
          transition={{ duration: 0.5 }}
        />
      </div>
    </motion.div>
  );
}