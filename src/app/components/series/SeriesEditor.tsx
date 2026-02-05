import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ArrowLeft, 
  Save, 
  Play, 
  BookOpen, 
  Users, 
  Grid3x3, 
  BookMarked,
  Sparkles 
} from 'lucide-react';
import { Button } from '@/app/components/ui/button';
import { EpisodeManager } from './EpisodeManager';
import { StoryboardEditor } from './StoryboardEditor';
import { ChapterManager } from './ChapterManager';
import { CharacterManager } from './CharacterManager';
import * as seriesService from '@/app/services/seriesService';
import * as batchVideoService from '@/app/services/batchVideoGeneration';
import type { Series, Episode, Storyboard, Character, Chapter } from '@/app/types';
import { projectId, publicAnonKey } from '/utils/supabase/info';

interface SeriesEditorProps {
  series: Series;
  userPhone?: string;
  onBack: () => void;
  onUpdate: (series: Series) => void;
}

type EditorView = 'episodes' | 'characters' | 'storyboards' | 'chapters';

export function SeriesEditor({ series, userPhone, onBack, onUpdate }: SeriesEditorProps) {
  const [currentView, setCurrentView] = useState<EditorView>('episodes');
  const [selectedEpisode, setSelectedEpisode] = useState<Episode | null>(null);
  const [localSeries, setLocalSeries] = useState<Series>(series);
  const [isSaving, setIsSaving] = useState(false);
  const [isGeneratingVideos, setIsGeneratingVideos] = useState(false);
  const [isSyncingVideoData, setIsSyncingVideoData] = useState(false);
  const [generationProgress, setGenerationProgress] = useState<{
    current: number;
    total: number;
    percentage: number;
    status: string;
  } | null>(null);

  // 🔍 详细的数据诊断日志
  useEffect(() => {
    console.group('[SeriesEditor] 🔍 Data Diagnosis');
    console.log('Series ID:', localSeries.id);
    console.log('Series Title:', localSeries.title);
    console.log('Series Status:', localSeries.status);
    console.log('Episodes Count:', localSeries.episodes?.length || 0);
    console.log('Episodes Array:', localSeries.episodes);
    console.log('TotalEpisodes:', localSeries.totalEpisodes);
    console.log('Characters Count:', localSeries.characters?.length || 0);
    
    if (localSeries.episodes && localSeries.episodes.length > 0) {
      console.log('First Episode Sample:', {
        id: localSeries.episodes[0].id,
        episodeNumber: localSeries.episodes[0].episodeNumber,
        title: localSeries.episodes[0].title,
        storyboardsCount: localSeries.episodes[0].storyboards?.length || 0,
      });
    } else {
      console.warn('⚠️ Episodes array is empty or undefined!');
    }
    console.groupEnd();
  }, [localSeries]);

  // 🔄 同步props的series到localSeries（用于轮询更新）
  useEffect(() => {
    console.log('[SeriesEditor] Series prop updated, syncing to localSeries');
    console.log('[SeriesEditor] New episodes count:', series.episodes?.length || 0);
    setLocalSeries(series);
  }, [series]);

  // 🔄 如果series状态是generating，启动轮询刷新
  useEffect(() => {
    if (localSeries.status === 'generating') {
      console.log('[SeriesEditor] 🔄 Detected generating status, starting polling...');
      
      const intervalId = setInterval(async () => {
        console.log('[SeriesEditor] 🔄 Polling for updates...');
        try {
          const result = await seriesService.getSeries(localSeries.id);
          if (result.success && result.data) {
            const updatedSeries = result.data;
            setLocalSeries(updatedSeries);
            onUpdate(updatedSeries);
            
            // 如果生成完成，停止轮询
            if (updatedSeries.status !== 'generating') {
              console.log('[SeriesEditor] ✅ Generation completed, stopping polling');
              clearInterval(intervalId);
            }
          }
        } catch (error: any) {
          console.error('[SeriesEditor] Polling error:', error);
        }
      }, 5000); // 每5秒轮询一次

      return () => {
        console.log('[SeriesEditor] 🛑 Stopping polling');
        clearInterval(intervalId);
      };
    }
  }, [localSeries.status, localSeries.id, onUpdate]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const result = await seriesService.updateSeries(localSeries.id, localSeries);
      if (result.success && result.data) {
        onUpdate(result.data);
        console.log('[SeriesEditor] 保存成功');
      } else {
        alert('保存失败：' + result.error);
      }
    } catch (error: any) {
      alert('保存失败：' + error.message);
    } finally {
      setIsSaving(false);
    }
  };

  // 🎬 一键生成所有视频
  const handleGenerateAllVideos = async () => {
    if (!userPhone) {
      alert('请先登录');
      return;
    }

    if (!confirm('确定要为整部漫剧生成所有视频吗？\n\n这将为所有分镜生成视频，可能需要较长时间。')) {
      return;
    }

    setIsGeneratingVideos(true);
    setGenerationProgress({
      current: 0,
      total: 0,
      percentage: 0,
      status: '准备中...',
    });

    try {
      const result = await batchVideoService.generateAllVideosForSeries(
        localSeries,
        userPhone,
        (progress) => {
          setGenerationProgress({
            current: progress.completedStoryboards,
            total: progress.totalStoryboards,
            percentage: progress.progress,
            status: `正在生成第 ${progress.currentEpisode}/${progress.totalEpisodes} 集...`,
          });
        }
      );

      if (result.success) {
        alert('所有视频已开始生成！\n\n您可以在"我的作品"中查看生成进度。');
      } else {
        alert('批量生成失败：' + result.error);
      }
    } catch (error: any) {
      alert('批量生成失败：' + error.message);
    } finally {
      setIsGeneratingVideos(false);
      setGenerationProgress(null);
    }
  };

  // 🔄 同步视频数据（从video_tasks表同步到storyboards表）
  const handleSyncVideoData = async () => {
    if (!confirm('确定要同步视频数据吗？\n\n这将从video_tasks表中查找并更新所有分镜的视频URL。')) {
      return;
    }

    setIsSyncingVideoData(true);

    try {
      const API_URL = `https://${projectId}.supabase.co/functions/v1/make-server-fc31472c`;
      const ANON_KEY = publicAnonKey;

      const response = await fetch(`${API_URL}/series/${localSeries.id}/sync-video-data`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${ANON_KEY}`,
        },
      });

      const result = await response.json();

      if (result.success) {
        const stats = result.data.stats || {};
        const messages = [
          `视频数据同步完成！\n`,
          `✅ 成功同步: ${result.data.synced}个`,
        ];
        
        if (stats.fixedHistoricalLinks > 0) {
          messages.push(`🔧 修复历史关联: ${stats.fixedHistoricalLinks}个`);
        }
        
        if (stats.syncedByStoryboardId > 0 || stats.syncedByMetadata > 0) {
          messages.push(`   🔍 同步方式:`);
          if (stats.syncedByStoryboardId > 0) {
            messages.push(`      - 通过storyboard_id: ${stats.syncedByStoryboardId}个`);
          }
          if (stats.syncedByMetadata > 0) {
            messages.push(`      - 通过metadata匹配: ${stats.syncedByMetadata}个`);
          }
        }
        
        messages.push(
          `\n📊 统计信息:`,
          `  - 已有视频: ${stats.alreadyHasVideo || 0}个`,
          `  - 无任务ID: ${stats.noTaskId || 0}个`,
          `  - 跳过: ${stats.skipped || 0}个`,
          `  - 错误: ${result.data.errors || 0}个`,
        );
        
        alert(messages.join('\n'));
        
        // 刷新series数据
        const refreshResult = await seriesService.getSeries(localSeries.id);
        if (refreshResult.success && refreshResult.data) {
          setLocalSeries(refreshResult.data);
          onUpdate(refreshResult.data);
        }
      } else {
        alert('同步失败：' + result.error);
      }
    } catch (error: any) {
      console.error('[SeriesEditor] Error syncing video data:', error);
      alert('同步失败：' + error.message);
    } finally {
      setIsSyncingVideoData(false);
    }
  };

  // 🔬 诊断同步问题
  const handleDiagnoseSyncIssue = async () => {
    try {
      const API_URL = `https://${projectId}.supabase.co/functions/v1/make-server-fc31472c`;
      const ANON_KEY = publicAnonKey;

      console.log('🔬 [Diagnosis] 开始诊断同步问题...');

      const response = await fetch(`${API_URL}/series/${localSeries.id}/diagnose-sync-issue`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${ANON_KEY}`,
        },
      });

      const result = await response.json();

      if (result.success) {
        console.log('🔬 [Diagnosis] 诊断结果:', result.diagnosis);
        
        const diag = result.diagnosis;
        const summary = diag.summary;
        
        console.group('📊 数据摘要');
        console.log(`总分镜数: ${summary.totalStoryboards}`);
        console.log(`总任务数: ${summary.totalVideoTasks}`);
        console.log(`已有task_id: ${summary.storyboardsWithTaskId}`);
        console.log(`已有video_url: ${summary.storyboardsWithVideo}`);
        console.log(`未匹配: ${summary.unmatchedStoryboards}`);
        console.groupEnd();
        
        // 输出每个剧集的详细对比
        diag.episodes.forEach((ep: any) => {
          console.group(`📺 剧集 ${ep.episodeNumber}`);
          
          console.group('🎬 Storyboards');
          ep.storyboards.forEach((sb: any) => {
            console.log(`Scene ${sb.sceneNumber}:`, {
              storyboardId: sb.storyboardId,
              taskId: sb.taskId || '❌无',
              videoUrl: sb.videoUrl,
              matchCount: sb.matchCount,
              matches: sb.matchingTasks,
            });
          });
          console.groupEnd();
          
          console.group('📹 Video Tasks');
          ep.videoTasks.forEach((task: any) => {
            console.log(`Task ${task.taskId}:`, {
              storyboardIdInTask: task.storyboardIdInTask || '❌无',
              videoUrl: task.videoUrl,
              status: task.status,
              metadata: task.metadata,
            });
          });
          console.groupEnd();
          
          console.groupEnd();
        });
        
        alert(`🔬 诊断完成！\n\n请查看Console(F12)的详细日志\n\n📊 摘要:\n总分镜: ${summary.totalStoryboards}\n总任务: ${summary.totalVideoTasks}\n未匹配: ${summary.unmatchedStoryboards}`);
      } else {
        console.error('🔬 [Diagnosis] 诊断失败:', result.error);
        alert('诊断失败：' + result.error);
      }
    } catch (error: any) {
      console.error('🔬 [Diagnosis] Error:', error);
      alert('诊断失败：' + error.message);
    }
  };

  // 🔍 检查video_tasks表
  const handleInspectVideoTasks = async () => {
    try {
      const API_URL = `https://${projectId}.supabase.co/functions/v1/make-server-fc31472c`;
      const ANON_KEY = publicAnonKey;

      console.log('🔍 [Inspect] 检查video_tasks表...');

      const response = await fetch(`${API_URL}/series/${localSeries.id}/inspect-video-tasks`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${ANON_KEY}`,
        },
      });

      const result = await response.json();

      if (result.success) {
        console.log('🔍 [Inspect] 检查结果:', result.data);
        
        const data = result.data;
        
        console.group('📊 video_tasks表数据');
        console.log(`总任务数: ${data.totalCount}`);
        console.log(`所有任务:`, data.tasks);
        console.groupEnd();
        
        console.group('📊 按剧集组');
        data.episodeSummary.forEach((ep: any) => {
          console.log(`Episode ${ep.episodeId}:`, {
            taskCount: ep.taskCount,
            taskIds: ep.taskIds,
            hasVideoUrl: ep.hasVideoUrl,
            storyboardIds: ep.storyboardIds,
            metadataStoryboardIds: ep.metadataStoryboardIds,
          });
        });
        console.groupEnd();
        
        alert(`🔍 检查完成！\n\n请查看Console(F12)的详细日志\n\n📊 摘要:\n总任务数: ${data.totalCount}\n剧集数: ${data.episodeSummary.length}`);
      } else {
        console.error('🔍 [Inspect] 检查失败:', result.error);
        alert('检查失败：' + result.error);
      }
    } catch (error: any) {
      console.error('🔍 [Inspect] Error:', error);
      alert('检查失败：' + error.message);
    }
  };

  const handleCharacterUpdate = (characters: Character[]) => {
    const updated = { ...localSeries, characters, updatedAt: new Date().toISOString() };
    setLocalSeries(updated);
    // 自动保存
    seriesService.updateSeries(updated.id, updated);
  };

  const handleEpisodeSelect = async (episode: Episode) => {
    console.log('[SeriesEditor] 📖 Loading latest episode data before opening editor...');
    console.log('[SeriesEditor] Episode ID:', episode.id);
    
    try {
      // 🔄 重新加载完整的series数据，确保获取最新的storyboards（包括video_url）
      const result = await seriesService.getSeries(localSeries.id);
      
      if (result.success && result.data) {
        const freshSeries = result.data;
        
        // 找到对应的episode（包含最新的storyboards数据）
        const freshEpisode = freshSeries.episodes?.find(ep => ep.id === episode.id);
        
        if (freshEpisode) {
          console.log('[SeriesEditor] ✅ Fresh episode data loaded:');
          console.log('  - Episode:', freshEpisode.title);
          console.log('  - Storyboards:', freshEpisode.storyboards?.length || 0);
          
          // 详细输出每个storyboard的video_url状态
          freshEpisode.storyboards?.forEach((sb, idx) => {
            console.log(`  - Storyboard ${idx + 1}:`, {
              id: sb.id,
              sceneNumber: sb.sceneNumber,
              status: sb.status,
              videoUrl: sb.videoUrl,
              video_url: (sb as any).video_url,
            });
          });
          
          // 更新localSeries到最新状态
          setLocalSeries(freshSeries);
          onUpdate(freshSeries);
          
          // 设置选中的episode（使用最新数据）
          setSelectedEpisode(freshEpisode);
          setCurrentView('storyboards');
        } else {
          console.warn('[SeriesEditor] Episode not found in fresh data, using original');
          setSelectedEpisode(episode);
          setCurrentView('storyboards');
        }
      } else {
        console.error('[SeriesEditor] Failed to load fresh series data:', result.error);
        // 如果加载失败，仍然使用原有episode
        setSelectedEpisode(episode);
        setCurrentView('storyboards');
      }
    } catch (error: any) {
      console.error('[SeriesEditor] Error loading fresh episode data:', error);
      // 如果出错，仍然使用原有episode
      setSelectedEpisode(episode);
      setCurrentView('storyboards');
    }
  };

  const handleEpisodeUpdate = (episodes: Episode[]) => {
    const updated = { ...localSeries, episodes, updatedAt: new Date().toISOString() };
    setLocalSeries(updated);
    onUpdate(updated);
  };

  const handleStoryboardUpdate = (storyboards: Storyboard[]) => {
    if (!selectedEpisode) return;
    
    const updatedEpisode = { ...selectedEpisode, storyboards, updatedAt: new Date().toISOString() };
    // ✅ 确保episodes数组存在
    const episodes = (localSeries.episodes || []).map(ep =>
      ep.id === updatedEpisode.id ? updatedEpisode : ep
    );
    
    const updated = { ...localSeries, episodes, updatedAt: new Date().toISOString() };
    setLocalSeries(updated);
    setSelectedEpisode(updatedEpisode);
    onUpdate(updated);
  };

  const handleBackFromStoryboards = () => {
    setSelectedEpisode(null);
    setCurrentView('episodes');
  };

  // 🆕 章节更新处理
  const handleChaptersUpdate = (chapters: Chapter[]) => {
    const updated = { 
      ...localSeries, 
      chapters, 
      isLongSeries: localSeries.totalEpisodes > 15,
      updatedAt: new Date().toISOString() 
    };
    setLocalSeries(updated);
    onUpdate(updated);
    // 自动保存
    seriesService.updateSeries(updated.id, updated);
  };

  // 检查是否为长剧
  const isLongSeries = localSeries.totalEpisodes > 15;

  return (
    <div className="max-w-7xl mx-auto">
      {/* 生成进度浮窗 */}
      {isGeneratingVideos && generationProgress && (
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="fixed bottom-6 right-6 z-50 bg-gradient-to-br from-gray-900 to-purple-900 rounded-2xl p-6 border border-white/10 shadow-2xl max-w-sm"
        >
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 bg-gradient-to-r from-purple-500 to-pink-500 rounded-full flex items-center justify-center animate-pulse">
              <Sparkles className="w-6 h-6 text-white" />
            </div>
            <div className="flex-1">
              <h3 className="text-white font-semibold">批量生成中...</h3>
              <p className="text-sm text-gray-400">{generationProgress.status}</p>
            </div>
          </div>
          
          <div className="space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">进度</span>
              <span className="text-white font-medium">
                {generationProgress.current}/{generationProgress.total}
              </span>
            </div>
            
            <div className="w-full bg-white/10 rounded-full h-2 overflow-hidden">
              <motion.div
                className="h-full bg-gradient-to-r from-purple-500 to-pink-500"
                initial={{ width: 0 }}
                animate={{ width: `${generationProgress.percentage}%` }}
                transition={{ duration: 0.3 }}
              />
            </div>
            
            <p className="text-xs text-gray-400 text-center">
              {generationProgress.percentage}% 完成
            </p>
          </div>
        </motion.div>
      )}
      
      {/* 头部 */}
      <div className="mb-6">
        <Button
          onClick={onBack}
          variant="ghost"
          className="mb-4 text-gray-400 hover:text-white"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          返回列表
        </Button>

        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white mb-2">
              {localSeries.title}
            </h1>
            <p className="text-gray-400">{localSeries.description}</p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="ghost"
              className="text-gray-400 hover:text-white"
              onClick={handleSave}
              disabled={isSaving}
            >
              <Save className="w-4 h-4 mr-2" />
              保存
            </Button>
            <Button
              className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600"
            >
              <Play className="w-4 h-4 mr-2" />
              预览
            </Button>
            {/* 移除了测试按钮：一键生成所有视频、同步视频数据、诊断同步问题、检查video_tasks表 */}
          </div>
        </div>

        {/* 标签栏 */}
        <div className="flex gap-2 bg-white/5 backdrop-blur-xl rounded-2xl p-2 border border-white/10">
          <button
            onClick={() => setCurrentView('episodes')}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl transition-all ${
              currentView === 'episodes'
                ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white shadow-lg'
                : 'text-gray-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <BookOpen className="w-4 h-4" />
            <span className="font-medium">分集管理</span>
          </button>
          {isLongSeries && (
            <button
              onClick={() => setCurrentView('chapters')}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl transition-all ${
                currentView === 'chapters'
                  ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white shadow-lg'
                  : 'text-gray-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <BookMarked className="w-4 h-4" />
              <span className="font-medium">章节管理</span>
            </button>
          )}
          <button
            onClick={() => setCurrentView('characters')}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl transition-all ${
              currentView === 'characters'
                ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white shadow-lg'
                : 'text-gray-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <Users className="w-4 h-4" />
            <span className="font-medium">角色管理</span>
          </button>
          {selectedEpisode && (
            <button
              onClick={() => setCurrentView('storyboards')}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl transition-all ${
                currentView === 'storyboards'
                  ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white shadow-lg'
                  : 'text-gray-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <Grid3x3 className="w-4 h-4" />
              <span className="font-medium">分镜编辑</span>
            </button>
          )}
        </div>
      </div>

      {/* 内容区 */}
      <AnimatePresence mode="wait">
        {currentView === 'episodes' && (
          <motion.div
            key="episodes"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.3 }}
          >
            <EpisodeManager
              series={localSeries}
              onEpisodeSelect={handleEpisodeSelect}
              onEpisodesUpdate={handleEpisodeUpdate}
              userPhone={userPhone}
            />
          </motion.div>
        )}

        {currentView === 'characters' && (
          <motion.div
            key="characters"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.3 }}
          >
            <CharacterManager
              characters={localSeries.characters || []}
              onUpdate={handleCharacterUpdate}
            />
          </motion.div>
        )}

        {currentView === 'chapters' && isLongSeries && (
          <motion.div
            key="chapters"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.3 }}
          >
            <ChapterManager
              series={localSeries}
              onChaptersUpdate={handleChaptersUpdate}
              onEpisodeSelect={handleEpisodeSelect}
            />
          </motion.div>
        )}

        {currentView === 'storyboards' && selectedEpisode && (
          <motion.div
            key="storyboards"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.3 }}
          >
            <StoryboardEditor
              episode={selectedEpisode}
              characters={localSeries.characters || []}
              style={localSeries.style}
              seriesId={localSeries.id}
              userPhone={userPhone || ''}
              onBack={handleBackFromStoryboards}
              onUpdate={handleStoryboardUpdate}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}