import React, { useState } from 'react';
import { toast } from 'sonner';
import * as seriesService from '../../services';
import { cancelBatchGeneration } from '../../services';
import { apiRequest } from '../../utils';
import { getErrorMessage } from '../../utils';
import type { Series } from '../../types';
import {
  EmptyState,
  SeriesCard,
  SeriesDetailModal,
  SeriesSearchBar,
} from './SeriesListWidgets';
import { ConfirmDialog, useConfirm } from './ConfirmDialog';

interface SeriesListViewProps {
  series: Series[];
  onEdit: (series: Series) => void;
  onCreateNew: () => void;
  userPhone?: string;
  onDelete: (seriesId: string) => void;
  onRefresh?: () => void;
  onUpdate?: (callback: (prev: Series[]) => Series[]) => void;
  onSeriesDeleted?: (seriesId: string) => void; // v6.0.6: clean up floating widget tasks
}

export function SeriesListView({ series, onEdit, onCreateNew, userPhone, onDelete, onRefresh, onUpdate, onSeriesDeleted }: SeriesListViewProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'draft' | 'in-progress' | 'completed'>('all');
  const [showDownloadMenu, setShowDownloadMenu] = useState<string | null>(null);
  const [showDetailModal, setShowDetailModal] = useState<Series | null>(null);
  const [downloadingVideos, setDownloadingVideos] = useState<Set<string>>(new Set());
  const { confirm: confirmAction, dialogProps } = useConfirm();

  const safeSeries = Array.isArray(series) ? series : [];

  // ==================== Handlers ====================

  const handleDelete = async (seriesId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    
    if (!userPhone) return;
    
    const confirmed = await confirmAction({
      title: '删除作品',
      description: '确定要删除这部作品吗？此操作不可恢复，关联的视频生成任务也会被取消。',
      confirmText: '确认删除',
      cancelText: '取消',
      variant: 'danger',
      icon: 'delete',
    });
    if (confirmed) {
      cancelBatchGeneration(seriesId);
      onSeriesDeleted?.(seriesId);
      
      apiRequest(`/volcengine/cancel-series-tasks/${seriesId}`, {
        method: 'POST',
        silent: true,
        timeout: 10000,
        maxRetries: 1,
      }).catch((err: unknown) => console.warn('[SeriesListView] cancel-series-tasks failed (non-blocking):', err instanceof Error ? err.message : err));
      
      const result = await seriesService.deleteSeries(seriesId, userPhone);
      if (result.success) {
        toast.success('作品已删除，关联的视频任务已取消');
        onDelete(seriesId);
      } else {
        toast.error('删除失败：' + result.error);
      }
    }
  };

  const handleDownloadVideos = async (item: Series) => {
    if (!item.episodes || item.episodes.length === 0) {
      toast.error('该作品还没有生成视频');
      return;
    }

    const completedVideos = item.episodes.flatMap(episode => 
      episode.storyboards?.filter(sb => sb.status === 'completed' && sb.videoUrl) || []
    );

    if (completedVideos.length === 0) {
      toast.error('该作品还没有已完成的视频，请先生成视频');
      return;
    }

    const confirmed = await confirmAction({
      title: '下载视频',
      description: `将下载 ${completedVideos.length} 个视频片段，是否继续？`,
      confirmText: '开始下载',
      cancelText: '取消',
      variant: 'info',
      icon: 'question',
    });
    if (!confirmed) {
      return;
    }

    setDownloadingVideos(prev => new Set(prev).add(item.id));
    setShowDownloadMenu(null);

    try {
      for (let i = 0; i < completedVideos.length; i++) {
        const storyboard = completedVideos[i];
        const episode = item.episodes.find(ep => ep.id === storyboard.episodeId);
        
        try {
          const response = await fetch(storyboard.videoUrl!);
          const blob = await response.blob();
          
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `${item.title}-第${episode?.episodeNumber}集-场景${storyboard.sceneNumber}.mp4`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          
          if (i < completedVideos.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 500));
          }
        } catch (error: unknown) {
          console.error(`下载视频失败: 第${episode?.episodeNumber}集-场景${storyboard.sceneNumber}`, error);
        }
      }
      
      toast.success(`成功下载 ${completedVideos.length} 个视频！`);
    } catch (error: unknown) {
      console.error('下载视频出错:', error);
      toast.error('下载失败：' + getErrorMessage(error));
    } finally {
      setDownloadingVideos(prev => {
        const next = new Set(prev);
        next.delete(item.id);
        return next;
      });
    }
  };

  const handleDownload = (item: Series, format: 'json' | 'txt' | 'html') => {
    let content = '';
    let filename = '';
    let mimeType = '';

    if (format === 'json') {
      content = JSON.stringify(item, null, 2);
      filename = `${item.title}-剧本数据.json`;
      mimeType = 'application/json';
    } else if (format === 'txt') {
      content = generateTextFormat(item);
      filename = `${item.title}-剧本.txt`;
      mimeType = 'text/plain';
    } else if (format === 'html') {
      content = generateHTMLFormat(item);
      filename = `${item.title}-剧本.html`;
      mimeType = 'text/html';
    }

    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    setShowDownloadMenu(null);
  };

  const generateTextFormat = (item: Series): string => {
    let text = `${item.title}\n`;
    text += `${'='.repeat(item.title.length)}\n\n`;
    text += `简介：${item.description}\n`;
    text += `类型：${item.genre} | 风格：${item.style}\n`;
    text += `总集数：${item.totalEpisodes}集\n`;
    text += `创建时间：${new Date(item.createdAt).toLocaleString()}\n\n`;
    
    if (item.storyOutline) {
      text += `故事大纲\n${'-'.repeat(20)}\n${item.storyOutline}\n\n`;
    }

    if (item.coreValues && item.coreValues.length > 0) {
      text += `核心价值观：${item.coreValues.join('、')}\n\n`;
    }

    if (item.characters && item.characters.length > 0) {
      text += `角色列表\n${'-'.repeat(20)}\n`;
      item.characters.forEach((char: { name: string; description?: string; appearance?: string; personality?: string; role?: string; growthArc?: string }) => {
        text += `\n【${char.name}】\n`;
        text += `简介：${char.description}\n`;
        if (char.growthArc) text += `成长轨迹：${char.growthArc}\n`;
      });
      text += '\n';
    }

    if (item.episodes && item.episodes.length > 0) {
      text += `剧集详情\n${'='.repeat(20)}\n\n`;
      item.episodes.forEach((ep: { episodeNumber: number; title?: string; synopsis?: string; storyboards?: Array<{ description?: string; dialogue?: string }> }) => {
        text += `第${ep.episodeNumber}集：${ep.title}\n`;
        text += `${'-'.repeat(40)}\n`;
        text += `简介：${ep.synopsis}\n`;
        if (ep.growthTheme) text += `成长主题：${ep.growthTheme}\n`;
        if (ep.growthInsight) text += `成长启示：${ep.growthInsight}\n`;
        
        if (ep.storyboards && ep.storyboards.length > 0) {
          text += `\n分镜场景：\n`;
          ep.storyboards.forEach((scene: { description?: string; dialogue?: string }, idx: number) => {
            text += `  ${idx + 1}. ${scene.description}\n`;
            if (scene.dialogue) text += `     对话：${scene.dialogue}\n`;
          });
        }
        text += '\n';
      });
    }

    return text;
  };

  const generateHTMLFormat = (item: Series): string => {
    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${item.title}</title>
  <style>
    body { font-family: "Microsoft YaHei", sans-serif; max-width: 900px; margin: 0 auto; padding: 20px; line-height: 1.8; }
    h1 { color: #8b5cf6; border-bottom: 3px solid #8b5cf6; padding-bottom: 10px; }
    h2 { color: #ec4899; margin-top: 30px; }
    h3 { color: #3b82f6; }
    .meta { background: #f3f4f6; padding: 15px; border-radius: 8px; margin: 20px 0; }
    .character { background: #fef3c7; padding: 10px; margin: 10px 0; border-left: 4px solid #f59e0b; }
    .episode { background: #e0e7ff; padding: 15px; margin: 15px 0; border-radius: 8px; }
    .scene { margin: 10px 0; padding: 10px; background: white; border-left: 3px solid #8b5cf6; }
    .tag { display: inline-block; background: #8b5cf6; color: white; padding: 3px 10px; border-radius: 4px; margin: 2px; }
  </style>
</head>
<body>
  <h1>${item.title}</h1>
  
  <div class="meta">
    <p><strong>简介：</strong>${item.description}</p>
    <p><strong>类型：</strong>${item.genre} | <strong>风格：</strong>${item.style}</p>
    <p><strong>总集数：</strong>${item.totalEpisodes}集</p>
    <p><strong>创建时间：</strong>${new Date(item.createdAt).toLocaleString()}</p>
    ${item.coreValues && item.coreValues.length > 0 ? `<p><strong>核心价值观：</strong>${item.coreValues.map((v: string) => `<span class="tag">${v}</span>`).join('')}</p>` : ''}
  </div>

  ${item.storyOutline ? `<h2>故事大纲</h2><p>${item.storyOutline.replace(/\\n/g, '<br>')}</p>` : ''}

  ${item.characters && item.characters.length > 0 ? `
    <h2>角色列表</h2>
    ${item.characters.map((char: { name: string; description?: string; appearance?: string; personality?: string; role?: string; growthArc?: string }) => `
      <div class="character">
        <h3>${char.name}</h3>
        <p>${char.description}</p>
        ${char.growthArc ? `<p><strong>成长轨迹：</strong>${char.growthArc}</p>` : ''}
      </div>
    `).join('')}
  ` : ''}

  ${item.episodes && item.episodes.length > 0 ? `
    <h2>剧集详情</h2>
    ${item.episodes.map((ep: { episodeNumber: number; title?: string; synopsis?: string; storyboards?: Array<{ description?: string; dialogue?: string }> }) => `
      <div class="episode">
        <h3>第${ep.episodeNumber}集：${ep.title}</h3>
        <p><strong>简介：</strong>${ep.synopsis}</p>
        ${ep.growthTheme ? `<p><strong>成长主题：</strong>${ep.growthTheme}</p>` : ''}
        ${ep.growthInsight ? `<p><strong>成长启示：</strong>${ep.growthInsight}</p>` : ''}
        
        ${ep.storyboards && ep.storyboards.length > 0 ? `
          <h4>分镜场景</h4>
          ${ep.storyboards.map((scene: { description?: string; dialogue?: string }, idx: number) => `
            <div class="scene">
              <strong>场景${idx + 1}：</strong>${scene.description}
              ${scene.dialogue ? `<br><strong>对话：</strong>${scene.dialogue}` : ''}
            </div>
          `).join('')}
        ` : ''}
      </div>
    `).join('')}
  ` : ''}

  <hr style="margin-top: 50px;">
  <p style="text-align: center; color: #666;">AI影视创作系统生成 | ${new Date().toLocaleString()}</p>
</body>
</html>`;
  };

  const handleRetrySeries = async (seriesId: string, storyOutline: string) => {
    if (!userPhone) return;
    
    try {
      const result = await seriesService.retrySeries(seriesId, userPhone, storyOutline);
      
      if (result.success) {
        toast.success('AI正在重新创作中，页面会自动更新进度。');
        
        if (onRefresh) {
          onRefresh();
        }
      } else {
        toast.error('重试失败：' + (result.error || '未知错误'));
      }
    } catch (error: unknown) {
      console.error('[SeriesListView] Retry failed:', error);
      toast.error('重试失败：' + getErrorMessage(error));
    }
  };

  // Filter logic
  const filteredSeries = safeSeries.filter(item => {
    const matchSearch = (item.title || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                       (item.description || '').toLowerCase().includes(searchTerm.toLowerCase());
    const matchStatus = filterStatus === 'all' || 
                       item.status === filterStatus ||
                       (filterStatus === 'in-progress' && (item.status === 'generating' || item.status === 'in-progress'));
    return matchSearch && matchStatus;
  });

  // ==================== Render ====================

  if (!userPhone) {
    return <EmptyState type="no-login" />;
  }

  if (safeSeries.length === 0) {
    return (
      <EmptyState 
        type="no-series" 
        onCreateNew={onCreateNew}
        userPhone={userPhone}
      />
    );
  }

  return (
    <div className="space-y-6">
      <SeriesSearchBar
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        filterStatus={filterStatus}
        onFilterChange={setFilterStatus}
        resultCount={filteredSeries.length}
      />

      {filteredSeries.length === 0 ? (
        <EmptyState type="no-results" />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredSeries.map((item) => (
            <SeriesCard
              key={item.id}
              series={item}
              onEdit={onEdit}
              onDelete={handleDelete}
              onShowDetail={setShowDetailModal}
              onDownload={handleDownload}
              onDownloadVideos={handleDownloadVideos}
              onRetry={handleRetrySeries}
              showDownloadMenu={showDownloadMenu === item.id}
              onToggleDownloadMenu={(e: React.MouseEvent) => {
                e.stopPropagation();
                setShowDownloadMenu(showDownloadMenu === item.id ? null : item.id);
              }}
              isDownloading={downloadingVideos.has(item.id)}
            />
          ))}
        </div>
      )}

      {showDetailModal && (
        <SeriesDetailModal
          series={showDetailModal}
          onClose={() => setShowDetailModal(null)}
          onEdit={onEdit}
        />
      )}
      <ConfirmDialog {...dialogProps} />
    </div>
  );
}