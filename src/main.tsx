import React from 'react';
import ReactDOM from 'react-dom/client';
import './styles/index.css';

const root = ReactDOM.createRoot(document.getElementById('root')!);

// 显示启动画面，避免同步导入链过重导致白屏
root.render(
  <React.StrictMode>
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #020617, #1e1b4b, #020617)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
        <div style={{ width: '36px', height: '36px', border: '3px solid rgba(168,85,247,0.3)', borderTopColor: '#a855f7', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        <span style={{ color: 'rgba(203,213,225,0.7)', fontSize: '14px' }}>加载中...</span>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  </React.StrictMode>,
);

// 异步导入 App，防止同步导入链阻塞首屏渲染
import('./app/App').then((mod) => {
  root.render(
    <React.StrictMode>
      <mod.default />
    </React.StrictMode>,
  );
}).catch((err) => {
  console.error('App import failed:', err);
  root.render(
    <div style={{ color: '#f87171', background: '#0f172a', minHeight: '100vh', padding: '40px', fontFamily: 'monospace' }}>
      <h2>应用加载失败</h2>
      <pre style={{ whiteSpace: 'pre-wrap', marginTop: '16px' }}>{String(err)}</pre>
    </div>,
  );
});
