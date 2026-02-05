import { motion } from 'motion/react';
import { Search, TrendingUp, Clock, X } from 'lucide-react';
import { Input } from '../ui/input';

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
        <h2 className="text-xl sm:text-2xl font-bold text-white">社区作品</h2>
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