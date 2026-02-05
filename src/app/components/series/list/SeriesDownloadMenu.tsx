import { FileJson, FileText, FileCode, Video } from 'lucide-react';
import type { Series } from '@/app/types';

interface SeriesDownloadMenuProps {
  series: Series;
  onDownload: (format: 'json' | 'txt' | 'html') => void;
  onDownloadVideos: () => void;
  onClose: () => void;
}

export function SeriesDownloadMenu({
  onDownload,
  onDownloadVideos,
  onClose,
}: SeriesDownloadMenuProps) {
  return (
    <div className="absolute top-16 right-4 z-20 bg-gray-900 border border-white/20 rounded-xl shadow-2xl overflow-hidden">
      <button
        onClick={() => onDownload('json')}
        className="w-full px-4 py-3 flex items-center gap-3 hover:bg-white/10 transition-colors text-left"
      >
        <FileJson className="w-4 h-4 text-blue-400" />
        <div>
          <div className="text-white text-sm font-medium">JSON格式</div>
          <div className="text-gray-400 text-xs">完整数据，便于备份</div>
        </div>
      </button>
      <button
        onClick={() => onDownload('txt')}
        className="w-full px-4 py-3 flex items-center gap-3 hover:bg-white/10 transition-colors text-left"
      >
        <FileText className="w-4 h-4 text-green-400" />
        <div>
          <div className="text-white text-sm font-medium">TXT格式</div>
          <div className="text-gray-400 text-xs">纯文本，易于阅读</div>
        </div>
      </button>
      <button
        onClick={() => onDownload('html')}
        className="w-full px-4 py-3 flex items-center gap-3 hover:bg-white/10 transition-colors text-left"
      >
        <FileCode className="w-4 h-4 text-purple-400" />
        <div>
          <div className="text-white text-sm font-medium">HTML格式</div>
          <div className="text-gray-400 text-xs">网页格式，美观打印</div>
        </div>
      </button>
      <button
        onClick={onDownloadVideos}
        className="w-full px-4 py-3 flex items-center gap-3 hover:bg-white/10 transition-colors text-left"
      >
        <Video className="w-4 h-4 text-red-400" />
        <div>
          <div className="text-white text-sm font-medium">下载视频</div>
          <div className="text-gray-400 text-xs">下载已完成的视频片段</div>
        </div>
      </button>
      <button
        onClick={onClose}
        className="w-full px-4 py-2 bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors text-sm"
      >
        取消
      </button>
    </div>
  );
}
