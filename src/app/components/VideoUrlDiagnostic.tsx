/**
 * 视频URL诊断工具
 * 用于测试和诊断视频URL的可访问性
 */

import { useState } from 'react';
import { Button } from './ui/button';
import { Bug, CheckCircle, XCircle, Loader2, RefreshCw } from 'lucide-react';
import { projectId, publicAnonKey } from '/utils/supabase/info';

interface VideoUrlDiagnosticProps {
  url: string;
  onClose?: () => void;
}

export function VideoUrlDiagnostic({ url, onClose }: VideoUrlDiagnosticProps) {
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<any>(null);

  const runDiagnostic = async () => {
    setTesting(true);
    setResult(null);

    try {
      console.log('[VideoUrlDiagnostic] Testing URL:', url);

      // 调用诊断API
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-fc31472c/diagnostic/video-url?url=${encodeURIComponent(url)}`,
        {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${publicAnonKey}`,
          },
        }
      );

      const data = await response.json();

      console.log('[VideoUrlDiagnostic] Diagnostic result:', data);
      setResult(data);

    } catch (error: any) {
      console.error('[VideoUrlDiagnostic] Error:', error);
      setResult({
        success: false,
        error: error.message,
      });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="bg-gradient-to-br from-gray-900 to-black border border-purple-500/30 rounded-xl p-6 shadow-2xl">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-bold text-white flex items-center gap-2">
          <Bug className="w-5 h-5 text-purple-400" />
          视频URL诊断工具
        </h3>
        {onClose && (
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            ✕
          </button>
        )}
      </div>

      <div className="mb-4">
        <label className="text-sm text-gray-400 mb-2 block">测试URL:</label>
        <div className="bg-black/50 border border-gray-700 rounded-lg p-3 text-xs text-gray-300 break-all">
          {url}
        </div>
      </div>

      <Button
        onClick={runDiagnostic}
        disabled={testing}
        className="w-full bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 disabled:opacity-50 mb-4"
      >
        {testing ? (
          <>
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            诊断中...
          </>
        ) : (
          <>
            <Bug className="w-4 h-4 mr-2" />
            开始诊断
          </>
        )}
      </Button>

      {result && (
        <div className="space-y-3">
          <div className="bg-black/50 border border-gray-700 rounded-lg p-4">
            <h4 className="text-sm font-semibold text-white mb-3">诊断结果</h4>

            {result.success ? (
              <div className="space-y-3">
                {/* 总结 */}
                <div className="bg-gray-800/50 rounded-lg p-3">
                  <h5 className="text-xs font-semibold text-gray-400 mb-2">总结</h5>
                  <div className="space-y-1 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-gray-400">文件可访问:</span>
                      <span className={result.data.summary.accessible ? 'text-green-400' : 'text-red-400'}>
                        {result.data.summary.accessible ? (
                          <CheckCircle className="w-4 h-4 inline" />
                        ) : (
                          <XCircle className="w-4 h-4 inline" />
                        )}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-gray-400">有效视频文件:</span>
                      <span className={result.data.summary.validVideoFile ? 'text-green-400' : 'text-red-400'}>
                        {result.data.summary.validVideoFile ? (
                          <CheckCircle className="w-4 h-4 inline" />
                        ) : (
                          <XCircle className="w-4 h-4 inline" />
                        )}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-gray-400">支持Range请求:</span>
                      <span className={result.data.summary.supportsRangeRequests ? 'text-green-400' : 'text-yellow-400'}>
                        {result.data.summary.supportsRangeRequests ? (
                          <CheckCircle className="w-4 h-4 inline" />
                        ) : (
                          <XCircle className="w-4 h-4 inline" />
                        )}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-gray-400">CORS配置:</span>
                      <span className={result.data.summary.hasCorsHeaders ? 'text-green-400' : 'text-yellow-400'}>
                        {result.data.summary.hasCorsHeaders ? (
                          <CheckCircle className="w-4 h-4 inline" />
                        ) : (
                          <XCircle className="w-4 h-4 inline" />
                        )}
                      </span>
                    </div>
                  </div>
                </div>

                {/* 测试详情 */}
                <div className="bg-gray-800/50 rounded-lg p-3">
                  <h5 className="text-xs font-semibold text-gray-400 mb-2">测试详情</h5>
                  
                  {/* HEAD测试 */}
                  <div className="mb-2">
                    <div className="text-xs text-gray-400 mb-1">HEAD请求:</div>
                    {result.data.tests.head?.success ? (
                      <div className="text-xs space-y-1 pl-3">
                        <div className="text-green-400">✅ 成功 (HTTP {result.data.tests.head.status})</div>
                        <div className="text-gray-500">
                          Content-Type: {result.data.tests.head.headers?.contentType || 'N/A'}
                        </div>
                        <div className="text-gray-500">
                          Content-Length: {result.data.tests.head.headers?.contentLength || 'N/A'}
                        </div>
                      </div>
                    ) : (
                      <div className="text-xs text-red-400 pl-3">
                        ❌ 失败: {result.data.tests.head?.error || 'Unknown error'}
                      </div>
                    )}
                  </div>

                  {/* GET测试 */}
                  <div className="mb-2">
                    <div className="text-xs text-gray-400 mb-1">GET请求 (前1KB):</div>
                    {result.data.tests.get?.success ? (
                      <div className="text-xs space-y-1 pl-3">
                        <div className="text-green-400">✅ 成功 (HTTP {result.data.tests.get.status})</div>
                        <div className="text-gray-500">
                          文件签名: {result.data.tests.get.signature || 'N/A'}
                        </div>
                        <div className={result.data.tests.get.looksLikeMp4 ? 'text-green-400' : 'text-yellow-400'}>
                          {result.data.tests.get.looksLikeMp4 ? '✅ MP4格式正确' : '⚠️ 可能不是MP4格式'}
                        </div>
                      </div>
                    ) : (
                      <div className="text-xs text-red-400 pl-3">
                        ❌ 失败: {result.data.tests.get?.error || 'Unknown error'}
                      </div>
                    )}
                  </div>
                </div>

                {/* 建议 */}
                {result.data.recommendations && result.data.recommendations.length > 0 && (
                  <div className="bg-yellow-900/20 border border-yellow-600/30 rounded-lg p-3">
                    <h5 className="text-xs font-semibold text-yellow-400 mb-2">建议</h5>
                    <ul className="text-xs text-yellow-300 space-y-1">
                      {result.data.recommendations.map((rec: string, i: number) => (
                        <li key={i}>• {rec}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-red-400 text-sm">
                ❌ 诊断失败: {result.error || '未知错误'}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
