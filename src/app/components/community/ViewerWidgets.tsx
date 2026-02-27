/**
 * SeriesViewer sub-components - UI widgets
 * Split from community/SeriesViewer.tsx (v6.0.67)
 */

import { forwardRef } from 'react';
import { motion } from 'motion/react';
import {
  X, List, SkipForward, Film, Play, Clock, RotateCcw, Home,
  ChevronRight, Heart, MessageCircle, Share2, Download, Keyboard,
} from 'lucide-react';

// [V-A] ViewerCountdown
export function ViewerCountdown({ countdown, nextEpisode, onSkip, onCancel }: { countdown: number; nextEpisode: { episodeNumber: number; title?: string; thumbnail?: string }; onSkip: () => void; onCancel: () => void }) {
  return (
    <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 30 }} transition={{ type: 'spring', damping: 25, stiffness: 300 }} className="absolute bottom-16 lg:bottom-24 left-1/2 -translate-x-1/2 z-40 w-[calc(100%-2rem)] sm:w-auto max-w-lg">
      <div className="flex items-center gap-2 sm:gap-3 px-3 sm:px-5 py-2.5 sm:py-3 rounded-2xl bg-black/70 backdrop-blur-xl border border-white/15 shadow-2xl">
        {nextEpisode.thumbnail && <div className="relative w-14 h-10 flex-shrink-0 rounded-lg overflow-hidden hidden sm:block"><img src={nextEpisode.thumbnail} alt="" className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} /><div className="absolute inset-0 bg-black/20" /></div>}
        <div className="relative w-10 h-10 flex-shrink-0"><svg className="w-10 h-10 -rotate-90" viewBox="0 0 36 36"><circle cx="18" cy="18" r="15" fill="none" stroke="white" strokeOpacity="0.15" strokeWidth="2.5" /><circle cx="18" cy="18" r="15" fill="none" stroke="url(#countdownGrad)" strokeWidth="2.5" strokeLinecap="round" strokeDasharray={`${(countdown / 3) * 94.2} 94.2`} className="transition-all duration-1000 ease-linear" /><defs><linearGradient id="countdownGrad" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor="#a855f7" /><stop offset="100%" stopColor="#ec4899" /></linearGradient></defs></svg><span className="absolute inset-0 flex items-center justify-center text-white text-sm font-bold">{countdown}</span></div>
        <div className="flex flex-col min-w-0 flex-1"><span className="text-white text-xs sm:text-sm font-medium">下一集即将播放</span><span className="text-gray-400 text-[10px] sm:text-xs truncate">第{nextEpisode.episodeNumber}集 · {nextEpisode.title || ''}</span></div>
        <div className="flex items-center gap-1.5 sm:gap-2 ml-1 sm:ml-2 shrink-0"><button onClick={onSkip} className="flex items-center gap-1 px-2.5 sm:px-3 py-1.5 rounded-lg bg-gradient-to-r from-purple-600 to-pink-600 text-white text-[10px] sm:text-xs font-medium hover:from-purple-700 hover:to-pink-700 transition-all"><SkipForward className="w-3 h-3 sm:w-3.5 sm:h-3.5" /><span className="hidden sm:inline">立即播放</span><span className="sm:hidden">播放</span></button><button onClick={onCancel} className="px-2.5 sm:px-3 py-1.5 rounded-lg bg-white/10 text-gray-300 text-[10px] sm:text-xs font-medium hover:bg-white/20 hover:text-white transition-all">取消</button></div>
      </div>
    </motion.div>
  );
}

// [V-B] ViewerEpisodeList
export function ViewerEpisodeList({ episodes, currentEpisodeIndex, onSelectEpisode, onClose }: { episodes: { id: string; episodeNumber: number; title: string; synopsis?: string; status?: string; videoUrl?: string; mergedVideoUrl?: string; totalDuration?: number }[]; currentEpisodeIndex: number; onSelectEpisode: (i: number) => void; onClose: () => void }) {
  return (
    <motion.div initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} transition={{ type: 'spring', damping: 30, stiffness: 300 }} className="fixed lg:relative top-0 right-0 w-full lg:w-96 h-full bg-gradient-to-br from-slate-950/95 via-purple-950/95 to-slate-950/95 backdrop-blur-xl border-l border-white/10 z-40 overflow-y-auto">
      <div className="p-6">
        <div className="flex items-center justify-between mb-6"><h3 className="text-white text-lg font-bold flex items-center gap-2"><Film className="w-5 h-5" />选集</h3><button onClick={onClose} className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-gray-400 hover:text-white transition-all"><X className="w-5 h-5" /></button></div>
        <div className="space-y-3">{episodes.map((episode, index) => <button key={episode.id} onClick={() => onSelectEpisode(index)} className={`w-full p-4 rounded-xl text-left transition-all ${index === currentEpisodeIndex ? 'bg-gradient-to-r from-purple-500/30 to-pink-500/30 border border-purple-500/50' : 'bg-white/5 hover:bg-white/10 border border-white/10'}`}><div className="flex items-start gap-3"><div className={`flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold ${index === currentEpisodeIndex ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white' : 'bg-white/10 text-gray-400'}`}>{episode.episodeNumber}</div><div className="flex-1 min-w-0"><h4 className="text-white font-medium mb-1 truncate">{episode.title}</h4><p className="text-gray-400 text-xs line-clamp-2 mb-2">{episode.synopsis}</p><div className="flex items-center gap-3 text-xs text-gray-500">{(episode.status === 'completed' || episode.videoUrl || episode.mergedVideoUrl) ? <><span className="flex items-center gap-1 text-green-400"><Play className="w-3 h-3" />可播放</span>{(episode.totalDuration ?? 0) > 0 && <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{Math.floor((episode.totalDuration ?? 0) / 60)}分钟</span>}</> : <span className="text-yellow-400">生成中...</span>}</div></div></div></button>)}</div>
      </div>
    </motion.div>
  );
}

