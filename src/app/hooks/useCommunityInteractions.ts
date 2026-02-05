import { useState } from 'react';
import * as communityAPI from '../services/community';
import { convertWorkToComic } from '../utils/workConverters';
import type { WorkInteractions } from './useCommunityWorks';
import type { Comic } from '../types';

export interface UseCommunityInteractionsProps {
  userPhone?: string;
  onSelectComic: (comic: Comic, comicsList?: Comic[]) => void;
}

export function useCommunityInteractions({ userPhone, onSelectComic }: UseCommunityInteractionsProps) {
  // 点赞
  const handleLike = async (
    workId: string,
    e: React.MouseEvent,
    setInteractions: React.Dispatch<React.SetStateAction<Map<string, WorkInteractions>>>
  ) => {
    e.stopPropagation();
    
    if (!userPhone) {
      console.log('User not logged in');
      return;
    }

    try {
      const result = await communityAPI.toggleLike(userPhone, workId);
      if (result.success) {
        setInteractions(prev => {
          const newMap = new Map(prev);
          const current = newMap.get(workId);
          if (current) {
            newMap.set(workId, {
              ...current,
              isLiked: result.isLiked,
              likes: result.likes,
            });
          }
          return newMap;
        });
      }
    } catch (error) {
      console.error('Failed to toggle like:', error);
    }
  };

  // 评论（打开作品详情）
  const handleComment = (work: any, works: any[], e: React.MouseEvent) => {
    e.stopPropagation();
    handleWorkClick(work, works);
  };

  // 分享
  const handleShare = async (
    workId: string,
    e: React.MouseEvent,
    setInteractions: React.Dispatch<React.SetStateAction<Map<string, WorkInteractions>>>
  ) => {
    e.stopPropagation();
    
    try {
      await communityAPI.incrementShares(workId);
      setInteractions(prev => {
        const newMap = new Map(prev);
        const current = newMap.get(workId);
        if (current) {
          newMap.set(workId, {
            ...current,
            shares: current.shares + 1,
          });
        }
        return newMap;
      });
    } catch (error) {
      console.error('Failed to share:', error);
    }
  };

  // 点击作品卡片
  const handleWorkClick = (work: any, works: any[]) => {
    // 记录浏览数
    communityAPI.incrementViews(work.id).catch(() => {});
    
    // 转换为Comic格式
    const comic: Comic = convertWorkToComic(work);
    const comicsList: Comic[] = works.map(convertWorkToComic);
    onSelectComic(comic, comicsList);
  };

  return {
    handleLike,
    handleComment,
    handleShare,
    handleWorkClick,
  };
}
