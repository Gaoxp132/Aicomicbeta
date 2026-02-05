import { motion } from 'motion/react';
import { Loader2, Server } from 'lucide-react';

interface ServerLoadingIndicatorProps {
  isChecking: boolean;
  isConnected: boolean | null;
}

export function ServerLoadingIndicator({ isChecking, isConnected }: ServerLoadingIndicatorProps) {
  // 只在检查中且还没有连接结果时显示
  if (!isChecking || isConnected !== null) {
    return null;
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="fixed top-20 left-1/2 -translate-x-1/2 z-40"
    >
      <div className="bg-gradient-to-r from-purple-900/90 via-blue-900/90 to-purple-900/90 backdrop-blur-sm border border-purple-500/30 rounded-full px-6 py-3 shadow-lg">
        <div className="flex items-center gap-3">
          <Loader2 className="w-4 h-4 text-purple-300 animate-spin" />
          <div className="flex items-center gap-2">
            <Server className="w-4 h-4 text-purple-300" />
            <span className="text-sm text-white font-medium">
              服务器启动中，请稍候...
            </span>
          </div>
          <div className="flex gap-1">
            <motion.div
              className="w-1.5 h-1.5 bg-purple-400 rounded-full"
              animate={{ opacity: [0.3, 1, 0.3] }}
              transition={{ duration: 1.5, repeat: Infinity, delay: 0 }}
            />
            <motion.div
              className="w-1.5 h-1.5 bg-purple-400 rounded-full"
              animate={{ opacity: [0.3, 1, 0.3] }}
              transition={{ duration: 1.5, repeat: Infinity, delay: 0.2 }}
            />
            <motion.div
              className="w-1.5 h-1.5 bg-purple-400 rounded-full"
              animate={{ opacity: [0.3, 1, 0.3] }}
              transition={{ duration: 1.5, repeat: Infinity, delay: 0.4 }}
            />
          </div>
        </div>
      </div>
    </motion.div>
  );
}