// [V-C] ViewerExpiredOverlay
export function ViewerExpiredOverlay({ isLoadingVideo, onRecover, onClose }: { isLoadingVideo: boolean; onRecover: () => void; onClose: () => void }) {
  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="absolute inset-0 z-30 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="max-w-md mx-4 p-8 bg-gradient-to-br from-red-500/20 to-orange-500/20 backdrop-blur-xl rounded-2xl border border-red-500/30 shadow-2xl"><div className="text-center space-y-4"><div className="text-6xl">&#9888;&#65039;</div><h3 className="text-2xl font-bold text-white">视频链接已过期</h3><p className="text-gray-300 leading-relaxed">视频临时URL已过期。点击下方按钮尝试恢复视频。</p><div className="flex gap-3 justify-center"><button onClick={onRecover} disabled={isLoadingVideo} className="px-6 py-3 bg-gradient-to-r from-blue-600 to-cyan-600 text-white rounded-lg font-medium hover:from-blue-700 hover:to-cyan-700 transition-all disabled:opacity-50">{isLoadingVideo ? '恢复中...' : '尝试恢复视频'}</button><button onClick={onClose} className="px-6 py-3 bg-white/10 text-white rounded-lg font-medium hover:bg-white/20 transition-all">关闭</button></div></div></div>
    </motion.div>
  );
}

// [V-D] ViewerFinale
export function ViewerFinale({ series, episodes, similarSeries, onReplay, onSelectEpisode, onClose, onNavigateToSeries }: { series: { id: string; title: string }; episodes: any[]; similarSeries: any[]; isLoadingSimilar?: boolean; onReplay: () => void; onSelectEpisode: () => void; onClose: () => void; onNavigateToSeries?: (id: string) => void }) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 z-40 flex items-center justify-center bg-black/80 backdrop-blur-md overflow-y-auto">
      <motion.div initial={{ scale: 0.85, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.85, opacity: 0 }} transition={{ type: 'spring', damping: 22, stiffness: 260 }} className="max-w-md mx-4 my-8 p-8 bg-gradient-to-br from-purple-900/60 via-slate-900/60 to-pink-900/60 backdrop-blur-2xl rounded-3xl border border-white/15 shadow-2xl text-center">
        <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.2, type: 'spring', stiffness: 300 }} className="text-6xl mb-4">🎬</motion.div>
        <h2 className="text-2xl font-bold text-white mb-2">全剧终</h2><p className="text-gray-400 text-sm mb-1">《{series.title}》· 共{episodes.length}集</p><p className="text-gray-500 text-xs mb-6">感谢观看，希望你喜欢这个故事</p>
        <div className="flex flex-col gap-3"><button onClick={onReplay} className="w-full flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 text-white font-medium hover:from-purple-700 hover:to-pink-700 transition-all shadow-lg shadow-purple-500/25"><RotateCcw className="w-4 h-4" />从头重播</button><button onClick={onSelectEpisode} className="w-full flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-white/10 text-white font-medium hover:bg-white/15 transition-all"><List className="w-4 h-4" />选择剧集</button><button onClick={onClose} className="w-full flex items-center justify-center gap-2 px-5 py-3 rounded-xl text-gray-400 hover:text-white hover:bg-white/5 transition-all"><Home className="w-4 h-4" />返回社区</button></div>
        {similarSeries.length > 0 && <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }} className="mt-6 pt-5 border-t border-white/10"><p className="text-gray-400 text-xs mb-3 flex items-center justify-center gap-1"><ChevronRight className="w-3 h-3" />猜你也会喜欢</p><div className="grid grid-cols-2 gap-2">{similarSeries.map((sim: any) => <button key={sim.id} onClick={() => { onClose(); onNavigateToSeries ? onNavigateToSeries(sim.id) : (window.location.hash = `#series-${sim.id}`); }} className="p-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 hover:border-white/15 transition-all text-left group">{sim.coverImage && <div className="w-full aspect-[16/9] rounded-lg overflow-hidden mb-2 bg-white/5"><img src={sim.coverImage} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} /></div>}<h4 className="text-white text-xs font-medium truncate">{sim.title}</h4><div className="flex items-center gap-2 mt-1"><span className="text-gray-500 text-[10px]">{sim.totalEpisodes}集</span>{sim.likes > 0 && <span className="flex items-center gap-0.5 text-gray-500 text-[10px]"><Heart className="w-2.5 h-2.5" />{sim.likes}</span>}</div></button>)}</div></motion.div>}
      </motion.div>
    </motion.div>
  );
}

