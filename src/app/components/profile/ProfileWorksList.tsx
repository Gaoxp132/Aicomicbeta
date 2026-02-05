// Profile子组件 - 作品列表
import { motion } from 'motion/react';
import { Loader2, RefreshCw, WifiOff } from 'lucide-react';
import { Button } from '../ui/button';
import { ProfileWorkItem } from './ProfileWorkItem';
import type { Comic } from '../../types/index';

interface ProfileWorksListProps {
  works: any[];
  isLoading: boolean;
  hasMore: boolean;
  isLoadingMore: boolean;
  isOffline?: boolean; // 🔥 v4.2.66: 新增离线状态
  onSelectWork: (work: any, worksList?: any[]) => void;
  onLoadMore: () => void;
  onRefresh: () => void;
}

export function ProfileWorksList({
  works,
  isLoading,
  hasMore,
  isLoadingMore,
  isOffline = false,
  onSelectWork,
  onLoadMore,
  onRefresh,
}: ProfileWorksListProps) {
  if (isLoading && works.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <Loader2 className="w-12 h-12 text-purple-500 animate-spin mb-4" />
        <p className="text-white/60">加载作品中...</p>
      </div>
    );
  }

  // 🔥 v4.2.66: 离线模式提示
  if (isOffline && works.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center py-20 px-6"
      >
        <div className="w-24 h-24 rounded-full bg-red-500/10 flex items-center justify-center mx-auto mb-6">
          <WifiOff className="w-12 h-12 text-red-500" />
        </div>
        <h3 className="text-2xl font-bold text-white mb-3">无法连接到服务器</h3>
        <p className="text-white/60 mb-6 max-w-md mx-auto">
          服务器暂时无法访问，可能是网络问题或服务器维护中。请稍后重试。
        </p>
        <Button
          onClick={onRefresh}
          variant="outline"
          className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 border-0"
        >
          <RefreshCw className="w-4 h-4 mr-2" />
          重试连接
        </Button>
        <div className="mt-8 p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-lg max-w-md mx-auto">
          <p className="text-yellow-400 text-sm">
            💡 提示：如果问题持续存在，请联系技术支持
          </p>
        </div>
      </motion.div>
    );
  }

  if (works.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="text-center py-20"
      >
        <div className="w-24 h-24 rounded-full bg-white/5 flex items-center justify-center mx-auto mb-4">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
          >
            <RefreshCw className="w-12 h-12 text-white/20" />
          </motion.div>
        </div>
        <p className="text-white/40 text-lg">还没有创作任何作品</p>
        <p className="text-white/30 text-sm mt-2">快去创作你的第一部漫剧吧！</p>
      </motion.div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xl font-semibold text-white">我的作品</h3>
        <Button
          onClick={onRefresh}
          variant="ghost"
          size="sm"
          className="text-white/60 hover:text-white"
        >
          <RefreshCw className="w-4 h-4 mr-2" />
          刷新
        </Button>
      </div>

      {works.map((work, index) => (
        <ProfileWorkItem
          key={work.id || index}
          work={work}
          onPlay={() => onSelectWork(work, works)}
          onRefresh={onRefresh}
        />
      ))}

      {/* 加载更多按钮 */}
      {hasMore && (
        <div className="flex justify-center pt-4">
          <Button
            onClick={onLoadMore}
            disabled={isLoadingMore}
            variant="outline"
            className="border-white/20 text-white hover:bg-white/10"
          >
            {isLoadingMore ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                加载中...
              </>
            ) : (
              '加载更多'
            )}
          </Button>
        </div>
      )}

      {!hasMore && works.length > 0 && (
        <p className="text-center text-white/40 text-sm py-4">
          已显示全部作品
        </p>
      )}
    </div>
  );
}