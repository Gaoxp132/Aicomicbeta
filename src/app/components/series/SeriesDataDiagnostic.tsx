/**
 * Series数据诊断工具
 * 检查所有series的episodes状态，并提供一键修复
 * v4.2.67: 添加批量自动修复功能
 */

import { useState } from 'react';
import { Button } from '../ui/button';
import { AlertCircle, CheckCircle, Loader2, RefreshCw, AlertTriangle, Wrench } from 'lucide-react';
import { projectId, publicAnonKey } from '/utils/supabase/info';

interface SeriesDiagnosticResult {
  seriesId: string;
  title: string;
  totalEpisodes: number;
  actualEpisodes: number;
  status: 'ok' | 'missing' | 'error';
  message?: string;
}

export function SeriesDataDiagnostic({ userPhone }: { userPhone: string }) {
  const [isChecking, setIsChecking] = useState(false);
  const [results, setResults] = useState<SeriesDiagnosticResult[]>([]);
  const [fixingSeriesId, setFixingSeriesId] = useState<string | null>(null);
  const [isAutoFixing, setIsAutoFixing] = useState(false);
  const [autoFixProgress, setAutoFixProgress] = useState<string>('');

  const checkAllSeries = async () => {
    setIsChecking(true);
    setResults([]);

    try {
      // 1. 获取用户的所有series
      const seriesResponse = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-fc31472c/series?userPhone=${userPhone}`,
        {
          headers: {
            'Authorization': `Bearer ${publicAnonKey}`,
          },
        }
      );

      const seriesResult = await seriesResponse.json();
      console.log('[Diagnostic] Series result:', seriesResult);

      if (!seriesResult.success || !seriesResult.data) {
        throw new Error('Failed to fetch series');
      }

      const allSeries = seriesResult.data;
      const diagnosticResults: SeriesDiagnosticResult[] = [];

      // 2. 逐个检查每个series的episodes
      for (const series of allSeries) {
        try {
          const detailResponse = await fetch(
            `https://${projectId}.supabase.co/functions/v1/make-server-fc31472c/series/${series.id}?userPhone=${userPhone}`,
            {
              headers: {
                'Authorization': `Bearer ${publicAnonKey}`,
              },
            }
          );

          const detailResult = await detailResponse.json();
          
          if (!detailResult.success) {
            diagnosticResults.push({
              seriesId: series.id,
              title: series.title,
              totalEpisodes: series.totalEpisodes || 0,
              actualEpisodes: 0,
              status: 'error',
              message: detailResult.error,
            });
            continue;
          }

          const actualEpisodes = detailResult.data?.episodes?.length || 0;
          const expectedEpisodes = series.totalEpisodes || 0;

          diagnosticResults.push({
            seriesId: series.id,
            title: series.title,
            totalEpisodes: expectedEpisodes,
            actualEpisodes,
            status: actualEpisodes === expectedEpisodes ? 'ok' : 'missing',
            message: actualEpisodes === 0 ? '完全缺失episodes数据' : 
                     actualEpisodes < expectedEpisodes ? `缺少 ${expectedEpisodes - actualEpisodes} 集` : 
                     '数据完整',
          });
        } catch (err: any) {
          diagnosticResults.push({
            seriesId: series.id,
            title: series.title,
            totalEpisodes: series.totalEpisodes || 0,
            actualEpisodes: 0,
            status: 'error',
            message: err.message,
          });
        }
      }

      setResults(diagnosticResults);
      
      // 显示汇总信息
      const missingCount = diagnosticResults.filter(r => r.status === 'missing').length;
      const okCount = diagnosticResults.filter(r => r.status === 'ok').length;
      const errorCount = diagnosticResults.filter(r => r.status === 'error').length;
      
      console.log(`[Diagnostic] 📊 汇总: ${okCount} 个完整, ${missingCount} 个缺失, ${errorCount} 个错误`);
      
    } catch (error: any) {
      console.error('[Diagnostic] Error:', error);
      alert('诊断失败：' + error.message);
    } finally {
      setIsChecking(false);
    }
  };

  const fixSeries = async (seriesId: string) => {
    setFixingSeriesId(seriesId);

    try {
      console.log(`[Diagnostic] 🔧 Fixing series: ${seriesId}`);
      
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-fc31472c/series/${seriesId}/fix-episodes`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${publicAnonKey}`,
          },
        }
      );

      const result = await response.json();
      console.log('[Diagnostic] Fix result:', result);

      if (result.success) {
        console.log(`[Diagnostic] ✅ Successfully fixed series: ${seriesId}`);
        // 不需要alert，直接返回成功
        return true;
      } else {
        console.error(`[Diagnostic] ❌ Fix failed for ${seriesId}:`, result.error);
        return false;
      }
    } catch (error: any) {
      console.error('[Diagnostic] Fix error:', error);
      return false;
    } finally {
      setFixingSeriesId(null);
    }
  };

  // 🔥 批量自动修复所有缺失数据的series
  const autoFixAllSeries = async () => {
    const missingSeries = results.filter(r => r.status === 'missing');
    
    if (missingSeries.length === 0) {
      alert('没有需要修复的漫剧');
      return;
    }

    const confirmMsg = `检测到 ${missingSeries.length} 个漫剧缺少数据，是否立即使用AI自动生成完整内容？\n\n修复列表：\n${missingSeries.map(s => `- ${s.title}`).join('\n')}\n\n⚠️ 这将使用AI生成角色、剧集和分镜，可能需要几分钟时间。`;
    
    if (!confirm(confirmMsg)) {
      return;
    }

    setIsAutoFixing(true);
    setAutoFixProgress('');

    try {
      setAutoFixProgress('正在调用AI批量修复API...');
      console.log('[AutoFix] 🚀 Starting AI batch fix via API');
      
      // 🔥 调用新的批量修复API
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-fc31472c/series/batch-fix`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${publicAnonKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ userPhone }),
        }
      );

      const result = await response.json();
      console.log('[AutoFix] 📊 Batch fix result:', result);

      if (result.success) {
        const { total, fixed, skipped, failed } = result.data;
        
        setAutoFixProgress(`✅ 批量修复完成！\n总计: ${total}\n成功: ${fixed}\n跳过: ${skipped}\n失败: ${failed}`);
        
        // 3秒后重新检查
        setTimeout(() => {
          console.log('[AutoFix] 🔄 Rechecking all series...');
          checkAllSeries();
          setAutoFixProgress('');
        }, 3000);
      } else {
        alert('❌ 批量修复失败：' + result.error);
        setAutoFixProgress('');
      }
      
    } catch (error: any) {
      console.error('[AutoFix] Error:', error);
      alert('批量修复失败：' + error.message);
      setAutoFixProgress('');
    } finally {
      setIsAutoFixing(false);
    }
  };

  const missingCount = results.filter(r => r.status === 'missing').length;

  return (
    <div className="bg-gray-900 rounded-lg p-6 border border-gray-800">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-xl font-bold text-white mb-1">🔍 数据完整性诊断</h3>
          <p className="text-sm text-gray-400">检查所有漫剧的episodes数据状态</p>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={checkAllSeries}
            disabled={isChecking || isAutoFixing}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {isChecking ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                检查中...
              </>
            ) : (
              <>
                <RefreshCw className="w-4 h-4 mr-2" />
                开始检查
              </>
            )}
          </Button>
          
          {/* 🔥 批量修复按钮 - 只在有缺失数据时显示 */}
          {missingCount > 0 && !isChecking && (
            <Button
              onClick={autoFixAllSeries}
              disabled={isAutoFixing}
              className="bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-600 hover:to-orange-600 text-white font-semibold"
            >
              {isAutoFixing ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  修复中...
                </>
              ) : (
                <>
                  <Wrench className="w-4 h-4 mr-2" />
                  一键修复全部 ({missingCount})
                </>
              )}
            </Button>
          )}
        </div>
      </div>

      {/* 修复进度提示 */}
      {autoFixProgress && (
        <div className="mb-4 p-4 bg-blue-900/30 border border-blue-700 rounded-lg">
          <div className="flex items-center gap-2">
            <Loader2 className="w-5 h-5 text-blue-400 animate-spin" />
            <span className="text-blue-300 font-medium">{autoFixProgress}</span>
          </div>
        </div>
      )}

      {/* 结果列表 */}
      {results.length > 0 && (
        <div className="space-y-3">
          {results.map((result) => (
            <div
              key={result.seriesId}
              className={`p-4 rounded-lg border ${
                result.status === 'ok'
                  ? 'bg-green-900/20 border-green-700'
                  : result.status === 'missing'
                  ? 'bg-yellow-900/20 border-yellow-700'
                  : 'bg-red-900/20 border-red-700'
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    {result.status === 'ok' && (
                      <CheckCircle className="w-5 h-5 text-green-500" />
                    )}
                    {result.status === 'missing' && (
                      <AlertTriangle className="w-5 h-5 text-yellow-500" />
                    )}
                    {result.status === 'error' && (
                      <AlertCircle className="w-5 h-5 text-red-500" />
                    )}
                    <h4 className="font-semibold text-white">{result.title}</h4>
                  </div>
                  <div className="text-sm text-gray-400 space-y-1">
                    <p className="font-mono text-xs">{result.seriesId}</p>
                    <p>
                      Episodes: <span className="font-semibold">{result.actualEpisodes}</span> / {result.totalEpisodes}
                    </p>
                    <p className={
                      result.status === 'ok' ? 'text-green-400' :
                      result.status === 'missing' ? 'text-yellow-400' :
                      'text-red-400'
                    }>
                      {result.message}
                    </p>
                  </div>
                </div>

                {result.status === 'missing' && !isAutoFixing && (
                  <Button
                    onClick={() => fixSeries(result.seriesId)}
                    disabled={fixingSeriesId === result.seriesId}
                    size="sm"
                    className="bg-yellow-600 hover:bg-yellow-700 ml-4"
                  >
                    {fixingSeriesId === result.seriesId ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        修复中...
                      </>
                    ) : (
                      '单独修复'
                    )}
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 空状态 */}
      {results.length === 0 && !isChecking && (
        <div className="text-center py-12 text-gray-500">
          <RefreshCw className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p>点击"开始检查"按钮扫描所有漫剧数据</p>
        </div>
      )}
    </div>
  );
}