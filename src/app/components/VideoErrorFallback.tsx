import { useState } from 'react';
import { Button } from './ui/button';
import { AlertTriangle, Wrench, Loader2 } from 'lucide-react';
import type { Episode } from '../types';

interface VideoErrorFallbackProps {
  episode: Episode;
  error?: {
    errorType?: string;
    networkState?: number;
    readyState?: number;
  };
  onRepair?: (episodeId: string) => Promise<void>;
}

export function VideoErrorFallback({ episode, error, onRepair }: VideoErrorFallbackProps) {
  const [isRepairing, setIsRepairing] = useState(false);

  const handleRepair = async () => {
    if (!onRepair) return;
    
    setIsRepairing(true);
    try {
      await onRepair(episode.id);
    } finally {
      setIsRepairing(false);
    }
  };

  return (
    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-red-900/20 to-orange-900/20 border-2 border-red-500/30 rounded-lg p-6">
      <div className="text-center">
        {/* 图标 */}
        <div className="w-20 h-20 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
          <AlertTriangle className="w-10 h-10 text-red-400" />
        </div>

        {/* 标题 */}
        <h3 className="text-2xl font-bold text-red-300 mb-6">
          视频无法播放
        </h3>

        {/* 操作按钮 */}
        {onRepair && (
          <Button
            onClick={handleRepair}
            disabled={isRepairing}
            className="bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 text-white font-semibold px-10 py-4 text-lg shadow-xl"
          >
            {isRepairing ? (
              <>
                <Loader2 className="w-6 h-6 mr-2 animate-spin" />
                修复中...
              </>
            ) : (
              <>
                <Wrench className="w-6 h-6 mr-2" />
                修复视频
              </>
            )}
          </Button>
        )}
      </div>
    </div>
  );
}