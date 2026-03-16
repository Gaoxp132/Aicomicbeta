/**
 * ClientVideoMerger — UI component for local client-side video merging
 * Logic extracted to clientMergeLogic.ts
 */
import { useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Download, Loader2, CheckCircle2, AlertCircle,
  Cpu, Film, ChevronDown, ChevronUp, RefreshCw, Wifi,
} from 'lucide-react';
import { Button } from '../ui';
import { clientMergeEpisode } from './clientMergeLogic';
import type { Episode, Storyboard } from '../../types';
import { sbVideoUrl } from '../../utils';
import { getErrorMessage } from '../../utils';

// Re-export logic types/function for backward compatibility
export { clientMergeEpisode } from './clientMergeLogic';
export type { ClientMergeProgress, ClientMergeResult, ClientMergeOptions } from './clientMergeLogic';

// ══════════════════════════════════════════════════════════════════════
// UI Component (backup local merge for advanced users)
// ═══════════════════════════════════════════════════════════════════════

type Phase = 'idle' | 'fetching' | 'merging' | 'done' | 'error';

interface MergeProgress {
  phase: Phase;
  pct: number;
  fetchDone: number;
  fetchTotal: number;
  mergePct: number;
  errorMsg: string;
  downloadUrl: string;
  downloadSizeMB: string;
  skipped: number;
}

const INIT_PROGRESS: MergeProgress = {
  phase: 'idle', pct: 0, fetchDone: 0, fetchTotal: 0,
  mergePct: 0, errorMsg: '', downloadUrl: '', downloadSizeMB: '', skipped: 0,
};

interface ClientVideoMergerProps {
  episode: Episode;
  storyboards: Storyboard[];
  onComplete?: (blobUrl: string, sizeMB: string) => void;
}

