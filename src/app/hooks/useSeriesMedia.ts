/**
 * Series/task hooks — useSeries, useTaskRecovery, useVideoGeneration
 * Extracted from media.ts for maintainability
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { toast } from 'sonner';
import { apiGet, apiPost, apiRequest, isEdgeFunctionReachable } from '../utils';
import { getErrorMessage } from '../utils';
import { STYLE_THUMBNAILS } from '../constants';
import type { Series, Comic } from '../types';
import { getUserSeries, pollSeriesProgress } from '../services';
import * as volcengine from '../services';
import { CancelledTaskError } from '../services';
import { publishToCommunity } from '../services';
import { useCachedData } from './index';

// ═══════════════════════════════════════════════════════════════════
// [4] useSeries
// ═══════════════════════════════════════════════════════════════════

export function useSeries(userPhone?: string) {
  const [series, setSeries] = useState<Series[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasLoadedRef = useRef(false);
  const generatingIdsRef = useRef<string>('');

  const cacheKey = `user-series-${userPhone || 'anonymous'}`;
  const { data: cachedData, isLoading: isCacheLoading, load: loadFromAPI, refresh: refreshFromAPI } = useCachedData(
    async () => {
      if (!userPhone) return [];
      const result = await getUserSeries(userPhone);
      return result.success ? result.data || [] : [];
    },
    { cacheKey, ttl: 5 * 60 * 1000, autoLoad: false }
  );

  useEffect(() => { if (cachedData) setSeries(cachedData); }, [cachedData]);
  useEffect(() => { setIsLoading(isCacheLoading); }, [isCacheLoading]);

  const loadSeries = useCallback(async () => { if (!userPhone) return; hasLoadedRef.current = true; await loadFromAPI(); }, [userPhone, loadFromAPI]);

  useEffect(() => { if (userPhone && !hasLoadedRef.current) loadSeries(); }, [userPhone, loadSeries]);

  const generatingIds = Array.isArray(series) ? series.filter(s => s.status === 'generating' || s.status === 'in-progress').map(s => s.id).sort().join(',') : '';
  generatingIdsRef.current = generatingIds;

  useEffect(() => {
    if (!generatingIds || !userPhone) return;
    if (!isEdgeFunctionReachable()) return;
    const ids = generatingIds.split(',').filter(Boolean);
    const seriesToPoll = ids.slice(0, 5); // v6.0.124: 从2提升至5，防止多剧并发生成时后续剧集无法轮询
    const cancelFunctions = seriesToPoll.map(id =>
      pollSeriesProgress(id, userPhone, (updatedSeries) => {
        setSeries(prev => { const a = Array.isArray(prev) ? prev : []; return a.map(item => item.id === updatedSeries.id ? updatedSeries : item); });
      }, 5000)
    );
    return () => { cancelFunctions.forEach(cancel => cancel()); };
  }, [generatingIds, userPhone]);

  const addSeries = useCallback((newSeries: Series) => { setSeries(prev => { const a = Array.isArray(prev) ? prev : []; return [newSeries, ...a]; }); }, []);
  const updateSeriesLocal = useCallback((updatedSeries: Series) => { setSeries(prev => { const a = Array.isArray(prev) ? prev : []; return a.map(s => s.id === updatedSeries.id ? updatedSeries : s); }); }, []);
  const removeSeriesLocal = useCallback((seriesId: string) => { setSeries(prev => { const a = Array.isArray(prev) ? prev : []; return a.filter(s => s.id !== seriesId); }); }, []);

  return { series, isLoading, error, addSeries, updateSeriesLocal, removeSeriesLocal, loadSeries, refresh: refreshFromAPI };
}

// ═══════════════════════════════════════════════════════════════════
// [5] useTaskRecovery
// ═══════════════════════════════════════════════════════════════════

export function useTaskRecovery(userPhone: string | null) {
  const [recoveredTasks, setRecoveredTasks] = useState<Comic[]>([]);
  const [isRecovering, setIsRecovering] = useState(false);
  const backoffRef = useRef(15000);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recoverFnRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!userPhone) { setRecoveredTasks([]); return; }
    let isMounted = true;
    const pollingTaskIds = new Set<string>();

    const recoverTasks = async () => {
      if (!isMounted) return;
      setIsRecovering(true);
      try {
        const result = await apiRequest(`/volcengine/tasks?userPhone=${encodeURIComponent(userPhone)}`, { method: 'GET', timeout: 30000, maxRetries: 2, silent: true });
        if (!isMounted) return;
        if (!result.success || !result.tasks) { backoffRef.current = Math.min(backoffRef.current * 2, 120000); scheduleNext(); return; }
        backoffRef.current = 15000;
        const dbTasks = result.tasks;
        const tasks: Comic[] = dbTasks.map((task: Record<string, unknown>, idx: number) => {
          const thumbnail = (task.thumbnail as string) || STYLE_THUMBNAILS[task.style as keyof typeof STYLE_THUMBNAILS] || STYLE_THUMBNAILS.anime;
          const videoUrl = (task.videoUrl as string) || (task.video_url as string) || '';
          const taskIdVal = (task.taskId as string) || (task.task_id as string) || '';
          const metadata = task.generationMetadata || task.generation_metadata || null;
          let extractedSeriesId = '';
          if (metadata) { try { const meta = typeof metadata === 'string' ? JSON.parse(metadata) : metadata; extractedSeriesId = meta.seriesId || meta.series_id || ''; } catch {} }
          let mappedStatus: 'generating' | 'completed' | 'failed';
          if (task.status === 'completed') mappedStatus = 'completed';
          else if (task.status === 'failed' || task.status === 'cancelled') mappedStatus = 'failed';
          else if (task.status === 'processing' || task.status === 'pending' || task.status === 'generating') mappedStatus = 'generating';
          else mappedStatus = videoUrl ? 'completed' : 'generating';
          const finalTaskId = taskIdVal || task.id || `recovered-${idx}-${Date.now()}`;
          // v6.0.77: 优先使用DB title字段（包含系列名-E集-场景号），避免用enriched prompt作标题
          const displayTitle = task.title || task.prompt?.slice(0, 30) + '...' || '未命名作品';
          return { id: finalTaskId, taskId: finalTaskId, title: displayTitle, prompt: task.prompt || '', style: task.style || 'anime', duration: task.duration?.toString() || '5', thumbnail, videoUrl, createdAt: new Date(task.createdAt || task.created_at || Date.now()), status: mappedStatus, userPhone: task.userPhone || task.user_phone, metadata, seriesId: extractedSeriesId };
        });
        if (!isMounted) return;
        // v6.0.77: 前端二次检查——超过25分钟仍为generating的任务直接标记failed（与后端20min自动过期互补）
        const STALE_MS = 25 * 60 * 1000;
        const nowMs = Date.now();
        for (const t of tasks) {
          if (t.status === 'generating' && t.createdAt) {
            const age = nowMs - new Date(t.createdAt).getTime();
            if (age > STALE_MS) { t.status = 'failed'; t.error = '任务超时（超过25分钟未完成）'; }
          }
        }
        setRecoveredTasks(tasks);
        const generatingTasks = tasks.filter(t => t.status === 'generating' && t.taskId && !pollingTaskIds.has(t.taskId));
        generatingTasks.forEach(task => {
          pollingTaskIds.add(task.taskId!);
          volcengine.pollTaskStatus(task.taskId!, (status) => {
            if (!isMounted) return;
            if (status.status === 'cancelled') { setRecoveredTasks(prev => prev.filter(t => t.taskId !== task.taskId)); return; }
            setRecoveredTasks(prev => prev.map(t => {
              if (t.taskId !== task.taskId) return t;
              if (t.status === 'completed' || t.status === 'failed') return t;
              const newStatus = status.status === 'completed' || status.status === 'success' ? 'completed' : status.status === 'failed' || status.status === 'error' ? 'failed' : 'generating';
              return { ...t, status: newStatus, videoUrl: status.videoUrl || t.videoUrl };
            }));
          }, 40, 15000).then(finalStatus => {
            if (!isMounted) return;
            pollingTaskIds.delete(task.taskId!);
            setRecoveredTasks(prev => prev.map(t => t.taskId === task.taskId ? { ...t, status: 'completed', videoUrl: finalStatus.videoUrl || t.videoUrl } : t));
          }).catch((error: unknown) => {
            pollingTaskIds.delete(task.taskId!);
            if (!isMounted) return;
            if (error instanceof CancelledTaskError || (error instanceof Error && error.message?.includes('已取消'))) { setRecoveredTasks(prev => prev.filter(t => t.taskId !== task.taskId)); return; }
            const errMsg = getErrorMessage(error);
            const isTaskNotFound = errMsg.includes('任务不存在') || errMsg.includes('Task not found') || errMsg.includes('not found in database') || errMsg.includes('已过期');
            if (isTaskNotFound) { setRecoveredTasks(prev => prev.map(t => t.taskId === task.taskId ? { ...t, status: 'failed' as const, error: '任务已过期或存在' } : t)); return; }
            // v6.0.77: 兜底——轮询超时/网络错误等未知错误也标记为failed，防止任务永久卡在generating
            console.warn(`[TaskRecovery] Task ${task.taskId} poll failed (marking as failed):`, errMsg);
            setRecoveredTasks(prev => prev.map(t => t.taskId === task.taskId ? { ...t, status: 'failed' as const, error: errMsg || '任务超时' } : t));
          });
        });
        scheduleNext();
      } catch (error: unknown) { backoffRef.current = Math.min(backoffRef.current * 2, 120000); scheduleNext(); }
      finally { if (isMounted) setIsRecovering(false); }
    };

    const scheduleNext = () => { if (!isMounted) return; if (timerRef.current) clearTimeout(timerRef.current); timerRef.current = setTimeout(recoverTasks, backoffRef.current); };
    recoverFnRef.current = recoverTasks;
    recoverTasks();
    return () => { isMounted = false; recoverFnRef.current = null; if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; } };
  }, [userPhone]);

  const forceRefresh = useCallback(() => { if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; } backoffRef.current = 15000; recoverFnRef.current?.(); }, []);
  const removeTasksForSeries = useCallback((seriesId: string) => { setRecoveredTasks(prev => prev.filter(t => t.seriesId !== seriesId)); }, []);

  return { recoveredTasks, isRecovering, setRecoveredTasks, forceRefresh, removeTasksForSeries };
}

// ══════════════════════════════════════════════════════════════════
// [6] useVideoGeneration
// ═══════════════════════════════════════════════════════════════════

interface GenerateParams { prompt: string; style: string; duration: string; imageUrls?: string[]; resolution?: string; fps?: number; enableAudio?: boolean; model?: string; }

export function useVideoGeneration(userPhone: string) {
  const [comics, setComics] = useState<Comic[]>([]);
  const { recoveredTasks, isRecovering, setRecoveredTasks, forceRefresh, removeTasksForSeries } = useTaskRecovery(userPhone);

  useEffect(() => {
    if (recoveredTasks.length > 0) setComics(recoveredTasks);
    else if (!userPhone) setComics([]);
  }, [recoveredTasks, userPhone]);

  const handleGenerate = async (data: GenerateParams) => {
    const activeTasksCount = comics.filter(c => c.status === 'generating').length;
    if (activeTasksCount >= 3) { toast.error('已达到并发上限（3个），请等待当前任务完成'); return false; }
    if (!userPhone) { toast.error('请先登录后再生成视频'); return false; }
    const healthResult = await apiGet('/health', { timeout: 10000, maxRetries: 0, silent: true });
    if (!healthResult.success) {
      const errMsg = healthResult.error || '';
      if (errMsg.includes('timeout') || errMsg.includes('超时')) toast.error('服务器响应超时，请稍后重试');
      else toast.error('无法连接到服务器，请检查网络');
      return false;
    }
    const thumbnail = data.imageUrls?.[0] || STYLE_THUMBNAILS[data.style as keyof typeof STYLE_THUMBNAILS] || STYLE_THUMBNAILS.anime;
    const newComic: Comic = { id: Date.now().toString(), title: data.prompt.slice(0, 30) + '...', prompt: data.prompt, style: data.style, duration: data.duration, thumbnail, videoUrl: '', createdAt: new Date(), status: 'generating', imageUrls: data.imageUrls, resolution: data.resolution, fps: data.fps, enableAudio: data.enableAudio, model: data.model, userPhone };
    setComics(prev => [newComic, ...prev]);
    try {
      const result = await volcengine.createVideoTask({ prompt: data.prompt, title: data.prompt?.substring(0, 100) || '视频生成任务', style: data.style, duration: data.duration, imageUrls: data.imageUrls, resolution: data.resolution, fps: data.fps, enableAudio: data.enableAudio, model: data.model, userPhone });
      if (!result) throw new Error('服务器返回空数据，请重试');
      const taskId = result.id || result.task_id;
      if (!taskId) { console.error('[Video Generation] Cannot extract taskId from result:', result); toast.error('服务异常：无法获取任务ID'); throw new Error('无法获取任务ID，请检查后端服务'); }
      toast.success('视频生成任务已提交！预计 1-3 分钟完成');
      setComics(prev => prev.map(c => c.id === newComic.id ? { ...c, id: taskId, taskId } : c));
      volcengine.pollTaskStatus(taskId, (status) => {
        if (status.status === 'cancelled') { setComics(prev => prev.filter(c => c.taskId !== taskId && c.id !== taskId)); return; }
        setComics(prev => prev.map(c => {
          if (c.taskId !== taskId && c.id !== taskId) return c;
          if (c.status === 'completed' || c.status === 'failed') return c;
          const newStatus = status.status === 'completed' || status.status === 'success' ? 'completed' : status.status === 'failed' || status.status === 'error' ? 'failed' : 'generating';
          return { ...c, status: newStatus, videoUrl: status.videoUrl || c.videoUrl };
        }));
      }, 120, 5000).then(async (finalStatus) => {
        const updatedComic = { ...newComic, id: taskId, status: 'completed' as const, videoUrl: finalStatus.videoUrl || '', taskId };
        setComics(prev => prev.map(c => (c.taskId === taskId || c.id === taskId ? updatedComic : c)));
        if (finalStatus.videoUrl && userPhone) {
          try {
            const isValidUrl = finalStatus.videoUrl.startsWith('http://') || finalStatus.videoUrl.startsWith('https://');
            if (!isValidUrl) {
              console.error('[Video Generation] Invalid videoUrl (not a URL):', finalStatus.videoUrl);
              await publishToCommunity({ phone: userPhone, taskId, title: newComic.title, prompt: newComic.prompt, style: newComic.style, duration: newComic.duration, thumbnail: newComic.thumbnail, videoUrl: finalStatus.videoUrl });
              return;
            }
            const transferResult = await apiPost('/video/transfer', { taskId, volcengineUrl: finalStatus.videoUrl });
            let finalVideoUrl = finalStatus.videoUrl;
            if (transferResult.success && transferResult.data?.ossUrl) {
              finalVideoUrl = String(transferResult.data.ossUrl);
              setComics(prev => prev.map(c => (c.taskId === taskId || c.id === taskId) ? { ...c, videoUrl: finalVideoUrl } : c));
            } else { console.warn('[Video Generation] Video transfer failed, using original URL:', transferResult.error); }
            await publishToCommunity({ phone: userPhone, taskId, title: newComic.title, prompt: newComic.prompt, style: newComic.style, duration: newComic.duration, thumbnail: newComic.thumbnail, videoUrl: finalVideoUrl });
          } catch (publishError: unknown) { console.error('[Video Generation] Auto-publish failed:', publishError); }
        }
      }).catch((error: unknown) => {
        const errMsg = getErrorMessage(error);
        if (error instanceof CancelledTaskError || (error instanceof Error && error.message?.includes('已取消'))) { setComics(prev => prev.filter(c => c.taskId !== taskId && c.id !== taskId)); }
        else if (errMsg.includes('网络连接问题') || errMsg.includes('轮询超时') || errMsg.includes('请求超时') || errMsg.includes('timeout')) {
          // v6.0.77: 轮询超时也标记为failed（之前静默忽略导致任务永久卡在generating）
          console.warn(`[Video Generation] Poll timeout for task ${taskId}, marking as failed:`, errMsg);
          setComics(prev => prev.map(c => (c.taskId === taskId || c.id === taskId) ? { ...c, status: 'failed' as const } : c));
        }
        else { console.error('[Video Generation] Video generation failed:', errMsg); setComics(prev => prev.map(c => (c.taskId === taskId || c.id === taskId) ? { ...c, status: 'failed' as const } : c)); }
      });
      return true;
    } catch (error: unknown) {
      const errMsg = getErrorMessage(error);
      console.error('[Video Generation] Failed to create task:', errMsg);
      toast.error(`生成失败: ${errMsg}`);
      setComics(prev => prev.map(c => c.id === newComic.id ? { ...c, status: 'failed' as const } : c));
      return false;
    }
  };

  const activeTasks = comics.filter(c => c.status === 'generating');
  const onSeriesDeleted = useCallback((seriesId: string) => {
    removeTasksForSeries(seriesId); setComics(prev => prev.filter(c => c.seriesId !== seriesId));
    setTimeout(() => forceRefresh(), 1500);
  }, [removeTasksForSeries, forceRefresh]);

  return { comics, setComics, activeTasks, handleGenerate, onSeriesDeleted };
}