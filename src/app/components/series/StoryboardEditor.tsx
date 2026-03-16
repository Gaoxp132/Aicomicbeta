import { useState, useRef, useEffect, useCallback } from 'react';
import { AnimatePresence } from 'motion/react';
import { 
  Wand2, Image as ImageIcon, 
  Plus, Loader2,
} from 'lucide-react';
import { Button } from '../ui';
import { toast } from 'sonner';
import { StoryboardForm } from './StoryboardWidgets';
import { DraggableStoryboardCard } from './StoryboardWidgets';
import { StoryboardVideoMerger } from './StoryboardVideoMerger';
import { StoryboardPreview } from './StoryboardPreview';
import { PolishPreviewModal } from './PolishPreviewModal';
import { ConfirmDialog, useConfirm } from './ConfirmDialog';
import { AutoMergeStatusBars, BatchProgressBar, BatchPolishProgressBar } from './StoryboardStatusBars';
import { StoryboardEditorToolbar } from './StoryboardEditorToolbar';
import { useStoryboardBatchGeneration } from './hooks';
import { useAutoMerge } from './useAutoMerge';
import { useStoryboardPersistence } from './useStoryboardPersistence';
import { useStoryboardPolling } from './useStoryboardPolling';
import { useStoryboardActions } from './useStoryboardActions';
import { useVideoQuota } from '../../hooks/useVideoQuota';
import type { Episode, Character, Storyboard } from '../../types';
import { ASPECT_TO_RESOLUTION } from '../../utils';
import { sbVideoUrl, sbThumbnailUrl } from '../../utils';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';

interface StoryboardEditorProps {
  episode: Episode;
  characters: Character[];
  style: string;
  seriesId: string;
  userPhone: string;
  aspectRatio?: string;
  styleAnchorImageUrl?: string;
  onBack: () => void;
  onUpdate: (storyboards: Storyboard[]) => void;
}

