/**
 * useStoryboardPersistence — DB persistence functions for storyboard CRUD
 * Extracted from StoryboardEditor.tsx for maintainability
 */

import { useCallback, useRef, useEffect } from 'react';
import { getApiUrl, publicAnonKey } from '../../constants';
import { apiRequest, getErrorMessage } from '../../utils';
import type { Storyboard } from '../../types';

interface UseStoryboardPersistenceOptions {
  seriesId: string;
  episodeNumber: number;
  updateStoryboards: (updater: (prev: Storyboard[]) => Storyboard[]) => void;
  storyboardsRef: React.MutableRefObject<Storyboard[]>;
}

export function useStoryboardPersistence({
  seriesId,
  episodeNumber,
  updateStoryboards,
  storyboardsRef,
}: UseStoryboardPersistenceOptions) {
  // v6.0.173-fix: Use ref indirection to avoid TDZ
  const persistFnsRef = useRef<{
    persistSortOrder: (sbs: Storyboard[]) => void;
    persistDeleteAndReorder: (ids: string[], sbs: Storyboard[]) => void;
    persistNewStoryboard: (tempId: string, sb: Storyboard) => void;
    persistStoryboardEdit: (sbId: string, data: Partial<Storyboard>) => void;
  } | null>(null);

  const persistNewStoryboard = useCallback((tempId: string, sb: Storyboard) => {
    persistFnsRef.current?.persistNewStoryboard(tempId, sb);
  }, []);
  const persistStoryboardEdit = useCallback((sbId: string, data: Partial<Storyboard>) => {
    persistFnsRef.current?.persistStoryboardEdit(sbId, data);
  }, []);
  const persistSortOrder = useCallback((sbs: Storyboard[]) => {
    persistFnsRef.current?.persistSortOrder(sbs);
  }, []);
  const persistDeleteAndReorder = useCallback((ids: string[], sbs: Storyboard[]) => {
    persistFnsRef.current?.persistDeleteAndReorder(ids, sbs);
  }, []);

  // v6.0.93: Patch storyboard status in DB
  const patchStoryboardStatus = useCallback(async (
    sbId: string,
    status: 'generating' | 'completed' | 'draft',
    extra?: { videoUrl?: string },
  ) => {
    try {
      const sb = storyboardsRef.current?.find(s => s.id === sbId);
      await apiRequest(`/series/${seriesId}/storyboards/${sbId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          status,
          episodeNumber,
          sceneNumber: sb?.sceneNumber,
          ...(extra?.videoUrl ? { videoUrl: extra.videoUrl } : {}),
        }),
      });
    } catch { /* non-blocking */ }
  }, [seriesId, episodeNumber, storyboardsRef]);

  // --- Actual implementations ---

  const reorderTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const _persistSortOrderImpl = useCallback((reorderedStoryboards: Storyboard[]) => {
    if (reorderTimerRef.current) clearTimeout(reorderTimerRef.current);
    reorderTimerRef.current = setTimeout(async () => {
      const items = reorderedStoryboards.map(sb => ({ id: sb.id, sceneNumber: sb.sceneNumber }));
      try {
        console.log(`[StoryboardEditor] Persisting sort order for ${items.length} storyboards...`);
        const resp = await fetch(getApiUrl(`/series/${seriesId}/reorder-storyboards`), {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${publicAnonKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ items }),
        });
        if (!resp.ok) {
          const err = await resp.json().catch(() => ({})) as Record<string, any>;
          console.warn(`[StoryboardEditor] Sort order persist failed:`, err.error || resp.status);
        } else {
          const result = await resp.json();
          console.log(`[StoryboardEditor] Sort order persisted: ${result.updated} updated, ${result.failed} failed`);
        }
      } catch (err: unknown) {
        console.error('[Persistence] persistSortOrder failed:', getErrorMessage(err));
      }
    }, 800);
  }, [seriesId]);

  const _persistDeleteAndReorderImpl = useCallback(async (deletedIds: string[], remainingStoryboards: Storyboard[]) => {
    try {
      if (deletedIds.length === 1) {
        const resp = await fetch(getApiUrl(`/series/${seriesId}/storyboards/${deletedIds[0]}`), {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${publicAnonKey}` },
        });
        if (!resp.ok) {
          const err = await resp.json().catch(() => ({})) as Record<string, any>;
          console.warn(`[StoryboardEditor] Delete storyboard failed:`, err.error || resp.status);
        } else {
          console.log(`[StoryboardEditor] Deleted storyboard ${deletedIds[0]} from DB`);
        }
      } else if (deletedIds.length > 1) {
        const resp = await fetch(getApiUrl(`/series/${seriesId}/delete-storyboards`), {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${publicAnonKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids: deletedIds }),
        });
        if (!resp.ok) {
          const err = await resp.json().catch(() => ({})) as Record<string, any>;
          console.warn(`[StoryboardEditor] Batch delete storyboards failed:`, err.error || resp.status);
        } else {
          const result = await resp.json();
          console.log(`[StoryboardEditor] Batch deleted ${result.deleted} storyboards from DB`);
        }
      }
      // Re-order remaining
      if (remainingStoryboards.length > 0) {
        _persistSortOrderImpl(remainingStoryboards);
      }
    } catch (err: unknown) {
      console.error('[Persistence] persistDeleteAndReorder error:', getErrorMessage(err));
    }
  }, [seriesId, _persistSortOrderImpl]);

  const _persistNewStoryboardImpl = useCallback(async (tempId: string, sb: Storyboard) => {
    try {
      const resp = await fetch(getApiUrl(`/series/${seriesId}/storyboards`), {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${publicAnonKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          episodeNumber,
          sceneNumber: sb.sceneNumber,
          description: sb.description,
          dialogue: sb.dialogue || '',
          characters: sb.characters || [],
          location: sb.location || '',
          timeOfDay: sb.timeOfDay || '',
          cameraAngle: sb.cameraAngle || '中景',
          duration: sb.duration || 10,
          status: 'draft',
        }),
      });
      if (!resp.ok) {
        const err: Record<string, any> = await resp.json().catch(() => ({}));
        console.warn(`[StoryboardEditor] Create storyboard failed:`, err.error || resp.status);
        return;
      }
      const result = await resp.json();
      const realId = result.data?.id;
      if (realId && realId !== tempId) {
        updateStoryboards(prev => prev.map(s => s.id === tempId ? { ...s, id: realId } : s));
        console.log(`[StoryboardEditor] Created storyboard ${realId} (replaced temp ${tempId})`);
      }
    } catch (err: unknown) {
      console.error('[Persistence] saveNew failed:', getErrorMessage(err));
    }
  }, [seriesId, episodeNumber, updateStoryboards]);

  const _persistStoryboardEditImpl = useCallback(async (sbId: string, data: Partial<Storyboard>) => {
    try {
      if (sbId.startsWith('sb-')) {
        console.log(`[StoryboardEditor] Skip persisting edit for temp id ${sbId}`);
        return;
      }
      const resp = await fetch(getApiUrl(`/series/${seriesId}/storyboards/${sbId}`), {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${publicAnonKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description: data.description,
          dialogue: data.dialogue,
          characters: data.characters,
          location: data.location,
          timeOfDay: data.timeOfDay,
          cameraAngle: data.cameraAngle,
          duration: data.duration,
        }),
      });
      if (!resp.ok) {
        const err: Record<string, any> = await resp.json().catch(() => ({}));
        console.warn(`[StoryboardEditor] Edit storyboard failed:`, err.error || resp.status);
      } else {
        console.log(`[StoryboardEditor] Persisted edit for storyboard ${sbId}`);
      }
    } catch (err: unknown) {
      console.error('[Persistence] saveEdit failed:', getErrorMessage(err));
    }
  }, [seriesId]);

  // Assign implementations to ref
  persistFnsRef.current = {
    persistSortOrder: _persistSortOrderImpl,
    persistDeleteAndReorder: _persistDeleteAndReorderImpl,
    persistNewStoryboard: _persistNewStoryboardImpl,
    persistStoryboardEdit: _persistStoryboardEditImpl,
  };

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (reorderTimerRef.current) clearTimeout(reorderTimerRef.current);
    };
  }, []);

  return {
    persistNewStoryboard,
    persistStoryboardEdit,
    persistSortOrder,
    persistDeleteAndReorder,
    patchStoryboardStatus,
  };
}