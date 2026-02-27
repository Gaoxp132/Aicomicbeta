/**
 * Community widget components — merged to reduce module count
 * v6.0.68: Merged CategoryFilter.tsx + CommunityHeader.tsx + WorkCard.tsx + SeriesCard.tsx
 * Saves 3 modules (4→1). All consumed only by CommunityPanel.tsx.
 */

import { motion } from 'motion/react';
import { useState, useEffect, useRef } from 'react';
import {
  Users, Film, Search, TrendingUp, Clock, X,
  Play, Heart, MessageCircle, Share2, CheckCircle, PlayCircle,
} from 'lucide-react';
import { Input } from '../ui';
import { formatNumber } from '../../utils';
import type { CommunitySeriesWork } from '../../types';

// ═══════════════════════════════════════════════════════════════════
// CategoryFilter (was CategoryFilter.tsx)
// ═══════════════════════════════════════════════════════════════════

export type CategoryType = 'all' | 'series' | 'anime' | 'cyberpunk' | 'fantasy' | 'realistic' | 'cartoon' | 'comic';

const categories = [
  { id: 'all' as const, name: '全部', icon: Users },
  { id: 'series' as const, name: '漫剧列', icon: Film },
  { id: 'anime' as const, name: '日系动漫', icon: Users },
  { id: 'cyberpunk' as const, name: '赛博朋克', icon: Users },
  { id: 'fantasy' as const, name: '奇幻魔法', icon: Users },
  { id: 'realistic' as const, name: '真实写实', icon: Users },
  { id: 'cartoon' as const, name: '卡通动画', icon: Users },
  { id: 'comic' as const, name: '漫画分镜', icon: Users },
];

interface CategoryFilterProps {
  selectedCategory: CategoryType;
  onCategoryChange: (category: CategoryType) => void;
}

