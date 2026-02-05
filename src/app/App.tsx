import React, { useState, useEffect } from 'react';
import { AnimatePresence } from 'motion/react';
import { Header } from './components/Header';
import { GeneratePanel } from './components/GeneratePanel';
import { SeriesCreationPanel } from './components/SeriesCreationPanel';
import { CommunityPanel } from './components/CommunityPanel';
import { ProfilePanel } from './components/ProfilePanel';
import { ImmersiveVideoViewer } from './components/ImmersiveVideoViewer';
import { TaskStatusButton } from './components/TaskStatusButton';
import { TaskStatusFloating } from './components/TaskStatusFloating';
import { MobileBottomBar } from './components/MobileBottomBar';
import { LoginDialog } from './components/LoginDialog';
import { SettingsDialog } from './components/SettingsDialog';
import { EdgeFunctionError } from './components/EdgeFunctionError';
import { ServerLoadingIndicator } from './components/ServerLoadingIndicator';
import { Toaster } from './components/ui/sonner';
import { useAuth } from './hooks/useAuth';
import { useVideoGeneration } from './hooks/useVideoGeneration';
import { useEdgeFunctionStatus } from './hooks/useEdgeFunctionStatus';
import { initializeAllOptimizations, trackPageView } from './utils';
import { APP_VERSION } from './version';
import './utils/oauth-tools'; // 🔧 加载 OAuth 调试工具
import type { Comic } from './types/index';

export type { Comic };

export default function App() {
  // 输出版本信息用于调试
  console.log(`[App] 🚀 Version: ${APP_VERSION}`);
  console.log('[App] ✅ Application initialized successfully');

  // 启动时检查并初始化所有优化
  useEffect(() => {
    console.log('[App] ✅ All modules loaded successfully');
    console.log('[App] 📱 Starting AI漫剧创作应用...');
    
    // 初始化所有优化
    initializeAllOptimizations();
    
    // 追踪页面访问
    trackPageView(window.location.pathname, document.title);
  }, []);

  const [selectedComic, setSelectedComic] = useState<Comic | null>(null);
  const [allComics, setAllComics] = useState<Comic[]>([]);
  const [activeTab, setActiveTab] = useState<'create' | 'series' | 'community' | 'profile'>('community');
  const [showTaskStatus, setShowTaskStatus] = useState(false);
  const [showSettingsDialog, setShowSettingsDialog] = useState(false);

  const { userPhone, showLoginDialog, setShowLoginDialog, handleLoginSuccess, handleLogout } = useAuth();
  const { comics, activeTasks, handleGenerate } = useVideoGeneration(userPhone);
  const { isConnected, isChecking, showError, dismissError } = useEdgeFunctionStatus();

  const handleLoginClick = () => {
    if (userPhone) {
      setShowSettingsDialog(true);
    } else {
      setShowLoginDialog(true);
    }
  };

  const handleSelectComic = (comic: Comic, comicsList?: Comic[]) => {
    console.log('[App] handleSelectComic called');
    console.log('[App] Selected comic:', comic.id, comic.title);
    console.log('[App] Comics list:', comicsList?.length || 0, 'items');
    
    setSelectedComic(comic);
    if (comicsList && comicsList.length > 0) {
      console.log('[App] Setting allComics to:', comicsList.length, 'items');
      console.log('[App] Comics IDs:', comicsList.map(c => c.id));
      setAllComics(comicsList);
    } else {
      console.warn('[App] ⚠️ No comics list provided or empty list');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-purple-950 to-slate-950">
      {/* 背景装饰 */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 -left-48 w-96 h-96 bg-purple-500/20 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 -right-48 w-96 h-96 bg-blue-500/20 rounded-full blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-pink-500/10 rounded-full blur-3xl" />
      </div>

      <div className="relative z-10">
        <Header 
          activeTab={activeTab} 
          onTabChange={setActiveTab}
          userPhone={userPhone}
          onLoginClick={handleLoginClick}
          onSettingsClick={() => setShowSettingsDialog(true)}
        />
        
        <div className="h-16 sm:h-20" />
        
        <main className="container mx-auto px-4 py-6 lg:py-8 pb-24 lg:pb-8">
          {activeTab === 'create' && <GeneratePanel onGenerate={handleGenerate} activeTasks={activeTasks} />}
          {activeTab === 'series' && <SeriesCreationPanel userPhone={userPhone} />}
          {activeTab === 'community' && <CommunityPanel onSelectComic={handleSelectComic} userPhone={userPhone} />}
          {activeTab === 'profile' && userPhone && <ProfilePanel userPhone={userPhone} onSelectComic={handleSelectComic} onLogout={handleLogout} />}
        </main>
      </div>

      {/* 全屏沉浸式视频查看器 */}
      <AnimatePresence>
        {selectedComic && (
          <ImmersiveVideoViewer
            work={selectedComic}
            allWorks={allComics}
            userPhone={userPhone}
            onClose={() => setSelectedComic(null)}
            onWorkChange={setSelectedComic}
          />
        )}
      </AnimatePresence>
      
      {/* 任务状态按钮 - 仅在创作页面显示 */}
      {activeTab === 'create' && (
        <TaskStatusButton
          activeTasks={activeTasks.length}
          onClick={() => setShowTaskStatus(true)}
        />
      )}
      
      {/* 任务状态浮窗 */}
      {showTaskStatus && (
        <TaskStatusFloating
          tasks={activeTasks}
          onTaskClick={(task) => {
            setSelectedComic(task);
            setShowTaskStatus(false);
          }}
          onClose={() => setShowTaskStatus(false)}
        />
      )}
      
      <MobileBottomBar 
        activeTab={activeTab} 
        onTabChange={setActiveTab}
        userPhone={userPhone}
        onLoginClick={handleLoginClick}
      />
      
      {/* 登录对话框 */}
      <LoginDialog
        isOpen={showLoginDialog}
        onClose={() => setShowLoginDialog(false)}
        onLoginSuccess={handleLoginSuccess}
      />
      
      {/* 设置对话框 */}
      <SettingsDialog
        isOpen={showSettingsDialog}
        onClose={() => setShowSettingsDialog(false)}
        userPhone={userPhone}
        onLogout={handleLogout}
      />
      
      {/* 边缘函数错误提示 */}
      <EdgeFunctionError
        showError={showError}
        dismissError={dismissError}
      />
      
      {/* 服务器加载指示器 */}
      <ServerLoadingIndicator
        isConnected={isConnected}
        isChecking={isChecking}
      />
      
      {/* Toast通知 */}
      <Toaster />
    </div>
  );
}