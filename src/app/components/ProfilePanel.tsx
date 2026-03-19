/**
 * ProfilePanel — v6.0.98: QuotaCard + onOpenPayment/onOpenAdmin props
 */
import { useState, useEffect } from 'react';
import { AnimatePresence } from 'motion/react';
import { toast } from 'sonner';
import { ProfileHeader, ProfileStats, ProfileWorksList, QuotaCard } from './profile';
import { SeriesViewer } from './community/SeriesViewer';
import * as communityAPI from '../services';
import * as seriesAPI from '../services';
import { getSeriesDetail } from '../services';
import { normalizeWorks, convertWorkToComic } from '../utils';
import type { RawWork } from '../utils';
import { useVideoQuota } from '../hooks/useVideoQuota';
import { getErrorMessage } from '../utils';
import type { Comic, CommunitySeriesWork } from '../types/index';
import type { Series } from '../types';

interface ProfilePanelProps {
  userPhone: string;
  onSelectComic: (comic: Comic, comicsList?: Comic[]) => void;
  onLogout: () => void;
  /** v6.0.98: Open PaymentDialog */
  onOpenPayment?: () => void;
  /** v6.0.98: Open AdminPanel (only passed when user is admin, verified server-side) */
  onOpenAdmin?: () => void;
}

export function ProfilePanel({ userPhone, onSelectComic, onLogout, onOpenPayment, onOpenAdmin }: ProfilePanelProps) {
  // 用户信息状态
  const [userNickname, setUserNickname] = useState<string>('');
  
  // 作品列表状态
  const [works, setWorks] = useState<RawWork[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasInitialLoad, setHasInitialLoad] = useState(false);
  const [isOffline, setIsOffline] = useState(false);
  
  // 🆕 剧列查看器状态
  const [selectedSeriesForViewer, setSelectedSeriesForViewer] = useState<CommunitySeriesWork | null>(null);
  
  // 分页状态
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const ITEMS_PER_PAGE = 10;
  
  // 统计数据
  const [stats, setStats] = useState({
    totalWorks: 0,
    totalLikes: 0,
    totalViews: 0,
  });

  // 加载用户资料
  useEffect(() => {
    loadUserProfile();
  }, [userPhone]);

  // 加载用户作品
  useEffect(() => {
    loadUserWorks();
  }, [userPhone]);

  // 轮询生成中的作品状态
  useEffect(() => {
    const pendingWorks = works.filter(work => 
      work.status === 'pending' || work.status === 'processing'
    );
    
    if (pendingWorks.length === 0) {
      return;
    }
    
    const intervalId = setInterval(() => {
      updatePendingTasksStatus();
    }, 10000); // 每10秒检查一次
    
    return () => {
      clearInterval(intervalId);
    };
  }, [works, userPhone]);

  const loadUserProfile = async () => {
    try {
      const result = await communityAPI.getUserProfile(userPhone);
      if (result && result.success && result.user) {
        setUserNickname(result.user.nickname || `用户${userPhone.slice(-4)}`);
      } else {
        setUserNickname(`用户${userPhone.slice(-4)}`);
      }
    } catch (error: unknown) {
      setUserNickname(`用户${userPhone.slice(-4)}`);
    }
  };

  const loadUserWorks = async () => {
    setIsLoading(true);
    
    try {
      // 🔥 同时加载影视作品和社区作品
      const [seriesResult, communityResult] = await Promise.all([
        seriesAPI.getUserSeries(userPhone),
        communityAPI.getUserWorks(userPhone, page, ITEMS_PER_PAGE)
      ]);
      
      const allWorks: RawWork[] = [];
      
      // 1️⃣ 添加影视作品数据
      if (seriesResult.success && seriesResult.data && Array.isArray(seriesResult.data)) {
        const seriesWorks = seriesResult.data.map((series: Series) => ({
          id: series.id,
          task_id: series.id,
          type: 'series', // 标记为影视系列类型
          title: series.title,
          description: series.description,
          // ✅ 修复：同时设置 thumbnail 和 coverImage 字段
          thumbnail: series.coverImage || series.cover_image_url || series.cover_image || '',
          coverImage: series.coverImage || series.cover_image_url || series.cover_image || '',
          videoUrl: '', // 影视系列暂不支持直接播放
          // ✅ 修复：显示正确的状态
          status: series.status === 'completed' ? 'completed' : (series.status === 'generating' ? 'processing' : series.status),
          createdAt: series.createdAt || series.created_at,
          created_at: series.createdAt || series.created_at,
          publishedAt: series.updatedAt || series.updated_at,
          likes: 0,
          views: 0,
          likes_count: 0,
          comments_count: 0,
          // ✅ 修复：传递 totalEpisodes 和 completedEpisodes
          totalEpisodes: series.totalEpisodes || series.total_episodes || 0,
          completedEpisodes: series.completedEpisodes || series.completed_episodes || 0,
          seriesData: series, // 保存完整的影视作品数据
        }));
        
        allWorks.push(...seriesWorks);
      }
      
      // 2️⃣ 添加社区作品数据（过滤掉影视系列的分镜任务，只保留独立视频）
      if (communityResult.success && communityResult.works && Array.isArray(communityResult.works)) {
        const normalizedWorks = normalizeWorks(communityResult.works);
        // v6.0.19: 过滤掉属于影视系列的分镜任务
        const independentWorks = normalizedWorks.filter((work: RawWork) => {
          if (work.type === 'series') return false;
          if (work.metadata) {
            try {
              const meta = typeof work.metadata === 'string' ? JSON.parse(work.metadata) : work.metadata;
              if (meta.seriesId) return false;
            } catch { /* keep */ }
          }
          return true;
        });
        
        allWorks.push(...independentWorks);
      }
      
      // 去重（基于ID）
      const uniqueWorksMap = new Map<string, RawWork>();
      allWorks.forEach((work: RawWork) => {
        const workId = work.task_id || work.id;
        const existingWork = uniqueWorksMap.get(workId);
        
        if (!existingWork || 
            (work.status === 'completed' && existingWork.status !== 'completed') ||
            (work.publishedAt > existingWork.publishedAt)) {
          uniqueWorksMap.set(workId, work);
        }
      });
      
      const deduplicatedWorks = Array.from(uniqueWorksMap.values());
      
      setWorks(deduplicatedWorks);
      
      // 更新统计
      updateStats(deduplicatedWorks);
      
      // 分页断（仅针对社区作品）
      setHasMore(communityResult.works?.length >= ITEMS_PER_PAGE);
    } catch (error: unknown) {
      console.error('[ProfilePanel] ❌ Failed to load works:', error);
      const errMsg = getErrorMessage(error);
      setError(errMsg);
      
      // 🔥 v4.2.66: 检测离线模式
      if (errMsg.includes('offline') || 
          errMsg.includes('timeout') || 
          errMsg.includes('Network error')) {
        console.warn('[ProfilePanel] 🔌 Entering offline mode');
        setIsOffline(true);
      }
      
      setWorks([]);
      updateStats([]);
    } finally {
      setIsLoading(false);
      setHasInitialLoad(true);
    }
  };

  const loadMoreWorks = async () => {
    if (isLoadingMore || !hasMore) return;
    
    setIsLoadingMore(true);
    const nextPage = page + 1;
    
    try {
      const result = await communityAPI.getUserWorks(userPhone, nextPage, ITEMS_PER_PAGE);
      
      if (result.success && result.works && Array.isArray(result.works)) {
        const normalizedWorks = normalizeWorks(result.works);
        // v6.0.19: 过滤掉属于影视系列的分镜任务
        const independentWorks = normalizedWorks.filter((work: RawWork) => {
          if (work.type === 'series') return false;
          if (work.metadata) {
            try {
              const meta = typeof work.metadata === 'string' ? JSON.parse(work.metadata) : work.metadata;
              if (meta.seriesId) return false;
            } catch { /* keep */ }
          }
          return true;
        });
        const allWorks = [...works, ...independentWorks];
        
        // 去重
        const uniqueWorksMap = new Map<string, RawWork>();
        allWorks.forEach((work: RawWork) => {
          const workId = work.task_id || work.id;
          if (!uniqueWorksMap.has(workId)) {
            uniqueWorksMap.set(workId, work);
          }
        });
        
        const deduplicatedWorks = Array.from(uniqueWorksMap.values());
        
        setWorks(deduplicatedWorks);
        setPage(nextPage);
        setHasMore(result.works.length >= ITEMS_PER_PAGE);
        updateStats(deduplicatedWorks);
      }
    } catch (error: unknown) {
      console.error('[ProfilePanel] Failed to load more:', error);
    } finally {
      setIsLoadingMore(false);
    }
  };

  const updatePendingTasksStatus = async () => {
    const pendingWorks = works.filter(work => 
      work.status === 'pending' || work.status === 'processing'
    );
    
    if (pendingWorks.length === 0) return;
    
    try {
      const taskIds = pendingWorks.map(work => work.task_id || work.id);
      const result = await communityAPI.getTaskStatus(taskIds);
      
      if (result.success && result.statuses) {
        const updatedWorks = works.map(work => {
          const taskStatus = result.statuses.find(
            status => status.task_id === work.task_id || status.task_id === work.id
          );
          
          if (taskStatus) {
            return {
              ...work,
              status: taskStatus.status,
              videoUrl: taskStatus.videoUrl || work.videoUrl,
              thumbnail: taskStatus.thumbnail || work.thumbnail,
              duration: taskStatus.duration || work.duration,
              publishedAt: taskStatus.publishedAt || work.publishedAt,
            };
          }
          
          return work;
        });
        
        setWorks(updatedWorks);
        updateStats(updatedWorks);
      }
    } catch (error: unknown) {
      console.error('[ProfilePanel] Error updating task statuses:', error);
    }
  };

  // const filterExpiredVideos function definition removed - was a noop (always returned true)

  const updateStats = (worksList: RawWork[]) => {
    const totalLikes = worksList.reduce((sum, work) => sum + (work.likes || 0), 0);
    const totalViews = worksList.reduce((sum, work) => sum + (work.views || 0), 0);
    
    setStats({
      totalWorks: worksList.length,
      totalLikes,
      totalViews,
    });
  };

  const handleSelectWork = (work: RawWork, worksList?: RawWork[]) => {
    // 🔥 关键修复：影视系列类型使用 SeriesViewer，而非 ImmersiveVideoViewer
    if (work.type === 'series') {
      openSeriesViewer(work);
      return;
    }
    
    // 普通视频作品 → ImmersiveVideoViewer
    const comic = convertWorkToComic(work);
    const comicsList = (worksList || works)
      .filter((w: RawWork) => w.type !== 'series') // 排除影视系列
      .map(convertWorkToComic);
    onSelectComic(comic, comicsList);
  };

  // 🆕 打开影视系列查看器
  const openSeriesViewer = async (work: RawWork) => {
    try {
      const seriesId = work.id || work.seriesData?.id;
      if (!seriesId) {
        toast.error('无法打开作品：缺少ID');
        return;
      }
      
      const result = await getSeriesDetail(seriesId, userPhone);
      if (result.success && result.data) {
        setSelectedSeriesForViewer(result.data);
      } else {
        // 如果社区API失败，用本地数据构造基本视图
        toast.error('加载作品详情失败，请稍后重试');
      }
    } catch (error: unknown) {
      console.error('[ProfilePanel] Failed to open series viewer:', error);
      toast.error('无法加载系列详情');
    }
  };

  const handleRefresh = () => {
    setIsOffline(false); // 🔥 v4.2.66: 清除离线状态
    setPage(1);
    setHasMore(true);
    loadUserWorks();
  };

  // v6.0.98: 配额信息
  const { quota, isLoading: isQuotaLoading } = useVideoQuota(userPhone);

  return (
    <div className="flex-1 overflow-y-auto p-3 sm:p-6 space-y-4 sm:space-y-6">
      <ProfileHeader
        userPhone={userPhone}
        userNickname={userNickname}
        onNicknameChange={setUserNickname}
        onLogout={onLogout}
      />

      {/* v6.0.98: 配额卡片 — 显示今日用量 + 购买入口（含移动端管理员入口） */}
      <QuotaCard
        quota={quota}
        isLoading={isQuotaLoading}
        onOpenPayment={onOpenPayment}
        onOpenAdmin={onOpenAdmin}
      />

      <ProfileStats
        totalWorks={stats.totalWorks}
        totalLikes={stats.totalLikes}
        totalViews={stats.totalViews}
      />

      <ProfileWorksList
        works={works}
        isLoading={isLoading && !hasInitialLoad}
        hasMore={hasMore}
        isLoadingMore={isLoadingMore}
        isOffline={isOffline}
        onSelectWork={handleSelectWork}
        onLoadMore={loadMoreWorks}
        onRefresh={handleRefresh}
      />

      {/* 🆕 影视系列查看器 */}
      <AnimatePresence>
        {selectedSeriesForViewer && (
          <SeriesViewer
            series={selectedSeriesForViewer}
            userPhone={userPhone}
            onClose={() => setSelectedSeriesForViewer(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}