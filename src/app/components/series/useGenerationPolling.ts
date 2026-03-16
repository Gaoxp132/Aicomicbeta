import { useState, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import {
  checkGenerationStale,
  getAdaptivePollInterval,
  isGenerationEffectivelyComplete,
} from './SeriesEditorBanners';
import * as seriesService from '../../services';
import type { Series } from '../../types';
import { getErrorMessage } from '../../utils';

interface UseGenerationPollingOptions {
  localSeries: Series;
  userPhone?: string;
  setLocalSeries: React.Dispatch<React.SetStateAction<Series>>;
  onUpdate: (series: Series) => void;
}

/**
 * Extracted from SeriesEditor — handles polling the backend for generation
 * progress updates, stale-generation detection, and auto-retry logic.
 */
export function useGenerationPolling({
  localSeries,
  userPhone,
  setLocalSeries,
  onUpdate,
}: UseGenerationPollingOptions) {
  // v6.0.103: 追踪轮询无进度变化的次数，用于检测卡住
  const lastProgressRef = useRef<string>('');
  const lastUpdatedAtRef = useRef<string>('');
  const stalePollCountRef = useRef(0);
  const [isGenerationStale, setIsGenerationStale] = useState(false);
  const autoRetryAttemptedRef = useRef(false);
  const pollStartTimeRef = useRef<number>(0);

  // 如果series状态是generating，启动轮询刷新
  useEffect(() => {
    if (localSeries.status === 'generating') {
      if (checkGenerationStale(localSeries, 5)) {
        setIsGenerationStale(true);
      }
      if (!pollStartTimeRef.current) pollStartTimeRef.current = Date.now();

      let cancelled = false;
      const schedulePoll = () => {
        if (cancelled) return;
        const interval = getAdaptivePollInterval(pollStartTimeRef.current);
        const timerId = setTimeout(async () => {
          if (cancelled) return;
        try {
          const result = await seriesService.getSeries(localSeries.id);
          if (result.success && result.data) {
            setLocalSeries(result.data);
            onUpdate(result.data);
            if (result.data.status !== 'generating') {
              setIsGenerationStale(false);
              stalePollCountRef.current = 0;
              pollStartTimeRef.current = 0;
              return;
            }
            if (isGenerationEffectivelyComplete(result.data)) {
              console.log('[SeriesEditor] Generation effectively complete despite status=generating. Auto-correcting to draft.');
              setIsGenerationStale(false);
              stalePollCountRef.current = 0;
              pollStartTimeRef.current = 0;
              seriesService.updateSeries(localSeries.id, { status: 'draft' }).catch(() => {});
              const correctedSeries = { ...result.data, status: 'draft' as const };
              setLocalSeries(correctedSeries);
              onUpdate(correctedSeries);
              toast.success('AI创作已完成！');
              return;
            }
            const progressKey = JSON.stringify(result.data.generationProgress || '');
            const currentUpdatedAt = result.data.updatedAt || '';
            const progressChanged = progressKey !== lastProgressRef.current;
            const updatedAtChanged = currentUpdatedAt !== lastUpdatedAtRef.current;

            if (progressChanged || updatedAtChanged) {
              lastProgressRef.current = progressKey;
              lastUpdatedAtRef.current = currentUpdatedAt;
              stalePollCountRef.current = 0;
              setIsGenerationStale(false);
            } else {
              stalePollCountRef.current++;
              if (stalePollCountRef.current >= 36 || checkGenerationStale(result.data, 5)) {
                setIsGenerationStale(true);
                const cnt = stalePollCountRef.current;
                if (cnt === 36 || cnt % 100 === 0) {
                  console.warn(`[SeriesEditor] Generation appears stale: ${cnt} polls without change, updatedAt=${currentUpdatedAt}`);
                }
                if (cnt >= 72) {
                  if (!autoRetryAttemptedRef.current && userPhone) {
                    autoRetryAttemptedRef.current = true;
                    console.warn(`[SeriesEditor] Generation stale after ${cnt} polls — attempting auto-retry...`);
                    toast.info('AI创作似乎已中断，正在自动重试...');
                    stalePollCountRef.current = 0;
                    lastProgressRef.current = '';
                    lastUpdatedAtRef.current = '';
                    setIsGenerationStale(false);
                    seriesService.retrySeries(
                      localSeries.id,
                      userPhone,
                      localSeries.storyOutline || localSeries.description || ''
                    ).then(retryResult => {
                      if (retryResult.success) {
                        console.log('[SeriesEditor] Auto-retry triggered successfully, polling will resume');
                      } else {
                        console.error('[SeriesEditor] Auto-retry failed:', retryResult.error);
                        toast.error('自动重试失败，请手动点击"重新创作"');
                      }
                    }).catch(() => {
                      toast.error('自动重试失败，请手动点击"重新创作"');
                    });
                    schedulePoll();
                    return;
                  }

                  if (isGenerationEffectivelyComplete(result.data)) {
                    console.log('[SeriesEditor] Generation effectively complete at hard-limit. Auto-correcting to draft instead of failed.');
                    seriesService.updateSeries(localSeries.id, { status: 'draft' }).catch(() => {});
                    const correctedSeries = { ...result.data, status: 'draft' as const };
                    setLocalSeries(correctedSeries);
                    onUpdate(correctedSeries);
                    setIsGenerationStale(false);
                    pollStartTimeRef.current = 0;
                    toast.success('AI创作已完成！');
                    return;
                  }

                  console.error(`[SeriesEditor] Generation irrecoverably stale after ${cnt} polls. Auto-stopping poll.`);
                  seriesService.updateSeries(localSeries.id, { status: 'failed' }).catch(() => {});
                  setLocalSeries(prev => ({ ...prev, status: 'failed' }));
                  onUpdate({ ...result.data, status: 'failed' });
                  pollStartTimeRef.current = 0;
                  toast.error('AI创作已中断（自动重试未能恢复），请手动点击"重新创作"');
                  return;
                }
              }
            }
          }
        } catch (error: unknown) {
          const errMsg = getErrorMessage(error);
          console.error('[SeriesEditor] Polling error:', errMsg);
        }
        schedulePoll();
        }, interval);
        timerIdRef = timerId;
      };

      let timerIdRef: ReturnType<typeof setTimeout>;
      schedulePoll();

      return () => {
        cancelled = true;
        clearTimeout(timerIdRef);
      };
    } else {
      setIsGenerationStale(false);
      stalePollCountRef.current = 0;
      pollStartTimeRef.current = 0;
    }
  }, [localSeries.status, localSeries.id, onUpdate]);

  /** Reset stale-tracking state (call after manual retry) */
  const resetStaleTracking = () => {
    setIsGenerationStale(false);
    stalePollCountRef.current = 0;
    lastProgressRef.current = '';
    lastUpdatedAtRef.current = '';
    autoRetryAttemptedRef.current = false;
  };

  return { isGenerationStale, resetStaleTracking };
}