export function ClientVideoMerger({ episode, storyboards, onComplete }: ClientVideoMergerProps) {
  const [expanded, setExpanded] = useState(false);
  const [prog, setProg] = useState<MergeProgress>(INIT_PROGRESS);

  const readyStoryboards = storyboards
    .filter(sb => {
      const url = sbVideoUrl(sb);
      return url.startsWith('http');
    })
    .sort((a, b) => a.sceneNumber - b.sceneNumber);

  const hasVideos = readyStoryboards.length > 0;
  const isRunning = ['fetching', 'merging'].includes(prog.phase);

  const overallPct = (() => {
    switch (prog.phase) {
      case 'fetching': return prog.fetchTotal > 0 ? Math.round((prog.fetchDone / prog.fetchTotal) * 70) : 5;
      case 'merging': return 70 + Math.round(prog.mergePct * 0.28);
      case 'done': return 100;
      default: return 0;
    }
  })();

  const handleMerge = useCallback(async () => {
    if (isRunning) return;
    if (prog.downloadUrl) URL.revokeObjectURL(prog.downloadUrl);
    setProg({ ...INIT_PROGRESS, phase: 'fetching' });

    try {
      const { blobUrl, sizeMB } = await clientMergeEpisode(
        episode,
        storyboards,
        (p) => {
          setProg(prev => ({
            ...prev,
            phase: p.phase,
            fetchDone: p.fetchDone,
            fetchTotal: p.fetchTotal,
            mergePct: p.mergePct,
          }));
        }
      );

      // Auto-trigger download
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = `第${episode.episodeNumber || 1}集-完整视频.mp4`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      setProg(p => ({ ...p, phase: 'done', mergePct: 100, downloadUrl: blobUrl, downloadSizeMB: sizeMB }));
      onComplete?.(blobUrl, sizeMB);
    } catch (err: unknown) {
      console.error('[ClientVideoMerger] Merge error:', err);
      const errMsg = getErrorMessage(err);
      setProg(p => ({ ...p, phase: 'error', errorMsg: errMsg }));
    }
  }, [isRunning, prog.downloadUrl, episode, storyboards, onComplete]);

  const handleReDownload = () => {
    if (!prog.downloadUrl) return;
    const a = document.createElement('a');
    a.href = prog.downloadUrl;
    a.download = `第${episode.episodeNumber || 1}集-完整视频.mp4`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  if (!hasVideos) return null;

  return (
    <div className="rounded-2xl border border-white/10 bg-white/3 overflow-hidden">
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/5 transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-500 flex items-center justify-center flex-shrink-0">
            <Cpu className="w-3.5 h-3.5 text-white" />
          </div>
          <div className="text-left">
            <p className="text-sm font-medium text-white">备用本地合并</p>
            <p className="text-[10px] text-gray-500 mt-0.5">服务器合并失败时的备选方案 · 在您设备上运行</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {prog.phase === 'done' && (
            <span className="text-[10px] bg-green-500/20 text-green-400 px-2 py-0.5 rounded-full">已完成</span>
          )}
          {isRunning && <Loader2 className="w-4 h-4 text-violet-400 animate-spin" />}
          {expanded ? <ChevronUp className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
        </div>
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="border-t border-white/8 px-4 pb-4 pt-3 space-y-3">
              <div className="flex gap-2 text-xs text-gray-400 bg-white/3 rounded-xl p-3">
                <Wifi className="w-3.5 h-3.5 text-violet-400 flex-shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p>频在您的设备本地完成拼接，<span className="text-white">不占用服务器资源</span>，可绕过服务器内存限制。</p>
                  <p className="text-gray-500">使用浏览器内置 MP4 解析引擎，无需下载额外组件。</p>
                </div>
              </div>

              <div className="flex items-center gap-2 text-xs text-gray-400">
                <Film className="w-3.5 h-3.5" />
                <span>准备合并 <span className="text-white font-medium">{readyStoryboards.length}</span> 个分镜视频</span>
                {prog.skipped > 0 && <span className="text-orange-400">（{prog.skipped} 个跳过）</span>}
              </div>

              {prog.phase !== 'idle' && prog.phase !== 'error' && prog.phase !== 'done' && (
                <div className="space-y-2">
                  <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                    <motion.div
                      className="h-full rounded-full bg-gradient-to-r from-violet-500 to-indigo-400"
                      initial={{ width: 0 }}
                      animate={{ width: `${overallPct}%` }}
                      transition={{ duration: 0.4 }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5 text-violet-300">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      {prog.phase === 'fetching' && `下载分镜视频 ${prog.fetchDone} / ${prog.fetchTotal}...`}
                      {prog.phase === 'merging' && `本地拼接中 ${prog.mergePct}%...`}
                    </div>
                    <span className="text-gray-500">{overallPct}%</span>
                  </div>
                </div>
              )}

              {prog.phase === 'done' && (
                <div className="flex items-center justify-between bg-green-500/10 border border-green-500/20 rounded-xl px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-400" />
                    <div>
                      <p className="text-sm text-green-300 font-medium">合并完成！已自动下载</p>
                      <p className="text-xs text-green-400/70">文件大小：{prog.downloadSizeMB} MB</p>
                    </div>
                  </div>
                  <button
                    onClick={handleReDownload}
                    className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg bg-green-500/20 hover:bg-green-500/30 text-green-300 transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" />
                    再次下载
                  </button>
                </div>
              )}

              {prog.phase === 'error' && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2.5">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-red-300 whitespace-pre-wrap">{prog.errorMsg}</p>
                  </div>
                </div>
              )}

              <div className="flex gap-2">
                <Button
                  onClick={handleMerge}
                  disabled={isRunning}
                  className="flex-1 bg-gradient-to-r from-violet-500 to-indigo-500 hover:from-violet-600 hover:to-indigo-600 disabled:opacity-50"
                >
                  {isRunning ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      {prog.phase === 'fetching' ? '下载视频...' : '合并中...'}
                    </>
                  ) : prog.phase === 'done' ? (
                    <><RefreshCw className="w-4 h-4 mr-2" />重新合并</>
                  ) : (
                    <><Download className="w-4 h-4 mr-2" />开始本地合并并下载</>
                  )}
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}