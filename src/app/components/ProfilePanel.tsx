// 重构后的ProfilePanel - 使用子组件模块化
import { useState, useEffect } from 'react';
import { ProfileHeader } from './profile/ProfileHeader';
import { ProfileStats } from './profile/ProfileStats';
import { ProfileWorksList } from './profile/ProfileWorksList';
import { SeriesDataDiagnostic } from './series/SeriesDataDiagnostic'; // 🔥 v4.2.67: 新增诊断工具
import * as communityAPI from '../services/community';
import * as seriesAPI from '../services/seriesService';
import { normalizeWorks, convertWorkToComic } from '../utils/workConverters';
import type { Comic } from '../types/index';
import type { Series } from '../types';

interface ProfilePanelProps {
  userPhone: string;
  onSelectComic: (comic: Comic, comicsList?: Comic[]) => void;
  onLogout: () => void;
}

export function ProfilePanel({ userPhone, onSelectComic, onLogout }: ProfilePanelProps) {
  // 用户信息状态
  const [userNickname, setUserNickname] = useState<string>('');
  
  // 作品列表状态
  const [works, setWorks] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasInitialLoad, setHasInitialLoad] = useState(false);
  const [isOffline, setIsOffline] = useState(false); // 🔥 v4.2.66: 新增离线状态
  
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
    
    console.log(`[ProfilePanel] Starting poll for ${pendingWorks.length} pending works`);
    
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
      console.log('[ProfilePanel] 👤 User profile result:', result);
      
      if (result && result.success && result.user) {
        setUserNickname(result.user.nickname || `用户${userPhone.slice(-4)}`);
      } else {
        console.warn('[ProfilePanel] ⚠️ Failed to load profile, using fallback');
        setUserNickname(`用户${userPhone.slice(-4)}`);
      }
    } catch (error) {
      console.error('[ProfilePanel] ❌ Failed to load profile:', error);
      setUserNickname(`用户${userPhone.slice(-4)}`);
    }
  };

  const loadUserWorks = async () => {
    setIsLoading(true);
    console.log('[ProfilePanel] 🔄 Loading all works for:', userPhone);
    
    try {
      // 🔥 同时加载漫剧和社区作品
      const [seriesResult, communityResult] = await Promise.all([
        seriesAPI.getUserSeries(userPhone),
        communityAPI.getUserWorks(userPhone, page, ITEMS_PER_PAGE)
      ]);
      
      console.log('[ProfilePanel] 📚 Series result:', JSON.stringify(seriesResult, null, 2));
      console.log('[ProfilePanel] 🎬 Community result:', JSON.stringify(communityResult, null, 2));
      
      const allWorks: any[] = [];
      
      // 1️⃣ 添加漫剧数据
      if (seriesResult.success && seriesResult.data && Array.isArray(seriesResult.data)) {
        const seriesWorks = seriesResult.data.map((series: Series) => ({
          id: series.id,
          task_id: series.id,
          type: 'series', // 标记为漫剧类型
          title: series.title,
          description: series.description,
          // ✅ 修复：同时设置 thumbnail 和 coverImage 字段
          thumbnail: series.coverImage || series.cover_image_url || series.cover_image || '',
          coverImage: series.coverImage || series.cover_image_url || series.cover_image || '',
          videoUrl: '', // 漫剧暂不支持直接播放
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
          seriesData: series, // 保存完整的漫剧数据
        }));
        
        console.log(`[ProfilePanel] ✅ Found ${seriesWorks.length} series`);
        allWorks.push(...seriesWorks);
      }
      
      // 2️⃣ 添加社区作品数据（过滤掉漫剧的分镜任务，只保留独立视频）
      if (communityResult.success && communityResult.works && Array.isArray(communityResult.works)) {
        const normalizedWorks = normalizeWorks(communityResult.works);
        
        // ✅ 过滤：排除有 metadata 中包含 seriesId 的作品（这些是漫剧的分镜任务）
        const independentWorks = normalizedWorks.filter((work: any) => {
          // 如果是漫剧类型，跳过（已经在第1步添加了）
          if (work.type === 'series') {
            return false;
          }
          
          // 如果有 seriesId metadata，说明是漫剧的分镜任务，跳过
          if (work.metadata) {
            try {
              const metadata = typeof work.metadata === 'string' ? JSON.parse(work.metadata) : work.metadata;
              if (metadata.seriesId) {
                console.log(`[ProfilePanel] 🎬 Filtering out series storyboard: ${work.title}`);
                return false;
              }
            } catch (e) {
              // metadata 解析失败，保留
            }
          }
          
          return true;
        });
        
        console.log(`[ProfilePanel] ✅ Found ${independentWorks.length} independent works (filtered ${normalizedWorks.length - independentWorks.length} series storyboards)`);
        allWorks.push(...independentWorks);
      }
      
      // 去重（基于ID）
      const uniqueWorksMap = new Map();
      allWorks.forEach((work: any) => {
        const workId = work.task_id || work.id;
        const existingWork = uniqueWorksMap.get(workId);
        
        if (!existingWork || 
            (work.status === 'completed' && existingWork.status !== 'completed') ||
            (work.publishedAt > existingWork.publishedAt)) {
          uniqueWorksMap.set(workId, work);
        }
      });
      
      const deduplicatedWorks = Array.from(uniqueWorksMap.values());
      
      // 按创建时间排序（最新的在前）
      deduplicatedWorks.sort((a, b) => {
        const timeA = new Date(a.publishedAt || a.createdAt || 0).getTime();
        const timeB = new Date(b.publishedAt || b.createdAt || 0).getTime();
        return timeB - timeA;
      });
      
      // 过滤过期视频（仅针对社区作品）
      const validWorks = deduplicatedWorks.filter(work => {
        if (work.type === 'series') {
          return true; // 漫剧不过期
        }
        return filterExpiredVideos([work]).length > 0;
      });
      
      console.log(`[ProfilePanel] 📊 Final works count: ${validWorks.length}`);
      setWorks(validWorks);
      
      // 更新统计
      updateStats(validWorks);
      
      // 分页��断（仅针对社区作品）
      setHasMore(communityResult.works?.length >= ITEMS_PER_PAGE);
    } catch (error: any) {
      console.error('[ProfilePanel] ❌ Failed to load works:', error);
      
      // 🔥 v4.2.66: 检测离线模式
      if (error.message?.includes('offline') || 
          error.message?.includes('timeout') || 
          error.message?.includes('Network error')) {
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
        const allWorks = [...works, ...normalizedWorks];
        
        // 去重
        const uniqueWorksMap = new Map();
        allWorks.forEach((work: any) => {
          const workId = work.task_id || work.id;
          if (!uniqueWorksMap.has(workId)) {
            uniqueWorksMap.set(workId, work);
          }
        });
        
        const deduplicatedWorks = Array.from(uniqueWorksMap.values());
        const validWorks = filterExpiredVideos(deduplicatedWorks);
        
        setWorks(validWorks);
        setPage(nextPage);
        setHasMore(result.works.length >= ITEMS_PER_PAGE);
        updateStats(validWorks);
      }
    } catch (error) {
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
    } catch (error) {
      console.error('[ProfilePanel] Error updating task statuses:', error);
    }
  };

  const filterExpiredVideos = (worksList: any[]) => {
    return worksList.filter(work => {
      if (work.status !== 'completed' || !work.videoUrl) {
        return true;
      }
      
      const publishedAt = work.publishedAt ? new Date(work.publishedAt) : null;
      if (!publishedAt) {
        return true;
      }
      
      const now = new Date();
      const hoursSincePublished = (now.getTime() - publishedAt.getTime()) / (1000 * 60 * 60);
      
      return hoursSincePublished < 2;
    });
  };

  const updateStats = (worksList: any[]) => {
    const totalLikes = worksList.reduce((sum, work) => sum + (work.likes || 0), 0);
    const totalViews = worksList.reduce((sum, work) => sum + (work.views || 0), 0);
    
    setStats({
      totalWorks: worksList.length,
      totalLikes,
      totalViews,
    });
  };

  const handleSelectWork = (work: any, worksList?: any[]) => {
    const comic = convertWorkToComic(work);
    const comicsList = (worksList || works).map(convertWorkToComic);
    onSelectComic(comic, comicsList);
  };

  const handleRefresh = () => {
    setIsOffline(false); // 🔥 v4.2.66: 清除离线状态
    setPage(1);
    setHasMore(true);
    loadUserWorks();
  };

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6">
      <ProfileHeader
        userPhone={userPhone}
        userNickname={userNickname}
        onNicknameChange={setUserNickname}
        onLogout={onLogout}
      />

      <ProfileStats
        totalWorks={stats.totalWorks}
        totalLikes={stats.totalLikes}
        totalViews={stats.totalViews}
      />

      {/* 🔥 v4.2.67: 数据诊断工具 - 仅在有作品时显示 */}
      {works.filter(w => w.type === 'series').length > 0 && (
        <SeriesDataDiagnostic userPhone={userPhone} />
      )}

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
    </div>
  );
}