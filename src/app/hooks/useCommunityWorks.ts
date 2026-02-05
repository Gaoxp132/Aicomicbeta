import { useState, useEffect, useRef } from 'react';
import * as communityAPI from '../services/community';

export interface WorkInteractions {
  likes: number;
  shares: number;
  comments: number;
  isLiked: boolean;
}

export interface UseCommunityWorksProps {
  selectedCategory: string;
  sortBy: string;
  searchQuery: string;
  userPhone?: string;
}

export function useCommunityWorks({ selectedCategory, sortBy, searchQuery, userPhone }: UseCommunityWorksProps) {
  const [works, setWorks] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [interactions, setInteractions] = useState<Map<string, WorkInteractions>>(new Map());
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [lastLoadTime, setLastLoadTime] = useState<Date | null>(null);
  const [hasInitialLoad, setHasInitialLoad] = useState(false);

  // 过滤掉使用火山引擎URL的过期视频
  const filterExpiredVideos = (worksList: any[]) => {
    return worksList.filter((work: any) => {
      const videoUrl = work.video_url || work.videoUrl || '';
      
      if (!videoUrl) return true;
      if (videoUrl.includes('aliyuncs.com') || videoUrl.includes('oss-')) return true;
      
      if (videoUrl.includes('volces.com') || videoUrl.includes('tos-cn-beijing')) {
        console.log(`[CommunityPanel] 🗑️ Filtering expired video: ${work.title?.substring(0, 40)}...`);
        return false;
      }
      
      return true;
    });
  };

  // 加载每个作品的互动数据
  const loadInteractions = (worksList: any[]) => {
    worksList.forEach((work: any) => {
      setInteractions(prev => new Map(prev).set(work.id, {
        likes: work.likes || 0,
        shares: work.shares || 0,
        comments: work.comments || 0,
        isLiked: false,
      }));
      
      if (userPhone) {
        communityAPI.getLikeStatus(work.id, userPhone).then(res => {
          if (res.success) {
            setInteractions(prev => {
              const newMap = new Map(prev);
              const current = newMap.get(work.id);
              if (current) {
                newMap.set(work.id, { ...current, isLiked: res.isLiked, likes: res.likes });
              }
              return newMap;
            });
          }
        }).catch(() => {});
      }
    });
  };

  // 增量刷新：只加载新作品
  const refreshNewWorks = async () => {
    if (!hasInitialLoad || !lastLoadTime) {
      return loadWorks();
    }
    
    setIsRefreshing(true);
    
    try {
      console.log('[CommunityPanel] 🔄 Refreshing new works since:', lastLoadTime.toISOString());
      
      const result = await communityAPI.getCommunityWorks({
        category: selectedCategory === 'all' ? undefined : selectedCategory,
        sort: sortBy,
        search: searchQuery || undefined,
        since: lastLoadTime.toISOString(),
      });

      if (result.success && result.works && result.works.length > 0) {
        console.log('[CommunityPanel] ✅ Found', result.works.length, 'new works');
        
        // 🔧 确保每个work都有唯一的id
        const validWorks = result.works.filter((work: any) => {
          const key = work.task_id || work.id;
          if (!key) {
            console.warn(`[CommunityPanel] ⚠️ Work missing both task_id and id in refresh, skipping`);
            return false;
          }
          
          // 确保每个 work 都有唯一的 id (使用 task_id)
          if (!work.id || work.id !== work.task_id) {
            work.id = work.task_id;
          }
          
          return true;
        });
        
        const filteredNewWorks = filterExpiredVideos(validWorks);
        
        setWorks(prev => {
          const existingTaskIds = new Set(prev.map(w => w.task_id || w.id));
          const newWorks = filteredNewWorks.filter((w: any) => !existingTaskIds.has(w.task_id || w.id));
          return [...newWorks, ...prev];
        });
        
        loadInteractions(filteredNewWorks);
        
        if (filteredNewWorks.length > 0) {
          const latestWorkTime = new Date(filteredNewWorks[0].created_at);
          setLastLoadTime(latestWorkTime);
        }
      } else {
        console.log('[CommunityPanel] No new works found');
      }
    } catch (error: any) {
      console.error('[CommunityPanel] Failed to refresh new works:', error);
    } finally {
      setIsRefreshing(false);
    }
  };

  // 加载社区作品
  const loadWorks = async (isRetry: boolean = false) => {
    if (!isRetry) {
      setIsLoading(true);
      setError(null);
    }
    
    try {
      const result = await communityAPI.getCommunityWorks({
        page: 1,
        limit: 20,
        category: selectedCategory === 'all' ? undefined : selectedCategory,
        sort: sortBy,
        search: searchQuery || undefined,
      });

      console.log('[CommunityPanel] Received result:', result);
      console.log('[CommunityPanel] result.success:', result.success);
      console.log('[CommunityPanel] result.works:', result.works);

      if (result.success && result.works) {
        // 🔧 修复：使用 taskId 和 id 的组合去重
        const seenKeys = new Set<string>();
        const uniqueWorks = result.works.filter((work: any) => {
          // 使用 task_id 作为主要标识符
          const key = work.task_id || work.id;
          
          // 🔧 安全检查：如果没有有效的key，跳过这个work
          if (!key) {
            console.warn(`[CommunityPanel] ⚠️ Work missing both task_id and id, skipping`);
            return false;
          }
          
          if (seenKeys.has(key)) {
            console.log(`[CommunityPanel] 🗑️ Filtering duplicate key: ${key}`);
            return false;
          }
          
          seenKeys.add(key);
          
          // 确保每个 work 都有唯一的 id (使用 task_id)
          if (!work.id || work.id !== work.task_id) {
            work.id = work.task_id;
          }
          
          return true;
        });
        
        const filteredWorks = filterExpiredVideos(uniqueWorks);
        
        if (filteredWorks.length < uniqueWorks.length) {
          console.log(`[CommunityPanel] ⚠️ Filtered out ${uniqueWorks.length - filteredWorks.length} expired videos`);
        }
        
        setWorks(filteredWorks);
        setPage(1);
        setHasMore(result.hasMore);
        setError(null);
        setRetryCount(0);

        loadInteractions(filteredWorks);
        
        if (!isRetry) {
          console.log('[CommunityPanel] Successfully loaded', filteredWorks.length, 'works');
        }
      }
    } catch (error: any) {
      console.error('[CommunityPanel] Failed to load community works:', error);
      const errorMessage = error.name === 'NetworkError' 
        ? error.message 
        : error.name === 'TimeoutError'
        ? error.message
        : '加载社区作品失败，请稍后重试';
      
      setError(errorMessage);
      
      if (retryCount < 2 && !isRetry) {
        console.log(`[CommunityPanel] Retrying (attempt ${retryCount + 1}/2)...`);
        setRetryCount(prev => prev + 1);
        setTimeout(() => loadWorks(true), 3000);
      } else if (retryCount >= 2) {
        console.error('[CommunityPanel] Max retries reached, showing error to user');
      }
    } finally {
      setIsLoading(false);
      setHasInitialLoad(true);
      setLastLoadTime(new Date());
    }
  };

  // 加载更多作品
  const loadMoreWorks = async () => {
    setIsLoadingMore(true);
    try {
      const result = await communityAPI.getCommunityWorks({
        page: page + 1,
        limit: 50,
        category: selectedCategory,
        sort: sortBy,
        search: searchQuery,
      });

      if (result.success) {
        // 🔧 确保每个work都有唯一的id并去重
        const validWorks = result.works.filter((work: any) => {
          const key = work.task_id || work.id;
          if (!key) {
            console.warn(`[CommunityPanel] ⚠️ Work missing both task_id and id in loadMore, skipping`);
            return false;
          }
          
          // 确保每个 work 都有唯一的 id (使用 task_id)
          if (!work.id || work.id !== work.task_id) {
            work.id = work.task_id;
          }
          
          return true;
        });
        
        // 去重：过滤掉已存在的作品
        setWorks(prev => {
          const existingIds = new Set(prev.map(w => w.id || w.task_id));
          const newWorks = validWorks.filter((w: any) => !existingIds.has(w.id || w.task_id));
          return [...prev, ...newWorks];
        });
        
        loadInteractions(validWorks);
        
        if (validWorks.length < 50) {
          setHasMore(false);
        }
        setPage(prev => prev + 1);
      }
    } catch (error) {
      console.error('Failed to load more community works:', error);
    } finally {
      setIsLoadingMore(false);
    }
  };

  // 初始加载
  useEffect(() => {
    loadWorks();
  }, [selectedCategory, sortBy]);

  // 搜索（防抖）
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchQuery !== undefined) {
        loadWorks();
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  return {
    works,
    isLoading,
    isLoadingMore,
    isRefreshing,
    interactions,
    setInteractions,
    hasMore,
    error,
    retryCount,
    hasInitialLoad,
    loadWorks,
    loadMoreWorks,
    refreshNewWorks,
  };
}