export function StoryboardEditor({ 
  episode, characters, style, seriesId, userPhone, 
  aspectRatio, styleAnchorImageUrl, onBack, onUpdate 
}: StoryboardEditorProps) {
  const { confirm: showConfirm, dialogProps: confirmDialogProps } = useConfirm();

  const [storyboards, setStoryboards] = useState<Storyboard[]>(episode.storyboards || []);
  const [mergedVideoUrl, setMergedVideoUrl] = useState<string | null>(episode.mergedVideoUrl || null);

  // ── Selection & preview state ──────────────────────────────────────
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);

  // Shared refs
  const isMountedRef = useRef(true);
  useEffect(() => { isMountedRef.current = true; return () => { isMountedRef.current = false; }; }, []);

  const storyboardsRef = useRef<Storyboard[]>(storyboards);
  useEffect(() => { storyboardsRef.current = storyboards; }, [storyboards]);

  const onUpdateRef = useRef(onUpdate);
  useEffect(() => { onUpdateRef.current = onUpdate; }, [onUpdate]);

  const updateStoryboards = useCallback((updater: (prev: Storyboard[]) => Storyboard[]) => {
    setStoryboards(prev => {
      const next = updater(prev);
      storyboardsRef.current = next;
      return next;
    });
    queueMicrotask(() => {
      onUpdateRef.current(storyboardsRef.current);
    });
  }, []);

  const sessionGeneratingIds = useRef<Set<string>>(new Set());
  const generatingStartTimes = useRef<Map<string, number>>(new Map());

  // ── Persistence hook ───────────────────────────────────────────────
  const {
    persistNewStoryboard, persistStoryboardEdit,
    persistSortOrder, persistDeleteAndReorder, patchStoryboardStatus,
  } = useStoryboardPersistence({
    seriesId, episodeNumber: episode.episodeNumber,
    updateStoryboards, storyboardsRef,
  });

  // ── Computed stats ─────────────────────────────────────────────────
  const pendingStoryboards = storyboards.filter(sb => {
    return !sbVideoUrl(sb) && sb.status !== 'generating';
  });
  const completedCount = storyboards.filter(sb => !!sbVideoUrl(sb)).length;
  const generatingCount = storyboards.filter(sb => sb.status === 'generating').length;
  const allVideosReady = storyboards.length > 0 && completedCount === storyboards.length && generatingCount === 0;

  const preferredResolution = aspectRatio ? ASPECT_TO_RESOLUTION[aspectRatio] : undefined;

  // ── Auto-merge hook ────────────────────────────────────────────────
  const autoMerge = useAutoMerge({
    episode, storyboardsRef, isMountedRef, seriesId, userPhone,
    preferredResolution, allVideosReady, completedCount,
    mergedVideoUrl, setMergedVideoUrl,
  });

  // ── Batch generation hook ──────────────────────────────────────────
  const { isBatchGenerating, batchProgress, handleBatchGenerate } = useStoryboardBatchGeneration({
    seriesId, userPhone, episodeNumber: episode.episodeNumber,
    storyboardsRef, updateStoryboards, styleAnchorImageUrl, generatingStartTimes,
    confirmFn: showConfirm,
  });

  const { quota } = useVideoQuota(userPhone);

  // ── Polling hook ───────────────────────────────────────────────────
  useStoryboardPolling({
    storyboards, seriesId, episodeId: episode.id,
    updateStoryboards, sessionGeneratingIds, generatingStartTimes,
    patchStoryboardStatus,
  });

  // ── Actions hook (all handlers) ────────────────────────────────────
  const actions = useStoryboardActions({
    seriesId, userPhone, episode, characters, style,
    storyboardsRef, sessionGeneratingIds, generatingStartTimes,
    updateStoryboards, persistNewStoryboard, persistStoryboardEdit,
    persistSortOrder, persistDeleteAndReorder, patchStoryboardStatus,
    showConfirm,
  });

  const {
    editingId, isAdding, setIsAdding, isGeneratingAI,
    polishingId, polishPreview, setPolishPreview, batchPolishProgress,
    lastDeleteRef,
    handleFormSubmit, handleFormCancel, handleEdit, handleDuplicate,
    handleDelete, handleUndoDelete, handleGenerate, handleRegenerateVideo,
    handleResetStuck, handleStoryboardsUpdatedByMerger, handleGenerateAIScript,
    handleMoveCard, handlePolishFromCard, handleAcceptPolish,
    handleBatchDelete, handleBatchRegenerate, handleBatchReset, handleBatchPolish,
  } = actions;

  // ── Sync external episode.storyboards ──────────────────────────────
  useEffect(() => {
    const externalSb = episode.storyboards || [];
    if (externalSb.length === 0) return;

    setStoryboards(prev => {
      let changed = false;
      const merged = prev.map(sb => {
        const ext = externalSb.find(e => e.id === sb.id);
        if (!ext) return sb;
        const extVideo = sbVideoUrl(ext);
        const localVideo = sbVideoUrl(sb);
        if (extVideo && !localVideo) {
          changed = true;
          return { ...sb, videoUrl: extVideo, status: 'completed' as const };
        }
        const extThumb = sbThumbnailUrl(ext);
        const localThumb = sbThumbnailUrl(sb);
        if (extThumb && !localThumb) {
          changed = true;
          return { ...sb, thumbnailUrl: extThumb };
        }
        return sb;
      });
      if (changed) storyboardsRef.current = merged;
      return changed ? merged : prev;
    });
  }, [episode.storyboards]);

  // Reset on episode switch
  useEffect(() => {
    autoMerge.resetForEpisode();
    setIsSelectionMode(false);
    setSelectedIds(new Set());
    setPreviewIndex(null);
  }, [episode.id, autoMerge.resetForEpisode]);

  const editingStoryboard = editingId ? storyboards.find(sb => sb.id === editingId) || null : null;

  // Ctrl+Z undo delete
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        if (lastDeleteRef.current) {
          e.preventDefault();
          handleUndoDelete();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleUndoDelete, lastDeleteRef]);

  // ── Selection helpers ──────────────────────────────────────────────
  const handleToggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const handleSelectAll = useCallback(() => {
    if (selectedIds.size === storyboards.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(storyboards.map(sb => sb.id)));
    }
  }, [storyboards, selectedIds.size]);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
    setIsSelectionMode(false);
  }, []);

  const selectedCount = selectedIds.size;
  const selectedCompletedCount = storyboards.filter(sb => selectedIds.has(sb.id) && !!sbVideoUrl(sb)).length;
  const selectedGeneratingCount = storyboards.filter(sb => selectedIds.has(sb.id) && sb.status === 'generating').length;

  // Destructure autoMerge
  const {
    autoMergeStatus, autoMergePct, autoMergeDetail, mergeBlobUrl,
    isDownloading, pendingDownload, setPendingDownload,
    ossUploadStatus, ossUploadPct, mergeExpiredScenes,
    isRegeneratingScene, handleDownloadEpisode, retryOssUpload,
    autoMergeTriggered, setAutoMergeStatus, setMergeExpiredScenes,
    setIsRegeneratingScene,
  } = autoMerge;

  return (
    <div className="space-y-6">
      <StoryboardEditorToolbar
        episode={episode}
        storyboards={storyboards}
        seriesId={seriesId}
        userPhone={userPhone}
        aspectRatio={aspectRatio}
        onBack={onBack}
        pendingCount={pendingStoryboards.length}
        completedCount={completedCount}
        generatingCount={generatingCount}
        isAdding={isAdding}
        editingId={editingId}
        setIsAdding={setIsAdding}
        isGeneratingAI={isGeneratingAI}
        handleGenerateAIScript={handleGenerateAIScript}
        isBatchGenerating={isBatchGenerating}
        batchProgress={batchProgress}
        handleBatchGenerate={handleBatchGenerate}
        quota={quota}
        isSelectionMode={isSelectionMode}
        setIsSelectionMode={setIsSelectionMode}
        selectedIds={selectedIds}
        setSelectedIds={setSelectedIds}
        handleSelectAll={handleSelectAll}
        clearSelection={clearSelection}
        selectedCount={selectedCount}
        selectedCompletedCount={selectedCompletedCount}
        selectedGeneratingCount={selectedGeneratingCount}
        handleBatchDelete={handleBatchDelete}
        handleBatchRegenerate={handleBatchRegenerate}
        handleBatchReset={handleBatchReset}
        handleBatchPolish={handleBatchPolish}
        setPreviewIndex={setPreviewIndex}
        autoMergeStatus={autoMergeStatus}
        autoMergePct={autoMergePct}
        mergeBlobUrl={mergeBlobUrl}
        mergedVideoUrl={mergedVideoUrl}
        setMergedVideoUrl={setMergedVideoUrl}
        isDownloading={isDownloading}
        setPendingDownload={setPendingDownload}
        handleDownloadEpisode={handleDownloadEpisode}
        autoMergeTriggered={autoMergeTriggered}
        setAutoMergeStatus={setAutoMergeStatus}
        handleStoryboardsUpdatedByMerger={handleStoryboardsUpdatedByMerger}
      />

      <BatchPolishProgressBar batchPolishProgress={batchPolishProgress} />
      <BatchProgressBar isBatchGenerating={isBatchGenerating} batchProgress={batchProgress} />

      <AutoMergeStatusBars
        autoMergeStatus={autoMergeStatus}
        autoMergePct={autoMergePct}
        autoMergeDetail={autoMergeDetail}
        mergedVideoUrl={mergedVideoUrl}
        mergeBlobUrl={mergeBlobUrl}
        pendingDownload={pendingDownload}
        isDownloading={isDownloading}
        handleDownloadEpisode={handleDownloadEpisode}
        ossUploadStatus={ossUploadStatus}
        ossUploadPct={ossUploadPct}
        retryOssUpload={retryOssUpload}
        mergeExpiredScenes={mergeExpiredScenes}
        isRegeneratingScene={isRegeneratingScene}
        storyboards={storyboards}
        onRegenerateScene={handleRegenerateVideo}
        setMergeExpiredScenes={setMergeExpiredScenes}
        setIsRegeneratingScene={setIsRegeneratingScene}
      />

      {/* Video stats */}
      {storyboards.length > 0 && (
        <div className="flex gap-3 text-xs">
          <span className="px-3 py-1.5 bg-green-500/10 text-green-400 rounded-lg border border-green-500/20">
            已完成 {completedCount}/{storyboards.length}
          </span>
          {generatingCount > 0 && (
            <span className="px-3 py-1.5 bg-blue-500/10 text-blue-400 rounded-lg border border-blue-500/20 flex items-center gap-1">
              <Loader2 className="w-3 h-3 animate-spin" />
              生成中 {generatingCount}
            </span>
          )}
          {pendingStoryboards.length > 0 && (
            <span className="px-3 py-1.5 bg-gray-500/10 text-gray-400 rounded-lg border border-gray-500/20">
              待生成 {pendingStoryboards.length}
            </span>
          )}
        </div>
      )}

      {/* Add/Edit form */}
      {(isAdding || editingId) && (
        <StoryboardForm
          editingStoryboard={editingStoryboard}
          characters={characters}
          seriesId={seriesId}
          seriesTitle={episode.title}
          seriesStyle={style}
          onSubmit={handleFormSubmit}
          onCancel={handleFormCancel}
        />
      )}

      {/* Storyboard list */}
      {storyboards.length === 0 ? (
        <div className="bg-white/5 backdrop-blur-xl rounded-2xl p-12 border border-white/10 text-center">
          <div className="w-20 h-20 bg-gradient-to-br from-purple-500/20 to-pink-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
            <ImageIcon className="w-10 h-10 text-purple-400" />
          </div>
          <h3 className="text-lg font-semibold text-white mb-2">开始创建分镜</h3>
          <p className="text-gray-400 mb-6">可以使用AI自动生成分镜脚本，或手动添加</p>
          <div className="flex justify-center gap-3">
            <Button
              onClick={handleGenerateAIScript}
              disabled={isGeneratingAI}
              className="bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 disabled:opacity-50"
            >
              {isGeneratingAI ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" />生成中...</>
              ) : (
                <><Wand2 className="w-4 h-4 mr-2" />AI生成分镜</>
              )}
            </Button>
            <Button
              onClick={() => setIsAdding(true)}
              className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600"
            >
              <Plus className="w-4 h-4 mr-2" />手动添加
            </Button>
          </div>
        </div>
      ) : (
        <>
          <StoryboardVideoMerger
            episode={episode}
            storyboards={storyboards}
            seriesId={seriesId}
            userPhone={userPhone}
            aspectRatio={aspectRatio}
            mode="player"
            mergedVideoUrl={mergedVideoUrl}
            onMergedVideoUrlChange={setMergedVideoUrl}
            onStoryboardsUpdated={handleStoryboardsUpdatedByMerger}
          />

          <DndProvider backend={HTML5Backend}>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {storyboards.map((storyboard, index) => (
                <DraggableStoryboardCard
                  key={storyboard.id}
                  storyboard={storyboard}
                  index={index}
                  characters={characters}
                  aspectRatio={aspectRatio}
                  generatingStartTime={generatingStartTimes.current.get(storyboard.id)}
                  isSelectionMode={isSelectionMode}
                  isSelected={selectedIds.has(storyboard.id)}
                  onToggleSelect={handleToggleSelect}
                  onPreview={setPreviewIndex}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                  onGenerate={handleGenerate}
                  onRegenerate={handleRegenerateVideo}
                  onResetStuck={handleResetStuck}
                  onCopy={handleDuplicate}
                  onPolish={handlePolishFromCard}
                  isPolishingId={polishingId}
                  onMoveCard={handleMoveCard}
                />
              ))}
            </div>
          </DndProvider>
        </>
      )}

      {/* Preview mode */}
      <AnimatePresence>
        {previewIndex !== null && (
          <StoryboardPreview
            storyboards={storyboards}
            characters={characters}
            initialIndex={previewIndex}
            aspectRatio={aspectRatio}
            episodeNumber={episode.episodeNumber}
            onClose={() => setPreviewIndex(null)}
          />
        )}
      </AnimatePresence>

      {/* Polish preview modal */}
      <AnimatePresence>
        {polishPreview && (
          <PolishPreviewModal
            data={polishPreview}
            onAccept={handleAcceptPolish}
            onReject={() => { setPolishPreview(null); toast.info('已放弃润色结果'); }}
          />
        )}
      </AnimatePresence>

      <ConfirmDialog {...confirmDialogProps} />
    </div>
  );
}