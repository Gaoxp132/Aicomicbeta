/**
 * Figma OAuth 回调页面
 * 处理从 Figma OAuth 登录返回后的流程
 */

import React, { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import { projectId, publicAnonKey } from '/utils/supabase/info';

const supabase = createClient(
  `https://${projectId}.supabase.co`,
  publicAnonKey
);

export default function FigmaAuthCallbackPage() {
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('正在处理 Figma 登录...');

  useEffect(() => {
    handleFigmaCallback();
  }, []);

  const handleFigmaCallback = async () => {
    try {
      // 从 URL 获取 session
      const { data: { session }, error } = await supabase.auth.getSession();

      if (error) {
        throw error;
      }

      if (session) {
        console.log('[Figma Auth] ✅ Login successful:', session.user.email);
        setStatus('success');
        setMessage('Figma 登录成功！');

        // 获取 access_token
        const accessToken = session.access_token;
        
        // 存储用户信息
        const userEmail = session.user.email || '';
        const userId = session.user.id;
        const provider = session.user.app_metadata?.provider || 'figma';
        
        localStorage.setItem('userEmail', userEmail);
        localStorage.setItem('userId', userId);
        localStorage.setItem('authProvider', provider);
        localStorage.setItem('userPhone', userEmail); // 兼容现有系统
        
        // 🔥 关键：为 Figma 插件保存 access_token
        localStorage.setItem('figma_plugin_access_token', accessToken);

        // 判断是否来自 Figma 插件
        const opener = window.opener;
        if (opener) {
          // 从 Figma 插件打开的窗口
          console.log('[Figma Auth] Sending token to Figma plugin...');
          
          // 调用 Figma 插件的回调函数
          if (opener.setAccessToken && typeof opener.setAccessToken === 'function') {
            opener.setAccessToken(accessToken);
          }
          
          setMessage('登录成功！正在返回 Figma 插件...');
          
          // 2秒后关闭窗口
          setTimeout(() => {
            window.close();
          }, 2000);
        } else {
          // 从 Web 应用打开
          setMessage('登录成功！正在跳转...');
          
          setTimeout(() => {
            window.location.href = '/';
          }, 2000);
        }
      } else {
        throw new Error('未找到会话信息');
      }
    } catch (err: any) {
      console.error('[Figma Auth] ❌ Callback error:', err);
      setStatus('error');
      setMessage(err.message || 'Figma 登录失败，请重试');

      // 5秒后跳转回主页
      setTimeout(() => {
        if (window.opener) {
          window.close();
        } else {
          window.location.href = '/';
        }
      }, 5000);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-600 via-blue-600 to-indigo-800">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-2xl p-8 text-center">
        {status === 'loading' && (
          <>
            <div className="w-20 h-20 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto mb-6" />
            <h2 className="text-2xl font-bold text-gray-800 mb-3">
              正在处理登录
            </h2>
            <p className="text-gray-600">{message}</p>
          </>
        )}

        {status === 'success' && (
          <>
            <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <svg className="w-10 h-10 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-gray-800 mb-3">
              登录成功！
            </h2>
            <p className="text-gray-600">{message}</p>
            
            {/* Figma 品牌颜色点缀 */}
            <div className="mt-6 flex items-center justify-center gap-2">
              <div className="w-3 h-3 rounded-full bg-purple-500" />
              <div className="w-3 h-3 rounded-full bg-blue-500" />
              <div className="w-3 h-3 rounded-full bg-green-500" />
              <div className="w-3 h-3 rounded-full bg-red-500" />
              <div className="w-3 h-3 rounded-full bg-yellow-500" />
            </div>
          </>
        )}

        {status === 'error' && (
          <>
            <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <svg className="w-10 h-10 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-gray-800 mb-3">
              登录失败
            </h2>
            <p className="text-gray-600 mb-6">{message}</p>
            <button
              onClick={() => window.location.href = '/'}
              className="px-8 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors font-semibold"
            >
              返回首页
            </button>
          </>
        )}
      </div>
    </div>
  );
}
