import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';
import { 
  ArrowLeft, 
  Save, 
  Play, 
  BookOpen, 
  Users, 
  BookMarked,
  Loader2,
  RefreshCw,
  Globe,
  Lock,
  Monitor,
  Film,
  Sparkles,
} from 'lucide-react';
import { Button } from '../ui';
import { EpisodeManager } from './EpisodeManager';
import { StoryboardEditor } from './StoryboardEditor';
import { ChapterManager } from './ChapterManager';
import { CharacterManager } from './CharacterManager';
import { useSeriesEditorActions } from './hooks';
import { useGenerationPolling } from './useGenerationPolling';
import {
  GeneratingBanner,
  FailedBanner,
  StyleAnchorPanel,
  isGenerationEffectivelyComplete,
} from './SeriesEditorBanners';
import * as seriesService from '../../services';
import { syncPendingTasks, transferCompletedToOSS } from '../../services';
import type { Series, Episode, Storyboard, Character, Chapter } from '../../types';
import { ConfirmDialog, useConfirm } from './ConfirmDialog';
import { getErrorMessage, isPromoType, getEffectiveEpisodeStatus } from '../../utils';

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
  const [isRetrying, setIsRetrying] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const { confirm: confirmAction, dialogProps } = useConfirm();

  const { isGeneratingVideos, generationProgress } = useSeriesEditorActions(
    localSeries, userPhone, setLocalSeries, onUpdate, confirmAction
  );

  // 同步props的series到localSeries
  useEffect(() => {
    setLocalSeries(series);
  }, [series]);

  // v6.0.146: 打开编辑器时检测——如果status='failed'或'generating'但实际已完成，自动修正
  useEffect(() => {
    if ((series.status === 'failed' || series.status === 'generating') && isGenerationEffectivelyComplete(series)) {
      console.log(`[SeriesEditor] Series ${series.id} has status='${series.status}' but is effectively complete. Auto-correcting to draft.`);
      // 同时修正各 episode 的 status
      const correctedEpisodes = (series.episodes || []).map(ep => {
        if (getEffectiveEpisodeStatus(ep) === 'completed' && ep.status !== 'completed') {
          return { ...ep, status: 'completed' as const };
        }
        return ep;
      });
      const corrected = { ...series, status: 'draft' as const, episodes: correctedEpisodes };
      setLocalSeries(corrected);
      onUpdate(corrected);
      seriesService.updateSeries(series.id, { status: 'draft' }).then(result => {
        if (result.success) {
          console.log('[SeriesEditor] Successfully corrected series status to draft on backend.');
          toast.success('检测到创作已完成，状态已自动修正');
        }
      }).catch(() => {});
    }
  }, [series.id]);

  // v6.0.103+refactor: 轮询逻辑提取到 useGenerationPolling hook
  const { isGenerationStale, resetStaleTracking } = useGenerationPolling({
    localSeries,
    userPhone,
    setLocalSeries,
    onUpdate,
  });

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const result = await seriesService.updateSeries(localSeries.id, localSeries);
      if (result.success && result.data) {
        onUpdate(result.data);
      } else {
        toast.error('保存失败：' + getErrorMessage(result.error));
      }
    } catch (error: unknown) {
      toast.error('保存失败：' + getErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  };

  const isPublic = localSeries.isPublic !== false;
  const [isTogglingPublic, setIsTogglingPublic] = useState(false);
  const handleTogglePublic = async () => {
    const newValue = !isPublic;
    setIsTogglingPublic(true);
    const updated = { ...localSeries, isPublic: newValue };
    setLocalSeries(updated);
    try {
      const result = await seriesService.updateSeries(localSeries.id, { isPublic: newValue });
      if (result.success && result.data) {
        setLocalSeries(prev => ({ ...prev, ...result.data, isPublic: newValue }));
        onUpdate({ ...localSeries, ...result.data, isPublic: newValue });
        toast.success(newValue ? '作品已发布到社区，所有人可见' : '作品已设为私有，仅自己可见');
      } else {
        setLocalSeries(prev => ({ ...prev, isPublic: !newValue }));
        toast.error('发布状态更新失败: ' + getErrorMessage(result.error));
      }
    } catch (err: unknown) {
      setLocalSeries(prev => ({ ...prev, isPublic: !newValue }));
      toast.error('发布状态更新失败: ' + getErrorMessage(err));
    } finally {
      setIsTogglingPublic(false);
    }
  };

  const handleRetry = async () => {
    if (!userPhone) {
      toast.error('请先登录');
      return;
    }
    setIsRetrying(true);
    try {
      const result = await seriesService.retrySeries(
        localSeries.id,
        userPhone,
        localSeries.storyOutline || localSeries.description || ''
      );
      if (result.success) {
        toast.success('AI创作已重新开始！');
        resetStaleTracking();
        setLocalSeries(prev => ({ ...prev, status: 'generating' }));
        onUpdate({ ...localSeries, status: 'generating' } as Series);
      } else {
        toast.error('重试失败：' + getErrorMessage(result.error));
      }
    } catch (error: unknown) {
      toast.error('重试失败：' + getErrorMessage(error));
    } finally {
      setIsRetrying(false);
    }
  };

  const handleCharacterUpdate = (characters: Character[]) => {
    const updated = { ...localSeries, characters, updatedAt: new Date().toISOString() };
    setLocalSeries(updated);
  };

  const handleEpisodeSelect = async (episode: Episode) => {
    try {
      const result = await seriesService.getSeries(localSeries.id);
      if (result.success && result.data) {
        const freshSeries = result.data;
        const freshEpisode = freshSeries.episodes?.find(ep => ep.id === episode.id);
        if (freshEpisode) {
          setLocalSeries(freshSeries);
          onUpdate(freshSeries);
          setSelectedEpisode(freshEpisode);
          setCurrentView('storyboards');
        } else {
          setSelectedEpisode(episode);
          setCurrentView('storyboards');
        }
      } else {
        setSelectedEpisode(episode);
        setCurrentView('storyboards');
      }
    } catch {
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

  const handleChaptersUpdate = (chapters: Chapter[]) => {
    const updated = { 
      ...localSeries, 
      chapters, 
      isLongSeries: localSeries.totalEpisodes > 15,
      updatedAt: new Date().toISOString() 
    };
    setLocalSeries(updated);
    onUpdate(updated);
    seriesService.updateSeries(updated.id, updated);
  };

  const isLongSeries = localSeries.totalEpisodes > 15;

  return (
    <div className="max-w-7xl mx-auto">
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

        {/* 生成中/失败状态横幅 */}
        <GeneratingBanner series={localSeries} isStale={isGenerationStale} onRetry={handleRetry} isRetrying={isRetrying} />
        <FailedBanner series={localSeries} isRetrying={isRetrying} onRetry={handleRetry} />

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div className="min-w-0">
            <h1 className="text-2xl sm:text-3xl font-bold text-white mb-2 truncate">
              {localSeries.title}
            </h1>
            <p className="text-gray-400 line-clamp-2">{localSeries.description}</p>
            {/* v6.0.80: 作品配置信息条 */}
            <div className="flex flex-wrap items-center gap-1.5 mt-2.5">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-purple-500/15 border border-purple-500/25 text-purple-300 text-[11px] font-medium">
                <Monitor className="w-3 h-3" />
                {localSeries.coherenceCheck?.aspectRatio || '16:9'}
                {!localSeries.coherenceCheck?.aspectRatio && <span className="text-purple-300/50 ml-0.5">(默认)</span>}
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-blue-500/15 border border-blue-500/25 text-blue-300 text-[11px] font-medium">
                {localSeries.coherenceCheck?.resolution || '720p'}
                {!localSeries.coherenceCheck?.resolution && <span className="text-blue-300/50 ml-0.5">(默认)</span>}
              </span>
              {localSeries.style && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-pink-500/15 border border-pink-500/25 text-pink-300 text-[11px] font-medium">
                  <Film className="w-3 h-3" />
                  {localSeries.style}
                </span>
              )}
              {localSeries.genre && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-white/5 border border-white/10 text-gray-400 text-[11px]">
                  {localSeries.genre}
                </span>
              )}
              <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-white/5 border border-white/10 text-gray-400 text-[11px]">
                {localSeries.totalEpisodes || localSeries.episodes?.length || 0}集
              </span>
            </div>
            {/* v6.0.118: 风格锚定图管理面板 */}
            <StyleAnchorPanel
              series={localSeries}
              userPhone={userPhone}
              onUpdate={(updated) => {
                setLocalSeries(updated);
                onUpdate(updated);
              }}
            />
          </div>
          <div className="flex gap-2 flex-wrap shrink-0">
            <Button
              variant="ghost"
              className="text-gray-400 hover:text-white"
              onClick={async () => {
                setIsSyncing(true);
                try {
                  const syncResult = await syncPendingTasks();
                  let msg = syncResult.message || '';

                  const ossResult = await transferCompletedToOSS();
                  if (ossResult.transferred > 0) {
                    msg += ` | OSS转存：${ossResult.transferred} 个`;
                  }

                  const refreshed = await seriesService.getSeries(localSeries.id);
                  if (refreshed.success && refreshed.data) {
                    setLocalSeries(refreshed.data);
                    onUpdate(refreshed.data);
                  }

                  toast.success(msg || '同步完成');
                } catch (err: unknown) {
                  toast.error('同步失败：' + getErrorMessage(err));
                } finally {
                  setIsSyncing(false);
                }
              }}
              disabled={isSyncing}
            >
              {isSyncing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
              {isSyncing ? '同步中...' : '同步任务'}
            </Button>
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
            <Button
              onClick={handleTogglePublic}
              disabled={isTogglingPublic}
              variant="ghost"
              className={isPublic
                ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/25 hover:text-emerald-300'
                : 'bg-gray-500/15 text-gray-400 border border-gray-500/30 hover:bg-gray-500/25 hover:text-gray-300'}
            >
              {isTogglingPublic ? (
                <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
              ) : isPublic ? (
                <Globe className="w-4 h-4 mr-1.5" />
              ) : (
                <Lock className="w-4 h-4 mr-1.5" />
              )}
              {isPublic ? '公开' : '私有'}
            </Button>
          </div>
        </div>

        {/* 标签栏 */}
        <div className="flex gap-1 sm:gap-2 bg-white/5 backdrop-blur-xl rounded-2xl p-1.5 sm:p-2 border border-white/10">
          <button
            onClick={() => setCurrentView('episodes')}
            className={`flex-1 flex items-center justify-center gap-1.5 sm:gap-2 px-2 sm:px-4 py-2.5 sm:py-3 rounded-xl transition-all ${
              currentView === 'episodes'
                ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white shadow-lg'
                : 'text-gray-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <BookOpen className="w-4 h-4 shrink-0" />
            <span className="font-medium text-sm sm:text-base">分集</span>
          </button>
          {isLongSeries && (
            <button
              onClick={() => setCurrentView('chapters')}
              className={`flex-1 flex items-center justify-center gap-1.5 sm:gap-2 px-2 sm:px-4 py-2.5 sm:py-3 rounded-xl transition-all ${
                currentView === 'chapters'
                  ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white shadow-lg'
                  : 'text-gray-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <BookMarked className="w-4 h-4 shrink-0" />
              <span className="font-medium text-sm sm:text-base">章节</span>
            </button>
          )}
          <button
            onClick={() => setCurrentView('characters')}
            className={`flex-1 flex items-center justify-center gap-1.5 sm:gap-2 px-2 sm:px-4 py-2.5 sm:py-3 rounded-xl transition-all ${
              currentView === 'characters'
                ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white shadow-lg'
                : 'text-gray-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <Users className="w-4 h-4 shrink-0" />
            <span className="font-medium text-sm sm:text-base">
              {isPromoType(localSeries.productionType) ? '出镜元素' : '角色'}
            </span>
          </button>
        </div>
      </div>

      {/* 内容区域 */}
      <AnimatePresence mode="wait">
        <motion.div
          key={currentView + (selectedEpisode?.id || '')}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.2 }}
        >
          {currentView === 'episodes' && (
            <EpisodeManager
              series={localSeries}
              userPhone={userPhone}
              onEpisodeSelect={handleEpisodeSelect}
              onEpisodesUpdate={handleEpisodeUpdate}
              onSeriesUpdate={(updated) => {
                setLocalSeries(updated);
                onUpdate(updated);
              }}
            />
          )}

          {currentView === 'characters' && (
            <>
              {isPromoType(localSeries.productionType) && (
                <div className="mb-4 px-4 py-3 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-300 text-sm flex items-start gap-2">
                  <Sparkles className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>
                    宣传片不一定需要出镜人物。AI 会根据内容自动判断是否需要角色，您也可以手动添加。
                    若无角色，分镜将以旁白 + 画面意象驱动。
                  </span>
                </div>
              )}
              <CharacterManager
                characters={localSeries.characters || []}
                seriesId={localSeries.id}
                userPhone={userPhone}
                seriesStatus={localSeries.status}
                productionType={localSeries.productionType}
                onUpdate={handleCharacterUpdate}
              />
            </>
          )}

          {currentView === 'storyboards' && selectedEpisode && (
            <StoryboardEditor
              episode={selectedEpisode}
              characters={localSeries.characters || []}
              style={localSeries.style || 'comic'}
              seriesId={localSeries.id}
              userPhone={userPhone || ''}
              aspectRatio={localSeries.coherenceCheck?.aspectRatio}
              styleAnchorImageUrl={localSeries.coherenceCheck?.styleAnchorImageUrl}
              onBack={handleBackFromStoryboards}
              onUpdate={handleStoryboardUpdate}
            />
          )}

          {currentView === 'chapters' && isLongSeries && (
            <ChapterManager
              series={localSeries}
              onChaptersUpdate={handleChaptersUpdate}
              onEpisodeSelect={handleEpisodeSelect}
              onRefresh={() => {
                seriesService.getSeries(localSeries.id).then(result => {
                  if (result.success && result.data) {
                    setLocalSeries(result.data);
                    onUpdate(result.data);
                  }
                });
              }}
            />
          )}
        </motion.div>
      </AnimatePresence>
      <ConfirmDialog {...dialogProps} />
    </div>
  );
}