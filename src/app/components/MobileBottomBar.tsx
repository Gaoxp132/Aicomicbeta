import { motion } from 'motion/react';
import { Sparkles, Users, User, Film } from 'lucide-react';

interface MobileBottomBarProps {
  activeTab: 'create' | 'series' | 'community' | 'profile';
  onTabChange: (tab: 'create' | 'series' | 'community' | 'profile') => void;
  userPhone?: string;
  onLoginClick: () => void;
}

export function MobileBottomBar({ activeTab, onTabChange, userPhone, onLoginClick }: MobileBottomBarProps) {
  return (
    <motion.div
      initial={{ y: 100 }}
      animate={{ y: 0 }}
      className="fixed bottom-0 left-0 right-0 lg:hidden bg-black/95 backdrop-blur-xl border-t border-white/10 z-40"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="flex items-center justify-around py-1.5 px-2">
        <button
          onClick={() => onTabChange('create')}
          className={`flex flex-col items-center gap-0.5 py-2 px-3 rounded-xl transition-all active:scale-95 ${
            activeTab === 'create' ? 'text-white' : 'text-gray-500'
          }`}
        >
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all ${
            activeTab === 'create' 
              ? 'bg-gradient-to-r from-purple-500 to-pink-500 shadow-lg shadow-purple-500/50' 
              : 'bg-white/5'
          }`}>
            <Sparkles className="w-4.5 h-4.5" />
          </div>
          <span className="text-[11px] mt-0.5">创作</span>
        </button>

        <button
          onClick={() => onTabChange('series')}
          className={`flex flex-col items-center gap-0.5 py-2 px-3 rounded-xl transition-all active:scale-95 ${
            activeTab === 'series' ? 'text-white' : 'text-gray-500'
          }`}
        >
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all ${
            activeTab === 'series' 
              ? 'bg-gradient-to-r from-purple-500 to-pink-500 shadow-lg shadow-purple-500/50' 
              : 'bg-white/5'
          }`}>
            <Film className="w-4.5 h-4.5" />
          </div>
          <span className="text-[11px] mt-0.5">系列</span>
        </button>

        <button
          onClick={() => onTabChange('community')}
          className={`flex flex-col items-center gap-0.5 py-2 px-3 rounded-xl transition-all active:scale-95 ${
            activeTab === 'community' ? 'text-white' : 'text-gray-500'
          }`}
        >
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all ${
            activeTab === 'community' 
              ? 'bg-gradient-to-r from-purple-500 to-pink-500 shadow-lg shadow-purple-500/50' 
              : 'bg-white/5'
          }`}>
            <Users className="w-4.5 h-4.5" />
          </div>
          <span className="text-[11px] mt-0.5">社区</span>
        </button>

        <button
          onClick={userPhone ? () => onTabChange('profile') : onLoginClick}
          className={`flex flex-col items-center gap-0.5 py-2 px-3 rounded-xl transition-all active:scale-95 ${
            activeTab === 'profile' ? 'text-white' : 'text-gray-500'
          }`}
        >
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all ${
            activeTab === 'profile'
              ? 'bg-gradient-to-r from-purple-500 to-pink-500 shadow-lg shadow-purple-500/50'
              : userPhone ? 'bg-gradient-to-r from-purple-500 to-pink-500' : 'bg-white/5'
          }`}>
            <User className="w-4.5 h-4.5" />
          </div>
          <span className="text-[11px] mt-0.5">{userPhone ? '我的' : '登录'}</span>
        </button>
      </div>
    </motion.div>
  );
}