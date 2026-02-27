/**
 * Server status components — merged to reduce module count
 * v6.0.68: Merged EdgeFunctionError.tsx + ServerLoadingIndicator.tsx
 * Both consumed only by App.tsx.
 */

import { useState, useEffect, useCallback } from 'react';
import { Terminal, RefreshCw, Copy, Check, ChevronDown, ChevronUp, ExternalLink, Wifi, WifiOff, Shield, AlertTriangle } from 'lucide-react';
import { Button } from './ui';
import { getApiUrl, projectId, apiGet } from '../utils';
import { APP_VERSION } from '../version';
import type { DeployVerifyResult } from '../hooks';

// ═══════════════════════════════════════════════════════════════════
// EdgeFunctionError (was EdgeFunctionError.tsx)
// ═══════════════════════════════════════════════════════════════════

interface EdgeFunctionErrorProps {
  showError: boolean;
  dismissError: () => void;
  onRetry?: () => void;
  deployStatus?: DeployVerifyResult | null;
  onFetchDeployVerify?: () => Promise<DeployVerifyResult | null>;
  isFallbackMode?: boolean;
  fallbackError?: string | null;
}

const DEPLOY_COMMANDS = `# 1. 安装 Supabase CLI（如果没有）
npm install -g supabase

# 2. 登录
supabase login

# 3. 链接项目
supabase link --project-ref ${projectId}

# 4. 部署 Edge Function
supabase functions deploy make-server-fc31472c`;

