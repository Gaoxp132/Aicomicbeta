/**
 * 漫剧相关的React Hooks
 * 简化状态管理和API调用
 * v2.0: 添加智能缓存，避免频繁重复请求
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  getUserSeries,
  getSeriesDetails,
  createSeriesFromIdea,
  toggleSeriesLike,
  pollSeriesProgress,
} from '@/app/services/seriesServicePG';
// 旧服务导入（向后兼容）
import * as oldSeriesService from '@/app/services/seriesService';
import { useCachedData, invalidateCache } from './useCachedData';

// ==================== 向后兼容的主Hook ====================

/**
 * 主要的漫剧Hook（向后兼容旧代码）
 * v2.0: 使用智能缓存，避免每次切换页面都重新请求
 */
export function useSeries(userPhone?: string) {
  const [series, setSeries] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false); // 改为false，避免初始加载
  const [error, setError] = useState<string | null>(null);
  const hasLoadedRef = useRef(false); // 标记是否已加载过

  // 🆕 使用缓存Hook
  const cacheKey = `user-series-${userPhone || 'anonymous'}`;
  const {
    data: cachedData,
    isLoading: isCacheLoading,
    load: loadFromAPI,
    refresh: refreshFromAPI,
  } = useCachedData(
    async () => {
      if (!userPhone) {
        console.log('[useSeries] ⚠️ No userPhone, skipping load');
        return [];
      }

      console.log('[useSeries] 🔄 Loading series for userPhone:', userPhone);
      const result = await getUserSeries(userPhone);
      console.log('[useSeries] ✅ API Response:', { 
        success: result.success, 
        dataLength: result.data?.length, 
        count: result.count,
      });
      
      if (result.success) {
        return result.data || [];
      } else {
        console.warn('[useSeries] New API failed, falling back to old API');
        const oldResult = await oldSeriesService.getUserSeries(userPhone);
        if (oldResult.success) {
          return oldResult.data || [];
        } else {
          throw new Error(oldResult.error || '加载失败');
        }
      }
    },
    {
      cacheKey,
      ttl: 5 * 60 * 1000, // 5分钟缓存
      autoLoad: false, // 🔥 不自动加载，只在需要时手动触发
    }
  );

  // 🆕 同步缓存数据到本地状态
  useEffect(() => {
    if (cachedData) {
      setSeries(cachedData);
    }
  }, [cachedData]);

  useEffect(() => {
    setIsLoading(isCacheLoading);
  }, [isCacheLoading]);

  // 🆕 手动加载数据（只加载一次，除非手动刷新）
  const loadSeries = useCallback(async () => {
    if (!userPhone) {
      console.log('[useSeries] ⚠️ No userPhone, skipping load');
      return;
    }

    // 🔥 详细调试用户手机号
    console.log('[useSeries] 🔄 Manually triggered loadSeries');
    console.log('[useSeries] 📱 userPhone details:', {
      value: userPhone,
      length: userPhone?.length,
      type: typeof userPhone,
      isValid: /^1[3-9]\d{9}$/.test(userPhone),
      preview: userPhone ? `${userPhone.substring(0, 3)}****${userPhone.substring(7)}` : 'null',
    });
    console.log('[useSeries] hasLoadedRef:', hasLoadedRef.current);
    
    // 🔥 强制加载，不管缓存状态
    console.log('[useSeries] 🔄 Loading series from API...');
    hasLoadedRef.current = true;
    await loadFromAPI();
  }, [userPhone, loadFromAPI]); // 移除cachedData依赖，避免不必要的重新创建

  // 🆕 初始加载（仅第一次）
  useEffect(() => {
    console.log('[useSeries] Initial load useEffect triggered');
    console.log('[useSeries] userPhone:', userPhone);
    console.log('[useSeries] hasLoadedRef.current:', hasLoadedRef.current);
    
    if (userPhone && !hasLoadedRef.current) {
      console.log('[useSeries] 🎬 Triggering initial load...');
      loadSeries();
    }
  }, [userPhone, loadSeries]);

  // 自动轮询生成中的漫剧
  useEffect(() => {
    // 确保 series 是数组
    if (!Array.isArray(series) || series.length === 0 || !userPhone) return;
    
    const generatingSeries = series.filter(
      (s) => s.status === 'generating' || s.status === 'in-progress'
    );

    if (generatingSeries.length === 0) return;

    console.log('[useSeries] Polling', generatingSeries.length, 'generating series');

    const cancelFunctions = generatingSeries.map((s) =>
      pollSeriesProgress(
        s.id,
        userPhone,
        (updatedSeries) => {
          console.log('[useSeries] Progress update for', s.id);
          setSeries((prev) => {
            // 确保prev是数组
            const prevArray = Array.isArray(prev) ? prev : [];
            return prevArray.map((item) =>
              item.id === updatedSeries.id ? updatedSeries : item
            );
          });
        },
        5000 // 每5秒轮询
      )
    );

    return () => {
      console.log('[useSeries] Cleaning up polling');
      cancelFunctions.forEach((cancel) => cancel());
    };
  }, [series, userPhone]); // 修复依赖

  // 添加漫剧到本地列表
  const addSeries = useCallback((newSeries: any) => {
    setSeries((prev) => {
      // 确保prev是数组
      const prevArray = Array.isArray(prev) ? prev : [];
      return [newSeries, ...prevArray];
    });
  }, []);

  // 更新本地列表中的漫剧
  const updateSeriesLocal = useCallback((updatedSeries: any) => {
    setSeries((prev) => {
      // 确保prev是数组
      const prevArray = Array.isArray(prev) ? prev : [];
      return prevArray.map((s) => (s.id === updatedSeries.id ? updatedSeries : s));
    });
  }, []);

  // 从本地列表中移除漫剧
  const removeSeriesLocal = useCallback((seriesId: string) => {
    setSeries((prev) => {
      // 确保prev是数组
      const prevArray = Array.isArray(prev) ? prev : [];
      return prevArray.filter((s) => s.id !== seriesId);
    });
  }, []);

  return {
    series,
    isLoading,
    error,
    addSeries,
    updateSeriesLocal,
    removeSeriesLocal,
    loadSeries,
    refresh: refreshFromAPI, // 别名
  };
}

