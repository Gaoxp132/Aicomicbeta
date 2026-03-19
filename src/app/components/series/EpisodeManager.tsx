import { useState, useCallback, useMemo, useEffect } from 'react';
import { Button } from '../ui';
import { Plus, Play, Loader2, Wand2, Download, ImageIcon } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import type { Series, Episode } from '../../types';
import { EpisodeCard } from './EpisodeCard';
import { useEpisodeActions } from './hooks';
import { VideoHealthAlert, SeriesVideoHealthChecker } from './HealthWidgets';

interface EpisodeManagerProps {
  series: Series;
  onEpisodeSelect: (episode: Episode) => void;
  onEpisodesUpdate: (episodes: Episode[]) => void;
  onSeriesUpdate?: (series: Series) => void; // v6.0.143: 用于 handleSmartGenerate 触发 generating 状态
  userPhone?: string;
}

export function EpisodeManager({ series, onEpisodeSelect, onEpisodesUpdate, onSeriesUpdate, userPhone }: EpisodeManagerProps) {
  const [videoErrors, setVideoErrors] = useState<Record<string, Record<string, unknown>>>({}); // 修改类型
  const [alertDismissed, setAlertDismissed] = useState(false);
  const [currentPlayingEpisodeId, setCurrentPlayingEpisodeId] = useState<string | null>(null);
  const [expandedVideoEpisodeId, setExpandedVideoEpisodeId] = useState<string | null>(null);
  
  const episodes = series.episodes || [];

  const {
    isSmartGenerating,
    isMerging,
    smartProgress,
    isSyncingThumbnails,
    handleAddEpisode,
    handleSmartGenerate,
    handleMergeVideos,
    handleRepairSingleEpisode,
    handleSyncThumbnails,
  } = useEpisodeActions({ series, episodes, userPhone, onEpisodesUpdate, onSeriesUpdate });

  const videoErrorCount = Object.keys(videoErrors).length;

  const VIRTUALIZE_THRESHOLD = 20;
  const useVirtualList = episodes.length > VIRTUALIZE_THRESHOLD;

  return (
    <div className="space-y-6">
      {/* 头部 */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-white mb-1">分集管理</h2>
          <p className="text-sm text-gray-400">
            {episodes.length} / {Math.max(series.totalEpisodes, episodes.length)} 集
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {episodes.length === 0 && series.status !== 'generating' && (
            <Button
              onClick={handleSmartGenerate}
              disabled={isSmartGenerating}
              className="bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 disabled:opacity-50"
            >
              {isSmartGenerating ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  {smartProgress || '生成中...'}
                </>
              ) : (
                <>
                  <Wand2 className="w-4 h-4 mr-2" />
                  智能生成
                </>
              )}
            </Button>
          )}
          {episodes.length > 0 && series.status !== 'generating' && (
            <>
              <Button
                onClick={handleAddEpisode}
                className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600"
              >
                <Plus className="w-4 h-4 mr-2" />
                添加剧集
              </Button>
              <Button
                onClick={handleSyncThumbnails}
                disabled={isSyncingThumbnails}
                variant="outline"
                size="sm"
                className="border-blue-500/30 text-blue-400 hover:bg-blue-500/10 disabled:opacity-50"
                title="从已完成的视频任务同步缩略图到剧集"
              >
                {isSyncingThumbnails ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <ImageIcon className="w-4 h-4" />
                )}
              </Button>
              <Button
                onClick={handleMergeVideos}
                disabled={isMerging}
                className="bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 disabled:opacity-50"
              >
                {isMerging ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    合并中...
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4 mr-2" />
                    合并视频
                  </>
                )}
              </Button>
            </>
          )}
        </div>
      </div>

      {/* 全局视频健康警告 */}
      <AnimatePresence>
        {videoErrorCount > 0 && !alertDismissed && (
          <VideoHealthAlert
            errorCount={videoErrorCount}
            onFixAll={handleMergeVideos}
            onDismiss={() => setAlertDismissed(true)}
            isFixing={isMerging}
          />
        )}
      </AnimatePresence>

      {/* 视频健康检查工具 */}
      {episodes.length > 0 && (
        <SeriesVideoHealthChecker 
          series={series} 
          onRepairNeeded={() => {
            console.log('视频需要修复');
          }}
        />
      )}

      {/* 剧集列表 */}
      {episodes.length === 0 ? (
        <div className="bg-white/5 backdrop-blur-xl rounded-2xl p-12 border border-white/10 text-center">
          {series.status === 'generating' ? (
            <>
              <div className="w-20 h-20 bg-gradient-to-br from-blue-500/20 to-cyan-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
                <Loader2 className="w-10 h-10 text-blue-400 animate-spin" />
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">AI创作中...</h3>
              <p className="text-gray-400 mb-2">
                {(typeof series.generationProgress === 'object' && series.generationProgress?.stepName) || '正在生成精彩内容'}
              </p>
              {typeof series.generationProgress === 'object' && series.generationProgress?.error && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 mt-4 max-w-md mx-auto">
                  <p className="text-red-400 text-sm font-semibold mb-1">创作失败</p>
                  <p className="text-red-300 text-xs">{series.generationProgress.error}</p>
                </div>
              )}
              {(() => {
                const progress = series.generationProgress;
                if (!progress || typeof progress !== 'object') {
                  return (
                    <div className="max-w-xs mx-auto mt-4">
                      <div className="flex justify-between text-sm text-gray-400 mb-2">
                        <span>准备中...</span>
                        <span></span>
                      </div>
                      <div className="w-full bg-white/10 rounded-full h-2 overflow-hidden">
                        <motion.div
                          className="h-full w-1/3 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-full"
                          animate={{ x: ['0%', '200%', '0%'] }}
                          transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
                        />
                      </div>
                      <p className="text-xs text-gray-500 mt-4">
                        预计需要 2-5 分钟，页面会自动更新
                      </p>
                    </div>
                  );
                }
                
                const hasError = progress.error;
                if (hasError) return null;

                const currentStep = typeof progress.currentStep === 'number' ? progress.currentStep : 0;
                const totalSteps = typeof progress.totalSteps === 'number' && progress.totalSteps > 0 ? progress.totalSteps : 0;
                const hasValidProgress = totalSteps > 0;
                const percentage = hasValidProgress ? Math.round((currentStep / totalSteps) * 100) : 0;

                return (
                  <div className="max-w-xs mx-auto mt-4">
                    <div className="flex justify-between text-sm text-gray-400 mb-2">
                      <span>
                        {hasValidProgress 
                          ? `步骤 ${currentStep}/${totalSteps}` 
                          : (progress?.stepName || '准备中...')}
                      </span>
                      <span>
                        {hasValidProgress ? `${percentage}%` : ''}
                      </span>
                    </div>
                    <div className="w-full bg-white/10 rounded-full h-2 overflow-hidden">
                      {hasValidProgress ? (
                        <motion.div
                          className="h-full bg-gradient-to-r from-blue-500 to-cyan-500"
                          initial={{ width: 0 }}
                          animate={{ width: `${Math.max(percentage, 5)}%` }}
                          transition={{ duration: 0.5 }}
                        />
                      ) : (
                        <motion.div
                          className="h-full w-1/3 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-full"
                          animate={{ x: ['0%', '200%', '0%'] }}
                          transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
                        />
                      )}
                    </div>
                    <p className="text-xs text-gray-500 mt-4">
                      预计需要 2-5 分钟，页面会自动更新
                    </p>
                  </div>
                );
              })()}
            </>
          ) : series.status === 'failed' ? (
            <>
              <div className="w-20 h-20 bg-gradient-to-br from-red-500/20 to-orange-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
                <span className="text-4xl"></span>
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">创作失败</h3>
              <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 mt-4 max-w-md mx-auto">
                <p className="text-red-300 text-sm">
                  {(typeof series.generationProgress === 'object' && series.generationProgress?.error) || '未知错误，请重试'}
                </p>
              </div>
            </>
          ) : (
            <>
              <div className="w-20 h-20 bg-gradient-to-br from-purple-500/20 to-pink-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
                <Play className="w-10 h-10 text-purple-400" />
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">开始创建剧集</h3>
              <p className="text-gray-400 mb-6">
                智能生成会自动创建角色、分集、分镜和视频
              </p>
              <div className="flex justify-center gap-3">
                <Button
                  onClick={handleSmartGenerate}
                  className="bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600"
                >
                  <Wand2 className="w-4 h-4 mr-2" />
                  智能生成
                </Button>
                <Button
                  onClick={handleAddEpisode}
                  className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  手动添加
                </Button>
              </div>
            </>
          )}
        </div>
      ) : (
        <EpisodeListRenderer
          episodes={episodes}
          useVirtualList={useVirtualList}
          expandedVideoEpisodeId={expandedVideoEpisodeId}
          currentPlayingEpisodeId={currentPlayingEpisodeId}
          videoErrors={videoErrors}
          aspectRatio={series.coherenceCheck?.aspectRatio}
          onEpisodeSelect={onEpisodeSelect}
          setExpandedVideoEpisodeId={setExpandedVideoEpisodeId}
          setCurrentPlayingEpisodeId={setCurrentPlayingEpisodeId}
          setVideoErrors={setVideoErrors}
          handleRepairSingleEpisode={handleRepairSingleEpisode}
        />
      )}
    </div>
  );
}

