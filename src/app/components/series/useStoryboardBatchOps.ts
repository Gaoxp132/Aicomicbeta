/**
 * useStoryboardBatchOps.ts — Batch operations on selected storyboards
 * (delete, regenerate, reset, polish)
 * Extracted from useStoryboardActions.ts to stay under 500-line limit.
 */
import { useState, useCallback, useRef, type MutableRefObject } from 'react';
import { toast } from 'sonner';
import type { Storyboard, Character, Episode } from '../../types';
import { apiRequest } from '../../utils';
import { sbVideoUrl } from '../../utils';

interface UseStoryboardBatchOpsOpts {
  seriesId: string;
  episode: Episode;
  characters: Character[];
  style: string;
  storyboardsRef: MutableRefObject<Storyboard[]>;
  sessionGeneratingIds: MutableRefObject<Set<string>>;
  updateStoryboards: (updater: (prev: Storyboard[]) => Storyboard[]) => void;
  persistNewStoryboard: (tempId: string, sb: Storyboard) => void;
  persistSortOrder: (sbs: Storyboard[]) => void;
  persistDeleteAndReorder: (ids: string[], remaining: Storyboard[]) => void;
  patchStoryboardStatus: (id: string, status: string, extra?: Record<string, unknown>) => void;
  showConfirm: (opts: { title: string; description?: string; confirmText?: string; variant?: string }) => Promise<boolean>;
  handleRegenerateVideo: (sb: Storyboard, skipConfirm?: boolean) => Promise<void>;
}

