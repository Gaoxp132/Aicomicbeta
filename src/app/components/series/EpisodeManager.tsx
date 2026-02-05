import { useState, useEffect } from 'react';
import { Button } from '../ui/button';
import { Plus, Play, Edit, Calendar, Loader2, Wand2, Download } from 'lucide-react';
import { PlaylistVideoPlayer } from '../PlaylistVideoPlayer';
import { M3U8Diagnostic } from '../M3U8Diagnostic';
import { VideoErrorFallback } from '../VideoErrorFallback';
import { VideoPlayer } from '../VideoPlayer';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';
import type { Series, Episode } from '../../types';
import { mergeAllSeriesVideos, repairEpisodeVideo } from '@/app/services/videoMerger';
import * as aiGenerationService from '@/app/services/aiGenerationService';
import * as seriesService from '@/app/services/seriesService';
import { generateEpisodeOutlines } from '@/app/services/aiEpisodeGenerator';
import { projectId, publicAnonKey } from '/utils/supabase/info';

interface EpisodeManagerProps {
  series: Series;
  onEpisodeSelect: (episode: Episode) => void;
  onEpisodesUpdate: (episodes: Episode[]) => void;
  userPhone?: string;
}

export function EpisodeManager({ series, onEpisodeSelect, onEpisodesUpdate, userPhone }: EpisodeManagerProps) {
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [isGeneratingEpisodes, setIsGeneratingEpisodes] = useState(false);
  const [isGeneratingStoryboards, setIsGeneratingStoryboards] = useState(false);
  const [isSmartGenerating, setIsSmartGenerating] = useState(false); // 🆕 智能生成状态
  const [isMerging, setIsMerging] = useState(false);
  const [smartProgress, setSmartProgress] = useState<string>(''); // 🆕 智能生成进度
  const [fullAIProgress, setFullAIProgress] = useState<string>(''); // 🆕 AI完整生成进度
  const [isGeneratingFullAI, setIsGeneratingFullAI] = useState(false); // 🆕 AI完整生成状态
  const [showDiagnosticForEpisode, setShowDiagnosticForEpisode] = useState<string | null>(null); // 🆕 诊断面板
  const [videoErrors, setVideoErrors] = useState<Record<string, any>>({}); // 🆕 视频错误状态
  const [repairingEpisodeId, setRepairingEpisodeId] = useState<string | null>(null); // 🆕 修复中的剧集ID
  const [alertDismissed, setAlertDismissed] = useState(false); // 🆕 警告是否被关闭
  const [currentPlayingEpisodeId, setCurrentPlayingEpisodeId] = useState<string | null>(null); // 🎯 当前播放的剧集ID

  // ✅ 确保episodes数组始终存在
  const episodes = series.episodes || [];
  
  // 🔍 添加详细的诊断日志
  useEffect(() => {
    console.group('[EpisodeManager] 📊 Data Status');
    console.log('Series ID:', series.id);
    console.log('Series Title:', series.title);
    console.log('Episodes prop:', series.episodes);
    console.log('Episodes count:', episodes.length);
    console.log('TotalEpisodes:', series.totalEpisodes);
    if (episodes.length > 0) {
      console.log('First episode:', episodes[0]);
    }
    console.groupEnd();
  }, [series, episodes.length]);
  
  // 🆕 计算有视频错误的剧集数量
  const videoErrorCount = Object.keys(videoErrors).length;
  
  // ✅ 检查是否有视频可以合并
  // 修改逻辑：只要有videoUrl就认为可以合并，不强制要求status为completed
  const hasVideosToMerge = episodes.some(ep => 
    ep.storyboards && ep.storyboards.some(sb => sb.videoUrl)
  );

  const handleGenerateStoryboards = async (episode: Episode) => {
    setGeneratingId(episode.id);
    
    try {
      const result = await seriesService.generateStoryboards(series.id, episode.id);
      
      if (result.success && result.data) {
        // 更新剧集的分镜数据
        const updatedEpisodes = episodes.map(ep =>
          ep.id === episode.id
            ? { ...ep, storyboards: result.data!, totalDuration: result.data!.reduce((sum, sb) => sum + sb.duration, 0) }
            : ep
        );
        onEpisodesUpdate(updatedEpisodes);
      } else {
        toast.error('生成分镜失败：' + result.error);
      }
    } catch (error: any) {
      toast.error('生成分镜失败：' + error.message);
    } finally {
      setGeneratingId(null);
    }
  };

  const handleAddEpisode = () => {
    const newEpisode: Episode = {
      id: `ep-${Date.now()}`,
      seriesId: series.id,
      episodeNumber: episodes.length + 1,
      title: `第 ${episodes.length + 1} 集`,
      synopsis: '',
      storyboards: [],
      totalDuration: 0,
      status: 'draft',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    
    onEpisodesUpdate([...episodes, newEpisode]);
  };

  const handleGenerateEpisodes = async () => {
    setIsGeneratingEpisodes(true);
    
    try {
      console.log('[EpisodeManager] Generating episodes with AI...');
      console.log('[EpisodeManager] Series data:', {
        title: series.title,
        description: series.description,
        totalEpisodes: series.totalEpisodes,
        genre: series.genre,
        theme: series.theme,
        targetAudience: series.targetAudience,
      });
      
      // 🔧 检查必填字段
      if (!series.title || !series.description || !series.totalEpisodes || !series.genre) {
        toast.error('AI生成分集大纲失败：缺少必填字段：seriesTitle, seriesDescription, totalEpisodes, genre');
        console.error('[EpisodeManager] Missing required fields:', {
          title: series.title,
          description: series.description,
          totalEpisodes: series.totalEpisodes,
          genre: series.genre,
        });
        return;
      }
      
      const result = await generateEpisodeOutlines({
        seriesTitle: series.title,
        seriesDescription: series.description,
        totalEpisodes: series.totalEpisodes,
        genre: series.genre,
        theme: series.theme || undefined,
        targetAudience: series.targetAudience || undefined,
      });
      
      if (result.success && result.episodes) {
        const newEpisodes: Episode[] = result.episodes.map((outline, index) => ({
          id: `ep-${Date.now()}-${index}`,
          seriesId: series.id,
          episodeNumber: outline.episodeNumber,
          title: outline.title,
          synopsis: outline.synopsis,
          growthTheme: outline.growthTheme,
          storyboards: [],
          totalDuration: 0,
          status: 'draft',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }));
        
        console.log(`[EpisodeManager] ✅ Generated ${newEpisodes.length} episodes`);
        onEpisodesUpdate(newEpisodes);
      } else {
        toast.error('AI生成分集大纲失败：' + (result.error || '未知错误'));
      }
    } catch (error: any) {
      console.error('[EpisodeManager] Error generating episodes:', error);
      toast.error('AI生成分集大纲失败：' + error.message);
    } finally {
      setIsGeneratingEpisodes(false);
    }
  };

  const handleGenerateFullAI = async () => {
    if (!userPhone) {
      toast.error('请先登录后使用AI完整生成功能');
      return;
    }

    setIsGeneratingFullAI(true);
    setFullAIProgress('正在启动AI完整生成...');
    
    try {
      console.log('[EpisodeManager] Starting full AI generation for series:', series.id);
      
      const result = await aiGenerationService.generateFullAI(
        series.id, 
        userPhone,
        (status) => {
          setFullAIProgress(status);
          console.log('[EpisodeManager] Progress:', status);
        }
      );
      
      if (result.success) {
        console.log('[EpisodeManager] ✅ Full AI generation completed');
        toast.success('🎉 AI完整生成成功！系列内容已全部生成。');
        
        // 刷新页面以获取最新数据
        window.location.reload();
      } else {
        toast.error('AI完整生成失败：' + (result.error || '未知错误'));
      }
    } catch (error: any) {
      console.error('[EpisodeManager] Error in full AI generation:', error);
      toast.error('AI完整生成失败：' + error.message);
    } finally {
      setIsGeneratingFullAI(false);
      setFullAIProgress('');
    }
  };

  // 🆕 智能生成 - 自动检测已有数据，生成缺失内容
  const handleSmartGenerate = async () => {
    if (!userPhone) {
      toast.error('请先登录后使用智能生成功能');
      return;
    }

    setIsSmartGenerating(true);
    setSmartProgress('正在分析系列数据...');
    
    try {
      console.log('[EpisodeManager] Starting smart generation for series:', series.id);
      
      // 智能判断：如果没有任何episodes，使用完整AI生成
      if (episodes.length === 0) {
        setSmartProgress('正在AI生成完整系列内容...');
        const result = await aiGenerationService.generateFullAI(
          series.id, 
          userPhone,
          (status) => {
            setSmartProgress(status);
            console.log('[EpisodeManager] Progress:', status);
          }
        );
        
        if (result.success) {
          console.log('[EpisodeManager] ✅ Smart generation completed');
          toast.success('🎉 智能生成成功！系列内容已全部生成。');
          window.location.reload();
        } else {
          toast.error('智能生成失败：' + (result.error || '未知错误'));
        }
      } else {
        // 如果有episodes但没有分镜，生成分镜
        const episodesWithoutStoryboards = episodes.filter(ep => !ep.storyboards || ep.storyboards.length === 0);
        if (episodesWithoutStoryboards.length > 0) {
          setSmartProgress(`正在为 ${episodesWithoutStoryboards.length} 个分集生成分镜...`);
          // TODO: 现批量分镜生成
          toast.info('检测到部分分集缺少分镜，请手动进入分集编辑页面生成');
        } else {
          toast.info('所有分集都已有分镜，无需智能生成');
        }
      }
    } catch (error: any) {
      console.error('[EpisodeManager] Error in smart generation:', error);
      toast.error('智能生成失败：' + error.message);
    } finally {
      setIsSmartGenerating(false);
      setSmartProgress('');
    }
  };

  const handleMergeVideos = async () => {
    // 🔧 验证userPhone
    if (!userPhone) {
      toast.error('请先登录后合并视频');
      return;
    }

    setIsMerging(true);
    try {
      console.log('[EpisodeManager] Merging all series videos...');
      const result = await mergeAllSeriesVideos(series.id, userPhone);
      
      if (result.success) {
        toast.success(`✅ 视频合并完成！成功: ${result.mergedCount}, 失败: ${result.failedCount}`);
        // 刷新页面
        window.location.reload();
      } else {
        toast.error('视频合并失败：' + (result.error || '未知错误'));
      }
    } catch (error: any) {
      console.error('[EpisodeManager] Error merging videos:', error);
      toast.error('视频合并失败：' + error.message);
    } finally {
      setIsMerging(false);
    }
  };

  // 🆕 修复单个剧集的视频
  const handleRepairSingleEpisode = async (episodeId: string) => {
    if (!userPhone) {
      toast.error('请先登录后再修复视频');
      return;
    }

    setRepairingEpisodeId(episodeId);
    
    try {
      console.log('[EpisodeManager] 🔧 Starting video repair for episode:', episodeId);
      toast.loading('正在修复视频，请稍候...', { id: 'repair-loading' });
      
      const result = await repairEpisodeVideo(episodeId, userPhone);
      
      // 清除loading toast
      toast.dismiss('repair-loading');
      
      if (result.success) {
        console.log('[EpisodeManager] ✅ Video repair successful');
        toast.success('✅ 视频修复成功！页面将自动刷新', { duration: 2000 });
        // 刷新页面
        setTimeout(() => window.location.reload(), 2000);
      } else {
        console.error('[EpisodeManager] ❌ Video repair failed:', result.error);
        toast.error(`视频修复失败：${result.error || '未知错误'}`, { duration: 5000 });
      }
    } catch (error: any) {
      console.error('[EpisodeManager] ❌ Exception during video repair:', error);
      toast.dismiss('repair-loading');
      toast.error(`视频修复出错：${error.message || '网络错误'}`, { duration: 5000 });
    } finally {
      setRepairingEpisodeId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* 头部 */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white mb-1">分集管理</h2>
          <p className="text-sm text-gray-400">
            {episodes.length} / {Math.max(series.totalEpisodes, episodes.length)} 集
          </p>
        </div>
        <div className="flex gap-2">
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

      {/* 🆕 全局视频健康警告 - 检测到多个视频错误时自动显示 */}
      {/* TODO: 临时注释掉，等待VideoHealthAlert组件实现
      {videoErrorCount > 0 && !alertDismissed && (
        <VideoHealthAlert
          errorCount={videoErrorCount}
          onFixAll={handleMergeVideos}
          onDismiss={() => setAlertDismissed(true)}
        />
      )}
      */}

      {/* 🆕 视频健康检查工具 - 只在有剧集时显示 */}
      {/* TODO: 临时注释掉，等待SeriesVideoHealthChecker组件实现
      {episodes.length > 0 && (
        <SeriesVideoHealthChecker 
          series={series} 
          onRepairNeeded={() => {
            // 当检测到需要修复时，可以自动展开修复工具或提示用户
            console.log('视频需要修复');
          }}
        />
      )}
      */}

      {/* 剧集列表 */}
      {episodes.length === 0 ? (
        <div className="bg-white/5 backdrop-blur-xl rounded-2xl p-12 border border-white/10 text-center">
          {/* 🎨 AI创作中状态 */}
          {series.status === 'generating' ? (
            <>
              <div className="w-20 h-20 bg-gradient-to-br from-blue-500/20 to-cyan-500/20 rounded-full flex items-center justify-center mx-auto mb-6 animate-pulse">
                <Loader2 className="w-10 h-10 text-blue-400 animate-spin" />
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">AI创作中...</h3>
              <p className="text-gray-400 mb-2">
                {series.generationProgress?.stepName || '正在生成精彩内容'}
              </p>
              {series.generationProgress?.error && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 mt-4 max-w-md mx-auto">
                  <p className="text-red-400 text-sm font-semibold mb-1">❌ 创作失败</p>
                  <p className="text-red-300 text-xs">{series.generationProgress.error}</p>
                  <p className="text-gray-400 text-xs mt-2">请刷新页面重试，或联系技术支持</p>
                </div>
              )}
              {series.generationProgress && !series.generationProgress.error && (
                <div className="max-w-xs mx-auto mt-4">
                  <div className="flex justify-between text-sm text-gray-400 mb-2">
                    <span>步骤 {series.generationProgress.currentStep}/{series.generationProgress.totalSteps}</span>
                    <span>{Math.round((series.generationProgress.currentStep / series.generationProgress.totalSteps) * 100)}%</span>
                  </div>
                  <div className="w-full bg-white/10 rounded-full h-2 overflow-hidden">
                    <motion.div
                      className="h-full bg-gradient-to-r from-blue-500 to-cyan-500"
                      initial={{ width: 0 }}
                      animate={{ width: `${(series.generationProgress.currentStep / series.generationProgress.totalSteps) * 100}%` }}
                      transition={{ duration: 0.5 }}
                    />
                  </div>
                  <p className="text-xs text-gray-500 mt-4">
                    预计需要 30-60 秒，页面会自动更新
                  </p>
                </div>
              )}
            </>
          ) : series.status === 'failed' ? (
            <>
              <div className="w-20 h-20 bg-gradient-to-br from-red-500/20 to-orange-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
                <span className="text-4xl"></span>
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">创作失败</h3>
              <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 mt-4 max-w-md mx-auto">
                <p className="text-red-300 text-sm">
                  {series.generationProgress?.error || '未知错误，请重试'}
                </p>
              </div>
              <p className="text-gray-400 mt-4">
                请刷新页面重试，或检查网络连接
              </p>
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
        <div className="grid grid-cols-1 gap-4">
          {episodes.map((episode, index) => {
            // ✅ 检查episode是否有合并后的视频URL
            const mergedVideoUrl = episode.mergedVideoUrl || (episode as any).merged_video_url;
            // ✅ 只在有实际URL值时才显示播放器
            const hasValidMergedVideo = mergedVideoUrl && mergedVideoUrl.trim().length > 0;
            
            // 🔍 调试日志
            console.log(`[EpisodeManager] Episode ${episode.episodeNumber} - mergedVideoUrl check:`, {
              episodeId: episode.id,
              mergedVideoUrl_camelCase: episode.mergedVideoUrl,
              merged_video_url_snakeCase: (episode as any).merged_video_url,
              final_mergedVideoUrl: mergedVideoUrl,
              hasValidMergedVideo,
              mergedVideoUrl_type: typeof mergedVideoUrl,
            });
            
            return (
            <motion.div
              key={episode.id}
              whileHover={{ x: 4 }}
              onClick={() => !hasValidMergedVideo && onEpisodeSelect(episode)} // 如果有合并视频，点击不跳转
              className={`bg-white/5 backdrop-blur-xl rounded-2xl p-6 border border-white/10 group hover:border-purple-500/30 transition-all ${hasValidMergedVideo ? '' : 'cursor-pointer'}`}
            >
              <div className="flex items-start gap-4">
                {/* 集数编号 */}
                <div className="flex-shrink-0 w-16 h-16 bg-gradient-to-br from-purple-500/20 to-pink-500/20 rounded-xl flex items-center justify-center border border-purple-500/30">
                  <span className="text-2xl font-bold text-white">{episode.episodeNumber}</span>
                </div>

                {/* 内容 */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between mb-2">
                    <h3 className="text-lg font-bold text-white group-hover:text-purple-400 transition-colors">
                      {episode.title}
                    </h3>
                    <div className="flex items-center gap-2">
                      <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                        episode.status === 'completed'
                          ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                          : episode.status === 'generating'
                          ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                          : 'bg-gray-500/20 text-gray-400 border border-gray-500/30'
                      }`}>
                        {episode.status === 'completed' ? '已完成' : episode.status === 'generating' ? '生成中' : '草稿'}
                      </span>
                      <Button
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          onEpisodeSelect(episode);
                        }}
                        className="opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <Edit className="w-4 h-4 mr-1" />
                        编辑
                      </Button>
                    </div>
                  </div>

                  {episode.synopsis && (
                    <p className="text-sm text-gray-400 mb-3 line-clamp-2">
                      {episode.synopsis}
                    </p>
                  )}

                  {/* 🆕 如果有合并后的视频，显示视频播放器 - 固定尺寸防止闪烁 */}
                  {hasValidMergedVideo && (() => {
                    // 🔥 额外的安全检查：确保mergedVideoUrl是有效字符串
                    if (!mergedVideoUrl || typeof mergedVideoUrl !== 'string' || !mergedVideoUrl.trim()) {
                      return null;
                    }
                    
                    // 🔥 判断是JSON字符串还是URL
                    const isJsonString = mergedVideoUrl.trim().startsWith('{');
                    const isJsonUrl = mergedVideoUrl.trim().endsWith('.json');
                    const isPlaylist = isJsonString || isJsonUrl;
                    
                    // 🆕 检测merged_video_url是否可能有问题（太短或格式错误）
                    const isProbablyCorrupted = mergedVideoUrl.length < 100 || (isJsonString && !mergedVideoUrl.includes('"videos"'));
                    
                    if (isProbablyCorrupted) {
                      return (
                        <div className="mb-3 bg-yellow-900/20 border border-yellow-600 rounded-lg p-4 text-center">
                          <p className="text-yellow-400 text-sm mb-2">⚠️ 检测到视频数据可能需要更新</p>
                          <p className="text-yellow-300 text-xs">请点击"合并视频"按钮重新生成视频</p>
                        </div>
                      );
                    }
                    
                    // 🎯 判断是否应该播放（只有当前剧集ID匹配时才播放）
                    const shouldAutoPlay = currentPlayingEpisodeId === episode.id;
                    
                    return (
                    <div className="mb-3 bg-black rounded-lg overflow-hidden" style={{ aspectRatio: '16/9', maxWidth: '100%' }}>
                      {/* 🆕 检查是否有视频错误 */}
                      {videoErrors[episode.id] ? (
                        <VideoErrorFallback
                          episode={episode}
                          error={videoErrors[episode.id]}
                          onRepair={handleRepairSingleEpisode}
                        />
                      ) : isPlaylist ? (
                        // 播放列表格式（虚拟合并）- JSON字符串或JSON URL
                        <PlaylistVideoPlayer
                          key={`${episode.id}-${mergedVideoUrl.substring(0, 50)}`}
                          playlistUrl={mergedVideoUrl}
                          className="w-full h-full"
                          autoPlay={false}
                          onPlay={() => {
                            console.log('[EpisodeManager] 🎬 Video started playing:', episode.id);
                            setCurrentPlayingEpisodeId(episode.id);
                          }}
                          onPause={() => {
                            console.log('[EpisodeManager] ⏸️ Video paused:', episode.id);
                            if (currentPlayingEpisodeId === episode.id) {
                              setCurrentPlayingEpisodeId(null);
                            }
                          }}
                        />
                      ) : (
                        // 单一视频文件或M3U8
                        <VideoPlayer
                          key={`${episode.id}-${mergedVideoUrl}`}
                          src={mergedVideoUrl}
                          controls
                          preload="metadata"
                          className="w-full h-full object-contain"
                          style={{ maxHeight: '400px' }}
                          onPlay={(e) => {
                            console.log('[EpisodeManager] 🎬 Video started playing:', episode.id);
                            setCurrentPlayingEpisodeId(episode.id);
                            
                            // 🎯 暂停其他所有视频
                            const allVideos = document.querySelectorAll('video');
                            allVideos.forEach((video) => {
                              if (video !== e.currentTarget && !video.paused) {
                                console.log('[EpisodeManager] ⏸️ Pausing other video');
                                video.pause();
                              }
                            });
                          }}
                          onPause={() => {
                            console.log('[EpisodeManager] ⏸️ Video paused:', episode.id);
                            if (currentPlayingEpisodeId === episode.id) {
                              setCurrentPlayingEpisodeId(null);
                            }
                          }}
                          onError={(e) => {
                            const target = e.currentTarget;
                            const errorInfo = {
                              episodeId: episode.id,
                              url: mergedVideoUrl,
                              errorType: e.type,
                              networkState: target?.networkState ?? 'unknown',
                              readyState: target?.readyState ?? 'unknown',
                            };
                            console.error('[EpisodeManager] Video load error:', errorInfo);
                            
                            // 🆕 记录视频错误，触发显示VideoErrorFallback
                            setVideoErrors(prev => ({
                              ...prev,
                              [episode.id]: errorInfo
                            }));
                          }}
                          onLoadedMetadata={() => {
                            console.log('[EpisodeManager] Video loaded successfully:', mergedVideoUrl);
                            // 清除错误状态
                            setVideoErrors(prev => {
                              const newErrors = { ...prev };
                              delete newErrors[episode.id];
                              return newErrors;
                            });
                          }}
                        />
                      )}
                    </div>
                    );
                  })()}

                  <div className="flex items-center gap-4 text-xs text-gray-500">
                    <span className="flex items-center gap-1">
                      <Play className="w-3 h-3" />
                      {episode.storyboards?.length || 0} 个分镜
                    </span>
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {new Date(episode.updatedAt).toLocaleDateString()}
                    </span>
                    {episode.totalDuration > 0 && (
                      <span>预计时长 {episode.totalDuration}秒</span>
                    )}
                    {hasValidMergedVideo && (
                      <span className="text-green-400 flex items-center gap-1">
                        ✅ 已合并视频
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          );
          })}
        </div>
      )}
    </div>
  );
}