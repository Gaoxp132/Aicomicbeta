import React from 'react';
import { Sparkles, Users, User, Film, Settings } from 'lucide-react';
import { Button } from './ui/button';
import { APP_VERSION } from '@/app/version.ts'; // 修复：正确的文件扩展名

interface HeaderProps {
  activeTab: 'create' | 'series' | 'community' | 'profile';
  onTabChange: (tab: 'create' | 'series' | 'community' | 'profile') => void;
  userPhone?: string;
  onLoginClick: () => void;
  onSettingsClick: () => void;
}

export function Header({ activeTab, onTabChange, userPhone, onLoginClick, onSettingsClick }: HeaderProps) {
  return (
    <header className="fixed top-0 left-0 right-0 z-40 border-b border-white/10 backdrop-blur-xl bg-black/20">
      <div className="container mx-auto px-3 sm:px-4 py-3 sm:py-4">
        <div className="flex items-center justify-between">
          {/* Logo */}
          <div
            className="flex items-center gap-2 sm:gap-3"
          >
            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl sm:rounded-2xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
              <Sparkles className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
            </div>
            <div>
              <h1 className="text-base sm:text-xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
                AI漫剧创作
              </h1>
              <p className="text-xs text-gray-400 hidden sm:block">
                智能生成，一键分享 
                <span className="ml-2 text-gray-500" title={`版本: ${APP_VERSION}`}>
                  v{APP_VERSION}
                </span>
              </p>
            </div>
          </div>

          {/* 导航标签 - 仅在桌面端显示 */}
          <nav className="hidden lg:flex items-center gap-1 sm:gap-2 bg-white/5 rounded-xl sm:rounded-2xl p-1 backdrop-blur-sm">
            <button
              onClick={() => onTabChange('create')}
              className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg sm:rounded-xl transition-all text-sm sm:text-base ${
                activeTab === 'create'
                  ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white shadow-lg shadow-purple-500/50'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              <span>创作</span>
            </button>
            <button
              onClick={() => onTabChange('series')}
              className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg sm:rounded-xl transition-all text-sm sm:text-base ${
                activeTab === 'series'
                  ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white shadow-lg shadow-purple-500/50'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              <Film className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              <span>系列</span>
            </button>
            <button
              onClick={() => onTabChange('community')}
              className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg sm:rounded-xl transition-all text-sm sm:text-base ${
                activeTab === 'community'
                  ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white shadow-lg shadow-purple-500/50'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              <Users className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              <span>社区</span>
            </button>
            <button
              onClick={() => onTabChange('profile')}
              className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg sm:rounded-xl transition-all text-sm sm:text-base ${
                activeTab === 'profile'
                  ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white shadow-lg shadow-purple-500/50'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              <User className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              <span>我的</span>
            </button>
          </nav>

          {/* 右侧操作区 */}
          <div className="flex items-center gap-2 sm:gap-3">
            {/* 用户信息/登录按钮 */}
            {userPhone ? (
              <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/5 border border-white/10">
                <User className="w-4 h-4 text-purple-400" />
                <span className="text-sm text-white">
                  {userPhone.slice(0, 3)}****{userPhone.slice(-4)}
                </span>
              </div>
            ) : (
              <Button
                onClick={onLoginClick}
                className="hidden sm:flex bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white text-sm"
              >
                <User className="w-4 h-4 mr-1.5" />
                登录
              </Button>
            )}

            {/* 设置按钮 - 仅在个人主页显示 */}
            {activeTab === 'profile' && (
              <Button
                onClick={onSettingsClick}
                variant="outline"
                className="border-white/10 hover:bg-white/10 w-9 h-9 sm:w-10 sm:h-10 p-0"
              >
                <Settings className="w-4 h-4 sm:w-5 sm:h-5 text-gray-400" />
              </Button>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}