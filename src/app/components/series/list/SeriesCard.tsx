import { motion } from 'motion/react';
import {
  Edit2,
  Trash2,
  Download,
  Film,
  Calendar,
  Eye,
  RotateCcw,
  Sparkles,
} from 'lucide-react';
import { Button } from '@/app/components/ui/button';
import type { Series } from '@/app/types';
import { SeriesDownloadMenu } from './SeriesDownloadMenu';

interface SeriesCardProps {
  series: Series;
  onEdit: (series: Series) => void;
  onDelete: (seriesId: string, e: React.MouseEvent) => void;
  onShowDetail: (series: Series) => void;
  onDownload: (series: Series, format: 'json' | 'txt' | 'html') => void;
  onDownloadVideos: (series: Series) => void;
  onRetry: (seriesId: string, storyOutline: string) => void;
  showDownloadMenu: boolean;
  onToggleDownloadMenu: (e: React.MouseEvent) => void;
  isDownloading: boolean;
}

export function SeriesCard({
  series,
  onEdit,
  onDelete,
  onShowDetail,
  onDownload,
  onDownloadVideos,
  onRetry,
  showDownloadMenu,
  onToggleDownloadMenu,
}: SeriesCardProps) {
  return (
    <motion.div
      key={series.id}
      whileHover={{ y: -4 }}
      className="bg-white/5 backdrop-blur-xl rounded-2xl border border-white/10 overflow-hidden group relative"
    >
      {/* 下载菜单 */}
      {showDownloadMenu && (
        <SeriesDownloadMenu
          series={series}
          onDownload={(format) => onDownload(series, format)}
          onDownloadVideos={() => onDownloadVideos(series)}
          onClose={() => onToggleDownloadMenu({} as React.MouseEvent)}
        />
      )}

      {/* 封面图 */}
      <div className="relative aspect-video bg-gradient-to-br from-purple-500/20 to-pink-500/20 overflow-hidden">
        {series.coverImageUrl || series.coverImage ? (
          <img
            src={series.coverImageUrl || series.coverImage}
            alt={series.title}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Film className="w-16 h-16 text-white/20" />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
        
        {/* 状态标签 */}
        <div className="absolute top-3 left-3">
          <span className={`px-3 py-1 rounded-full text-xs font-medium ${
            series.status === 'completed'
              ? 'bg-green-500/20 text-green-400 border border-green-500/30'
              : series.status === 'in-progress'
              ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
              : 'bg-gray-500/20 text-gray-400 border border-gray-500/30'
          }`}>
            {series.status === 'completed' ? '已完成' : series.status === 'in-progress' ? '创作中' : '草稿'}
          </span>
        </div>

        {/* 悬停操作 */}
        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-wrap items-center justify-center gap-2 p-4">
          <Button
            onClick={() => onEdit(series)}
            size="sm"
            className="bg-white/10 hover:bg-white/20 backdrop-blur-xl border border-white/20"
          >
            <Edit2 className="w-4 h-4 mr-1" />
            编辑
          </Button>
          <Button
            onClick={() => onShowDetail(series)}
            size="sm"
            className="bg-blue-500/20 hover:bg-blue-500/30 backdrop-blur-xl border border-blue-500/30"
          >
            <Eye className="w-4 h-4 mr-1" />
            详情
          </Button>
          <Button
            onClick={onToggleDownloadMenu}
            size="sm"
            className="bg-green-500/20 hover:bg-green-500/30 backdrop-blur-xl border border-green-500/30"
          >
            <Download className="w-4 h-4 mr-1" />
            下载
          </Button>
          <Button
            onClick={(e) => onDelete(series.id, e)}
            size="sm"
            className="bg-red-500/20 hover:bg-red-500/30 backdrop-blur-xl border border-red-500/30"
          >
            <Trash2 className="w-4 h-4 mr-1" />
            删除
          </Button>
        </div>
      </div>

      {/* 内容信息 */}
      <div className="p-4">
        <h3 className="text-lg font-semibold text-white mb-2 line-clamp-1">
          {series.title}
        </h3>
        <p className="text-sm text-gray-400 mb-3 line-clamp-2">
          {series.description}
        </p>

        {/* AI生成中提示 */}
        {series.status === 'generating' && (
          <div className="mb-3 p-3 bg-gradient-to-r from-purple-500/20 to-pink-500/20 border border-purple-500/30 rounded-xl">
            <div className="flex items-center gap-2 text-purple-300 text-sm">
              <Sparkles className="w-4 h-4 animate-pulse" />
              <span className="font-medium">
                {series.queueStatus === 'queued' ? '⏳ 排队等待中...' : 'AI正在创作中...'}
              </span>
            </div>
            {series.generationProgress && (
              <div className="mt-2 text-xs text-gray-400">
                {series.queueStatus === 'queued' 
                  ? '您有其他漫剧正在生成，请稍候...' 
                  : `${series.generationProgress.stepName} (${series.generationProgress.currentStep}/${series.generationProgress.totalSteps})`
                }
              </div>
            )}
          </div>
        )}

        {/* 生成失败提示 */}
        {series.status === 'failed' && (
          <div className="mb-3 p-3 bg-red-500/20 border border-red-500/30 rounded-xl">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-red-300 text-sm font-medium">
                  ❌ 创作失败
                </div>
                {series.generationProgress?.error && (
                  <div className="mt-1 text-xs text-red-400">
                    {series.generationProgress.error}
                  </div>
                )}
              </div>
              <Button
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  onRetry(series.id, series.storyOutline || series.theme || '');
                }}
                className="bg-red-500 hover:bg-red-600 text-white text-xs"
              >
                <RotateCcw className="w-3 h-3 mr-1" />
                重试
              </Button>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between text-xs text-gray-500 mb-3">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1">
              <Film className="w-3 h-3" />
              {/* 🔥 修复：使用实际剧集数作为分母，避免显示不一致（如3/1） */}
              {series.stats?.episodesCount || series.episodes?.length || 0}/{series.stats?.episodesCount || series.episodes?.length || series.totalEpisodes || 0} 集
            </span>
            <span className="flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              {new Date(series.createdAt).toLocaleDateString()}
            </span>
          </div>
        </div>

        {/* 标签 */}
        <div className="flex flex-wrap gap-2">
          {series.genre && (
            <span className="px-2 py-1 bg-purple-500/10 text-purple-400 rounded-lg text-xs">
              {series.genre}
            </span>
          )}
          {series.style && (
            <span className="px-2 py-1 bg-blue-500/10 text-blue-400 rounded-lg text-xs">
              {series.style}
            </span>
          )}
          {series.coreValues && series.coreValues.length > 0 && (
            <span className="px-2 py-1 bg-green-500/10 text-green-400 rounded-lg text-xs">
              {series.coreValues[0]}
            </span>
          )}
        </div>
      </div>
    </motion.div>
  );
}