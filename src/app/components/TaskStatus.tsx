/**
 * Task Status components — merged to reduce module count
 * v6.0.68: Merged TaskStatusButton.tsx + TaskStatusFloating.tsx
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { X, CheckCircle2, Loader2, AlertCircle, Eye, Ban } from 'lucide-react';
import type { Comic } from '../types/index';
import { apiRequest } from '../utils';

// ═══════════════════════════════════════════════════════════════════
// TaskStatusButton (was TaskStatusButton.tsx)
// ═══════════════════════════════════════════════════════════════════

interface TaskStatusButtonProps {
  activeTasks: number;
  onClick: () => void;
}

export function TaskStatusButton({ activeTasks, onClick }: TaskStatusButtonProps) {
  if (activeTasks === 0) {
    return null;
  }

  return (
    <button
      onClick={onClick}
      className="fixed top-20 right-4 z-40 flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white rounded-full shadow-lg shadow-purple-500/50 transition-all hover:scale-105 active:scale-95"
    >
      <Loader2 className="w-4 h-4 animate-spin" />
      <span className="text-sm font-medium">
        {activeTasks} 个任务生成中
      </span>
    </button>
  );
}

// ═══════════════════════════════════════════════════════════════════
// TaskStatusFloating (was TaskStatusFloating.tsx)
// ═══════════════════════════════════════════════════════════════════

interface TaskStatusFloatingProps {
  tasks: Comic[];
  onTaskClick: (task: Comic) => void;
  onClose: () => void;
  onTaskCancelled?: (taskId: string) => void; // v6.0.5: 取消任务回调
}

export function TaskStatusFloating({ tasks, onTaskClick, onClose, onTaskCancelled }: TaskStatusFloatingProps) {
  // 只显示正在生成中的任务
  const activeTasks = tasks.filter(task => task.status === 'generating');
  
  if (activeTasks.length === 0) {
    return null;
  }

  return (
    <div className="fixed top-20 right-4 z-50 w-80 max-w-[calc(100vw-2rem)]">
      {/* 半透明背景 */}
      <div className="absolute inset-0 bg-gradient-to-br from-purple-900/40 to-pink-900/40 backdrop-blur-xl rounded-2xl border border-white/10" />
      
      {/* 内容 */}
      <div className="relative p-4">
        {/* 头部 */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
            <h3 className="text-white font-medium">正在生成 ({activeTasks.length})</h3>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors p-1 hover:bg-white/10 rounded-lg"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 后台生成提示 */}
        <div className="mb-3 px-3 py-2 bg-blue-500/10 border border-blue-500/20 rounded-lg">
          <p className="text-xs text-blue-300 leading-relaxed">
            任务将在后台持续生成，即使关闭应用也不影响。重新打开应用时会自动加载进度。
          </p>
        </div>

        {/* 任务列表 */}
        <div className="space-y-2 max-h-[60vh] overflow-y-auto custom-scrollbar">
          {activeTasks.map((task, index) => (
            <TaskItem
              key={task.id || task.taskId || `task-${index}`}
              task={task}
              onClick={() => onTaskClick(task)}
              onTaskCancelled={onTaskCancelled}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// TaskItem (internal)
// ═══════════════════════════════════════════════════════════════════

interface TaskItemProps {
  task: Comic;
  onClick: () => void;
  onTaskCancelled?: (taskId: string) => void;
}

// v6.0.16: 真实进度数据接口
interface RealProgress {
  currentStep: number;
  totalSteps: number;
  stepName: string;
  percentage: number;
}

function TaskItem({ task, onClick, onTaskCancelled }: TaskItemProps) {
  const [progress, setProgress] = useState(0);
  const [realProgress, setRealProgress] = useState<RealProgress | null>(null);
  const [stepName, setStepName] = useState('');
  const [isSeriesCompleted, setIsSeriesCompleted] = useState(false); // v6.0.77: 剧本已完成但视频仍在生成
  const [isStale, setIsStale] = useState(false); // v6.0.77: 任务卡住超时
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const seriesIdRef = useRef<string | null>(null);

  // v6.0.16: 提取seriesId
  const getSeriesId = useCallback((): string | null => {
    if (task.seriesId) return task.seriesId;
    if (task.metadata) {
      try {
        const metadata = typeof task.metadata === 'string' ? JSON.parse(task.metadata) : task.metadata;
        return metadata.seriesId || null;
      } catch { return null; }
    }
    return null;
  }, [task.seriesId, task.metadata]);

  // v6.0.16: 轮询后端真实 generation_progress
  useEffect(() => {
    if (task.status !== 'generating') {
      if (pollRef.current) clearInterval(pollRef.current);
      return;
    }

    const seriesId = getSeriesId();
    seriesIdRef.current = seriesId;

    if (!seriesId) {
      // 非系列任务：使用渐进式模拟进度
      const interval = setInterval(() => {
        setProgress(prev => {
          if (prev >= 90) return prev;
          return prev + Math.random() * 3;
        });
      }, 2000);
      pollRef.current = interval;
      return () => clearInterval(interval);
    }

    // 系列任务：轮询真实进度
    const pollProgress = async () => {
      try {
        // v6.0.77: 检测任务是否卡住（超过15分钟）
        if (task.createdAt) {
          const age = Date.now() - new Date(task.createdAt).getTime();
          if (age > 15 * 60 * 1000) setIsStale(true);
        }

        const result = await apiRequest(`/series/${seriesId}`, {
          method: 'GET',
          silent: true,
        });
        if (result.success && result.data) {
          const seriesStatus = result.data.status;
          // v6.0.77: 如果系列已completed/failed，说明剧本生成已结束，视频任务才是卡住的
          if (seriesStatus === 'completed' || seriesStatus === 'failed') {
            setIsSeriesCompleted(true);
            setStepName('视频生成中...');
            // 不再更新系列进度，改为模拟视频生成进度
            setProgress(prev => prev < 50 ? 50 : Math.min(prev + 1, 95));
            return;
          }

          const gp = result.data.generationProgress || result.data.generation_progress;
          if (gp && typeof gp === 'object' && gp.totalSteps) {
            const pct = Math.min(Math.round((gp.currentStep / gp.totalSteps) * 100), 99);
            setRealProgress({
              currentStep: gp.currentStep,
              totalSteps: gp.totalSteps,
              stepName: gp.stepName || '',
              percentage: pct,
            });
            setProgress(pct);
            setStepName(gp.stepName || '');
          }
        }
      } catch (e) {
        // 静默失败，不影响UI
        console.debug('[TaskStatusFloating] Poll error:', e);
      }
    };

    // 立即执行一次
    pollProgress();
    // 每6秒轮询
    const interval = setInterval(pollProgress, 6000);
    pollRef.current = interval;

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [task.status, getSeriesId]);

  const getStatusIcon = () => {
    switch (task.status) {
      case 'generating':
        if (isStale) return <AlertCircle className="w-4 h-4 text-amber-400" />;
        return <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />;
      case 'completed':
        return <CheckCircle2 className="w-4 h-4 text-green-400" />;
      case 'failed':
        return <AlertCircle className="w-4 h-4 text-red-400" />;
      default:
        return <Loader2 className="w-4 h-4 text-gray-400 animate-spin" />;
    }
  };

  const getStatusText = () => {
    switch (task.status) {
      case 'generating':
        // v6.0.77: 如果任务卡住超时，显示提示
        if (isStale) return '任务可能已超时，请取消重试';
        // v6.0.77: 如果系列已完成，说明是视频生成阶段
        if (isSeriesCompleted) return '视频生成中...';
        // v6.0.16: 优先显示真实进度步骤名
        if (stepName) return stepName;
        if (realProgress) return `步骤 ${realProgress.currentStep}/${realProgress.totalSteps}`;
        // fallback: metadata 中的分镜信息
        if (task.metadata) {
          try {
            const metadata = typeof task.metadata === 'string' ? JSON.parse(task.metadata) : task.metadata;
            if (metadata.seriesId) {
              return `第${metadata.episodeNumber || '?'}集 - 分镜${metadata.storyboardNumber || '?'}`;
            }
          } catch { /* ignore */ }
        }
        return '生成中...';
      case 'completed':
        return '已完成';
      case 'failed':
        return (task as any).error || '生成失败';
      default:
        return '等待中...';
    }
  };

  const getDetailedTitle = () => {
    if (task.metadata) {
      try {
        const metadata = typeof task.metadata === 'string' ? JSON.parse(task.metadata) : task.metadata;
        if (metadata.seriesId) {
          // v6.0.77: 优先从title提取（格式: "漫剧名-E1-场景1"），避免从enriched prompt中提取到角色锁定指令
          if (task.title && !task.title.startsWith('漫剧《') && !task.title.includes('角色外貌') && !task.title.includes('【')) {
            return task.title;
          }
          // 尝试从prompt提取漫剧名（格式: 漫剧《xxx》）
          const seriesMatch = task.prompt?.match(/漫剧《(.+?)》/);
          if (seriesMatch) {
            const epNum = metadata.episodeNumber || '?';
            const sbNum = metadata.storyboardNumber || '?';
            return `${seriesMatch[1]} E${epNum}-场景${sbNum}`;
          }
          return `第${metadata.episodeNumber || '?'}集 - 分镜${metadata.storyboardNumber || '?'}`;
        }
      } catch {
        // 解析失败，使用原标题
      }
    }
    return task.title;
  };

  // v6.0.16: 计算显示百分比
  const displayProgress = realProgress ? realProgress.percentage : Math.round(progress);

  return (
    <div
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onClick(); }}
      className="w-full bg-white/5 hover:bg-white/10 rounded-xl p-3 transition-all text-left border border-white/5 hover:border-white/20 group cursor-pointer relative"
    >
      {/* 任务信息 */}
      <div className="flex items-start gap-3">
        {/* 缩略图 */}
        <div className="w-12 h-12 rounded-lg overflow-hidden flex-shrink-0 bg-gradient-to-br from-purple-500/20 to-pink-500/20 flex items-center justify-center">
          {task.thumbnail ? (
            <img
              src={task.thumbnail}
              alt={task.title}
              className="w-full h-full object-cover"
            />
          ) : (
            <Eye className="w-6 h-6 text-purple-300" />
          )}
        </div>

        {/* 文本信息 */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            {getStatusIcon()}
            <span className="text-xs text-gray-400">{getStatusText()}</span>
          </div>
          
          <p className="text-sm text-white font-medium truncate mb-1">
            {getDetailedTitle()}
          </p>
          
          {/* v6.0.16: 真实进度条 */}
          {task.status === 'generating' && (
            <div className="mt-2">
              <div className="flex items-center justify-between mb-1">
                <span className={`text-xs ${isStale ? 'text-amber-400' : 'text-gray-500'}`}>
                  {isStale ? '任务超时' : isSeriesCompleted
                    ? '视频生成中'
                    : realProgress
                      ? `${realProgress.currentStep}/${realProgress.totalSteps} ${stepName}`
                      : '处理中'}
                </span>
                <span className={`text-xs font-medium ${isStale ? 'text-amber-400' : 'text-purple-400'}`}>{displayProgress}%</span>
              </div>
              <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all duration-500 ease-out ${isStale ? 'bg-gradient-to-r from-amber-500 to-red-500' : 'bg-gradient-to-r from-purple-500 to-pink-500'}`}
                  style={{ width: `${displayProgress}%` }}
                />
              </div>
            </div>
          )}

          {/* 取消按钮 */}
          {task.status === 'generating' && onTaskCancelled && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onTaskCancelled(task.taskId || task.id || '');
              }}
              className="absolute top-2 right-2 text-gray-400 hover:text-red-400 transition-colors p-1 hover:bg-red-400/10 rounded-lg z-10"
              title="取消任务"
            >
              <Ban className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}