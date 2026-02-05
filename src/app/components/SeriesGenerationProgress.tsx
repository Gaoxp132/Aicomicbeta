/**
 * 漫剧生成进度显示组件
 * 实时显示AI生成进度，支持自动轮询
 */

import React, { useEffect, useState } from 'react';
import { pollSeriesProgress } from '@/app/services/seriesServicePG';

interface SeriesGenerationProgressProps {
  seriesId: string;
  userPhone: string;
  onComplete?: (series: any) => void;
  onError?: (error: string) => void;
}

export const SeriesGenerationProgress: React.FC<SeriesGenerationProgressProps> = ({
  seriesId,
  userPhone,
  onComplete,
  onError,
}) => {
  const [progress, setProgress] = useState<any>(null);
  const [status, setStatus] = useState<string>('generating');

  useEffect(() => {
    console.log('[SeriesGenerationProgress] Starting progress polling for:', seriesId);

    // 启动轮询
    const cancelPolling = pollSeriesProgress(
      seriesId,
      userPhone,
      (series) => {
        console.log('[SeriesGenerationProgress] Progress update:', {
          status: series.status,
          progress: series.generation_progress,
        });

        setProgress(series.generation_progress);
        setStatus(series.status);

        // 生成完成
        if (series.status === 'completed') {
          console.log('[SeriesGenerationProgress] ✅ Generation completed!');
          onComplete?.(series);
        }

        // 生成失败
        if (series.status === 'failed') {
          console.error('[SeriesGenerationProgress] ❌ Generation failed');
          onError?.(series.generation_progress?.error || '生成失败');
        }
      },
      3000 // 每3秒轮询一次
    );

    // 清理函数
    return () => {
      console.log('[SeriesGenerationProgress] Cleaning up polling');
      cancelPolling();
    };
  }, [seriesId, userPhone, onComplete, onError]);

  // 计算进度百分比
  const getProgressPercentage = () => {
    if (!progress || !progress.currentStep || !progress.totalSteps) {
      return 0;
    }
    return Math.round((progress.currentStep / progress.totalSteps) * 100);
  };

  // 获取状态文本
  const getStatusText = () => {
    if (status === 'completed') {
      return '✅ 创作完成';
    }
    if (status === 'failed') {
      return '❌ 创作失败';
    }
    if (progress?.stepName) {
      return progress.stepName;
    }
    return '准备中...';
  };

  // 获取状态颜色
  const getStatusColor = () => {
    if (status === 'completed') return 'text-green-600';
    if (status === 'failed') return 'text-red-600';
    return 'text-blue-600';
  };

  const percentage = getProgressPercentage();

  return (
    <div className="w-full max-w-2xl mx-auto p-6 bg-white rounded-lg shadow-md">
      {/* 标题 */}
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-gray-800">
          AI正在创作您的漫剧
        </h3>
        <p className="text-sm text-gray-500 mt-1">
          这可能需要1-3分钟，请耐心等待...
        </p>
      </div>

      {/* 进度条 */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <span className={`text-sm font-medium ${getStatusColor()}`}>
            {getStatusText()}
          </span>
          <span className="text-sm font-semibold text-gray-700">
            {percentage}%
          </span>
        </div>
        
        <div className="w-full h-3 bg-gray-200 rounded-full overflow-hidden">
          <div
            className={`h-full transition-all duration-500 ease-out rounded-full ${
              status === 'completed'
                ? 'bg-green-500'
                : status === 'failed'
                ? 'bg-red-500'
                : 'bg-blue-500 animate-pulse'
            }`}
            style={{ width: `${percentage}%` }}
          />
        </div>
      </div>

      {/* 步骤信息 */}
      {progress && (
        <div className="bg-gray-50 rounded-lg p-4">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-gray-500">当前步骤：</span>
              <span className="ml-2 font-medium text-gray-800">
                {progress.currentStep || 0} / {progress.totalSteps || 3}
              </span>
            </div>
            {progress.updatedAt && (
              <div>
                <span className="text-gray-500">更新时间：</span>
                <span className="ml-2 font-medium text-gray-800">
                  {new Date(progress.updatedAt).toLocaleTimeString('zh-CN')}
                </span>
              </div>
            )}
          </div>

          {/* 错误信息 */}
          {status === 'failed' && progress.error && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-md">
              <p className="text-sm text-red-800">
                <strong>错误信息：</strong> {progress.error}
              </p>
            </div>
          )}
        </div>
      )}

      {/* 加载动画 */}
      {status === 'generating' && (
        <div className="mt-4 flex items-center justify-center space-x-2">
          <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
          <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
          <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
        </div>
      )}
    </div>
  );
};

export default SeriesGenerationProgress;
