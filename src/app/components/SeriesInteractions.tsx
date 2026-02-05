/**
 * 漫剧互动组件
 * 提供点赞、评论、分享等功能
 */

import React, { useState, useEffect } from 'react';
import {
  toggleSeriesLike,
  addSeriesComment,
  getSeriesComments,
  recordSeriesShare,
} from '@/app/services/seriesServicePG';

interface SeriesInteractionsProps {
  seriesId: string;
  userPhone: string;
  initialInteractions?: {
    likes: number;
    comments: number;
    shares: number;
    views: number;
    isLiked: boolean;
  };
  onInteractionChange?: () => void;
}

export const SeriesInteractions: React.FC<SeriesInteractionsProps> = ({
  seriesId,
  userPhone,
  initialInteractions,
  onInteractionChange,
}) => {
  // 状态管理
  const [isLiked, setIsLiked] = useState(initialInteractions?.isLiked || false);
  const [likesCount, setLikesCount] = useState(initialInteractions?.likes || 0);
  const [commentsCount, setCommentsCount] = useState(initialInteractions?.comments || 0);
  const [sharesCount, setSharesCount] = useState(initialInteractions?.shares || 0);
  const [viewsCount, setViewsCount] = useState(initialInteractions?.views || 0);
  
  const [showComments, setShowComments] = useState(false);
  const [comments, setComments] = useState<any[]>([]);
  const [commentText, setCommentText] = useState('');
  const [isLoadingComments, setIsLoadingComments] = useState(false);
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);
  const [isTogglingLike, setIsTogglingLike] = useState(false);

  // 更新初始交互数据
  useEffect(() => {
    if (initialInteractions) {
      setIsLiked(initialInteractions.isLiked);
      setLikesCount(initialInteractions.likes);
      setCommentsCount(initialInteractions.comments);
      setSharesCount(initialInteractions.shares);
      setViewsCount(initialInteractions.views);
    }
  }, [initialInteractions]);

  // 加载评论
  const loadComments = async () => {
    if (isLoadingComments) return;

    setIsLoadingComments(true);
    try {
      const result = await getSeriesComments(seriesId, 1, 20);
      if (result.success && result.data) {
        setComments(result.data.comments || []);
        setCommentsCount(result.data.total || 0);
      }
    } catch (error) {
      console.error('Failed to load comments:', error);
    } finally {
      setIsLoadingComments(false);
    }
  };

  // 切换显示评论
  const handleToggleComments = () => {
    const newShowState = !showComments;
    setShowComments(newShowState);
    
    if (newShowState && comments.length === 0) {
      loadComments();
    }
  };

  // 点赞/取消点赞
  const handleLike = async () => {
    if (isTogglingLike) return;

    setIsTogglingLike(true);
    try {
      const result = await toggleSeriesLike(seriesId, userPhone);
      
      if (result.success && result.data) {
        setIsLiked(result.data.isLiked);
        setLikesCount(result.data.likes);
        onInteractionChange?.();
      }
    } catch (error) {
      console.error('Failed to toggle like:', error);
    } finally {
      setIsTogglingLike(false);
    }
  };

  // 提交评论
  const handleSubmitComment = async () => {
    if (!commentText.trim() || isSubmittingComment) return;

    setIsSubmittingComment(true);
    try {
      const result = await addSeriesComment(seriesId, userPhone, commentText);
      
      if (result.success) {
        setCommentText('');
        // 重新加载评论列表
        await loadComments();
        setCommentsCount(prev => prev + 1);
        onInteractionChange?.();
      }
    } catch (error) {
      console.error('Failed to submit comment:', error);
    } finally {
      setIsSubmittingComment(false);
    }
  };

  // 分享
  const handleShare = async (platform: 'link' | 'wechat' | 'weibo' | 'douyin' = 'link') => {
    try {
      const result = await recordSeriesShare(seriesId, userPhone, platform);
      
      if (result.success && result.data) {
        setSharesCount(result.data.shares);
        onInteractionChange?.();
        
        // 复制链接到剪贴板
        if (platform === 'link') {
          const url = `${window.location.origin}/series/${seriesId}`;
          await navigator.clipboard.writeText(url);
          alert('链接已复制到剪贴板！');
        }
      }
    } catch (error) {
      console.error('Failed to record share:', error);
    }
  };

  return (
    <div className="w-full bg-white rounded-lg shadow-sm border border-gray-200">
      {/* 互动按钮栏 */}
      <div className="flex items-center justify-around p-4 border-b border-gray-200">
        {/* 点赞按钮 */}
        <button
          onClick={handleLike}
          disabled={isTogglingLike}
          className={`flex items-center space-x-2 px-4 py-2 rounded-lg transition-colors ${
            isLiked
              ? 'text-red-600 bg-red-50 hover:bg-red-100'
              : 'text-gray-600 hover:bg-gray-100'
          } ${isTogglingLike ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          <svg
            className="w-6 h-6"
            fill={isLiked ? 'currentColor' : 'none'}
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
            />
          </svg>
          <span className="font-medium">{likesCount}</span>
        </button>

        {/* 评论按钮 */}
        <button
          onClick={handleToggleComments}
          className="flex items-center space-x-2 px-4 py-2 rounded-lg text-gray-600 hover:bg-gray-100 transition-colors"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
            />
          </svg>
          <span className="font-medium">{commentsCount}</span>
        </button>

        {/* 分享按钮 */}
        <button
          onClick={() => handleShare('link')}
          className="flex items-center space-x-2 px-4 py-2 rounded-lg text-gray-600 hover:bg-gray-100 transition-colors"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"
            />
          </svg>
          <span className="font-medium">{sharesCount}</span>
        </button>

        {/* 浏览量 */}
        <div className="flex items-center space-x-2 px-4 py-2 text-gray-500">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
            />
          </svg>
          <span className="font-medium">{viewsCount}</span>
        </div>
      </div>

      {/* 评论区域 */}
      {showComments && (
        <div className="p-4 bg-gray-50">
          {/* 评论输入框 */}
          <div className="mb-4">
            <textarea
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              placeholder="写下你的想法..."
              className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
              rows={3}
            />
            <div className="mt-2 flex justify-end">
              <button
                onClick={handleSubmitComment}
                disabled={!commentText.trim() || isSubmittingComment}
                className={`px-6 py-2 rounded-lg font-medium transition-colors ${
                  commentText.trim() && !isSubmittingComment
                    ? 'bg-blue-600 text-white hover:bg-blue-700'
                    : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                }`}
              >
                {isSubmittingComment ? '发送中...' : '发送评论'}
              </button>
            </div>
          </div>

          {/* 评论列表 */}
          <div className="space-y-4">
            {isLoadingComments ? (
              <div className="text-center py-8 text-gray-500">加载评论中...</div>
            ) : comments.length === 0 ? (
              <div className="text-center py-8 text-gray-500">还没有评论，来抢沙发吧！</div>
            ) : (
              comments.map((comment) => (
                <div key={comment.id} className="bg-white p-4 rounded-lg border border-gray-200">
                  <div className="flex items-start space-x-3">
                    {/* 用户头像 */}
                    <div className="w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center text-white font-semibold flex-shrink-0">
                      {comment.user?.nickname?.charAt(0) || '用'}
                    </div>
                    
                    {/* 评论内容 */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center space-x-2">
                        <span className="font-medium text-gray-900">
                          {comment.user?.nickname || '匿名用户'}
                        </span>
                        <span className="text-xs text-gray-500">
                          {new Date(comment.created_at).toLocaleString('zh-CN')}
                        </span>
                      </div>
                      <p className="mt-1 text-gray-700 break-words">{comment.content}</p>
                      
                      {/* 回复列表 */}
                      {comment.replies && comment.replies.length > 0 && (
                        <div className="mt-3 pl-4 border-l-2 border-gray-200 space-y-2">
                          {comment.replies.map((reply: any) => (
                            <div key={reply.id} className="text-sm">
                              <span className="font-medium text-gray-900">
                                {reply.user?.nickname || '匿名用户'}
                              </span>
                              <span className="mx-2 text-gray-500">回复：</span>
                              <span className="text-gray-700">{reply.content}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default SeriesInteractions;
