// Profile子组件 - 统计数据展示
import { motion } from 'motion/react';
import { Play, Heart, Eye } from 'lucide-react';

interface ProfileStatsProps {
  totalWorks: number;
  totalLikes: number;
  totalViews: number;
}

export function ProfileStats({ totalWorks, totalLikes, totalViews }: ProfileStatsProps) {
  const stats = [
    { label: '作品', value: totalWorks, icon: Play, gradient: 'from-blue-500 to-cyan-500' },
    { label: '获赞', value: totalLikes, icon: Heart, gradient: 'from-pink-500 to-rose-500' },
    { label: '观看', value: totalViews, icon: Eye, gradient: 'from-purple-500 to-indigo-500' },
  ];

  return (
    <div className="grid grid-cols-3 gap-4">
      {stats.map((stat, index) => (
        <motion.div
          key={stat.label}
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: index * 0.1 }}
          className="bg-white/5 rounded-xl p-4 backdrop-blur-sm border border-white/10 hover:bg-white/10 transition-colors"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-white/60 text-sm">{stat.label}</p>
              <p className="text-2xl font-bold text-white mt-1">
                {stat.value}
              </p>
            </div>
            <div className={`w-12 h-12 rounded-full bg-gradient-to-br ${stat.gradient} flex items-center justify-center`}>
              <stat.icon className="w-6 h-6 text-white" />
            </div>
          </div>
        </motion.div>
      ))}
    </div>
  );
}
