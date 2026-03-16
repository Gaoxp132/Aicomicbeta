/**
 * StyleAnchorPanel — Style anchor image management panel for SeriesEditor
 * Extracted from SeriesEditorBanners.tsx for maintainability
 */

import { useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';
import {
  Loader2, Palette, Film, ImagePlus, X as XIcon, ChevronDown, ChevronUp
} from 'lucide-react';
import * as seriesService from '../../services';
import { apiUpload } from '../../utils';
import type { Series } from '../../types';
import { ConfirmDialog, useConfirm } from './ConfirmDialog';
import { getErrorMessage } from '../../utils';

export function StyleAnchorPanel({ series, userPhone, onUpdate }: {
  series: Series; userPhone?: string; onUpdate: (s: Series) => void;
}) {
  const anchorUrl = series.coherenceCheck?.styleAnchorImageUrl;
  const anchorScene = series.coherenceCheck?.styleAnchorScene || '';
  const anchorSetAt = series.coherenceCheck?.styleAnchorSetAt;
  const upgradedFrom = series.coherenceCheck?.styleAnchorUpgradedFrom;
  const [isExpanded, setIsExpanded] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [showScenePicker, setShowScenePicker] = useState(false);
  const [isSettingFromScene, setIsSettingFromScene] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { confirm: confirmAction, dialogProps } = useConfirm();

  // Collect all generated scene thumbnails
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

  const handleSelectScene = useCallback(async (thumb: SceneThumb) => {
    setIsSettingFromScene(true);
    try {
      const updateResult = await seriesService.updateSeries(series.id, {
        styleAnchorImageUrl: thumb.url,
      });
      if (updateResult.success && updateResult.data) {
        onUpdate(updateResult.data);
        toast.success(`已选择 ${thumb.label} 作为风格锚定图`);
        setShowScenePicker(false);
      } else {
        throw new Error(updateResult.error || '更新失败');
      }
    } catch (err: unknown) {
      toast.error('设置失败: ' + getErrorMessage(err));
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
      const updateResult = await seriesService.updateSeries(series.id, {
        styleAnchorImageUrl: newUrl,
      });

      if (updateResult.success && updateResult.data) {
        onUpdate(updateResult.data);
        toast.success('风格锚定图已更新，后续生成的视频将以此为风格基准');
      } else {
        throw new Error(updateResult.error || '更新失败');
      }
    } catch (err: unknown) {
      console.error('[StyleAnchor] Upload failed:', err);
      toast.error('上传失败: ' + getErrorMessage(err));
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }, [series.id, userPhone, onUpdate]);

  const handleClear = useCallback(async () => {
    const confirmed = await confirmAction({
      title: '清除风格锚定图',
      description: '确认清除风格锚定图？清除后系统将自动使用下一个生成场景的画面作为风格基准。',
      confirmText: '确认清除',
      cancelText: '取消',
      variant: 'warning',
      icon: 'reset',
    });
    if (!confirmed) return;
    try {
      const updateResult = await seriesService.updateSeries(series.id, {
        styleAnchorImageUrl: '',
      });
      if (updateResult.success && updateResult.data) {
        onUpdate(updateResult.data);
        toast.success('风格锚定图已清除');
      }
    } catch (err: unknown) {
      toast.error('清除失败: ' + getErrorMessage(err));
    }
  }, [series.id, onUpdate]);

  // Group scenes by episode
  const scenesByEpisode = new Map<number, SceneThumb[]>();
  for (const t of sceneThumbs) {
    if (!scenesByEpisode.has(t.epNum)) scenesByEpisode.set(t.epNum, []);
    scenesByEpisode.get(t.epNum)!.push(t);
  }
  const episodeGroups = Array.from(scenesByEpisode.entries()).sort((a, b) => a[0] - b[0]);
  const hasMultipleEpisodes = episodeGroups.length > 1;

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

  // No anchor image — show setup entry
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
      <ConfirmDialog {...dialogProps} />
    </div>
  );
}