export function EdgeFunctionError({
  showError,
  dismissError,
  onRetry,
  deployStatus,
  onFetchDeployVerify,
  isFallbackMode = false,
  fallbackError,
}: EdgeFunctionErrorProps) {
  const [copied, setCopied] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const [localDeployStatus, setLocalDeployStatus] = useState<DeployVerifyResult | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);

  const effectiveDeployStatus = deployStatus || localDeployStatus;

  const copyCommands = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(DEPLOY_COMMANDS);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = DEPLOY_COMMANDS;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, []);

  const handleRetry = useCallback(async () => {
    setIsRetrying(true);
    try {
      if (onRetry) await onRetry();
    } finally {
      setTimeout(() => setIsRetrying(false), 2000);
    }
  }, [onRetry]);

  const handleVerifyDeploy = useCallback(async () => {
    setIsVerifying(true);
    try {
      if (onFetchDeployVerify) {
        const result = await onFetchDeployVerify();
        if (result) setLocalDeployStatus(result);
      } else {
        const result = await apiGet<DeployVerifyResult>('/deploy-verify', { timeout: 15000, maxRetries: 1 });
        if (result.success && result.data) {
          setLocalDeployStatus(result.data);
        }
      }
    } catch {
      // ignore
    } finally {
      setIsVerifying(false);
    }
  }, [onFetchDeployVerify]);

  if (!showError) return null;
  
  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-gradient-to-br from-slate-900 via-purple-900/80 to-slate-900 border border-red-500/30 rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6 md:p-8">
        {/* 标题 */}
        <div className="flex items-start gap-4 mb-6">
          <div className={`flex-shrink-0 w-12 h-12 rounded-full flex items-center justify-center ${
            isFallbackMode ? 'bg-orange-500/20' : 'bg-red-500/20'
          }`}>
            {isFallbackMode ? (
              <AlertTriangle className="w-6 h-6 text-orange-400" />
            ) : (
              <WifiOff className="w-6 h-6 text-red-400" />
            )}
          </div>
          <div className="flex-1">
            <h2 className="text-xl md:text-2xl font-bold text-white mb-1">
              {isFallbackMode ? '服务器启动异常' : '无法连接后端服务'}
            </h2>
            <p className="text-gray-400 text-sm">
              {isFallbackMode ? (
                <>Edge Function 已部署但 <code className="text-orange-300 bg-black/30 px-1 rounded">app.tsx</code> 加载失败，服务器运行在降级模式。</>
              ) : (
                <>Edge Function 尚未部署或正在冷启动。已自动重试 8 次均失败。</>
              )}
            </p>
          </div>
        </div>

        {/* Fallback模式详细错误 */}
        {isFallbackMode && fallbackError && (
          <div className="bg-orange-500/10 border border-orange-500/30 rounded-lg p-4 mb-6">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="w-4 h-4 text-orange-400" />
              <span className="text-sm font-semibold text-orange-300">app.tsx 加载错误</span>
            </div>
            <pre className="text-xs text-orange-200/80 font-mono whitespace-pre-wrap break-all bg-black/30 rounded p-3 max-h-32 overflow-y-auto">
              {fallbackError}
            </pre>
            <p className="text-xs text-orange-200/60 mt-2">
              这通常意味着 app.tsx 有语法错误、模块解析失败或 npm 依赖版本不兼容。请检查 Edge Function 日志。
            </p>
          </div>
        )}

        {/* 快速操作 */}
        <div className="flex flex-wrap gap-2 mb-6">
          <Button
            onClick={handleRetry}
            disabled={isRetrying}
            className="bg-purple-600 hover:bg-purple-700 text-white"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${isRetrying ? 'animate-spin' : ''}`} />
            {isRetrying ? '重试中...' : '重试连接'}
          </Button>
          <Button
            onClick={handleVerifyDeploy}
            disabled={isVerifying}
            variant="outline"
            className="border-green-600/50 text-green-300 hover:bg-green-600/10"
          >
            <Shield className={`w-4 h-4 mr-2 ${isVerifying ? 'animate-spin' : ''}`} />
            {isVerifying ? '验证中...' : '部署验证'}
          </Button>
          <Button
            onClick={dismissError}
            variant="ghost"
            className="text-gray-400 hover:bg-white/5"
          >
            暂时关闭
          </Button>
        </div>

        {/* 部署验证结果 */}
        {effectiveDeployStatus && (
          <div className={`border rounded-lg p-4 mb-6 ${
            effectiveDeployStatus.status === 'ok'
              ? 'bg-black/40 border-green-500/30'
              : effectiveDeployStatus.status === 'error'
              ? 'bg-black/40 border-red-500/30'
              : 'bg-black/40 border-yellow-500/30'
          }`}>
            <div className="flex items-center gap-2 mb-3">
              <Wifi className={`w-4 h-4 ${
                effectiveDeployStatus.status === 'ok' ? 'text-green-400' :
                effectiveDeployStatus.status === 'error' ? 'text-red-400' : 'text-yellow-400'
              }`} />
              <span className={`text-sm font-semibold ${
                effectiveDeployStatus.status === 'ok' ? 'text-green-300' :
                effectiveDeployStatus.status === 'error' ? 'text-red-300' : 'text-yellow-300'
              }`}>
                部署验证结果 - {
                  effectiveDeployStatus.status === 'ok' ? '全部正常' :
                  effectiveDeployStatus.status === 'error' ? '加载失败' : '部分降级'
                }
              </span>
              <span className="text-xs text-gray-500 ml-auto">
                {effectiveDeployStatus.totalLatencyMs}ms
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <StatusItem label="版本" value={effectiveDeployStatus.version} ok />
              <StatusItem label="Hash" value={effectiveDeployStatus.deployHash} ok />
              <StatusItem
                label="模块加载"
                value={effectiveDeployStatus.summary?.modulesLoaded ? '正常' : '异常'}
                ok={effectiveDeployStatus.summary?.modulesLoaded ?? false}
              />
              <StatusItem
                label="运行模式"
                value={effectiveDeployStatus.checks?.routing?.mode || 'unknown'}
                ok={effectiveDeployStatus.checks?.routing?.mode === 'self-contained'}
              />
              <StatusItem
                label="数据库"
                value={effectiveDeployStatus.summary?.databaseConnected
                  ? `连接正常 (${effectiveDeployStatus.checks?.database?.latencyMs}ms)`
                  : effectiveDeployStatus.checks?.database?.error || '连接失败'}
                ok={effectiveDeployStatus.summary?.databaseConnected ?? false}
              />
              <StatusItem
                label="火山引擎"
                value={effectiveDeployStatus.summary?.volcengineReady ? '已配置' : '未配置'}
                ok={effectiveDeployStatus.summary?.volcengineReady ?? false}
                optional
              />
              <StatusItem
                label="AI服务"
                value={effectiveDeployStatus.summary?.aiReady ? '已配置' : '未配置'}
                ok={effectiveDeployStatus.summary?.aiReady ?? false}
                optional
              />
            </div>
            {effectiveDeployStatus.error && (
              <div className="mt-3 pt-3 border-t border-white/10">
                <p className="text-xs text-red-300 font-mono break-all">
                  {effectiveDeployStatus.error}
                </p>
              </div>
            )}
          </div>
        )}

        {/* 部署命令 */}
        <div className="bg-white/5 border border-purple-500/20 rounded-lg p-4 mb-4">
          <div className="flex items-center justify-between mb-3">
            <span className="font-semibold text-purple-300 flex items-center gap-2">
              <Terminal className="w-4 h-4" />
              部署命令
            </span>
            <Button
              onClick={copyCommands}
              variant="ghost"
              size="sm"
              className="text-xs text-gray-400 hover:text-white h-7"
            >
              {copied ? (
                <><Check className="w-3 h-3 mr-1 text-green-400" /> 已复制</>
              ) : (
                <><Copy className="w-3 h-3 mr-1" /> 复制</>
              )}
            </Button>
          </div>
          <div className="bg-black/60 rounded p-3 font-mono text-xs space-y-1 overflow-x-auto">
            <div className="text-gray-500"># 1. 安装 CLI</div>
            <div className="text-green-400">npm install -g supabase</div>
            <div className="text-gray-500 mt-2"># 2. 登录</div>
            <div className="text-green-400">supabase login</div>
            <div className="text-gray-500 mt-2"># 3. 链接项目</div>
            <div className="text-green-400">supabase link --project-ref {projectId}</div>
            <div className="text-gray-500 mt-2"># 4. 部署</div>
            <div className="text-green-400">supabase functions deploy make-server-fc31472c</div>
          </div>
        </div>

        {/* 高级信息折叠 */}
        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="flex items-center gap-2 text-xs text-gray-500 hover:text-gray-300 transition-colors mb-4 w-full"
        >
          {showAdvanced ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          <span>高级诊断信息</span>
        </button>

        {showAdvanced && (
          <div className="space-y-3 mb-4">
            <div className="bg-black/40 border border-gray-700/50 rounded-lg p-3 text-xs font-mono">
              <div className="text-gray-500 mb-1">健康检查端点：</div>
              <div className="text-blue-400 break-all">{getApiUrl('/health')}</div>
              <div className="text-gray-500 mt-2 mb-1">部署验证端点：</div>
              <div className="text-blue-400 break-all">{getApiUrl('/deploy-verify')}</div>
            </div>

            <div className="bg-black/40 border border-gray-700/50 rounded-lg p-3 text-xs text-gray-400">
              <div className="font-semibold text-gray-300 mb-2">排查步骤：</div>
              <ol className="list-decimal list-inside space-y-1">
                <li>确认已执行 <code className="bg-black/50 px-1 rounded text-green-400">supabase functions deploy</code> 命令</li>
                <li>检查 Supabase Dashboard &gt; Edge Functions 页面，确认函数状态为 Active</li>
                <li>在浏览器新标签页访问上面的健康检查端点，查看是否返回JSON</li>
                <li>如果返回 HTML 错误页面，检查 Edge Function 日志中的启动错误</li>
                <li>v5.0.4 使用动态 import fallback——即使 app.tsx 有错误，/health 也会返回诊断信息</li>
                <li>Edge Function 冷启动可能需要 10-20 秒，首次请求超时是正常的</li>
              </ol>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() => window.open(getApiUrl('/health'), '_blank')}
                variant="outline"
                size="sm"
                className="text-xs border-gray-600 text-gray-300 hover:bg-white/5"
              >
                <ExternalLink className="w-3 h-3 mr-1" />
                打开 /health
              </Button>
              <Button
                onClick={() => window.open(getApiUrl('/deploy-verify'), '_blank')}
                variant="outline"
                size="sm"
                className="text-xs border-gray-600 text-gray-300 hover:bg-white/5"
              >
                <ExternalLink className="w-3 h-3 mr-1" />
                打开 /deploy-verify
              </Button>
              <Button
                onClick={() => window.open(`https://supabase.com/dashboard/project/${projectId}/functions`, '_blank')}
                variant="outline"
                size="sm"
                className="text-xs border-gray-600 text-gray-300 hover:bg-white/5"
              >
                <ExternalLink className="w-3 h-3 mr-1" />
                Supabase Dashboard
              </Button>
            </div>
          </div>
        )}

        {/* 底部版本信息 */}
        <div className="pt-4 border-t border-white/10">
          <p className="text-xs text-gray-600 text-center">
            v{APP_VERSION} - 自包含服务器 + 动态import fallback - npm依赖版本锁定 (hono@4.0.2, supabase-js@2.49.8)
          </p>
        </div>
      </div>
    </div>
  );
}

