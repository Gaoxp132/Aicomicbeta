import * as communityAPI from '../services';
import { shareContent } from '../utils';
import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Loader2, AlertCircle, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from './ui';
import { CommunityHeader, CategoryFilter, WorkCard, SeriesCard } from './community/widgets';
import type { CategoryType, SortType } from './community/widgets';
import { SeriesViewer } from './community/SeriesViewer';
import { useCommunityWorks, useCommunitySeries, useCommunityInteractions } from '../hooks';
import type { CommunitySeriesWork, Comic } from '../types';
import { getErrorMessage } from '../utils';

interface CommunityPanelProps {
  onSelectComic: (comic: Comic, comicsList?: Comic[]) => void;
  userPhone?: string;
}

export function CommunityPanel({ onSelectComic, userPhone }: CommunityPanelProps) {
  // v6.0.37: 默认选中"全部"而不是"漫剧系列"
  const [selectedCategory, setSelectedCategory] = useState<CategoryType>('all');
  const [sortBy, setSortBy] = useState<SortType>('latest');
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const [selectedSeries, setSelectedSeries] = useState<CommunitySeriesWork | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const touchStartY = useRef(0);

  // 使用自定义 hooks - 单集视频
  const {
    works,
    isLoading: isLoadingWorks,
    isLoadingMore: isLoadingMoreWorks,
    isRefreshing,
    interactions: workInteractions,
    setInteractions: setWorkInteractions,
    hasMore: hasMoreWorks,
    error: worksError,
    retryCount,
    hasInitialLoad,
    loadWorks,
    loadMoreWorks,
    refreshNewWorks,
  } = useCommunityWorks({ selectedCategory, sortBy, searchQuery, userPhone });

  // 使用自定义 hooks - 漫剧系列
  const {
    series,
    isLoading: isLoadingSeries,
    isLoadingMore: isLoadingMoreSeries,
    interactions: seriesInteractions,
    setInteractions: setSeriesInteractions,
    hasMore: hasMoreSeries,
    error: seriesError,
    loadSeries,
    loadMoreSeries,
    refreshNewData: refreshSeriesNewData, // 🆕 增量刷新
    isPullingToRefresh: isSeriesPullingToRefresh,
  } = useCommunitySeries({ selectedCategory, sortBy, searchQuery, userPhone });

  const {
    handleLike,
    handleComment,
    handleShare,
    handleWorkClick,
  } = useCommunityInteractions({ userPhone, onSelectComic });

  // 合并加载状态
  const isLoading = isLoadingWorks || isLoadingSeries;
  const isLoadingMore = isLoadingMoreWorks || isLoadingMoreSeries;
  const hasMore = hasMoreWorks || hasMoreSeries;
  const error = worksError || seriesError;
  
  // 🆕 合并下拉刷新状态
  const isPulling = isRefreshing || isSeriesPullingToRefresh;

  // 🆕 手动刷新所有数据
  const handleManualRefresh = async () => {
    toast.success('正在刷新...');
    await Promise.all([
      refreshNewWorks(),
      refreshSeriesNewData?.(), // 社区系列数据手动刷新
    ]);
    toast.success('刷新完成');
  };

  // 处理漫剧系列点击 - 🔥 修复：先获取详情再打开播放器
  const handleSeriesClick = async (clickedSeries: CommunitySeriesWork) => {
    // 🔥 先获取完整的漫剧详情（包含episodes和videoUrl）
    try {
      const result = await communityAPI.getSeriesDetail(clickedSeries.id, userPhone);
      
      if (result.success && result.data) {
        // 使用包含完整数据的详情打开播放器
        setSelectedSeries(result.data);
      } else {
        toast.error('无法加载漫剧详情');
      }
    } catch (error: unknown) {
      console.error('[CommunityPanel] Series detail error:', error);
      toast.error('加载系列详情失败: ' + getErrorMessage(error));
    }
  };

  // v6.0.18: 推荐作品导航——仅凭ID获取详情并打开播放器
  const handleNavigateToSeries = async (seriesId: string) => {
    try {
      toast('正在加载推荐作品...', { duration: 1500 });
      const result = await communityAPI.getSeriesDetail(seriesId, userPhone);
      if (result.success && result.data) {
        setSelectedSeries(result.data);
      } else {
        toast.error('无法加载推荐作品');
      }
    } catch (error: unknown) {
      console.error('[CommunityPanel] Navigate to series error:', error);
      toast.error('操作失败: ' + getErrorMessage(error));
    }
  };

  // 处理漫剧系列点赞
  const handleSeriesLike = async (seriesId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    
    if (!userPhone) {
      toast.error('请先登录');
      return;
    }

    try {
      const result = await communityAPI.likeSeries(seriesId, userPhone);
      if (result.success) {
        // 更新交互状态
        setSeriesInteractions(prev => {
          const newMap = new Map(prev);
          const current = newMap.get(seriesId);
          if (current) {
            newMap.set(seriesId, {
              ...current,
              isLiked: result.isLiked,
              likes: result.likes,
            });
          }
          return newMap;
        });
        
        toast.success(result.isLiked ? '点赞成功' : '取消点赞');
      } else {
        toast.error(result.error || '操作失败');
      }
    } catch (error: unknown) {
      console.error('[CommunityPanel] Series like error:', error);
      toast.error('点赞失败，请稍后重试');
    }
  };

  // 处理漫剧系列评论
  const handleSeriesComment = async (clickedSeries: CommunitySeriesWork, e: React.MouseEvent) => {
    e.stopPropagation();
    
    // v5.5.0: 也先获取详情（确保episodes包含auto-constructed playlists）
    try {
      const result = await communityAPI.getSeriesDetail(clickedSeries.id, userPhone);
      if (result.success && result.data) {
        setSelectedSeries(result.data);
      } else {
        setSelectedSeries(clickedSeries);
      }
    } catch {
      setSelectedSeries(clickedSeries);
    }
  };

  // 处理漫剧系列分享 — v6.0.60: 使用共享shareUtils
  const handleSeriesShare = async (seriesId: string, seriesTitle: string, e: React.MouseEvent) => {
    e.stopPropagation();

    // 1. 实际分享动作
    const result = await shareContent({
      title: seriesTitle || 'AI漫剧',
      text: `${seriesTitle || 'AI漫剧'} - 快来看看这部AI漫剧!`,
      url: window.location.href,
    });

    if (result === 'cancelled') return;
    if (result === 'copied') {
      toast.success('链接已复制到剪贴板');
    } else if (result === 'shared') {
      toast.success('分享成功');
    } else {
      toast.error('分享失败，请手动复制链接');
      return;
    }

    // 2. 成功后递增后端计数
    try {
      await communityAPI.shareSeries(seriesId);
      setSeriesInteractions(prev => {
        const newMap = new Map(prev);
        const current = newMap.get(seriesId);
        if (current) {
          newMap.set(seriesId, {
            ...current,
            shares: current.shares + 1,
          });
        }
        return newMap;
      });
    } catch (error: unknown) {
      console.error('[CommunityPanel] Series share count error:', error);
    }
  };

  // 下拉刷新
  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (hasInitialLoad && !isLoading && !isLoadingMore && !isPulling && (works.length > 0 || series.length > 0)) {
      touchStartY.current = e.touches[0].clientY;
    }
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (hasInitialLoad && !isLoading && !isLoadingMore && !isPulling && (works.length > 0 || series.length > 0)) {
      const currentY = e.touches[0].clientY;
      const distance = currentY - touchStartY.current;
      if (distance > 0) {
        setPullDistance(distance);
      }
    }
  };

  const handleTouchEnd = () => {
    if (hasInitialLoad && !isLoading && !isLoadingMore && !isPulling && (works.length > 0 || series.length > 0)) {
      if (pullDistance > 50) {
        // 🆕 下拉刷新：增量更新新数据
        Promise.all([
          refreshNewWorks(), // 刷新单集作品
          refreshSeriesNewData(), // 🔥 增量刷新系列数据
        ]).then(([worksResult, seriesResult]) => {
          setPullDistance(0);
          
          // 显示刷新结果
          const totalNew = (worksResult?.count || 0) + (seriesResult?.count || 0);
          if (totalNew > 0) {
            toast.success(`发现 ${totalNew} 个新作品`);
          } else {
            toast.info('已是最新');
          }
        });
      } else {
        setPullDistance(0);
      }
    }
  };

  // 根据分类决定显示的内容
  const shouldShowWorks = selectedCategory !== 'series';
  const shouldShowSeries = selectedCategory === 'series' || selectedCategory === 'all';

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="space-y-6"
      >
        {/* 头部（搜索和排序） */}
        <CommunityHeader
          sortBy={sortBy}
          onSortChange={setSortBy}
          showSearch={showSearch}
          onShowSearchToggle={() => setShowSearch(!showSearch)}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
        />

        {/* 分类筛选 */}
        <CategoryFilter
          selectedCategory={selectedCategory}
          onCategoryChange={setSelectedCategory}
        />

        {/* 作品列表 */}
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20 space-y-4">
            <Loader2 className="w-8 h-8 text-purple-400 animate-spin" />
            {retryCount > 0 && (
              <p className="text-sm text-yellow-400">重试中... ({retryCount}/2)</p>
            )}
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-20 space-y-4">
            <AlertCircle className="w-12 h-12 text-red-400" />
            <p className="text-gray-400 text-center">{error}</p>
            <Button
              onClick={() => loadWorks()}
              variant="outline"
              className="bg-white/5 border-white/20 text-white hover:bg-white/10"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              重新加载
            </Button>
          </div>
        ) : (works.length === 0 && series.length === 0) ? (
          <div className="text-center py-20">
            <p className="text-gray-500">暂无作品</p>
            <p className="text-sm text-gray-600 mt-2">换个分类或搜索试试</p>
          </div>
        ) : (
          <>
            <div
              className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 md:gap-4"
              ref={containerRef}
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
            >
              {/* 显示漫剧系列 */}
              {shouldShowSeries && series
                .filter(seriesItem => seriesItem && seriesItem.id)  // 🔧 只渲染有有效id的系列
                .map((seriesItem) => (
                <SeriesCard
                  key={seriesItem.id}
                  series={seriesItem}
                  interactions={seriesInteractions.get(seriesItem.id) || {
                    likes: 0,
                    shares: 0,
                    comments: 0,
                    isLiked: false,
                  }}
                  onCardClick={() => handleSeriesClick(seriesItem)}
                  onLike={(e) => handleSeriesLike(seriesItem.id, e)}
                  onComment={(e) => handleSeriesComment(seriesItem, e)}
                  onShare={(e) => handleSeriesShare(seriesItem.id, seriesItem.title, e)}
                />
              ))}

              {/* 显示单集视频 */}
              {shouldShowWorks && works
                .filter(work => work && work.id)  // 🔧 只渲染有有效id的作品
                .map((work) => (
                <WorkCard
                  key={work.id}
                  work={work}
                  interactions={workInteractions.get(work.id) || {
                    likes: 0,
                    shares: 0,
                    comments: 0,
                    isLiked: false,
                  }}
                  onCardClick={() => handleWorkClick(work, works)}
                  onLike={(e) => handleLike(work.id, e, setWorkInteractions)}
                  onComment={(e) => handleComment(work, works, e)}
                  onShare={(e) => handleShare(work.id, e, setWorkInteractions, work.title)}
                />
              ))}
            </div>

            {/* 加载更多按钮 */}
            {hasMore && (
              <div className="flex justify-center pt-8">
                <Button
                  onClick={() => {
                    if (hasMoreWorks) loadMoreWorks();
                    if (hasMoreSeries) loadMoreSeries();
                  }}
                  disabled={isLoadingMore}
                  variant="outline"
                  className="bg-white/5 border-white/20 text-white hover:bg-white/10"
                >
                  {isLoadingMore ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      加载中...
                    </>
                  ) : (
                    '加载更多'
                  )}
                </Button>
              </div>
            )}
          </>
        )}
      </motion.div>

      {/* 漫剧系列查看器 */}
      <AnimatePresence>
        {selectedSeries && (
          <SeriesViewer
            series={selectedSeries}
            userPhone={userPhone}
            onClose={() => setSelectedSeries(null)}
            onNavigateToSeries={handleNavigateToSeries}
          />
        )}
      </AnimatePresence>
    </>
  );
}