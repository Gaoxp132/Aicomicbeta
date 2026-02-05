import { motion } from 'motion/react';
import { Copy, Check, Download } from 'lucide-react';
import { Button } from '../ui/button';

interface ShareMenuProps {
  linkCopied: boolean;
  onCopyLink: () => void;
  onWeChatShare: () => void;
  onDownload: () => void;
}

export function ShareMenu({
  linkCopied,
  onCopyLink,
  onWeChatShare,
  onDownload,
}: ShareMenuProps) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="absolute bottom-20 right-4 bg-black/90 backdrop-blur-xl rounded-2xl p-4 border border-white/10 shadow-2xl z-50"
    >
      <div className="space-y-2 min-w-[200px]">
        {/* 复制链接 */}
        <Button
          onClick={onCopyLink}
          variant="ghost"
          className="w-full justify-start gap-3 text-white hover:bg-white/10"
        >
          {linkCopied ? (
            <>
              <Check className="w-5 h-5 text-green-400" />
              <span>已复制</span>
            </>
          ) : (
            <>
              <Copy className="w-5 h-5" />
              <span>复制链接</span>
            </>
          )}
        </Button>

        {/* 分享到微信 */}
        <Button
          onClick={onWeChatShare}
          variant="ghost"
          className="w-full justify-start gap-3 text-white hover:bg-white/10"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
            <path d="M8.5 3.5c-3.9 0-7 2.7-7 6 0 1.9 1 3.6 2.6 4.8l-.6 2.2 2.4-1.2c.8.2 1.7.3 2.6.3 3.9 0 7-2.7 7-6s-3.1-6-7-6zm-2 8c-.6 0-1-.4-1-1s.4-1 1-1 1 .4 1 1-.4 1-1 1zm4 0c-.6 0-1-.4-1-1s.4-1 1-1 1 .4 1 1-.4 1-1 1z" />
          </svg>
          <span>分享到微信</span>
        </Button>

        {/* 下载视频 */}
        <Button
          onClick={onDownload}
          variant="ghost"
          className="w-full justify-start gap-3 text-white hover:bg-white/10"
        >
          <Download className="w-5 h-5" />
          <span>下载视频</span>
        </Button>
      </div>
    </motion.div>
  );
}
