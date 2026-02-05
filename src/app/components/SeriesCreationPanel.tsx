import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Sparkles, Film, Plus, RefreshCw, BookOpen, Users, Grid3x3, Bug } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from './ui/button';
import { SeriesListView } from './series/SeriesListView';
import { SeriesCreationWizard } from './series/SeriesCreationWizard';
import { SeriesEditor } from './series/SeriesEditor';
import { useSeries } from '../hooks/useSeries';
import * as seriesService from '../services/seriesService';
import type { Series } from '../types';
import { projectId, publicAnonKey } from '/utils/supabase/info';

interface SeriesCreationPanelProps {
  userPhone?: string;
}

export function SeriesCreationPanel({ userPhone }: SeriesCreationPanelProps) {
  const [view, setView] = useState<'list' | 'create' | 'edit'>('list');
  const [selectedSeries, setSelectedSeries] = useState<Series | null>(null);
  const { series, isLoading, error, addSeries, updateSeriesLocal, removeSeriesLocal, loadSeries } = useSeries(userPhone);

  console.log('[SeriesCreationPanel] 🎬 Rendered with:', {
    userPhone,
    seriesLength: series?.length,
    isLoading,
    error,
    view,
    seriesPreview: series?.slice(0, 2).map(s => ({ id: s.id, title: s.title })),
  });

  // 🔍 更详细的调试日志
  useEffect(() => {
    console.log('[SeriesCreationPanel] 🔍 Data Status:', {
      userPhone,
      isLoading,
      hasError: !!error,
      errorMessage: error,
      seriesCount: series?.length || 0,
      seriesIds: series?.map(s => s.id) || [],
    });
  }, [userPhone, isLoading, error, series]);

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
      // 不需要手动触发轮询，useSeries hook会自动检测generating状态并开始轮询
      console.log('[SeriesCreation] ✨ AI generation in progress, staying on list view for progress monitoring');
      
      // 🎯 显示友好提示
      toast.success('✨ AI创作已开始！预计需要30-60秒完成，请在列表中等待。');
      return;
    }
    
    // ✅ 如果状态是draft（快速创建返回的初始状态），也留在列表页
    if (newSeries.status === 'draft' || !newSeries.episodes || newSeries.episodes.length === 0) {
      setView('list');
      setSelectedSeries(null);
      console.log('[SeriesCreation] 📝 Series created in draft state, staying on list view');
      
      // 显示提示，引导用户等待AI生成
      toast.success('✨ AI创作已开始！预计需要30-60秒完成，页面会自动刷新。');
      return;
    }
    
    // 否则跳转到编辑页面（只有已完成的漫剧才会进入编辑）
    setSelectedSeries(newSeries);
    setView('edit');
    
    // 🎬 自动触发视频生成（如果用户已登录）
    if (userPhone && newSeries.episodes && newSeries.episodes.length > 0) {
      // 询问用户是否自动生成视频
      const shouldAutoGenerate = confirm(
        '漫剧创作完成！\n\n是否立即为所有分镜生成视频？\n（可以稍后在编辑页面手动生成）'
      );
      
      if (shouldAutoGenerate) {
        // 延迟一下，让UI有时间更新
        setTimeout(async () => {
          console.log('[SeriesCreation] 🎬 Auto-generating videos for new series');
          
          const batchVideoService = await import('../services/batchVideoGeneration');
          batchVideoService.generateAllVideosForSeries(
            newSeries,
            userPhone,
            (progress) => {
              console.log(`[SeriesCreation] Video generation progress: ${progress.progress}%`);
            }
          ).then(result => {
            if (result.success) {
              toast.success('所有视频已开始生成！您可以在"我的作品"中查看生成进度。');
            } else {
              console.error('[SeriesCreation] Auto-generation failed:', result.error);
            }
          });
        }, 1000);
      }
    }
  };

  const handleEditSeries = async (series: Series) => {
    console.log('[SeriesCreationPanel] 📖 Loading full series details before edit...');
    console.log('[SeriesCreationPanel] Series ID:', series.id);
    console.log('[SeriesCreationPanel] Current episodes count:', series.episodes?.length || 0);
    
    try {
      // 🔄 主动加载完整的series详情（包括所有关联数据）
      console.log('[SeriesCreationPanel] 🌐 Calling seriesService.getSeries...');
      const result = await seriesService.getSeries(series.id, userPhone);
      
      console.log('[SeriesCreationPanel] 🔍 API Response:', {
        success: result.success,
        hasData: !!result.data,
        error: result.error,
      });
      
      if (result.success && result.data) {
        const fullSeries = result.data;
        console.log('[SeriesCreationPanel] ✅ Full series data loaded:');
        console.log('  - Title:', fullSeries.title);
        console.log('  - Status:', fullSeries.status);
        console.log('  - Characters:', fullSeries.characters?.length || 0);
        console.log('  - Episodes:', fullSeries.episodes?.length || 0);
        console.log('  - Raw episodes data:', fullSeries.episodes);
        
        if (fullSeries.episodes && fullSeries.episodes.length > 0) {
          const totalStoryboards = fullSeries.episodes.reduce((sum, ep) => 
            sum + (ep.storyboards?.length || 0), 0
          );
          console.log('  - Total storyboards:', totalStoryboards);
          console.log('  - First episode:', fullSeries.episodes[0]);
        } else {
          console.warn('[SeriesCreationPanel] ⚠️ Episodes array is empty or undefined!');
        }
        
        setSelectedSeries(fullSeries);
        setView('edit');
      } else {
        console.error('[SeriesCreationPanel] Failed to load series details:', result.error);
        alert(`加载漫剧详情失败：${result.error}\n\n请稍后重试或刷新页面。`);
      }
    } catch (error: any) {
      console.error('[SeriesCreationPanel] Error loading series details:', error);
      alert(`加载失败：${error.message}\n\n请检查网络连接后重试。`);
    }
  };

  const handleBackToList = () => {
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
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-gradient-to-br from-purple-500/20 to-pink-500/20 rounded-2xl border border-purple-500/30">
                    <Film className="w-6 h-6 text-purple-400" />
                  </div>
                  <div>
                    <h1 className="text-2xl sm:text-3xl font-bold text-white">漫剧创作</h1>
                    <p className="text-sm text-gray-400 mt-1">创作属于你的连续剧集</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    onClick={handleCreateNew}
                    className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    新建漫剧
                  </Button>
                  <Button
                    onClick={loadSeries}
                    variant="outline"
                    className="border-white/20 text-white hover:bg-white/10"
                  >
                    <RefreshCw className="w-4 h-4 mr-2" />
                    刷新
                  </Button>
                </div>
              </div>

              {/* 功能特色卡片 */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-white/5 backdrop-blur-xl rounded-2xl p-4 border border-white/10">
                  <div className="flex items-center gap-3 mb-2">
                    <BookOpen className="w-5 h-5 text-blue-400" />
                    <h3 className="text-white font-medium">分集创作</h3>
                  </div>
                  <p className="text-sm text-gray-400">支持多集连续剧情，完整故事线</p>
                </div>
                <div className="bg-white/5 backdrop-blur-xl rounded-2xl p-4 border border-white/10">
                  <div className="flex items-center gap-3 mb-2">
                    <Users className="w-5 h-5 text-purple-400" />
                    <h3 className="text-white font-medium">智能角色</h3>
                  </div>
                  <p className="text-sm text-gray-400">AI自动提取和管理角色信息</p>
                </div>
                <div className="bg-white/5 backdrop-blur-xl rounded-2xl p-4 border border-white/10">
                  <div className="flex items-center gap-3 mb-2">
                    <Grid3x3 className="w-5 h-5 text-pink-400" />
                    <h3 className="text-white font-medium">分镜编辑</h3>
                  </div>
                  <p className="text-sm text-gray-400">可视化分镜编辑和视频生成</p>
                </div>
              </div>
            </div>

            {/* 漫剧列表 */}
            <SeriesListView
              series={series}
              onEdit={handleEditSeries}
              onCreateNew={handleCreateNew}
              userPhone={userPhone}
              onDelete={handleSeriesDeleted}
              onRefresh={loadSeries}
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