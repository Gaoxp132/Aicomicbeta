/**
 * CommentSection component - Comment display and input
 * Split from consolidated immersive/index.tsx (v6.0.67)
 */

import { motion, AnimatePresence } from 'motion/react';
import { Send, Loader2 } from 'lucide-react';
import { Button, Textarea } from '../ui';
import { formatTime } from '../../utils';

interface Comment {
  id: string;
  content: string;
  user: { nickname: string; avatar_url?: string; };
  created_at: string;
}

interface CommentSectionProps {
  comments: Comment[];
  commentText: string;
  isLoadingComments: boolean;
  onCommentTextChange: (text: string) => void;
  onSubmitComment: () => void;
}

export function CommentSection({ comments, commentText, isLoadingComments, onCommentTextChange, onSubmitComment }: CommentSectionProps) {
  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto space-y-4 px-4 py-4">
        {isLoadingComments ? (
          <div className="flex items-center justify-center py-8"><Loader2 className="w-6 h-6 text-purple-400 animate-spin" /></div>
        ) : comments.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-gray-500"><p>还没有评论</p><p className="text-sm mt-2">来说点什么吧~</p></div>
        ) : (
          <AnimatePresence>
            {comments.map((comment) => (
              <motion.div key={comment.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} transition={{ duration: 0.3 }} className="py-4 border-b border-white/5 last:border-0">
                <div className="flex-shrink-0">
                  {comment.user?.avatar_url ? (
                    <img src={comment.user.avatar_url} alt={comment.user.nickname} className="w-8 h-8 rounded-full" />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-purple-600 flex items-center justify-center">
                      <span className="text-white text-sm font-medium">{comment.user?.nickname?.[0] || '?'}</span>
                    </div>
                  )}
                </div>
                <div className="flex-1 space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-white">{comment.user?.nickname || '匿名用户'}</span>
                    <span className="text-xs text-gray-500">{formatTime(Math.floor((Date.now() - new Date(comment.created_at).getTime()) / 1000))}</span>
                  </div>
                  <p className="text-sm text-gray-300">{comment.content}</p>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        )}
      </div>
      <div className="border-t border-white/10 p-4">
        <div className="flex gap-2">
          <Textarea value={commentText} onChange={(e) => onCommentTextChange(e.target.value)} placeholder="说点什么..." className="flex-1 bg-white/5 border-white/10 text-white resize-none" rows={2} />
          <Button onClick={onSubmitComment} disabled={!commentText.trim()} className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600"><Send className="w-4 h-4" /></Button>
        </div>
      </div>
    </div>
  );
}
