import { Loader2 } from 'lucide-react';

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
