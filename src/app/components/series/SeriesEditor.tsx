import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';
import { 
  ArrowLeft, 
  Save, 
  Play, 
  BookOpen, 
  Users, 
  BookMarked,
  Sparkles,
  Loader2,
  RefreshCw,
  RotateCcw,
  Eye,
  EyeOff,
  Globe,
  Lock,
  Monitor,
  Film,
  AlertTriangle,
  Palette,
  ImagePlus,
  X as XIcon,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { Button } from '../ui';
import { EpisodeManager } from './EpisodeManager';
import { StoryboardEditor } from './StoryboardEditor';
import { ChapterManager } from './ChapterManager';
import { CharacterManager } from './CharacterManager';
import { useSeriesEditorActions } from './hooks';
import * as seriesService from '../../services';
import { syncPendingTasks, transferCompletedToOSS } from '../../services';
import { apiUpload } from '../../utils';
import type { Series, Episode, Storyboard, Character, Chapter } from '../../types';

// v6.0.103: 判断生成是否已卡住（超过指定分钟数无进度更新）
function checkGenerationStale(series: Series, staleMinutes: number = 8): boolean {
  if (series.status !== 'generating') return false;
  const updatedAt = series.updatedAt;
  if (!updatedAt) return false;
  const updatedTime = new Date(updatedAt).getTime();
  if (isNaN(updatedTime)) return false;
  const elapsedMs = Date.now() - updatedTime;
  return elapsedMs > staleMinutes * 60 * 1000;
}

// ── Inline banners (was SeriesEditorBanners.tsx) ──────────────────
function GeneratingBanner({ series, isStale, onRetry, isRetrying }: { series: Series; isStale: boolean; onRetry: () => void; isRetrying: boolean }) {
  if (series.status !== 'generating') return null;
  const progress = typeof series.generationProgress === 'object' ? series.generationProgress : null;

  // v6.0.103: 卡住状态——显示警告横幅+重试按钮
  if (isStale) {
    return (
      <div className="mb-4 p-4 rounded-xl bg-amber-500/10 border border-amber-500/30">
        <div className="flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
          <div className="flex-1">
            <p className="text-amber-300 font-medium">AI创作可能已中断</p>
            <p className="text-amber-400/70 text-sm mt-1">长时间未检测到进度更新，请尝试重新开始</p>
          </div>
          <Button
            onClick={onRetry}
            disabled={isRetrying}
            className="bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 border border-amber-500/40"
          >
            {isRetrying ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <RotateCcw className="w-4 h-4 mr-1.5" />}
            {isRetrying ? '重试中...' : '重新创作'}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mb-4 p-4 rounded-xl bg-purple-500/10 border border-purple-500/30">
      <div className="flex items-center gap-3">
        <Sparkles className="w-5 h-5 text-purple-400 animate-pulse" />
        <div className="flex-1">
          <p className="text-purple-300 font-medium">AI正在创作中...</p>
          {progress && typeof progress === 'object' && (
            <p className="text-purple-400/70 text-sm mt-1">
              步骤 {progress.currentStep}/{progress.totalSteps}: {progress.stepName || '处理中'}
            </p>
          )}
        </div>
        <Loader2 className="w-5 h-5 text-purple-400 animate-spin" />
      </div>
    </div>
  );
}

function FailedBanner({ series, isRetrying, onRetry }: { series: Series; isRetrying: boolean; onRetry: () => void }) {
  if (series.status !== 'failed') return null;
  const progress = typeof series.generationProgress === 'object' ? series.generationProgress : null;
  return (
    <div className="mb-4 p-4 rounded-xl bg-red-500/10 border border-red-500/30">
      <div className="flex items-center gap-3">
        <AlertTriangle className="w-5 h-5 text-red-400 shrink-0" />
        <div className="flex-1">
          <p className="text-red-300 font-medium">AI创作失败</p>
          {progress && typeof progress === 'object' && progress.error && (
            <p className="text-red-400/70 text-sm mt-1 line-clamp-2">{progress.error}</p>
          )}
        </div>
        <Button
          onClick={onRetry}
          disabled={isRetrying}
          className="bg-red-500/20 text-red-300 hover:bg-red-500/30 border border-red-500/40"
        >
          {isRetrying ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <RotateCcw className="w-4 h-4 mr-1.5" />}
          {isRetrying ? '重试中...' : '重新创作'}
        </Button>
      </div>
    </div>
  );
}

// ── v6.0.118: Style Anchor Panel ──────────────────────────────────
function StyleAnchorPanel({ series, userPhone, onUpdate }: { series: Series; userPhone?: string; onUpdate: (s: Series) => void }) {
  const anchorUrl = series.coherenceCheck?.styleAnchorImageUrl;
  const anchorScene = series.coherenceCheck?.styleAnchorScene || '';
  const anchorSetAt = series.coherenceCheck?.styleAnchorSetAt;
  const upgradedFrom = series.coherenceCheck?.styleAnchorUpgradedFrom;
  const [isExpanded, setIsExpanded] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [showScenePicker, setShowScenePicker] = useState(false);
  const [isSettingFromScene, setIsSettingFromScene] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // v6.0.119: 收集所有已生成的场景缩略图（用于"从已生成场景选择"）
  type SceneThumb = { url: string; label: string; epNum: number; sceneNum: number };
  const sceneThumbs: SceneThumb[] = [];
  for (const ep of series.episodes || []) {
    for (const sb of ep.storyboards || []) {
      const thumbUrl = sb.thumbnailUrl || sb.imageUrl;
      if (thumbUrl && typeof thumbUrl === 'string' && thumbUrl.startsWith('http')) {
        sceneThumbs.push({
          url: thumbUrl,
          label: `E${ep.episodeNumber}S${sb.sceneNumber}`,
          epNum: ep.episodeNumber,
          sceneNum: sb.sceneNumber,
        });
      }
    }
  }

  // v6.0.119: 从已生成场景中选择为锚定图
  const handleSelectScene = useCallback(async (thumb: SceneThumb) => {
    setIsSettingFromScene(true);
    try {
      const updateResult = await seriesService.updateSeries(series.id, {
        styleAnchorImageUrl: thumb.url,
      } as any);
      if (updateResult.success && updateResult.data) {
        onUpdate(updateResult.data);
        toast.success(`已选择 ${thumb.label} 作为风格锚定图`);
        setShowScenePicker(false);
      } else {
        throw new Error(updateResult.error || '更新失败');
      }
    } catch (err: any) {
      toast.error('设置失败: ' + err.message);
    } finally {
      setIsSettingFromScene(false);
    }
  }, [series.id, onUpdate]);

  const anchorLabel = anchorScene === 'user-upload'
    ? '用户上传'
    : anchorScene
      ? `自动锚定 (${anchorScene})`
      : '未设置';

  const handleUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!userPhone) { toast.info('请先登录'); return; }
    if (file.size > 10 * 1024 * 1024) { toast.error('图片不能超过10MB'); return; }
    if (!file.type.startsWith('image/')) { toast.error('请上传图片文件'); return; }

    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('purpose', 'reference');
      const uploadResult = await apiUpload('/upload-image', formData, {
        headers: { 'X-User-Phone': userPhone },
      });
      if (!uploadResult.success || !uploadResult.data?.url) {
        throw new Error(uploadResult.error || '上传失败');
      }
      const newUrl = uploadResult.data.url;

      // 通过 PUT /series/:id 更新 styleAnchorImageUrl
      const updateResult = await seriesService.updateSeries(series.id, {
        styleAnchorImageUrl: newUrl,
      } as any);

      if (updateResult.success && updateResult.data) {
        onUpdate(updateResult.data);
        toast.success('风格锚定图已更新，后续生成的视频将以此为风格基准');
      } else {
        throw new Error(updateResult.error || '更新失败');
      }
    } catch (err: any) {
      console.error('[StyleAnchor] Upload failed:', err);
      toast.error('更换失败: ' + err.message);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }, [series.id, userPhone, onUpdate]);

  const handleClear = useCallback(async () => {
    if (!confirm('确认清除风格锚定图？清除后系统将自动使用下一个生成场景的画面作为风格基准。')) return;
    try {
      const updateResult = await seriesService.updateSeries(series.id, {
        styleAnchorImageUrl: '',
      } as any);
      if (updateResult.success && updateResult.data) {
        onUpdate(updateResult.data);
        toast.success('风格锚定图已清除');
      }
    } catch (err: any) {
      toast.error('清除失败: ' + err.message);
    }
  }, [series.id, onUpdate]);

  // v6.0.120: 按分集分组场景缩略图
  const scenesByEpisode = new Map<number, SceneThumb[]>();
  for (const t of sceneThumbs) {
    if (!scenesByEpisode.has(t.epNum)) scenesByEpisode.set(t.epNum, []);
    scenesByEpisode.get(t.epNum)!.push(t);
  }
  const episodeGroups = Array.from(scenesByEpisode.entries()).sort((a, b) => a[0] - b[0]);
  const hasMultipleEpisodes = episodeGroups.length > 1;

  // v6.0.120: 可复用的场景选择器网格渲染
  const renderSceneGrid = (thumbs: SceneThumb[], currentAnchor?: string) => (
    <div className="grid grid-cols-4 sm:grid-cols-6 gap-1.5">
      {thumbs.map((thumb) => (
        <button
          key={`${thumb.epNum}-${thumb.sceneNum}`}
          onClick={() => handleSelectScene(thumb)}
          disabled={isSettingFromScene || thumb.url === currentAnchor}
          className={`relative group rounded-md overflow-hidden border transition-all ${
            thumb.url === currentAnchor
              ? 'border-amber-500/60 ring-1 ring-amber-500/30 opacity-60 cursor-default'
              : 'border-white/10 hover:border-purple-500/50 hover:ring-1 hover:ring-purple-500/20 cursor-pointer'
          }`}
          title={`${thumb.label}: 点击设为锚定图`}
        >
          <img
            src={thumb.url}
            alt={thumb.label}
            className="w-full aspect-video object-cover"
            loading="lazy"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
          <span className="absolute bottom-0 left-0 right-0 bg-black/70 text-[8px] text-white/80 text-center py-0.5 font-mono">
            {thumb.label}
          </span>
          {thumb.url === currentAnchor && (
            <span className="absolute top-0.5 right-0.5 w-3 h-3 bg-amber-500 rounded-full flex items-center justify-center">
              <Palette className="w-2 h-2 text-white" />
            </span>
          )}
        </button>
      ))}
    </div>
  );

  // v6.0.120: 分集分组场景选择器
  const renderGroupedScenePicker = (currentAnchor?: string) => (
    <div className="max-h-[200px] overflow-y-auto pr-1 space-y-2">
      {hasMultipleEpisodes ? (
        episodeGroups.map(([epNum, thumbs]) => (
          <div key={epNum}>
            <p className="text-[9px] text-gray-500 font-medium mb-1 sticky top-0 bg-white/5 backdrop-blur-sm px-1 py-0.5 rounded">
              第{epNum}集 ({thumbs.length}个场景)
            </p>
            {renderSceneGrid(thumbs, currentAnchor)}
          </div>
        ))
      ) : (
        renderSceneGrid(sceneThumbs, currentAnchor)
      )}
      {isSettingFromScene && (
        <div className="flex items-center gap-1.5 mt-1.5 text-[10px] text-purple-300">
          <Loader2 className="w-3 h-3 animate-spin" />
          <span>正在设置...</span>
        </div>
      )}
    </div>
  );

  // 无锚定图时显示设置入口（上传 + 场景选择）
  if (!anchorUrl) {
    return (
      <div className="mt-2">
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-dashed border-white/15 text-gray-500 hover:text-purple-400 hover:border-purple-500/40 transition-all text-[11px]"
          >
            {isUploading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Palette className="w-3 h-3" />}
            <span>设置风格锚定图</span>
          </button>
          {sceneThumbs.length > 0 && (
            <button
              onClick={() => setShowScenePicker(!showScenePicker)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border transition-all text-[11px] ${
                showScenePicker
                  ? 'bg-amber-500/20 border-amber-500/40 text-amber-300'
                  : 'border-white/15 text-gray-500 hover:text-amber-300 hover:border-amber-500/30'
              }`}
            >
              <Film className="w-3 h-3" />
              <span>从场景选择 ({sceneThumbs.length})</span>
            </button>
          )}
        </div>
        <AnimatePresence>
          {showScenePicker && sceneThumbs.length > 0 && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.15 }}
              className="overflow-hidden"
            >
              <div className="mt-2 p-2.5 rounded-xl bg-white/5 border border-white/10">
                <p className="text-[10px] text-gray-500 mb-1.5">点击选择一个场景画面作为风格锚定:</p>
                {renderGroupedScenePicker()}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        <input ref={fileInputRef} type="file" accept="image/*" onChange={handleUpload} className="hidden" />
      </div>
    );
  }

  return (
    <div className="mt-2">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-amber-500/10 border border-amber-500/20 text-amber-300 text-[11px] font-medium hover:bg-amber-500/15 transition-all"
      >
        <Palette className="w-3 h-3" />
        <span>风格锚定</span>
        <span className="text-amber-400/60">({anchorLabel})</span>
        {isExpanded ? <ChevronUp className="w-3 h-3 ml-0.5" /> : <ChevronDown className="w-3 h-3 ml-0.5" />}
      </button>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="mt-2 p-3 rounded-xl bg-white/5 border border-white/10">
              <div className="flex items-start gap-3">
                {/* 锚定图预览 */}
                <div className="relative group shrink-0">
                  <img
                    src={anchorUrl}
                    alt="风格锚定图"
                    className="w-20 h-20 rounded-lg object-cover border border-white/20"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                  />
                  <button
                    onClick={handleClear}
                    className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    title="清除锚定图"
                  >
                    <XIcon className="w-3 h-3 text-white" />
                  </button>
                </div>

                {/* 信息 + 操作 */}
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] text-gray-400">
                    来源: <span className="text-white/80">{anchorLabel}</span>
                    {upgradedFrom && (
                      <span className="text-amber-400/60 ml-1">(从{upgradedFrom}自动升级)</span>
                    )}
                  </p>
                  {anchorSetAt && (
                    <p className="text-[10px] text-gray-500 mt-0.5">
                      设置于 {new Date(anchorSetAt).toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </p>
                  )}
                  <p className="text-[10px] text-gray-500/80 mt-1">
                    此图决定全剧的色调/光影/质感/渲染风格。所有新生成的视频场景将自动以此为基准。
                  </p>

                  <div className="flex gap-2 mt-2">
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isUploading}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-purple-500/15 border border-purple-500/30 text-purple-300 hover:bg-purple-500/25 transition-all text-[11px]"
                    >
                      {isUploading ? <Loader2 className="w-3 h-3 animate-spin" /> : <ImagePlus className="w-3 h-3" />}
                      <span>上传新图</span>
                    </button>
                    {sceneThumbs.length > 0 && (
                      <button
                        onClick={() => setShowScenePicker(!showScenePicker)}
                        className={`flex items-center gap-1 px-2.5 py-1 rounded-lg border transition-all text-[11px] ${
                          showScenePicker
                            ? 'bg-amber-500/20 border-amber-500/40 text-amber-300'
                            : 'bg-white/5 border-white/15 text-gray-400 hover:text-white hover:border-white/25'
                        }`}
                      >
                        <Film className="w-3 h-3" />
                        <span>从场景选择 ({sceneThumbs.length})</span>
                      </button>
                    )}
                  </div>

                  {/* v6.0.120: 分集分组场景缩略图选择器 */}
                  <AnimatePresence>
                    {showScenePicker && sceneThumbs.length > 0 && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.15 }}
                        className="overflow-hidden"
                      >
                        <div className="mt-2 pt-2 border-t border-white/5">
                          <p className="text-[10px] text-gray-500 mb-1.5">点击选择一个场景画面作为新的风格锚定:</p>
                          {renderGroupedScenePicker(anchorUrl)}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <input ref={fileInputRef} type="file" accept="image/*" onChange={handleUpload} className="hidden" />
    </div>
  );
}

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

  const { isGeneratingVideos, generationProgress } = useSeriesEditorActions(
    localSeries, userPhone, setLocalSeries, onUpdate
  );

  // 同步props的series到localSeries
  useEffect(() => {
    setLocalSeries(series);
  }, [series]);

  // v6.0.103: 追踪轮询无进度变化的次数，用于检测卡住
  const lastProgressRef = useRef<string>('');
  const lastUpdatedAtRef = useRef<string>('');
  const stalePollCountRef = useRef(0);
  const [isGenerationStale, setIsGenerationStale] = useState(false);

  // 如果series状态是generating，启动轮询刷新
  useEffect(() => {
    if (localSeries.status === 'generating') {
      // v6.0.103: 初始检测——如果 updatedAt 已经过时，直接标记
      if (checkGenerationStale(localSeries, 8)) {
        setIsGenerationStale(true);
      }
      const intervalId = setInterval(async () => {
        try {
          const result = await seriesService.getSeries(localSeries.id);
          if (result.success && result.data) {
            setLocalSeries(result.data);
            onUpdate(result.data);
            if (result.data.status !== 'generating') {
              clearInterval(intervalId);
              setIsGenerationStale(false);
              stalePollCountRef.current = 0;
              return;
            }
            // v6.0.104: 追踪进度+updatedAt双信号变化——任一变化都说明后端仍在工作
            const progressKey = JSON.stringify(result.data.generationProgress || '');
            const currentUpdatedAt = result.data.updatedAt || '';
            const progressChanged = progressKey !== lastProgressRef.current;
            const updatedAtChanged = currentUpdatedAt !== lastUpdatedAtRef.current;

            if (progressChanged || updatedAtChanged) {
              // 进度或updatedAt有变化——后端仍然活跃
              lastProgressRef.current = progressKey;
              lastUpdatedAtRef.current = currentUpdatedAt;
              stalePollCountRef.current = 0;
              setIsGenerationStale(false);
            } else {
              // 两者都没变化——可能卡住
              stalePollCountRef.current++;
              // v6.0.104: 阈值从18(90s)提升至36(180s)——AI单次调用可达90s，给足缓冲
              // 同时检查updatedAt是否超过8分钟无更新（后端heartbeat每批次都会更新updated_at）
              if (stalePollCountRef.current >= 36 || checkGenerationStale(result.data, 8)) {
                setIsGenerationStale(true);
                // v6.0.128: 减少日志刷屏——仅在首次检测、每100次、以及自动终止时打印
                const cnt = stalePollCountRef.current;
                if (cnt === 36 || cnt % 100 === 0) {
                  console.warn(`[SeriesEditor] Generation appears stale: ${cnt} polls without change, updatedAt=${currentUpdatedAt}`);
                }
                // v6.0.128: 硬限制——超过120次(约10分钟)无变化，自动停止轮询并标记失败
                // 防止zombie轮询无限刷屏消耗浏览器资源
                if (cnt >= 120) {
                  console.error(`[SeriesEditor] Generation irrecoverably stale after ${cnt} polls (~${Math.round(cnt * 5 / 60)}min). Auto-stopping poll.`);
                  clearInterval(intervalId);
                  // 尝试通过后端重置状态为failed（fire-and-forget）
                  seriesService.updateSeries(localSeries.id, { status: 'failed' } as any).catch(() => {});
                  setLocalSeries(prev => ({ ...prev, status: 'failed' as any }));
                  onUpdate({ ...result.data, status: 'failed' });
                  return;
                }
              }
            }
          }
        } catch (error: any) {
          console.error('[SeriesEditor] Polling error:', error.message);
        }
      }, 5000);

      return () => clearInterval(intervalId);
    } else {
      setIsGenerationStale(false);
      stalePollCountRef.current = 0;
    }
  }, [localSeries.status, localSeries.id, onUpdate]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const result = await seriesService.updateSeries(localSeries.id, localSeries);
      if (result.success && result.data) {
        onUpdate(result.data);
      } else {
        alert('保存失败：' + result.error);
      }
    } catch (error: any) {
      alert('保存失败：' + error.message);
    } finally {
      setIsSaving(false);
    }
  };

  // v6.0.70: 社区发布开关（乐观更新 + 后端持久化）
  const isPublic = localSeries.isPublic !== false; // 默认 true
  const [isTogglingPublic, setIsTogglingPublic] = useState(false);
  const handleTogglePublic = async () => {
    const newValue = !isPublic;
    setIsTogglingPublic(true);
    // 乐观更新
    const updated = { ...localSeries, isPublic: newValue };
    setLocalSeries(updated);
    try {
      const result = await seriesService.updateSeries(localSeries.id, { isPublic: newValue } as any);
      if (result.success && result.data) {
        setLocalSeries(prev => ({ ...prev, ...result.data, isPublic: newValue }));
        onUpdate({ ...localSeries, ...result.data, isPublic: newValue });
        toast.success(newValue ? '作品已发布到社区，所有人可见' : '作品已设为私有，仅自己可见');
      } else {
        // 回滚
        setLocalSeries(prev => ({ ...prev, isPublic: !newValue }));
        toast.error('设置失败：' + (result.error || '未知错误'));
      }
    } catch (err: any) {
      setLocalSeries(prev => ({ ...prev, isPublic: !newValue }));
      toast.error('设置失败：' + err.message);
    } finally {
      setIsTogglingPublic(false);
    }
  };

  // v5.2.0: 重试失败的AI创作
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
        // v6.0.115: 重试成功后重置卡住检测状态，避免stale banner残留
        setIsGenerationStale(false);
        stalePollCountRef.current = 0;
        lastProgressRef.current = '';
        lastUpdatedAtRef.current = '';
        setLocalSeries(prev => ({ ...prev, status: 'generating' }));
        onUpdate({ ...localSeries, status: 'generating' } as Series);
      } else {
        toast.error('重试失败：' + (result.error || '未知错误'));
      }
    } catch (error: any) {
      toast.error('重试失败：' + error.message);
    } finally {
      setIsRetrying(false);
    }
  };

  const handleCharacterUpdate = (characters: Character[]) => {
    const updated = { ...localSeries, characters, updatedAt: new Date().toISOString() };
    setLocalSeries(updated);
    // 角色CRUD已由CharacterManager直接调用后端API处理，这里只更新本地状态
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
      {/* v6.0.21: 移除底部右下角生成进度浮窗——统一由右上角TaskStatusFloating展示 */}
      
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
            {/* v6.0.80: 作品配置信息条——画面比例/分辨率/风格（只读，旧剧显示默认值） */}
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
                } catch (err: any) {
                  toast.error('同步失败：' + err.message);
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
            <span className="font-medium text-sm sm:text-base">角色</span>
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
            />
          )}

          {currentView === 'characters' && (
            <CharacterManager
              characters={localSeries.characters || []}
              seriesId={localSeries.id}
              userPhone={userPhone}
              seriesStatus={localSeries.status}
              onUpdate={handleCharacterUpdate}
            />
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
    </div>
  );
}