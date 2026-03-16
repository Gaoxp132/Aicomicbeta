/**
 * Community hooks - Comments, Works, Interactions, Series, Like
 * Split from consolidated hooks/index.ts (v6.0.67)
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { toast } from 'sonner';
import { markNetworkSuccess, convertWorkToComic, shareContent, getErrorMessage } from '../utils';
import * as communityAPI from '../services';
import type { Comic, CommunitySeriesWork } from '../types';

// ═══════════════════════════════════════════════════════════════════
// [3] useComments
// ═══════════════════════════════════════════════════════════════════

export function useComments(workId: string, userPhone?: string) {
  const [comments, setComments] = useState<any[]>([]);
  const [commentText, setCommentText] = useState('');
  const [isLoadingComments, setIsLoadingComments] = useState(false);
  const [showComments, setShowComments] = useState(false);

  useEffect(() => { if (showComments) loadComments(); }, [showComments]);

  const loadComments = async () => {
    setIsLoadingComments(true);
    try { const result = await communityAPI.getComments(workId); setComments(result.comments || []); }
    catch (error: unknown) { console.error('[useComments] Failed to load comments:', error); }
    finally { setIsLoadingComments(false); }
  };

  const handleComment = async () => {
    if (!userPhone || !commentText.trim()) return;
    try { await communityAPI.addComment(userPhone, workId, commentText); setCommentText(''); loadComments(); }
    catch (error: unknown) { console.error('[useComments] Comment failed:', error); }
  };

  const toggleComments = () => { setShowComments(!showComments); };

  return { comments, commentText, setCommentText, isLoadingComments, showComments, setShowComments, toggleComments, handleComment, loadComments };
}

// ═══════════════════════════════════════════════════════════════════
// [4] useCommunityWorks
// ═══════════════════════════════════════════════════════════════════

export interface WorkInteractions { likes: number; shares: number; comments: number; isLiked: boolean; }

interface UseCommunityWorksProps { selectedCategory: string; sortBy: string; searchQuery: string; userPhone?: string; }

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

  const loadInteractions = (worksList: any[]) => {
    worksList.forEach((work: any) => {
      setInteractions(prev => new Map(prev).set(work.id, { likes: work.likes || 0, shares: work.shares || 0, comments: work.comments || 0, isLiked: false }));
      if (userPhone) {
        communityAPI.getLikeStatus(work.id, userPhone).then(res => {
          if (res.success) { setInteractions(prev => { const m = new Map(prev); const c = m.get(work.id); if (c) m.set(work.id, { ...c, isLiked: res.isLiked, likes: res.likes }); return m; }); }
        }).catch(() => {});
      }
    });
  };

  const refreshNewWorks = async () => {
    if (!hasInitialLoad || !lastLoadTime) return loadWorks();
    setIsRefreshing(true);
    try {
      const result = await communityAPI.getCommunityWorks({ category: selectedCategory === 'all' ? undefined : selectedCategory, sort: sortBy, search: searchQuery || undefined, since: lastLoadTime.toISOString() });
      if (result.success && result.works && result.works.length > 0) {
        const validWorks = result.works.filter((work: any) => { const key = work.task_id || work.id; if (!key) return false; if (!work.id || work.id !== work.task_id) work.id = work.task_id; return true; });
        setWorks(prev => { const existingTaskIds = new Set(prev.map(w => w.task_id || w.id)); const newWorks = validWorks.filter((w: any) => !existingTaskIds.has(w.task_id || w.id)); return [...newWorks, ...prev]; });
        loadInteractions(validWorks);
        if (validWorks.length > 0) setLastLoadTime(new Date(validWorks[0].created_at));
      }
    } catch (error: unknown) { console.error('[useCommunityWorks] Failed to refresh new works:', error); }
    finally { setIsRefreshing(false); }
  };

  const loadWorks = async (isRetry: boolean = false) => {
    if (!isRetry) { setIsLoading(true); setError(null); }
    try {
      const result = await communityAPI.getCommunityWorks({ page: 1, limit: 20, category: selectedCategory === 'all' ? undefined : selectedCategory, sort: sortBy, search: searchQuery || undefined });
      if (result.success && result.works) {
        const seenKeys = new Set<string>();
        const uniqueWorks = result.works.filter((work: any) => { const key = work.task_id || work.id; if (!key) return false; if (seenKeys.has(key)) return false; seenKeys.add(key); if (!work.id || work.id !== work.task_id) work.id = work.task_id; return true; });
        setWorks(uniqueWorks); setPage(1); setHasMore(result.hasMore); setError(null); setRetryCount(0);
        loadInteractions(uniqueWorks);
      }
    } catch (error: unknown) {
      console.error('[useCommunityWorks] Failed to load community works:', error);
      const errorMessage = error instanceof Error && error.name === 'NetworkError' ? error.message : error instanceof Error && error.name === 'TimeoutError' ? error.message : '加载社区作品失败，请稍后重试';
      setError(errorMessage);
      if (retryCount < 2 && !isRetry) { setRetryCount(prev => prev + 1); setTimeout(() => loadWorks(true), 3000); }
    } finally { setIsLoading(false); setHasInitialLoad(true); setLastLoadTime(new Date()); }
  };

  const loadMoreWorks = async () => {
    setIsLoadingMore(true);
    try {
      const result = await communityAPI.getCommunityWorks({ page: page + 1, limit: 50, category: selectedCategory, sort: sortBy, search: searchQuery });
      if (result.success) {
        const validWorks = result.works.filter((work: any) => { const key = work.task_id || work.id; if (!key) return false; if (!work.id || work.id !== work.task_id) work.id = work.task_id; return true; });
        setWorks(prev => { const existingIds = new Set(prev.map(w => w.id || w.task_id)); const newWorks = validWorks.filter((w: any) => !existingIds.has(w.id || w.task_id)); return [...prev, ...newWorks]; });
        loadInteractions(validWorks);
        if (validWorks.length < 50) setHasMore(false);
        setPage(prev => prev + 1);
      }
    } catch (error: unknown) { console.error('[useCommunityWorks] Failed to load more community works:', error); }
    finally { setIsLoadingMore(false); }
  };

  useEffect(() => { loadWorks(); }, [selectedCategory, sortBy]);
  useEffect(() => { const timer = setTimeout(() => { if (searchQuery !== undefined) loadWorks(); }, 500); return () => clearTimeout(timer); }, [searchQuery]);

  return { works, isLoading, isLoadingMore, isRefreshing, interactions, setInteractions, hasMore, error, retryCount, hasInitialLoad, loadWorks, loadMoreWorks, refreshNewWorks };
}

// ═══════════════════════════════════════════════════════════════════
// [5] useCommunityInteractions
// ═══════════════════════════════════════════════���═══════════════════

interface UseCommunityInteractionsProps { userPhone?: string; onSelectComic: (comic: Comic, comicsList?: Comic[]) => void; }

export function useCommunityInteractions({ userPhone, onSelectComic }: UseCommunityInteractionsProps) {
  const handleLike = async (workId: string, e: React.MouseEvent, setInteractions: React.Dispatch<React.SetStateAction<Map<string, WorkInteractions>>>) => {
    e.stopPropagation();
    if (!userPhone) return;
    try {
      const result = await communityAPI.toggleLike(userPhone, workId);
      if (result.success) { setInteractions(prev => { const m = new Map(prev); const c = m.get(workId); if (c) m.set(workId, { ...c, isLiked: result.isLiked, likes: result.likes }); return m; }); }
    } catch (error: unknown) { console.error('Failed to toggle like:', error); }
  };

  const handleComment = (work: any, works: any[], e: React.MouseEvent) => { e.stopPropagation(); handleWorkClick(work, works); };

  const handleShare = async (workId: string, e: React.MouseEvent, setInteractions: React.Dispatch<React.SetStateAction<Map<string, WorkInteractions>>>, workTitle?: string) => {
    e.stopPropagation();
    const result = await shareContent({ title: workTitle || 'AI漫剧作品', text: workTitle ? `${workTitle} - 快来看看这部AI漫剧!` : '快来看看这部AI漫剧!', url: window.location.href });
    if (result === 'cancelled') return;
    if (result === 'copied') toast.success('链接已复制到剪贴板');
    else if (result === 'shared') toast.success('分享成功');
    else { toast.error('分享失败，请手动复制链接'); return; }
    try {
      await communityAPI.incrementShares(workId);
      setInteractions(prev => { const m = new Map(prev); const c = m.get(workId); if (c) m.set(workId, { ...c, shares: c.shares + 1 }); return m; });
    } catch (error: unknown) { console.error('Failed to increment share count:', error); }
  };

  const handleWorkClick = (work: any, works: any[]) => {
    communityAPI.incrementViews(work.id).catch(() => {});
    const comic: Comic = convertWorkToComic(work);
    const comicsList: Comic[] = works.map(convertWorkToComic);
    onSelectComic(comic, comicsList);
  };

  return { handleLike, handleComment, handleShare, handleWorkClick };
}

// ═══════════════════════════════════════════════════════════════════
// [6] useCommunitySeries
// ═══════════════════════════════════════════════════════════════════

interface UseCommunitySeriesProps { selectedCategory: string; sortBy: string; searchQuery: string; userPhone?: string; }
interface SeriesInteractions { likes: number; shares: number; comments: number; isLiked: boolean; }

export function useCommunitySeries({ selectedCategory, sortBy, searchQuery, userPhone }: UseCommunitySeriesProps) {
  const [series, setSeries] = useState<CommunitySeriesWork[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [interactions, setInteractions] = useState<Map<string, SeriesInteractions>>(new Map());
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const lastLoadParamsRef = useRef<string>('');
  const hasLoadedRef = useRef(false);
  const lastFetchTimeRef = useRef<Date | null>(null);
  const [isPullingToRefresh, setIsPullingToRefresh] = useState(false);

  const loadSeries = async (pageNum: number = 1, append: boolean = false) => {
    if (selectedCategory !== 'series' && selectedCategory !== 'all') { setSeries([]); return; }
    const paramsFingerprint = `${selectedCategory}-${sortBy}-${searchQuery}-${pageNum}`;
    if (!append && lastLoadParamsRef.current === paramsFingerprint && hasLoadedRef.current) return;
    if (pageNum === 1) setIsLoading(true); else setIsLoadingMore(true);
    try {
      const result = await communityAPI.getCommunitySeries({ page: pageNum, limit: 20, sort: sortBy as 'latest' | 'popular', search: searchQuery || undefined, userPhone });
      if (result.success) {
        const newSeries = result.data || [];
        if (append) setSeries(prev => [...prev, ...newSeries]); else { setSeries(newSeries); lastFetchTimeRef.current = new Date(); }
        setHasMore(result.hasMore); setPage(result.page); setError(null);
        loadSeriesInteractions(newSeries);
        lastLoadParamsRef.current = paramsFingerprint; hasLoadedRef.current = true;
      } else {
        if (result.error && !result.error.includes('Failed to fetch')) setError(result.error);
        else { setSeries([]); setError(null); }
      }
    } catch (err: unknown) {
      console.error('[useCommunitySeries] Load error:', err);
      const errMsg = getErrorMessage(err);
      if (errMsg.includes('Failed to fetch')) { setSeries([]); setError(null); } else setError(errMsg || '加载漫剧系列失败');
    } finally { setIsLoading(false); setIsLoadingMore(false); }
  };

  const refreshNewData = useCallback(async () => {
    if (selectedCategory !== 'series' && selectedCategory !== 'all') return { hasNew: false, count: 0 };
    if (!lastFetchTimeRef.current) { await loadSeries(1, false); return { hasNew: true, count: 0 }; }
    setIsPullingToRefresh(true);
    try {
      const result = await communityAPI.getCommunitySeries({ page: 1, limit: 50, sort: sortBy as 'latest' | 'popular', search: searchQuery || undefined, userPhone, since: lastFetchTimeRef.current.toISOString() });
      if (result.success && result.data && result.data.length > 0) {
        setSeries(prev => { const existingIds = new Set(prev.map(s => s.id)); const newItems = result.data.filter(item => !existingIds.has(item.id)); return newItems.length > 0 ? [...newItems, ...prev] : prev; });
        loadSeriesInteractions(result.data); lastFetchTimeRef.current = new Date();
        return { hasNew: result.data.length > 0, count: result.data.length };
      }
      return { hasNew: false, count: 0 };
    } catch (err: unknown) { console.error('[useCommunitySeries] Refresh error:', err); return { hasNew: false, count: 0 }; }
    finally { setIsPullingToRefresh(false); }
  }, [selectedCategory, sortBy, searchQuery, userPhone]);

  const loadSeriesInteractions = (seriesList: CommunitySeriesWork[]) => {
    seriesList.forEach(s => { setInteractions(prev => new Map(prev).set(s.id, { likes: s.likes || 0, shares: s.shares || 0, comments: s.comments || 0, isLiked: s.isLiked || false })); });
  };

  const loadMoreSeries = () => { if (!isLoadingMore && hasMore) loadSeries(page + 1, true); };

  const refresh = useCallback(async () => { lastLoadParamsRef.current = ''; hasLoadedRef.current = false; await loadSeries(1, false); }, [selectedCategory, sortBy, searchQuery, userPhone]);

  useEffect(() => {
    if (selectedCategory !== 'series' && selectedCategory !== 'all') { setSeries([]); setHasMore(false); hasLoadedRef.current = false; }
    else loadSeries(1, false);
  }, [selectedCategory, sortBy, searchQuery, userPhone]);

  return { series, isLoading, isLoadingMore, interactions, setInteractions, hasMore, error, loadSeries, loadMoreSeries, refresh, refreshNewData, isPullingToRefresh };
}

// ═══════════════════════════════════════════════════════════════════
// [9] useLike
// ═══════════════════════════════════════════════════════════════════

export function useLike(workId: string, userPhone?: string) {
  const [isLiked, setIsLiked] = useState(false);
  const [likes, setLikes] = useState(0);

  useEffect(() => { if (userPhone) loadLikeStatus(); }, [workId, userPhone]);

  const loadLikeStatus = async () => {
    if (!userPhone) return;
    try { const result = await communityAPI.getLikeStatus(workId, userPhone); if (result.success) { setIsLiked(result.isLiked); setLikes(result.likes); } }
    catch (error: unknown) { console.error('加载点赞状态失败:', error); }
  };

  const handleLike = async () => {
    if (!userPhone) return;
    try { const result = await communityAPI.toggleLike(userPhone, workId); setIsLiked(result.isLiked); setLikes(result.likes); }
    catch (error: unknown) { console.error('[useLike] Like operation failed:', error); }
  };

  return { isLiked, likes, handleLike, loadLikeStatus };
}