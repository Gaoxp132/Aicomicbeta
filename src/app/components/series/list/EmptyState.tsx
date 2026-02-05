import { Film, Search } from 'lucide-react';
import { Button } from '@/app/components/ui/button';

interface EmptyStateProps {
  type: 'no-login' | 'no-series' | 'no-results';
  onCreateNew?: () => void;
  userPhone?: string;
}

export function EmptyState({ type, onCreateNew, userPhone }: EmptyStateProps) {
  if (type === 'no-login') {
    return (
      <div className="bg-white/5 backdrop-blur-xl rounded-3xl p-12 border border-white/10 text-center">
        <Film className="w-16 h-16 text-gray-500 mx-auto mb-4" />
        <h3 className="text-xl font-semibold text-white mb-2">请先登录</h3>
        <p className="text-gray-400">登录后即可创作和管理您的漫剧作品</p>
      </div>
    );
  }

  if (type === 'no-series') {
    return (
      <div className="bg-white/5 backdrop-blur-xl rounded-3xl p-12 border border-white/10 text-center">
        <div className="w-20 h-20 bg-gradient-to-br from-purple-500/20 to-pink-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
          <Film className="w-10 h-10 text-purple-400" />
        </div>
        <h3 className="text-xl font-semibold text-white mb-2">还没有漫剧作品</h3>
        <p className="text-gray-400 mb-6">开始创作您的第一部AI漫剧吧！</p>
        <Button
          onClick={onCreateNew}
          className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600"
        >
          创建新漫剧
        </Button>
      </div>
    );
  }

  if (type === 'no-results') {
    return (
      <div className="bg-white/5 backdrop-blur-xl rounded-3xl p-12 border border-white/10 text-center">
        <Search className="w-16 h-16 text-gray-500 mx-auto mb-4" />
        <h3 className="text-xl font-semibold text-white mb-2">未找到匹配的漫剧</h3>
        <p className="text-gray-400">尝试更改搜索条件或筛选器</p>
      </div>
    );
  }

  return null;
}