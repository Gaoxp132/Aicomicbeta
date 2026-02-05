import { useState, useEffect, useCallback, useRef } from 'react';
import * as communityAPI from '../services/community';
import type { CommunitySeriesWork } from '../types';

export interface UseCommunitySeriesProps {
  selectedCategory: string;
  sortBy: string;
  searchQuery: string;
  userPhone?: string; // 添加用户手机号参数
}

export interface SeriesInteractions {
  likes: number;
  shares: number;
  comments: number;
  isLiked: boolean;
}

export function useCommunitySeries({ selectedCategory, sortBy, searchQuery, userPhone }: UseCommunitySeriesProps) {
  const [series, setSeries] = useState<CommunitySeriesWork[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [interactions, setInteractions] = useState<Map<string, SeriesInteractions>>(new Map());
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // 🆕 缓存控制 - 避免频繁重复请求
  const lastLoadParamsRef = useRef<string>('');
  const hasLoadedRef = useRef(false);
  const lastFetchTimeRef = useRef<Date | null>(null); // 🆕 记录最后加载时间
  const [isPullingToRefresh, setIsPullingToRefresh] = useState(false); // 🆕 下拉刷新状态

  // 加载漫剧系列
  const loadSeries = async (pageNum: number = 1, append: boolean = false) => {
    // 只在选择了series或all类别时加载
    if (selectedCategory !== 'series' && selectedCategory !== 'all') {
      setSeries([]);
      return;
    }

    // 🆕 生成参数指纹，避免重复请求
    const paramsFingerprint = `${selectedCategory}-${sortBy}-${searchQuery}-${pageNum}`;
    
    // 🔥 如果参数没变且不是追加加载，跳过请求
    if (!append && lastLoadParamsRef.current === paramsFingerprint && hasLoadedRef.current) {
      console.log('[useCommunitySeries] ✅ Using cached data, skipping reload');
      return;
    }

    if (pageNum === 1) {
      setIsLoading(true);
    } else {
      setIsLoadingMore(true);
    }

    try {
      const result = await communityAPI.getCommunitySeries({
        page: pageNum,
        limit: 20,
        sort: sortBy as 'latest' | 'popular',
        search: searchQuery || undefined,
        userPhone: userPhone, // 传递用户手机号
      });

      if (result.success) {
        const newSeries = result.data || [];
        
        if (append) {
          setSeries(prev => [...prev, ...newSeries]);
        } else {
          setSeries(newSeries);
          lastFetchTimeRef.current = new Date(); // 🆕 记录加载时间
        }
        
        setHasMore(result.hasMore);
        setPage(result.page);
        setError(null);
        
        // 从API响应中读取交互数据（已包含isLiked和统计数据）
        loadInteractions(newSeries);
        
        // 🆕 记录加载参数
        lastLoadParamsRef.current = paramsFingerprint;
        hasLoadedRef.current = true;
      } else {
        // 只在非网络错误时显示错误
        if (result.error && !result.error.includes('Failed to fetch')) {
          setError(result.error);
        } else {
          // 网络错误时设置空数组，不显示错误
          setSeries([]);
          setError(null);
        }
      }
    } catch (err: any) {
      console.error('[useCommunitySeries] Load error:', err);
      // 网络错误时静默失败，不显示错误提示
      if (err.message && err.message.includes('Failed to fetch')) {
        console.warn('[useCommunitySeries] Network error detected, silently failing');
        setSeries([]);
        setError(null);
      } else {
        setError(err.message || '加载漫剧系列失败');
      }
    } finally {
      setIsLoading(false);
      setIsLoadingMore(false);
    }
  };

  // 🆕 增量刷新 - 只获取新数据
  const refreshNewData = useCallback(async () => {
    if (selectedCategory !== 'series' && selectedCategory !== 'all') {
      return { hasNew: false, count: 0 };
    }

    if (!lastFetchTimeRef.current) {
      // 如果从未加载过，执行完整加载
      await loadSeries(1, false);
      return { hasNew: true, count: 0 };
    }

    console.log('[useCommunitySeries] 🔄 Checking for new data since:', lastFetchTimeRef.current.toISOString());
    setIsPullingToRefresh(true);

    try {
      const result = await communityAPI.getCommunitySeries({
        page: 1,
        limit: 50, // 获取更多以确保覆盖所有新数据
        sort: sortBy as 'latest' | 'popular',
        search: searchQuery || undefined,
        userPhone: userPhone,
        since: lastFetchTimeRef.current.toISOString(), // 🔥 只获取此时间之后的数据
      });

      if (result.success && result.data && result.data.length > 0) {
        console.log(`[useCommunitySeries] ✨ Found ${result.data.length} new items`);
        
        // 🔥 增量合并：将新数据添加到列表前面
        setSeries(prev => {
          const existingIds = new Set(prev.map(s => s.id));
          const newItems = result.data.filter(item => !existingIds.has(item.id));
          
          if (newItems.length > 0) {
            console.log(`[useCommunitySeries] 📝 Adding ${newItems.length} new items to list`);
            return [...newItems, ...prev];
          }
          
          return prev;
        });
        
        // 更新交互数据
        loadInteractions(result.data);
        
        // 更新最后加载时间
        lastFetchTimeRef.current = new Date();
        
        return { hasNew: result.data.length > 0, count: result.data.length };
      } else {
        console.log('[useCommunitySeries] ✅ No new data');
        return { hasNew: false, count: 0 };
      }
    } catch (err: any) {
      console.error('[useCommunitySeries] Refresh error:', err);
      return { hasNew: false, count: 0 };
    } finally {
      setIsPullingToRefresh(false);
    }
  }, [selectedCategory, sortBy, searchQuery, userPhone]);

  // 加载交互数据
  const loadInteractions = (seriesList: CommunitySeriesWork[]) => {
    seriesList.forEach((s) => {
      setInteractions(prev => new Map(prev).set(s.id, {
        likes: s.likes || 0,
        shares: s.shares || 0,
        comments: s.comments || 0, // 从API获取
        isLiked: s.isLiked || false, // 从API获取
      }));
    });
  };

  // 加载更多
  const loadMoreSeries = () => {
    if (!isLoadingMore && hasMore) {
      loadSeries(page + 1, true);
    }
  };

  // 🆕 手动刷新（强制重新加载）
  const refresh = useCallback(async () => {
    console.log('[useCommunitySeries] 🔄 Manual refresh triggered');
    lastLoadParamsRef.current = ''; // 清除缓存标记
    hasLoadedRef.current = false;
    await loadSeries(1, false);
  }, [selectedCategory, sortBy, searchQuery, userPhone]);

  // 🔥 移除自动加载 - 改为手动触发
  // 当筛选条件改变时，不自动加载，只清空数据
  useEffect(() => {
    if (selectedCategory !== 'series' && selectedCategory !== 'all') {
      setSeries([]);
      setHasMore(false);
      hasLoadedRef.current = false;
    }
    // 🔥 不自动调用 loadSeries
  }, [selectedCategory, sortBy, searchQuery, userPhone]);

  return {
    series,
    isLoading,
    isLoadingMore,
    interactions,
    setInteractions,
    hasMore,
    error,
    loadSeries,
    loadMoreSeries,
    refresh, // 🆕 暴露手动刷新方法
    refreshNewData, // 🆕 增量刷新方法
    isPullingToRefresh, // 🆕 下拉刷新状态
  };
}