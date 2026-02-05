import { motion } from 'motion/react';
import { Loader2, Clock, Sparkles } from 'lucide-react';

export function GeneratingProgress() {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className="text-center"
    >
      <div className="relative w-32 h-32 mx-auto mb-6">
        {/* 外圈旋转 */}
        <motion.div
          className="absolute inset-0 rounded-full border-4 border-purple-500/30"
          animate={{ rotate: 360 }}
          transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
        />
        {/* 内圈旋转 */}
        <motion.div
          className="absolute inset-4 rounded-full border-4 border-pink-500/30"
          animate={{ rotate: -360 }}
          transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
        />
        {/* 中心图标 */}
        <div className="absolute inset-0 flex items-center justify-center">
          <motion.div
            animate={{ scale: [1, 1.1, 1] }}
            transition={{ duration: 2, repeat: Infinity }}
          >
            <Sparkles className="w-12 h-12 text-purple-400" />
          </motion.div>
        </div>
      </div>

      <h3 className="text-xl text-white font-medium mb-3">AI 正在创作中...</h3>
      
      <div className="space-y-2 text-sm text-gray-400 mb-4">
        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="flex items-center justify-center gap-2"
        >
          <Clock className="w-4 h-4" />
          预计等待时间：3-8 分钟
        </motion.p>
        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
        >
          系统每 5 秒自动检查一次进度
        </motion.p>
      </div>

      {/* 进度步骤 */}
      <div className="mt-6 space-y-3">
        {['理解故事情节', '生成视觉风格', '渲染视频画面', '合成最终作品'].map((step, index) => (
          <motion.div
            key={step}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.6 + index * 0.1 }}
            className="bg-white/5 rounded-xl p-3 flex items-center gap-3"
          >
            <motion.div
              className="w-2 h-2 rounded-full bg-purple-400"
              animate={{ scale: [1, 1.5, 1], opacity: [0.5, 1, 0.5] }}
              transition={{ 
                duration: 2, 
                repeat: Infinity, 
                delay: index * 0.5 
              }}
            />
            <span className="text-sm text-gray-400">{step}</span>
          </motion.div>
        ))}
      </div>

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.5 }}
        className="mt-6 text-xs text-gray-500"
      >
        💡 如果超时，视频仍在后台生成，请点击"刷新状态"按钮查看
      </motion.p>
    </motion.div>
  );
}