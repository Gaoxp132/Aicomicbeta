/**
 * useStoryboardActions.ts — All storyboard action handlers
 * Extracted from StoryboardEditor.tsx to reduce its size from ~1289 to ~600 lines.
 * v6.0.176: Batch operations (delete/regenerate/reset/polish) extracted to useStoryboardBatchOps.ts
 */
import { useState, useCallback, useRef, type MutableRefObject } from 'react';
import { toast } from 'sonner';
import type { Storyboard, Character, Episode } from '../../types';
import * as seriesService from '../../services';
import { apiRequest } from '../../utils';
import { useStoryboardBatchOps } from './useStoryboardBatchOps';
import { getErrorMessage } from '../../utils';
import { isPollingTimeoutError } from '../../services/volcengine';

interface UseStoryboardActionsOpts {
  seriesId: string;
  userPhone: string;
  episode: Episode;
  characters: Character[];
  style: string;
  storyboardsRef: MutableRefObject<Storyboard[]>;
  sessionGeneratingIds: MutableRefObject<Set<string>>;
  generatingStartTimes: MutableRefObject<Map<string, number>>;
  updateStoryboards: (updater: (prev: Storyboard[]) => Storyboard[]) => void;
  persistNewStoryboard: (tempId: string, sb: Storyboard) => void;
  persistStoryboardEdit: (id: string, data: Partial<Storyboard>) => void;
  persistSortOrder: (sbs: Storyboard[]) => void;
  persistDeleteAndReorder: (ids: string[], remaining: Storyboard[]) => void;
  patchStoryboardStatus: (id: string, status: string, extra?: Record<string, unknown>) => void;
  showConfirm: (opts: { title: string; description?: string; confirmText?: string; variant?: string }) => Promise<boolean>;
}

