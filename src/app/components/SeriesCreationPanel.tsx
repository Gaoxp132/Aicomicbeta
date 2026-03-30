import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Film, Plus, RefreshCw, BookOpen, Users, Grid3x3, Megaphone } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from './ui';
import { SeriesListView } from './series/SeriesListView';
import { SeriesCreationWizard } from './series/SeriesCreationWizard';
import { SeriesEditor } from './series/SeriesEditor';
import { useSeries } from '../hooks/media';
import * as seriesService from '../services';
import type { Series } from '../types';
import { SERIES_WORKBENCH_PENCIL_BLUEPRINT } from '../constants/pencilUi';
import { getErrorMessage } from '../utils';

interface SeriesCreationPanelProps {
  userPhone?: string;
  initialSeries?: Series | null;
  onBack?: () => void;
  onSeriesDeleted?: (seriesId: string) => void; // v6.0.6: 通知 App 层清理相关任务
}

const WORKBENCH_FEATURE_ICON_MAP = {
  'book-open': BookOpen,
  users: Users,
  megaphone: Megaphone,
  'grid-3x3': Grid3x3,
} as const;

export function SeriesCreationPanel({ userPhone, initialSeries, onBack, onSeriesDeleted }: SeriesCreationPanelProps) {
  const blueprint = SERIES_WORKBENCH_PENCIL_BLUEPRINT;
  const [view, setView] = useState<'list' | 'create' | 'edit'>(initialSeries ? 'edit' : 'list');
  const [selectedSeries, setSelectedSeries] = useState<Series | null>(initialSeries || null);
  const { series, isLoading, error, addSeries, updateSeriesLocal, removeSeriesLocal, loadSeries } = useSeries(userPhone);

  // 🆕 追踪"正在生成中"的作品ID，用于检测完成并自动生成视频
  const generatingSeriesIds = useRef<Set<string>>(new Set());
  // 防止重复触发视频生成
  const videoGenTriggered = useRef<Set<string>>(new Set());

  // v6.0: 响应外部 initialSeries 变化
  useEffect(() => {
    if (initialSeries) {
      setSelectedSeries(initialSeries);
      setView('edit');
    }
  }, [initialSeries]);

  // 🔍 更详细的调试日志
  useEffect(() => {
    if (error) {
      console.error('[SeriesCreationPanel] Error:', error);
    }
  }, [error]);

  // 🆕 核心修复：检测AI作品从 generating → completed，自动触发视频生成
  useEffect(() => {
    if (!Array.isArray(series) || !userPhone) return;

    // 1. 收集当前正在生成中的作品ID
    const currentGenerating = new Set<string>();
    series.forEach(s => {
      if (s.status === 'generating' || s.status === 'in-progress') {
        currentGenerating.add(s.id);
      }
    });

    // 2. 找出 "之前在生成中、现在已完成" 的作品
    const justCompleted = series.filter(s =>
      s.status === 'completed' &&
      generatingSeriesIds.current.has(s.id) &&
      !videoGenTriggered.current.has(s.id)
    );

    // 3. 对刚完成的作品自动触发视频生成
    for (const completedSeries of justCompleted) {
      videoGenTriggered.current.add(completedSeries.id);
      
      toast.success(`"${completedSeries.title}" AI剧本创作完成！正在自动生成视频...`, {
        duration: 5000,
      });

      // 获取完整详情（包含 episodes + storyboards）再触发视频生成
      (async () => {
        try {
          const detailResult = await seriesService.getSeries(completedSeries.id);
          if (!detailResult.success || !detailResult.data) {
            console.error('[SeriesCreation] Failed to fetch completed series detail');
            return;
          }
          const fullSeries = detailResult.data;
          const hasStoryboards = fullSeries.episodes?.some(
            (ep: { storyboards?: unknown[] }) => ep.storyboards && ep.storyboards.length > 0
          );

          if (hasStoryboards) {
            const { generateAllVideosForSeries } = await import('../services');
            const result = await generateAllVideosForSeries(
              fullSeries,
              userPhone,
              (progress) => {
                // 更新本地状态的生成进度
                if (progress.status === 'completed') {
                  toast.success(`"${fullSeries.title}" 全部视频生成完成！`);
                  loadSeries(); // 刷新列表
                }
              }
            );
            if (!result.success) {
              console.error('[SeriesCreation] Auto video generation failed:', result.error);
              toast.error(`视频生成启动失败: ${result.error}`);
            }
          } else {
            console.warn('[SeriesCreation] Completed series has no storyboards, skipping video gen');
          }
        } catch (err: unknown) {
          console.error('[SeriesCreation] Auto video gen error:', err);
        }
      })();
    }

    // 4. 更新追踪集合
    generatingSeriesIds.current = currentGenerating;
  }, [series, userPhone]);

  const handleCreateNew = () => {
    setView('create');
    setSelectedSeries(null);
  };

  const handleSeriesCreated = (newSeries: Series) => {
    addSeries(newSeries);
    
    // 🎨 如果是AI生成中的状态，留在列表页让用户看到进度
    if (newSeries.status === 'generating') {
      setView('list');
      setSelectedSeries(null);
      // 标记这个作品正在生成中，以便完成后自动触发视频生成
      generatingSeriesIds.current.add(newSeries.id);
      
      toast.success('✨ AI创作已开始！剧本完成后将自动生成视频，请稍候。');
      return;
    }
    
    // ✅ 如果状态是draft（快速创建返回的初始状态），也留在列表页
    if (newSeries.status === 'draft' || !newSeries.episodes || newSeries.episodes.length === 0) {
      setView('list');
      setSelectedSeries(null);
      generatingSeriesIds.current.add(newSeries.id);
      
      toast.success('✨ AI创作已开始！剧本完成后将自动生成视频，页面会自动刷新。');
      return;
    }
    
    // 否则跳转到编辑页面（只有已完成的作品才会进入编辑）
    setSelectedSeries(newSeries);
    setView('edit');
    
    // v6.0: 已完成的作品也通过 useEffect 统一路径触发视频生成
    // 标记为 "已完成但需要视频生成" — 同样由 useEffect + batchVideoService 全局去重保护
    if (userPhone && newSeries.episodes && newSeries.episodes.length > 0) {
      const hasStoryboards = newSeries.episodes.some(
        ep => ep.storyboards && ep.storyboards.length > 0
      );
      
      if (hasStoryboards && !videoGenTriggered.current.has(newSeries.id)) {
        videoGenTriggered.current.add(newSeries.id);
        toast.success('作品创作完成！正在自动生成视频...', { duration: 4000 });
        
        setTimeout(async () => {
          try {
            const { generateAllVideosForSeries: genAll } = await import('../services');
            const result = await genAll(
              newSeries,
              userPhone,
              (progress) => {
                if (progress.status === 'completed') {
                  toast.success('🎬 全部视频生成完成！');
                }
              }
            );
            if (!result.success) {
              console.error('[SeriesCreation] Auto-generation failed:', result.error);
              toast.error(`视频生成失败: ${result.error}`);
            }
          } catch (err: unknown) {
            console.error('[SeriesCreation] Auto-generation error:', err);
          }
        }, 1000);
      }
    }
  };

  const handleEditSeries = async (series: Series) => {
    try {
      const result = await seriesService.getSeries(series.id);
      
      if (result.success && result.data) {
        const fullSeries = result.data;
        setSelectedSeries(fullSeries);
        setView('edit');
      } else {
        console.error('[SeriesCreationPanel] Failed to load series details:', result.error);
        toast.error(`加载作品详情失败：${result.error}`);
      }
    } catch (error: unknown) {
      console.error('[SeriesCreationPanel] Error loading series details:', error);
      toast.error(`加载失败：${getErrorMessage(error)}，请检查网络连接后重试。`);
    }
  };

  const handleBackToList = () => {
    if (onBack) {
      onBack();
      return;
    }
    setView('list');
    setSelectedSeries(null);
    loadSeries(); // 重新加载列表以获取最新数据
  };

  const handleSeriesUpdated = (updatedSeries: Series) => {
    updateSeriesLocal(updatedSeries);
    setSelectedSeries(updatedSeries);
  };

  const handleSeriesDeleted = (seriesId: string) => {
    removeSeriesLocal(seriesId);
    setView('list');
    setSelectedSeries(null);
    // v6.0.6: 通知上层（App → useVideoGeneration）清理该系列的视频任务
    onSeriesDeleted?.(seriesId);
  };

  return (
    <div className="max-w-7xl mx-auto">
      <AnimatePresence mode="wait">
        {view === 'list' && (
          <motion.div
            key="list"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.3 }}
          >
            {/* 头部 */}
            <div className="mb-8">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 sm:p-3 bg-gradient-to-br from-purple-500/20 to-pink-500/20 rounded-2xl border border-purple-500/30">
                    <Film className="w-5 h-5 sm:w-6 sm:h-6 text-purple-400" />
                  </div>
                  <div>
                    <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-white">{blueprint.header.title}</h1>
                    <p className="text-xs sm:text-sm text-gray-400 mt-1">{blueprint.header.subtitle}</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    onClick={handleCreateNew}
                    className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    {blueprint.actions.createLabel}
                  </Button>
                  <Button
                    onClick={loadSeries}
                    variant="outline"
                    className="border-white/20 text-white hover:bg-white/10"
                  >
                    <RefreshCw className="w-4 h-4 mr-2" />
                    {blueprint.actions.refreshLabel}
                  </Button>
                </div>
              </div>

              {/* 功能特色卡片 */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {blueprint.features.map((feature) => {
                  const Icon = WORKBENCH_FEATURE_ICON_MAP[feature.icon];
                  return (
                    <div key={feature.id} className="bg-white/5 backdrop-blur-xl rounded-2xl p-4 border border-white/10">
                      <div className="flex items-center gap-3 mb-2">
                        <Icon className={`w-5 h-5 ${feature.colorClass}`} />
                        <h3 className="text-white font-medium">{feature.title}</h3>
                      </div>
                      <p className="text-sm text-gray-400">{feature.desc}</p>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 作品列表 */}
            <SeriesListView
              series={series}
              onEdit={handleEditSeries}
              onCreateNew={handleCreateNew}
              userPhone={userPhone}
              onDelete={handleSeriesDeleted}
              onRefresh={loadSeries}
              onSeriesDeleted={onSeriesDeleted}
            />
          </motion.div>
        )}

        {view === 'create' && (
          <motion.div
            key="create"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.3 }}
          >
            <SeriesCreationWizard
              onComplete={handleSeriesCreated}
              onCancel={handleBackToList}
              userPhone={userPhone}
            />
          </motion.div>
        )}

        {view === 'edit' && selectedSeries && (
          <motion.div
            key="edit"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.3 }}
          >
            <SeriesEditor
              series={selectedSeries}
              userPhone={userPhone}
              onBack={handleBackToList}
              onUpdate={handleSeriesUpdated}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}