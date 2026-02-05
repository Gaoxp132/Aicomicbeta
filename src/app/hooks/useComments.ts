import { useState, useEffect } from 'react';
import * as communityAPI from '../services/community';

/**
 * 评论功能自定义Hook
 * 管理评论列表、加载和提交逻辑
 */
export function useComments(workId: string, userPhone?: string) {
  const [comments, setComments] = useState<any[]>([]);
  const [commentText, setCommentText] = useState('');
  const [isLoadingComments, setIsLoadingComments] = useState(false);
  const [showComments, setShowComments] = useState(false);

  // 加载评论
  useEffect(() => {
    if (showComments) {
      loadComments();
    }
  }, [showComments]);

  const loadComments = async () => {
    setIsLoadingComments(true);
    try {
      const result = await communityAPI.getComments(workId);
      setComments(result.comments || []);
    } catch (error) {
      console.error('Failed to load comments:', error);
    } finally {
      setIsLoadingComments(false);
    }
  };

  const handleComment = async () => {
    if (!userPhone) {
      console.log('User not logged in');
      return;
    }

    if (!commentText.trim()) {
      console.log('Comment text is empty');
      return;
    }

    try {
      await communityAPI.addComment(userPhone, workId, commentText);
      setCommentText('');
      // 移除成功toast提示
      loadComments();
    } catch (error) {
      console.error('Comment failed:', error);
    }
  };

  const toggleComments = () => {
    setShowComments(!showComments);
  };

  return {
    comments,
    commentText,
    setCommentText,
    isLoadingComments,
    showComments,
    setShowComments,
    toggleComments,
    handleComment,
    loadComments,
  };
}