interface EpisodeListRendererProps {
  episodes: Episode[];
  useVirtualList: boolean;
  expandedVideoEpisodeId: string | null;
  currentPlayingEpisodeId: string | null;
  videoErrors: Record<string, Record<string, unknown>>; // 修改类型
  aspectRatio?: string;
  onEpisodeSelect: (episode: Episode) => void;
  setExpandedVideoEpisodeId: (id: string | null) => void;
  setCurrentPlayingEpisodeId: (id: string | null) => void;
  setVideoErrors: (errors: Record<string, Record<string, unknown>>) => void; // 修改类型
  handleRepairSingleEpisode: (episodeId: string) => void;
}

function EpisodeListRenderer({
  episodes,
  useVirtualList,
  expandedVideoEpisodeId,
  currentPlayingEpisodeId,
  videoErrors,
  aspectRatio,
  onEpisodeSelect,
  setExpandedVideoEpisodeId,
  setCurrentPlayingEpisodeId,
  setVideoErrors,
  handleRepairSingleEpisode,
}: EpisodeListRendererProps) {
  const handleVideoError = useCallback((episodeId: string, errorInfo: Record<string, unknown>) => {
    setVideoErrors((prev: Record<string, Record<string, unknown>>) => ({ ...prev, [episodeId]: errorInfo }));
  }, [setVideoErrors]);

  const handleVideoLoaded = useCallback((episodeId: string) => {
    setVideoErrors((prev: Record<string, Record<string, unknown>>) => {
      const newErrors = { ...prev };
      delete newErrors[episodeId];
      return newErrors;
    });
  }, [setVideoErrors]);

  const renderEpisodeCard = useCallback((episode: Episode) => {
    const isExpanded = expandedVideoEpisodeId === episode.id;
    const isPlaying = currentPlayingEpisodeId === episode.id;

    return (
      <div key={episode.id} className="pb-4">
        <EpisodeCard
          episode={episode}
          isVideoExpanded={isExpanded}
          isCurrentlyPlaying={isPlaying}
          videoError={videoErrors[episode.id] || null}
          onSelect={() => onEpisodeSelect(episode)}
          onToggleVideoExpand={() => {
            if (isExpanded) {
              setExpandedVideoEpisodeId(null);
              setCurrentPlayingEpisodeId(null);
            } else {
              setExpandedVideoEpisodeId(episode.id);
              setCurrentPlayingEpisodeId(null);
            }
          }}
          onCollapseVideo={() => {
            setExpandedVideoEpisodeId(null);
            setCurrentPlayingEpisodeId(null);
          }}
          onSetPlaying={setCurrentPlayingEpisodeId}
          onVideoError={handleVideoError}
          onVideoLoaded={handleVideoLoaded}
          onRepair={handleRepairSingleEpisode}
          aspectRatio={aspectRatio}
        />
      </div>
    );
  }, [
    expandedVideoEpisodeId, currentPlayingEpisodeId, videoErrors,
    onEpisodeSelect, setExpandedVideoEpisodeId, setCurrentPlayingEpisodeId,
    handleVideoError, handleVideoLoaded, handleRepairSingleEpisode,
    aspectRatio,
  ]);

  const hasExpandedVideo = !!expandedVideoEpisodeId;

  if (useVirtualList && !hasExpandedVideo) {
    return (
      <>
        <div className="flex items-center gap-2 px-2 py-1.5 mb-2 bg-blue-500/10 border border-blue-500/20 rounded-lg">
          <span className="text-xs text-blue-400">
            共 {episodes.length} 集
          </span>
        </div>
        <div style={{ height: 'calc(100vh - 380px)', minHeight: '400px', overflowY: 'auto' }}>
          {episodes.map((episode) => renderEpisodeCard(episode))}
        </div>
      </>
    );
  }

  return (
    <div className="space-y-4">
      {hasExpandedVideo && useVirtualList && (
        <div className="flex items-center gap-2 px-2 py-1.5 mb-2 bg-amber-500/10 border border-amber-500/20 rounded-lg">
          <span className="text-xs text-amber-400">
            共 {episodes.length} 集 · 播放视频时暂停虚拟滚动
          </span>
        </div>
      )}
      {episodes.map((episode) => renderEpisodeCard(episode))}
    </div>
  );
}