export function useStoryboardActions(opts: UseStoryboardActionsOpts) {
  const {
    seriesId, userPhone, episode, characters, style,
    storyboardsRef, sessionGeneratingIds, generatingStartTimes,
    updateStoryboards, persistNewStoryboard, persistStoryboardEdit,
    persistSortOrder, persistDeleteAndReorder, patchStoryboardStatus,
    showConfirm,
  } = opts;

  // ── Form state ─────────────────────────────────────────────────────
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [isGeneratingAI, setIsGeneratingAI] = useState(false);

  // ── Polish state ───────────────────────────────────────────────────
  const [polishingId, setPolishingId] = useState<string | null>(null);
  const [polishPreview, setPolishPreview] = useState<{
    storyboardId: string;
    sceneNumber: number;
    originalDescription: string;
    originalDialogue?: string;
    polishedDescription?: string;
    polishedDialogue?: string;
  } | null>(null);

  // ── Undo refs ──────────────────────────────────────────────────────
  const lastPolishOrigRef = useRef<{ id: string; description?: string; dialogue?: string } | null>(null);

  // ── Form handlers ──────────────────────────────────────────────────

  const handleFormCancel = useCallback(() => {
    setIsAdding(false);
    setEditingId(null);
  }, []);

  const handleFormSubmit = useCallback((data: Partial<Storyboard>) => {
    if (!data.description) return;

    if (editingId) {
      updateStoryboards(prev => prev.map(sb =>
        sb.id === editingId ? { ...sb, ...data } as Storyboard : sb
      ));
      persistStoryboardEdit(editingId, data);
    } else {
      const tempId = `sb-${Date.now()}`;
      const newStoryboard: Storyboard = {
        id: tempId,
        episodeId: episode.id,
        sceneNumber: storyboardsRef.current.length + 1,
        description: data.description,
        dialogue: data.dialogue,
        characters: data.characters || [],
        location: data.location || '',
        timeOfDay: data.timeOfDay as Storyboard['timeOfDay'],
        cameraAngle: data.cameraAngle as Storyboard['cameraAngle'],
        duration: data.duration || 10,
        status: 'draft',
      };
      updateStoryboards(prev => [...prev, newStoryboard]);
      persistNewStoryboard(tempId, newStoryboard);
    }
    handleFormCancel();
  }, [editingId, episode.id, storyboardsRef, updateStoryboards, persistStoryboardEdit, persistNewStoryboard, handleFormCancel]);

  const handleEdit = useCallback((storyboard: Storyboard) => {
    setEditingId(storyboard.id);
    setIsAdding(false);
  }, []);

  // ── Duplicate ──────────────────────────────────────────────────────

  const handleDuplicate = useCallback((storyboard: Storyboard) => {
    const tempId = `sb-${Date.now()}`;
    const duplicated: Storyboard = {
      ...storyboard,
      id: tempId,
      videoUrl: undefined,
      thumbnailUrl: undefined,
      imageUrl: undefined,
      status: 'draft',
      videoTaskId: undefined,
      taskId: undefined,
      error: undefined,
    };
    updateStoryboards(prev => {
      const idx = prev.findIndex(sb => sb.id === storyboard.id);
      const next = [...prev];
      next.splice(idx + 1, 0, duplicated);
      const renumbered = next.map((sb, i) => ({ ...sb, sceneNumber: i + 1 }));
      persistNewStoryboard(tempId, { ...duplicated, sceneNumber: idx + 2 });
      setTimeout(() => persistSortOrder(renumbered), 1200);
      return renumbered;
    });
    toast.success(`已复制场景 ${storyboard.sceneNumber}`);
  }, [updateStoryboards, persistNewStoryboard, persistSortOrder]);

  // ── Polish (single) ────────────────────────────────────────────────

  const handleUndoSinglePolish = useCallback(() => {
    const orig = lastPolishOrigRef.current;
    if (!orig) return;
    updateStoryboards(prev => prev.map(sb => {
      if (sb.id !== orig.id) return sb;
      return { ...sb, description: orig.description || sb.description, dialogue: orig.dialogue ?? sb.dialogue };
    }));
    const patchBody: Record<string, unknown> = {};
    if (orig.description) patchBody.description = orig.description;
    if (orig.dialogue !== undefined) patchBody.dialogue = orig.dialogue;
    if (Object.keys(patchBody).length > 0) {
      apiRequest(`/series/${seriesId}/storyboards/${orig.id}`, {
        method: 'PATCH',
        body: JSON.stringify(patchBody),
      }).catch(() => {});
    }
    lastPolishOrigRef.current = null;
    toast.success('已撤销润色，恢复原文');
  }, [updateStoryboards, seriesId]);

  const handlePolishFromCard = useCallback(async (storyboard: Storyboard) => {
    if (polishingId) return;
    setPolishingId(storyboard.id);
    try {
      const charNames = (storyboard.characters || [])
        .map((cid: string) => characters.find(c => c.id === cid)?.name)
        .filter(Boolean);
      const result = await apiRequest(`/series/${seriesId}/storyboards/polish`, {
        method: 'POST',
        body: JSON.stringify({
          description: storyboard.description,
          dialogue: storyboard.dialogue,
          characters: charNames,
          location: storyboard.location,
          timeOfDay: storyboard.timeOfDay,
          cameraAngle: storyboard.cameraAngle,
          seriesTitle: episode.title,
          seriesStyle: style,
          mode: storyboard.dialogue ? 'full' : 'description_only',
        }),
        timeout: 35000,
      });
      if (result.success && result.data) {
        setPolishPreview({
          storyboardId: storyboard.id,
          sceneNumber: storyboard.sceneNumber,
          originalDescription: storyboard.description || '',
          originalDialogue: storyboard.dialogue,
          polishedDescription: result.data.description as string | undefined,
          polishedDialogue: result.data.dialogue as string | undefined,
        });
      } else {
        toast.error('润色失败：' + (result.error || '未知错误'));
      }
    } catch (err: unknown) {
      const errMsg = getErrorMessage(err);
      console.error('[StoryboardActions] Polish from card error:', errMsg);
      toast.error('润色请求失败');
    } finally {
      setPolishingId(null);
    }
  }, [polishingId, characters, seriesId, episode.title, style]);

  const handleAcceptPolish = useCallback(() => {
    if (!polishPreview) return;
    const { storyboardId, sceneNumber, originalDescription, originalDialogue, polishedDescription, polishedDialogue } = polishPreview;
    lastPolishOrigRef.current = { id: storyboardId, description: originalDescription, dialogue: originalDialogue };
    updateStoryboards(prev => prev.map(sb => {
      if (sb.id !== storyboardId) return sb;
      const updates: Partial<Storyboard> = {};
      if (polishedDescription) updates.description = polishedDescription;
      if (polishedDialogue) updates.dialogue = polishedDialogue;
      return { ...sb, ...updates };
    }));
    if (polishedDescription || polishedDialogue) {
      const patchBody: Record<string, unknown> = { episodeNumber: episode.episodeNumber, sceneNumber };
      if (polishedDescription) patchBody.description = polishedDescription;
      if (polishedDialogue) patchBody.dialogue = polishedDialogue;
      apiRequest(`/series/${seriesId}/storyboards/${storyboardId}`, {
        method: 'PATCH',
        body: JSON.stringify(patchBody),
      }).catch(() => {});
    }
    toast.success(`场景 ${sceneNumber} 已采用润色结果`, {
      action: { label: '撤销', onClick: handleUndoSinglePolish },
      duration: 8000,
    });
    setPolishPreview(null);
  }, [polishPreview, updateStoryboards, episode.episodeNumber, seriesId, handleUndoSinglePolish]);

  // ── Delete (single) ───────────────────────────────────────────────
  // Note: lastDeleteRef and handleUndoDelete live in useStoryboardBatchOps
  // (shared between single-delete and batch-delete for Ctrl+Z undo)

  // ── Generate / Regenerate / Reset ──────────────────────────────────

  const handleGenerate = useCallback(async (storyboard: Storyboard) => {
    updateStoryboards(prev => prev.map(sb =>
      sb.id === storyboard.id ? { ...sb, status: 'generating' as const } : sb
    ));
    sessionGeneratingIds.current.add(storyboard.id);
    generatingStartTimes.current.set(storyboard.id, Date.now());
    patchStoryboardStatus(storyboard.id, 'generating');

    try {
      const videoUrl = await seriesService.generateStoryboardVideo(
        seriesId, userPhone, storyboard, episode.episodeNumber
      );
      
      console.log(`[StoryboardEditor] Video generated for scene ${storyboard.sceneNumber}: ${videoUrl.substring(0, 80)}...`);

      updateStoryboards(prev => prev.map(sb =>
        sb.id === storyboard.id 
          ? { ...sb, status: 'completed' as const, videoUrl } 
          : sb
      ));
      
      await apiRequest(`/series/${seriesId}/storyboards/${storyboard.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          videoUrl, status: 'completed',
          episodeNumber: episode.episodeNumber,
          sceneNumber: storyboard.sceneNumber,
        }),
      });
      
      toast.success('视频生成成功！');
    } catch (error: unknown) {
      const errMsg = getErrorMessage(error);
      console.error('[StoryboardActions] Generate error:', errMsg);
      
      // v6.0.183: 轮询超时 → 保持 'generating' 状态，由背景轮询拾取结果
      if (isPollingTimeoutError(error)) {
        toast.info(`场景${storyboard.sceneNumber}生成耗时较长，将在后台继续处理`, { duration: 6000 });
        return; // 不重置状态，保持 'generating'
      }

      updateStoryboards(prev => prev.map(sb =>
        sb.id === storyboard.id 
          ? { ...sb, status: 'draft' as const, error: errMsg } 
          : sb
      ));
      sessionGeneratingIds.current.delete(storyboard.id);
      patchStoryboardStatus(storyboard.id, 'draft');
      
      toast.error('视频生成失败：' + errMsg);
    }
  }, [seriesId, userPhone, episode.episodeNumber, updateStoryboards, sessionGeneratingIds, generatingStartTimes, patchStoryboardStatus]);

  const handleRegenerateVideo = useCallback(async (storyboard: Storyboard, skipConfirm = false) => {
    if (!skipConfirm) {
      const ok = await showConfirm({
        title: `重新生成场景 ${storyboard.sceneNumber} 的视频`,
        description: '当前视频将被替换为新生成的版本',
        confirmText: '重新生成',
        cancelText: '取消',
        variant: 'warning',
        icon: 'regenerate',
      });
      if (!ok) return;
    }

    const prevVideoUrl = storyboard.videoUrl;
    updateStoryboards(prev => prev.map(sb =>
      sb.id === storyboard.id ? { ...sb, status: 'generating' as const, videoUrl: undefined } : sb
    ));
    sessionGeneratingIds.current.add(storyboard.id);
    generatingStartTimes.current.set(storyboard.id, Date.now());
    patchStoryboardStatus(storyboard.id, 'generating');

    try {
      const videoUrl = await seriesService.generateStoryboardVideo(
        seriesId, userPhone, storyboard, episode.episodeNumber, undefined, true
      );
      
      console.log(`[StoryboardEditor] Video regenerated for scene ${storyboard.sceneNumber}: ${videoUrl.substring(0, 80)}...`);

      updateStoryboards(prev => prev.map(sb =>
        sb.id === storyboard.id 
          ? { ...sb, status: 'completed' as const, videoUrl } 
          : sb
      ));
      
      await apiRequest(`/series/${seriesId}/storyboards/${storyboard.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          videoUrl, status: 'completed',
          episodeNumber: episode.episodeNumber,
          sceneNumber: storyboard.sceneNumber,
        }),
      });
      
      toast.success(`场景${storyboard.sceneNumber}视频重新生成成功！`);
    } catch (error: unknown) {
      const errMsg = getErrorMessage(error);
      console.error('[StoryboardActions] Regenerate error:', errMsg);

      // v6.0.183: 轮询超时 → 保持 'generating' 状态，由背景轮询拾取结果
      if (isPollingTimeoutError(error)) {
        toast.info(`场景${storyboard.sceneNumber}重新生成耗时较长，将在后台继续处理`, { duration: 6000 });
        return; // 不重置状态，保持 'generating'
      }

      updateStoryboards(prev => prev.map(sb =>
        sb.id === storyboard.id 
          ? { ...sb, status: prevVideoUrl ? 'completed' as const : 'draft' as const, videoUrl: prevVideoUrl, error: errMsg } 
          : sb
      ));
      sessionGeneratingIds.current.delete(storyboard.id);
      patchStoryboardStatus(storyboard.id, prevVideoUrl ? 'completed' : 'draft', prevVideoUrl ? { videoUrl: prevVideoUrl } : undefined);
      toast.error('重新生成失败：' + errMsg);
    }
  }, [seriesId, userPhone, episode.episodeNumber, updateStoryboards, sessionGeneratingIds, generatingStartTimes, patchStoryboardStatus, showConfirm]);

  const handleResetStuck = useCallback(async (storyboard: Storyboard) => {
    const ok = await showConfirm({
      title: `重置场景 ${storyboard.sceneNumber} 的状态`,
      description: '将清除当前视频并重置为草稿状态',
      confirmText: '重置',
      cancelText: '取消',
      variant: 'warning',
      icon: 'reset',
    });
    if (!ok) return;

    updateStoryboards(prev => prev.map(sb =>
      sb.id === storyboard.id ? { ...sb, status: 'draft' as const, videoUrl: undefined } : sb
    ));
    sessionGeneratingIds.current.delete(storyboard.id);
    patchStoryboardStatus(storyboard.id, 'draft');

    toast.success(`场景${storyboard.sceneNumber}状态已重置！`);
  }, [updateStoryboards, patchStoryboardStatus, showConfirm, sessionGeneratingIds]);

  const handleStoryboardsUpdatedByMerger = useCallback((updates: Array<{ id: string; videoUrl: string }>) => {
    updateStoryboards(prev => prev.map(sb => {
      const update = updates.find(u => u.id === sb.id);
      if (update) {
        return { ...sb, videoUrl: update.videoUrl, status: 'completed' as const };
      }
      return sb;
    }));
    console.log(`[StoryboardEditor] Auto-fix updated ${updates.length} storyboard(s) from merge resolution fix`);
  }, [updateStoryboards]);

  // ── AI generate script ─────────────────────────────────────────────

  const handleGenerateAIScript = useCallback(async () => {
    setIsGeneratingAI(true);
    try {
      toast.info('正在使用AI生成分镜...');
      
      const result = await seriesService.generateStoryboards(seriesId, episode.id);
      
      if (result.success && result.data) {
        const newStoryboards = (Array.isArray(result.data) ? result.data : (result.data?.storyboards || [])) as Storyboard[];
        updateStoryboards(prev => [...prev, ...newStoryboards]);
        
        toast.success(`AI成功生成 ${newStoryboards.length} 个分镜！`);
      } else {
        toast.error('AI生成分镜失败：' + (result.error || '未知错误'));
      }
    } catch (error: unknown) {
      const errMsg = getErrorMessage(error);
      console.error('[StoryboardActions] AI generation error:', errMsg);
      toast.error('AI生成分镜失败：' + errMsg);
    } finally {
      setIsGeneratingAI(false);
    }
  }, [seriesId, episode.id, updateStoryboards]);

  // ── Move (drag & drop) ────────────────────────────────────────────

  const handleMoveCard = useCallback((dragIndex: number, hoverIndex: number) => {
    updateStoryboards(prev => {
      const updated = [...prev];
      const [removed] = updated.splice(dragIndex, 1);
      updated.splice(hoverIndex, 0, removed);
      const reordered = updated.map((sb, i) => ({ ...sb, sceneNumber: i + 1 }));
      persistSortOrder(reordered);
      return reordered;
    });
  }, [updateStoryboards, persistSortOrder]);

  // ── Single delete (uses shared lastDeleteRef from batch ops) ──────

  // Batch ops hook — provides batch handlers + shared undo infrastructure
  const batchOps = useStoryboardBatchOps({
    seriesId, episode, characters, style,
    storyboardsRef, sessionGeneratingIds,
    updateStoryboards, persistNewStoryboard, persistSortOrder,
    persistDeleteAndReorder, patchStoryboardStatus,
    showConfirm, handleRegenerateVideo,
  });

  const handleDelete = useCallback(async (id: string) => {
    const sb = storyboardsRef.current.find(s => s.id === id);
    const ok = await showConfirm({
      title: `删除场景 ${sb?.sceneNumber || ''}`,
      description: '删除后可通过撤销按钮或 Ctrl+Z 恢复',
      confirmText: '删除',
      cancelText: '取消',
      variant: 'danger',
      icon: 'delete',
    });
    if (!ok) return;
    batchOps.lastDeleteRef.current = { storyboards: [...storyboardsRef.current], deletedIds: [id] };
    updateStoryboards(prev => {
      const remaining = prev
        .filter(sb => sb.id !== id)
        .map((sb, index) => ({ ...sb, sceneNumber: index + 1 }));
      persistDeleteAndReorder([id], remaining);
      return remaining;
    });
    const deletedSb = storyboardsRef.current.find(sb => sb.id === id);
    toast.success(`已删除场景 ${deletedSb?.sceneNumber || ''}`, {
      action: { label: '撤销', onClick: batchOps.handleUndoDelete },
      duration: 8000,
    });
  }, [storyboardsRef, updateStoryboards, persistDeleteAndReorder, batchOps.handleUndoDelete, batchOps.lastDeleteRef, showConfirm]);

  return {
    // Form state
    editingId,
    isAdding,
    setIsAdding,
    isGeneratingAI,
    // Polish state
    polishingId,
    polishPreview,
    setPolishPreview,
    batchPolishProgress: batchOps.batchPolishProgress,
    // Undo refs (for Ctrl+Z)
    lastDeleteRef: batchOps.lastDeleteRef,
    // Handlers
    handleFormSubmit,
    handleFormCancel,
    handleEdit,
    handleDuplicate,
    handleDelete,
    handleUndoDelete: batchOps.handleUndoDelete,
    handleGenerate,
    handleRegenerateVideo,
    handleResetStuck,
    handleStoryboardsUpdatedByMerger,
    handleGenerateAIScript,
    handleMoveCard,
    handlePolishFromCard,
    handleAcceptPolish,
    // Batch handlers
    handleBatchDelete: batchOps.handleBatchDelete,
    handleBatchRegenerate: batchOps.handleBatchRegenerate,
    handleBatchReset: batchOps.handleBatchReset,
    handleBatchPolish: batchOps.handleBatchPolish,
  };
}