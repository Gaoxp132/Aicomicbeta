import { motion } from 'motion/react';
import { Users, Film } from 'lucide-react';

export type CategoryType = 'all' | 'series' | 'anime' | 'cyberpunk' | 'fantasy' | 'realistic' | 'cartoon' | 'comic';

const categories = [
  { id: 'all' as const, name: '全部', icon: Users },
  { id: 'series' as const, name: '漫剧系列', icon: Film },
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