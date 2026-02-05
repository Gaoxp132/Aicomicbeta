/**
 * OAuth 回调处理组件
 * 处理 Google/GitHub 等第三方登录后的重定向
 */

import React, { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import { projectId, publicAnonKey } from '/utils/supabase/info';

const supabase = createClient(
  `https://${projectId}.supabase.co`,
  publicAnonKey
);

export function AuthCallback() {
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('正在处理登录...');

  useEffect(() => {
    handleCallback();
  }, []);

  const handleCallback = async () => {
    try {
      // 从 URL 中获取 session
      const { data: { session }, error } = await supabase.auth.getSession();

      if (error) {
        throw error;
      }

      if (session) {
        console.log('[AuthCallback] ✅ Login successful:', session.user.email);
        setStatus('success');
        setMessage('登录成功！正在跳转...');

        // 存储用户信息（使用 email 作为 userPhone 的替代）
        const userEmail = session.user.email || '';
        const userPhone = userEmail; // 兼容现有系统
        
        localStorage.setItem('userPhone', userPhone);
        localStorage.setItem('userEmail', userEmail);
        localStorage.setItem('userId', session.user.id);
        localStorage.setItem('authProvider', session.user.app_metadata?.provider || 'email');

        // 2秒后跳转回主页
        setTimeout(() => {
          window.location.href = '/';
        }, 2000);
      } else {
        throw new Error('未找到会话信息');
      }
    } catch (err: any) {
      console.error('[AuthCallback] ❌ Callback error:', err);
      setStatus('error');
      setMessage(err.message || '登录失败，请重试');

      // 5秒后跳转回主页
      setTimeout(() => {
        window.location.href = '/';
      }, 5000);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8 text-center">
        {status === 'loading' && (
          <>
            <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-gray-800 mb-2">
              正在登录
            </h2>
            <p className="text-gray-600">{message}</p>
          </>
        )}

        {status === 'success' && (
          <>
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-gray-800 mb-2">
              登录成功！
            </h2>
            <p className="text-gray-600">{message}</p>
          </>
        )}

        {status === 'error' && (
          <>
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-gray-800 mb-2">
              登录失败
            </h2>
            <p className="text-gray-600 mb-4">{message}</p>
            <button
              onClick={() => window.location.href = '/'}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              返回首页
            </button>
          </>
        )}
      </div>
    </div>
  );
}
