import { useState, useEffect } from 'react';
import { X, CheckCircle2, Loader2, AlertCircle, Eye, RefreshCw } from 'lucide-react';
import type { Comic } from '../types/index';

interface TaskStatusFloatingProps {
  tasks: Comic[];
  onTaskClick: (task: Comic) => void;
  onClose: () => void;
}

export function TaskStatusFloating({ tasks, onTaskClick, onClose }: TaskStatusFloatingProps) {
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

        {/* 🔄 后台生成提示 */}
        <div className="mb-3 px-3 py-2 bg-blue-500/10 border border-blue-500/20 rounded-lg">
          <p className="text-xs text-blue-300 leading-relaxed">
            💡 任务将在后台持续生成，即使关闭应用也不影响。重新打开应用时会自动加载进度。
          </p>
        </div>

        {/* 任务列表 */}
        <div className="space-y-2 max-h-[60vh] overflow-y-auto custom-scrollbar">
          {activeTasks.map((task) => (
            <TaskItem
              key={task.id}
              task={task}
              onClick={() => onTaskClick(task)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

interface TaskItemProps {
  task: Comic;
  onClick: () => void;
}

function TaskItem({ task, onClick }: TaskItemProps) {
  const [progress, setProgress] = useState(0);

  // 模拟进度条（因为API不提供实时进度）
  useEffect(() => {
    if (task.status === 'generating') {
      const interval = setInterval(() => {
        setProgress((prev) => {
          if (prev >= 90) return prev; // 不超过90%，等待真实完成
          return prev + Math.random() * 5;
        });
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [task.status]);

  const getStatusIcon = () => {
    switch (task.status) {
      case 'generating':
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
        // ✅ 如果有 metadata，显示详细进度信息
        if (task.metadata) {
          try {
            const metadata = typeof task.metadata === 'string' ? JSON.parse(task.metadata) : task.metadata;
            if (metadata.seriesId) {
              // 漫剧分镜生成
              return `第${metadata.episodeNumber || '?'}集 - 分镜${metadata.storyboardNumber || '?'}`;
            }
          } catch (e) {
            console.error('[TaskItem] Failed to parse metadata:', e);
          }
        }
        return '生成中...';
      case 'completed':
        return '已完成';
      case 'failed':
        return '生成失败';
      default:
        return '等待中...';
    }
  };

  // ✅ 获取更详细的标题
  const getDetailedTitle = () => {
    if (task.metadata) {
      try {
        const metadata = typeof task.metadata === 'string' ? JSON.parse(task.metadata) : task.metadata;
        if (metadata.seriesId) {
          // 从 prompt 中提取漫剧标题（通常 prompt 包含完整信息）
          const titleMatch = task.prompt?.match(/【(.+?)】/);
          const seriesTitle = titleMatch ? titleMatch[1] : task.title;
          return seriesTitle;
        }
      } catch (e) {
        // 解析失败，使用原标题
      }
    }
    return task.title;
  };

  return (
    <button
      onClick={onClick}
      className="w-full bg-white/5 hover:bg-white/10 rounded-xl p-3 transition-all text-left border border-white/5 hover:border-white/20 group"
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
          
          <p className="text-xs text-gray-400 truncate">
            {task.prompt}
          </p>

          {/* 进度条 */}
          {task.status === 'generating' && (
            <div className="mt-2">
              <div className="h-1 bg-white/10 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-purple-500 to-pink-500 transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="text-xs text-gray-500 mt-1">
                预计还需 {Math.ceil((100 - progress) / 10)} 分钟
              </p>
            </div>
          )}
        </div>
      </div>
    </button>
  );
}