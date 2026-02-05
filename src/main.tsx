import React from 'react';
import ReactDOM from 'react-dom/root';
import App from '@/app/App';
import { ErrorBoundary } from '@/app/components/ErrorBoundary';
import '@/styles/fonts.css';
import '@/styles/index.css';

console.log('[Main] 🚀 Initializing AI漫剧创作应用...');
console.log('[Main] 📦 Version: 4.2.10');

// 清理浏览器缓存
if (typeof window !== 'undefined') {
  // 检查版本号，如果不匹配则清理缓存
  const CACHE_VERSION = '4.2.10';
  const cachedVersion = localStorage.getItem('app_version');
  
  if (cachedVersion !== CACHE_VERSION) {
    console.log('[Main] 🧹 Clearing browser cache due to version change...');
    
    // 清理localStorage中的旧数据（保留用户登录信息）
    const userPhone = localStorage.getItem('userPhone');
    const authToken = localStorage.getItem('authToken');
    
    localStorage.clear();
    
    // 恢复用户登录信息
    if (userPhone) localStorage.setItem('userPhone', userPhone);
    if (authToken) localStorage.setItem('authToken', authToken);
    
    // 保存新版本号
    localStorage.setItem('app_version', CACHE_VERSION);
    
    console.log('[Main] ✅ Cache cleared successfully');
  }
}

const root = document.getElementById('root');

if (!root) {
  throw new Error('Root element not found');
}

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);

console.log('[Main] ✅ Application mounted successfully');