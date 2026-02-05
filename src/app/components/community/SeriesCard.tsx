import { motion } from 'motion/react';
import { Play, Heart, MessageCircle, Share2, Film, CheckCircle, Clock, PlayCircle } from 'lucide-react';
import { formatNumber } from '@/app/utils/formatters';
import { useState } from 'react';
import type { CommunitySeriesWork } from '@/app/types';

interface SeriesCardProps {
  series: CommunitySeriesWork;
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

export function SeriesCard({
  series,
  interactions,
  onCardClick,
  onLike,
  onComment,
  onShare,
}: SeriesCardProps) {
  const [imageLoadFailed, setImageLoadFailed] = useState(false);

  // 计算完成度
  const completionPercentage = series.totalEpisodes > 0 
    ? Math.round((series.completedEpisodes / series.totalEpisodes) * 100) 
    : 0;

  // 继续观看信息
  const { continueWatching } = series;
  const showContinueWatching = continueWatching && continueWatching.episodeNumber > 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -4 }}
      onClick={onCardClick}
      className="group bg-white/5 backdrop-blur-sm rounded-2xl overflow-hidden border border-white/10 hover:border-purple-500/50 transition-all cursor-pointer"
    >
      {/* 封面图 */}
      <div className="relative aspect-video bg-gradient-to-br from-purple-900/20 to-pink-900/20 overflow-hidden">
        {series.coverImage && !imageLoadFailed ? (
          <img
            src={series.coverImage}
            alt={series.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            onError={() => setImageLoadFailed(true)}
          />
        ) : (
          // 使用第一集的缩略图作为封面
          series.episodes && series.episodes.length > 0 && series.episodes[0].thumbnail ? (
            <img
              src={series.episodes[0].thumbnail}
              alt={series.title}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
              onError={() => setImageLoadFailed(true)}
            />
          ) : (
            // 没有封面时显示占位图
            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-purple-800/30 to-pink-800/30">
              <div className="text-center">
                <Film className="w-12 h-12 text-purple-400 mx-auto mb-2" />
                <p className="text-gray-400 text-sm">漫剧系列</p>
              </div>
            </div>
          )
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
        
        {/* 播放按钮 */}
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
          <div className="w-16 h-16 rounded-full bg-white/20 backdrop-blur-xl flex items-center justify-center border border-white/30">
            <Play className="w-8 h-8 text-white ml-1" fill="white" />
          </div>
        </div>

        {/* 漫剧标识 */}
        <div className="absolute top-2 left-2 px-2 py-1 bg-purple-600/80 backdrop-blur-sm rounded-lg text-xs text-white font-medium flex items-center gap-1">
          <Film className="w-3 h-3" />
          漫剧
        </div>

        {/* 集数标签 */}
        <div className="absolute top-2 right-2 px-2 py-1 bg-black/60 backdrop-blur-sm rounded text-xs text-white flex items-center gap-1">
          {series.completedEpisodes}/{series.totalEpisodes}集
        </div>

        {/* 继续观看标签 */}
        {showContinueWatching && (
          <div className="absolute bottom-2 left-2 px-2 py-1 bg-gradient-to-r from-purple-600/90 to-pink-600/90 backdrop-blur-sm rounded-lg text-xs text-white font-medium flex items-center gap-1">
            <PlayCircle className="w-3 h-3" />
            继续观看第{continueWatching.episodeNumber}集
          </div>
        )}

        {/* 进度条 */}
        {completionPercentage < 100 && (
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/10">
            <div 
              className="h-full bg-gradient-to-r from-purple-500 to-pink-500 transition-all"
              style={{ width: `${completionPercentage}%` }}
            />
          </div>
        )}
      </div>

      {/* 作品信息 */}
      <div className="p-4">
        {/* 标题 */}
        <h3 className="text-white font-medium mb-2 line-clamp-2 text-sm sm:text-base">
          {series.title}
        </h3>

        {/* 类型和风格标签 */}
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <span className="px-2 py-0.5 bg-purple-500/20 text-purple-300 text-xs rounded-full">
            {series.genre}
          </span>
          <span className="px-2 py-0.5 bg-pink-500/20 text-pink-300 text-xs rounded-full">
            {series.style}
          </span>
        </div>

        {/* 状态指示 */}
        <div className="flex items-center gap-2 mb-3 text-xs">
          {completionPercentage === 100 ? (
            <div className="flex items-center gap-1 text-green-400">
              <CheckCircle className="w-4 h-4" />
              <span>已完结</span>
            </div>
          ) : (
            <div className="flex items-center gap-1 text-yellow-400">
              <Clock className="w-4 h-4" />
              <span>更新中 ({completionPercentage}%)</span>
            </div>
          )}
        </div>

        {/* 作者信息 */}
        <div className="flex items-center gap-2 mb-3">
          <div className="w-6 h-6 rounded-full bg-gradient-to-br from-purple-400 to-pink-400 flex items-center justify-center text-white text-xs font-bold">
            {series.user_nickname ? series.user_nickname[0] : '匿'}
          </div>
          <span className="text-sm text-gray-400">
            {series.user_nickname || '匿名用户'}
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