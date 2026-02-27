import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import {
  Film, Search, FileJson, FileText, FileCode, Video, Loader2, Lock,
  Edit2, Eye, Download, Trash2, Sparkles, RotateCcw, Calendar, Play
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../ui';
import { EpisodePlayer } from '../EpisodePlayer';
import * as seriesService from '../../services';
import { cancelBatchGeneration } from '../../services';
import { apiRequest } from '../../utils';
import type { Series } from '../../types';

// ── Inline: series/list barrel (was series/list/index.ts) ─────────

// [A] EmptyState
function EmptyState({ type, onCreateNew, userPhone }: { type: 'no-login' | 'no-series' | 'no-results'; onCreateNew?: () => void; userPhone?: string }) {
  if (type === 'no-login') return (<div className="bg-white/5 backdrop-blur-xl rounded-3xl p-12 border border-white/10 text-center"><Film className="w-16 h-16 text-gray-500 mx-auto mb-4" /><h3 className="text-xl font-semibold text-white mb-2">请先登录</h3><p className="text-gray-400">登录后即可创作和管理您的漫剧作品</p></div>);
  if (type === 'no-series') return (<div className="bg-white/5 backdrop-blur-xl rounded-3xl p-12 border border-white/10 text-center"><div className="w-20 h-20 bg-gradient-to-br from-purple-500/20 to-pink-500/20 rounded-full flex items-center justify-center mx-auto mb-6"><Film className="w-10 h-10 text-purple-400" /></div><h3 className="text-xl font-semibold text-white mb-2">还没有漫剧作品</h3><p className="text-gray-400 mb-6">开始创作您的第一部AI漫剧吧！</p><Button onClick={onCreateNew} className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600">创建新漫剧</Button></div>);
  if (type === 'no-results') return (<div className="bg-white/5 backdrop-blur-xl rounded-3xl p-12 border border-white/10 text-center"><Search className="w-16 h-16 text-gray-500 mx-auto mb-4" /><h3 className="text-xl font-semibold text-white mb-2">未找到匹配的漫剧</h3><p className="text-gray-400">尝试更改搜索条件或筛选器</p></div>);
  return null;
}

// [B] SeriesDownloadMenu
function SeriesDownloadMenu({ onDownload, onDownloadVideos, onClose }: { series: Series; onDownload: (f: 'json' | 'txt' | 'html') => void; onDownloadVideos: () => void; onClose: () => void }) {
  return (
    <div className="absolute top-16 right-4 z-20 bg-gray-900 border border-white/20 rounded-xl shadow-2xl overflow-hidden">
      <button onClick={() => onDownload('json')} className="w-full px-4 py-3 flex items-center gap-3 hover:bg-white/10 transition-colors text-left"><FileJson className="w-4 h-4 text-blue-400" /><div><div className="text-white text-sm font-medium">JSON格式</div><div className="text-gray-400 text-xs">完整数据，便于备份</div></div></button>
      <button onClick={() => onDownload('txt')} className="w-full px-4 py-3 flex items-center gap-3 hover:bg-white/10 transition-colors text-left"><FileText className="w-4 h-4 text-green-400" /><div><div className="text-white text-sm font-medium">TXT格式</div><div className="text-gray-400 text-xs">纯文本，易于阅读</div></div></button>
      <button onClick={() => onDownload('html')} className="w-full px-4 py-3 flex items-center gap-3 hover:bg-white/10 transition-colors text-left"><FileCode className="w-4 h-4 text-purple-400" /><div><div className="text-white text-sm font-medium">HTML格式</div><div className="text-gray-400 text-xs">网页格式，美观打印</div></div></button>
      <button onClick={onDownloadVideos} className="w-full px-4 py-3 flex items-center gap-3 hover:bg-white/10 transition-colors text-left"><Video className="w-4 h-4 text-red-400" /><div><div className="text-white text-sm font-medium">下载视频</div><div className="text-gray-400 text-xs">下载已完成的视频片段</div></div></button>
      <button onClick={onClose} className="w-full px-4 py-2 bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors text-sm">取消</button>
    </div>
  );
}

// [C] SeriesCard helpers
const GENRE_GRADIENTS: Record<string, string> = { romance: 'from-pink-600/40 via-rose-500/30 to-red-500/20', suspense: 'from-purple-700/40 via-indigo-600/30 to-slate-700/20', comedy: 'from-yellow-500/40 via-amber-400/30 to-orange-400/20', action: 'from-red-600/40 via-orange-500/30 to-amber-500/20', fantasy: 'from-cyan-500/40 via-blue-500/30 to-indigo-500/20', horror: 'from-gray-800/40 via-slate-700/30 to-zinc-800/20', scifi: 'from-blue-600/40 via-purple-500/30 to-violet-500/20', drama: 'from-teal-500/40 via-emerald-500/30 to-green-500/20' };
const GENRE_ICONS: Record<string, string> = { romance: '💕', suspense: '🔍', comedy: '😄', action: '⚡', fantasy: '✨', horror: '👻', scifi: '🚀', drama: '🎭' };
function getStatusInfo(status: string) { switch (status) { case 'completed': return { label: '已完成', className: 'bg-green-500/20 text-green-400 border border-green-500/30' }; case 'generating': case 'in-progress': return { label: '创作中', className: 'bg-blue-500/20 text-blue-400 border border-blue-500/30' }; case 'failed': return { label: '失败', className: 'bg-red-500/20 text-red-400 border border-red-500/30' }; default: return { label: '草稿', className: 'bg-gray-500/20 text-gray-400 border border-gray-500/30' }; } }
function getProgressText(progress: Series['generationProgress']): string | null { if (!progress || typeof progress !== 'object') return null; const { stepName, currentStep, totalSteps } = progress; if (stepName && typeof currentStep === 'number' && typeof totalSteps === 'number' && totalSteps > 0) return `${stepName} (${currentStep}/${totalSteps})`; if (stepName) return stepName; if (typeof currentStep === 'number' && typeof totalSteps === 'number' && totalSteps > 0) return `步骤 ${currentStep}/${totalSteps}`; return null; }
function isStuckGenerating(series: Series): boolean { if (series.status !== 'generating' && series.status !== 'in-progress') return false; return (Date.now() - new Date(series.updatedAt || series.createdAt).getTime()) > 10 * 60 * 1000; }
function computeEffectiveStatus(series: Series): string { if (series.status === 'completed' || series.status === 'generating' || series.status === 'in-progress' || series.status === 'failed') return series.status; const episodes = series.episodes || []; if (episodes.length === 0) return series.status; const hasContent = episodes.some(ep => ep.storyboards && ep.storyboards.length > 0); if (!hasContent) return series.status; if (episodes.length > 0 && hasContent) return 'completed'; return series.status; }

// [C] SeriesCard
function SeriesCard({ series, onEdit, onDelete, onShowDetail, onDownload, onDownloadVideos, onRetry, showDownloadMenu, onToggleDownloadMenu }: { series: Series; onEdit: (s: Series) => void; onDelete: (id: string, e: React.MouseEvent) => void; onShowDetail: (s: Series) => void; onDownload: (s: Series, f: 'json' | 'txt' | 'html') => void; onDownloadVideos: (s: Series) => void; onRetry: (id: string, outline: string) => void; showDownloadMenu: boolean; onToggleDownloadMenu: (e: React.MouseEvent) => void; isDownloading: boolean }) {
  const effectiveStatus = computeEffectiveStatus(series); const statusInfo = getStatusInfo(effectiveStatus);
  const isGenerating = effectiveStatus === 'generating' || effectiveStatus === 'in-progress'; const isFailed = effectiveStatus === 'failed'; const isStuck = isStuckGenerating(series);
  const genreGradient = GENRE_GRADIENTS[series.genre] || 'from-purple-600/40 via-pink-500/30 to-rose-500/20'; const genreIcon = GENRE_ICONS[series.genre] || '🎬';
  const episodeCount = series.stats?.episodesCount || series.episodes?.length || 0; const totalEpisodes = series.totalEpisodes || episodeCount || 0;
  const handleCardClick = (e: React.MouseEvent) => { if ((e.target as HTMLElement).closest('button') || (e.target as HTMLElement).closest('[data-download-menu]')) return; onEdit(series); };

  // v6.0.124: 自动重试倒计时
  const [autoRetryCountdown, setAutoRetryCountdown] = useState<number | null>(null);
  const countdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stuckElapsedMinutes = isStuck
    ? Math.floor((Date.now() - new Date(series.updatedAt || series.createdAt).getTime()) / (60 * 1000))
    : 0;

  useEffect(() => {
    if (isStuck) {
      setAutoRetryCountdown(60);
      countdownIntervalRef.current = setInterval(() => {
        setAutoRetryCountdown(prev => {
          if (prev === null || prev <= 1) {
            if (countdownIntervalRef.current) { clearInterval(countdownIntervalRef.current); countdownIntervalRef.current = null; }
            onRetry(series.id, series.storyOutline || (series as any).theme || '');
            return null;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      if (countdownIntervalRef.current) { clearInterval(countdownIntervalRef.current); countdownIntervalRef.current = null; }
      setAutoRetryCountdown(null);
    }
    return () => { if (countdownIntervalRef.current) { clearInterval(countdownIntervalRef.current); countdownIntervalRef.current = null; } };
  }, [isStuck, series.id]);

  const handleManualRetry = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (countdownIntervalRef.current) { clearInterval(countdownIntervalRef.current); countdownIntervalRef.current = null; }
    setAutoRetryCountdown(null);
    onRetry(series.id, series.storyOutline || (series as any).theme || '');
  };

  const handleCancelAutoRetry = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (countdownIntervalRef.current) { clearInterval(countdownIntervalRef.current); countdownIntervalRef.current = null; }
    setAutoRetryCountdown(null);
  };

  return (
    <motion.div key={series.id} whileHover={{ y: -4 }} onClick={handleCardClick} className="bg-white/5 backdrop-blur-xl rounded-2xl border border-white/10 overflow-hidden group relative cursor-pointer">
      {showDownloadMenu && <div data-download-menu><SeriesDownloadMenu series={series} onDownload={(format) => onDownload(series, format)} onDownloadVideos={() => onDownloadVideos(series)} onClose={() => onToggleDownloadMenu({} as React.MouseEvent)} /></div>}
      <div className="relative aspect-video overflow-hidden">
        {series.coverImageUrl || series.coverImage ? <img src={series.coverImageUrl || series.coverImage} alt={series.title} className="w-full h-full object-cover" /> : (
          <div className={`w-full h-full bg-gradient-to-br ${genreGradient} flex flex-col items-center justify-center relative`}>
            <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full blur-3xl" /><div className="absolute bottom-0 left-0 w-24 h-24 bg-purple-500/10 rounded-full blur-2xl" />
            <div className="relative z-10 flex flex-col items-center gap-2"><span className="text-4xl drop-shadow-lg">{genreIcon}</span><div className="flex items-center gap-1.5">{series.title.slice(0, 4).split('').map((char, i) => <span key={i} className="text-lg font-bold text-white/60 drop-shadow-sm">{char}</span>)}{series.title.length > 4 && <span className="text-lg font-bold text-white/40">...</span>}</div></div>
            {isGenerating && <div className="absolute inset-0 bg-black/20 flex items-center justify-center"><div className="flex flex-col items-center gap-2"><Loader2 className="w-8 h-8 text-blue-400 animate-spin" /><span className="text-xs text-blue-300 font-medium">AI创作中</span></div></div>}
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
        <div className="absolute top-3 left-3"><span className={`px-3 py-1 rounded-full text-xs font-medium ${statusInfo.className}`}>{isGenerating && <Loader2 className="w-3 h-3 inline-block mr-1 animate-spin" />}{statusInfo.label}</span></div>
        {/* v6.0.70: 公开/有状态徽章 */}
        {series.isPublic === false && (
          <div className="absolute top-3 right-3"><span className="flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-gray-800/80 text-gray-300 border border-gray-600/50 backdrop-blur-sm"><Lock className="w-3 h-3" />私有</span></div>
        )}
        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 active:opacity-100 transition-opacity flex flex-wrap items-center justify-center gap-2 p-4 sm:pointer-events-auto pointer-events-none sm:opacity-0 sm:group-hover:opacity-100">
          <Button onClick={() => onEdit(series)} size="sm" className="bg-white/10 hover:bg-white/20 backdrop-blur-xl border border-white/20"><Edit2 className="w-4 h-4 mr-1" />编辑</Button>
          <Button onClick={() => onShowDetail(series)} size="sm" className="bg-blue-500/20 hover:bg-blue-500/30 backdrop-blur-xl border border-blue-500/30"><Eye className="w-4 h-4 mr-1" />详情</Button>
          <Button onClick={onToggleDownloadMenu} size="sm" className="bg-green-500/20 hover:bg-green-500/30 backdrop-blur-xl border border-green-500/30"><Download className="w-4 h-4 mr-1" />下载</Button>
          <Button onClick={(e) => onDelete(series.id, e)} size="sm" className="bg-red-500/20 hover:bg-red-500/30 backdrop-blur-xl border border-red-500/30"><Trash2 className="w-4 h-4 mr-1" />删</Button>
        </div>
      </div>
      <div className="p-4">
        <h3 className="text-lg font-semibold text-white mb-2 line-clamp-1">{series.title}</h3>
        <p className="text-sm text-gray-400 mb-3 line-clamp-2">{series.description}</p>
        {isGenerating && (
          <div className={`mb-3 p-3 border rounded-xl ${isStuck ? 'bg-gradient-to-r from-amber-500/20 to-orange-500/20 border-amber-500/30' : 'bg-gradient-to-r from-purple-500/20 to-pink-500/20 border-purple-500/30'}`}>
            <div className={`flex items-center gap-2 text-sm ${isStuck ? 'text-amber-300' : 'text-purple-300'}`}>{isStuck ? <><span className="text-base flex-shrink-0">&#9888;&#65039;</span><span className="font-medium">任务可能已中断</span></> : <><Sparkles className="w-4 h-4 animate-pulse flex-shrink-0" /><span className="font-medium">{series.queueStatus === 'queued' ? '排队等待中...' : 'AI正在创作中...'}</span></>}</div>
            {isStuck ? (
              <div className="mt-2">
                <div className="text-xs text-amber-400/70 mb-2">
                  已超过 {stuckElapsedMinutes} 分钟未更新
                </div>
                {autoRetryCountdown !== null ? (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 relative flex-shrink-0">
                        <svg className="w-4 h-4 -rotate-90" viewBox="0 0 16 16">
                          <circle cx="8" cy="8" r="6" fill="none" stroke="rgb(251 191 36 / 0.3)" strokeWidth="2" />
                          <circle cx="8" cy="8" r="6" fill="none" stroke="rgb(251 191 36 / 0.8)" strokeWidth="2"
                            strokeDasharray={`${2 * Math.PI * 6}`}
                            strokeDashoffset={`${2 * Math.PI * 6 * (1 - autoRetryCountdown / 60)}`}
                            className="transition-all duration-1000" />
                        </svg>
                      </div>
                      <span className="text-xs text-amber-400/80">{autoRetryCountdown}s 后自动重试</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Button size="sm" onClick={handleCancelAutoRetry} className="bg-white/5 hover:bg-white/10 text-gray-400 border border-white/10 text-xs px-2 py-1 h-auto">取消</Button>
                      <Button size="sm" onClick={handleManualRetry} className="bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 text-xs px-2 py-1 h-auto"><RotateCcw className="w-3 h-3 mr-1" />立即重试</Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between">
                    <div className="text-xs text-amber-400/50">倒计时已取消</div>
                    <Button size="sm" onClick={handleManualRetry} className="bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 text-xs"><RotateCcw className="w-3 h-3 mr-1" />重试</Button>
                  </div>
                )}
              </div>
            )
            : series.queueStatus === 'queued' ? <div className="mt-2 text-xs text-gray-400">您有其他漫剧正在生成，请稍候...</div>
            : <div className="mt-2">{(() => { const t = getProgressText(series.generationProgress); return t ? <div className="text-xs text-gray-400">{t}</div> : <div className="text-xs text-gray-400">正在分析故事大纲并生成内容...</div>; })()}<div className="mt-2 w-full bg-white/10 rounded-full h-1 overflow-hidden">{typeof series.generationProgress === 'object' && series.generationProgress?.totalSteps && series.generationProgress.totalSteps > 0 ? <motion.div className="h-full bg-gradient-to-r from-purple-500 to-pink-500" initial={{ width: '5%' }} animate={{ width: `${Math.max(5, Math.round(((series.generationProgress.currentStep || 0) / series.generationProgress.totalSteps) * 100))}%` }} transition={{ duration: 0.5 }} /> : <motion.div className="h-full w-1/3 bg-gradient-to-r from-purple-500 to-pink-500 rounded-full" animate={{ x: ['0%', '200%', '0%'] }} transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }} />}</div></div>}
          </div>
        )}
        {isFailed && <div className="mb-3 p-3 bg-red-500/20 border border-red-500/30 rounded-xl"><div className="flex items-center justify-between"><div><div className="text-red-300 text-sm font-medium">创作失败</div>{typeof series.generationProgress === 'object' && series.generationProgress?.error && <div className="mt-1 text-xs text-red-400 line-clamp-2">{series.generationProgress.error}</div>}</div><Button size="sm" onClick={(e) => { e.stopPropagation(); onRetry(series.id, series.storyOutline || (series as any).theme || ''); }} className="bg-red-500 hover:bg-red-600 text-white text-xs flex-shrink-0"><RotateCcw className="w-3 h-3 mr-1" />重试</Button></div></div>}
        <div className="flex items-center justify-between text-xs text-gray-500 mb-3"><div className="flex items-center gap-4"><span className="flex items-center gap-1"><Film className="w-3 h-3" />{isGenerating ? <span className="text-blue-400"><Loader2 className="w-3 h-3 inline-block animate-spin mr-0.5" />生成中</span> : `${episodeCount}/${totalEpisodes} 集`}</span><span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{new Date(series.createdAt).toLocaleDateString()}</span></div></div>
        <div className="flex flex-wrap gap-2">{series.genre && <span className="px-2 py-1 bg-purple-500/10 text-purple-400 rounded-lg text-xs">{series.genre}</span>}{series.style && <span className="px-2 py-1 bg-blue-500/10 text-blue-400 rounded-lg text-xs">{series.style}</span>}{series.coherenceCheck?.aspectRatio && <span className="px-2 py-1 bg-pink-500/10 text-pink-400 rounded-lg text-xs">{series.coherenceCheck.aspectRatio}</span>}{series.coreValues && series.coreValues.length > 0 && <span className="px-2 py-1 bg-green-500/10 text-green-400 rounded-lg text-xs">{series.coreValues[0]}</span>}</div>
      </div>
    </motion.div>
  );
}

// [D] SeriesDetailModal
function SeriesDetailModal({ series, onClose, onEdit }: { series: Series; onClose: () => void; onEdit: (s: Series) => void }) {
  const [playingEpisode, setPlayingEpisode] = useState<any>(null);
  return (
    <> {/* modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4" onClick={onClose}>
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} onClick={(e) => e.stopPropagation()} className="bg-gradient-to-br from-gray-900 to-purple-900 rounded-3xl border border-white/10 max-w-4xl max-h-[80vh] overflow-hidden flex flex-col">
          <div className="p-6 border-b border-white/10"><h2 className="text-2xl font-bold text-white mb-2">{series.title}</h2><p className="text-gray-400">{series.description}</p></div>
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <div className="bg-white/5 p-4 rounded-xl"><div className="text-gray-400 text-sm mb-1">类型</div><div className="text-white font-medium">{series.genre}</div></div>
              <div className="bg-white/5 p-4 rounded-xl"><div className="text-gray-400 text-sm mb-1">风格</div><div className="text-white font-medium">{series.style}</div></div>
              <div className="bg-white/5 p-4 rounded-xl"><div className="text-gray-400 text-sm mb-1">状态</div><div className="text-white font-medium flex items-center gap-2">{(series.status === 'generating' || series.status === 'in-progress') && <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />}{series.status === 'completed' ? '已完成' : series.status === 'generating' || series.status === 'in-progress' ? '创作中' : series.status === 'failed' ? '创作失败' : '草稿'}</div></div>
              <div className="bg-white/5 p-4 rounded-xl"><div className="text-gray-400 text-sm mb-1">集数</div><div className="text-white font-medium">{series.episodes?.length || 0}/{series.totalEpisodes} 集</div></div>
              {series.coherenceCheck?.aspectRatio && <div className="bg-white/5 p-4 rounded-xl"><div className="text-gray-400 text-sm mb-1">画面比例</div><div className="text-purple-300 font-medium">{series.coherenceCheck.aspectRatio}</div></div>}
              {series.coherenceCheck?.resolution && <div className="bg-white/5 p-4 rounded-xl"><div className="text-gray-400 text-sm mb-1">分辨率</div><div className="text-blue-300 font-medium">{series.coherenceCheck.resolution}</div></div>}
            </div>
            {series.coreValues && series.coreValues.length > 0 && <div><h3 className="text-lg font-semibold text-white mb-3">核心价值观</h3><div className="flex flex-wrap gap-2">{series.coreValues.map((value: string, idx: number) => <span key={idx} className="px-3 py-1 bg-gradient-to-r from-purple-500/20 to-pink-500/20 text-purple-300 rounded-lg text-sm border border-purple-500/30">{value}</span>)}</div></div>}
            {series.storyOutline && <div><h3 className="text-lg font-semibold text-white mb-3">故事大纲</h3><div className="bg-white/5 p-4 rounded-xl text-gray-300 text-sm leading-relaxed whitespace-pre-wrap">{series.storyOutline}</div></div>}
            {series.characters && series.characters.length > 0 && <div><h3 className="text-lg font-semibold text-white mb-3">角色列表</h3><div className="space-y-3">{series.characters.map((char: any, idx: number) => <div key={idx} className="bg-white/5 p-4 rounded-xl"><div className="font-semibold text-white mb-2">{char.name}</div><div className="text-gray-400 text-sm">{char.description}</div>{char.growthArc && <div className="mt-2 text-purple-300 text-sm">成长轨迹：{char.growthArc}</div>}</div>)}</div></div>}
            {series.episodes && series.episodes.length > 0 && <div><h3 className="text-lg font-semibold text-white mb-3">剧集列表</h3><div className="space-y-3">{series.episodes.map((ep: any) => <div key={ep.id} className="bg-white/5 p-4 rounded-xl"><div className="font-semibold text-white mb-2">第{ep.episodeNumber}集：{ep.title}</div><div className="text-gray-400 text-sm mb-2">{ep.synopsis}</div>{ep.growthTheme && <div className="text-purple-300 text-sm">成长主题：{ep.growthTheme}</div>}{ep.storyboards && <div className="mt-2 text-gray-500 text-xs">{ep.storyboards.length} 个分镜场景</div>}<Button onClick={() => setPlayingEpisode(ep)} className="mt-3 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white"><Play className="w-4 h-4 mr-2" />播放剧集</Button></div>)}</div></div>}
          </div>
          <div className="p-6 border-t border-white/10 flex justify-end gap-3"><Button onClick={onClose} variant="ghost" className="text-white">关闭</Button><Button onClick={() => { onEdit(series); onClose(); }} className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600"><Edit2 className="w-4 h-4 mr-2" />编辑</Button></div>
        </motion.div>
      </div>
      {playingEpisode && <EpisodePlayer episodeId={playingEpisode.id} episodeTitle={playingEpisode.title} seriesTitle={series.title} aspectRatio={series.coherenceCheck?.aspectRatio} onClose={() => setPlayingEpisode(null)} />}
    </>
  );
}

// [E] SeriesSearchBar
function SeriesSearchBar({ searchTerm, onSearchChange, filterStatus, onFilterChange, resultCount }: { searchTerm: string; onSearchChange: (v: string) => void; filterStatus: 'all' | 'draft' | 'in-progress' | 'completed'; onFilterChange: (s: 'all' | 'draft' | 'in-progress' | 'completed') => void; resultCount: number }) {
  const filterButtons = [{ value: 'all' as const, label: '全部' }, { value: 'draft' as const, label: '草稿' }, { value: 'in-progress' as const, label: '创作中' }, { value: 'completed' as const, label: '已完成' }];
  return (
    <div className="bg-white/5 backdrop-blur-xl rounded-2xl p-4 border border-white/10">
      <div className="flex flex-col md:flex-row gap-4"><div className="flex-1 relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" /><input type="text" placeholder="搜索漫剧标题或简介..." value={searchTerm} onChange={(e) => onSearchChange(e.target.value)} className="w-full pl-10 pr-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500/50" /></div><div className="flex gap-2">{filterButtons.map(({ value, label }) => <button key={value} onClick={() => onFilterChange(value)} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${filterStatus === value ? 'bg-purple-500 text-white' : 'bg-white/5 text-gray-400 hover:bg-white/10'}`}>{label}</button>)}</div></div>
      <div className="mt-3 text-sm text-gray-400">共找到 <span className="text-purple-400 font-semibold">{resultCount}</span> 部漫剧</div>
    </div>
  );
}
// ── End inline series/list ───────────────────────────────────────

interface SeriesListViewProps {
  series: Series[];
  onEdit: (series: Series) => void;
  onCreateNew: () => void;
  userPhone?: string;
  onDelete: (seriesId: string) => void;
  onRefresh?: () => void;
  onUpdate?: (callback: (prev: any[]) => any[]) => void;
  onSeriesDeleted?: (seriesId: string) => void; // v6.0.6: 清理浮窗中的相关任务
}

export function SeriesListView({ series, onEdit, onCreateNew, userPhone, onDelete, onRefresh, onUpdate, onSeriesDeleted }: SeriesListViewProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'draft' | 'in-progress' | 'completed'>('all');
  const [showDownloadMenu, setShowDownloadMenu] = useState<string | null>(null);
  const [showDetailModal, setShowDetailModal] = useState<Series | null>(null);
  const [downloadingVideos, setDownloadingVideos] = useState<Set<string>>(new Set());

  // 安全检查：确保 series 是数组
  const safeSeries = Array.isArray(series) ? series : [];

  // ==================== 处理函数 ====================

  const handleDelete = async (seriesId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    
    if (!userPhone) return;
    
    if (confirm('确定要删除这部漫剧吗？此操作不可恢复，关联的视频生成任务也会被取消。')) {
      // v6.0.5: 立即取消本地批量生成（如果正在进行）
      cancelBatchGeneration(seriesId);
      
      // v6.0.6: 立即从浮窗中清理该系列的视频任务（即时 UI 反馈）
      onSeriesDeleted?.(seriesId);
      
      // v6.0.6: 先显式调用取消端点（确保后端任务标记为 cancelled）
      apiRequest(`/volcengine/cancel-series-tasks/${seriesId}`, {
        method: 'POST',
        silent: true,
        timeout: 10000,
        maxRetries: 1,
      }).catch(err => console.warn('[SeriesListView] cancel-series-tasks failed (non-blocking):', err.message));
      
      const result = await seriesService.deleteSeries(seriesId, userPhone);
      if (result.success) {
        toast.success('漫剧已删除，关联的视频任务已取消');
        onDelete(seriesId);
      } else {
        toast.error('删除失败：' + result.error);
      }
    }
  };

  // 下载视频作品
  const handleDownloadVideos = async (item: Series) => {
    if (!item.episodes || item.episodes.length === 0) {
      toast.error('该漫剧还没有生成视频');
      return;
    }

    // 收集所有已完成的视频
    const completedVideos = item.episodes.flatMap(episode => 
      episode.storyboards?.filter(sb => sb.status === 'completed' && sb.videoUrl) || []
    );

    if (completedVideos.length === 0) {
      toast.error('该漫剧还没有已完成的视频，请先生成视频');
      return;
    }

    if (!confirm(`将下载 ${completedVideos.length} 个视频片段，是否继续？`)) {
      return;
    }

    setDownloadingVideos(prev => new Set(prev).add(item.id));
    setShowDownloadMenu(null);

    try {
      // 逐个下载视频
      for (let i = 0; i < completedVideos.length; i++) {
        const storyboard = completedVideos[i];
        const episode = item.episodes.find(ep => ep.id === storyboard.episodeId);
        
        try {
          // 使用fetch下载视频
          const response = await fetch(storyboard.videoUrl!);
          const blob = await response.blob();
          
          // 创建下载链接
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `${item.title}-第${episode?.episodeNumber}集-场景${storyboard.sceneNumber}.mp4`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          
          // 延迟一下，避免浏器阻止多个下载
          if (i < completedVideos.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 500));
          }
        } catch (error) {
          console.error(`下载视频失败: 第${episode?.episodeNumber}集-场景${storyboard.sceneNumber}`, error);
        }
      }
      
      toast.success(`成功下载 ${completedVideos.length} 个视频！`);
    } catch (error: any) {
      console.error('下载视频出错:', error);
      toast.error('下载视频时出现错误，请稍后重试');
    } finally {
      setDownloadingVideos(prev => {
        const next = new Set(prev);
        next.delete(item.id);
        return next;
      });
    }
  };

  // 下载剧本数据
  const handleDownload = (item: Series, format: 'json' | 'txt' | 'html') => {
    let content = '';
    let filename = '';
    let mimeType = '';

    if (format === 'json') {
      content = JSON.stringify(item, null, 2);
      filename = `${item.title}-剧本数据.json`;
      mimeType = 'application/json';
    } else if (format === 'txt') {
      content = generateTextFormat(item);
      filename = `${item.title}-剧本.txt`;
      mimeType = 'text/plain';
    } else if (format === 'html') {
      content = generateHTMLFormat(item);
      filename = `${item.title}-剧本.html`;
      mimeType = 'text/html';
    }

    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    setShowDownloadMenu(null);
  };

  // 生成纯文本格式
  const generateTextFormat = (item: Series): string => {
    let text = `${item.title}\n`;
    text += `${'='.repeat(item.title.length)}\n\n`;
    text += `简介：${item.description}\n`;
    text += `类型：${item.genre} | 风格：${item.style}\n`;
    text += `总集数：${item.totalEpisodes}集\n`;
    text += `创建时间：${new Date(item.createdAt).toLocaleString()}\n\n`;
    
    if (item.storyOutline) {
      text += `故事大纲\n${'-'.repeat(20)}\n${item.storyOutline}\n\n`;
    }

    if (item.coreValues && item.coreValues.length > 0) {
      text += `核心价值观：${item.coreValues.join('、')}\n\n`;
    }

    if (item.characters && item.characters.length > 0) {
      text += `角色列表\n${'-'.repeat(20)}\n`;
      item.characters.forEach((char: any) => {
        text += `\n【${char.name}】\n`;
        text += `简介：${char.description}\n`;
        if (char.growthArc) text += `成长轨迹：${char.growthArc}\n`;
      });
      text += '\n';
    }

    if (item.episodes && item.episodes.length > 0) {
      text += `剧集详情\n${'='.repeat(20)}\n\n`;
      item.episodes.forEach((ep: any) => {
        text += `第${ep.episodeNumber}集：${ep.title}\n`;
        text += `${'-'.repeat(40)}\n`;
        text += `简介：${ep.synopsis}\n`;
        if (ep.growthTheme) text += `成长主题：${ep.growthTheme}\n`;
        if (ep.growthInsight) text += `成长启示：${ep.growthInsight}\n`;
        
        if (ep.storyboards && ep.storyboards.length > 0) {
          text += `\n分镜场景：\n`;
          ep.storyboards.forEach((scene: any, idx: number) => {
            text += `  ${idx + 1}. ${scene.description}\n`;
            if (scene.dialogue) text += `     对话：${scene.dialogue}\n`;
          });
        }
        text += '\n';
      });
    }

    return text;
  };

  // 生成HTML格式
  const generateHTMLFormat = (item: Series): string => {
    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${item.title}</title>
  <style>
    body { font-family: "Microsoft YaHei", sans-serif; max-width: 900px; margin: 0 auto; padding: 20px; line-height: 1.8; }
    h1 { color: #8b5cf6; border-bottom: 3px solid #8b5cf6; padding-bottom: 10px; }
    h2 { color: #ec4899; margin-top: 30px; }
    h3 { color: #3b82f6; }
    .meta { background: #f3f4f6; padding: 15px; border-radius: 8px; margin: 20px 0; }
    .character { background: #fef3c7; padding: 10px; margin: 10px 0; border-left: 4px solid #f59e0b; }
    .episode { background: #e0e7ff; padding: 15px; margin: 15px 0; border-radius: 8px; }
    .scene { margin: 10px 0; padding: 10px; background: white; border-left: 3px solid #8b5cf6; }
    .tag { display: inline-block; background: #8b5cf6; color: white; padding: 3px 10px; border-radius: 4px; margin: 2px; }
  </style>
</head>
<body>
  <h1>${item.title}</h1>
  
  <div class="meta">
    <p><strong>简介：</strong>${item.description}</p>
    <p><strong>类型：</strong>${item.genre} | <strong>风格：</strong>${item.style}</p>
    <p><strong>总集数：</strong>${item.totalEpisodes}集</p>
    <p><strong>创建时间：</strong>${new Date(item.createdAt).toLocaleString()}</p>
    ${item.coreValues && item.coreValues.length > 0 ? `<p><strong>核心价值观：</strong>${item.coreValues.map((v: string) => `<span class="tag">${v}</span>`).join('')}</p>` : ''}
  </div>

  ${item.storyOutline ? `<h2>故事大纲</h2><p>${item.storyOutline.replace(/\\n/g, '<br>')}</p>` : ''}

  ${item.characters && item.characters.length > 0 ? `
    <h2>角色列表</h2>
    ${item.characters.map((char: any) => `
      <div class="character">
        <h3>${char.name}</h3>
        <p>${char.description}</p>
        ${char.growthArc ? `<p><strong>成长轨迹：</strong>${char.growthArc}</p>` : ''}
      </div>
    `).join('')}
  ` : ''}

  ${item.episodes && item.episodes.length > 0 ? `
    <h2>剧集详情</h2>
    ${item.episodes.map((ep: any) => `
      <div class="episode">
        <h3>第${ep.episodeNumber}集：${ep.title}</h3>
        <p><strong>简介：</strong>${ep.synopsis}</p>
        ${ep.growthTheme ? `<p><strong>成长主题：</strong>${ep.growthTheme}</p>` : ''}
        ${ep.growthInsight ? `<p><strong>成长启示：</strong>${ep.growthInsight}</p>` : ''}
        
        ${ep.storyboards && ep.storyboards.length > 0 ? `
          <h4>分镜场景</h4>
          ${ep.storyboards.map((scene: any, idx: number) => `
            <div class="scene">
              <strong>场景${idx + 1}：</strong>${scene.description}
              ${scene.dialogue ? `<br><strong>对话：</strong>${scene.dialogue}` : ''}
            </div>
          `).join('')}
        ` : ''}
      </div>
    `).join('')}
  ` : ''}

  <hr style="margin-top: 50px;">
  <p style="text-align: center; color: #666;">AI漫剧创作系统生成 | ${new Date().toLocaleString()}</p>
</body>
</html>`;
  };

  // 重试生成
  const handleRetrySeries = async (seriesId: string, storyOutline: string) => {
    if (!userPhone) return;
    
    try {
      const result = await seriesService.retrySeries(seriesId, userPhone, storyOutline);
      
      if (result.success) {
        toast.success('AI正在重新创作中，页面会自动更新进度。');
        
        if (onRefresh) {
          onRefresh();
        }
      } else {
        toast.error('重试失败：' + (result.error || '未知错误'));
      }
    } catch (error: any) {
      console.error('[SeriesListView] Retry failed:', error);
      toast.error('重试失败：' + error.message);
    }
  };

  // 筛选逻辑
  const filteredSeries = safeSeries.filter(item => {
    const matchSearch = (item.title || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                       (item.description || '').toLowerCase().includes(searchTerm.toLowerCase());
    // 'in-progress' 筛选同时匹配 'generating' 和 'in-progress' 状态
    const matchStatus = filterStatus === 'all' || 
                       item.status === filterStatus ||
                       (filterStatus === 'in-progress' && (item.status === 'generating' || item.status === 'in-progress'));
    return matchSearch && matchStatus;
  });

  // ==================== 渲染 ====================

  if (!userPhone) {
    return <EmptyState type="no-login" />;
  }

  if (safeSeries.length === 0) {
    return (
      <EmptyState 
        type="no-series" 
        onCreateNew={onCreateNew}
        userPhone={userPhone}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* 搜索和筛选栏 */}
      <SeriesSearchBar
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        filterStatus={filterStatus}
        onFilterChange={setFilterStatus}
        resultCount={filteredSeries.length}
      />

      {/* 漫剧列表 */}
      {filteredSeries.length === 0 ? (
        <EmptyState type="no-results" />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredSeries.map((item) => (
            <SeriesCard
              key={item.id}
              series={item}
              onEdit={onEdit}
              onDelete={handleDelete}
              onShowDetail={setShowDetailModal}
              onDownload={handleDownload}
              onDownloadVideos={handleDownloadVideos}
              onRetry={handleRetrySeries}
              showDownloadMenu={showDownloadMenu === item.id}
              onToggleDownloadMenu={(e: React.MouseEvent) => {
                e.stopPropagation();
                setShowDownloadMenu(showDownloadMenu === item.id ? null : item.id);
              }}
              isDownloading={downloadingVideos.has(item.id)}
            />
          ))}
        </div>
      )}

      {/* 详情模态框 */}
      {showDetailModal && (
        <SeriesDetailModal
          series={showDetailModal}
          onClose={() => setShowDetailModal(null)}
          onEdit={onEdit}
        />
      )}
    </div>
  );
}