// [V-E] ViewerMobileBar
export function ViewerMobileBar({ isLiked, likes, commentsCount, onLike, onComment, onShare, onDownload }: { isLiked: boolean; likes: number; commentsCount: number; onLike: () => void; onComment: () => void; onShare: () => void; onDownload: () => void }) {
  return (
    <div className="lg:hidden absolute bottom-0 left-0 right-0 z-40" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
      <div className="flex items-center justify-around px-4 py-2.5 bg-black/70 backdrop-blur-xl border-t border-white/10">
        <button onClick={onLike} className="flex flex-col items-center gap-0.5 active:scale-95 transition-transform"><Heart className={`w-5 h-5 ${isLiked ? 'fill-pink-500 text-pink-500' : 'text-white'}`} /><span className="text-[10px] text-white/70">{likes || '赞'}</span></button>
        <button onClick={onComment} className="flex flex-col items-center gap-0.5 active:scale-95 transition-transform"><MessageCircle className="w-5 h-5 text-white" /><span className="text-[10px] text-white/70">{commentsCount || '评论'}</span></button>
        <button onClick={onShare} className="flex flex-col items-center gap-0.5 active:scale-95 transition-transform"><Share2 className="w-5 h-5 text-white" /><span className="text-[10px] text-white/70">分享</span></button>
        <button onClick={onDownload} className="flex flex-col items-center gap-0.5 active:scale-95 transition-transform"><Download className="w-5 h-5 text-white" /><span className="text-[10px] text-white/70">下载</span></button>
      </div>
    </div>
  );
}

// [V-F] ViewerNoVideo
export const ViewerNoVideo = forwardRef<HTMLDivElement, { episodeNumber: number; onClose: () => void }>(function ViewerNoVideo({ episodeNumber, onClose }, ref) {
  return (
    <motion.div ref={ref} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 bg-black flex items-center justify-center">
      <button onClick={onClose} className="absolute top-4 left-4 z-50 w-10 h-10 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center text-white hover:bg-black/70 transition-all"><X className="w-6 h-6" /></button>
      <div className="max-w-md mx-4 p-8 bg-gradient-to-br from-purple-500/20 to-pink-500/20 backdrop-blur-xl rounded-2xl border border-purple-500/30 shadow-2xl"><div className="text-center space-y-4"><div className="text-6xl">📺</div><h3 className="text-2xl font-bold text-white">视频生成中</h3><p className="text-gray-300 leading-relaxed">第{episodeNumber}集正在生成中，请稍后再来查看。</p><button onClick={onClose} className="mt-6 px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-lg font-medium hover:from-purple-700 hover:to-pink-700 transition-all">关闭</button></div></div>
    </motion.div>
  );
});

// [V-G] ViewerShortcutHelp
const VIEWER_SHORTCUTS: [string, string][] = [['Space', '播放 / 暂停'], ['Esc', '关闭（分层退出）'], [String.fromCharCode(8592), '上一集'], [String.fromCharCode(8594), '下一集 / 跳过倒计时'], ['Enter', '跳过倒计时'], ['L', '切换选集面板'], ['?', '显示 / 隐藏快捷键']];
export function ViewerShortcutHelp({ onClose }: { onClose: () => void }) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} transition={{ type: 'spring', damping: 25, stiffness: 300 }} className="max-w-sm mx-4 p-6 bg-slate-900/95 backdrop-blur-xl rounded-2xl border border-white/15 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5"><h3 className="text-white font-bold flex items-center gap-2"><Keyboard className="w-5 h-5 text-purple-400" />键盘快捷键</h3><button onClick={onClose} className="w-7 h-7 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-gray-400 hover:text-white transition-all"><X className="w-4 h-4" /></button></div>
        <div className="space-y-2.5">{VIEWER_SHORTCUTS.map(([key, desc]) => <div key={key} className="flex items-center justify-between"><span className="text-gray-400 text-sm">{desc}</span><kbd className="px-2.5 py-1 rounded-md bg-white/10 text-white text-xs font-mono border border-white/15">{key}</kbd></div>)}</div>
        <p className="mt-4 text-gray-600 text-[10px] text-center">触摸设备支持上下滑动切集</p>
      </motion.div>
    </motion.div>
  );
}
