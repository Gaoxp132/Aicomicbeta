/**
 * Consolidated profile module (v6.0.67)
 * Merged from 4 files: ProfileHeader, ProfileStats, ProfileWorkItem, ProfileWorksList
 * Reduces Rollup module count by 3.
 * v6.0.98: QuotaCard 配额卡片组件
 */

import { useState } from 'react';
import { motion } from 'motion/react';
import { toast } from 'sonner';
import {
  User, Edit2, Check, X, Loader2, LogOut, Play, Heart, Eye,
  MessageCircle, Clock, Trash2, RefreshCw, RotateCcw, Film, ChevronRight, WifiOff,
  Zap, CreditCard, Shield,
} from 'lucide-react';
import { Button } from '../ui';
import * as communityAPI from '../../services';
import { apiDelete } from '../../utils';
import { retryVideo } from '../../services';
import type { Comic } from '../../types/index';
import type { VideoQuotaInfo } from '../../hooks/useVideoQuota';
import { ConfirmDialog, useConfirm } from '../series/ConfirmDialog';
import { getErrorMessage } from '../../utils';

// ═══════════════════════════════════════════════════════════════════
// [A] ProfileHeader (was: ProfileHeader.tsx)
// ═══════════════════════════════════════════════════════════════════

interface ProfileHeaderProps {
  userPhone: string;
  userNickname: string;
  onNicknameChange: (newNickname: string) => void;
  onLogout: () => void;
}

export function ProfileHeader({ userPhone, userNickname, onNicknameChange, onLogout }: ProfileHeaderProps) {
  const [isEditingNickname, setIsEditingNickname] = useState(false);
  const [editNicknameValue, setEditNicknameValue] = useState('');
  const [isSavingNickname, setIsSavingNickname] = useState(false);

  const handleStartEdit = () => { setEditNicknameValue(userNickname); setIsEditingNickname(true); };
  const handleSaveNickname = async () => {
    if (!editNicknameValue.trim()) return;
    setIsSavingNickname(true);
    try {
      const result = await communityAPI.updateUserProfile(userPhone, { nickname: editNicknameValue.trim() });
      if (result.success) { onNicknameChange(editNicknameValue.trim()); setIsEditingNickname(false); }
    } catch (error: unknown) { console.error('[ProfileHeader] Failed to update nickname:', error); }
    finally { setIsSavingNickname(false); }
  };
  const handleCancelEdit = () => { setIsEditingNickname(false); setEditNicknameValue(''); };

  return (
    <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="bg-gradient-to-br from-purple-500/10 to-pink-500/10 rounded-2xl p-4 sm:p-8 backdrop-blur-sm border border-white/10">
      <div className="flex items-center gap-3 sm:gap-6">
        <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 200 }} className="w-14 h-14 sm:w-24 sm:h-24 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center shadow-lg shrink-0">
          <User className="w-7 h-7 sm:w-12 sm:h-12 text-white" />
        </motion.div>
        <div className="flex-1 min-w-0">
          {isEditingNickname ? (
            <div className="flex items-center gap-2">
              <input type="text" value={editNicknameValue} onChange={(e) => setEditNicknameValue(e.target.value)} className="px-3 py-2 bg-black/20 border border-white/20 rounded-lg text-white placeholder-white/40 focus:outline-none focus:border-purple-500 flex-1 text-sm sm:text-base min-w-0" placeholder="输入昵称" maxLength={20} autoFocus disabled={isSavingNickname} />
              <Button onClick={handleSaveNickname} disabled={isSavingNickname || !editNicknameValue.trim()} size="sm" className="bg-purple-500 hover:bg-purple-600">{isSavingNickname ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}</Button>
              <Button onClick={handleCancelEdit} disabled={isSavingNickname} size="sm" variant="ghost"><X className="w-4 h-4" /></Button>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <h2 className="text-xl sm:text-3xl font-bold text-white truncate">{userNickname}</h2>
              <Button onClick={handleStartEdit} size="sm" variant="ghost" className="text-white/60 hover:text-white"><Edit2 className="w-4 h-4" /></Button>
            </div>
          )}
          <p className="text-white/60 mt-0.5 sm:mt-1 text-xs sm:text-base">手机号: {userPhone}</p>
        </div>
        <Button onClick={onLogout} variant="ghost" className="text-white/60 hover:text-white hover:bg-white/10 shrink-0">
          <LogOut className="w-4 h-4 sm:w-5 sm:h-5 sm:mr-2" /><span className="hidden sm:inline">退出登录</span>
        </Button>
      </div>
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// [B] ProfileStats (was: ProfileStats.tsx)
// ═══════════════════════════════════════════════════════════════════

interface ProfileStatsProps { totalWorks: number; totalLikes: number; totalViews: number; }

