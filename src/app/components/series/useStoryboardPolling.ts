/**
 * useStoryboardPolling — Adaptive polling for generating storyboards
 * Extracted from StoryboardEditor.tsx for maintainability
 */

import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import * as seriesService from '../../services';
import type { Storyboard } from '../../types';
import { sbVideoUrl } from '../../utils';

interface UseStoryboardPollingOptions {
  storyboards: Storyboard[];
  seriesId: string;
  episodeId: string;
  updateStoryboards: (updater: (prev: Storyboard[]) => Storyboard[]) => void;
  sessionGeneratingIds: React.MutableRefObject<Set<string>>;
  generatingStartTimes: React.MutableRefObject<Map<string, number>>;
  patchStoryboardStatus: (
    sbId: string,
    status: 'generating' | 'completed' | 'draft',
    extra?: { videoUrl?: string },
  ) => void;
}

export function useStoryboardPolling({
  storyboards,
  seriesId,
  episodeId,
  updateStoryboards,
  sessionGeneratingIds,
  generatingStartTimes,
  patchStoryboardStatus,
}: UseStoryboardPollingOptions) {
  // v6.0.94: Component mount time — for stale generating detection
  const mountTimeRef = useRef(Date.now());

  const generatingIdsKey = storyboards
    .filter(sb => sb.status === 'generating' && !sbVideoUrl(sb))
    .map(sb => sb.id)
    .sort()
    .join(',');

  // v6.0.166: Adaptive polling — recursive setTimeout instead of fixed setInterval
  const pollStartTimeRef = useRef<number>(0);
  const pollIntervalRef = useRef<number>(3000);

  useEffect(() => {
    if (!generatingIdsKey) return;

    const idCount = generatingIdsKey.split(',').length;
    console.log(`[StoryboardEditor] Adaptive polling started for ${idCount} generating storyboard(s)`);
    pollStartTimeRef.current = Date.now();
    pollIntervalRef.current = 3000;
    let cancelled = false;

    const getAdaptiveInterval = () => {
      const elapsed = Date.now() - pollStartTimeRef.current;
      if (elapsed < 60_000) return 3000;       // <1min: 3s
      if (elapsed < 180_000) return 5000;       // 1-3min: 5s
      if (elapsed < 300_000) return 8000;       // 3-5min: 8s
      return 12000;                              // 5+min: 12s
    };

    const doPoll = async () => {
      if (cancelled) return;
      try {
        const result = await seriesService.getSeries(seriesId);
        if (cancelled) return;
        if (!result.success || !result.data) { scheduleNext(); return; }
        const freshSeries = result.data;
        const freshEpisode = freshSeries.episodes?.find((ep: any) => ep.id === episodeId);
        if (!freshEpisode?.storyboards) { scheduleNext(); return; }

        const minutesSinceMount = (Date.now() - mountTimeRef.current) / 60000;

        let anyUpdate = false;
        updateStoryboards(prev => {
          const updated = prev.map(sb => {
            if (sb.status !== 'generating') return sb;
            const fresh = freshEpisode.storyboards.find((f: any) => f.id === sb.id);
            const freshVideoUrl = fresh?.videoUrl || fresh?.video_url;
            const freshStatus = fresh?.status;
            if (freshVideoUrl && (freshVideoUrl.startsWith('http://') || freshVideoUrl.startsWith('https://'))) {
              anyUpdate = true;
              return { ...sb, videoUrl: freshVideoUrl, status: 'completed' as const };
            }
            // Sync non-generating status from DB
            if (freshStatus && freshStatus !== 'generating' && freshStatus !== sb.status) {
              anyUpdate = true;
              return { ...sb, status: freshStatus as Storyboard['status'] };
            }
            // v6.0.94: Auto-reset stale generating from previous session
            const isFromPrevSession = !sessionGeneratingIds.current.has(sb.id);
            if (isFromPrevSession && minutesSinceMount > 20) {
              anyUpdate = true;
              console.log(`[StoryboardEditor] Auto-reset stale generating scene ${sb.sceneNumber} → draft`);
              return { ...sb, status: 'draft' as const };
            }
            // v6.0.163: Current session timeout reset (>25min)
            const startTime = generatingStartTimes.current.get(sb.id);
            if (startTime && (Date.now() - startTime) > 25 * 60 * 1000) {
              anyUpdate = true;
              console.log(`[StoryboardEditor] Auto-reset current-session generating scene ${sb.sceneNumber} → draft (exceeded 25min)`);
              sessionGeneratingIds.current.delete(sb.id);
              generatingStartTimes.current.delete(sb.id);
              patchStoryboardStatus(sb.id, 'draft');
              toast.warning(`场景${sb.sceneNumber}生成超时(25分钟)，已自动重置。请重新生成。`, { duration: 8000 });
              return { ...sb, status: 'draft' as const };
            }
            return sb;
          });
          return anyUpdate ? updated : prev;
        });

        // Reset poll interval on change detection
        if (anyUpdate) {
          pollStartTimeRef.current = Date.now();
          pollIntervalRef.current = 3000;
          console.log(`[StoryboardEditor] Change detected, resetting poll interval to 3s`);
        }
      } catch { /* non-blocking */ }
      scheduleNext();
    };

    const scheduleNext = () => {
      if (cancelled) return;
      pollIntervalRef.current = getAdaptiveInterval();
      setTimeout(doPoll, pollIntervalRef.current);
    };

    // Initial delay 3s
    const initialTimer = setTimeout(doPoll, 3000);

    return () => {
      cancelled = true;
      clearTimeout(initialTimer);
    };
  }, [generatingIdsKey, seriesId, episodeId, updateStoryboards, sessionGeneratingIds, generatingStartTimes, patchStoryboardStatus]);
}