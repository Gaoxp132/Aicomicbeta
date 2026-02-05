/**
 * 快速视频URL测试工具
 * 用于诊断视频播放问题
 */

import { useState } from 'react';
import { Bug, Play, AlertCircle, CheckCircle, XCircle, Server } from 'lucide-react';
import { projectId, publicAnonKey } from '/utils/supabase/info';

interface TestResult {
  url: string;
  status: 'pending' | 'success' | 'error';
  httpStatus?: number;
  statusText?: string;
  contentType?: string;
  contentLength?: string;
  cors?: string;
  error?: string;
  canPlay?: boolean;
  videoTest?: 'success' | 'error' | 'pending';
}

interface QuickVideoTestProps {
  urls: string[];
  onClose?: () => void;
}

export function QuickVideoTest({ urls, onClose }: QuickVideoTestProps) {
  const [results, setResults] = useState<TestResult[]>(
    urls.map(url => ({ url, status: 'pending' }))
  );
  const [testing, setTesting] = useState(false);

  const testUrl = async (url: string, index: number) => {
    console.log(`[QuickTest] Testing URL ${index + 1}:`, url);

    // Update status to testing
    setResults(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], status: 'pending' };
      return updated;
    });

    try {
      // Test 1: HEAD request
      console.log(`[QuickTest] Step 1: HEAD request...`);
      const headResponse = await fetch(url, {
        method: 'HEAD',
        mode: 'cors',
        cache: 'no-store',
      });

      console.log(`[QuickTest] HEAD response:`, {
        status: headResponse.status,
        statusText: headResponse.statusText,
        headers: Object.fromEntries(headResponse.headers.entries()),
      });

      const result: TestResult = {
        url,
        status: headResponse.ok ? 'success' : 'error',
        httpStatus: headResponse.status,
        statusText: headResponse.statusText,
        contentType: headResponse.headers.get('content-type') || undefined,
        contentLength: headResponse.headers.get('content-length') || undefined,
        cors: headResponse.headers.get('access-control-allow-origin') || undefined,
      };

      // Test 2: Video element test
      if (headResponse.ok) {
        console.log(`[QuickTest] Step 2: Video element test...`);
        result.videoTest = 'pending';
        
        setResults(prev => {
          const updated = [...prev];
          updated[index] = result;
          return updated;
        });

        const canPlay = await testVideoElement(url);
        result.canPlay = canPlay;
        result.videoTest = canPlay ? 'success' : 'error';
        
        if (!canPlay) {
          result.status = 'error';
          result.error = '视频元素无法播放此文件';
        }
      } else {
        result.error = `HTTP ${headResponse.status}: ${headResponse.statusText}`;
      }

      setResults(prev => {
        const updated = [...prev];
        updated[index] = result;
        return updated;
      });

    } catch (error: any) {
      console.error(`[QuickTest] Test failed:`, error);
      
      setResults(prev => {
        const updated = [...prev];
        updated[index] = {
          url,
          status: 'error',
          error: error.message || '网络错误',
        };
        return updated;
      });
    }
  };

  const testVideoElement = (url: string): Promise<boolean> => {
    return new Promise((resolve) => {
      const video = document.createElement('video');
      video.crossOrigin = 'anonymous';
      video.preload = 'metadata';
      
      const timeout = setTimeout(() => {
        console.log('[QuickTest] Video test timeout');
        video.remove();
        resolve(false);
      }, 10000);

      video.onloadedmetadata = () => {
        console.log('[QuickTest] ✅ Video metadata loaded:', {
          duration: video.duration,
          videoWidth: video.videoWidth,
          videoHeight: video.videoHeight,
        });
        clearTimeout(timeout);
        video.remove();
        resolve(true);
      };

      video.onerror = (e) => {
        console.error('[QuickTest] ❌ Video error:', {
          error: video.error,
          code: video.error?.code,
          message: video.error?.message,
        });
        clearTimeout(timeout);
        video.remove();
        resolve(false);
      };

      video.src = url;
    });
  };

  const testAllUrls = async () => {
    setTesting(true);
    
    for (let i = 0; i < urls.length; i++) {
      await testUrl(urls[i], i);
    }
    
    setTesting(false);
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 rounded-lg shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-auto">
        <div className="sticky top-0 bg-gray-900 border-b border-gray-700 p-4 flex items-center justify-between">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Bug className="w-6 h-6" />
            视频URL诊断
          </h2>
          {onClose && (
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-white"
            >
              ✕
            </button>
          )}
        </div>

        <div className="p-6">
          <div className="mb-6">
            <button
              onClick={testAllUrls}
              disabled={testing}
              className="px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 rounded-lg font-medium text-white flex items-center gap-2"
            >
              <Play className="w-5 h-5" />
              {testing ? '测试中...' : '开始测试'}
            </button>
          </div>

          <div className="space-y-4">
            {results.map((result, index) => (
              <div
                key={index}
                className={`p-4 rounded-lg border ${
                  result.status === 'success'
                    ? 'bg-green-900/20 border-green-600'
                    : result.status === 'error'
                    ? 'bg-red-900/20 border-red-600'
                    : 'bg-gray-800 border-gray-700'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 mt-1">
                    {result.status === 'success' ? (
                      <CheckCircle className="w-6 h-6 text-green-500" />
                    ) : result.status === 'error' ? (
                      <XCircle className="w-6 h-6 text-red-500" />
                    ) : (
                      <AlertCircle className="w-6 h-6 text-gray-500" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-white mb-2">
                      分镜 {index + 1}
                    </div>

                    <div className="text-xs text-gray-400 break-all mb-3">
                      {result.url}
                    </div>

                    {result.httpStatus && (
                      <div className="grid grid-cols-2 gap-2 text-xs mb-2">
                        <div>
                          <span className="text-gray-400">HTTP状态: </span>
                          <span className={result.httpStatus === 200 ? 'text-green-400' : 'text-red-400'}>
                            {result.httpStatus} {result.statusText}
                          </span>
                        </div>
                        {result.contentType && (
                          <div>
                            <span className="text-gray-400">类型: </span>
                            <span className={result.contentType.includes('video') ? 'text-green-400' : 'text-yellow-400'}>
                              {result.contentType}
                            </span>
                          </div>
                        )}
                        {result.contentLength && (
                          <div>
                            <span className="text-gray-400">大小: </span>
                            <span className="text-blue-400">
                              {(parseInt(result.contentLength) / 1024 / 1024).toFixed(2)} MB
                            </span>
                          </div>
                        )}
                        <div>
                          <span className="text-gray-400">CORS: </span>
                          <span className={result.cors ? 'text-green-400' : 'text-red-400'}>
                            {result.cors || '未配置'}
                          </span>
                        </div>
                      </div>
                    )}

                    {result.videoTest && (
                      <div className="text-xs mb-2">
                        <span className="text-gray-400">视频播放测试: </span>
                        <span className={result.videoTest === 'success' ? 'text-green-400' : result.videoTest === 'error' ? 'text-red-400' : 'text-yellow-400'}>
                          {result.videoTest === 'success' ? '✅ 可以播放' : result.videoTest === 'error' ? '❌ 无法播放' : '⏳ 测试中...'}
                        </span>
                      </div>
                    )}

                    {result.error && (
                      <div className="text-xs text-red-400 bg-red-900/30 px-2 py-1 rounded">
                        ❌ {result.error}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* 总结 */}
          {!testing && results.some(r => r.status !== 'pending') && (
            <div className="mt-6 p-4 bg-blue-900/20 border border-blue-600 rounded-lg">
              <h3 className="font-semibold text-blue-300 mb-2">📊 测试总结</h3>
              <div className="text-sm text-blue-200 space-y-1">
                <p>✅ 成功: {results.filter(r => r.status === 'success').length} / {results.length}</p>
                <p>❌ 失败: {results.filter(r => r.status === 'error').length} / {results.length}</p>
                
                {results.some(r => r.httpStatus === 403) && (
                  <p className="text-yellow-400 mt-3">
                    ⚠️ 检测到403错误 - Bucket权限问题。请点击"修复OSS"按钮设置为公共读。
                  </p>
                )}
                
                {results.some(r => r.httpStatus === 404) && (
                  <p className="text-yellow-400 mt-3">
                    ⚠️ 检测到404错误 - 视频文件不存在。需要重新生成视频。
                  </p>
                )}
                
                {results.some(r => !r.cors && r.httpStatus === 200) && (
                  <p className="text-yellow-400 mt-3">
                    ⚠️ 检测到CORS未配置 - 请点击"修复OSS"按钮配置CORS。
                  </p>
                )}
                
                {results.some(r => r.videoTest === 'error' && r.httpStatus === 200) && (
                  <p className="text-red-400 mt-3">
                    🚨 视频文件可以访问但无法播放 - 可能是：
                    <ul className="list-disc list-inside ml-4 mt-1">
                      <li>视频编码格式不支持</li>
                      <li>视频文件已损坏</li>
                      <li>需要重新生成视频</li>
                    </ul>
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}