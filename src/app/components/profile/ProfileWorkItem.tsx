// Profile子组件 - 单个作品卡片
import { motion } from 'motion/react';
import { Play, Heart, MessageCircle, Clock, Loader2, Trash2, RefreshCw, RotateCcw } from 'lucide-react';
import { Button } from '../ui/button';
import { useState } from 'react';
import { apiDelete } from '../../utils/apiClient';
import { retryVideo } from '../../services/community';
import { toast } from 'sonner';

interface ProfileWorkItemProps {
  work: any;
  onPlay: () => void;
  onRefresh: () => void;
}

export function ProfileWorkItem({ work, onPlay, onRefresh }: ProfileWorkItemProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    
    if (!confirm('确定要删除这个作品吗？')) {
      return;
    }

    setIsDeleting(true);
    try {
      await apiDelete(`/make-server-fc31472c/series/${work.id}`);
      console.log('[ProfileWorkItem] Work deleted:', work.id);
      toast.success('作品已删除');
      onRefresh();
    } catch (error) {
      console.error('[ProfileWorkItem] Failed to delete work:', error);
      toast.error('删除失败，请重试');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleRetry = async (e: React.MouseEvent) => {
    e.stopPropagation();
    
    if (!work.taskId) {
      toast.error('无法重试：缺少任务ID');
      return;
    }

    setIsRetrying(true);
    try {
      const result = await retryVideo(work.taskId);
      if (result.success) {
        console.log('[ProfileWorkItem] Retry successful, new task:', result.newTaskId);
        toast.success('重新生成已启动，请稍后刷新查看');
        // 等待3秒后刷新列表
        setTimeout(() => {
          onRefresh();
        }, 3000);
      } else {
        toast.error(result.error || '重试失败');
      }
    } catch (error: any) {
      console.error('[ProfileWorkItem] Failed to retry:', error);
      toast.error('重试失败：' + error.message);
    } finally {
      setIsRetrying(false);
    }
  };

  const getStatusBadge = () => {
    switch (work.status) {
      case 'completed':
        return (
          <span className="px-2 py-1 bg-green-500/20 text-green-300 text-xs rounded-full border border-green-500/30">
            ✓ 已完成
          </span>
        );
      case 'processing':
        return (
          <span className="px-2 py-1 bg-blue-500/20 text-blue-300 text-xs rounded-full border border-blue-500/30 flex items-center gap-1">
            <Loader2 className="w-3 h-3 animate-spin" />
            生成中
          </span>
        );
      case 'pending':
        return (
          <span className="px-2 py-1 bg-yellow-500/20 text-yellow-300 text-xs rounded-full border border-yellow-500/30">
            ⏳ 排队中
          </span>
        );
      case 'failed':
        return (
          <span className="px-2 py-1 bg-red-500/20 text-red-300 text-xs rounded-full border border-red-500/30">
            ✗ 失败
          </span>
        );
      default:
        return (
          <span className="px-2 py-1 bg-gray-500/20 text-gray-300 text-xs rounded-full border border-gray-500/30">
            {work.status || '草稿'}
          </span>
        );
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ scale: 1.02 }}
      className="bg-white/5 rounded-xl p-4 backdrop-blur-sm border border-white/10 hover:bg-white/10 transition-all cursor-pointer group"
      onClick={onPlay}
    >
      <div className="flex items-center gap-4">
        {/* 封面 */}
        <div className="relative w-24 h-24 rounded-lg bg-gradient-to-br from-purple-500/20 to-pink-500/20 flex items-center justify-center overflow-hidden flex-shrink-0">
          {work.coverImage ? (
            <img src={work.coverImage} alt={work.title} className="w-full h-full object-cover" />
          ) : (
            <Play className="w-8 h-8 text-white/40" />
          )}
          {work.status === 'completed' && (
            <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
              <Play className="w-8 h-8 text-white" />
            </div>
          )}
        </div>

        {/* 信息 */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <h3 className="text-lg font-semibold text-white truncate">{work.title}</h3>
            {getStatusBadge()}
          </div>
          
          <p className="text-white/60 text-sm mt-1 line-clamp-2">
            {work.description || '暂无简介'}
          </p>

          <div className="flex items-center gap-4 mt-2 text-white/40 text-sm">
            <span className="flex items-center gap-1">
              <Heart className="w-4 h-4" />
              {work.likes_count || 0}
            </span>
            <span className="flex items-center gap-1">
              <MessageCircle className="w-4 h-4" />
              {work.comments_count || 0}
            </span>
            <span className="flex items-center gap-1">
              <Clock className="w-4 h-4" />
              {new Date(work.created_at || work.createdAt).toLocaleDateString()}
            </span>
          </div>
        </div>

        {/* 操作按钮 */}
        <div className="flex flex-col gap-2">
          {work.status === 'failed' && (
            <Button
              onClick={handleRetry}
              disabled={isRetrying}
              size="sm"
              variant="ghost"
              className="text-yellow-400 hover:text-yellow-300"
              title="重试生成"
            >
              {isRetrying ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <RotateCcw className="w-4 h-4" />
              )}
            </Button>
          )}
          
          <Button
            onClick={handleDelete}
            disabled={isDeleting}
            size="sm"
            variant="ghost"
            className="text-red-400 hover:text-red-300"
            title="删除作品"
          >
            {isDeleting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Trash2 className="w-4 h-4" />
            )}
          </Button>
        </div>
      </div>
    </motion.div>
  );
}