// ==================== useSeriesList ====================

/**
 * 获取用户漫剧列表
 */
export function useSeriesList(userPhone: string) {
  const [series, setSeries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadSeries = useCallback(async () => {
    if (!userPhone) return;

    setLoading(true);
    setError(null);

    try {
      const result = await getUserSeries(userPhone);
      if (result.success) {
        setSeries(result.data || []);
      } else {
        setError(result.error || '加载失败');
      }
    } catch (err: any) {
      setError(err.message || '加载失败');
    } finally {
      setLoading(false);
    }
  }, [userPhone]);

  useEffect(() => {
    loadSeries();
  }, [loadSeries]);

  return {
    series,
    loading,
    error,
    refresh: loadSeries,
  };
}

// ==================== useSeriesDetails ====================

/**
 * 获取漫剧详情（自动追踪生成进度）
 */
export function useSeriesDetails(seriesId: string, userPhone: string) {
  const [series, setSeries] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadDetails = useCallback(async () => {
    if (!seriesId) return;

    setLoading(true);
    setError(null);

    try {
      const result = await getSeriesDetails(seriesId, userPhone);
      if (result.success) {
        setSeries(result.data);
      } else {
        setError(result.error || '加载失败');
      }
    } catch (err: any) {
      setError(err.message || '加载失败');
    } finally {
      setLoading(false);
    }
  }, [seriesId, userPhone]);

  // 初始加载
  useEffect(() => {
    loadDetails();
  }, [loadDetails]);

  // 自动轮询生成进度
  useEffect(() => {
    if (!series || !seriesId || !userPhone) return;

    const isGenerating = series.status === 'generating' || series.status === 'in-progress';
    if (!isGenerating) return;

    console.log('[useSeriesDetails] Starting progress polling');

    const cancelPolling = pollSeriesProgress(
      seriesId,
      userPhone,
      (updatedSeries) => {
        console.log('[useSeriesDetails] Progress update:', updatedSeries.status);
        setSeries(updatedSeries);
      },
      3000
    );

    return () => {
      console.log('[useSeriesDetails] Cleaning up polling');
      cancelPolling();
    };
  }, [series?.status, seriesId, userPhone]);

  return {
    series,
    loading,
    error,
    refresh: loadDetails,
  };
}

// ==================== useSeriesCreation ====================

/**
 * 创建漫剧（AI模式）
 */
export function useSeriesCreation(userPhone: string) {
  const [creating, setCreating] = useState(false);
  const [seriesId, setSeriesId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const create = useCallback(
    async (
      userInput: string,
      options?: {
        totalEpisodes?: number;
        targetAudience?: string;
        scriptGenre?: string;
      }
    ) => {
      if (!userPhone) {
        setError('缺少用户信息');
        return null;
      }

      setCreating(true);
      setError(null);
      setSeriesId(null);

      try {
        const result = await createSeriesFromIdea(userInput, userPhone, {
          totalEpisodes: options?.totalEpisodes || 5,
          targetAudience: options?.targetAudience || 'universal',
          scriptGenre: options?.scriptGenre || '现实生活',
        });

        if (result.success && result.seriesId) {
          setSeriesId(result.seriesId);
          return result.seriesId;
        } else {
          setError(result.error || '创建失败');
          return null;
        }
      } catch (err: any) {
        setError(err.message || '创建失败');
        return null;
      } finally {
        setCreating(false);
      }
    },
    [userPhone]
  );

  const reset = useCallback(() => {
    setCreating(false);
    setSeriesId(null);
    setError(null);
  }, []);

  return {
    create,
    creating,
    seriesId,
    error,
    reset,
  };
}

// ==================== useSeriesInteractions ====================

/**
 * 漫剧互动（点赞、评论等）
 */
export function useSeriesInteractions(seriesId: string, userPhone: string) {
  const [isLiked, setIsLiked] = useState(false);
  const [likesCount, setLikesCount] = useState(0);
  const [isTogglingLike, setIsTogglingLike] = useState(false);

  const handleLike = useCallback(async () => {
    if (isTogglingLike || !seriesId || !userPhone) return;

    // 乐观更新
    const previousIsLiked = isLiked;
    const previousLikesCount = likesCount;
    
    setIsLiked(!isLiked);
    setLikesCount(prev => isLiked ? prev - 1 : prev + 1);
    setIsTogglingLike(true);

    try {
      const result = await toggleSeriesLike(seriesId, userPhone);

      if (result.success && result.data) {
        // 使用服务器返回的准确数据
        setIsLiked(result.data.isLiked);
        setLikesCount(result.data.likes);
      } else {
        // 失败时回滚
        setIsLiked(previousIsLiked);
        setLikesCount(previousLikesCount);
      }
    } catch (error) {
      console.error('Failed to toggle like:', error);
      // 失败时回滚
      setIsLiked(previousIsLiked);
      setLikesCount(previousLikesCount);
    } finally {
      setIsTogglingLike(false);
    }
  }, [seriesId, userPhone, isLiked, likesCount, isTogglingLike]);

  const updateInteractions = useCallback((interactions: any) => {
    if (interactions) {
      setIsLiked(interactions.isLiked || false);
      setLikesCount(interactions.likes || 0);
    }
  }, []);

  return {
    isLiked,
    likesCount,
    isTogglingLike,
    handleLike,
    updateInteractions,
  };
}

// ==================== useSeriesProgress ====================

/**
 * 仅用于追踪生成进度（不加载完整数据）
 */
export function useSeriesProgress(
  seriesId: string,
  userPhone: string,
  onComplete?: (series: any) => void,
  onError?: (error: string) => void
) {
  const [progress, setProgress] = useState<any>(null);
  const [status, setStatus] = useState<string>('generating');

  useEffect(() => {
    if (!seriesId || !userPhone) return;

    console.log('[useSeriesProgress] Starting polling for:', seriesId);

    const cancelPolling = pollSeriesProgress(
      seriesId,
      userPhone,
      (series) => {
        setProgress(series.generation_progress);
        setStatus(series.status);

        if (series.status === 'completed') {
          console.log('[useSeriesProgress] Generation completed');
          onComplete?.(series);
        } else if (series.status === 'failed') {
          console.error('[useSeriesProgress] Generation failed');
          onError?.(series.generation_progress?.error || '生成失败');
        }
      },
      3000
    );

    return () => {
      console.log('[useSeriesProgress] Cleaning up polling');
      cancelPolling();
    };
  }, [seriesId, userPhone, onComplete, onError]);

  const getProgressPercentage = useCallback(() => {
    if (!progress || !progress.currentStep || !progress.totalSteps) {
      return 0;
    }
    return Math.round((progress.currentStep / progress.totalSteps) * 100);
  }, [progress]);

  return {
    progress,
    status,
    percentage: getProgressPercentage(),
  };
}