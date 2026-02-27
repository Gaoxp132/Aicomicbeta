/**
 * InteractionBar component - Like, comment, share, download buttons
 * Split from consolidated immersive/index.tsx (v6.0.67)
 */

import { Heart, MessageCircle, Share2, Download } from 'lucide-react';
import { formatNumber } from '../../utils';

interface InteractionBarProps {
  isLiked: boolean;
  likes: number;
  commentsCount: number;
  onLike: () => void;
  onComment: () => void;
  onShare: () => void;
  onDownload: () => void;
}

export function InteractionBar({ isLiked, likes, commentsCount, onLike, onComment, onShare, onDownload }: InteractionBarProps) {
  return (
    <div className="flex flex-col gap-4">
      <button onClick={onLike} className="flex flex-col items-center gap-1 group">
        <div className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${isLiked ? 'bg-pink-500 text-white' : 'bg-black/30 backdrop-blur-sm text-white hover:bg-pink-500/80'}`}>
          <Heart className={`w-6 h-6 transition-all group-hover:scale-110 ${isLiked ? 'fill-white' : ''}`} />
        </div>
        <span className="text-sm text-white font-medium">{formatNumber(likes)}</span>
      </button>
      <button onClick={onComment} className="flex flex-col items-center gap-1 group">
        <div className="w-12 h-12 rounded-full bg-black/30 backdrop-blur-sm flex items-center justify-center text-white hover:bg-blue-500/80 transition-all">
          <MessageCircle className="w-6 h-6 group-hover:scale-110 transition-all" />
        </div>
        <span className="text-sm text-white font-medium">{formatNumber(commentsCount)}</span>
      </button>
      <button onClick={onShare} className="flex flex-col items-center gap-1 group">
        <div className="w-12 h-12 rounded-full bg-black/30 backdrop-blur-sm flex items-center justify-center text-white hover:bg-green-500/80 transition-all">
          <Share2 className="w-6 h-6 group-hover:scale-110 transition-all" />
        </div>
        <span className="text-sm text-white font-medium">分享</span>
      </button>
      <button onClick={onDownload} className="flex flex-col items-center gap-1 group">
        <div className="w-12 h-12 rounded-full bg-black/30 backdrop-blur-sm flex items-center justify-center text-white hover:bg-purple-500/80 transition-all">
          <Download className="w-6 h-6 group-hover:scale-110 transition-all" />
        </div>
        <span className="text-sm text-white font-medium">下载</span>
      </button>
    </div>
  );
}