export function ProfileStats({ totalWorks, totalLikes, totalViews }: ProfileStatsProps) {
  const stats = [
    { label: '作品', value: totalWorks, icon: Play, gradient: 'from-blue-500 to-cyan-500' },
    { label: '获赞', value: totalLikes, icon: Heart, gradient: 'from-pink-500 to-rose-500' },
    { label: '观看', value: totalViews, icon: Eye, gradient: 'from-purple-500 to-indigo-500' },
  ];
  return (
    <div className="grid grid-cols-3 gap-2 sm:gap-4">
      {stats.map((stat, index) => (
        <motion.div key={stat.label} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: index * 0.1 }} className="bg-white/5 rounded-xl p-3 sm:p-4 backdrop-blur-sm border border-white/10 hover:bg-white/10 transition-colors">
          <div className="flex items-center justify-between">
            <div><p className="text-white/60 text-xs sm:text-sm">{stat.label}</p><p className="text-lg sm:text-2xl font-bold text-white mt-0.5 sm:mt-1">{stat.value}</p></div>
            <div className={`w-8 h-8 sm:w-12 sm:h-12 rounded-full bg-gradient-to-br ${stat.gradient} flex items-center justify-center shrink-0`}><stat.icon className="w-4 h-4 sm:w-6 sm:h-6 text-white" /></div>
          </div>
        </motion.div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// [C] ProfileWorkItem (was: ProfileWorkItem.tsx)
// ═══════════════════════════════════════════════════════════════════

interface ProfileWorkItemProps { work: any; onPlay: () => void; onRefresh: () => void; }

export function ProfileWorkItem({ work, onPlay, onRefresh }: ProfileWorkItemProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const { confirm: confirmAction, dialogProps } = useConfirm();

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const confirmed = await confirmAction({
      title: '删除作品',
      description: '确定要删除这个作品吗？',
      confirmText: '确认删除',
      cancelText: '取消',
      variant: 'danger',
      icon: 'delete',
    });
    if (!confirmed) return;
    setIsDeleting(true);
    try {
      if (work.type === 'series') { await apiDelete(`/series/${work.id}`); }
      else {
        const taskId = work.taskId || work.task_id || work.id;
        const phone = work.userPhone || work.user_phone;
        if (phone && taskId) { await apiDelete(`/community/user/${encodeURIComponent(phone)}/works/${taskId}`); }
        else { await apiDelete(`/series/${work.id}`); }
      }
      toast.success('作品已删除'); onRefresh();
    } catch (error: unknown) { console.error('[ProfileWorkItem] Failed to delete work:', error); toast.error('删除失败，请重试'); }
    finally { setIsDeleting(false); }
  };

  const handleRetry = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!work.taskId) { toast.error('无法重试：缺少任务ID'); return; }
    setIsRetrying(true);
    try {
      const result = await retryVideo(work.taskId);
      if (result.success) { toast.success('重新生成已启动，请稍后刷新查看'); setTimeout(() => onRefresh(), 3000); }
      else { toast.error(result.error || '重试失败'); }
    } catch (error: unknown) { console.error('[ProfileWorkItem] Failed to retry:', error); toast.error('重试失败：' + getErrorMessage(error)); }
    finally { setIsRetrying(false); }
  };

  const getStatusBadge = () => {
    switch (work.status) {
      case 'completed': return <span className="px-2 py-1 bg-green-500/20 text-green-300 text-xs rounded-full border border-green-500/30">✓ 已完成</span>;
      case 'processing': return <span className="px-2 py-1 bg-blue-500/20 text-blue-300 text-xs rounded-full border border-blue-500/30 flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" />生成中</span>;
      case 'pending': return <span className="px-2 py-1 bg-yellow-500/20 text-yellow-300 text-xs rounded-full border border-yellow-500/30">⏳ 排队</span>;
      case 'failed': return <span className="px-2 py-1 bg-red-500/20 text-red-300 text-xs rounded-full border border-red-500/30">✗ 失败</span>;
      default: return <span className="px-2 py-1 bg-gray-500/20 text-gray-300 text-xs rounded-full border border-gray-500/30">{work.status || '草稿'}</span>;
    }
  };

  return (
    <>
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} whileHover={{ scale: 1.02 }} className="bg-white/5 rounded-xl p-3 sm:p-4 backdrop-blur-sm border border-white/10 hover:bg-white/10 transition-all cursor-pointer group" onClick={onPlay}>
      <div className="flex items-center gap-3 sm:gap-4">
        <div className="relative w-16 h-16 sm:w-24 sm:h-24 rounded-lg bg-gradient-to-br from-purple-500/20 to-pink-500/20 flex items-center justify-center overflow-hidden flex-shrink-0">
          {(work.coverImage || work.thumbnail) ? (<img src={work.coverImage || work.thumbnail} alt={work.title} className="w-full h-full object-cover" loading="lazy" />) : work.type === 'series' ? (<Film className="w-6 h-6 sm:w-8 sm:h-8 text-purple-400/60" />) : (<Play className="w-6 h-6 sm:w-8 sm:h-8 text-white/40" />)}
          {work.type === 'series' && (<div className="absolute top-0.5 left-0.5 sm:top-1 sm:left-1 px-1 sm:px-1.5 py-0.5 bg-purple-500/80 rounded text-[8px] sm:text-[10px] text-white font-medium">漫剧</div>)}
          {work.type !== 'series' && work.status === 'completed' && (<div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"><Play className="w-6 h-6 sm:w-8 sm:h-8 text-white" /></div>)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-1 sm:gap-2"><h3 className="text-sm sm:text-lg font-semibold text-white truncate">{work.title}</h3>{getStatusBadge()}</div>
          <p className="text-white/60 text-xs sm:text-sm mt-0.5 sm:mt-1 line-clamp-1 sm:line-clamp-2">{work.description || '暂无简介'}</p>
          <div className="flex items-center gap-2 sm:gap-4 mt-1 sm:mt-2 text-white/40 text-xs sm:text-sm">
            {work.type === 'series' ? (<><span className="flex items-center gap-1"><Film className="w-4 h-4" />{work.totalEpisodes || 0}集</span><span className="flex items-center gap-1 text-purple-400"><ChevronRight className="w-4 h-4" />查看详情</span></>) : (<><span className="flex items-center gap-1"><Heart className="w-4 h-4" />{work.likes_count || 0}</span><span className="flex items-center gap-1"><MessageCircle className="w-4 h-4" />{work.comments_count || 0}</span></>)}
            <span className="flex items-center gap-1"><Clock className="w-4 h-4" />{new Date(work.created_at || work.createdAt).toLocaleDateString()}</span>
          </div>
        </div>
        <div className="flex flex-col gap-2">
          {work.status === 'failed' && work.type !== 'series' && (<Button onClick={handleRetry} disabled={isRetrying} size="sm" variant="ghost" className="text-yellow-400 hover:text-yellow-300" title="重试生成">{isRetrying ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}</Button>)}
          <Button onClick={handleDelete} disabled={isDeleting} size="sm" variant="ghost" className="text-red-400 hover:text-red-300" title="删除作品">{isDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}</Button>
        </div>
      </div>
    </motion.div>
    <ConfirmDialog {...dialogProps} />
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════
// [D] ProfileWorksList (was: ProfileWorksList.tsx)
// ═══════════════════════════════════════════════════════════════════

interface ProfileWorksListProps {
  works: any[]; isLoading: boolean; hasMore: boolean; isLoadingMore: boolean; isOffline?: boolean;
  onSelectWork: (work: any, worksList?: any[]) => void; onLoadMore: () => void; onRefresh: () => void;
}

export function ProfileWorksList({ works, isLoading, hasMore, isLoadingMore, isOffline = false, onSelectWork, onLoadMore, onRefresh }: ProfileWorksListProps) {
  if (isLoading && works.length === 0) {
    return (<div className="flex flex-col items-center justify-center py-20"><Loader2 className="w-12 h-12 text-purple-500 animate-spin mb-4" /><p className="text-white/60">加载作品中...</p></div>);
  }
  if (isOffline && works.length === 0) {
    return (
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center py-20 px-6">
        <div className="w-24 h-24 rounded-full bg-red-500/10 flex items-center justify-center mx-auto mb-6"><WifiOff className="w-12 h-12 text-red-500" /></div>
        <h3 className="text-2xl font-bold text-white mb-3">无法连接到服务器</h3>
        <p className="text-white/60 mb-6 max-w-md mx-auto">服务器暂时无法访问，可能是网络问题或服务器维护中。请稍后重试。</p>
        <Button onClick={onRefresh} variant="outline" className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 border-0"><RefreshCw className="w-4 h-4 mr-2" />重试连接</Button>
        <div className="mt-8 p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-lg max-w-md mx-auto"><p className="text-yellow-400 text-sm">💡 提示：如果问题持续存在，请联系技术支持</p></div>
      </motion.div>
    );
  }
  if (works.length === 0) {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-20">
        <div className="w-24 h-24 rounded-full bg-white/5 flex items-center justify-center mx-auto mb-4"><motion.div animate={{ rotate: 360 }} transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}><RefreshCw className="w-12 h-12 text-white/20" /></motion.div></div>
        <p className="text-white/40 text-lg">还没有创作任何作品</p><p className="text-white/30 text-sm mt-2">快去创作你的第一部漫剧吧！</p>
      </motion.div>
    );
  }
  return (
    <div className="space-y-3 sm:space-y-4">
      <div className="flex items-center justify-between mb-3 sm:mb-4">
        <h3 className="text-lg sm:text-xl font-semibold text-white">我的作品</h3>
        <Button onClick={onRefresh} variant="ghost" size="sm" className="text-white/60 hover:text-white"><RefreshCw className="w-4 h-4 mr-1 sm:mr-2" /><span className="hidden sm:inline">刷新</span></Button>
      </div>
      {works.map((work, index) => (<ProfileWorkItem key={work.id || index} work={work} onPlay={() => onSelectWork(work, works)} onRefresh={onRefresh} />))}
      {hasMore && (<div className="flex justify-center pt-4"><Button onClick={onLoadMore} disabled={isLoadingMore} variant="outline" className="border-white/20 text-white hover:bg-white/10">{isLoadingMore ? (<><Loader2 className="w-4 h-4 mr-2 animate-spin" />加载中...</>) : '加载更多'}</Button></div>)}
      {!hasMore && works.length > 0 && (<p className="text-center text-white/40 text-sm py-4">已显示全部作品</p>)}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// [E] QuotaCard (v6.0.98) — 每日配额状态卡片
// ═══════════════════════════════════════════════════════════════════

interface QuotaCardProps {
  quota: VideoQuotaInfo | null;
  isLoading: boolean;
  onOpenPayment?: () => void;
  onOpenAdmin?: () => void;
}

export function QuotaCard({ quota, isLoading, onOpenPayment, onOpenAdmin }: QuotaCardProps) {
  if (isLoading && !quota) {
    return (
      <div className="bg-white/5 border border-white/10 rounded-2xl p-4 flex items-center gap-3">
        <Loader2 className="w-4 h-4 text-purple-400 animate-spin flex-shrink-0" />
        <span className="text-sm text-gray-500">加载配额信息…</span>
      </div>
    );
  }

  if (!quota) return null;

  if (quota.isAdmin) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-4"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-amber-400 flex-shrink-0" />
            <span className="text-sm font-medium text-amber-300">管理员账号 · 无限配额</span>
          </div>
          {onOpenAdmin && (
            <button
              onClick={onOpenAdmin}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 text-xs font-medium transition-colors"
            >
              <Shield className="w-3.5 h-3.5" />
              管理控制台
            </button>
          )}
        </div>
      </motion.div>
    );
  }

  const usedPct = quota.freeLimit > 0 ? Math.min(100, (quota.usedToday / quota.freeLimit) * 100) : 100;
  const isNearLimit = quota.freeRemaining <= 1;
  const isExhausted = quota.totalRemaining <= 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={`border rounded-2xl p-4 ${
        isExhausted
          ? 'bg-red-500/10 border-red-500/20'
          : isNearLimit
          ? 'bg-orange-500/10 border-orange-500/20'
          : 'bg-white/5 border-white/10'
      }`}
    >
      {/* Header row */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Zap className={`w-4 h-4 flex-shrink-0 ${isExhausted ? 'text-red-400' : isNearLimit ? 'text-orange-400' : 'text-purple-400'}`} />
          <span className="text-sm font-medium text-white">今日视频配额</span>
        </div>
        {onOpenPayment && (
          <button
            onClick={onOpenPayment}
            className="flex items-center gap-1 text-xs text-green-400 hover:text-green-300 transition-colors"
          >
            <CreditCard className="w-3 h-3" />
            购买更多
          </button>
        )}
      </div>

      {/* Progress bar */}
      <div className="h-1.5 bg-white/10 rounded-full mb-2.5 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${
            isExhausted ? 'bg-red-500' : isNearLimit ? 'bg-orange-500' : 'bg-gradient-to-r from-purple-500 to-pink-500'
          }`}
          style={{ width: `${usedPct}%` }}
        />
      </div>

      {/* Stats row */}
      <div className="flex items-center justify-between text-xs">
        <span className={isExhausted ? 'text-red-400' : isNearLimit ? 'text-orange-400' : 'text-gray-400'}>
          今日已用 <span className="text-white font-medium">{quota.usedToday}</span>
          <span className="text-gray-500"> / {quota.freeLimit}</span> 个免费
        </span>
        <div className="flex items-center gap-2">
          {quota.paidCredits > 0 && (
            <span className="text-green-400">
              +{quota.paidCredits} 付费剩余
            </span>
          )}
          <span className={`font-medium ${isExhausted ? 'text-red-400' : isNearLimit ? 'text-orange-400' : 'text-white'}`}>
            剩余 {quota.totalRemaining} 次
          </span>
        </div>
      </div>

      {/* Exhausted hint */}
      {isExhausted && onOpenPayment && (
        <button
          onClick={onOpenPayment}
          className="w-full mt-3 py-2 rounded-xl bg-green-500 hover:bg-green-600 text-white text-xs font-medium transition-colors"
        >
          今日配额已用完 · 点击购买配额继续创作
        </button>
      )}
    </motion.div>
  );
}