export function useStoryboardBatchOps(opts: UseStoryboardBatchOpsOpts) {
  const {
    seriesId, episode, characters, style,
    storyboardsRef, sessionGeneratingIds,
    updateStoryboards, persistNewStoryboard, persistSortOrder,
    persistDeleteAndReorder, patchStoryboardStatus,
    showConfirm, handleRegenerateVideo,
  } = opts;

  // ── Batch polish progress ─────────────────────────────────────────
  const [batchPolishProgress, setBatchPolishProgress] = useState<{ current: number; total: number } | null>(null);

  // ── Undo refs ─────────────────────────────────────────────────────
  const lastDeleteRef = useRef<{ storyboards: Storyboard[]; deletedIds: string[] } | null>(null);
  const lastBatchPolishRef = useRef<Map<string, { description?: string; dialogue?: string }> | null>(null);

  // ── Undo delete ───────────────────────────────────────────────────
  const handleUndoDelete = useCallback(() => {
    if (!lastDeleteRef.current) return;
    const { storyboards: prevState, deletedIds } = lastDeleteRef.current;
    updateStoryboards(() => prevState);
    for (const sb of prevState.filter(s => deletedIds.includes(s.id))) {
      persistNewStoryboard(sb.id, sb);
    }
    setTimeout(() => {
      persistSortOrder(storyboardsRef.current);
    }, 2000);
    lastDeleteRef.current = null;
    toast.success('已撤销删除');
  }, [updateStoryboards, persistNewStoryboard, persistSortOrder, storyboardsRef]);

  // ── Undo batch polish ─────────────────────────────────────────────
  const handleUndoBatchPolish = useCallback(() => {
    const snapshots = lastBatchPolishRef.current;
    if (!snapshots || snapshots.size === 0) return;
    updateStoryboards(prev => prev.map(sb => {
      const orig = snapshots.get(sb.id);
      if (!orig) return sb;
      return { ...sb, description: orig.description || sb.description, dialogue: orig.dialogue ?? sb.dialogue };
    }));
    for (const [id, orig] of snapshots) {
      const patchBody: Record<string, unknown> = {};
      if (orig.description) patchBody.description = orig.description;
      if (orig.dialogue !== undefined) patchBody.dialogue = orig.dialogue;
      if (Object.keys(patchBody).length > 0) {
        apiRequest(`/series/${seriesId}/storyboards/${id}`, {
          method: 'PATCH',
          body: JSON.stringify(patchBody),
        }).catch(() => {});
      }
    }
    lastBatchPolishRef.current = null;
    toast.success(`已撤销 ${snapshots.size} 个分镜的润色`);
  }, [updateStoryboards, seriesId]);

  // ── Batch delete ──────────────────────────────────────────────────
  const handleBatchDelete = useCallback(async (
    selectedIds: Set<string>,
    clearSelection: () => void,
  ) => {
    if (selectedIds.size === 0) return;
    const ok = await showConfirm({
      title: `批量删除 ${selectedIds.size} 个分镜`,
      description: '删除后可通过撤销按钮或 Ctrl+Z 恢复',
      confirmText: `删除 ${selectedIds.size} 个`,
      cancelText: '取消',
      variant: 'danger',
      icon: 'delete',
    });
    if (!ok) return;

    const deletedIds = Array.from(selectedIds);
    lastDeleteRef.current = { storyboards: [...storyboardsRef.current], deletedIds };
    updateStoryboards(prev => {
      const remaining = prev
        .filter(sb => !selectedIds.has(sb.id))
        .map((sb, index) => ({ ...sb, sceneNumber: index + 1 }));
      persistDeleteAndReorder(deletedIds, remaining);
      return remaining;
    });
    clearSelection();
    toast.success(`已删除 ${deletedIds.length} 个分镜`, {
      action: { label: '撤销', onClick: handleUndoDelete },
      duration: 8000,
    });
  }, [storyboardsRef, updateStoryboards, persistDeleteAndReorder, handleUndoDelete, showConfirm]);

  // ── Batch regenerate ──────────────────────────────────────────────
  const handleBatchRegenerate = useCallback(async (
    selectedIds: Set<string>,
    storyboards: Storyboard[],
    clearSelection: () => void,
  ) => {
    if (selectedIds.size === 0) return;
    const selected = storyboards.filter(sb => selectedIds.has(sb.id) && !!sbVideoUrl(sb));
    if (selected.length === 0) {
      toast.info('选中的分镜中没有已完成视频可重新生成');
      return;
    }
    const ok = await showConfirm({
      title: `重新生成 ${selected.length} 个视频`,
      description: '选中分镜的当前视频将被替换为新生成的版本',
      confirmText: `重新生成 ${selected.length} 个`,
      cancelText: '取消',
      variant: 'info',
      icon: 'regenerate',
    });
    if (!ok) return;

    clearSelection();

    for (const sb of selected) {
      await handleRegenerateVideo(sb, true);
      await new Promise(r => setTimeout(r, 3000));
    }
    toast.success(`已启动 ${selected.length} 个分镜的视频重新生成`);
  }, [handleRegenerateVideo, showConfirm]);

  // ── Batch reset ───────────────────────────────────────────────────
  const handleBatchReset = useCallback(async (
    selectedIds: Set<string>,
    storyboards: Storyboard[],
    clearSelection: () => void,
  ) => {
    if (selectedIds.size === 0) return;
    const selected = storyboards.filter(sb => selectedIds.has(sb.id) && sb.status === 'generating');
    if (selected.length === 0) {
      toast.info('选中的分镜中没有"生成中"状态的分镜');
      return;
    }
    const ok = await showConfirm({
      title: `重置 ${selected.length} 个分镜状态`,
      description: '将清除视频并重置为草稿状态，适用于长时间卡住的生成任务',
      confirmText: `重置 ${selected.length} 个`,
      cancelText: '取消',
      variant: 'warning',
      icon: 'reset',
    });
    if (!ok) return;

    for (const sb of selected) {
      updateStoryboards(prev => prev.map(s =>
        s.id === sb.id ? { ...s, status: 'draft' as const, videoUrl: undefined } : s
      ));
      sessionGeneratingIds.current.delete(sb.id);
      patchStoryboardStatus(sb.id, 'draft');
    }
    clearSelection();
    toast.success(`已重置 ${selected.length} 个分镜状态`);
  }, [updateStoryboards, patchStoryboardStatus, showConfirm, sessionGeneratingIds]);

  // ── Batch polish ──────────────────────────────────────────────────
  const handleBatchPolish = useCallback(async (
    selectedIds: Set<string>,
    storyboards: Storyboard[],
    clearSelection: () => void,
  ) => {
    if (selectedIds.size === 0) return;
    const selected = storyboards.filter(sb => selectedIds.has(sb.id) && sb.description && sb.description.trim().length >= 5);
    if (selected.length === 0) {
      toast.error('所选分镜无有效描述可润色');
      return;
    }
    const ok = await showConfirm({
      title: `AI润色 ${selected.length} 个分镜`,
      description: '使用AI优化场景描述和对白（2路并发），润色后可撤销',
      confirmText: `开始润色`,
      cancelText: '取消',
      variant: 'purple',
      icon: 'polish',
    });
    if (!ok) return;

    clearSelection();
    setBatchPolishProgress({ current: 0, total: selected.length });

    let completed = 0;
    let successCount = 0;
    let failCount = 0;
    const origSnapshots = new Map<string, { description?: string; dialogue?: string }>();
    for (const sb of selected) {
      origSnapshots.set(sb.id, { description: sb.description, dialogue: sb.dialogue });
    }

    const polishOne = async (sb: Storyboard) => {
      try {
        const charNames = (sb.characters || [])
          .map((cid: string) => characters.find(c => c.id === cid)?.name)
          .filter(Boolean);
        const result = await apiRequest(`/series/${seriesId}/storyboards/polish`, {
          method: 'POST',
          body: JSON.stringify({
            description: sb.description,
            dialogue: sb.dialogue,
            characters: charNames,
            location: sb.location,
            timeOfDay: sb.timeOfDay,
            cameraAngle: sb.cameraAngle,
            seriesTitle: episode.title,
            seriesStyle: style,
            mode: sb.dialogue ? 'full' : 'description_only',
          }),
          timeout: 35000,
        });
        if (result.success && result.data) {
          const polished = result.data;
          updateStoryboards(prev => prev.map(s => {
            if (s.id !== sb.id) return s;
            const upd: Partial<Storyboard> = {};
            if (polished.description) upd.description = polished.description;
            if (polished.dialogue) upd.dialogue = polished.dialogue;
            return { ...s, ...upd };
          }));
          if (polished.description || polished.dialogue) {
            const patchBody: Record<string, unknown> = { episodeNumber: episode.episodeNumber, sceneNumber: sb.sceneNumber };
            if (polished.description) patchBody.description = polished.description;
            if (polished.dialogue) patchBody.dialogue = polished.dialogue;
            apiRequest(`/series/${seriesId}/storyboards/${sb.id}`, {
              method: 'PATCH',
              body: JSON.stringify(patchBody),
            }).catch(() => {});
          }
          successCount++;
        } else {
          failCount++;
        }
      } catch {
        failCount++;
      } finally {
        completed++;
        setBatchPolishProgress({ current: completed, total: selected.length });
      }
    };

    // 2-way concurrent semaphore
    const CONCURRENCY = 2;
    const queue = [...selected];
    const workers = Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
      while (queue.length > 0) {
        const sb = queue.shift()!;
        await polishOne(sb);
      }
    });
    await Promise.all(workers);

    setBatchPolishProgress(null);
    lastBatchPolishRef.current = origSnapshots;
    if (failCount === 0) {
      toast.success(`已润色 ${successCount} 个分镜`, {
        action: { label: '撤销全部', onClick: handleUndoBatchPolish },
        duration: 10000,
      });
    } else {
      toast.warning(`润色完成：${successCount} 成功，${failCount} 失败`, {
        action: successCount > 0 ? { label: '撤销全部', onClick: handleUndoBatchPolish } : undefined,
        duration: 10000,
      });
    }
  }, [characters, seriesId, episode.title, episode.episodeNumber, style, updateStoryboards, handleUndoBatchPolish, showConfirm]);

  return {
    // State
    batchPolishProgress,
    // Undo refs (for Ctrl+Z)
    lastDeleteRef,
    // Handlers
    handleUndoDelete,
    handleBatchDelete,
    handleBatchRegenerate,
    handleBatchReset,
    handleBatchPolish,
  };
}