function StatusItem({ label, value, ok, optional }: { label: string; value: string; ok: boolean; optional?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
        ok ? 'bg-green-400' : optional ? 'bg-yellow-400' : 'bg-red-400'
      }`} />
      <span className="text-gray-400">{label}:</span>
      <span className={`truncate ${ok ? 'text-green-300' : optional ? 'text-yellow-300' : 'text-red-300'}`}>
        {value}
      </span>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// ServerLoadingIndicator (was ServerLoadingIndicator.tsx)
// v6.0.66: Uses CSS animations + inline SVGs (no motion/lucide-react)
// ═══════════════════════════════════════════════════════════════════

interface ServerLoadingIndicatorProps {
  isChecking: boolean;
  isConnected: boolean | null;
}

export function ServerLoadingIndicator({ isChecking, isConnected }: ServerLoadingIndicatorProps) {
  const [elapsedMs, setElapsedMs] = useState(0);

  useEffect(() => {
    if (!isChecking && isConnected !== null) {
      setElapsedMs(0);
      return;
    }

    const start = Date.now();
    const interval = setInterval(() => {
      setElapsedMs(Date.now() - start);
    }, 500);

    return () => clearInterval(interval);
  }, [isChecking, isConnected]);

  if (!isChecking || isConnected !== null) {
    return null;
  }

  const seconds = Math.floor(elapsedMs / 1000);
  const showColdStartHint = seconds >= 5;

  return (
    <div className="fixed top-20 left-1/2 -translate-x-1/2 z-40 animate-[fadeSlideDown_0.3s_ease-out]">
      <div className="bg-gradient-to-r from-purple-900/90 via-blue-900/90 to-purple-900/90 backdrop-blur-sm border border-purple-500/30 rounded-full px-6 py-3 shadow-lg">
        <div className="flex items-center gap-3">
          {/* Loader2 inline SVG */}
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-purple-300 animate-spin">
            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
          </svg>
          <div className="flex items-center gap-2">
            {/* Server inline SVG */}
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-purple-300">
              <rect width="20" height="8" x="2" y="2" rx="2" ry="2" /><rect width="20" height="8" x="2" y="14" rx="2" ry="2" /><line x1="6" x2="6.01" y1="6" y2="6" /><line x1="6" x2="6.01" y1="18" y2="18" />
            </svg>
            <span className="text-sm text-white font-medium">
              {showColdStartHint
                ? `服务器冷启动中 (${seconds}s)...`
                : '连接服务器中...'}
            </span>
          </div>
          <div className="flex gap-1">
            <div className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-[pulse_1.5s_ease-in-out_infinite]" />
            <div className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-[pulse_1.5s_ease-in-out_infinite_0.2s]" />
            <div className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-[pulse_1.5s_ease-in-out_infinite_0.4s]" />
          </div>
        </div>
        {showColdStartHint && (
          <p className="text-xs text-purple-300/70 text-center mt-1 animate-[fadeIn_0.3s_ease-out]">
            Edge Function 冷启动可能需要 15-30 秒，请耐心等待
          </p>
        )}
      </div>
    </div>
  );
}
