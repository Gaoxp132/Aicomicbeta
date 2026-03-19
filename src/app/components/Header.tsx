import React from 'react';
import { Wand2, Users, User, Film, Shield } from 'lucide-react';
import { Button } from './ui';
import { APP_VERSION } from '../version';

interface HeaderProps {
  activeTab: 'create' | 'works' | 'community' | 'profile';
  onTabChange: (tab: 'create' | 'works' | 'community' | 'profile') => void;
  userPhone?: string;
  onLoginClick: () => void;
  onSettingsClick: () => void;
  /** v6.0.96: Only passed for admin account */
  onAdminClick?: () => void;
  /** v6.0.102: Pending payment count for badge */
  pendingPaymentCount?: number;
}

const TABS = [
  { id: 'create' as const, label: '创作', icon: Wand2 },
  { id: 'works' as const, label: '作品', icon: Film },
  { id: 'community' as const, label: '发现', icon: Users },
  { id: 'profile' as const, label: '我的', icon: User },
];

export function Header({ activeTab, onTabChange, userPhone, onLoginClick, onSettingsClick, onAdminClick, pendingPaymentCount = 0 }: HeaderProps) {
  return (
    <header className="fixed top-0 left-0 right-0 z-40 border-b border-white/10 backdrop-blur-xl bg-black/20">
      <div className="container mx-auto px-3 sm:px-4 py-3 sm:py-4">
        <div className="flex items-center justify-between">
          {/* Logo */}
          <button
            onClick={() => onTabChange('create')}
            className="flex items-center gap-2 sm:gap-3 hover:opacity-80 transition-opacity"
          >
            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl sm:rounded-2xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
              <Wand2 className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
            </div>
            <div>
              <h1 className="text-base sm:text-xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
                AI影视
              </h1>
              <p className="text-[10px] text-gray-500 hidden sm:block">
                v{APP_VERSION}
              </p>
            </div>
          </button>

          {/* 导航标签 - 仅在桌面端显示 */}
          <nav className="hidden lg:flex items-center gap-1 bg-white/5 rounded-2xl p-1 backdrop-blur-sm">
            {TABS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => onTabChange(id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all text-sm ${
                  activeTab === id
                    ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white shadow-lg shadow-purple-500/30'
                    : 'text-gray-400 hover:text-white hover:bg-white/5'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{label}</span>
              </button>
            ))}
          </nav>

          {/* 右侧操作区 */}
          <div className="flex items-center gap-2 sm:gap-3">
            {/* v6.0.96+v6.0.102: Admin button with pending payment badge */}
            {onAdminClick && (
              <button
                onClick={onAdminClick}
                title={pendingPaymentCount > 0 ? `管理员面板（${pendingPaymentCount} 笔付款待审核）` : '管理员面板'}
                className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/20 hover:bg-amber-500/20 transition-colors relative"
              >
                <Shield className="w-3.5 h-3.5 text-amber-400" />
                <span className="text-xs text-amber-400 font-medium">管理</span>
                {/* v6.0.102: 待审核付款红色角标 */}
                {pendingPaymentCount > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] flex items-center justify-center bg-red-500 text-white text-[10px] font-bold rounded-full px-1 shadow-lg shadow-red-500/40 animate-pulse">
                    {pendingPaymentCount > 99 ? '99+' : pendingPaymentCount}
                  </span>
                )}
              </button>
            )}

            {userPhone ? (
              <button
                onClick={onSettingsClick}
                className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-colors"
              >
                <div className="w-6 h-6 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
                  <User className="w-3.5 h-3.5 text-white" />
                </div>
                <span className="text-sm text-white">
                  {userPhone.slice(0, 3)}****{userPhone.slice(-4)}
                </span>
              </button>
            ) : (
              <Button
                onClick={onLoginClick}
                className="hidden sm:flex bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white text-sm px-4"
              >
                <User className="w-4 h-4 mr-1.5" />
                登录
              </Button>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}