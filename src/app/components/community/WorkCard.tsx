import { motion } from 'motion/react';
import { Play, Heart, MessageCircle, Share2 } from 'lucide-react';
import { formatNumber } from '../../utils/formatters';
import { useState, useEffect } from 'react';

interface WorkCardProps {
  work: any;
  interactions: {
    likes: number;
    shares: number;
    comments: number;
    isLiked: boolean;
  };
  onCardClick: () => void;
  onLike: (e: React.MouseEvent) => void;
  onComment: (e: React.MouseEvent) => void;
  onShare: (e: React.MouseEvent) => void;
}

// 🔧 检查视频URL是否已过期
function isVideoExpired(videoUrl: string): boolean {
  if (!videoUrl) return false;
  
  // OSS URL永久有效
  if (videoUrl.includes('aliyuncs.com') || videoUrl.includes('oss-')) {
    return false;
  }
  
  // 火山引擎临时URL（24小时过期）
  if (videoUrl.includes('volces.com') || videoUrl.includes('tos-cn-beijing')) {
    return true;
  }
  
  return false;
}

export function WorkCard({
  work,
  interactions,
  onCardClick,
  onLike,
  onComment,
  onShare,
}: WorkCardProps) {
  const [videoLoadFailed, setVideoLoadFailed] = useState(false);
  
  // 🔧 在渲染前检查视频是否过期
  useEffect(() => {
    if (work.video_url && isVideoExpired(work.video_url)) {
      // 静默过滤过期视频，不显示错误日志
      setVideoLoadFailed(true);
    }
  }, [work.video_url]);
  
  // 🔧 如果视频加载失败或已过期，返回null（不是Fragment）以保持React key的正确性
  if (videoLoadFailed) {
    return null;
  }
  
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -4 }}
      onClick={onCardClick}
      className="group bg-white/5 backdrop-blur-sm rounded-2xl overflow-hidden border border-white/10 hover:border-purple-500/50 transition-all cursor-pointer"
    >
      {/* 视频封面 */}
      <div className="relative aspect-video bg-gradient-to-br from-purple-900/20 to-pink-900/20 overflow-hidden">
        {work.video_url ? (
          <video
            src={work.video_url}
            preload="metadata"
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            onError={(e) => {
              // 🔧 静默处理视频加载失败（可能是网络问题或临时URL）
              // 只在非火山引擎URL时记录错误
              if (!isVideoExpired(work.video_url)) {
                console.warn(`[WorkCard] Video loading error for ${work.title?.substring(0, 40)}...`);
              }
              // 标记为加载失败，组件将自动隐藏
              setVideoLoadFailed(true);
            }}
          />
        ) : (
          // 没有视频URL时显示占位图
          <div className="w-full h-full flex items-center justify-center bg-gray-700">
            <div className="text-center">
              <Play className="w-12 h-12 text-gray-400 mx-auto mb-2" />
              <p className="text-gray-400 text-sm">视频封面</p>
            </div>
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
        
        {/* 播放按钮 */}
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
          <div className="w-16 h-16 rounded-full bg-white/20 backdrop-blur-xl flex items-center justify-center border border-white/30">
            <Play className="w-8 h-8 text-white ml-1" fill="white" />
          </div>
        </div>

        {/* 时长标签 */}
        {work.duration && (
          <div className="absolute bottom-2 right-2 px-2 py-1 bg-black/60 backdrop-blur-sm rounded text-xs text-white">
            {work.duration}
          </div>
        )}
      </div>

      {/* 作品信息 */}
      <div className="p-4">
        {/* 标题 */}
        <h3 className="text-white font-medium mb-2 line-clamp-2 text-sm sm:text-base">
          {work.title || work.prompt?.slice(0, 50) + '...'}
        </h3>

        {/* 作者信息 */}
        <div className="flex items-center gap-2 mb-3">
          <div className="w-6 h-6 rounded-full bg-gradient-to-br from-purple-400 to-pink-400 flex items-center justify-center text-white text-xs font-bold">
            {work.user_nickname ? work.user_nickname[0] : (work.user?.nickname ? work.user.nickname[0] : '匿')}
          </div>
          <span className="text-sm text-gray-400">
            {work.user_nickname || work.user?.nickname || '匿名用户'}
          </span>
        </div>

        {/* 互动数据 */}
        <div className="flex items-center gap-4 text-sm text-gray-400">
          <button
            onClick={onLike}
            className={`flex items-center gap-1 hover:text-pink-400 transition-colors ${
              interactions.isLiked ? 'text-pink-400' : ''
            }`}
          >
            <Heart
              className={`w-4 h-4 ${interactions.isLiked ? 'fill-pink-400' : ''}`}
            />
            <span>{formatNumber(interactions.likes)}</span>
          </button>
          
          <button
            onClick={onComment}
            className="flex items-center gap-1 hover:text-blue-400 transition-colors"
          >
            <MessageCircle className="w-4 h-4" />
            <span>{formatNumber(interactions.comments)}</span>
          </button>
          
          <button
            onClick={onShare}
            className="flex items-center gap-1 hover:text-green-400 transition-colors"
          >
            <Share2 className="w-4 h-4" />
            <span>{formatNumber(interactions.shares)}</span>
          </button>
        </div>
      </div>
    </motion.div>
  );
}