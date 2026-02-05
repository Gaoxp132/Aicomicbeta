import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { X, Loader2, CheckCircle, AlertCircle, Play } from 'lucide-react';
import { Button } from '../ui/button';
import * as seriesVideoService from '../../services/seriesVideoService';

interface BatchGenerateDialogProps {
  isOpen: boolean;
  onClose: () => void;
  seriesId: string;
  episodeId: string;
  episodeTitle: string;
  userPhone: string;
  totalStoryboards: number;
}

export function BatchGenerateDialog({
  isOpen,
  onClose,
  seriesId,
  episodeId,
  episodeTitle,
  userPhone,
  totalStoryboards,
}: BatchGenerateDialogProps) {
  const [taskId, setTaskId] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'starting' | 'processing' | 'completed' | 'failed'>('idle');
  const [progress, setProgress] = useState(0);
  const [completedCount, setCompletedCount] = useState(0);

  const handleStart = async () => {
    setStatus('starting');

    const result = await seriesVideoService.batchGenerateStoryboards(seriesId, episodeId, userPhone);

    if (result.success && result.data) {
      setTaskId(result.data.batchTaskId);
      setStatus('processing');
    } else {
      setStatus('failed');
      alert('启动批量生成失败：' + result.error);
    }
  };

  useEffect(() => {
    if (!taskId || status !== 'processing') return;

    const interval = setInterval(async () => {
      const result = await seriesVideoService.getBatchTaskStatus(taskId);

      if (result.success && result.data) {
        setProgress(result.data.progress);
        setCompletedCount(result.data.completedCount);

        if (result.data.status === 'completed') {
          setStatus('completed');
          clearInterval(interval);
        } else if (result.data.status === 'failed') {
          setStatus('failed');
          clearInterval(interval);
        }
      }
    }, 3000); // 每3秒查询一次

    return () => clearInterval(interval);
  }, [taskId, status]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="w-full max-w-lg bg-gradient-to-br from-gray-900 to-gray-800 rounded-3xl border border-white/10 overflow-hidden"
      >
        {/* 头部 */}
        <div className="flex items-center justify-between p-6 border-b border-white/10">
          <div>
            <h2 className="text-xl font-bold text-white">批量生成视频</h2>
            <p className="text-sm text-gray-400 mt-1">{episodeTitle}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/10 rounded-lg transition-colors"
            disabled={status === 'processing'}
          >
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        {/* 内容 */}
        <div className="p-6">
          {status === 'idle' && (
            <div className="text-center py-8">
              <div className="w-20 h-20 bg-gradient-to-br from-purple-500/20 to-pink-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
                <Play className="w-10 h-10 text-purple-400" />
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">
                准备批量生成
              </h3>
              <p className="text-gray-400 mb-6">
                将生成 {totalStoryboards} 个分镜视频
              </p>
              <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4 text-left mb-6">
                <p className="text-sm text-blue-300">
                  💡 提示：批量生成将按顺序处理所有分镜，预计需要 {Math.ceil(totalStoryboards * 2)} 分钟
                </p>
              </div>
              <Button
                onClick={handleStart}
                className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600"
              >
                <Play className="w-4 h-4 mr-2" />
                开始生成
              </Button>
            </div>
          )}

          {status === 'starting' && (
            <div className="text-center py-8">
              <Loader2 className="w-12 h-12 text-purple-400 animate-spin mx-auto mb-4" />
              <p className="text-white">正在启动批量生成...</p>
            </div>
          )}

          {status === 'processing' && (
            <div className="space-y-6">
              <div className="text-center">
                <div className="text-4xl font-bold text-white mb-2">
                  {completedCount} / {totalStoryboards}
                </div>
                <p className="text-gray-400">已完成</p>
              </div>

              {/* 进度条 */}
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">进度</span>
                  <span className="text-white font-medium">{progress}%</span>
                </div>
                <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                  <motion.div
                    className="h-full bg-gradient-to-r from-purple-500 to-pink-500"
                    initial={{ width: 0 }}
                    animate={{ width: `${progress}%` }}
                    transition={{ duration: 0.3 }}
                  />
                </div>
              </div>

              <div className="flex items-center justify-center gap-2 text-sm text-gray-400">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>正在生成视频，请勿关闭...</span>
              </div>
            </div>
          )}

          {status === 'completed' && (
            <div className="text-center py-8">
              <div className="w-20 h-20 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
                <CheckCircle className="w-10 h-10 text-green-400" />
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">
                生成完成！
              </h3>
              <p className="text-gray-400 mb-6">
                已成功生成 {totalStoryboards} 个分镜视频
              </p>
              <Button
                onClick={onClose}
                className="bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600"
              >
                完成
              </Button>
            </div>
          )}

          {status === 'failed' && (
            <div className="text-center py-8">
              <div className="w-20 h-20 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
                <AlertCircle className="w-10 h-10 text-red-400" />
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">
                生成失败
              </h3>
              <p className="text-gray-400 mb-6">
                批量生成过程中出现错误
              </p>
              <div className="flex gap-3 justify-center">
                <Button onClick={onClose} variant="ghost">
                  关闭
                </Button>
                <Button
                  onClick={() => {
                    setStatus('idle');
                    setTaskId(null);
                    setProgress(0);
                    setCompletedCount(0);
                  }}
                  className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600"
                >
                  重试
                </Button>
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