export function CategoryFilter({ selectedCategory, onCategoryChange }: CategoryFilterProps) {
  return (
    <div className="overflow-x-auto scrollbar-hide">
      <div className="flex gap-2 min-w-max">
        {categories.map((cat) => {
          const Icon = cat.icon;
          return (
            <motion.button
              key={cat.id}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => onCategoryChange(cat.id)}
              className={`px-4 py-2 rounded-full text-sm font-medium transition-all whitespace-nowrap ${
                selectedCategory === cat.id
                  ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white shadow-lg'
                  : 'bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white'
              }`}
            >
              <Icon className="w-4 h-4 inline mr-1.5" />
              {cat.name}
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// CommunityHeader (was CommunityHeader.tsx)
// ═══════════════════════════════════════════════════════════════════

export type SortType = 'latest' | 'popular';

interface CommunityHeaderProps {
  sortBy: SortType;
  onSortChange: (sort: SortType) => void;
  showSearch: boolean;
  onShowSearchToggle: () => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
}

export function CommunityHeader({
  sortBy,
  onSortChange,
  showSearch,
  onShowSearchToggle,
  searchQuery,
  onSearchChange,
}: CommunityHeaderProps) {
  return (
    <div className="sticky top-16 sm:top-20 z-10 bg-gradient-to-br from-slate-950/90 via-purple-950/90 to-slate-950/90 backdrop-blur-xl border-b border-white/10 -mx-4 px-4 pb-4">
      {/* 标题和操作栏 */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl sm:text-2xl font-bold text-white">发现好作品</h2>
        <div className="flex items-center gap-2">
          {/* 搜索按钮 */}
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={onShowSearchToggle}
            className={`p-2 rounded-full transition-all ${
              showSearch
                ? 'bg-purple-500 text-white'
                : 'bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white'
            }`}
          >
            {showSearch ? <X className="w-5 h-5" /> : <Search className="w-5 h-5" />}
          </motion.button>

          {/* 排序按钮 */}
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => onSortChange(sortBy === 'latest' ? 'popular' : 'latest')}
            className="flex items-center gap-1.5 px-3 py-2 bg-white/5 hover:bg-white/10 rounded-full text-sm text-gray-400 hover:text-white transition-all"
          >
            {sortBy === 'latest' ? (
              <>
                <Clock className="w-4 h-4" />
                <span className="hidden sm:inline">最新</span>
              </>
            ) : (
              <>
                <TrendingUp className="w-4 h-4" />
                <span className="hidden sm:inline">热门</span>
              </>
            )}
          </motion.button>
        </div>
      </div>

      {/* 搜索框 */}
      {showSearch && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          className="mb-4"
        >
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
            <Input
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="搜索作品标题或描述..."
              className="pl-10 bg-white/5 border-white/10 text-white placeholder:text-gray-500"
            />
          </div>
        </motion.div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// WorkCard (was WorkCard.tsx)
// ═══════════════════════════════════════════════════════════════════

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

// v6.0.19: 检查URL是否为有效的图片/缩略图URL（非视频URL）
function isImageUrl(url: string): boolean {
  if (!url) return false;
  if (url.includes('.mp4') || url.includes('.webm') || url.includes('.mov')) return false;
  if (url.includes('.png') || url.includes('.jpg') || url.includes('.jpeg') || url.includes('.webp')) return true;
  if (url.includes('aliyuncs.com') && !url.includes('.mp4')) return true;
  return false;
}

function isVideoExpired(videoUrl: string): boolean {
  if (!videoUrl) return false;
  if (videoUrl.includes('aliyuncs.com') || videoUrl.includes('oss-')) return false;
  if (videoUrl.includes('volces.com') || videoUrl.includes('tos-cn-beijing')) return true;
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
  const [coverLoadFailed, setCoverLoadFailed] = useState(false);
  const [videoLoadFailed, setVideoLoadFailed] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  const thumbnailUrl = work.thumbnail && isImageUrl(work.thumbnail) ? work.thumbnail : null;
  const videoUrl = work.video_url || work.videoUrl;

  useEffect(() => {
    if (videoUrl && isVideoExpired(videoUrl) && !thumbnailUrl) {
      setVideoLoadFailed(true);
    }
  }, [videoUrl, thumbnailUrl]);

  if (!thumbnailUrl && videoLoadFailed) {
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
      <div className="relative aspect-[3/4] sm:aspect-video bg-gradient-to-br from-purple-900/20 to-pink-900/20 overflow-hidden">
        {thumbnailUrl && !coverLoadFailed ? (
          <img
            src={thumbnailUrl}
            alt={work.title || ''}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            loading="lazy"
            onError={() => setCoverLoadFailed(true)}
          />
        ) : videoUrl && !videoLoadFailed ? (
          <video
            ref={videoRef}
            src={videoUrl}
            preload="metadata"
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            onError={() => setVideoLoadFailed(true)}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-purple-800/30 to-pink-800/30">
            <div className="text-center">
              <Play className="w-8 h-8 sm:w-12 sm:h-12 text-purple-400 mx-auto mb-1" />
              <p className="text-gray-400 text-xs sm:text-sm">视频</p>
            </div>
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />

        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
          <div className="w-10 h-10 sm:w-14 sm:h-14 rounded-full bg-white/20 backdrop-blur-xl flex items-center justify-center border border-white/30">
            <Play className="w-5 h-5 sm:w-7 sm:h-7 text-white ml-0.5" fill="white" />
          </div>
        </div>

        {work.duration && (
          <div className="absolute bottom-1.5 right-1.5 px-1.5 py-0.5 bg-black/60 backdrop-blur-sm rounded text-[10px] sm:text-xs text-white">
            {work.duration}s
          </div>
        )}
      </div>

      <div className="p-2.5 sm:p-4">
        <h3 className="text-white font-medium mb-1.5 sm:mb-2 line-clamp-2 text-xs sm:text-sm leading-tight">
          {work.title || work.prompt?.slice(0, 50) + '...'}
        </h3>

        <div className="flex items-center gap-1.5 mb-2 sm:mb-3">
          <div className="w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-gradient-to-br from-purple-400 to-pink-400 flex items-center justify-center text-white text-[10px] sm:text-xs font-bold shrink-0">
            {work.user_nickname ? work.user_nickname[0] : (work.username ? work.username[0] : '匿')}
          </div>
          <span className="text-xs sm:text-sm text-gray-400 truncate">
            {work.user_nickname || work.username || '匿名用户'}
          </span>
        </div>

        <div className="flex items-center gap-3 sm:gap-4 text-xs sm:text-sm text-gray-400">
          <button
            onClick={onLike}
            className={`flex items-center gap-1 hover:text-pink-400 transition-colors ${
              interactions.isLiked ? 'text-pink-400' : ''
            }`}
          >
            <Heart
              className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${interactions.isLiked ? 'fill-pink-400' : ''}`}
            />
            <span>{formatNumber(interactions.likes)}</span>
          </button>

          <button
            onClick={onComment}
            className="flex items-center gap-1 hover:text-blue-400 transition-colors"
          >
            <MessageCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            <span>{formatNumber(interactions.comments)}</span>
          </button>

          <button
            onClick={onShare}
            className="flex items-center gap-1 hover:text-green-400 transition-colors"
          >
            <Share2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            <span>{formatNumber(interactions.shares)}</span>
          </button>
        </div>
      </div>
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// SeriesCard (was SeriesCard.tsx)
// ═══════════════════════════════════════════════════════════════════

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

  const completionPercentage = series.totalEpisodes > 0
    ? Math.round((series.completedEpisodes / series.totalEpisodes) * 100)
    : 0;
  const isCompleted = series.completedEpisodes >= series.totalEpisodes && series.totalEpisodes > 0;
  const displayPercentage = isCompleted ? 100 : completionPercentage;

  const { continueWatching } = series;
  const showContinueWatching = continueWatching && continueWatching.episodeNumber > 0;

  const coverSrc = series.coverImage && !imageLoadFailed
    ? series.coverImage
    : (series.episodes && series.episodes.length > 0 && series.episodes[0].thumbnail && !imageLoadFailed)
      ? series.episodes[0].thumbnail
      : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -4 }}
      onClick={onCardClick}
      className="group bg-white/5 backdrop-blur-sm rounded-2xl overflow-hidden border border-white/10 hover:border-purple-500/50 transition-all cursor-pointer"
    >
      <div className="relative aspect-[3/4] sm:aspect-video bg-gradient-to-br from-purple-900/20 to-pink-900/20 overflow-hidden">
        {coverSrc ? (
          <img
            src={coverSrc}
            alt={series.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            loading="lazy"
            onError={() => setImageLoadFailed(true)}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-purple-800/30 to-pink-800/30">
            <div className="text-center">
              <Film className="w-8 h-8 sm:w-12 sm:h-12 text-purple-400 mx-auto mb-1 sm:mb-2" />
              <p className="text-gray-400 text-xs sm:text-sm">漫剧系列</p>
            </div>
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />

        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
          <div className="w-10 h-10 sm:w-14 sm:h-14 rounded-full bg-white/20 backdrop-blur-xl flex items-center justify-center border border-white/30">
            <Play className="w-5 h-5 sm:w-7 sm:h-7 text-white ml-0.5" fill="white" />
          </div>
        </div>

        <div className="absolute top-1.5 left-1.5 sm:top-2 sm:left-2 px-1.5 sm:px-2 py-0.5 sm:py-1 bg-purple-600/80 backdrop-blur-sm rounded-lg text-[10px] sm:text-xs text-white font-medium flex items-center gap-0.5 sm:gap-1">
          <Film className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
          漫剧
        </div>

        <div className="absolute top-1.5 right-1.5 sm:top-2 sm:right-2 px-1.5 sm:px-2 py-0.5 sm:py-1 bg-black/60 backdrop-blur-sm rounded text-[10px] sm:text-xs text-white flex items-center gap-0.5">
          {series.completedEpisodes}/{series.totalEpisodes}集
        </div>

        <div className="absolute bottom-0 left-0 right-0 p-2 sm:hidden">
          <h3 className="text-white font-semibold text-xs leading-tight line-clamp-2 drop-shadow-lg">
            {series.title}
          </h3>
          <div className="flex items-center gap-1.5 mt-1">
            {series.genre && (
              <span className="px-1.5 py-0.5 bg-purple-500/30 text-purple-200 text-[10px] rounded-full backdrop-blur-sm">
                {series.genre}
              </span>
            )}
            {isCompleted || displayPercentage === 100 ? (
              <span className="flex items-center gap-0.5 text-green-400 text-[10px]">
                <CheckCircle className="w-2.5 h-2.5" />
                完结
              </span>
            ) : (
              <span className="flex items-center gap-0.5 text-yellow-400 text-[10px]">
                <Clock className="w-2.5 h-2.5" />
                更新中
              </span>
            )}
          </div>
        </div>

        {showContinueWatching && (
          <div className="absolute bottom-6 sm:bottom-2 left-1.5 sm:left-2 px-1.5 sm:px-2 py-0.5 sm:py-1 bg-gradient-to-r from-purple-600/90 to-pink-600/90 backdrop-blur-sm rounded-lg text-[10px] sm:text-xs text-white font-medium flex items-center gap-0.5 sm:gap-1">
            <PlayCircle className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
            续看第{continueWatching.episodeNumber}集
          </div>
        )}

        {displayPercentage < 100 && (
          <div className="absolute bottom-0 left-0 right-0 h-0.5 sm:h-1 bg-white/10">
            <div
              className="h-full bg-gradient-to-r from-purple-500 to-pink-500 transition-all"
              style={{ width: `${displayPercentage}%` }}
            />
          </div>
        )}
      </div>

      <div className="p-2 sm:p-4">
        <h3 className="hidden sm:block text-white font-medium mb-2 line-clamp-2 text-sm sm:text-base">
          {series.title}
        </h3>

        <div className="hidden sm:flex items-center gap-2 mb-3 flex-wrap">
          {series.genre && (
            <span className="px-2 py-0.5 bg-purple-500/20 text-purple-300 text-xs rounded-full">
              {series.genre}
            </span>
          )}
          {series.style && (
            <span className="px-2 py-0.5 bg-pink-500/20 text-pink-300 text-xs rounded-full">
              {series.style}
            </span>
          )}
        </div>

        <div className="hidden sm:flex items-center gap-2 mb-3 text-xs">
          {isCompleted || displayPercentage === 100 ? (
            <div className="flex items-center gap-1 text-green-400">
              <CheckCircle className="w-4 h-4" />
              <span>已完结</span>
            </div>
          ) : (
            <div className="flex items-center gap-1 text-yellow-400">
              <Clock className="w-4 h-4" />
              <span>更新中 ({displayPercentage}%)</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2 mb-1.5 sm:mb-3">
          <div className="w-4 h-4 sm:w-6 sm:h-6 rounded-full bg-gradient-to-br from-purple-400 to-pink-400 flex items-center justify-center text-white text-[9px] sm:text-xs font-bold shrink-0">
            {series.user_nickname ? series.user_nickname[0] : '匿'}
          </div>
          <span className="text-[11px] sm:text-sm text-gray-400 truncate">
            {series.user_nickname || '匿名用户'}
          </span>
        </div>

        <div className="flex items-center gap-2.5 sm:gap-4 text-[11px] sm:text-sm text-gray-400">
          <button
            onClick={onLike}
            className={`flex items-center gap-0.5 sm:gap-1 hover:text-pink-400 transition-colors ${
              interactions.isLiked ? 'text-pink-400' : ''
            }`}
          >
            <Heart
              className={`w-3 h-3 sm:w-4 sm:h-4 ${interactions.isLiked ? 'fill-pink-400' : ''}`}
            />
            <span>{formatNumber(interactions.likes)}</span>
          </button>

          <button
            onClick={onComment}
            className="flex items-center gap-0.5 sm:gap-1 hover:text-blue-400 transition-colors"
          >
            <MessageCircle className="w-3 h-3 sm:w-4 sm:h-4" />
            <span>{formatNumber(interactions.comments)}</span>
          </button>

          <button
            onClick={onShare}
            className="flex items-center gap-0.5 sm:gap-1 hover:text-green-400 transition-colors"
          >
            <Share2 className="w-3 h-3 sm:w-4 sm:h-4" />
            <span>{formatNumber(interactions.shares)}</span>
          </button>
        </div>
      </div>
    </motion.div>
  );
}