import { useState, useEffect } from 'react';
import * as communityAPI from '../services/community';

/**
 * 点赞功能自定义Hook
 * 管理点赞状态和交互逻辑
 */
export function useLike(workId: string, userPhone?: string) {
  const [isLiked, setIsLiked] = useState(false);
  const [likes, setLikes] = useState(0);

  // 加载点赞状态
  useEffect(() => {
    if (userPhone) {
      loadLikeStatus();
    }
  }, [workId, userPhone]);

  const loadLikeStatus = async () => {
    if (!userPhone) return;
    
    try {
      const result = await communityAPI.getLikeStatus(workId, userPhone);
      if (result.success) {
        setIsLiked(result.isLiked);
        setLikes(result.likes);
      }
    } catch (error) {
      console.error('加载点赞状态失败:', error);
    }
  };

  const handleLike = async () => {
    if (!userPhone) {
      console.log('User not logged in');
      return;
    }

    try {
      const result = await communityAPI.toggleLike(userPhone, workId);
      setIsLiked(result.isLiked);
      setLikes(result.likes);
    } catch (error: any) {
      console.error('Like operation failed:', error);
    }
  };

  return {
    isLiked,
    likes,
    handleLike,
    loadLikeStatus,
  };
}