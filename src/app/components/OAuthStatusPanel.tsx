/**
 * OAuth 配置状态面板
 * 用于开发/调试阶段查看 OAuth 配置状态
 */

import React, { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import { projectId, publicAnonKey } from '/utils/supabase/info';
import { CheckCircle2, XCircle, AlertCircle, ExternalLink } from 'lucide-react';

const supabase = createClient(
  `https://${projectId}.supabase.co`,
  publicAnonKey
);

export function OAuthStatusPanel() {
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkSession();
  }, []);

  const checkSession = async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      setSession(session);
    } catch (error) {
      console.error('Failed to check session:', error);
    } finally {
      setLoading(false);
    }
  };

  const configSteps = [
    {
      title: 'Google OAuth',
      status: 'pending',
      description: '在 Supabase Dashboard 中配置 Google OAuth',
      link: `https://supabase.com/dashboard/project/${projectId}/auth/providers`,
    },
    {
      title: 'GitHub OAuth',
      status: 'pending',
      description: '在 Supabase Dashboard 中配置 GitHub OAuth',
      link: `https://supabase.com/dashboard/project/${projectId}/auth/providers`,
    },
    {
      title: 'Redirect URLs',
      status: 'pending',
      description: '配置重定向 URL',
      link: `https://supabase.com/dashboard/project/${projectId}/auth/url-configuration`,
    },
  ];

  return (
    <div className="fixed bottom-4 right-4 w-96 bg-white rounded-lg shadow-2xl border border-gray-200 overflow-hidden z-50">
      {/* Header */}
      <div className="bg-gradient-to-r from-purple-600 to-blue-600 p-4 text-white">
        <h3 className="text-lg font-bold flex items-center gap-2">
          🔐 OAuth 配置状态
        </h3>
        <p className="text-sm opacity-90 mt-1">开发调试面板</p>
      </div>

      {/* Content */}
      <div className="p-4">
        {/* Current Session */}
        <div className="mb-4 p-3 bg-gray-50 rounded-lg">
          <h4 className="text-sm font-semibold text-gray-700 mb-2">当前登录状态</h4>
          {loading ? (
            <div className="text-sm text-gray-500">检查中...</div>
          ) : session ? (
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm">
                <CheckCircle2 className="w-4 h-4 text-green-500" />
                <span className="text-green-700 font-medium">已登录</span>
              </div>
              <div className="text-xs text-gray-600 mt-2">
                <div><strong>邮箱:</strong> {session.user.email}</div>
                <div><strong>提供商:</strong> {session.user.app_metadata?.provider || 'email'}</div>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-sm">
              <AlertCircle className="w-4 h-4 text-yellow-500" />
              <span className="text-gray-600">未登录</span>
            </div>
          )}
        </div>

        {/* Configuration Steps */}
        <div className="space-y-2">
          <h4 className="text-sm font-semibold text-gray-700 mb-3">配置步骤</h4>
          {configSteps.map((step, index) => (
            <div key={index} className="flex items-start gap-3 p-2 hover:bg-gray-50 rounded-lg transition-colors">
              <div className="mt-0.5">
                {step.status === 'completed' ? (
                  <CheckCircle2 className="w-5 h-5 text-green-500" />
                ) : step.status === 'error' ? (
                  <XCircle className="w-5 h-5 text-red-500" />
                ) : (
                  <AlertCircle className="w-5 h-5 text-yellow-500" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-gray-900">{step.title}</div>
                <div className="text-xs text-gray-500 mt-0.5">{step.description}</div>
                <a
                  href={step.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1 mt-1"
                >
                  配置 <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </div>
          ))}
        </div>

        {/* Quick Links */}
        <div className="mt-4 pt-4 border-t border-gray-200">
          <div className="text-xs text-gray-500 space-y-2">
            <div>
              <strong>项目 ID:</strong> <code className="text-purple-600">{projectId}</code>
            </div>
            <div>
              <strong>回调地址:</strong>
              <code className="block mt-1 text-xs bg-gray-100 p-2 rounded">
                {window.location.origin}/auth/callback
              </code>
            </div>
          </div>
        </div>

        {/* Documentation Link */}
        <div className="mt-4">
          <a
            href="/OAUTH_QUICK_START.md"
            target="_blank"
            className="block w-full text-center px-4 py-2 bg-purple-600 text-white text-sm font-medium rounded-lg hover:bg-purple-700 transition-colors"
          >
            查看配置文档
          </a>
        </div>
      </div>
    </div>
  );
}
