import { Search } from 'lucide-react';

interface SeriesSearchBarProps {
  searchTerm: string;
  onSearchChange: (value: string) => void;
  filterStatus: 'all' | 'draft' | 'in-progress' | 'completed';
  onFilterChange: (status: 'all' | 'draft' | 'in-progress' | 'completed') => void;
  resultCount: number;
}

export function SeriesSearchBar({
  searchTerm,
  onSearchChange,
  filterStatus,
  onFilterChange,
  resultCount,
}: SeriesSearchBarProps) {
  const filterButtons = [
    { value: 'all' as const, label: '全部' },
    { value: 'draft' as const, label: '草稿' },
    { value: 'in-progress' as const, label: '创作中' },
    { value: 'completed' as const, label: '已完成' },
  ];

  return (
    <div className="bg-white/5 backdrop-blur-xl rounded-2xl p-4 border border-white/10">
      <div className="flex flex-col md:flex-row gap-4">
        {/* 搜索框 */}
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="搜索漫剧标题或简介..."
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500/50"
          />
        </div>

        {/* 状态筛选 */}
        <div className="flex gap-2">
          {filterButtons.map(({ value, label }) => (
            <button
              key={value}
              onClick={() => onFilterChange(value)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                filterStatus === value
                  ? 'bg-purple-500 text-white'
                  : 'bg-white/5 text-gray-400 hover:bg-white/10'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* 结果统计 */}
      <div className="mt-3 text-sm text-gray-400">
        共找到 <span className="text-purple-400 font-semibold">{resultCount}</span> 部漫剧
      </div>
    </div>
  );
}
